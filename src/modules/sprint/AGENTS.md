# Sprint Module

Unified sprint state management. Replaces scattered state files with a single `sprint-state.json`.

## Files

- `index.ts` — Public API: `getSprintState`, `updateStoryStatus`, `getNextStory` (delegates to selector, marks retry-exhausted as blocked), `generateReport` (stub)
- `state.ts` — Core state read/write: `getSprintState()`, `updateStoryStatus()`, `writeStateAtomic()`, `defaultState()`, `computeSprintCounts()`. All return `Result<T>`.
- `selector.ts` — Story selection logic: `selectNextStory(state)` — prioritizes by tier (in-progress > verifying-with-proof > verifying > backlog), reports retry-exhausted stories.
- `migration.ts` — One-time migration from old format files (`.story_retries`, `sprint-status.yaml`, `ralph/status.json`) into `sprint-state.json`. Runs on first access when no state file exists.
- `types.ts` — Module-specific types: `StorySelection`, `StoryDetail`, `StatusReport`, `SelectionResult`, `RetryExhaustedInfo`

## Patterns

- All public functions return `Result<T>` (never throw)
- Atomic writes via temp file + `renameSync`
- ES module imports with `.js` extensions
- State file: `sprint-state.json` in project root
