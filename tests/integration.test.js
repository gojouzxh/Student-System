import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { createPlatform } from "../server/platform.js";
import { createServer } from "../server/server.js";
import { renderDashboard } from "../js/views/DashboardView.js";

const AUTH_TOKEN = "integration-test-token-that-is-long-enough";
let AUTH_COOKIE = null;
let STUDENT_ID = null;
let dataDirectory;
let services;
let server;
let baseUrl;
const expectedAnswerMaps = new Map();

before(async () => {
  dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "qsp-integration-"));
  ({ services } = createPlatform({ dataDirectory }));
  server = createServer({ services, logger: { error() {} } });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const registered = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Integration Student",
      username: "integration_student",
      email: "integration@example.com",
      password: "SecurePassphrase1!",
      confirmPassword: "SecurePassphrase1!",
      acceptTerms: true,
    }),
  });
  assert.equal(registered.status, 201);
  STUDENT_ID = (await registered.json()).data.user.id;
  const signedIn = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: "integration_student",
      password: "SecurePassphrase1!",
    }),
  });
  assert.equal(signedIn.status, 200);
  AUTH_COOKIE = signedIn.headers.get("set-cookie").split(";")[0];

  const quiz = services.quizService.getQuiz("quiz_oop_1");
  const correctAnswers = Object.fromEntries(
    quiz.questions.map((question) => [question.id, question.correctChoice().id]),
  );
  const incorrectAnswers = Object.fromEntries(
    quiz.questions.map((question) => [
      question.id,
      question.choices.find((choice) => choice.id !== question.correctChoice().id).id,
    ]),
  );
  expectedAnswerMaps.set("correct", correctAnswers);
  expectedAnswerMaps.set("incorrect", incorrectAnswers);
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (dataDirectory) await fs.rm(dataDirectory, { recursive: true, force: true });
});

async function legacyApi(pathname, { method = "GET", body, token = AUTH_TOKEN } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  return { response, payload: text ? JSON.parse(text) : null };
}

