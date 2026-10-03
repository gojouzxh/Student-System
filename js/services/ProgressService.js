/**
 * js/services/ProgressService.js
 *
 * ProgressService integrates User Service, Quiz Service, and Study Tracker Service
 * to synthesize academic progress, study analytics, and rule-based weak topic detection.
 *
 * Service Integration:
 *   User Service ---> Quiz Service ---------> Progress Service
 *   User Service ---> Study Tracker Service -> Progress Service
 */

import { ProgressRecord } from "../models/ProgressRecord.js";
import { ValidationError } from "../errors/AppErrors.js";

const WEAK_TOPIC_THRESHOLD = 70; // percentage below which a topic triggers 'Needs Review'
const MIN_WEAK_TOPIC_ATTEMPTS = 2;

export class ProgressService {
  #userService;
  #quizService;
  #studyTrackerService;

  constructor({ userService = null, quizService, studyTrackerService }) {
    if (!quizService) throw new ValidationError("quizService is required for ProgressService.");
    if (!studyTrackerService) throw new ValidationError("studyTrackerService is required for ProgressService.");
    this.#userService = userService;
    this.#quizService = quizService;
    this.#studyTrackerService = studyTrackerService;
  }

  /**
   * Calculates overall quiz performance metrics across all attempts.
   * @param {string} studentId
   * @returns {{ averageScore: number, highestScore: number, lowestScore: number, totalQuizzes: number, correctAnswers: number, incorrectAnswers: number }}
   */
  getQuizPerformance(studentId) {
    if (!studentId) throw new ValidationError("studentId is required.");
    const attempts = this.#quizService.listAttempts(studentId);
    const totalQuizzes = attempts.length;

    if (totalQuizzes === 0) {
      return {
        averageScore: 0,
        highestScore: 0,
        lowestScore: 0,
        totalQuizzes: 0,
        correctAnswers: 0,
        incorrectAnswers: 0,
      };
    }

    const scores = attempts.map((a) => a.percentage);
    const averageScore = Math.round(scores.reduce((sum, s) => sum + s, 0) / totalQuizzes);
    const highestScore = Math.max(...scores);
    const lowestScore = Math.min(...scores);
    const correctAnswers = attempts.reduce((sum, a) => sum + (Number(a.score) || 0), 0);
    const totalQuestions = attempts.reduce((sum, a) => sum + (Number(a.total) || 0), 0);
    const incorrectAnswers = Math.max(0, totalQuestions - correctAnswers);

    return {
      averageScore,
      highestScore,
      lowestScore,
      totalQuizzes,
      correctAnswers,
      incorrectAnswers,
    };
  }

  /**
   * Calculates study performance metrics including streaks and goal completion.
   * @param {string} studentId
   * @returns {{ totalStudyTime: number, dailyStudyTime: number, weeklyStudyTime: number, monthlyStudyTime: number, studyStreak: number, goalCompletion: { totalGoals: number, metGoals: number, percentage: number } }}
   */
  getStudyPerformance(studentId) {
    if (!studentId) throw new ValidationError("studentId is required.");
    const totals = this.#studyTrackerService.totalsFor(studentId);
    const sessions = this.#studyTrackerService.listSessions(studentId);
    const totalStudyTime = sessions.reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);

    const student = this.#userService?.getStudent ? this.#userService.getStudent(studentId) : null;
    const studyStreak = student?.currentStreak || 0;

    const goals = this.#studyTrackerService.goalsFor(studentId);
    const totalGoals = goals.length;
    const metGoals = goals.filter((g) => g.status === "met" || (Number(g.currentHours) || 0) >= (Number(g.targetHours) || 1)).length;
    const goalPercentage = totalGoals > 0 ? Math.round((metGoals / totalGoals) * 100) : 0;

