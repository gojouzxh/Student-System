/**
 * QuizResultView — full result display: score, percentage, time spent,
 * date taken, performance summary, correct/incorrect counts, and a
 * per-question breakdown with explanations.
 */
export function renderQuizResult(container, { attempt, quiz, navigate }) {
  const questionsById = new Map(quiz.questions.map((q) => [q.id, q]));
  const correctCount = attempt.answers.filter((a) => a.correct).length;
  const incorrectCount = attempt.total - correctCount;
  const dateTaken = new Date(attempt.takenAt).toLocaleString();
  const summary = attempt.performanceSummary();
  const summaryClass = {
    "Excellent": "summary--excellent",
    "Good": "summary--good",
    "Satisfactory": "summary--satisfactory",
    "Needs improvement": "summary--needs-improvement",
    "Keep practicing": "summary--poor",
  }[summary] ?? "";

  container.innerHTML = `
    <h2>${quiz.title} — Result</h2>

    <div class="card result-summary">
      <div class="result-summary__score-block">
        <span class="result-summary__score">${attempt.score}/${attempt.total}</span>
        <span class="result-summary__pct">${attempt.percentage}%</span>
      </div>
      <div class="result-summary__meta">
        <span class="performance-badge ${summaryClass}">${summary}</span>
        <table class="result-meta-table">
          <tr><td>✓ Correct</td><td><strong>${correctCount}</strong></td></tr>
          <tr><td>✗ Incorrect</td><td><strong>${incorrectCount}</strong></td></tr>
          <tr><td>⏱ Time spent</td><td><strong>${attempt.formattedTime()}</strong></td></tr>
          <tr><td>📅 Date taken</td><td><strong>${dateTaken}</strong></td></tr>
          <tr><td>📊 Difficulty</td><td><strong style="text-transform:capitalize">${quiz.difficulty}</strong></td></tr>
        </table>
      </div>
    </div>

    <h3>Question Review</h3>
    ${attempt.answers.map((ans) => {
      const q = questionsById.get(ans.questionId);
      const chosenText = q.choices.find((c) => c.id === ans.chosenChoiceId)?.text ?? "(no answer)";
      const correctText = q.correctChoice()?.text ?? "";
      return `
        <div class="card review-block ${ans.correct ? "review-block--correct" : "review-block--incorrect"}">
          <p class="question-prompt">${q.prompt}</p>
          <p>Your answer: <strong>${chosenText}</strong> ${ans.correct ? "✓" : "✗"}</p>
          ${!ans.correct ? `<p>Correct answer: <strong>${correctText}</strong></p>` : ""}
          ${!ans.correct && q.explanation ? `<p class="muted small explanation">💡 ${q.explanation}</p>` : ""}
        </div>
      `;
    }).join("")}

    <nav class="quick-nav">
      <a href="#/quizzes" class="btn btn--primary">Back to quizzes</a>
      <a href="#/history" class="btn">Quiz history</a>
      <a href="#/progress" class="btn">View progress</a>
    </nav>
  `;
}
