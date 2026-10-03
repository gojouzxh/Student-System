/**
 * QuizManagementView — create a new quiz with metadata and questions
 * (prompt + 4 choices, correct answer picker, difficulty, time limit).
 */
export function renderQuizManagement(container, { quizService, navigate, onRefresh }) {
  const subjects = quizService.listSubjects();
  let pendingQuestions = [];     // [{prompt, choices:[{text}], correctIdx, explanation}]
  let selectedSubjectId = subjects[0]?.id ?? "";
  let selectedTopicId = "";

  function topicsForSubject(subjectId) {
    return quizService.listTopics(subjectId);
  }

  function renderTopics(subjectId) {
    const topics = topicsForSubject(subjectId);
    const sel = container.querySelector("[name='topicId']");
    if (!sel) return;
    sel.innerHTML = topics.length === 0
      ? `<option value="">— no topics yet —</option>`
      : topics.map((t) => `<option value="${t.id}">${t.name}</option>`).join("");
    selectedTopicId = sel.value;
  }

  function renderQuestionList() {
    const el = container.querySelector("#pending-questions");
    if (!el) return;
    el.innerHTML = pendingQuestions.length === 0
      ? `<p class="muted small">No questions added yet.</p>`
      : `<ol class="pending-q-list">${pendingQuestions.map((q, i) => `
          <li>
            <strong>${q.prompt}</strong>
            <ul>${q.choices.map((c, ci) => `<li ${ci === q.correctIdx ? 'class="correct-choice"' : ""}>${c.text}${ci === q.correctIdx ? " ✓" : ""}</li>`).join("")}</ul>
            <button class="link-btn danger-link" data-remove-q="${i}">Remove</button>
          </li>`).join("")}</ol>`;

    container.querySelectorAll("[data-remove-q]").forEach((btn) => {
      btn.addEventListener("click", () => {
        pendingQuestions.splice(Number(btn.dataset.removeQ), 1);
        renderQuestionList();
      });
    });
  }

  container.innerHTML = `
    <section class="card management-panel">
      <h3>Create a new quiz</h3>
      <form id="create-quiz-form">
        <div class="grid grid--2">
          <label>Subject
            <select name="subjectId" required>
              ${subjects.map((s) => `<option value="${s.id}">${s.name}</option>`).join("")}
            </select>
          </label>
          <label>Topic
            <select name="topicId" required></select>
          </label>
        </div>
        <label>Quiz title
          <input type="text" name="title" placeholder="e.g. OOP Basics" required />
        </label>
        <label>Description
          <input type="text" name="description" placeholder="Optional" />
        </label>
        <div class="grid grid--2">
          <label>Difficulty
            <select name="difficulty">
              <option value="easy">Easy</option>
              <option value="medium" selected>Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <label>Time limit (minutes, 0 = none)
            <input type="number" name="timeLimitMinutes" value="0" min="0" max="120" />
          </label>
        </div>

        <hr />
        <h4>Questions <span class="muted small">(add at least 1 before saving)</span></h4>

        <div class="question-builder card" id="question-builder">
          <label>Question prompt
            <input type="text" name="qPrompt" placeholder="e.g. Which principle hides internal state?" />
          </label>
          <div id="choices-area">
            ${[0, 1, 2, 3].map((i) => `
              <label>Choice ${i + 1}
                <input type="text" name="choice${i}" placeholder="Answer option ${i + 1}" />
              </label>
            `).join("")}
          </div>
          <label>Correct answer
            <select name="correctChoiceIdx">
              <option value="0">Choice 1</option>
              <option value="1">Choice 2</option>
              <option value="2">Choice 3</option>
              <option value="3">Choice 4</option>
            </select>
          </label>
          <label>Explanation (optional)
            <input type="text" name="qExplanation" placeholder="Why is this the correct answer?" />
          </label>
          <button type="button" class="btn" id="add-question-btn">+ Add question</button>
        </div>

        <div id="pending-questions" style="margin:12px 0"></div>
        <p class="form-feedback muted small" id="quiz-feedback"></p>
        <div class="quick-nav">
          <button type="submit" class="btn btn--primary">Save quiz</button>
          <button type="button" class="btn" id="cancel-create-quiz">Cancel</button>
        </div>
      </form>
    </section>
  `;

  // Populate topics for initially selected subject
  renderTopics(subjects[0]?.id ?? "");
  renderQuestionList();

  // Update topics when subject changes
  container.querySelector("[name='subjectId']")?.addEventListener("change", (e) => {
    selectedSubjectId = e.target.value;
    renderTopics(selectedSubjectId);
  });

  // Add question button
  container.querySelector("#add-question-btn").addEventListener("click", () => {
    const prompt = container.querySelector("[name='qPrompt']").value.trim();
    if (!prompt) { alert("Please enter a question prompt."); return; }
    const choices = [0, 1, 2, 3].map((i) => ({ text: container.querySelector(`[name='choice${i}']`).value.trim() }));
    if (choices.some((c) => !c.text)) { alert("Please fill in all 4 answer choices."); return; }
    const correctIdx = Number(container.querySelector("[name='correctChoiceIdx']").value);
    const explanation = container.querySelector("[name='qExplanation']").value.trim();

    pendingQuestions.push({ prompt, choices, correctIdx, explanation });

    // Reset question fields
    container.querySelector("[name='qPrompt']").value = "";
    [0, 1, 2, 3].forEach((i) => { container.querySelector(`[name='choice${i}']`).value = ""; });
    container.querySelector("[name='qExplanation']").value = "";
    renderQuestionList();
  });

  container.querySelector("#cancel-create-quiz").addEventListener("click", () => onRefresh());

  // Save quiz
  container.querySelector("#create-quiz-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const feedback = container.querySelector("#quiz-feedback");
    if (pendingQuestions.length === 0) {
      feedback.textContent = "Add at least one question before saving.";
      return;
    }
    const fd = new FormData(e.target);
    const timeLimitMinutes = Number(fd.get("timeLimitMinutes")) || 0;
    try {
      const quiz = quizService.createQuiz({
        subjectId: fd.get("subjectId"),
        topicId: fd.get("topicId"),
        title: fd.get("title"),
        description: fd.get("description"),
        difficulty: fd.get("difficulty"),
        timeLimitSeconds: timeLimitMinutes * 60,
        questions: pendingQuestions.map((pq) => ({
          prompt: pq.prompt,
          choices: pq.choices,
          correctChoiceIndex: pq.correctIdx,
          explanation: pq.explanation,
        })),
      });
      alert(`Quiz "${quiz.title}" saved with ${quiz.questionCount} questions!`);
      onRefresh();
    } catch (err) {
      feedback.textContent = err.message;
    }
  });
}