    return {
      totalStudyTime,
      dailyStudyTime: totals.today || 0,
      weeklyStudyTime: totals.week || 0,
      monthlyStudyTime: totals.month || 0,
      studyStreak,
      goalCompletion: {
        totalGoals,
        metGoals,
        percentage: goalPercentage,
      },
    };
  }

  /**
   * Calculates subject performance combining quiz scores, attempts, and study duration.
   * @param {string} studentId
   * @returns {Array<{ subject: object, record: ProgressRecord }>}
   */
  subjectProgress(studentId) {
    if (!studentId) throw new ValidationError("studentId is required.");
    const attempts = this.#quizService.listAttempts(studentId);
    const sessions = this.#studyTrackerService.listSessions(studentId);

    return this.#quizService.listSubjects().map((subject) => {
      const subjectAttempts = attempts.filter((a) => a.subjectId === subject.id);
      const averageScore = subjectAttempts.length
        ? Math.round(subjectAttempts.reduce((sum, a) => sum + a.percentage, 0) / subjectAttempts.length)
        : 0;
      const studyMinutes = sessions
        .filter((s) => s.subjectId === subject.id)
        .reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);
      const weakTopicIds = this.#weakTopicsFor(subjectAttempts);

      return {
        subject,
        record: new ProgressRecord({
          subjectId: subject.id,
          averageScore,
          attemptCount: subjectAttempts.length,
          studyMinutes,
          weakTopicIds,
        }),
      };
    });
  }

  /**
   * Internal helper to find weak topic IDs for a subject based on recorded quiz attempts.
   */
  #weakTopicsFor(subjectAttempts) {
    const byTopic = new Map();
    subjectAttempts.forEach((a) => {
      if (!byTopic.has(a.topicId)) byTopic.set(a.topicId, []);
      byTopic.get(a.topicId).push(a.percentage);
    });
    const weak = [];
    byTopic.forEach((scores, topicId) => {
      const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
      if (scores.length >= MIN_WEAK_TOPIC_ATTEMPTS && avg < WEAK_TOPIC_THRESHOLD) weak.push(topicId);
    });
    return weak;
  }

  /**
   * Rule-based Weak Topic Detection:
   * Identifies topics where the student's average score is below the 70% threshold.
   * Based strictly on recorded quiz results and deterministic system rules (no unsupported assumptions).
   *
   * @param {string} studentId
   * @returns {Array<{ subject: object, topic: object, averageScore: number, status: string, attempts: number, ruleExplanation: string }>}
   */
  getTopicsToReview(studentId) {
    if (!studentId) throw new ValidationError("studentId is required.");
    const attempts = this.#quizService.listAttempts(studentId);
    const byTopic = new Map();

    attempts.forEach((a) => {
      if (!byTopic.has(a.topicId)) {
        byTopic.set(a.topicId, { subjectId: a.subjectId, scores: [] });
      }
      byTopic.get(a.topicId).scores.push(a.percentage);
    });

    const reviews = [];
    byTopic.forEach((data, topicId) => {
      const { subjectId, scores } = data;
      const averageScore = Math.round(scores.reduce((sum, v) => sum + v, 0) / scores.length);
      const topic = this.#quizService.getTopic(topicId);
      const subject = this.#quizService.getSubject(subjectId);

      // Require repeated recorded results; a single quiz is not enough to flag a topic.
      if (scores.length >= MIN_WEAK_TOPIC_ATTEMPTS && averageScore < WEAK_TOPIC_THRESHOLD) {
        reviews.push({
          subject: subject || { id: subjectId, name: "General Subject", color: "#2F5D50" },
          topic: topic || { id: topicId, name: "Topic" },
          averageScore,
          status: "Needs Review",
          attempts: scores.length,
          ruleExplanation: `Average score (${averageScore}%) is below the ${WEAK_TOPIC_THRESHOLD}% threshold based on ${scores.length} recorded quiz attempt${scores.length === 1 ? "" : "s"}.`,
        });
      }
    });

    // Sort weakest (lowest score) first
    return reviews.sort((a, b) => a.averageScore - b.averageScore);
  }

  /**
   * Backward-compatible alias for existing views.
   */
  weakTopics(studentId) {
    return this.getTopicsToReview(studentId);
  }

  /**
   * Aggregates the complete student progress dossier.
   * @param {string} studentId
   */
  getStudentProgressDossier(studentId) {
    if (!studentId) throw new ValidationError("studentId is required.");
    return {
      studentId,
      quizPerformance: this.getQuizPerformance(studentId),
      studyPerformance: this.getStudyPerformance(studentId),
      subjectPerformance: this.subjectProgress(studentId),
      topicsToReview: this.getTopicsToReview(studentId),
    };
  }
}
