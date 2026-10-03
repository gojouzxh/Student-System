import path from "node:path";
import { fileURLToPath } from "node:url";
import { JsonFileRepository } from "../js/data/JsonFileRepository.js";
import { seedIfEmpty } from "../js/data/seed.js";
import { QuizAttempt } from "../js/models/QuizAttempt.js";
import { Quiz } from "../js/models/Quiz.js";
import { Student } from "../js/models/Student.js";
import { StudyGoal } from "../js/models/StudyGoal.js";
import { StudySession } from "../js/models/StudySession.js";
import { Subject } from "../js/models/Subject.js";
import { Topic } from "../js/models/Topic.js";
import { ProgressService } from "../js/services/ProgressService.js";
import { QuizService } from "../js/services/QuizService.js";
import { StudyTrackerService } from "../js/services/StudyTrackerService.js";
import { UserService } from "../js/services/UserService.js";
import { AuthService } from "./AuthService.js";

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function createPlatform({ dataDirectory, authOptions = {} }) {
  const repositories = {
    students: new JsonFileRepository(dataDirectory, "students", Student.fromJSON),
    subjects: new JsonFileRepository(dataDirectory, "subjects", Subject.fromJSON),
    topics: new JsonFileRepository(dataDirectory, "topics", Topic.fromJSON),
    quizzes: new JsonFileRepository(dataDirectory, "quizzes", Quiz.fromJSON),
    attempts: new JsonFileRepository(dataDirectory, "attempts", QuizAttempt.fromJSON),
    sessions: new JsonFileRepository(dataDirectory, "sessions", StudySession.fromJSON),
    goals: new JsonFileRepository(dataDirectory, "goals", StudyGoal.fromJSON),
  };

  if (repositories.students.isEmpty()) {
    seedIfEmpty({
      ...repositories,
      versionStore: { getItem: () => null, setItem: () => {} },
    });
  }

  const userService = new UserService({ students: repositories.students });
  const authService = new AuthService({ ...authOptions, userService });
  const quizService = new QuizService({ ...repositories, userService });
  const studyTrackerService = new StudyTrackerService({
    sessions: repositories.sessions,
    goals: repositories.goals,
    userService,
    quizService,
  });
  const progressService = new ProgressService({ userService, quizService, studyTrackerService });

  return {
    repositories,
    services: { authService, userService, quizService, studyTrackerService, progressService },
  };
}
