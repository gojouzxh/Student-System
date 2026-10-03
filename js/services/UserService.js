import { Student } from "../models/Student.js";
import { NotFoundError, ValidationError } from "../errors/AppErrors.js";

/**
 * UserService — owns Student accounts, profile info, and study streaks.
 */
export class UserService {
  #students;

  constructor({ students }) {
    if (!students) throw new ValidationError("students repository is required.");
    this.#students = students;
  }

  getStudent(studentId) {
    if (!studentId || typeof studentId !== "string") {
      throw new ValidationError("studentId is required.");
    }
    const student = this.#students.getById(studentId);
    if (!student) throw new NotFoundError("Student", studentId);
    return student;
  }

  currentStudent(studentId = "student_demo") {
    return this.#students.getById(studentId) || this.#createDemoStudent(studentId);
  }

  syncAuthenticatedStudent(account) {
    if (!account || typeof account.id !== "string" || account.role !== "student") {
      throw new ValidationError("A valid authenticated student is required.");
    }
    const existing = this.#students.getById(account.id);
    const student = new Student({
      ...existing?.toJSON(),
      ...account,
      passwordHash: existing?.toJSON().passwordHash ?? null,
    });
    this.#students.save(student);
    return student;
  }

  #createDemoStudent(studentId) {
    if (studentId !== "student_demo") throw new NotFoundError("Student", studentId);
    const student = new Student({
      id: "student_demo",
      name: "Mark",
      email: "mark@example.com",
      passwordHash: null,
      program: "BS Computer Science",
      gradeLevel: "3rd Year",
    });
    this.#students.save(student);
    return student;
  }

  findAccount(identifier) {
    const normalizedIdentifier = identifier.trim().toLocaleLowerCase("en-US");
    return this.#students.query((student) =>
      student.email.toLocaleLowerCase("en-US") === normalizedIdentifier ||
      student.username?.toLocaleLowerCase("en-US") === normalizedIdentifier,
    )[0] || null;
  }

  findByEmail(email) {
    const normalizedEmail = email.trim().toLocaleLowerCase("en-US");
    return this.#students.query((student) =>
      student.email.toLocaleLowerCase("en-US") === normalizedEmail,
    )[0] || null;
  }

  saveStudent(student) {
    return this.#students.save(student);
  }

  updateProfile(studentId, { name }) {
    const student = this.getStudent(studentId);
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        throw new ValidationError("Name cannot be empty.", [{ field: "name", issue: "Required" }]);
      }
      student.renameTo(name.trim());
    }
    this.#students.save(student);
    return student;
  }

  /** Called by StudyTrackerService after logging a session, to keep streaks in sync. */
  recordStudyDay(studentId, isoDate) {
    const student = this.getStudent(studentId);
    if (typeof isoDate !== "string" || Number.isNaN(Date.parse(isoDate))) {
      throw new ValidationError("isoDate must be a valid date.");
    }
    student.registerStudyDay(isoDate);
    this.#students.save(student);
  }
}
