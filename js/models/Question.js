import { Choice } from "./Choice.js";

/**
 * Question — a single multiple-choice item within a Quiz.
 * Composition: owns its Choice objects. Encapsulates the correct-answer
 * key so nothing outside this class can read it except via isCorrect().
 */
export class Question {
  #id; #topicId; #prompt; #choices; #correctChoiceId; #explanation;

  constructor({ id, topicId, prompt, choices, correctChoiceId, explanation = "" }) {
    this.#id = id;
    this.#topicId = topicId;
    this.#prompt = prompt;
    this.#choices = choices.map((c) => (c instanceof Choice ? c : new Choice(c)));
    this.#correctChoiceId = correctChoiceId;
    this.#explanation = explanation;
  }

  get id() { return this.#id; }
  get topicId() { return this.#topicId; }
  get prompt() { return this.#prompt; }
  get choices() { return [...this.#choices]; }
  get explanation() { return this.#explanation; }

  isCorrect(choiceId) {
    return choiceId === this.#correctChoiceId;
  }

  correctChoice() {
    return this.#choices.find((c) => c.id === this.#correctChoiceId);
  }

  toJSON() {
    return {
      id: this.#id,
      topicId: this.#topicId,
      prompt: this.#prompt,
      choices: this.#choices.map((c) => c.toJSON()),
      correctChoiceId: this.#correctChoiceId,
      explanation: this.#explanation,
    };
  }

  static fromJSON(data) { return new Question(data); }
}
