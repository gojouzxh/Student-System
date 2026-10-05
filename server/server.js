import { createPool, ensureSchema, loadSnapshot, PostgresRepository } from "./PostgresRepository.js";
import fs from "node:fs";
import crypto from "node:crypto";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AppError,
  AuthenticationError,
  MethodNotAllowedError,
  NotFoundError,
  PayloadTooLargeError,
  TimeoutError,
  ValidationError,
} from "../js/errors/AppErrors.js";
import { createPlatform, PROJECT_ROOT } from "./platform.js";

const API_PREFIX = "/api/v1";
const MAX_BODY_BYTES = 64 * 1024;
const DEFAULT_REQUEST_BODY_TIMEOUT_MS = 10_000;
const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
  response.end(body);
}

function publicStudent(student) {
  return {
    id: student.id,
    name: student.name,
    username: student.username,
    email: student.email,
    role: student.role,
    program: student.program,
    gradeLevel: student.gradeLevel,
    currentStreak: student.currentStreak,
    longestStreak: student.longestStreak,
    createdAt: student.createdAt,
  };
}

function publicQuiz(quiz) {
  const { id, subjectId, topicId, title, description, difficulty, timeLimitSeconds, questions } = quiz.toJSON();
  return {
    id, subjectId, topicId, title, description, difficulty, timeLimitSeconds,
    questions: questions.map(({ id: questionId, topicId: questionTopicId, prompt, choices }) => ({
      id: questionId,
      topicId: questionTopicId,
      prompt,
      choices,
    })),
  };
}

function publicDossier(dossier) {
  return {
    ...dossier,
    subjectPerformance: dossier.subjectPerformance.map(({ subject, record }) => ({
      subject: subject.toJSON(),
      record: record.toJSON(),
    })),
  };
}

function authenticate(request, expectedToken) {
  const header = request.headers.authorization;
  const match = typeof header === "string" && /^Bearer ([^\s]+)$/.exec(header);
  if (!match) throw new AuthenticationError();
  const supplied = Buffer.from(match[1]);
  const expected = Buffer.from(expectedToken);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    throw new AuthenticationError("The bearer token is invalid.");
  }
}

const SESSION_COOKIE = "qsp_session";

function sessionToken(request) {
  const cookie = request.headers.cookie;
  if (typeof cookie !== "string") return null;
  for (const item of cookie.split(";")) {
    const [name, ...parts] = item.trim().split("=");
    if (name !== SESSION_COOKIE) continue;
    try {
      return decodeURIComponent(parts.join("="));
    } catch {
      return null;
    }
  }
  return null;
}

