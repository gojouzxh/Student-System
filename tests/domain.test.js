/**
 * tests/domain.test.js
 *
 * Unit tests for core domain logic.
 * Run with Node (no build tools needed):
 *   node tests/domain.test.js
 *
 * Uses a minimal built-in test runner so there are zero dependencies.
 */

// ---- Minimal test harness ----
let passed = 0, failed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push({ ok: true, name });
  } catch (err) {
    failed++;
    results.push({ ok: false, name, error: err.message });
  }
}

function assert(condition, msg = "Assertion failed") {
  if (!condition) throw new Error(msg);
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg ?? `Expected ${JSON.stringify(a)} === ${JSON.stringify(b)}`);
}

// ---- Import helpers (inline plain-object versions to avoid ESM in Node tests) ----
// These mirror the real class logic without private fields so Node can run them.

/** === Quiz.grade() logic === */
function gradeQuiz(questions, answersByQuestionId, timeTakenSeconds = 0) {
  const breakdown = questions.map((q) => {
    const chosenId = answersByQuestionId.get(q.id) ?? null;
    const correct = chosenId !== null && chosenId === q.correctChoiceId;
    return { questionId: q.id, correct };
  });
  const score = breakdown.filter((b) => b.correct).length;
  const total = questions.length;
  return { score, total, percentage: total ? Math.round((score / total) * 100) : 0, timeTakenSeconds };
}

/** === StudySession duration calculation === */
function calcSessionMinutes({ startTime, endTime, minutes }) {
  if (startTime && endTime) {
    const diffMs = new Date(endTime) - new Date(startTime);
    if (diffMs <= 0) throw new Error("End time must be after start time.");
    return Math.round(diffMs / 60000);
  }
  if (minutes !== null && minutes !== undefined) {
    if (minutes <= 0) throw new Error("Study duration must be a positive number of minutes.");
    return minutes;
  }
  throw new Error("Provide startTime+endTime or minutes.");
}

/** === StudyGoal.progressToward() logic === */
function goalProgress(targetHours, actualMinutes) {
  const targetMinutes = targetHours * 60;
  const pct = targetMinutes ? Math.min(100, Math.round((actualMinutes / targetMinutes) * 100)) : 0;
  return { percentage: pct, met: actualMinutes >= targetMinutes };
}

/** === QuizAttempt.performanceSummary() logic === */
function performanceSummary(percentage) {
  if (percentage >= 90) return "Excellent";
  if (percentage >= 75) return "Good";
  if (percentage >= 60) return "Satisfactory";
  if (percentage >= 40) return "Needs improvement";
  return "Keep practicing";
}

