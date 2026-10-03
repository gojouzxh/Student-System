import { DatabaseError } from "../errors/AppErrors.js";

/**
 * Repository — abstract base class (Abstraction / Interface-like contract).
 * Every concrete repository must implement these five methods. Services
 * depend on THIS shape, never on localStorage directly (Dependency
 * Inversion) — swapping in a real backend later means writing one new
 * subclass, not touching QuizService/StudyTrackerService/etc.
 */
export class Repository {
  all() { throw new Error("Not implemented"); }
  getById(id) { throw new Error("Not implemented"); }
  save(entity) { throw new Error("Not implemented"); }
  delete(id) { throw new Error("Not implemented"); }
  query(predicate) { throw new Error("Not implemented"); }
}

/**
 * LocalStorageRepository — a generic Repository backed by the browser's
 * localStorage, standing in for a real database table during this
 * milestone. `factory` turns a plain JSON row back into a domain object.
 */
export class LocalStorageRepository extends Repository {
  #collectionKey;
  #factory;

  constructor(collectionKey, factory) {
    super();
    this.#collectionKey = `qsp:${collectionKey}`;
    this.#factory = factory;
  }

  #readRaw() {
    try {
      const raw = localStorage.getItem(this.#collectionKey);
      const rows = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(rows)) {
        throw new TypeError(`Collection '${this.#collectionKey}' is not an array.`);
      }
      return rows;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      throw new DatabaseError(`Failed to read collection '${this.#collectionKey}'.`);
    }
  }

  #writeRaw(rows) {
    try {
      localStorage.setItem(this.#collectionKey, JSON.stringify(rows));
    } catch (err) {
      throw new DatabaseError(`Failed to save collection '${this.#collectionKey}'.`);
    }
  }

  all() {
    const raw = this.#readRaw();
    const result = [];
    for (const row of raw) {
      try {
        const entity = this.#factory(row);
        if (!entity) throw new TypeError("Repository factory returned no entity.");
        result.push(entity);
      } catch {
        throw new DatabaseError(`Collection '${this.#collectionKey}' contains an invalid record.`);
      }
    }
    return result;
  }

  getById(id) {
    if (!id) return null;
    const row = this.#readRaw().find((r) => r && r.id === id);
    if (!row) return null;
    try {
      return this.#factory(row);
    } catch (err) {
      throw new DatabaseError(`Record '${id}' in '${this.#collectionKey}' is invalid.`);
    }
  }

  query(predicate) {
    return this.all().filter(predicate);
  }

  save(entity) {
    const rows = this.#readRaw();
    const json = entity.toJSON();
    const idx = rows.findIndex((r) => r.id === json.id);
    if (idx >= 0) rows[idx] = json; else rows.push(json);
    this.#writeRaw(rows);
    return entity;
  }

  delete(id) {
    this.#writeRaw(this.#readRaw().filter((r) => r.id !== id));
  }

  isEmpty() {
    return this.#readRaw().length === 0;
  }

  clear() {
    this.#writeRaw([]);
  }
}

/** Simple incrementing id helper so seed data and new rows never collide. */
export function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
