/**
 * js/errors/AppErrors.js
 *
 * Domain and Application Error hierarchy for Quiz & Study Platform.
 * All errors provide standard HTTP-compatible status codes, machine-readable
 * error codes, and a sanitized toResponse() payload that NEVER leaks stack
 * traces to end-users or API consumers.
 */

export class AppError extends Error {
  /**
   * @param {string} message - Human-readable error message
   * @param {string} code - Machine-readable error code (e.g. 'VALIDATION_ERROR')
   * @param {number} statusCode - HTTP status code
   * @param {any} [details=null] - Additional structured context
   */
  constructor(message, code = "INTERNAL_ERROR", statusCode = 500, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serializes the error safely for end users and API clients.
   * Deliberately omits the stack trace.
   */
  toResponse() {
    const payload = {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
    };
    if (this.details !== null && this.details !== undefined) {
      payload.details = this.details;
    }
    return { error: payload };
  }
}

/** 400 Bad Request — Input validation failure */
export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message || "Validation failed.", "VALIDATION_ERROR", 400, details);
  }
}

/** 405 Method Not Allowed — The path exists but does not accept this method. */
export class MethodNotAllowedError extends AppError {
  constructor(method, allowedMethods) {
    super("The HTTP method is not allowed for this endpoint.", "METHOD_NOT_ALLOWED", 405, { method, allowedMethods });
  }
}

/** 413 Payload Too Large — The request body exceeds the configured limit. */
export class PayloadTooLargeError extends AppError {
  constructor(maxBytes) {
    super("The request body exceeds the allowed size.", "PAYLOAD_TOO_LARGE", 413, { maxBytes });
  }
}

/** 401 Unauthorized — Authentication failed or credential missing */
export class AuthenticationError extends AppError {
  constructor(message = "Authentication required or invalid credentials.") {
    super(message, "AUTHENTICATION_ERROR", 401);
  }
}

/** 403 Forbidden — Authenticated user lacks permission */
export class AuthorizationError extends AppError {
  constructor(message = "Access denied.") {
    super(message, "AUTHORIZATION_ERROR", 403);
  }
}

/** 404 Not Found — Requested resource does not exist */
export class NotFoundError extends AppError {
  constructor(resource = "Resource", identifier = "") {
    const msg = identifier ? `${resource} with ID '${identifier}' was not found.` : `${resource} not found.`;
    super(msg, "NOT_FOUND", 404, { resource, identifier });
  }
}

/** 409 Conflict — Unique constraint or state conflict */
export class ConflictError extends AppError {
  constructor(message = "Resource conflict detected.", details = null) {
    super(message, "CONFLICT", 409, details);
  }
}

/** 429 Too Many Requests — Authentication rate limit reached. */
export class RateLimitError extends AppError {
  constructor(retryAfterSeconds) {
    super("Too many attempts. Please wait before trying again.", "RATE_LIMITED", 429, { retryAfterSeconds });
  }
}

/** 422 Unprocessable Entity — Quiz submission structurally invalid */
export class InvalidQuizSubmissionError extends AppError {
  constructor(message, details = null) {
    super(message || "Quiz submission is invalid.", "INVALID_QUIZ_SUBMISSION", 422, details);
  }
}

/** 500 Internal Server Error — Storage or persistence layer error */
export class DatabaseError extends AppError {
  constructor(message = "Database operation failed.", details = null) {
    super(message, "DATABASE_ERROR", 500, details);
  }
}

/** 503 Service Unavailable — Inter-service communication failed */
export class ServiceCommunicationError extends AppError {
  constructor(targetService = "Downstream service", reason = "Service unreachable") {
    super(`The ${targetService} is temporarily unavailable.`, "SERVICE_UNAVAILABLE", 503, { targetService });
  }
}

/** 504 Gateway Timeout — Request timed out */
export class TimeoutError extends AppError {
  constructor(operation = "Request", timeoutMs = 5000) {
    super(`Operation '${operation}' timed out after ${timeoutMs}ms.`, "GATEWAY_TIMEOUT", 504, { operation, timeoutMs });
  }
}
