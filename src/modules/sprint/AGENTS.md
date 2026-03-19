# Sprint Module

Unified sprint state management. Replaces scattered state files with a single `sprint-state.json`.

## Files

- `index.ts` — Public API: `getSprintState`, `updateStoryStatus`, `getNextStory` (delegates to selector, marks retry-exhausted as blocked), `generateReport` (delegates to reporter), `getStoryDrillDown` (reads state, looks up latest timeout report via `findLatestTimeoutReport`, passes `timeoutSummary` to drill-down), `processVerifyResult` (delegates to feedback), `captureTimeoutReport` (delegates to timeout), `writeStateAtomic` (delegates to state), `computeSprintCounts` (delegates to state)
- `reporter.ts` — Report generation: `generateReport(state)` — computes sprint progress, epic counts, run summary, failed story details, labeled action items. Re-exports `getStoryDrillDown` from `drill-down.ts`. Pure function over SprintState, returns `Result<StatusReport>`.
- `drill-down.ts` — Story drill-down: `getStoryDrillDown(state, key, opts?)` — builds detailed view of a single story including AC verdicts, attempt history, proof summary, and optional timeout summary. Pure function (timeout data injected via opts), returns `Result<StoryDrillDown>`.
- `state.ts` — Core state read/write: `getSprintState()`, `updateStoryStatus()`, `writeStateAtomic()`, `defaultState()`, `computeSprintCounts()`, `updateRunProgress(update)`, `clearRunProgress()`. All return `Result<T>`.
- `selector.ts` — Story selection logic: `selectNextStory(state)` — prioritizes by tier (in-progress > verifying-with-proof > verifying > backlog), reports retry-exhausted stories. Exports `MAX_STORY_ATTEMPTS` constant.
- `migration.ts` — One-time migration from old format files (`.story_retries`, `sprint-status.yaml`, `ralph/status.json`) into `sprint-state.json`. Runs on first access when no state file exists.
- `timeout.ts` — Timeout capture: `captureTimeoutReport(opts)` — orchestrates git diff, state delta, and partial stderr capture on iteration timeout. Also exports `captureGitDiff()`, `captureStateDelta()`, `capturePartialStderr()`, `findLatestTimeoutReport(storyKey)` (scans ralph/logs/ for latest timeout report, returns `TimeoutSummary | null`). All return `Result<T>`, never throw. Uses 5-second timeout on git commands.
- `feedback.ts` — Verify-dev feedback loop: `processVerifyResult(storyKey, opts?)` — reads proof document, extracts failing ACs, decides action (return-to-dev / mark-done / mark-blocked), writes verification findings to story file, updates sprint state. Also exports `parseProofForFailures(proofPath)` and `writeVerificationFindings(storyKey, failingAcs)`. All return `Result<T>`, never throw. Default max attempts: 10.
- `validator.ts` — State consistency validator: `validateStateConsistency(statePath, sprintStatusPath)` — reads sprint-state.json and sprint-status.yaml, checks for missing stories, status mismatches, invalid statuses, and orphaned entries. Returns `Result<ValidationReport>` with issues list and valid boolean.
- `types.ts` — Module-specific types: `RunProgressUpdate`, `StorySelection`, `StoryDetail`, `StatusReport`, `SelectionResult`, `RetryExhaustedInfo`, `FailedStoryDetail`, `LabeledActionItem`, `RunSummary`, `StoryDrillDown`, `AcDetail`, `AttemptRecord`, `ProofSummary`, `TimeoutCapture`, `TimeoutReport`, `TimeoutSummary`, `FailingAc`, `FeedbackResult`

## Patterns

- All public functions return `Result<T>` (never throw)
- Atomic writes via temp file + `renameSync`
- ES module imports with `.js` extensions
- State file: `sprint-state.json` in project root
