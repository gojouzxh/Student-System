/**
 * Choice — one selectable answer option belonging to a Question.
 * Kept intentionally dumb: correctness lives on the Question so grading
 * logic has a single place to live (Single Responsibility).
 */
export class Choice {
  #id; #text;

  constructor({ id, text }) {
    this.#id = id;
    this.#text = text;
  }

  get id() { return this.#id; }
  get text() { return this.#text; }

  toJSON() { return { id: this.#id, text: this.#text }; }

  static fromJSON(data) { return new Choice(data); }
}
