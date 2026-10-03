import { LocalStorageRepository } from "./data/Database.js";
import { seedIfEmpty } from "./data/seed.js";
import { Student } from "./models/Student.js";
import { Subject } from "./models/Subject.js";
import { Topic } from "./models/Topic.js";
import { Quiz } from "./models/Quiz.js";
import { QuizAttempt } from "./models/QuizAttempt.js";
import { StudySession } from "./models/StudySession.js";
import { StudyGoal } from "./models/StudyGoal.js";

import { UserService } from "./services/UserService.js";
import { QuizService } from "./services/QuizService.js";
import { StudyTrackerService } from "./services/StudyTrackerService.js";
import { ProgressService } from "./services/ProgressService.js";
import { notifications } from "./utils/NotificationManager.js";

import { Router } from "./router.js";
import { renderDashboard } from "./views/DashboardView.js";
import { renderQuizList } from "./views/QuizListView.js";
import { renderQuizTaking } from "./views/QuizTakingView.js";
import { renderQuizResult } from "./views/QuizResultView.js";
import { renderQuizHistory } from "./views/QuizHistoryView.js";
import { renderStudyTracker } from "./views/StudyTrackerView.js";
import { renderProgress } from "./views/ProgressView.js";
import { renderAuthView } from "./views/AuthView.js";
import { requestApi } from "./utils/ApiClient.js";

// ---- Repositories (Database layer: one per collection) ----
const repos = {
  students: new LocalStorageRepository("students", Student.fromJSON),
  subjects: new LocalStorageRepository("subjects", Subject.fromJSON),
  topics: new LocalStorageRepository("topics", Topic.fromJSON),
  quizzes: new LocalStorageRepository("quizzes", Quiz.fromJSON),
  attempts: new LocalStorageRepository("attempts", QuizAttempt.fromJSON),
  sessions: new LocalStorageRepository("sessions", StudySession.fromJSON),
  goals: new LocalStorageRepository("goals", StudyGoal.fromJSON),
};

seedIfEmpty({
  subjects: repos.subjects,
  topics: repos.topics,
  quizzes: repos.quizzes,
  students: repos.students,
  sessions: repos.sessions,
  goals: repos.goals,
});

// ---- Services (Service boundaries) ----
const userService = new UserService({ students: repos.students });
const quizService = new QuizService({
  subjects: repos.subjects, topics: repos.topics, quizzes: repos.quizzes,
  attempts: repos.attempts, userService,
});
const studyTrackerService = new StudyTrackerService({
  sessions: repos.sessions, goals: repos.goals, userService, quizService,
});
const progressService = new ProgressService({ userService, quizService, studyTrackerService });

const services = { userService, quizService, studyTrackerService, progressService };
let authenticatedUser = null;
let rememberSession = false;
let sessionExpiresAt = 0;
let inactivityTimer = null;
let sessionNotice = "";
let lastSessionTouch = 0;
const appShell = document.querySelector(".app-shell");
appShell.classList.add("app-shell--auth");

// ---- App shell ----
const mainEl = document.getElementById("app-main");
const navLinks = document.querySelectorAll("[data-nav-link]");
const logoutButton = document.querySelector("[data-logout]");

function showAuth(mode, options = {}) {
  appShell.classList.add("app-shell--auth");
  setActiveNav("");
  renderAuthView(mainEl, {
    mode,
    initialMessage: options.initialMessage || "",
    resetToken: options.resetToken || "",
    onLogin: async (values) => {
      const session = await requestApi("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          identifier: values.identifier,
          password: values.password,
          rememberMe: values.rememberMe === "true",
        }),
      });
      startSession(session);
      router.navigate("#/dashboard");
    },
    onRegister: async (values) => {
      await requestApi("/auth/register", { method: "POST", body: JSON.stringify({
        name: values.name,
        username: values.username,
        email: values.email,
        password: values.password,
        confirmPassword: values.confirmPassword,
        acceptTerms: values.acceptTerms === "true",
      }) });
      sessionNotice = "Your account is ready. Sign in with your new credentials.";
      router.navigate("#/login");
    },
    onForgot: async (values) => {
      const result = await requestApi("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: values.email }),
      });
      return { message: result.message };
    },
    onReset: async (values) => {
      const result = await requestApi("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token: values.token,
          password: values.password,
          confirmPassword: values.confirmPassword,
        }),
      });
      sessionNotice = result.message;
      router.navigate("#/login");
    },
  });
}

function startSession(session) {
  authenticatedUser = session.user;
  rememberSession = session.rememberMe === true;
  sessionExpiresAt = session.expiresAt;
  lastSessionTouch = Date.now();
  userService.syncAuthenticatedStudent(authenticatedUser);
  appShell.classList.remove("app-shell--auth");
  resetInactivityTimer();
}

function stopSession(message = "") {
  authenticatedUser = null;
  sessionExpiresAt = 0;
  clearTimeout(inactivityTimer);
  inactivityTimer = null;
  sessionNotice = message;
  router.navigate("#/login");
}

function expireSession() {
  stopSession("Your session expired due to inactivity. Please sign in again.");
}

