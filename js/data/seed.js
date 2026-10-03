import { Subject } from "../models/Subject.js";
import { Topic } from "../models/Topic.js";
import { Quiz } from "../models/Quiz.js";
import { Student } from "../models/Student.js";
import { StudyGoal } from "../models/StudyGoal.js";
import { StudySession } from "../models/StudySession.js";

const SCHEMA_VERSION = 2; // bump when seed data schema changes
const VERSION_KEY = "qsp:schema_version";

/**
 * seedIfEmpty — populates repositories with sample data.
 * Also handles schema migrations: if the stored version is below
 * SCHEMA_VERSION, quizzes are re-seeded so new fields (difficulty,
 * timeLimitSeconds) are present in localStorage.
 */
export function seedIfEmpty({
  subjects,
  topics,
  quizzes,
  students,
  sessions = null,
  goals = null,
  versionStore = globalThis.localStorage,
}) {
  if (!versionStore) throw new Error("A schema version store is required.");
  const storedVersion = Number(versionStore.getItem(VERSION_KEY) || "0");
  const isFirstRun = students.isEmpty();

  if (!isFirstRun && storedVersion >= SCHEMA_VERSION) {
    // Check if goals or sessions are empty, populate demo ones if so
    _seedGoalsAndSessionsIfEmpty({ sessions, goals });
    return;
  }

  if (storedVersion < SCHEMA_VERSION && !isFirstRun) {
    // Migrate: re-seed quizzes so they get difficulty and timeLimitSeconds
    quizzes.clear();
    console.info(`[seed] Migrating quiz schema to v${SCHEMA_VERSION}`);
  }

  students.save(new Student({
    id: "student_demo",
    name: "Mark",
    email: "mark@example.com",
    passwordHash: null,
    program: "BS Computer Science",
    gradeLevel: "3rd Year",
    currentStreak: 2,
    longestStreak: 5,
  }));

  const subjectDefs = [
    { id: "subj_prog", name: "Programming", color: "#2F5D50", description: "Core programming concepts and practice." },
    { id: "subj_db", name: "Databases", color: "#8A5A2B", description: "Relational design, SQL, and normalization." },
    { id: "subj_hci", name: "HCI", color: "#5B4B8A", description: "Human-computer interaction and usability." },
  ];
  subjectDefs.forEach((s) => subjects.save(new Subject(s)));

  const topicDefs = [
    { id: "top_prog_oop", subjectId: "subj_prog", name: "Object-Oriented Programming" },
    { id: "top_prog_ds", subjectId: "subj_prog", name: "Data Structures" },
    { id: "top_db_norm", subjectId: "subj_db", name: "Normalization" },
    { id: "top_db_sql", subjectId: "subj_db", name: "SQL Queries" },
    { id: "top_hci_usab", subjectId: "subj_hci", name: "Usability Heuristics" },
  ];
  topicDefs.forEach((t) => topics.save(new Topic(t)));

  const quizDefs = [
    {
      id: "quiz_oop_1", subjectId: "subj_prog", topicId: "top_prog_oop",
      title: "OOP Fundamentals", description: "Encapsulation, inheritance, polymorphism.",
      difficulty: "medium", timeLimitSeconds: 180,
      questions: [
        {
          id: "q1", topicId: "top_prog_oop",
          prompt: "Which principle means an object hides its internal state behind a public interface?",
          choices: [{ id: "a", text: "Inheritance" }, { id: "b", text: "Encapsulation" }, { id: "c", text: "Polymorphism" }, { id: "d", text: "Composition" }],
          correctChoiceId: "b",
          explanation: "Encapsulation restricts direct access to an object's data, exposing only what's needed through methods.",
        },
        {
          id: "q2", topicId: "top_prog_oop",
          prompt: "\"Prefer composing objects over inheriting from a base class\" describes which idea?",
          choices: [{ id: "a", text: "Composition over inheritance" }, { id: "b", text: "Single Responsibility" }, { id: "c", text: "Interface Segregation" }, { id: "d", text: "Abstraction" }],
          correctChoiceId: "a",
          explanation: "Composition over inheritance favors building behavior from smaller collaborating objects rather than deep class hierarchies.",
        },
        {
          id: "q3", topicId: "top_prog_oop",
          prompt: "A class that cannot be instantiated directly, only extended, is called:",
          choices: [{ id: "a", text: "Abstract class" }, { id: "b", text: "Interface" }, { id: "c", text: "Singleton" }, { id: "d", text: "Static class" }],
          correctChoiceId: "a",
          explanation: "Abstract classes define shared structure/behavior but require a subclass to be instantiated.",
        },
      ],
    },
    {
      id: "quiz_norm_1", subjectId: "subj_db", topicId: "top_db_norm",
      title: "Normalization Basics", description: "1NF through 3NF.",
      difficulty: "hard", timeLimitSeconds: 240,
      questions: [
        {
          id: "q1", topicId: "top_db_norm",
          prompt: "A table is in First Normal Form (1NF) when:",
          choices: [{ id: "a", text: "It has a foreign key" }, { id: "b", text: "All columns hold atomic, single values" }, { id: "c", text: "It has no primary key" }, { id: "d", text: "It's fully denormalized" }],
          correctChoiceId: "b",
          explanation: "1NF requires atomic column values and no repeating groups.",
        },
        {
          id: "q2", topicId: "top_db_norm",
          prompt: "Removing a partial dependency on part of a composite key achieves:",
          choices: [{ id: "a", text: "1NF" }, { id: "b", text: "2NF" }, { id: "c", text: "3NF" }, { id: "d", text: "BCNF" }],
          correctChoiceId: "b",
          explanation: "2NF eliminates partial dependencies on a composite primary key.",
        },
        {
          id: "q3", topicId: "top_db_norm",
          prompt: "A transitive dependency (non-key column depending on another non-key column) violates:",
          choices: [{ id: "a", text: "1NF" }, { id: "b", text: "2NF" }, { id: "c", text: "3NF" }, { id: "d", text: "None of these" }],
          correctChoiceId: "c",
          explanation: "3NF requires that non-key attributes depend only on the primary key, not on other non-key attributes.",
        },
      ],
    },
    {
      id: "quiz_usab_1", subjectId: "subj_hci", topicId: "top_hci_usab",
      title: "Nielsen's Heuristics", description: "Recognizing common usability heuristics.",
      difficulty: "easy", timeLimitSeconds: 120,
      questions: [
        {
          id: "q1", topicId: "top_hci_usab",
          prompt: "Showing a loading spinner during a slow action supports which heuristic?",
          choices: [{ id: "a", text: "Visibility of system status" }, { id: "b", text: "Error prevention" }, { id: "c", text: "Aesthetic design" }, { id: "d", text: "Flexibility" }],
          correctChoiceId: "a",
          explanation: "Visibility of system status means the system keeps users informed about what's happening.",
        },
        {
          id: "q2", topicId: "top_hci_usab",
          prompt: "Letting a user undo a delete action is an example of:",
          choices: [{ id: "a", text: "User control and freedom" }, { id: "b", text: "Consistency and standards" }, { id: "c", text: "Recognition over recall" }, { id: "d", text: "Minimalist design" }],
          correctChoiceId: "a",
          explanation: "User control and freedom gives people an emergency exit from unwanted actions, like undo.",
        },
      ],
    },
  ];
  quizDefs.forEach((q) => quizzes.save(new Quiz(q)));

  _seedGoalsAndSessionsIfEmpty({ sessions, goals });

  versionStore.setItem(VERSION_KEY, String(SCHEMA_VERSION));
}

