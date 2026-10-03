import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { requestApi } from "../js/utils/ApiClient.js";

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

describe("API response handling", () => {
  it("sends the same-origin JSON login request and returns a valid data envelope", async () => {
    let requestedUrl;
    let requestOptions;
    const result = await requestApi("/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier: "student", password: "secret" }),
    }, async (url, options) => {
      requestedUrl = url;
      requestOptions = options;
      return jsonResponse(200, { data: { user: { id: "student_1" }, expiresAt: 1000 } });
    });

    assert.equal(requestedUrl, "/api/v1/auth/login");
    assert.equal(requestOptions.method, "POST");
    assert.equal(requestOptions.credentials, "include");
    assert.equal(requestOptions.headers["Content-Type"], "application/json");
    assert.deepEqual(result.user, { id: "student_1" });
  });

  it("uses the configured backend origin instead of the GitHub Pages origin", async () => {
    const previousConfig = globalThis.QSP_CONFIG;
    globalThis.QSP_CONFIG = { apiBaseUrl: "https://coursework-api.example.com/" };
    try {
      let requestedUrl;
      await requestApi("/auth/login", { method: "POST", body: "{}" }, async (url) => {
        requestedUrl = url;
        return jsonResponse(200, { data: { user: {}, expiresAt: 1000 } });
      });
      assert.equal(requestedUrl, "https://coursework-api.example.com/api/v1/auth/login");
    } finally {
      globalThis.QSP_CONFIG = previousConfig;
    }
  });

  it("fails clearly on GitHub Pages when the production API URL is not configured", async () => {
    const previousConfig = globalThis.QSP_CONFIG;
    const previousLocation = globalThis.location;
    globalThis.QSP_CONFIG = { apiBaseUrl: "" };
    globalThis.location = { hostname: "gojouzxh.github.io" };
    try {
      await assert.rejects(
        requestApi("/auth/login", {}, async () => {
          throw new Error("This fetch must not be called.");
        }),
        /production API URL is not configured/,
      );
    } finally {
      globalThis.QSP_CONFIG = previousConfig;
      if (previousLocation === undefined) delete globalThis.location;
      else globalThis.location = previousLocation;
    }
  });

  it("preserves authentication errors from valid JSON responses", async () => {
    await assert.rejects(
      requestApi("/auth/login", {}, async () =>
        jsonResponse(401, { error: { code: "AUTHENTICATION_ERROR", message: "Invalid credentials." } })),
      (error) => error.status === 401 && error.message === "Invalid credentials.",
    );
  });

  it("identifies a static-host HTML 404 rather than reporting unreadable JSON", async () => {
    await assert.rejects(
      requestApi("/auth/login", {}, async () => new Response("<!doctype html><title>Not Found</title>", {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      })),
      (error) => error.status === 404 &&
        /text\/html/.test(error.message) &&
        /static site/.test(error.message),
    );
  });

  it("identifies a static-host 405 response with no content type", async () => {
    await assert.rejects(
      requestApi("/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier: "student", password: "secret" }),
      }, async () => new Response("<html><title>405 Not Allowed</title></html>", {
        status: 405,
        headers: { "Content-Type": "" },
      })),
      (error) => error.status === 405 &&
        error.code === "SERVER_UNAVAILABLE" &&
        /Server unavailable/.test(error.message),
    );
  });

  it("shows a friendly message for HTML 502 and 503 responses", async () => {
    for (const status of [502, 503]) {
      await assert.rejects(
        requestApi("/auth/login", { method: "POST" }, async () => new Response("<html>Unavailable</html>", {
          status,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        })),
        (error) => error.status === status &&
          error.code === "SERVER_UNAVAILABLE" &&
          error.message === "Server unavailable. Please try again later.",
      );
    }
  });

  it("shows a friendly server error for an empty 502 and diagnoses malformed JSON", async () => {
    await assert.rejects(
      requestApi("/auth/login", {}, async () => new Response(null, {
        status: 502,
        headers: { "Content-Type": "application/json" },
      })),
      (error) => error.status === 502 &&
        error.code === "SERVER_UNAVAILABLE" &&
        /Server unavailable/.test(error.message),
    );

    await assert.rejects(
      requestApi("/auth/login", {}, async () => new Response("{broken", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })),
      (error) => error.status === 200 && /invalid JSON/.test(error.message),
    );
  });

  it("distinguishes server and database failures without exposing server details", async () => {
    await assert.rejects(
      requestApi("/auth/login", {}, async () => {
        throw new TypeError("fetch failed");
      }),
      (error) => error.code === "SERVER_UNAVAILABLE" && /server is unavailable/.test(error.message),
    );

    await assert.rejects(
      requestApi("/auth/login", {}, async () =>
        jsonResponse(500, { error: { code: "DATABASE_ERROR", message: "private filesystem path" } })),
      (error) => error.code === "DATABASE_ERROR" &&
        /database is unavailable/.test(error.message) &&
        !error.message.includes("private filesystem path"),
    );
  });

  it("rejects a successful response with an unexpected JSON envelope", async () => {
    await assert.rejects(
      requestApi("/auth/login", {}, async () => jsonResponse(200, { user: { id: "student_1" } })),
      (error) => error.status === 200 && /unexpected JSON format/.test(error.message),
    );
  });
});
