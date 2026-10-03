/**
 * QuizAnswer — a single answered question within a QuizAttempt.
 * Value-object-like: created once at grading time, never mutated after.
 */
export class QuizAnswer {
  #questionId; #chosenChoiceId; #correct;

  constructor({ questionId, chosenChoiceId, correct }) {
    this.#questionId = questionId;
    this.#chosenChoiceId = chosenChoiceId;
    this.#correct = correct;
  }

  get questionId() { return this.#questionId; }
  get chosenChoiceId() { return this.#chosenChoiceId; }
  get correct() { return this.#correct; }

  toJSON() {
    return { questionId: this.#questionId, chosenChoiceId: this.#chosenChoiceId, correct: this.#correct };
  }

  static fromJSON(data) { return new QuizAnswer(data); }
}
