/**
 * QuizHistoryView — every past QuizAttempt for the student, newest
 * first, so they can track improvement over time.
 */
export function renderQuizHistory(container, { student, quizService, navigate }) {
  const attempts = quizService.listAttempts(student.id);

  container.innerHTML = `
    <h2>Quiz History</h2>
    ${attempts.length === 0 ? `<p class="muted">No attempts yet — take a quiz to see it here.</p>` : `
      <table class="history-table">
        <thead><tr><th>Quiz</th><th>Score</th><th>%</th><th>Date</th><th></th></tr></thead>
        <tbody>
          ${attempts.map((a) => {
            const quiz = quizService.getQuiz(a.quizId);
            const date = new Date(a.takenAt).toLocaleString();
            return `
              <tr>
                <td>${quiz ? quiz.title : "(deleted quiz)"}</td>
                <td>${a.score}/${a.total}</td>
                <td>${a.percentage}%</td>
                <td class="muted small">${date}</td>
                <td><button class="link-btn" data-attempt-id="${a.id}">Review</button></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `}
  `;

  container.querySelectorAll("[data-attempt-id]").forEach((btn) => {
    btn.addEventListener("click", () => navigate(`#/quiz-result/${btn.dataset.attemptId}`));
  });
}