function _seedGoalsAndSessionsIfEmpty({ sessions, goals }) {
  if (goals && goals.isEmpty()) {
    goals.save(new StudyGoal({
      id: "goal_demo_1",
      studentId: "student_demo",
      title: "Review Databases Normalization",
      subjectId: "subj_db",
      targetHours: 3,
      currentHours: 1.5,
      status: "active",
    }));
    goals.save(new StudyGoal({
      id: "goal_demo_2",
      studentId: "student_demo",
      title: "Master OOP Principles",
      subjectId: "subj_prog",
      targetHours: 2,
      currentHours: 2,
      status: "met",
    }));
  }

  if (sessions && sessions.isEmpty()) {
    const now = new Date();
    const todayStr = now.toISOString();
    sessions.save(new StudySession({
      id: "session_demo_1",
      studentId: "student_demo",
      subjectId: "subj_db",
      topicId: "top_db_norm",
      minutes: 45,
      notes: "Reviewed 1NF through 3NF rules and examples",
      date: todayStr,
    }));
    sessions.save(new StudySession({
      id: "session_demo_2",
      studentId: "student_demo",
      subjectId: "subj_prog",
      topicId: "top_prog_oop",
      minutes: 60,
      notes: "Studied encapsulation and composition patterns",
      date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    }));
  }
}