function resetInactivityTimer() {
  if (!authenticatedUser) return;
  clearTimeout(inactivityTimer);
  const idleDuration = rememberSession ? 30 * 24 * 60 * 60 * 1000 : 30 * 60 * 1000;
  const remaining = Math.max(0, Math.min(idleDuration, sessionExpiresAt - Date.now()));
  if (remaining === 0) {
    expireSession();
    return;
  }
  inactivityTimer = setTimeout(() => {
    if (Date.now() >= sessionExpiresAt) expireSession();
    else resetInactivityTimer();
  }, Math.min(remaining, 2_000_000_000));

  if (Date.now() - lastSessionTouch >= 5 * 60 * 1000) {
    lastSessionTouch = Date.now();
    requestApi("/auth/session").then(startSession).catch((error) => {
      if (error.status === 401) expireSession();
      else console.error("[Auth] Session refresh failed:", error.message);
    });
  }
}

window.addEventListener("pointerdown", resetInactivityTimer, { passive: true });
window.addEventListener("keydown", resetInactivityTimer);
window.addEventListener("touchstart", resetInactivityTimer, { passive: true });

function setActiveNav(hash) {
  navLinks.forEach((link) => link.classList.toggle("nav-link--active", link.getAttribute("href") === hash));
}

const router = new Router();
router.onError((error) => {
  console.error("[Router] Route rendering failed:", error);
  notifications.showError(error);
});

router.add("/login", () => {
  if (authenticatedUser) return router.navigate("#/dashboard");
  showAuth("login", { initialMessage: sessionNotice });
  sessionNotice = "";
});

router.add("/register", () => {
  if (authenticatedUser) return router.navigate("#/dashboard");
  showAuth("register");
});

router.add("/forgot-password", () => {
  if (authenticatedUser) return router.navigate("#/dashboard");
  showAuth("forgot");
});

router.add("/reset-password", ({ query }) => {
  if (authenticatedUser) return router.navigate("#/dashboard");
  showAuth("reset", { resetToken: query.get("token") || "" });
});

function requireStudent() {
  if (!authenticatedUser) {
    router.navigate("#/login");
    return null;
  }
  return userService.currentStudent(authenticatedUser.id);
}

router.add("/dashboard", () => {
  const student = requireStudent();
  if (!student) return;
  appShell.classList.remove("app-shell--auth");
  setActiveNav("#/dashboard");
  renderDashboard(mainEl, { student, progressService, studyTrackerService });
});

router.add("/quizzes", () => {
  if (!requireStudent()) return;
  appShell.classList.remove("app-shell--auth");
  setActiveNav("#/quizzes");
  renderQuizList(mainEl, { quizService, navigate: (h) => router.navigate(h) });
});

router.add("/quiz/:id", ({ id }) => {
  const student = requireStudent();
  if (!student) return;
  appShell.classList.remove("app-shell--auth");
  setActiveNav("#/quizzes");
  const quiz = quizService.getQuiz(id);
  if (!quiz) return router.navigate("#/quizzes");
  renderQuizTaking(mainEl, { quiz, quizService, student, navigate: (h) => router.navigate(h) });
});

router.add("/quiz-result/:attemptId", ({ attemptId }) => {
  const student = requireStudent();
  if (!student) return;
  appShell.classList.remove("app-shell--auth");
  setActiveNav("#/history");
  const attempt = quizService.getAttempt(attemptId);
  if (!attempt || attempt.studentId !== student.id) return router.navigate("#/history");
  const quiz = quizService.getQuiz(attempt.quizId);
  renderQuizResult(mainEl, { attempt, quiz, navigate: (h) => router.navigate(h) });
});

router.add("/history", () => {
  const student = requireStudent();
  if (!student) return;
  appShell.classList.remove("app-shell--auth");
  setActiveNav("#/history");
  renderQuizHistory(mainEl, { student, quizService, navigate: (h) => router.navigate(h) });
});

router.add("/study", () => {
  const student = requireStudent();
  if (!student) return;
  appShell.classList.remove("app-shell--auth");
  setActiveNav("#/study");
  renderStudyTracker(mainEl, {
    student, quizService, studyTrackerService,
    rerender: () => router.navigate("#/study"),
  });
});

router.add("/progress", () => {
  const student = requireStudent();
  if (!student) return;
  appShell.classList.remove("app-shell--auth");
  setActiveNav("#/progress");
  renderProgress(mainEl, { student, progressService });
});

router.notFound(() => router.navigate(authenticatedUser ? "#/dashboard" : "#/login"));

logoutButton.addEventListener("click", async () => {
  let message = "You have signed out.";
  try {
    await requestApi("/auth/logout", { method: "POST" });
  } catch (error) {
    if (error.status !== 401) {
      console.error("[Auth] Sign out request failed:", error.message);
      message = `Signed out on this device. ${error.message}`;
    }
  } finally {
    stopSession(message);
  }
});

async function bootstrap() {
  try {
    const session = await requestApi("/auth/session");
    startSession(session);
  } catch (error) {
    if (error.status !== 401) {
      sessionNotice = "Could not connect to the authentication server. Start the app with `npm start` and try again.";
      console.error("[Auth] Could not restore session:", error.message);
    }
  }
  if (!window.location.hash || window.location.hash === "#") {
    window.location.hash = authenticatedUser ? "#/dashboard" : "#/login";
  }
  router.start();
}

bootstrap();
