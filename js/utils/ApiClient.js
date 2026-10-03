function responseError(message, response, contentType) {
  const error = new Error(message);
  error.status = response.status;
  error.contentType = contentType;
  return error;
}

function apiBaseUrl() {
  const configured = globalThis.QSP_CONFIG?.apiBaseUrl;
  if (!configured) {
    if (globalThis.location?.hostname.endsWith(".github.io")) {
      throw new Error("The production API URL is not configured. Set the GitHub repository variable QSP_API_URL and redeploy.");
    }
    return "";
  }
  let url;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("The API URL configuration is invalid. Set QSP_CONFIG.apiBaseUrl to the backend origin.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      (url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) {
    throw new Error("The API URL must be a plain HTTP(S) backend origin without credentials or a path.");
  }
  return url.origin;
}

function describeUnexpectedResponse(response, contentType, body, method) {
  const type = contentType || "unspecified content type";
  const trimmedBody = body.trim();
  if ([502, 503, 504].includes(response.status) ||
      (response.status === 405 && method === "POST")) {
    const error = responseError("Server unavailable. Please try again later.", response, contentType);
    error.code = "SERVER_UNAVAILABLE";
    return error;
  }

  if (!trimmedBody) {
    return responseError(
      `The authentication server returned an empty response (HTTP ${response.status}, ${type}).`,
      response,
      contentType,
    );
  }

  if (!contentType.includes("application/json") && !contentType.includes("+json")) {
    const staticHostHint = (response.status === 404 || response.status === 405 || contentType.includes("text/html"))
      ? " This address may be serving a static site without the authentication API."
      : "";
    return responseError(
      `The authentication server returned ${type} instead of JSON (HTTP ${response.status}).${staticHostHint}`,
      response,
      contentType,
    );
  }

  return responseError(
    `The authentication server returned invalid JSON (HTTP ${response.status}, ${type}).`,
    response,
    contentType,
  );
}

export async function requestApi(path, options = {}, fetchImplementation = globalThis.fetch) {
  const method = (options.method || "GET").toUpperCase();
  const baseUrl = apiBaseUrl();
  let response;
  try {
    response = await fetchImplementation(`${baseUrl}/api/v1${path}`, {
      ...options,
      credentials: "include",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch (cause) {
    const error = new Error("The authentication server is unavailable. Start the API server and try again.");
    error.cause = cause;
    error.code = "SERVER_UNAVAILABLE";
    throw error;
  }

  const contentType = (response.headers.get("content-type") || "").toLocaleLowerCase("en-US");
  let rawBody;
  try {
    rawBody = await response.text();
  } catch (cause) {
    const error = responseError(
      `The authentication server response could not be read (HTTP ${response.status}, ${contentType || "unspecified content type"}).`,
      response,
      contentType,
    );
    error.cause = cause;
    throw error;
  }

  let payload;
  if (!rawBody.trim() || (!contentType.includes("application/json") && !contentType.includes("+json"))) {
    throw describeUnexpectedResponse(response, contentType, rawBody, method);
  }
  try {
    payload = JSON.parse(rawBody);
  } catch (cause) {
    const error = describeUnexpectedResponse(response, contentType, rawBody, method);
    error.cause = cause;
    throw error;
  }

  if (!response.ok) {
    const code = payload?.error?.code;
    let message;
    if (response.status === 401) {
      message = payload?.error?.message || "The username/email or password is incorrect.";
    } else if (response.status === 500 && code === "DATABASE_ERROR") {
      message = "The account database is unavailable. Please try again later.";
    } else if (response.status === 500) {
      message = "The authentication server encountered an unexpected error. Please try again later.";
    } else if (response.status === 503) {
      message = "A required service is unavailable. Please try again later.";
    } else if (response.status === 429) {
      message = "Too many attempts. Please wait before trying again.";
    } else {
      message = payload?.error?.message || `The authentication request failed (HTTP ${response.status}).`;
    }
    const error = responseError(message, response, contentType);
    error.code = code;
    throw error;
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      !Object.hasOwn(payload, "data")) {
    throw responseError(
      `The authentication server returned an unexpected JSON format (HTTP ${response.status}).`,
      response,
      contentType,
    );
  }
  return payload.data;
}
