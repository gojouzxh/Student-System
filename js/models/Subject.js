/**
 * Subject — top-level academic category (e.g. "Databases").
 * Composition root: a Subject owns Topics; Topics own Quizzes.
 */
export class Subject {
  #id; #name; #description; #color;

  constructor({ id, name, description = "", color = "#2F5D50" }) {
    this.#id = id;
    this.#name = name;
    this.#description = description;
    this.#color = color;
  }

  get id() { return this.#id; }
  get name() { return this.#name; }
  get description() { return this.#description; }
  get color() { return this.#color; }

  toJSON() {
    return { id: this.#id, name: this.#name, description: this.#description, color: this.#color };
  }

  static fromJSON(data) { return new Subject(data); }
}
