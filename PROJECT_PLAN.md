# Project Plan — Quiz & Study Tracker

Four-week development flow. Each week builds on the previous one; nothing
in an earlier week is thrown away, only extended.

## Week 1 — 25%: Design and Skeleton ✅

**Goal:** a clearly defined problem, service boundaries, OOP/domain model,
technology stack, project structure, and a runnable skeleton.

- [x] Problem definition
- [x] Service boundaries (User, Quiz, Study Tracker, Progress)
- [x] OOP domain model (`User`/`Student`, `Subject`, `Topic`, `Quiz`,
      `Question`, `Choice`, `QuizAttempt`, `QuizAnswer`, `StudySession`,
      `StudyGoal`, `ProgressRecord`)
- [x] Technology stack selected (vanilla HTML/CSS/JS, hash router,
      `localStorage` behind a `Repository` interface)
- [x] Runnable skeleton: builds/runs via a static file server, has basic
      routing/navigation, and an initial data structure (seeded demo data)
- [x] README + this project plan

## Week 2 — 50%: Core Quiz System

- Expand quiz content (more subjects/topics/quizzes/questions)
- Question types beyond single-answer multiple choice, if time allows
  (e.g. true/false as a specialization)
- Input validation and error states (e.g. submitting with unanswered
  questions, empty question banks)
- Quiz history pagination/filtering by subject
- Basic unit tests for `Quiz.grade()` and grading edge cases
- Replace the demo single-student assumption with a lightweight
  login/session flow through `UserService`

## Week 3 — 75%: Core Study Tracker + Progress Integration

**Goal:** connect the user, quiz, study, and progress services; document a
callable API; harden validation and errors; and test complete quiz and study
flows in a repeatable container.

- [x] Connect `UserService` to quiz submissions and study tracking; aggregate
  both through `ProgressService`
- [x] Calculate quiz averages, score range, attempt counts, correct and
  incorrect answers; calculate study totals, periods, streak, and goals
- [x] Detect review topics only after at least two recorded quiz attempts
  average below the documented 70% threshold
- [x] Show the 75% Week 3 milestone and integrated student progress on the
  dashboard
- [x] Document request/response schemas, authentication, endpoints, status
  codes, and standard errors in OpenAPI 3.1
- [x] Validate quiz answers, student identity, durations, subjects, topics,
  and goal inputs
- [x] Return sanitized errors for authentication, validation, invalid quiz
  submissions, missing resources, database failures, oversized requests,
  and request-body timeouts
- [x] Add a pinned, non-root Docker image with persistent API data storage
- [x] Add HTTP integration tests for quiz submission → result → progress and
  study session → goal → progress

**Known scope:** authentication protects the seeded demo student with a
server-configured bearer token; it is not a production login system.
The browser's existing demo UI still uses its own `localStorage`; the
containerized server exposes the separate persistent API documented in
`docs/openapi.yaml`.

## Week 4 — 100%: Polish, Testing, and Delivery

- Full responsive/accessibility pass (keyboard navigation, focus states,
  color contrast)
- Empty/loading/error states for every view
- End-to-end walkthrough test (seed → take quiz → log study → check
  progress) documented in README
- Data export (e.g. download quiz history / study log as CSV or JSON)
- Final documentation pass: architecture diagram, setup instructions,
  known limitations
- Optional: swap `LocalStorageRepository` for a real backend API,
  now trivial because services only depend on the `Repository` contract
