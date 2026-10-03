/**
 * User — base account entity.
 * Abstraction: shared identity/auth concerns live here so subclasses
 * (Student, and future roles like Instructor/Admin) only add what differs.
 */
export class User {
  #id;
  #name;
  #username;
  #email;
  #passwordHash; // never store plaintext, even in a mock system
  #role;
  #isActive;
  #createdAt;

  constructor({
    id, name, username = null, email, passwordHash, role = "student",
    isActive = true, createdAt = new Date().toISOString(),
  }) {
    if (this.constructor === User) {
      throw new Error("User is abstract — instantiate Student (or another role) instead.");
    }
    this.#id = id;
    this.#name = name;
    this.#username = username;
    this.#email = email;
    this.#passwordHash = passwordHash;
    this.#role = role;
    this.#isActive = isActive;
    this.#createdAt = createdAt;
  }

  get id() { return this.#id; }
  get name() { return this.#name; }
  get username() { return this.#username; }
  get email() { return this.#email; }
  get role() { return this.#role; }
  get isActive() { return this.#isActive; }
  get createdAt() { return this.#createdAt; }

  renameTo(newName) {
    if (!newName || !newName.trim()) throw new Error("Name cannot be empty.");
    this.#name = newName.trim();
  }

  toJSON() {
    return {
      id: this.#id,
      name: this.#name,
      username: this.#username,
      email: this.#email,
      passwordHash: this.#passwordHash,
      role: this.#role,
      isActive: this.#isActive,
      createdAt: this.#createdAt,
    };
  }
}
