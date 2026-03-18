# Sprint Module

Unified sprint state management. Replaces scattered state files with a single `sprint-state.json`.

## Files

- `index.ts` — Public API re-exports: `getSprintState`, `updateStoryStatus`, `getNextStory` (stub), `generateReport` (stub)
- `state.ts` — Core state read/write: `getSprintState()`, `updateStoryStatus()`, `writeStateAtomic()`, `defaultState()`, `computeSprintCounts()`. All return `Result<T>`.
- `migration.ts` — One-time migration from old format files (`.story_retries`, `sprint-status.yaml`, `ralph/status.json`) into `sprint-state.json`. Runs on first access when no state file exists.
- `types.ts` — Module-specific types: `StorySelection`, `StoryDetail`, `StatusReport`

## Patterns

- All public functions return `Result<T>` (never throw)
- Atomic writes via temp file + `renameSync`
- ES module imports with `.js` extensions
- State file: `sprint-state.json` in project root
