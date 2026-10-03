import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { createPlatform } from "../server/platform.js";
import { createServer } from "../server/server.js";
import { RateLimitError } from "../js/errors/AppErrors.js";

const PASSWORD = "SecurePassphrase1!";
let now = Date.parse("2026-10-03T00:00:00.000Z");
let dataDirectory;
let services;
let server;
let baseUrl;
let sentEmail;

before(async () => {
  dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "qsp-auth-"));
  ({ services } = createPlatform({
    dataDirectory,
    authOptions: {
      emailApiKey: "test-email-api-key",
      emailFrom: "Coursework <no-reply@example.test>",
      publicUrl: "https://gojouzxh.github.io/Student-System/",
      clock: () => now,
      fetchImplementation: async (url, options) => {
        assert.equal(url, "https://api.resend.com/emails");
        sentEmail = JSON.parse(options.body);
        return { ok: true, status: 200 };
      },
    },
  }));
  server = createServer({
    services,
    secureCookies: true,
    allowedOrigins: ["https://gojouzxh.github.io", "http://localhost:5173"],
    logger: { error() {} },
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()));
  if (dataDirectory) await fs.rm(dataDirectory, { recursive: true, force: true });
});

async function api(pathname, { method = "GET", body, cookie, origin } = {}) {
  const response = await fetch(`${baseUrl}/api/v1${pathname}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  return { response, payload: text ? JSON.parse(text) : null };
}

async function register(overrides = {}) {
  return api("/auth/register", {
    method: "POST",
    body: {
      name: "Taylor Student",
      username: "taylor_student",
      email: "taylor@example.test",
      password: PASSWORD,
      confirmPassword: PASSWORD,
      acceptTerms: true,
      role: "administrator",
      ...overrides,
    },
  });
}

async function login(identifier = "taylor_student", password = PASSWORD, rememberMe = false, origin) {
  return api("/auth/login", {
    method: "POST",
    body: { identifier, password, rememberMe },
    origin,
  });
}

describe("account registration and secure sessions", () => {
  it("supports credentialed GitHub Pages CORS preflight and login", async () => {
    const preflight = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://gojouzxh.github.io",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "https://gojouzxh.github.io");
    assert.equal(preflight.headers.get("access-control-allow-credentials"), "true");

    const denied = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "OPTIONS",
      headers: { Origin: "https://not-allowed.example" },
    });
    assert.equal(denied.status, 401);
  });

  it("validates registration, hashes the password, and prevents duplicate accounts", async () => {
    const invalid = await register({ password: "weak", confirmPassword: "weak" });
    assert.equal(invalid.response.status, 400);

    const created = await register();
    assert.equal(created.response.status, 201);
    assert.equal(created.payload.data.user.role, "student");
    assert.equal("passwordHash" in created.payload.data.user, false);
    const stored = services.userService.getStudent(created.payload.data.user.id).toJSON();
    assert.match(stored.passwordHash, /^scrypt\$32768\$8\$1\$/);
    assert.equal(stored.passwordHash.includes(PASSWORD), false);

    const duplicateEmail = await register({ username: "another_name" });
    assert.equal(duplicateEmail.response.status, 409);
    const duplicateUsername = await register({ email: "another@example.test" });
    assert.equal(duplicateUsername.response.status, 409);
    const missingTerms = await register({ username: "taylor_2", email: "taylor2@example.test", acceptTerms: false });
    assert.equal(missingTerms.response.status, 400);
  });

  it("uses generic credential errors and issues a protected HttpOnly session", async () => {
    const wrong = await login("taylor_student", "WrongPassphrase1!");
    const missing = await login("unknown@example.test", "WrongPassphrase1!");
    assert.equal(wrong.response.status, 401);
    assert.equal(missing.response.status, 401);
    assert.equal(wrong.payload.error.message, missing.payload.error.message);

    const empty = await api("/auth/login", { method: "POST", body: { identifier: "", password: "" } });
    assert.equal(empty.response.status, 400);

    const signedIn = await login("taylor@example.test", PASSWORD, true, "https://gojouzxh.github.io");
    assert.equal(signedIn.response.status, 200);
    const cookie = signedIn.response.headers.get("set-cookie");
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=None/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /Max-Age=2592000/);
    assert.equal("token" in signedIn.payload.data, false);
    assert.equal(signedIn.response.headers.get("access-control-allow-origin"), "https://gojouzxh.github.io");
    assert.equal(signedIn.response.headers.get("access-control-allow-credentials"), "true");

    const session = await api("/auth/session", { cookie: cookie.split(";")[0] });
    assert.equal(session.response.status, 200);
    assert.equal(session.payload.data.user.username, "taylor_student");
    const profile = await api("/students/me", { cookie: cookie.split(";")[0] });
    assert.equal(profile.response.status, 200);
    assert.equal("passwordHash" in profile.payload.data, false);

    const logout = await api("/auth/logout", { method: "POST", cookie: cookie.split(";")[0] });
    assert.equal(logout.response.status, 200);
    const afterLogout = await api("/students/me", { cookie: cookie.split(";")[0] });
    assert.equal(afterLogout.response.status, 401);
  });

  it("sends a non-enumerating reset email and consumes the reset token once", async () => {
    const first = await api("/auth/forgot-password", {
      method: "POST",
      body: { email: "taylor@example.test" },
    });
    assert.equal(first.response.status, 202);
    assert.equal(first.payload.data.message,
      "If an account matches that email, password reset instructions will be sent.");
    assert.equal(sentEmail.to[0], "taylor@example.test");

    const resetLink = sentEmail.text.match(/https:\/\/gojouzxh\.github\.io\/Student-System\/\S+/)[0];
    const resetUrl = new URL(resetLink);
    assert.equal(resetUrl.pathname, "/Student-System/");
    const token = new URLSearchParams(resetUrl.hash.split("?")[1]).get("token");
    assert.ok(token);

    const unknown = await api("/auth/forgot-password", {
      method: "POST",
      body: { email: "nobody@example.test" },
    });
    assert.equal(unknown.response.status, first.response.status);
    assert.equal(unknown.payload.data.message, first.payload.data.message);

    const changed = await api("/auth/reset-password", {
      method: "POST",
      body: { token, password: "NewSecurePassphrase2!", confirmPassword: "NewSecurePassphrase2!" },
    });
    assert.equal(changed.response.status, 200);
    const reused = await api("/auth/reset-password", {
      method: "POST",
      body: { token, password: "OtherSecurePassphrase3!", confirmPassword: "OtherSecurePassphrase3!" },
    });
    assert.equal(reused.response.status, 401);
    assert.equal((await login("taylor_student", PASSWORD)).response.status, 401);
    assert.equal((await login("taylor_student", "NewSecurePassphrase2!")).response.status, 200);
  });

  it("rejects disabled accounts and expires inactive sessions", async () => {
    const inactive = await register({
      username: "inactive_student",
      email: "inactive@example.test",
    });
    assert.equal(inactive.response.status, 201);
    const student = services.userService.getStudent(inactive.payload.data.user.id);
    services.userService.saveStudent(services.userService.syncAuthenticatedStudent({
      ...inactive.payload.data.user,
      isActive: false,
    }));

    const disabledLogin = await login("inactive_student", PASSWORD);
    assert.equal(disabledLogin.response.status, 401);
    assert.match(disabledLogin.payload.error.message, /unavailable/i);

    const signedIn = await login("taylor_student", "NewSecurePassphrase2!");
    assert.equal(signedIn.response.status, 200);
    const cookie = signedIn.response.headers.get("set-cookie").split(";")[0];
    now += 30 * 60 * 1000 + 1;
    const expired = await api("/auth/session", { cookie });
    assert.equal(expired.response.status, 401);
    assert.equal(student.role, "student");
  });

  it("locks out repeated failed attempts", async () => {
    const { authService } = services;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await assert.rejects(
        authService.login({
          identifier: "nobody@example.test",
          password: "WrongPassphrase1!",
          address: "test-lockout-address",
        }),
        (error) => error.statusCode === 401,
      );
    }
    await assert.rejects(
      authService.login({
        identifier: "nobody@example.test",
        password: "WrongPassphrase1!",
        address: "test-lockout-address",
      }),
      RateLimitError,
    );
  });
});
