import { promisify } from "node:util";
import crypto from "node:crypto";
import { Student } from "../js/models/Student.js";
import {
  AuthenticationError,
  ConflictError,
  RateLimitError,
  ServiceCommunicationError,
  ValidationError,
} from "../js/errors/AppErrors.js";

const scrypt = promisify(crypto.scrypt);
const EMAIL_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+$/i;
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,30}$/;
const SESSION_IDLE_MS = 30 * 60 * 1000;
const REMEMBERED_IDLE_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 8;

function normalizeEmail(value) {
  return value.trim().toLocaleLowerCase("en-US");
}

function publicAccount(student) {
  return {
    id: student.id,
    name: student.name,
    username: student.username,
    email: student.email,
    role: student.role,
    currentStreak: student.currentStreak,
    longestStreak: student.longestStreak,
    createdAt: student.createdAt,
  };
}

function tokenDigest(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export class AuthService {
  #userService;
  #sessions = new Map();
  #resetTokens = new Map();
  #loginAttempts = new Map();
  #requestLimits = new Map();
  #cleanupCounter = 0;
  #emailApiKey;
  #emailFrom;
  #publicUrl;
  #fetch;
  #clock;

  constructor({
    userService,
    emailApiKey = process.env.QSP_EMAIL_API_KEY,
    emailFrom = process.env.QSP_EMAIL_FROM,
    publicUrl = process.env.QSP_PUBLIC_URL || "http://localhost:8080",
    fetchImplementation = globalThis.fetch,
    clock = () => Date.now(),
  }) {
    if (!userService) throw new ValidationError("userService is required.");
    this.#userService = userService;
    this.#emailApiKey = emailApiKey;
    this.#emailFrom = emailFrom;
    this.#publicUrl = publicUrl;
    this.#fetch = fetchImplementation;
    this.#clock = clock;
  }

  limitRequests(key, { limit = 5, windowMs = 60_000 } = {}) {
    const now = this.#clock();
    this.#cleanupState(now);
    const current = this.#requestLimits.get(key);
    if (!current || current.resetAt <= now) {
      this.#requestLimits.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    current.count += 1;
    if (current.count > limit) {
      throw new RateLimitError(Math.ceil((current.resetAt - now) / 1000));
    }
  }

  async register({ name, username, email, password, confirmPassword, acceptTerms }) {
    if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100 ||
        !/^[\p{L}\p{M} .'-]+$/u.test(name.trim())) {
      throw new ValidationError("Enter a valid full name (2 to 100 letters).", [{ field: "name" }]);
    }
    if (typeof username !== "string" || !USERNAME_PATTERN.test(username)) {
      throw new ValidationError(
        "Username must be 3 to 30 characters and use only letters, numbers, or underscores.",
        [{ field: "username" }],
      );
    }
    const normalizedUsername = username.toLocaleLowerCase("en-US");
    if (typeof email !== "string" || email.length > 254 || !EMAIL_PATTERN.test(email)) {
      throw new ValidationError("Enter a valid email address.", [{ field: "email" }]);
    }
    this.#validatePassword(password);
    if (confirmPassword !== password) {
      throw new ValidationError("Passwords do not match.", [{ field: "confirmPassword" }]);
    }
    if (acceptTerms !== true) {
      throw new ValidationError("Please accept the terms to create an account.", [{ field: "acceptTerms" }]);
    }

    const normalizedEmail = normalizeEmail(email);
    if (this.#userService.findAccount(normalizedUsername) ||
        this.#userService.findAccount(normalizedEmail)) {
      throw new ConflictError("That username or email is already in use.");
    }

    const passwordHash = await this.#hashPassword(password);
    if (this.#userService.findAccount(normalizedUsername) ||
        this.#userService.findAccount(normalizedEmail)) {
      throw new ConflictError("That username or email is already in use.");
    }

    const student = new Student({
      id: `student_${crypto.randomUUID()}`,
      name: name.trim(),
      username,
      email: normalizedEmail,
      passwordHash,
      isActive: true,
    });
    this.#userService.saveStudent(student);
    return publicAccount(student);
  }

  async login({ identifier, password, rememberMe = false, address = "unknown" }) {
    if (typeof identifier !== "string" || !identifier.trim() ||
        typeof password !== "string" || !password) {
      throw new ValidationError("Enter your username or email and password.");
    }
    if (typeof rememberMe !== "boolean") {
      throw new ValidationError("rememberMe must be a boolean.");
    }

    this.#cleanupState(this.#clock());
    this.#checkLoginLimit(address);
    const student = this.#userService.findAccount(identifier);
    const valid = await this.#verifyPassword(password, student?.toJSON().passwordHash);
    if (!student || !valid) {
      this.#recordFailedLogin(address);
      throw new AuthenticationError("The username/email or password is incorrect.");
    }
    if (!student.isActive) {
      throw new AuthenticationError("This account is unavailable. Contact your administrator.");
    }

    this.#loginAttempts.delete(address);
    const token = crypto.randomBytes(32).toString("base64url");
    const now = this.#clock();
    const idleDurationMs = rememberMe ? REMEMBERED_IDLE_MS : SESSION_IDLE_MS;
    const session = {
      userId: student.id,
      createdAt: now,
      lastActivityAt: now,
      idleDurationMs,
      absoluteExpiresAt: now + SESSION_ABSOLUTE_MS,
      rememberMe,
    };
    this.#sessions.set(tokenDigest(token), session);
    return {
      token,
      user: publicAccount(student),
      expiresAt: Math.min(now + idleDurationMs, session.absoluteExpiresAt),
      rememberMe,
    };
  }

  getSession(token) {
    if (!token) return null;
    const digest = tokenDigest(token);
    const session = this.#sessions.get(digest);
    const now = this.#clock();
    if (!session || now - session.lastActivityAt >= session.idleDurationMs ||
        now >= session.absoluteExpiresAt) {
      this.#sessions.delete(digest);
      return null;
    }

    const student = this.#userService.getStudent(session.userId);
    if (!student.isActive) {
      this.#sessions.delete(digest);
      return null;
    }
    session.lastActivityAt = now;
    return {
      user: publicAccount(student),
      expiresAt: Math.min(now + session.idleDurationMs, session.absoluteExpiresAt),
      rememberMe: session.rememberMe,
    };
  }

  logout(token) {
    if (token) this.#sessions.delete(tokenDigest(token));
  }

  async requestPasswordReset(email) {
    if (typeof email !== "string" || email.length > 254 || !EMAIL_PATTERN.test(email)) {
      throw new ValidationError("Enter a valid email address.", [{ field: "email" }]);
    }
    if (!this.#emailApiKey || !this.#emailFrom || typeof this.#fetch !== "function") {
      throw new ServiceCommunicationError("email delivery service", "Email delivery is not configured");
    }

    this.#cleanupState(this.#clock());
    const student = this.#userService.findByEmail(normalizeEmail(email));
    const token = crypto.randomBytes(32).toString("base64url");
    const digest = tokenDigest(token);
    if (student) {
      this.#resetTokens.set(digest, { userId: student.id, expiresAt: this.#clock() + RESET_TOKEN_TTL_MS });
    }
    const resetUrl = new URL(this.#publicUrl);
    resetUrl.hash = `/reset-password?token=${encodeURIComponent(token)}`;
    const result = await this.#fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.#emailApiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        from: this.#emailFrom,
        to: [normalizeEmail(email)],
        subject: "Reset your Coursework password",
        text: `Use this link to reset your password. It expires in 30 minutes:\n\n${resetUrl}`,
      }),
    }).catch((error) => {
      if (student) this.#resetTokens.delete(digest);
      throw new ServiceCommunicationError("email delivery service", error.message);
    });
    if (!result.ok) {
      if (student) this.#resetTokens.delete(digest);
      throw new ServiceCommunicationError("email delivery service", `HTTP ${result.status}`);
    }
  }

  async resetPassword({ token, password, confirmPassword }) {
    if (typeof token !== "string" || token.length < 32 || token.length > 128) {
      throw new AuthenticationError("This password reset link is invalid or expired.");
    }
    this.#validatePassword(password);
    if (confirmPassword !== password) {
      throw new ValidationError("Passwords do not match.", [{ field: "confirmPassword" }]);
    }

    const digest = tokenDigest(token);
    const record = this.#resetTokens.get(digest);
    this.#resetTokens.delete(digest);
    if (!record || record.expiresAt <= this.#clock()) {
      throw new AuthenticationError("This password reset link is invalid or expired.");
    }

    const student = this.#userService.getStudent(record.userId);
    const updated = new Student({
      ...student.toJSON(),
      passwordHash: await this.#hashPassword(password),
    });
    this.#userService.saveStudent(updated);
    for (const [sessionDigest, session] of this.#sessions) {
      if (session.userId === student.id) this.#sessions.delete(sessionDigest);
    }
  }

  #validatePassword(password) {
    if (typeof password !== "string" || password.length < 12 || password.length > 128 ||
        !/[a-z]/.test(password) || !/[A-Z]/.test(password) ||
        !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      throw new ValidationError(
        "Use 12 to 128 characters with an uppercase letter, lowercase letter, number, and symbol.",
        [{ field: "password" }],
      );
    }
  }

  async #hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const derived = await scrypt(password, salt, 64, { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    return `scrypt$32768$8$1$${salt.toString("hex")}$${derived.toString("hex")}`;
  }

  async #verifyPassword(password, encodedHash) {
    const [algorithm, n, r, p, saltHex, hashHex] = (encodedHash || "").split("$");
    if (algorithm !== "scrypt" || n !== "32768" || r !== "8" ||
        p !== "1" || !/^[a-f0-9]{32}$/.test(saltHex) ||
        !/^[a-f0-9]{128}$/.test(hashHex)) {
      await this.#hashPassword(password);
      return false;
    }
    const derived = await scrypt(password, Buffer.from(saltHex, "hex"), 64, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
    });
    return crypto.timingSafeEqual(derived, Buffer.from(hashHex, "hex"));
  }

  #checkLoginLimit(address) {
    const attempt = this.#loginAttempts.get(address);
    if (attempt && attempt.resetAt > this.#clock() && attempt.count >= MAX_LOGIN_ATTEMPTS) {
      throw new RateLimitError(Math.ceil((attempt.resetAt - this.#clock()) / 1000));
    }
    if (attempt?.resetAt <= this.#clock()) this.#loginAttempts.delete(address);
  }

  #recordFailedLogin(address) {
    const now = this.#clock();
    const current = this.#loginAttempts.get(address);
    if (!current || current.resetAt <= now) {
      this.#loginAttempts.set(address, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
      return;
    }
    current.count += 1;
  }

  #cleanupState(now) {
    this.#cleanupCounter += 1;
    if (this.#cleanupCounter % 64 !== 0) return;
    for (const [key, limit] of this.#requestLimits) {
      if (limit.resetAt <= now) this.#requestLimits.delete(key);
    }
    for (const [address, attempt] of this.#loginAttempts) {
      if (attempt.resetAt <= now) this.#loginAttempts.delete(address);
    }
    for (const [digest, session] of this.#sessions) {
      if (now - session.lastActivityAt >= session.idleDurationMs ||
          now >= session.absoluteExpiresAt) this.#sessions.delete(digest);
    }
    for (const [digest, token] of this.#resetTokens) {
      if (token.expiresAt <= now) this.#resetTokens.delete(digest);
    }
    for (const collection of [this.#requestLimits, this.#loginAttempts, this.#sessions, this.#resetTokens]) {
      while (collection.size > 10_000) collection.delete(collection.keys().next().value);
    }
  }
}
