/**
 * Topic — a subdivision of a Subject (e.g. "Normalization" under "Databases").
 * Holds the foreign key to its Subject rather than a live reference,
 * matching how it will be persisted.
 */
export class Topic {
  #id; #subjectId; #name; #description;

  constructor({ id, subjectId, name, description = "" }) {
    this.#id = id;
    this.#subjectId = subjectId;
    this.#name = name;
    this.#description = description;
  }

  get id() { return this.#id; }
  get subjectId() { return this.#subjectId; }
  get name() { return this.#name; }
  get description() { return this.#description; }

  toJSON() {
    return { id: this.#id, subjectId: this.#subjectId, name: this.#name, description: this.#description };
  }

  static fromJSON(data) { return new Topic(data); }
}
