import pg from "pg";
import { DatabaseError, ValidationError } from "../js/errors/AppErrors.js";

export function createPool(connectionString) {
  const url = new URL(connectionString);
  url.searchParams.delete("channel_binding");
  const pool = new pg.Pool({
    connectionString: url.toString(),
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  });
  pool.on("error", (error) => console.error("[Database] Idle client error:", error.message));
  return pool;
}

export async function ensureSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS records (
      seq        BIGSERIAL,
      collection TEXT NOT NULL,
      id         TEXT NOT NULL,
      data       JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (collection, id)
    )
  `);
}

   export async function loadSnapshot(pool) {
     try {
       const result = await pool.query("SELECT collection, id, data FROM records ORDER BY seq");
       const snapshot = new Map();
       for (const row of result.rows) {
         if (!snapshot.has(row.collection)) snapshot.set(row.collection, new Map());
         snapshot.get(row.collection).set(row.id, row.data);
       }
       return snapshot;
     } catch (error) {
       console.error("[Database] Loading records failed:", error.message);
       throw new DatabaseError("Failed to load records from the database.");
     }
   }

export class PostgresRepository {
  #pool;
  #collection;
  #factory;
  #rows = new Map();
  #queue = Promise.resolve();

      constructor(pool, collectionName, factory, initialRows = null) {
       if (!/^[a-z][a-z0-9-]*$/.test(collectionName)) {
         throw new ValidationError("Invalid repository collection name.");
       }
       this.#pool = pool;
       this.#collection = collectionName;
       this.#factory = factory;
       if (initialRows) this.#rows = initialRows;
     }

  async load() {
    try {
      const result = await this.#pool.query(
        "SELECT id, data FROM records WHERE collection = $1 ORDER BY seq",
        [this.#collection],
      );
      this.#rows = new Map(result.rows.map((row) => [row.id, row.data]));
    } catch (error) {
      console.error(`[Database] Load of '${this.#collection}' failed:`, error.message);
      throw new DatabaseError(`Failed to load repository collection '${this.#collection}'.`);
    }
  }

  flush() {
    return this.#queue;
  }

  #enqueue(sql, params) {
    this.#queue = this.#queue
      .then(() => this.#pool.query(sql, params))
      .catch((error) => {
        console.error(`[Database] Write to '${this.#collection}' failed:`, error.message);
      });
  }

  #build(row) {
    try {
      return this.#factory(structuredClone(row));
    } catch {
      throw new DatabaseError(`Repository collection '${this.#collection}' contains an invalid record.`);
    }
  }

  all() {
    return [...this.#rows.values()].map((row) => this.#build(row));
  }

  getById(id) {
    if (!id) return null;
    const row = this.#rows.get(id);
    return row ? this.#build(row) : null;
  }

  query(predicate) {
    return this.all().filter(predicate);
  }

  save(entity) {
    if (!entity || typeof entity.toJSON !== "function") {
      throw new ValidationError("Repository records must implement toJSON().");
    }
    const json = structuredClone(entity.toJSON());
    if (typeof json.id !== "string" || json.id === "") {
      throw new ValidationError("Repository records must have a string id.");
    }
    this.#rows.set(json.id, json);
    this.#enqueue(
      `INSERT INTO records (collection, id, data) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [this.#collection, json.id, JSON.stringify(json)],
    );
    return entity;
  }

  delete(id) {
    if (this.#rows.delete(id)) {
      this.#enqueue("DELETE FROM records WHERE collection = $1 AND id = $2", [this.#collection, id]);
    }
  }

  isEmpty() {
    return this.#rows.size === 0;
  }

  clear() {
    this.#rows.clear();
    this.#enqueue("DELETE FROM records WHERE collection = $1", [this.#collection]);
  }
}