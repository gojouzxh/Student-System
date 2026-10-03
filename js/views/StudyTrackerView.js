/**
 * StudyTrackerView — log sessions by time range or minutes, create titled
 * study goals with subjects and deadlines, and see progress + session history.
 */
export function renderStudyTracker(container, { student, quizService, studyTrackerService, rerender }) {
  const currentStudent = student || { id: "student_demo", name: "Student", currentStreak: 0, longestStreak: 0 };
  const subjects = quizService ? quizService.listSubjects() : [];
  const totals = studyTrackerService ? studyTrackerService.totalsFor(currentStudent.id) : { today: 0, week: 0, month: 0 };
  const goalProgress = studyTrackerService ? studyTrackerService.goalProgress(currentStudent.id) : [];
  const sessions = studyTrackerService ? studyTrackerService.listSessions(currentStudent.id).slice(0, 10) : [];

  const streak = currentStudent.currentStreak || 0;
  const longest = currentStudent.longestStreak || 0;
  const todayMin = totals.today || 0;
  const weekMin = totals.week || 0;
  const monthMin = totals.month || 0;

  const todayIsoDate = new Date().toISOString().slice(0, 10);

  container.innerHTML = `
    <h2>Study Tracker</h2>

    <section class="grid grid--3">
      <div class="card stat-card"><span class="stat-card__label">Today</span><span class="stat-card__value">${todayMin} min</span></div>
      <div class="card stat-card"><span class="stat-card__label">This week</span><span class="stat-card__value">${weekMin} min</span></div>
      <div class="card stat-card"><span class="stat-card__label">This month</span><span class="stat-card__value">${monthMin} min</span></div>
    </section>

    <section class="card">
      <h3>Current streak: ${streak} day${streak === 1 ? "" : "s"} <span class="muted small">(longest: ${longest})</span></h3>
    </section>

    <div class="grid grid--2">
      <!-- Session logging form -->
      <section class="card">
        <h3>Log a study session</h3>
        <form id="session-form">
          <label>Subject
            <select name="subjectId" id="session-subject-select" required>
              ${subjects.length === 0
                ? `<option value="">— no subjects available —</option>`
                : subjects.map((s) => `<option value="${s.id}">${s.name}</option>`).join("")}
            </select>
          </label>
          <label>Topic (optional)
            <select name="topicId" id="session-topic-select">
              <option value="">— all topics —</option>
            </select>
          </label>
          <label>Date
            <input type="date" name="date" value="${todayIsoDate}" required />
          </label>

          <div class="time-mode-tabs">
            <button type="button" class="btn tab-btn tab-btn--active" data-mode="range">Start / End time</button>
            <button type="button" class="btn tab-btn" data-mode="minutes">Enter minutes</button>
          </div>

          <div id="mode-range" class="time-mode">
            <label>Start time
              <input type="time" name="startTime" />
            </label>
            <label>End time
              <input type="time" name="endTime" />
            </label>
          </div>
          <div id="mode-minutes" class="time-mode" style="display:none">
            <label>Duration (minutes)
              <input type="number" name="minutes" min="1" placeholder="e.g. 45" />
            </label>
          </div>

          <label>Notes (optional)
            <textarea name="notes" rows="2" placeholder="What did you study?"></textarea>
          </label>
          <button type="submit" class="btn btn--primary">Save session</button>
          <p class="form-feedback muted small" id="session-feedback"></p>
        </form>
      </section>

      <!-- Goal creation form -->
      <section class="card">
        <h3>Study goals</h3>
        <form id="goal-form">
          <label>Goal title
            <input type="text" name="title" placeholder="e.g. Finish Databases revision" required />
          </label>
          <label>Subject (optional)
            <select name="subjectId">
              <option value="">— all subjects —</option>
              ${subjects.map((s) => `<option value="${s.id}">${s.name}</option>`).join("")}
            </select>
          </label>
          <label>Target study hours
            <input type="number" name="targetHours" min="0.5" step="0.5" value="2" required />
          </label>
          <label>Target date (optional)
            <input type="date" name="targetDate" />
          </label>
          <button type="submit" class="btn btn--primary">Create goal</button>
          <p class="form-feedback muted small" id="goal-feedback"></p>
        </form>

        <!-- Goal progress list -->
        <div class="goal-list" style="margin-top:18px">
          ${goalProgress.length === 0
            ? `<p class="muted small">No goals yet — create one above.</p>`
            : goalProgress.map(({ goal, actualMinutes, percentage, met }) => {
                const title = goal.title || "Study Goal";
                const status = goal.status || "active";
                const targetHours = Number(goal.targetHours) || (goal.targetMinutes ? goal.targetMinutes / 60 : 1);
                const hrs = (Number(actualMinutes || 0) / 60).toFixed(1);
                const subj = goal.subjectId ? (quizService?.getSubject(goal.subjectId)?.name || "Subject") : "All subjects";
                const deadline = goal.targetDate ? ` · due ${new Date(goal.targetDate).toLocaleDateString()}` : "";
                return `
                  <div class="goal-row">
                    <div class="goal-row__header">
                      <span class="goal-row__title">${title}</span>
                      <span class="badge badge--status badge--${status}">${status}</span>
                    </div>
                    <span class="muted small">${subj}${deadline}</span>
                    <div class="progress-bar progress-bar--sm">
                      <div class="progress-bar__fill" style="width:${percentage || 0}%"></div>
                    </div>
                    <div class="goal-row__footer">
                      <span class="muted small">${hrs}h / ${targetHours}h ${met ? "✓ met!" : ""}</span>
                      <button class="link-btn danger-link" data-delete-goal="${goal.id}">Remove</button>
                    </div>
                  </div>
                `;
              }).join("")}
        </div>
      </section>
    </div>

    <!-- Recent sessions -->
    <section class="card">
      <h3>Recent sessions</h3>
      ${sessions.length === 0 ? `<p class="muted">No sessions logged yet.</p>` : `
        <ul class="session-list">
          ${sessions.map((s) => {
            const subj = quizService ? quizService.getSubject(s.subjectId) : null;
            const topic = (s.topicId && quizService) ? quizService.getTopic(s.topicId) : null;
            let timeRange = "";
            if (s.startTime && s.endTime) {
              try {
                const st = new Date(s.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                const et = new Date(s.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                timeRange = ` ${st}–${et}`;
              } catch (_) {}
            }
            const dateStr = s.date ? new Date(s.date).toLocaleDateString() : "";
            return `<li>
              <strong>${s.minutes || 0} min</strong> — ${subj?.name ?? "General"}
              ${topic ? `<span class="muted small">/ ${topic.name}</span>` : ""}
              <span class="muted small">(${dateStr}${timeRange})</span>
              ${s.notes ? ` — ${s.notes}` : ""}
            </li>`;
          }).join("")}
        </ul>
      `}
    </section>
  `;

  // Tab switching (Start/End vs Minutes)
  container.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      container.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("tab-btn--active"));
      btn.classList.add("tab-btn--active");
      const rangeEl = container.querySelector("#mode-range");
      const minsEl = container.querySelector("#mode-minutes");
      if (rangeEl && minsEl) {
        rangeEl.style.display = btn.dataset.mode === "range" ? "" : "none";
        minsEl.style.display = btn.dataset.mode === "minutes" ? "" : "none";
      }
    });
  });

  // Dynamic topic dropdown based on session-form subject selection
  const subjectSel = container.querySelector("#session-subject-select");
  const topicSel = container.querySelector("#session-topic-select");
  function updateTopics() {
    if (!subjectSel || !topicSel || !quizService) return;
    const topics = quizService.listTopics(subjectSel.value);
    topicSel.innerHTML = `<option value="">— all topics —</option>` +
      topics.map((t) => `<option value="${t.id}">${t.name}</option>`).join("");
  }
  if (subjectSel) {
    subjectSel.addEventListener("change", updateTopics);
    updateTopics();
  }

  // Session form submit
  const sessionForm = container.querySelector("#session-form");
  if (sessionForm) {
    sessionForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const feedback = container.querySelector("#session-feedback");
      if (feedback) feedback.textContent = "";

      const fd = new FormData(sessionForm);
      const activeBtn = container.querySelector(".tab-btn--active");
      const activeMode = activeBtn ? activeBtn.dataset.mode : "range";
      const dateStr = fd.get("date") || todayIsoDate;
      const subjectId = fd.get("subjectId");

      if (!subjectId) {
        if (feedback) feedback.textContent = "Please select a subject.";
        return;
      }

      try {
        if (activeMode === "range") {
          const st = fd.get("startTime");
          const et = fd.get("endTime");
          if (!st || !et) {
            throw new Error("Please enter both start time and end time, or switch to 'Enter minutes'.");
          }
          studyTrackerService.logSession(currentStudent.id, {
            subjectId,
            topicId: fd.get("topicId") || null,
            startTime: `${dateStr}T${st}:00`,
            endTime: `${dateStr}T${et}:00`,
            notes: fd.get("notes") || "",
            date: `${dateStr}T${st}:00`,
          });
        } else {
          const mins = Number(fd.get("minutes"));
          if (!mins || mins <= 0) {
            throw new Error("Please enter a valid positive duration in minutes.");
          }
          studyTrackerService.logSession(currentStudent.id, {
            subjectId,
            topicId: fd.get("topicId") || null,
            minutes: mins,
            notes: fd.get("notes") || "",
            date: new Date(dateStr).toISOString(),
          });
        }
        if (typeof rerender === "function") rerender();
      } catch (err) {
        if (feedback) feedback.textContent = err.message;
      }
    });
  }

  // Goal form submit
  const goalForm = container.querySelector("#goal-form");
  if (goalForm) {
    goalForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const feedback = container.querySelector("#goal-feedback");
      if (feedback) feedback.textContent = "";

      const fd = new FormData(goalForm);
      const title = fd.get("title");
      const targetHours = Number(fd.get("targetHours"));

      try {
        if (!title || !title.trim()) {
          throw new Error("Please enter a goal title.");
        }
        if (!targetHours || targetHours <= 0) {
          throw new Error("Target hours must be greater than zero.");
        }
        studyTrackerService.createGoal(currentStudent.id, {
          title: title.trim(),
          subjectId: fd.get("subjectId") || null,
          targetHours,
          targetDate: fd.get("targetDate") || null,
        });
        if (typeof rerender === "function") rerender();
      } catch (err) {
        if (feedback) feedback.textContent = err.message;
      }
    });
  }

  // Delete goal buttons
  container.querySelectorAll("[data-delete-goal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (confirm("Remove this goal?")) {
        studyTrackerService.deleteGoal(btn.dataset.deleteGoal);
        if (typeof rerender === "function") rerender();
      }
    });
  });
}
