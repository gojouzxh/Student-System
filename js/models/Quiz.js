import { Question } from "./Question.js";

/**
 * Quiz — an ordered set of Questions scoped to a Subject/Topic.
 * grade() is the one place quiz scoring happens (Single Responsibility);
 * QuizService orchestrates persistence, this class owns the math.
 */
export class Quiz {
  #id; #subjectId; #topicId; #title; #description; #difficulty; #timeLimitSeconds; #questions;

  static DIFFICULTY = Object.freeze({ easy: "easy", medium: "medium", hard: "hard" });

  constructor({ id, subjectId, topicId, title, description = "", difficulty = "medium", timeLimitSeconds = 0, questions = [] }) {
    if (!Quiz.DIFFICULTY[difficulty]) throw new Error(`Unknown difficulty: ${difficulty}`);
    this.#id = id;
    this.#subjectId = subjectId;
    this.#topicId = topicId;
    this.#title = title;
    this.#description = description;
    this.#difficulty = difficulty;
    this.#timeLimitSeconds = Math.max(0, Number(timeLimitSeconds) || 0);
    this.#questions = questions.map((q) => (q instanceof Question ? q : new Question(q)));
  }

  get id() { return this.#id; }
  get subjectId() { return this.#subjectId; }
  get topicId() { return this.#topicId; }
  get title() { return this.#title; }
  get description() { return this.#description; }
  get difficulty() { return this.#difficulty; }
  get timeLimitSeconds() { return this.#timeLimitSeconds; }
  get questions() { return [...this.#questions]; }
  get questionCount() { return this.#questions.length; }

  /**
   * @param {Map<string,string>} answersByQuestionId
   * @param {number} [timeTakenSeconds] — wall-clock seconds the student spent
   * @returns {{ score:number, total:number, percentage:number, breakdown:Array, timeTakenSeconds:number }}
   */
  grade(answersByQuestionId, timeTakenSeconds = 0) {
    const breakdown = this.#questions.map((q) => {
      const chosenId = answersByQuestionId.get(q.id) ?? null;
      const correct = chosenId !== null && q.isCorrect(chosenId);
      return {
        questionId: q.id,
        prompt: q.prompt,
        chosenId,
        correct,
        correctChoiceId: q.correctChoice()?.id ?? null,
        explanation: q.explanation,
      };
    });
    const score = breakdown.filter((b) => b.correct).length;
    const total = this.#questions.length;
    return {
      score,
      total,
      percentage: total ? Math.round((score / total) * 100) : 0,
      breakdown,
      timeTakenSeconds: Math.max(0, Math.round(timeTakenSeconds)),
    };
  }

  toJSON() {
    return {
      id: this.#id,
      subjectId: this.#subjectId,
      topicId: this.#topicId,
      title: this.#title,
      description: this.#description,
      difficulty: this.#difficulty,
      timeLimitSeconds: this.#timeLimitSeconds,
      questions: this.#questions.map((q) => q.toJSON()),
    };
  }

  static fromJSON(data) { return new Quiz(data); }
}
