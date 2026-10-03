import { StudySession } from "../models/StudySession.js";
import { StudyGoal } from "../models/StudyGoal.js";
import { makeId } from "../data/Database.js";
import { NotFoundError, ValidationError } from "../errors/AppErrors.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * StudyTrackerService — owns StudySessions, StudyGoals, and the
 * duration/streak/period math derived from them. Depends on UserService
 * only through the one hook (recordStudyDay) it needs — not the whole
 * student repository — keeping the service boundary narrow.
 */
export class StudyTrackerService {
  #sessions; #goals; #userService; #quizService;

  constructor({ sessions, goals, userService, quizService = null }) {
    if (!sessions || !goals || !userService) {
      throw new ValidationError("sessions, goals, and userService are required.");
    }
    this.#sessions = sessions;
    this.#goals = goals;
    this.#userService = userService;
    this.#quizService = quizService;
  }

  /**
   * Log a study session.
   * Accepts either { minutes } or { startTime, endTime } — duration is calculated automatically.
   * @param {string} studentId
   * @param {{ subjectId, topicId?, startTime?, endTime?, minutes?, notes?, date? }} opts
   */
  logSession(studentId, { subjectId, topicId = null, startTime = null, endTime = null, minutes = null, notes = "", date }) {
    this.#userService.getStudent(studentId);
    if (typeof subjectId !== "string" || !subjectId.trim()) {
      throw new ValidationError("subjectId is required.");
    }
    if (this.#quizService) {
      const subject = this.#quizService.getSubject(subjectId);
      if (!subject) throw new NotFoundError("Subject", subjectId);
      if (topicId) {
        const topic = this.#quizService.getTopic(topicId);
        if (!topic || topic.subjectId !== subjectId) {
          throw new ValidationError("topicId must belong to the selected subject.", [{ field: "topicId", issue: "Invalid subject relationship" }]);
        }
      }
    }
    if (typeof notes !== "string" || notes.length > 2000) {
      throw new ValidationError("notes must be a string of at most 2000 characters.");
    }
    const resolvedDate = date || (startTime ? startTime : new Date().toISOString());
    if (typeof resolvedDate !== "string" || Number.isNaN(Date.parse(resolvedDate))) {
      throw new ValidationError("date must be a valid ISO date or datetime.");
    }
    if (Boolean(startTime) !== Boolean(endTime)) {
      throw new ValidationError("startTime and endTime must be provided together.");
    }
    if (startTime && (typeof startTime !== "string" || typeof endTime !== "string" ||
        Number.isNaN(Date.parse(startTime)) || Number.isNaN(Date.parse(endTime)))) {
      throw new ValidationError("startTime and endTime must be valid dates.");
    }
    if (!startTime && (!Number.isFinite(Number(minutes)) || Number(minutes) <= 0)) {
      throw new ValidationError("minutes must be a positive finite number.");
    }
    const session = new StudySession({
      id: makeId("session"), studentId, subjectId, topicId,
      startTime, endTime, minutes, notes, date: resolvedDate,
    });
    this.#sessions.save(session);
    this.#userService.recordStudyDay(studentId, session.date);
    // Update any active subject goals
    this.#updateGoalProgress(studentId, subjectId, session.minutes);
    return session;
  }

  listSessions(studentId) {
    return this.#sessions
      .query((s) => s && s.studentId === studentId)
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }

  #minutesSince(studentId, since) {
    return this.listSessions(studentId)
      .filter((s) => new Date(s.date) >= since)
      .reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);
  }

  totalsFor(studentId) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday.getTime() - startOfToday.getDay() * DAY_MS);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      today: this.#minutesSince(studentId, startOfToday),
      week: this.#minutesSince(studentId, startOfWeek),
      month: this.#minutesSince(studentId, startOfMonth),
    };
  }

  // ---- Study Goals ----

  /**
   * Create or replace a study goal.
   * @param {string} studentId
   * @param {{ title, subjectId?, targetHours, targetDate? }} opts
   */
  createGoal(studentId, { title, subjectId = null, targetHours, targetDate = null }) {
    this.#userService.getStudent(studentId);
    if (typeof title !== "string" || !title.trim() || title.trim().length > 120) {
      throw new ValidationError("Goal title must contain 1 to 120 characters.");
    }
    if (!Number.isFinite(Number(targetHours)) || Number(targetHours) <= 0) {
      throw new ValidationError("targetHours must be a positive finite number.");
    }
    if (targetDate && (typeof targetDate !== "string" || Number.isNaN(Date.parse(targetDate)))) {
      throw new ValidationError("targetDate must be a valid date.");
    }
    if (subjectId && typeof subjectId !== "string") {
      throw new ValidationError("subjectId must be a string when provided.");
    }
    if (subjectId && this.#quizService && !this.#quizService.getSubject(subjectId)) {
      throw new NotFoundError("Subject", subjectId);
    }
    const goal = new StudyGoal({ id: makeId("goal"), studentId, title, subjectId, targetHours, targetDate });
    this.#goals.save(goal);
    return goal;
  }

  /**
   * Backward-compatible alias for Week 1 callers who use period + targetMinutes.
   */
  setGoal(studentId, opts) {
    if (opts.title || opts.targetHours) {
      return this.createGoal(studentId, opts);
    }
    const title = `${opts.period ? opts.period.charAt(0).toUpperCase() + opts.period.slice(1) : "Weekly"} Study Goal`;
    const targetHours = opts.targetMinutes ? Math.max(0.5, opts.targetMinutes / 60) : 2;
    return this.createGoal(studentId, { title, targetHours });
  }

  goalsFor(studentId) {
    return this.#goals.query((g) => g && g.studentId === studentId);
  }

  goalProgress(studentId) {
    const sessions = this.listSessions(studentId);
    return this.goalsFor(studentId).map((goal) => {
      // Compute minutes logged relevant to the goal (subject-scoped if set)
      const relevant = goal.subjectId
        ? sessions.filter((s) => s.subjectId === goal.subjectId)
        : sessions;
      const actualMinutes = relevant.reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);
      const progress = goal.progressToward(actualMinutes);
      return {
        goal,
        ...progress,
        status: progress.met ? "met" : goal.status,
      };
    });
  }

  /** Auto-update goal currentHours when a session is logged. */
  #updateGoalProgress(studentId, subjectId, minutes) {
    const goals = this.goalsFor(studentId).filter((g) => {
      if (g.status === "met") return false;
      return !g.subjectId || g.subjectId === subjectId;
    });
    goals.forEach((goal) => {
      const updated = goal.addHours((Number(minutes) || 0) / 60);
      this.#goals.save(updated);
    });
  }

  deleteGoal(goalId, studentId) {
    if (typeof goalId !== "string" || !goalId) throw new ValidationError("goalId is required.");
    if (!studentId) {
      this.#goals.delete(goalId);
      return;
    }
    this.#userService.getStudent(studentId);
    const goal = this.#goals.getById(goalId);
    if (!goal || goal.studentId !== studentId) throw new NotFoundError("StudyGoal", goalId);
    this.#goals.delete(goalId);
  }
}