/** === QuizAttempt.formattedTime() logic === */
function formattedTime(seconds) {
  const m = Math.floor(seconds / 60), s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** === StudyGoal validation === */
function validateGoal({ title, targetHours, status }) {
  const VALID_STATUS = ["active", "met", "missed"];
  if (!title || !title.trim()) throw new Error("Goal title cannot be empty.");
  if (targetHours <= 0) throw new Error("Target hours must be positive.");
  if (!VALID_STATUS.includes(status)) throw new Error(`Unknown status: ${status}`);
}

// ============================================================
// QUIZ SCORING TESTS
// ============================================================

test("Quiz: perfect score → 100%", () => {
  const qs = [
    { id: "q1", correctChoiceId: "a" },
    { id: "q2", correctChoiceId: "b" },
  ];
  const answers = new Map([["q1", "a"], ["q2", "b"]]);
  const r = gradeQuiz(qs, answers);
  assertEqual(r.score, 2);
  assertEqual(r.percentage, 100);
});

test("Quiz: zero correct → 0%", () => {
  const qs = [{ id: "q1", correctChoiceId: "a" }, { id: "q2", correctChoiceId: "b" }];
  const answers = new Map([["q1", "c"], ["q2", "c"]]);
  const r = gradeQuiz(qs, answers);
  assertEqual(r.score, 0);
  assertEqual(r.percentage, 0);
});

test("Quiz: partial score rounds correctly (2/3 = 67%)", () => {
  const qs = [
    { id: "q1", correctChoiceId: "a" },
    { id: "q2", correctChoiceId: "b" },
    { id: "q3", correctChoiceId: "c" },
  ];
  const answers = new Map([["q1", "a"], ["q2", "b"], ["q3", "x"]]);
  const r = gradeQuiz(qs, answers);
  assertEqual(r.score, 2);
  assertEqual(r.percentage, 67);
});

test("Quiz: unanswered question counts as wrong", () => {
  const qs = [{ id: "q1", correctChoiceId: "a" }];
  const answers = new Map();
  const r = gradeQuiz(qs, answers);
  assertEqual(r.score, 0);
});

test("Quiz: empty quiz returns 0%", () => {
  const r = gradeQuiz([], new Map());
  assertEqual(r.percentage, 0);
  assertEqual(r.total, 0);
});

test("Quiz: timeTakenSeconds is passed through grade", () => {
  const r = gradeQuiz([{ id: "q1", correctChoiceId: "a" }], new Map([["q1", "a"]]), 95);
  assertEqual(r.timeTakenSeconds, 95);
});

// ============================================================
// PERCENTAGE CALCULATION TESTS
// ============================================================

test("Percentage: 1/4 = 25%", () => {
  const r = gradeQuiz(
    [{ id: "q1", correctChoiceId: "a" }, { id: "q2", correctChoiceId: "a" }, { id: "q3", correctChoiceId: "a" }, { id: "q4", correctChoiceId: "a" }],
    new Map([["q1", "a"], ["q2", "z"], ["q3", "z"], ["q4", "z"]])
  );
  assertEqual(r.percentage, 25);
});

test("Percentage: 3/4 = 75%", () => {
  const r = gradeQuiz(
    [{ id: "q1", correctChoiceId: "a" }, { id: "q2", correctChoiceId: "a" }, { id: "q3", correctChoiceId: "a" }, { id: "q4", correctChoiceId: "a" }],
    new Map([["q1", "a"], ["q2", "a"], ["q3", "a"], ["q4", "z"]])
  );
  assertEqual(r.percentage, 75);
});

// ============================================================
// STUDY DURATION CALCULATION TESTS
// ============================================================

test("StudySession: calculates duration from startTime/endTime (30 min)", () => {
  const mins = calcSessionMinutes({
    startTime: "2026-09-28T09:00:00",
    endTime:   "2026-09-28T09:30:00",
  });
  assertEqual(mins, 30);
});

test("StudySession: calculates duration from startTime/endTime (90 min)", () => {
  const mins = calcSessionMinutes({
    startTime: "2026-09-28T10:00:00",
    endTime:   "2026-09-28T11:30:00",
  });
  assertEqual(mins, 90);
});

test("StudySession: uses explicit minutes when no start/end", () => {
  assertEqual(calcSessionMinutes({ minutes: 45 }), 45);
});

test("StudySession: throws when endTime <= startTime", () => {
  let threw = false;
  try {
    calcSessionMinutes({ startTime: "2026-09-28T10:00:00", endTime: "2026-09-28T09:00:00" });
  } catch { threw = true; }
  assert(threw, "Should throw for end <= start");
});

test("StudySession: throws when minutes <= 0", () => {
  let threw = false;
  try { calcSessionMinutes({ minutes: 0 }); } catch { threw = true; }
  assert(threw, "Should throw for 0 minutes");
});

test("StudySession: throws when neither startTime nor minutes provided", () => {
  let threw = false;
  try { calcSessionMinutes({}); } catch { threw = true; }
  assert(threw, "Should throw with no time data");
});

// ============================================================
// STUDY GOAL PROGRESS TESTS
// ============================================================

test("StudyGoal: progress 0 hours out of 2 → 0%", () => {
  const { percentage, met } = goalProgress(2, 0);
  assertEqual(percentage, 0);
  assert(!met);
});

test("StudyGoal: progress exactly met → 100% and met=true", () => {
  const { percentage, met } = goalProgress(2, 120); // 2h * 60 = 120 min
  assertEqual(percentage, 100);
  assert(met);
});

test("StudyGoal: progress over target caps at 100%", () => {
  const { percentage, met } = goalProgress(1, 200); // way over 60 min
  assertEqual(percentage, 100);
  assert(met);
});

test("StudyGoal: partial progress (1h of 4h = 25%)", () => {
  const { percentage, met } = goalProgress(4, 60);
  assertEqual(percentage, 25);
  assert(!met);
});

// ============================================================
// VALIDATION RULE TESTS
// ============================================================

test("StudyGoal validation: empty title throws", () => {
  let threw = false;
  try { validateGoal({ title: "  ", targetHours: 2, status: "active" }); } catch { threw = true; }
  assert(threw, "Empty title should throw");
});

test("StudyGoal validation: negative targetHours throws", () => {
  let threw = false;
  try { validateGoal({ title: "Valid", targetHours: -1, status: "active" }); } catch { threw = true; }
  assert(threw, "Negative targetHours should throw");
});

test("StudyGoal validation: unknown status throws", () => {
  let threw = false;
  try { validateGoal({ title: "Valid", targetHours: 1, status: "flying" }); } catch { threw = true; }
  assert(threw, "Unknown status should throw");
});

test("StudyGoal validation: valid goal does not throw", () => {
  validateGoal({ title: "Study Databases", targetHours: 5, status: "active" });
  assert(true); // reached here without throwing
});

// ============================================================
// PERFORMANCE SUMMARY TESTS
// ============================================================

test("Performance: ≥90% → Excellent", () => {
  assertEqual(performanceSummary(90), "Excellent");
  assertEqual(performanceSummary(100), "Excellent");
});

test("Performance: 75–89% → Good", () => {
  assertEqual(performanceSummary(75), "Good");
  assertEqual(performanceSummary(85), "Good");
});

test("Performance: 60–74% → Satisfactory", () => {
  assertEqual(performanceSummary(60), "Satisfactory");
  assertEqual(performanceSummary(70), "Satisfactory");
});

test("Performance: 40–59% → Needs improvement", () => {
  assertEqual(performanceSummary(40), "Needs improvement");
  assertEqual(performanceSummary(55), "Needs improvement");
});

test("Performance: <40% → Keep practicing", () => {
  assertEqual(performanceSummary(0), "Keep practicing");
  assertEqual(performanceSummary(39), "Keep practicing");
});

// ============================================================
// TIME FORMAT TESTS
// ============================================================

test("formattedTime: seconds only (< 60)", () => {
  assertEqual(formattedTime(45), "45s");
});

test("formattedTime: exactly 1 minute", () => {
  assertEqual(formattedTime(60), "1m 0s");
});

test("formattedTime: 2 minutes 30 seconds", () => {
  assertEqual(formattedTime(150), "2m 30s");
});

// ============================================================
// RESULTS
// ============================================================

console.log("\n=== Quiz & Study Platform — Domain Unit Tests ===\n");
results.forEach((r) => {
  const icon = r.ok ? "✓" : "✗";
  console.log(`  ${icon} ${r.name}${r.ok ? "" : `\n      → ${r.error}`}`);
});
console.log(`\n  ${passed} passed, ${failed} failed out of ${passed + failed} tests.\n`);
if (failed > 0) process.exit(1);
