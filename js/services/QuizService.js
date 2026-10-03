/**
 * js/services/QuizService.js
 *
 * QuizService — manages Subjects, Topics, Quizzes, Questions, Choices,
 * and QuizAttempts with strict validation and standard application errors.
 */

import { QuizAttempt } from "../models/QuizAttempt.js";
import { Quiz } from "../models/Quiz.js";
import { Question } from "../models/Question.js";
import { Subject } from "../models/Subject.js";
import { Topic } from "../models/Topic.js";
import { makeId } from "../data/Database.js";
import {
  ValidationError,
  NotFoundError,
  InvalidQuizSubmissionError,
} from "../errors/AppErrors.js";

export class QuizService {
  #subjects;
  #topics;
  #quizzes;
  #attempts;
  #userService;

  constructor({ subjects, topics, quizzes, attempts, userService = null }) {
    if (!subjects || !topics || !quizzes || !attempts) {
      throw new ValidationError("All four repositories (subjects, topics, quizzes, attempts) are required.");
    }
    this.#subjects = subjects;
    this.#topics = topics;
    this.#quizzes = quizzes;
    this.#attempts = attempts;
    this.#userService = userService;
  }

  // ---- Subject management ----

  listSubjects() {
    return this.#subjects.all();
  }

  getSubject(id) {
    if (!id) return null;
    return this.#subjects.getById(id);
  }

  getSubjectOrThrow(id) {
    const subject = this.getSubject(id);
    if (!subject) throw new NotFoundError("Subject", id);
    return subject;
  }

  createSubject({ name, description = "", color = "#2F5D50" }) {
    if (!name || typeof name !== "string" || !name.trim()) {
      throw new ValidationError("Subject name is required and cannot be empty.", [{ field: "name", issue: "Required" }]);
    }
    const subject = new Subject({
      id: makeId("subj"),
      name: name.trim(),
      description: description || "",
      color: color || "#2F5D50",
    });
    this.#subjects.save(subject);
    return subject;
  }

  // ---- Topic management ----

  listTopics(subjectId) {
    if (!subjectId) return [];
    return this.#topics.query((t) => t.subjectId === subjectId);
  }

  getTopic(id) {
    if (!id) return null;
    return this.#topics.getById(id);
  }

  getTopicOrThrow(id) {
    const topic = this.getTopic(id);
    if (!topic) throw new NotFoundError("Topic", id);
    return topic;
  }

  listAllTopics() {
    return this.#topics.all();
  }

  createTopic({ subjectId, name, description = "" }) {
    if (!subjectId) {
      throw new ValidationError("subjectId is required to create a topic.", [{ field: "subjectId", issue: "Required" }]);
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      throw new ValidationError("Topic name is required.", [{ field: "name", issue: "Required" }]);
    }
    const subject = this.#subjects.getById(subjectId);
    if (!subject) {
      throw new NotFoundError("Subject", subjectId);
    }

    const topic = new Topic({
      id: makeId("top"),
      subjectId,
      name: name.trim(),
      description: description || "",
    });
    this.#topics.save(topic);
    return topic;
  }

  // ---- Quiz management ----

  listQuizzes(topicId) {
    if (!topicId) return [];
    return this.#quizzes.query((q) => q.topicId === topicId);
  }

  listAllQuizzes() {
    return this.#quizzes.all();
  }

  getQuiz(id) {
    if (!id) return null;
    return this.#quizzes.getById(id);
  }

  getQuizOrThrow(id) {
    const quiz = this.getQuiz(id);
    if (!quiz) throw new NotFoundError("Quiz", id);
    return quiz;
  }

