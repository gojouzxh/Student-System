/**
 * ProgressRecord — a derived snapshot for one Subject, combining quiz
 * performance and study time. Produced by ProgressService; nothing else
 * writes these, so "how is the student doing" has one source of truth.
 */
export class ProgressRecord {
  #subjectId; #averageScore; #attemptCount; #studyMinutes; #weakTopicIds;

  constructor({ subjectId, averageScore, attemptCount, studyMinutes, weakTopicIds = [] }) {
    this.#subjectId = subjectId;
    this.#averageScore = averageScore;
    this.#attemptCount = attemptCount;
    this.#studyMinutes = studyMinutes;
    this.#weakTopicIds = weakTopicIds;
  }

  get subjectId() { return this.#subjectId; }
  get averageScore() { return this.#averageScore; }
  get attemptCount() { return this.#attemptCount; }
  get studyMinutes() { return this.#studyMinutes; }
  get weakTopicIds() { return [...this.#weakTopicIds]; }

  toJSON() {
    return {
      subjectId: this.#subjectId, averageScore: this.#averageScore,
      attemptCount: this.#attemptCount, studyMinutes: this.#studyMinutes,
      weakTopicIds: this.#weakTopicIds,
    };
  }
}
