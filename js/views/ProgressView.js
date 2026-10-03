/**
 * ProgressView — subject progress bars, weak-topic call-outs, and a
 * study-time-per-subject breakdown. This is the screen that visibly
 * connects quiz performance with study activity.
 */
export function renderProgress(container, { student, progressService }) {
  const progress = progressService.subjectProgress(student.id);
  const weakTopics = progressService.weakTopics(student.id);
  const quizPerformance = progressService.getQuizPerformance(student.id);
  const studyPerformance = progressService.getStudyPerformance(student.id);

  container.innerHTML = `
    <h2>Progress</h2>

    <section class="grid grid--3">
      <div class="card stat-card"><span class="stat-card__label">Quiz score range</span><span class="stat-card__value">${quizPerformance.lowestScore}%–${quizPerformance.highestScore}%</span></div>
      <div class="card stat-card"><span class="stat-card__label">Answers</span><span class="stat-card__value">${quizPerformance.correctAnswers} correct · ${quizPerformance.incorrectAnswers} incorrect</span></div>
      <div class="card stat-card"><span class="stat-card__label">Total study time</span><span class="stat-card__value">${studyPerformance.totalStudyTime} min</span></div>
    </section>
    <section class="grid grid--3">
      <div class="card stat-card"><span class="stat-card__label">Today</span><span class="stat-card__value">${studyPerformance.dailyStudyTime} min</span></div>
      <div class="card stat-card"><span class="stat-card__label">This week</span><span class="stat-card__value">${studyPerformance.weeklyStudyTime} min</span></div>
      <div class="card stat-card"><span class="stat-card__label">This month</span><span class="stat-card__value">${studyPerformance.monthlyStudyTime} min</span></div>
    </section>
    <section class="card">
      <h3>Study streak and goals</h3>
      <p>${studyPerformance.studyStreak} day streak · ${studyPerformance.goalCompletion.metGoals}/${studyPerformance.goalCompletion.totalGoals} goals complete (${studyPerformance.goalCompletion.percentage}%)</p>
    </section>

    <section class="grid grid--2">
      ${progress.map(({ subject, record }) => `
        <div class="card">
          <h3><span class="subject-row__dot" style="background:${subject.color}"></span> ${subject.name}</h3>
          <div class="progress-bar"><div class="progress-bar__fill" style="width:${record.averageScore}%;background:${subject.color}"></div></div>
          <p class="muted small">${record.averageScore}% average · ${record.attemptCount} quiz attempt${record.attemptCount === 1 ? "" : "s"} · ${record.studyMinutes} min studied</p>
        </div>
      `).join("")}
    </section>

    <section class="card">
      <h3>Topics that need review</h3>
      ${weakTopics.length === 0 ? `<p class="muted">No weak topics flagged yet — keep taking quizzes to populate this.</p>` : `
        <ul class="weak-topic-list">
          ${weakTopics.map(({ subject, topic, averageScore, status }) => `
            <li>
              <span class="subject-row__dot" style="background:${subject.color}"></span>
              <strong>${subject.name} — ${topic?.name ?? "Unknown topic"}</strong>
              <span class="muted small">Average Score: ${averageScore}% · Status: ${status}</span>
            </li>
          `).join("")}
        </ul>
      `}
    </section>
  `;
}
