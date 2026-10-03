import { User } from "./User.js";

/**
 * Student — the only concrete User role this milestone needs.
 * Inheritance: reuses identity/auth from User, adds academic profile data.
 */
export class Student extends User {
  #gradeLevel;
  #program;
  #currentStreak;
  #longestStreak;
  #lastStudyDate;

  constructor({ id, name, username = null, email, passwordHash, isActive = true, gradeLevel = null, program = null,
                currentStreak = 0, longestStreak = 0, lastStudyDate = null, createdAt }) {
    super({ id, name, username, email, passwordHash, role: "student", isActive, createdAt });
    this.#gradeLevel = gradeLevel;
    this.#program = program;
    this.#currentStreak = currentStreak;
    this.#longestStreak = longestStreak;
    this.#lastStudyDate = lastStudyDate;
  }

  get gradeLevel() { return this.#gradeLevel; }
  get program() { return this.#program; }
  get currentStreak() { return this.#currentStreak; }
  get longestStreak() { return this.#longestStreak; }
  get lastStudyDate() { return this.#lastStudyDate; }

  /** Called by StudyTrackerService whenever a new study session lands. */
  registerStudyDay(isoDate) {
    const day = isoDate.slice(0, 10);
    if (this.#lastStudyDate === day) return; // already counted today

    const yesterday = new Date(day);
    yesterday.setDate(yesterday.getDate() - 1);
    const wasYesterday = this.#lastStudyDate === yesterday.toISOString().slice(0, 10);

    this.#currentStreak = wasYesterday ? this.#currentStreak + 1 : 1;
    this.#longestStreak = Math.max(this.#longestStreak, this.#currentStreak);
    this.#lastStudyDate = day;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      gradeLevel: this.#gradeLevel,
      program: this.#program,
      currentStreak: this.#currentStreak,
      longestStreak: this.#longestStreak,
      lastStudyDate: this.#lastStudyDate,
    };
  }

  static fromJSON(data) {
    return new Student(data);
  }
}
