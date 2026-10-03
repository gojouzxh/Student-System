import { QuizAnswer } from "./QuizAnswer.js";

/**
 * QuizAttempt — the record of one student taking one Quiz once.
 * Composition: owns a list of QuizAnswer. This is what QuizService
 * persists after Quiz.grade() computes the result.
 */
export class QuizAttempt {
  #id; #studentId; #quizId; #subjectId; #topicId; #answers;
  #score; #total; #percentage; #timeTakenSeconds; #takenAt;

  constructor({ id, studentId, quizId, subjectId, topicId, answers, score, total, percentage,
                timeTakenSeconds = 0, takenAt = new Date().toISOString() }) {
    this.#id = id;
    this.#studentId = studentId;
    this.#quizId = quizId;
    this.#subjectId = subjectId;
    this.#topicId = topicId;
    this.#answers = answers.map((a) => (a instanceof QuizAnswer ? a : new QuizAnswer(a)));
    this.#score = score;
    this.#total = total;
    this.#percentage = percentage;
    this.#timeTakenSeconds = Math.max(0, Number(timeTakenSeconds) || 0);
    this.#takenAt = takenAt;
  }

  get id() { return this.#id; }
  get studentId() { return this.#studentId; }
  get quizId() { return this.#quizId; }
  get subjectId() { return this.#subjectId; }
  get topicId() { return this.#topicId; }
  get answers() { return [...this.#answers]; }
  get score() { return this.#score; }
  get total() { return this.#total; }
  get percentage() { return this.#percentage; }
  get timeTakenSeconds() { return this.#timeTakenSeconds; }
  get takenAt() { return this.#takenAt; }

  incorrectAnswers() {
    return this.#answers.filter((a) => !a.correct);
  }

  /** Human-readable "Xm Ys" from seconds */
  formattedTime() {
    const m = Math.floor(this.#timeTakenSeconds / 60);
    const s = this.#timeTakenSeconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  /** Performance label based on percentage */
  performanceSummary() {
    const p = this.#percentage;
    if (p >= 90) return "Excellent";
    if (p >= 75) return "Good";
    if (p >= 60) return "Satisfactory";
    if (p >= 40) return "Needs improvement";
    return "Keep practicing";
  }

  toJSON() {
    return {
      id: this.#id, studentId: this.#studentId, quizId: this.#quizId,
      subjectId: this.#subjectId, topicId: this.#topicId,
      answers: this.#answers.map((a) => a.toJSON()),
      score: this.#score, total: this.#total, percentage: this.#percentage,
      timeTakenSeconds: this.#timeTakenSeconds, takenAt: this.#takenAt,
    };
  }

  static fromJSON(data) { return new QuizAttempt(data); }
}

