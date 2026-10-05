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

   export function createPlatform({ dataDirectory, authOptions = {}, repositoryFactory = null }) {
     const make = repositoryFactory
       || ((name, factory) => new JsonFileRepository(dataDirectory, name, factory));
     const repositories = {
       students: make("students", Student.fromJSON),
       subjects: make("subjects", Subject.fromJSON),
       topics: make("topics", Topic.fromJSON),
       quizzes: make("quizzes", Quiz.fromJSON),
       attempts: make("attempts", QuizAttempt.fromJSON),
       sessions: make("sessions", StudySession.fromJSON),
       goals: make("goals", StudyGoal.fromJSON),
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
