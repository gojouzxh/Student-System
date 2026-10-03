/**
 * SubjectManagementView — create subjects, create topics, and view the
 * full subject/topic tree. Embedded in the QuizListView as an expandable panel.
 */
export function renderSubjectManagement(container, { quizService, onRefresh }) {
  const subjects = quizService.listSubjects();

  container.innerHTML = `
    <section class="card management-panel">
      <h3>Manage Subjects &amp; Topics</h3>
      <div class="grid grid--2">

        <!-- Create subject -->
        <form id="create-subject-form">
          <h4>Add subject</h4>
          <label>Name
            <input type="text" name="name" placeholder="e.g. Mathematics" required />
          </label>
          <label>Description
            <input type="text" name="description" placeholder="Optional" />
          </label>
          <label>Color
            <input type="color" name="color" value="#2F5D50" />
          </label>
          <button type="submit" class="btn btn--primary">Create subject</button>
          <p class="form-feedback muted small" id="subj-feedback"></p>
        </form>

        <!-- Create topic -->
        <form id="create-topic-form">
          <h4>Add topic to subject</h4>
          <label>Subject
            <select name="subjectId" required>
              ${subjects.length === 0
                ? `<option value="">— create a subject first —</option>`
                : subjects.map((s) => `<option value="${s.id}">${s.name}</option>`).join("")}
            </select>
          </label>
          <label>Topic name
            <input type="text" name="name" placeholder="e.g. Normalization" required />
          </label>
          <label>Description
            <input type="text" name="description" placeholder="Optional" />
          </label>
          <button type="submit" class="btn btn--primary">Create topic</button>
          <p class="form-feedback muted small" id="topic-feedback"></p>
        </form>

      </div>
    </section>
  `;

  container.querySelector("#create-subject-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      quizService.createSubject({ name: fd.get("name"), description: fd.get("description"), color: fd.get("color") });
      e.target.reset();
      onRefresh();
    } catch (err) {
      container.querySelector("#subj-feedback").textContent = err.message;
    }
  });

  container.querySelector("#create-topic-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      quizService.createTopic({ subjectId: fd.get("subjectId"), name: fd.get("name"), description: fd.get("description") });
      e.target.reset();
      onRefresh();
    } catch (err) {
      container.querySelector("#topic-feedback").textContent = err.message;
    }
  });
}
