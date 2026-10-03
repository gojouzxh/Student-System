/**
 * QuizTakingView — one-question-at-a-time navigation with a countdown
 * timer, question palette for jumping between questions, and a confirm-
 * before-submit gate. Submits accumulated answers to QuizService.
 */
export function renderQuizTaking(container, { quiz, quizService, student, navigate }) {
  const questions = quiz.questions;
  const totalQ = questions.length;
  const answers = new Map();           // questionId -> choiceId
  let currentIndex = 0;
  let startedAt = Date.now();
  let timerInterval = null;
  const hasLimit = quiz.timeLimitSeconds > 0;
  let secondsLeft = quiz.timeLimitSeconds;

  function fmt(s) {
    const m = Math.floor(s / 60), sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  function difficultyBadge(d) {
    const cls = { easy: "badge--easy", medium: "badge--medium", hard: "badge--hard" }[d] ?? "";
    return `<span class="badge ${cls}">${d}</span>`;
  }

  function renderShell() {
    container.innerHTML = `
      <div class="quiz-taking-shell">
        <header class="quiz-taking-hdr">
          <div>
            <h2>${quiz.title}</h2>
            <p class="muted small">${quiz.description}
              ${difficultyBadge(quiz.difficulty)}
              ${hasLimit ? `· <span id="quiz-timer" class="quiz-timer">${fmt(secondsLeft)}</span>` : ""}
            </p>
          </div>
          <button class="btn" id="cancel-quiz">✕ Cancel</button>
        </header>

        <nav class="question-palette" id="question-palette" aria-label="Question palette">
          ${questions.map((q, i) => `
            <button class="palette-btn" data-palette-idx="${i}" aria-label="Question ${i + 1}">
              ${i + 1}
            </button>
          `).join("")}
        </nav>

        <div id="question-area" class="question-area"></div>

        <div class="quiz-nav-bar">
          <button class="btn" id="prev-btn">← Prev</button>
          <span id="q-counter" class="muted small">1 / ${totalQ}</span>
          <button class="btn" id="next-btn">Next →</button>
          <button class="btn btn--primary" id="submit-btn">Submit quiz</button>
        </div>
      </div>
    `;

    container.querySelector("#cancel-quiz").addEventListener("click", () => {
      if (confirm("Cancel quiz? Your progress will be lost.")) navigate("#/quizzes");
    });
    container.querySelector("#prev-btn").addEventListener("click", () => gotoQuestion(currentIndex - 1));
    container.querySelector("#next-btn").addEventListener("click", () => gotoQuestion(currentIndex + 1));
    container.querySelector("#submit-btn").addEventListener("click", handleSubmit);

    container.querySelectorAll(".palette-btn").forEach((btn) => {
      btn.addEventListener("click", () => gotoQuestion(Number(btn.dataset.paletteIdx)));
    });

    if (hasLimit) startTimer();
    gotoQuestion(0);
  }

  function gotoQuestion(idx) {
    if (idx < 0 || idx >= totalQ) return;
    currentIndex = idx;

    const q = questions[idx];
    const savedChoice = answers.get(q.id) ?? null;

    document.getElementById("question-area").innerHTML = `
      <fieldset class="card question-block">
        <legend class="question-legend">Question ${idx + 1} of ${totalQ}</legend>
        <p class="question-prompt">${q.prompt}</p>
        <div class="choices-list">
          ${q.choices.map((c) => `
            <label class="choice-row ${savedChoice === c.id ? "choice-row--selected" : ""}">
              <input type="radio" name="choice" value="${c.id}"
                ${savedChoice === c.id ? "checked" : ""} />
              <span>${c.text}</span>
            </label>
          `).join("")}
        </div>
      </fieldset>
    `;

    // Save answer on selection
    document.querySelectorAll("input[name='choice']").forEach((radio) => {
      radio.addEventListener("change", () => {
        answers.set(q.id, radio.value);
        updatePalette();
      });
    });

    // Update UI state
    document.getElementById("q-counter").textContent = `${idx + 1} / ${totalQ}`;
    document.getElementById("prev-btn").disabled = idx === 0;
    document.getElementById("next-btn").disabled = idx === totalQ - 1;
    updatePalette();
  }

  function updatePalette() {
    document.querySelectorAll(".palette-btn").forEach((btn, i) => {
      const qId = questions[i].id;
      btn.classList.toggle("palette-btn--answered", answers.has(qId));
      btn.classList.toggle("palette-btn--current", i === currentIndex);
    });
  }

  function startTimer() {
    timerInterval = setInterval(() => {
      secondsLeft--;
      const el = document.getElementById("quiz-timer");
      if (el) {
        el.textContent = fmt(secondsLeft);
        el.classList.toggle("quiz-timer--warning", secondsLeft <= 30);
      }
      if (secondsLeft <= 0) {
        clearInterval(timerInterval);
        alert("Time's up! Submitting your quiz now.");
        doSubmit();
      }
    }, 1000);
  }

  function handleSubmit() {
    const unanswered = questions.filter((q) => !answers.has(q.id)).length;
    if (unanswered > 0) {
      if (!confirm(`You have ${unanswered} unanswered question${unanswered > 1 ? "s" : ""}. Submit anyway?`)) return;
    }
    doSubmit();
  }

  function doSubmit() {
    if (timerInterval) clearInterval(timerInterval);
    const timeTakenSeconds = Math.round((Date.now() - startedAt) / 1000);
    try {
      const { attempt } = quizService.submitAttempt(student.id, quiz.id, answers, timeTakenSeconds);
      navigate(`#/quiz-result/${attempt.id}`);
    } catch (error) {
      console.error("[QuizTakingView] Quiz submission failed:", error);
      notifications.showError(error);
    }
  }

  renderShell();
}
import { notifications } from "../utils/NotificationManager.js";
