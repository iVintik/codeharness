# Dev Module

Story development execution. Invokes BMAD dev-story workflow via child_process and returns structured results.

## Files

- `index.ts` — Public API: `developStory(key, opts?)` — delegates to orchestrator, re-exports `DevResult` type. Only public interface for the module.
- `orchestrator.ts` — Workflow invocation: `invokeBmadDevStory(key, opts?)` — spawns `claude --print` with BMAD dev-story prompt, captures git diff for `filesChanged`, counts test files for `testsAdded`, truncates output to last 200 lines. Handles timeout (killed/SIGTERM) and non-zero exit errors. Internal to module.
- `types.ts` — Module-specific types: `DevResult` (key, filesChanged, testsAdded, duration, output — all readonly)

## Patterns

- All public functions return `Result<T>` (never throw)
- Uses `execFileSync` for main workflow, `execSync` for git commands
- ES module imports with `.js` extensions
- Default timeout: 25 minutes (1,500,000ms)
- Git commands have 5-second timeout
- Output truncated to last 200 lines
- File deduplication across git diff sources (unstaged, staged, untracked)
