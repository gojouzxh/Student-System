/**
 * StudySession — one logged block of studying.
 * Supports both explicit minutes (legacy) and startTime/endTime with
 * auto-calculated duration. Duration is always stored as minutes.
 */
export class StudySession {
  #id; #studentId; #subjectId; #topicId;
  #startTime; #endTime; #minutes; #notes; #date;

  /**
   * @param {object} opts
   * @param {string} opts.id
   * @param {string} opts.studentId
   * @param {string} opts.subjectId
   * @param {string|null} [opts.topicId]
   * @param {string|null} [opts.startTime] — ISO datetime of start
   * @param {string|null} [opts.endTime]   — ISO datetime of end
   * @param {number}      [opts.minutes]   — explicit override (used when no start/end)
   * @param {string}      [opts.notes]
   * @param {string}      [opts.date]      — ISO date of the session
   */
  constructor({ id, studentId, subjectId, topicId = null,
                startTime = null, endTime = null, minutes = null,
                notes = "", date = new Date().toISOString() }) {
    this.#id = id;
    this.#studentId = studentId;
    this.#subjectId = subjectId;
    this.#topicId = topicId || null;
    this.#startTime = startTime || null;
    this.#endTime = endTime || null;
    this.#notes = notes || "";
    this.#date = date || new Date().toISOString();

    // Derive minutes: prefer startTime/endTime calculation, fall back to explicit.
    if (startTime && endTime) {
      const start = Date.parse(startTime);
      const end = Date.parse(endTime);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        throw new Error("Start and end times must be valid, and the end must be after the start.");
      }
      const diffMs = end - start;
      this.#minutes = Math.max(1, Math.round(diffMs / 60000));
    } else {
      const parsed = Number(minutes);
      if (!isNaN(parsed) && parsed > 0) {
        this.#minutes = Math.max(1, Math.round(parsed));
      } else {
        throw new Error("Study duration must be a positive number of minutes.");
      }
    }
  }

  get id() { return this.#id; }
  get studentId() { return this.#studentId; }
  get subjectId() { return this.#subjectId; }
  get topicId() { return this.#topicId; }
  get startTime() { return this.#startTime; }
  get endTime() { return this.#endTime; }
  get minutes() { return this.#minutes || 0; }
  get notes() { return this.#notes; }
  get date() { return this.#date; }

  toJSON() {
    return {
      id: this.#id,
      studentId: this.#studentId,
      subjectId: this.#subjectId,
      topicId: this.#topicId,
      startTime: this.#startTime,
      endTime: this.#endTime,
      minutes: this.#minutes,
      notes: this.#notes,
      date: this.#date,
    };
  }

  static fromJSON(data) {
    if (!data) return null;
    return new StudySession({
      id: data.id,
      studentId: data.studentId,
      subjectId: data.subjectId,
      topicId: data.topicId || null,
      startTime: data.startTime || null,
      endTime: data.endTime || null,
      minutes: data.minutes !== undefined && data.minutes !== null ? data.minutes : 30,
      notes: data.notes || "",
      date: data.date || new Date().toISOString(),
    });
  }
}
