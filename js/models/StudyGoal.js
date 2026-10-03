/**
 * StudyGoal — a named target for study time in a subject by a date.
 * Behaviour (progress calc) lives here, not scattered in views —
 * so any view asking "how am I doing" gets the same answer.
 * Also backward-compatible with Week 1 schema (period + targetMinutes).
 */
export class StudyGoal {
  #id; #studentId; #title; #subjectId; #targetHours; #targetDate;
  #currentHours; #status; #period;

  static STATUS = Object.freeze({ active: "active", met: "met", missed: "missed" });

  /**
   * @param {object} opts
   * @param {string}  opts.id
   * @param {string}  opts.studentId
   * @param {string}  [opts.title]          — e.g. "Finish Databases revision"
   * @param {string|null} [opts.subjectId]  — optional subject focus
   * @param {number}  [opts.targetHours]    — total study hours aimed for
   * @param {string|null} [opts.targetDate] — ISO date deadline, optional
   * @param {number}  [opts.currentHours]   — hours logged so far
   * @param {string}  [opts.status]         — active | met | missed
   * @param {string|null} [opts.period]     — legacy field from Week 1 (daily/weekly/monthly)
   * @param {number|null} [opts.targetMinutes] — legacy field from Week 1
   */
  constructor({ id, studentId, title, subjectId = null, targetHours,
                targetDate = null, currentHours = 0, status = "active",
                period = null, targetMinutes = null }) {
    // Resolve title: validate or fall back to period-based title
    let resolvedTitle = title !== undefined && title !== null ? String(title).trim() : "";
    if (!resolvedTitle) {
      if (period) {
        resolvedTitle = `${String(period).charAt(0).toUpperCase() + String(period).slice(1)} Study Goal`;
      } else {
        throw new Error("Goal title cannot be empty.");
      }
    }

    // Resolve targetHours: validate or fall back to targetMinutes / 60
    let resolvedHours = targetHours !== undefined && targetHours !== null ? Number(targetHours) : NaN;
    if (isNaN(resolvedHours) || resolvedHours <= 0) {
      if (targetMinutes && Number(targetMinutes) > 0) {
        resolvedHours = Number(targetMinutes) / 60;
      } else {
        throw new Error("Target hours must be positive.");
      }
    }

    const resolvedStatus = status && StudyGoal.STATUS[status] ? status : "active";
    if (status && !StudyGoal.STATUS[status]) {
      throw new Error(`Unknown status: ${status}`);
    }

    this.#id = id;
    this.#studentId = studentId;
    this.#title = resolvedTitle;
    this.#subjectId = subjectId || null;
    this.#targetHours = Math.round(resolvedHours * 10) / 10;
    this.#targetDate = targetDate || null;
    this.#currentHours = Math.max(0, Number(currentHours) || 0);
    this.#status = resolvedStatus;
    this.#period = period || null;
  }

  get id() { return this.#id; }
  get studentId() { return this.#studentId; }
  get title() { return this.#title; }
  get subjectId() { return this.#subjectId; }
  get targetHours() { return this.#targetHours; }
  get targetDate() { return this.#targetDate; }
  get currentHours() { return this.#currentHours; }
  get status() { return this.#status; }
  get period() { return this.#period; }
  get targetMinutes() { return Math.round(this.#targetHours * 60); }

  /**
   * Returns progress data for display without mutating state.
   * @param {number} [actualMinutes] — if omitted, uses stored currentHours
   */
  progressToward(actualMinutes) {
    const actual = actualMinutes !== undefined ? Math.max(0, Number(actualMinutes) || 0) : this.#currentHours * 60;
    const target = this.targetMinutes;
    const pct = target ? Math.min(100, Math.round((actual / target) * 100)) : 0;
    return { actualMinutes: actual, targetMinutes: target, percentage: pct, met: actual >= target };
  }

  /** Immutably add hours; returns a new StudyGoal with updated progress/status. */
  addHours(hours) {
    const newCurrent = Math.round((this.#currentHours + Number(hours || 0)) * 10) / 10;
    const newStatus = newCurrent >= this.#targetHours ? "met" : this.#status;
    return new StudyGoal({ ...this.toJSON(), currentHours: newCurrent, status: newStatus });
  }

  toJSON() {
    return {
      id: this.#id,
      studentId: this.#studentId,
      title: this.#title,
      subjectId: this.#subjectId,
      targetHours: this.#targetHours,
      targetDate: this.#targetDate,
      currentHours: this.#currentHours,
      status: this.#status,
      period: this.#period,
    };
  }

  static fromJSON(data) {
    if (!data) return null;
    return new StudyGoal(data);
  }
}