async function api(pathname, { method = "GET", body, token = AUTH_COOKIE } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(token ? { Cookie: token === AUTH_COOKIE ? token : `qsp_session=${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  return { response, payload: text ? JSON.parse(text) : null };
}

describe("Week 3 integrated API flows", () => {
  it("serves a public health check and protects student endpoints", async () => {
    const health = await api("/api/v1/health", { token: null });
    assert.equal(health.response.status, 200);
    assert.equal(health.payload.status, "ok");

    const unauthenticated = await api("/api/v1/students/me", { token: null });
    assert.equal(unauthenticated.response.status, 401);
    assert.equal(unauthenticated.payload.error.code, "AUTHENTICATION_ERROR");
    assert.equal(JSON.stringify(unauthenticated.payload).includes("stack"), false);

    const invalidToken = await api("/api/v1/students/me", { token: "incorrect-token" });
    assert.equal(invalidToken.response.status, 401);
  });

  it("serves the browser app from the same origin as the API", async () => {
    const response = await fetch(`${baseUrl}/`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
    assert.match(await response.text(), /Quiz &amp; Study Tracker/);
  });

  it("hides answer keys and returns the authenticated student without credentials", async () => {
    const profile = await api("/api/v1/students/me");
    assert.equal(profile.response.status, 200);
    assert.equal(profile.payload.data.id, STUDENT_ID);
    assert.equal("passwordHash" in profile.payload.data, false);

    const quiz = await api("/api/v1/quizzes/quiz_oop_1");
    assert.equal(quiz.response.status, 200);
    assert.equal("correctChoiceId" in quiz.payload.data.questions[0], false);
    assert.equal("explanation" in quiz.payload.data.questions[0], false);
  });

  it("validates submissions before saving an attempt", async () => {
    const invalid = await api("/api/v1/quizzes/quiz_oop_1/attempts", {
      method: "POST",
      body: { answers: { question_not_in_quiz: "a" } },
    });
    assert.equal(invalid.response.status, 422);
    assert.equal(invalid.payload.error.code, "INVALID_QUIZ_SUBMISSION");
    assert.equal(services.quizService.listAttempts(STUDENT_ID).length, 0);

    const malformed = await fetch(`${baseUrl}/api/v1/quizzes/quiz_oop_1/attempts`, {
      method: "POST",
      headers: { Cookie: AUTH_COOKIE, "Content-Type": "application/json" },
      body: "{",
    });
    assert.equal(malformed.status, 400);
  });

  it("grades and persists a quiz, then returns updated dashboard progress", async () => {
    const submitted = await api("/api/v1/quizzes/quiz_oop_1/attempts", {
      method: "POST",
      body: { answers: expectedAnswerMaps.get("correct"), timeTakenSeconds: 42 },
    });
    assert.equal(submitted.response.status, 201);
    assert.equal(submitted.payload.data.attempt.score, 3);
    assert.equal(submitted.payload.data.attempt.percentage, 100);
    assert.equal(submitted.payload.data.progress.quizPerformance.totalQuizzes, 1);
    assert.equal(submitted.payload.data.progress.quizPerformance.correctAnswers, 3);

    const attempts = await api("/api/v1/quiz-attempts");
    assert.equal(attempts.response.status, 200);
    assert.equal(attempts.payload.data.length, 1);
    assert.equal(attempts.payload.data[0].id, submitted.payload.data.attempt.id);

    const progress = await api("/api/v1/students/me/progress");
    assert.equal(progress.response.status, 200);
    assert.equal(progress.payload.data.quizPerformance.averageScore, 100);
    assert.equal(progress.payload.data.subjectPerformance.find((item) =>
      item.subject.id === "subj_prog").record.attemptCount, 1);
  });

  it("flags a weak topic only after repeated low-scoring attempts", async () => {
    const beforeRepeat = await api("/api/v1/students/me/progress");
    assert.equal(beforeRepeat.payload.data.topicsToReview.some((item) => item.topic.id === "top_prog_oop"), false);

    for (let count = 0; count < 2; count += 1) {
      const submitted = await api("/api/v1/quizzes/quiz_oop_1/attempts", {
        method: "POST",
        body: { answers: expectedAnswerMaps.get("incorrect") },
      });
      assert.equal(submitted.response.status, 201);
      assert.equal(submitted.payload.data.attempt.score, 0);
    }

    const progress = await api("/api/v1/students/me/progress");
    const topic = progress.payload.data.topicsToReview.find((item) => item.topic.id === "top_prog_oop");
    assert.equal(topic.averageScore, 33);
    assert.equal(topic.attempts, 3);
    assert.equal(topic.status, "Needs Review");

    const dashboard = { innerHTML: "" };
    renderDashboard(dashboard, {
      student: services.userService.getStudent(STUDENT_ID),
      progressService: services.progressService,
      studyTrackerService: services.studyTrackerService,
    });
    assert.match(dashboard.innerHTML, /Project Progress: 75%/);
    assert.match(dashboard.innerHTML, /Programming — Object-Oriented Programming/);
    assert.match(dashboard.innerHTML, /Average Score: 33% · Status: Needs Review/);
  });

  it("records study activity, updates goal progress and returns refreshed totals", async () => {
    const goal = await api("/api/v1/goals", {
      method: "POST",
      body: { title: "Integration test goal", subjectId: "subj_db", targetHours: 0.5 },
    });
    assert.equal(goal.response.status, 201);

    const session = await api("/api/v1/study-sessions", {
      method: "POST",
      body: { subjectId: "subj_db", topicId: "top_db_norm", minutes: 35, notes: "Integration test" },
    });
    assert.equal(session.response.status, 201);
    assert.equal(session.payload.data.session.minutes, 35);
    assert.ok(session.payload.data.progress.studyPerformance.totalStudyTime >= 35);

    const goals = await api("/api/v1/goals");
    const updatedGoal = goals.payload.data.find((item) => item.id === goal.payload.data.id);
    assert.equal(updatedGoal.status, "met");
    assert.equal(updatedGoal.progress.percentage, 100);

    const progress = await api("/api/v1/students/me/progress");
    assert.equal(progress.payload.data.subjectPerformance.find((item) =>
      item.subject.id === "subj_db").record.studyMinutes >= 35, true);
  });

  it("rejects invalid study records and missing resources with standard errors", async () => {
    const invalidSession = await api("/api/v1/study-sessions", {
      method: "POST",
      body: { subjectId: "subj_db", topicId: "top_prog_oop", minutes: 10 },
    });
    assert.equal(invalidSession.response.status, 400);
    assert.equal(invalidSession.payload.error.code, "VALIDATION_ERROR");

    const missingQuiz = await api("/api/v1/quizzes/not-a-quiz");
    assert.equal(missingQuiz.response.status, 404);
    assert.equal(missingQuiz.payload.error.code, "NOT_FOUND");

    const wrongMethod = await api("/api/v1/students/me", { method: "POST", body: {} });
    assert.equal(wrongMethod.response.status, 405);
    assert.equal(wrongMethod.response.headers.get("allow"), "GET");
  });

  it("returns a structured 413 for oversized request bodies", async () => {
    const result = await api("/api/v1/study-sessions", {
      method: "POST",
      body: { subjectId: "subj_db", notes: "x".repeat(70 * 1024), minutes: 10 },
    });
    assert.equal(result.response.status, 413);
    assert.equal(result.payload.error.code, "PAYLOAD_TOO_LARGE");
  });

  it("returns a structured 504 when a request body stalls", async () => {
    const timeoutServer = createServer({
      services,
      requestBodyTimeoutMs: 50,
      logger: { error() {} },
    });
    await new Promise((resolve, reject) => {
      timeoutServer.once("error", reject);
      timeoutServer.listen(0, "127.0.0.1", resolve);
    });
    const request = http.request({
      host: "127.0.0.1",
      port: timeoutServer.address().port,
      path: "/api/v1/study-sessions",
      method: "POST",
      headers: { Cookie: AUTH_COOKIE,
        Authorization: `Bearer ${AUTH_TOKEN}`,
        "Content-Type": "application/json",
        "Content-Length": "100",
      },
    });
    const result = new Promise((resolve, reject) => {
      request.once("response", (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve({
          status: response.statusCode,
          body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
        }));
      });
      request.once("error", reject);
    });
    request.write('{"subjectId":');
    const timeout = await result;
    request.destroy();
    await new Promise((resolve, reject) =>
      timeoutServer.close((error) => error ? reject(error) : resolve()));
    assert.equal(timeout.status, 504);
    assert.equal(timeout.body.error.code, "GATEWAY_TIMEOUT");
  });

  it("persists attempts and study data across service restarts", async () => {
    const restarted = createPlatform({ dataDirectory });
    assert.equal(restarted.services.quizService.listAttempts(STUDENT_ID).length, 3);
    assert.ok(restarted.services.studyTrackerService.listSessions(STUDENT_ID)
      .some((session) => session.notes === "Integration test"));
    assert.equal(restarted.services.studyTrackerService.goalsFor(STUDENT_ID)
      .some((item) => item.title === "Integration test goal" && item.status === "met"), true);
  });

  it("returns a sanitized database error instead of a stack trace", async () => {
    await fs.writeFile(path.join(dataDirectory, "subjects.json"), "{broken", "utf8");
    const result = await api("/api/v1/subjects");
    assert.equal(result.response.status, 500);
    assert.equal(result.payload.error.code, "DATABASE_ERROR");
    assert.equal(JSON.stringify(result.payload).includes("stack"), false);
    assert.equal(JSON.stringify(result.payload).includes(dataDirectory), false);
  });
});
