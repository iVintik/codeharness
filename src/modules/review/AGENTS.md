# Review Module

Code review execution. Invokes BMAD code-review workflow via child_process and returns structured results.

## Files

- `index.ts` — Public API: `reviewStory(key, opts?)` — delegates to orchestrator, re-exports `ReviewResult` type. Only public interface for the module.
- `orchestrator.ts` — Workflow invocation: `invokeBmadCodeReview(key, opts?)` — spawns `claude --print` with BMAD code-review prompt, parses review output for approval/rejection signals, extracts comment lines. Handles timeout (killed/SIGTERM) and non-zero exit errors. Internal to module.
- `types.ts` — Module-specific types: `ReviewResult` (key, approved, comments, duration, output — all readonly)
- `__tests__/observability-patch.test.ts` — Validates that `patches/review/enforcement.md` and `patches/dev/enforcement.md` contain required observability sections and Semgrep instructions. Also validates Semgrep JSON output format contract.

## Patterns

- All public functions return `Result<T>` (never throw)
- Uses `execFileSync` for main workflow
- ES module imports with `.js` extensions
- Default timeout: 25 minutes (1,500,000ms)
- Output truncated to last 200 lines
- Approval detection uses heuristic keyword matching on review output
- Defaults to `approved: true` when no rejection signals detected