function sessionCookie(token, { rememberMe = false, secure = false } = {}) {
  const sameSite = secure ? "None" : "Strict";
  const attributes = [`${SESSION_COOKIE}=${encodeURIComponent(token)}`, "Path=/", "HttpOnly", `SameSite=${sameSite}`];
  if (rememberMe) attributes.push("Max-Age=2592000");
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

function clearSessionCookie({ secure = false } = {}) {
  const sameSite = secure ? "None" : "Strict";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=0${secure ? "; Secure" : ""}`;
}

function assertAllowedOrigin(request, allowedOrigins) {
  const origin = request.headers.origin;
  if (!origin) return;
  if (!allowedOrigins.has(origin)) throw new AuthenticationError("This application origin is not allowed.");
}

function applyCors(request, response, allowedOrigins) {
  const origin = request.headers.origin;
  if (!origin) return false;
  assertAllowedOrigin(request, allowedOrigins);
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Credentials", "true");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Vary", "Origin");
  if (request.method !== "OPTIONS") return false;
  response.writeHead(204, { "Cache-Control": "no-store" });
  response.end();
  return true;
}

function readJsonBody(request, requestBodyTimeoutMs) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => finish(new TimeoutError("request body", requestBodyTimeoutMs)), requestBodyTimeoutMs);
    timer.unref();

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        request.resume();
        finish(new PayloadTooLargeError(MAX_BODY_BYTES));
        return;
      }
      chunks.push(chunk);
    });
    request.on("error", () => finish(new ValidationError("The request body could not be read.")));
    request.on("aborted", () => finish(new ValidationError("The request was interrupted before the body was received.")));
    request.on("end", () => {
      if (settled) return;
      if (size === 0) {
        finish(null, {});
        return;
      }
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          throw new TypeError("JSON body must be an object.");
        }
        finish(null, body);
      } catch {
        finish(new ValidationError("The request body must be a valid JSON object."));
      }
    });
  });
}

function pathSegments(pathname) {
  try {
    return pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
  } catch {
    throw new ValidationError("The request path contains invalid URL encoding.");
  }
}

function routeNotFound() {
  throw new NotFoundError("API endpoint");
}

async function handleApiRequest(
  request, response, pathname, services, requestBodyTimeoutMs, secureCookies, allowedOrigins,
) {
  const segments = pathSegments(pathname);
  const { authService, userService, quizService, studyTrackerService, progressService } = services;

  if (pathname === `${API_PREFIX}/health` && request.method === "GET") {
    sendJson(response, 200, { status: "ok", service: "quiz-study-tracker", apiVersion: "v1" });
    return;
  }

  const authMethods = allowedMethodsFor(segments, pathname);
  if (pathname.startsWith(`${API_PREFIX}/auth/`) &&
      authMethods.length > 0 && !authMethods.includes(request.method)) {
    throw new MethodNotAllowedError(request.method, authMethods);
  }

  if (pathname === `${API_PREFIX}/auth/register` && request.method === "POST") {
    assertAllowedOrigin(request, allowedOrigins);
    authService.limitRequests(`register:${request.socket.remoteAddress}`, { limit: 10 });
    const body = await readJsonBody(request, requestBodyTimeoutMs);
    const user = await authService.register(body);
    sendJson(response, 201, { data: { user } });
    return;
  }

  if (pathname === `${API_PREFIX}/auth/login` && request.method === "POST") {
    assertAllowedOrigin(request, allowedOrigins);
    authService.limitRequests(`login:${request.socket.remoteAddress}`, { limit: 10 });
    const body = await readJsonBody(request, requestBodyTimeoutMs);
    const result = await authService.login({ ...body, address: request.socket.remoteAddress });
    sendJson(response, 200, { data: {
      user: result.user,
      expiresAt: result.expiresAt,
      rememberMe: result.rememberMe,
    } }, { "Set-Cookie": sessionCookie(result.token, { rememberMe: result.rememberMe, secure: secureCookies }) });
    return;
  }

  if (pathname === `${API_PREFIX}/auth/session` && request.method === "GET") {
    const session = authService.getSession(sessionToken(request));
    if (!session) throw new AuthenticationError("Your session has expired. Please sign in again.");
    sendJson(response, 200, { data: session });
    return;
  }

  if (pathname === `${API_PREFIX}/auth/logout` && request.method === "POST") {
    assertAllowedOrigin(request, allowedOrigins);
    authService.logout(sessionToken(request));
    sendJson(response, 200, { data: { signedOut: true } }, {
      "Set-Cookie": clearSessionCookie({ secure: secureCookies }),
    });
    return;
  }

  if (pathname === `${API_PREFIX}/auth/forgot-password` && request.method === "POST") {
    assertAllowedOrigin(request, allowedOrigins);
    authService.limitRequests(`reset:${request.socket.remoteAddress}`, { limit: 3 });
    const body = await readJsonBody(request, requestBodyTimeoutMs);
    await authService.requestPasswordReset(body.email);
    sendJson(response, 202, {
      data: { message: "If an account matches that email, password reset instructions will be sent." },
    });
    return;
  }

  if (pathname === `${API_PREFIX}/auth/reset-password` && request.method === "POST") {
    assertAllowedOrigin(request, allowedOrigins);
    authService.limitRequests(`reset-complete:${request.socket.remoteAddress}`, { limit: 5 });
    const body = await readJsonBody(request, requestBodyTimeoutMs);
    await authService.resetPassword(body);
    sendJson(response, 200, { data: { message: "Your password has been changed. You can now sign in." } });
    return;
  }

  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
    assertAllowedOrigin(request, allowedOrigins);
  }
  const session = authService.getSession(sessionToken(request));
  if (!session) throw new AuthenticationError("Sign in to continue.");
  const student = userService.getStudent(session.user.id);

  if (pathname === `${API_PREFIX}/students/me` && request.method === "GET") {
    sendJson(response, 200, { data: publicStudent(student) });
    return;
  }

  if (pathname === `${API_PREFIX}/students/me/progress` && request.method === "GET") {
    sendJson(response, 200, { data: publicDossier(progressService.getStudentProgressDossier(student.id)) });
    return;
  }

  if (pathname === `${API_PREFIX}/subjects` && request.method === "GET") {
    sendJson(response, 200, { data: quizService.listSubjects().map((subject) => subject.toJSON()) });
    return;
  }

  if (segments.length === 5 && segments[0] === "api" && segments[1] === "v1" &&
      segments[2] === "subjects" && segments[4] === "topics" && request.method === "GET") {
    const subject = quizService.getSubjectOrThrow(segments[3]);
    sendJson(response, 200, { data: quizService.listTopics(subject.id).map((topic) => topic.toJSON()) });
    return;
  }

  if (pathname === `${API_PREFIX}/quizzes` && request.method === "GET") {
    sendJson(response, 200, { data: quizService.listAllQuizzes().map(publicQuiz) });
    return;
  }

  if (segments.length === 4 && segments[0] === "api" && segments[1] === "v1" &&
      segments[2] === "quizzes" && request.method === "GET") {
    sendJson(response, 200, { data: publicQuiz(quizService.getQuizOrThrow(segments[3])) });
    return;
  }

  if (segments.length === 5 && segments[0] === "api" && segments[1] === "v1" &&
      segments[2] === "quizzes" && segments[4] === "attempts" && request.method === "POST") {
    const body = await readJsonBody(request, requestBodyTimeoutMs);
    if (body.timeTakenSeconds !== undefined &&
        (!Number.isFinite(body.timeTakenSeconds) || body.timeTakenSeconds < 0)) {
      throw new ValidationError("timeTakenSeconds must be a non-negative finite number.", [
        { field: "timeTakenSeconds", issue: "Must be a non-negative number" },
      ]);
    }
    const result = quizService.submitAttempt(
      student.id,
      segments[3],
      body.answers,
      body.timeTakenSeconds ?? 0,
    );
    sendJson(response, 201, {
      data: {
        attempt: result.attempt.toJSON(),
        breakdown: result.breakdown,
        progress: publicDossier(progressService.getStudentProgressDossier(student.id)),
      },
    });
    return;
  }

  if (pathname === `${API_PREFIX}/quiz-attempts` && request.method === "GET") {
    sendJson(response, 200, { data: quizService.listAttempts(student.id).map((attempt) => attempt.toJSON()) });
    return;
  }

  if (pathname === `${API_PREFIX}/study-sessions` && request.method === "GET") {
    sendJson(response, 200, { data: studyTrackerService.listSessions(student.id).map((session) => session.toJSON()) });
    return;
  }

  if (pathname === `${API_PREFIX}/study-sessions` && request.method === "POST") {
    const body = await readJsonBody(request, requestBodyTimeoutMs);
    const session = studyTrackerService.logSession(student.id, body);
    sendJson(response, 201, {
      data: {
        session: session.toJSON(),
        progress: publicDossier(progressService.getStudentProgressDossier(student.id)),
      },
    });
    return;
  }

  if (pathname === `${API_PREFIX}/goals` && request.method === "GET") {
    const data = studyTrackerService.goalProgress(student.id).map(({ goal, ...progress }) => ({
      ...goal.toJSON(),
      progress,
      status: progress.status,
    }));
    sendJson(response, 200, { data });
    return;
  }

  if (pathname === `${API_PREFIX}/goals` && request.method === "POST") {
    const body = await readJsonBody(request, requestBodyTimeoutMs);
    const goal = studyTrackerService.createGoal(student.id, body);
    sendJson(response, 201, { data: goal.toJSON() });
    return;
  }

  if (segments.length === 4 && segments[0] === "api" && segments[1] === "v1" &&
      segments[2] === "goals" && request.method === "DELETE") {
    studyTrackerService.deleteGoal(segments[3], student.id);
    response.writeHead(204, { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    response.end();
    return;
  }

  const allowedMethods = allowedMethodsFor(segments, pathname);
  if (allowedMethods.length > 0 && !allowedMethods.includes(request.method)) {
    throw new MethodNotAllowedError(request.method, allowedMethods);
  }
  routeNotFound();
}

function allowedMethodsFor(segments, pathname) {
  if (pathname === `${API_PREFIX}/auth/register` || pathname === `${API_PREFIX}/auth/login` ||
      pathname === `${API_PREFIX}/auth/logout` || pathname === `${API_PREFIX}/auth/forgot-password` ||
      pathname === `${API_PREFIX}/auth/reset-password`) return ["POST"];
  if (pathname === `${API_PREFIX}/auth/session`) return ["GET"];
  if ([`${API_PREFIX}/health`, `${API_PREFIX}/students/me`, `${API_PREFIX}/students/me/progress`,
       `${API_PREFIX}/subjects`, `${API_PREFIX}/quizzes`, `${API_PREFIX}/quiz-attempts`,
       `${API_PREFIX}/study-sessions`, `${API_PREFIX}/goals`].includes(pathname)) {
    if (pathname === `${API_PREFIX}/study-sessions`) return ["GET", "POST"];
    if (pathname === `${API_PREFIX}/goals`) return ["GET", "POST"];
    return ["GET"];
  }
  if (segments.length === 5 && segments[2] === "quizzes" && segments[4] === "attempts") return ["POST"];
  if (segments.length === 4 && segments[2] === "quizzes") return ["GET"];
  if (segments.length === 5 && segments[2] === "subjects" && segments[4] === "topics") return ["GET"];
  if (segments.length === 4 && segments[2] === "goals") return ["DELETE"];
  return [];
}

async function serveStatic(request, response, pathname, staticRoot) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    throw new MethodNotAllowedError(request.method, ["GET", "HEAD"]);
  }

  const segments = pathSegments(pathname);
  if (segments.some((segment) => !segment || segment.startsWith(".") ||
      segment === "server" || segment === "node_modules" || segment === "data" || segment.includes("\\"))) {
    throw new NotFoundError("File");
  }
  const relativePath = segments.length === 0 ? "index.html" : segments.join(path.sep);
  const filePath = path.resolve(staticRoot, relativePath);
  const rootPrefix = `${path.resolve(staticRoot)}${path.sep}`;
  if (filePath !== path.resolve(staticRoot, "index.html") && !filePath.startsWith(rootPrefix)) {
    throw new NotFoundError("File");
  }

  let stats;
  try {
    stats = await fs.promises.stat(filePath);
    if (!stats.isFile()) throw new Error("Not a file");
  } catch {
    throw new NotFoundError("File");
  }

  response.writeHead(200, {
    "Content-Type": MIME_TYPES.get(path.extname(filePath)) || "application/octet-stream",
    "Content-Length": stats.size,
    "Cache-Control": path.basename(filePath) === "index.html" ? "no-cache" : "public, max-age=300",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  });
  if (request.method === "HEAD") response.end();
  else fs.createReadStream(filePath).pipe(response);
}

export function createServer({
  services,
  staticRoot = PROJECT_ROOT,
  logger = console,
  requestBodyTimeoutMs = DEFAULT_REQUEST_BODY_TIMEOUT_MS,
  secureCookies = process.env.QSP_COOKIE_SECURE === undefined
    ? process.env.NODE_ENV === "production"
    : process.env.QSP_COOKIE_SECURE === "true",
  allowedOrigins = (process.env.QSP_ALLOWED_ORIGINS ||
    "https://gojouzxh.github.io,http://localhost:8080,http://127.0.0.1:8080")
    .split(",").map((origin) => origin.trim()).filter(Boolean),
}) {
  if (!services?.authService || !services?.userService) {
    throw new ValidationError("Authentication and user services are required.");
  }
  if (!Number.isInteger(requestBodyTimeoutMs) || requestBodyTimeoutMs < 1) {
    throw new ValidationError("requestBodyTimeoutMs must be a positive integer.");
  }
  const allowedOriginSet = new Set(allowedOrigins);

  return http.createServer(async (request, response) => {
    let pathname;
    try {
      const url = new URL(request.url, "http://localhost");
      pathname = url.pathname;
      if (pathname.startsWith(API_PREFIX)) {
        if (applyCors(request, response, allowedOriginSet)) return;
        await handleApiRequest(
          request, response, pathname, services, requestBodyTimeoutMs, secureCookies, allowedOriginSet,
        );
      } else {
        await serveStatic(request, response, pathname, staticRoot);
      }
    } catch (error) {
      if (!(error instanceof AppError)) {
        logger.error?.("[API] Unexpected request failure:", error);
      }
      if (response.headersSent || response.destroyed) {
        response.destroy();
        return;
      }
      const appError = error instanceof AppError
        ? error
        : new AppError("An unexpected server error occurred.", "INTERNAL_ERROR", 500);
      const extraHeaders = appError.statusCode === 405
        ? { Allow: (appError.details?.allowedMethods || []).join(", ") }
        : appError.statusCode === 429
          ? { "Retry-After": String(appError.details?.retryAfterSeconds || 60) }
          : {};
      sendJson(response, appError.statusCode, appError.toResponse(), extraHeaders);
    }
  });
}

   async function startServer() {
     const port = Number(process.env.PORT || 8080);
     const dataDirectory = process.env.QSP_DATA_DIR || path.join(PROJECT_ROOT, "data");

     if (!Number.isInteger(port) || port < 1 || port > 65535) {
       console.error("PORT must be an integer between 1 and 65535.");
       process.exitCode = 1;
       return;
     }

     let pool = null;
     const repositories = [];
     let platformOptions = { dataDirectory };

     if (process.env.DATABASE_URL) {
       pool = createPool(process.env.DATABASE_URL);
       await ensureSchema(pool);
       const snapshot = await loadSnapshot(pool);
       platformOptions = {
         dataDirectory,
         repositoryFactory: (name, factory) => {
           const repository = new PostgresRepository(pool, name, factory, snapshot.get(name) ?? new Map());
           repositories.push(repository);
           return repository;
         },
       };
       console.info("Using Postgres storage.");
     } else {
       console.info(`Using JSON file storage in ${dataDirectory}.`);
     }

     const { services } = createPlatform(platformOptions);
     const server = createServer({ services });
     server.listen(port, "0.0.0.0", () => {
       console.info(`Quiz & Study Tracker listening on port ${port}.`);
     });
     server.on("error", (error) => {
       console.error("[Server] Failed to listen:", error.message);
       process.exitCode = 1;
     });

     const shutdown = async () => {
       server.close();
       await Promise.all(repositories.map((repository) => repository.flush()));
       if (pool) await pool.end();
       process.exit(0);
     };
     process.once("SIGTERM", shutdown);
     process.once("SIGINT", shutdown);
   }

   if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
     startServer().catch((error) => {
       console.error("[Server] Startup failed:", error.message);
       process.exitCode = 1;
     });
   }
