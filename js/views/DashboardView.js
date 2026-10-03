/**
 * DashboardView — Week 3 integration milestone.
 */
const WEEK3_CHECKLIST = [
  "Quiz, study, and progress services integrated",
  "Documented REST API contract",
  "Sanitized application error handling",
  "Input and quiz submission validation",
  "Reproducible Docker container",
  "End-to-end integration tests",
];

export function renderDashboard(container, { student, progressService, studyTrackerService }) {
  const currentStudent = student || { id: "student_demo", name: "Student", currentStreak: 0, longestStreak: 0 };
  const totals = studyTrackerService ? studyTrackerService.totalsFor(currentStudent.id) : { today: 0, week: 0, month: 0 };
  const progress = progressService ? progressService.subjectProgress(currentStudent.id) : [];
  const goalProgress = studyTrackerService ? studyTrackerService.goalProgress(currentStudent.id) : [];
  const quizPerformance = progressService ? progressService.getQuizPerformance(currentStudent.id) : {
    totalQuizzes: 0, averageScore: 0, correctAnswers: 0, incorrectAnswers: 0,
  };
  const topicsToReview = progressService ? progressService.getTopicsToReview(currentStudent.id) : [];

  const streak = currentStudent.currentStreak || 0;
  const todayMin = totals.today || 0;
  const weekMin = totals.week || 0;

  container.innerHTML = `
    <section class="status-panel card">
      <div class="status-panel__head">
        <div>
          <h2 style="margin-bottom:4px">Project Progress: 75%</h2>
          <p class="muted small" style="margin:0">Week 3 — Integration and Hardening</p>
        </div>
        <span class="badge badge--week">Week 3</span>
      </div>
      <div class="progress-bar" style="margin:12px 0">
        <div class="progress-bar__fill" style="width:75%"></div>
      </div>
      <ul class="checklist">
        ${WEEK3_CHECKLIST.map((item) => `<li class="checklist__item">${item}</li>`).join("")}
      </ul>
    </section>

    <section class="grid grid--3">
      <div class="card stat-card">
        <span class="stat-card__label">Quiz average</span>
        <span class="stat-card__value">${quizPerformance.averageScore}%</span>
      </div>
      <div class="card stat-card">
        <span class="stat-card__label">Questions correct</span>
        <span class="stat-card__value">${quizPerformance.correctAnswers}</span>
      </div>
      <div class="card stat-card">
        <span class="stat-card__label">Questions incorrect</span>
        <span class="stat-card__value">${quizPerformance.incorrectAnswers}</span>
      </div>
    </section>

    <section class="grid grid--3">
      <div class="card stat-card">
        <span class="stat-card__label">Current streak</span>
        <span class="stat-card__value">${streak} ${streak === 1 ? "day" : "days"}</span>
      </div>
      <div class="card stat-card">
        <span class="stat-card__label">Studied today</span>
        <span class="stat-card__value">${todayMin} min</span>
      </div>
      <div class="card stat-card">
        <span class="stat-card__label">Studied this week</span>
        <span class="stat-card__value">${weekMin} min</span>
      </div>
    </section>

    <div class="grid grid--2">
      <section class="card">
        <h3>Subjects at a glance</h3>
        <div class="subject-list">
          ${progress.length === 0 ? `<p class="muted small">No subjects available.</p>` : progress.map(({ subject, record }) => `
            <div class="subject-row">
              <span class="subject-row__dot" style="background:${subject.color}"></span>
              <span class="subject-row__name">${subject.name}</span>
              <div class="progress-bar progress-bar--sm">
                <div class="progress-bar__fill" style="width:${record.averageScore}%;background:${subject.color}"></div>
              </div>
              <span class="subject-row__meta">${record.averageScore}% avg · ${record.attemptCount} quiz${record.attemptCount === 1 ? "" : "zes"}</span>
            </div>
          `).join("")}
        </div>
      </section>

      <section class="card">
        <h3>Study goals</h3>
        ${goalProgress.length === 0
          ? `<p class="muted small">No goals yet — <a href="#/study">create one</a>.</p>`
          : goalProgress.slice(0, 3).map(({ goal, actualMinutes, percentage, met, status: progressStatus }) => {
              const title = goal.title || "Study Goal";
              const status = progressStatus || goal.status || "active";
              const targetHours = Number(goal.targetHours) || (goal.targetMinutes ? goal.targetMinutes / 60 : 1);
              const hrs = (Number(actualMinutes || 0) / 60).toFixed(1);
              return `
                <div class="goal-row" style="margin-bottom:12px">
                  <div class="goal-row__header">
                    <span class="goal-row__title">${title}</span>
                    <span class="badge badge--status badge--${status}">${status}</span>
                  </div>
                  <div class="progress-bar progress-bar--sm">
                    <div class="progress-bar__fill" style="width:${percentage || 0}%"></div>
                  </div>
                  <span class="muted small">${hrs}h / ${targetHours}h ${met ? "✓" : ""}</span>
                </div>
              `;
            }).join("")}
        <a href="#/study" class="link-btn" style="font-size:0.85rem">Manage goals →</a>
      </section>
    </div>

    <section class="card">
      <h3>Topics to review</h3>
      ${topicsToReview.length === 0
        ? `<p class="muted small">No topics meet the review rule yet. A topic is flagged only after at least two quiz attempts average below 70%.</p>`
        : `<ul class="weak-topic-list">
            ${topicsToReview.map(({ subject, topic, averageScore, status }) => `
              <li>
                <span class="subject-row__dot" style="background:${subject.color}"></span>
                <strong>${subject.name} — ${topic.name}</strong>
                <span class="muted small">Average Score: ${averageScore}% · Status: ${status}</span>
              </li>
            `).join("")}
          </ul>`}
    </section>

    <nav class="quick-nav">
      <a href="#/quizzes" class="btn btn--primary">Browse quizzes</a>
      <a href="#/study" class="btn">Log a study session</a>
      <a href="#/progress" class="btn">View progress</a>
      <a href="#/history" class="btn">Quiz history</a>
    </nav>
  `;
}