  /**
   * Create a new quiz with metadata and questions.
   * @param {{ subjectId, topicId, title, description, difficulty, timeLimitSeconds, questions }} opts
   */
  createQuiz({ subjectId, topicId, title, description = "", difficulty = "medium", timeLimitSeconds = 0, questions = [] }) {
    const errors = [];
    if (typeof subjectId !== "string" || !subjectId.trim()) errors.push({ field: "subjectId", issue: "Required" });
    if (typeof topicId !== "string" || !topicId.trim()) errors.push({ field: "topicId", issue: "Required" });
    if (typeof title !== "string" || !title.trim()) errors.push({ field: "title", issue: "Required" });
    if (!Array.isArray(questions)) errors.push({ field: "questions", issue: "Must be an array" });
    if (!Number.isFinite(Number(timeLimitSeconds)) || Number(timeLimitSeconds) < 0) {
      errors.push({ field: "timeLimitSeconds", issue: "Must be a non-negative finite number" });
    }

    if (errors.length > 0) {
      throw new ValidationError("Missing required quiz fields.", errors);
    }

    const subject = this.#subjects.getById(subjectId);
    if (!subject) throw new NotFoundError("Subject", subjectId);

    const topic = this.#topics.getById(topicId);
    if (!topic) throw new NotFoundError("Topic", topicId);
    if (topic.subjectId !== subject.id) {
      throw new ValidationError("topicId must belong to subjectId.", [
        { field: "topicId", issue: "Topic belongs to a different subject" },
      ]);
    }

    // Validate difficulty
    if (difficulty && !["easy", "medium", "hard"].includes(difficulty)) {
      throw new ValidationError(`Invalid difficulty: '${difficulty}'. Allowed: easy, medium, hard.`);
    }

    // Stamped questions with clean IDs
    const stampedQuestions = questions.map((q, qIdx) => {
      if (!q || typeof q !== "object" || typeof q.prompt !== "string" || !q.prompt.trim()) {
        throw new ValidationError(`Question ${qIdx + 1} requires a non-empty prompt.`);
      }
      if (!Array.isArray(q.choices) || q.choices.length < 2) {
        throw new ValidationError(`Question ${qIdx + 1} requires at least two choices.`);
      }
      const choices = q.choices.map((choice, choiceIndex) => {
        const text = typeof choice === "string" ? choice.trim() : choice?.text;
        if (typeof text !== "string" || !text.trim()) {
          throw new ValidationError(`Question ${qIdx + 1}, choice ${choiceIndex + 1} requires non-empty text.`);
        }
        return { id: typeof choice === "object" && choice.id ? choice.id : makeId("ch"), text: text.trim() };
      });

      // Determine correct choice ID
      let correctChoiceId = q.correctChoiceId;
      if (!correctChoiceId && q.correctChoiceIndex !== undefined && choices[q.correctChoiceIndex]) {
        correctChoiceId = choices[q.correctChoiceIndex].id;
      }
      if (!correctChoiceId || !choices.some((choice) => choice.id === correctChoiceId)) {
        throw new ValidationError(`Question ${qIdx + 1} must identify a correct choice that belongs to the question.`);
      }

      return {
        id: q.id || makeId("q"),
        topicId,
        prompt: qPrompt,
        choices,
        correctChoiceId,
        explanation: q.explanation || "",
      };
    });

    const quiz = new Quiz({
      id: makeId("quiz"),
      subjectId,
      topicId,
      title: title.trim(),
      description: description || "",
      difficulty: difficulty || "medium",
      timeLimitSeconds: Number(timeLimitSeconds),
      questions: stampedQuestions,
    });

    this.#quizzes.save(quiz);
    return quiz;
  }

  /**
   * Add a question to an existing quiz.
   * @param {string} quizId
   * @param {{ prompt: string, choices: Array, correctChoiceIndex: number, explanation?: string }} opts
   */
  addQuestion(quizId, { prompt, choices = [], correctChoiceIndex = 0, explanation = "" }) {
    const quiz = this.getQuizOrThrow(quizId);

    if (typeof prompt !== "string" || !prompt.trim()) {
      throw new ValidationError("Question prompt is required.");
    }
    if (!Array.isArray(choices) || choices.length < 2) {
      throw new ValidationError("A question must have at least 2 choices.");
    }
    if (!Number.isInteger(correctChoiceIndex) || correctChoiceIndex < 0 || correctChoiceIndex >= choices.length) {
      throw new ValidationError(`correctChoiceIndex (${correctChoiceIndex}) is out of bounds for ${choices.length} choices.`);
    }

    const choiceObjs = choices.map((choice, index) => {
      const text = typeof choice === "string" ? choice.trim() : choice?.text;
      if (typeof text !== "string" || !text.trim()) {
        throw new ValidationError(`Choice ${index + 1} requires non-empty text.`);
      }
      return { id: makeId("ch"), text: text.trim() };
    });

    const correctChoiceId = choiceObjs[correctChoiceIndex].id;

    const question = new Question({
      id: makeId("q"),
      topicId: quiz.topicId,
      prompt: prompt.trim(),
      choices: choiceObjs,
      correctChoiceId,
      explanation: explanation || "",
    });

    const updatedQuiz = new Quiz({
      ...quiz.toJSON(),
      questions: [...quiz.questions.map((q) => q.toJSON()), question.toJSON()],
    });

    this.#quizzes.save(updatedQuiz);
    return { quiz: updatedQuiz, question };
  }

