import fs from "node:fs";
import path from "node:path";
import { DatabaseError, ValidationError } from "../errors/AppErrors.js";

export class JsonFileRepository {
  #filePath;
  #factory;

  constructor(dataDirectory, collectionName, factory) {
    if (!/^[a-z][a-z0-9-]*$/.test(collectionName)) {
      throw new ValidationError("Invalid repository collection name.");
    }
    this.#filePath = path.join(dataDirectory, `${collectionName}.json`);
    this.#factory = factory;
  }

  #readRaw() {
    try {
      const raw = fs.readFileSync(this.#filePath, "utf8");
      const rows = JSON.parse(raw);
      if (!Array.isArray(rows)) throw new TypeError("Collection data must be an array.");
      return rows;
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw new DatabaseError(`Failed to read repository collection '${path.basename(this.#filePath, ".json")}'.`);
    }
  }

  #writeRaw(rows) {
    const temporaryPath = `${this.#filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      fs.mkdirSync(path.dirname(this.#filePath), { recursive: true });
      fs.writeFileSync(temporaryPath, JSON.stringify(rows), { encoding: "utf8", mode: 0o600 });
      fs.renameSync(temporaryPath, this.#filePath);
    } catch {
      throw new DatabaseError(`Failed to save repository collection '${path.basename(this.#filePath, ".json")}'.`);
    }
  }

  all() {
    return this.#readRaw().map((row) => {
      try {
        return this.#factory(row);
      } catch {
        throw new DatabaseError(`Repository collection '${path.basename(this.#filePath, ".json")}' contains an invalid record.`);
      }
    });
  }

  getById(id) {
    if (!id) return null;
    const row = this.#readRaw().find((entry) => entry && entry.id === id);
    if (!row) return null;
    try {
      return this.#factory(row);
    } catch {
      throw new DatabaseError(`Record '${id}' in '${path.basename(this.#filePath, ".json")}' is invalid.`);
    }
  }

  query(predicate) {
    return this.all().filter(predicate);
  }

  save(entity) {
    if (!entity || typeof entity.toJSON !== "function") {
      throw new ValidationError("Repository records must implement toJSON().");
    }
    const rows = this.#readRaw();
    const json = entity.toJSON();
    const index = rows.findIndex((row) => row && row.id === json.id);
    if (index === -1) rows.push(json);
    else rows[index] = json;
    this.#writeRaw(rows);
    return entity;
  }

  delete(id) {
    this.#writeRaw(this.#readRaw().filter((row) => row.id !== id));
  }

  isEmpty() {
    return this.#readRaw().length === 0;
  }

  clear() {
    this.#writeRaw([]);
  }
}
