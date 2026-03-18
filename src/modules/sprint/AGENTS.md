# Sprint Module

Unified sprint state management. Replaces scattered state files with a single `sprint-state.json`.

## Files

- `index.ts` — Public API: `getSprintState`, `updateStoryStatus`, `getNextStory` (delegates to selector, marks retry-exhausted as blocked), `generateReport` (delegates to reporter), `getStoryDrillDown` (delegates to drill-down via reporter re-export), `processVerifyResult` (delegates to feedback), `captureTimeoutReport` (delegates to timeout)
- `reporter.ts` — Report generation: `generateReport(state)` — computes sprint progress, epic counts, run summary, failed story details, labeled action items. Re-exports `getStoryDrillDown` from `drill-down.ts`. Pure function over SprintState, returns `Result<StatusReport>`.
- `drill-down.ts` — Story drill-down: `getStoryDrillDown(state, key)` — builds detailed view of a single story including AC verdicts, attempt history, and proof summary. Pure function, returns `Result<StoryDrillDown>`.
- `state.ts` — Core state read/write: `getSprintState()`, `updateStoryStatus()`, `writeStateAtomic()`, `defaultState()`, `computeSprintCounts()`. All return `Result<T>`.
- `selector.ts` — Story selection logic: `selectNextStory(state)` — prioritizes by tier (in-progress > verifying-with-proof > verifying > backlog), reports retry-exhausted stories. Exports `MAX_STORY_ATTEMPTS` constant.
- `migration.ts` — One-time migration from old format files (`.story_retries`, `sprint-status.yaml`, `ralph/status.json`) into `sprint-state.json`. Runs on first access when no state file exists.
- `timeout.ts` — Timeout capture: `captureTimeoutReport(opts)` — orchestrates git diff, state delta, and partial stderr capture on iteration timeout. Also exports `captureGitDiff()`, `captureStateDelta()`, `capturePartialStderr()`. All return `Result<T>`, never throw. Uses 5-second timeout on git commands.
- `feedback.ts` — Verify-dev feedback loop: `processVerifyResult(storyKey, opts?)` — reads proof document, extracts failing ACs, decides action (return-to-dev / mark-done / mark-blocked), writes verification findings to story file, updates sprint state. Also exports `parseProofForFailures(proofPath)` and `writeVerificationFindings(storyKey, failingAcs)`. All return `Result<T>`, never throw. Default max attempts: 10.
- `types.ts` — Module-specific types: `StorySelection`, `StoryDetail`, `StatusReport`, `SelectionResult`, `RetryExhaustedInfo`, `FailedStoryDetail`, `LabeledActionItem`, `RunSummary`, `StoryDrillDown`, `AcDetail`, `AttemptRecord`, `ProofSummary`, `TimeoutCapture`, `TimeoutReport`, `FailingAc`, `FeedbackResult`

## Patterns

- All public functions return `Result<T>` (never throw)
- Atomic writes via temp file + `renameSync`
- ES module imports with `.js` extensions
- State file: `sprint-state.json` in project root
