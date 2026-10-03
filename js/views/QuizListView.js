import { renderSubjectManagement } from "./SubjectManagementView.js";
import { renderQuizManagement } from "./QuizManagementView.js";

/**
 * QuizListView — browse Subjects -> Topics -> Quizzes, with expandable
 * management panels to create subjects, topics, and quizzes.
 */
export function renderQuizList(container, { quizService, navigate }) {
  let showManageSubjects = false;
  let showCreateQuiz = false;

  function render() {
    const subjects = quizService.listSubjects();

    container.innerHTML = `
      <div class="quiz-list-header">
        <h2>Quizzes</h2>
        <div class="quick-nav" style="margin-top:4px">
          <button class="btn" id="toggle-manage-subjects">
            ${showManageSubjects ? "▲ Hide subject manager" : "▼ Manage subjects & topics"}
          </button>
          <button class="btn btn--primary" id="toggle-create-quiz">
            ${showCreateQuiz ? "▲ Cancel" : "+ Create quiz"}
          </button>
        </div>
      </div>

      <div id="management-area"></div>

      ${subjects.length === 0
        ? `<p class="muted">No subjects yet — add one using the subject manager above.</p>`
        : `
        <p class="muted">Pick a subject → topic → quiz to begin.</p>
        <div class="subject-columns">
          ${subjects.map((subject) => {
            const topics = quizService.listTopics(subject.id);
            return `
              <div class="card subject-block" style="border-top-color:${subject.color}">
                <h3>${subject.name}</h3>
                <p class="muted small">${subject.description}</p>
                ${topics.length === 0
                  ? `<p class="muted small">No topics yet.</p>`
                  : topics.map((topic) => {
                      const quizzes = quizService.listQuizzes(topic.id);
                      return `
                        <div class="topic-block">
                          <h4>${topic.name}</h4>
                          <ul class="quiz-links">
                            ${quizzes.map((quiz) => `
                              <li>
                                <button class="link-btn" data-quiz-id="${quiz.id}">
                                  ${quiz.title}
                                  <span class="muted small">(${quiz.questionCount}q · ${quiz.difficulty}${quiz.timeLimitSeconds > 0 ? ` · ${Math.round(quiz.timeLimitSeconds / 60)}min` : ""})</span>
                                </button>
                              </li>
                            `).join("") || `<li class="muted small">No quizzes yet.</li>`}
                          </ul>
                        </div>
                      `;
                    }).join("")}
              </div>
            `;
          }).join("")}
        </div>
      `}
    `;

    // Management area
    const mgmtArea = container.querySelector("#management-area");
    if (showManageSubjects) {
      renderSubjectManagement(mgmtArea, { quizService, onRefresh: render });
    } else if (showCreateQuiz) {
      renderQuizManagement(mgmtArea, { quizService, navigate, onRefresh: () => { showCreateQuiz = false; render(); } });
    }

    container.querySelector("#toggle-manage-subjects").addEventListener("click", () => {
      showManageSubjects = !showManageSubjects;
      showCreateQuiz = false;
      render();
    });
    container.querySelector("#toggle-create-quiz").addEventListener("click", () => {
      showCreateQuiz = !showCreateQuiz;
      showManageSubjects = false;
      render();
    });

    container.querySelectorAll("[data-quiz-id]").forEach((btn) => {
      btn.addEventListener("click", () => navigate(`#/quiz/${btn.dataset.quizId}`));
    });
  }

  render();
}