  // ---- Quiz taking & submission ----

  /**
   * Submits a quiz attempt with full structure and identity validation.
   *
   * @param {string} studentId
   * @param {string} quizId
   * @param {Map<string,string>|Object} answers - questionId -> choiceId
   * @param {number} [timeTakenSeconds=0]
   * @returns {{ attempt: QuizAttempt, breakdown: Array }}
   */
  submitAttempt(studentId, quizId, answers, timeTakenSeconds = 0) {
    if (!studentId || typeof studentId !== "string") {
      throw new ValidationError("studentId is required for quiz submission.");
    }
    if (!quizId || typeof quizId !== "string") {
      throw new ValidationError("quizId is required for quiz submission.");
    }
    if (this.#userService) this.#userService.getStudent(studentId);

    const quiz = this.#quizzes.getById(quizId);
    if (!quiz) {
      throw new NotFoundError("Quiz", quizId);
    }

    // Convert answers to Map if plain object
    if (!(answers instanceof Map) && (!answers || typeof answers !== "object" || Array.isArray(answers))) {
      throw new InvalidQuizSubmissionError("answers must be an object mapping question IDs to choice IDs.");
    }
    const answersMap = answers instanceof Map ? new Map(answers) : new Map(Object.entries(answers));
    if (answersMap.size > quiz.questions.length) {
      throw new InvalidQuizSubmissionError("The submission contains more answers than the quiz has questions.");
    }
    for (const [questionId, choiceId] of answersMap) {
      if (typeof questionId !== "string" || !questionId ||
          (choiceId !== null && (typeof choiceId !== "string" || !choiceId))) {
        throw new InvalidQuizSubmissionError("Each answer must map a question ID to a choice ID or null.");
      }
    }
    if (quiz.questions.length === 0) {
      throw new InvalidQuizSubmissionError("A quiz with no questions cannot be submitted.");
    }

    // Structural validation of submitted question IDs
    const quizQuestionMap = new Map(quiz.questions.map((q) => [q.id, q]));
    for (const [qId, chosenChoiceId] of answersMap.entries()) {
      const q = quizQuestionMap.get(qId);
      if (!q) {
        throw new InvalidQuizSubmissionError(
          `Question ID '${qId}' does not belong to Quiz '${quiz.title}'.`,
          { submittedQuestionId: qId, quizId }
        );
      }
      if (chosenChoiceId) {
        const choiceExists = q.choices.some((c) => c.id === chosenChoiceId);
        if (!choiceExists) {
          throw new InvalidQuizSubmissionError(
            `Choice ID '${chosenChoiceId}' is not a valid choice for question '${qId}'.`,
            { questionId: qId, invalidChoiceId: chosenChoiceId }
          );
        }
      }
    }

    const sanitizedTime = Number(timeTakenSeconds);
    if (!Number.isFinite(sanitizedTime) || sanitizedTime < 0) {
      throw new InvalidQuizSubmissionError("timeTakenSeconds must be a non-negative finite number.");
    }
    const { score, total, percentage, breakdown, timeTakenSeconds: gradeTime } = quiz.grade(answersMap, sanitizedTime);

    const attempt = new QuizAttempt({
      id: makeId("attempt"),
      studentId,
      quizId,
      subjectId: quiz.subjectId,
      topicId: quiz.topicId,
      answers: breakdown.map((b) => ({
        questionId: b.questionId,
        chosenChoiceId: b.chosenId,
        correct: b.correct,
      })),
      score,
      total,
      percentage,
      timeTakenSeconds: Math.round(gradeTime),
      takenAt: new Date().toISOString(),
    });

    this.#attempts.save(attempt);
    return { attempt, breakdown };
  }

  listAttempts(studentId) {
    if (!studentId) return [];
    return this.#attempts
      .query((a) => a && a.studentId === studentId)
      .sort((a, b) => new Date(b.takenAt || 0) - new Date(a.takenAt || 0));
  }

  getAttempt(id) {
    if (!id) return null;
    return this.#attempts.getById(id);
  }

  getAttemptOrThrow(id) {
    const attempt = this.getAttempt(id);
    if (!attempt) throw new NotFoundError("QuizAttempt", id);
    return attempt;
  }
}
