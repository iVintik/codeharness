# Story 14-7: Fix Beads Sync, Session Flags, Ralph Story Tracking, Proof Docs
<!-- verification-tier: unit-testable -->

## Status: done

## Story

As a developer,
I want chronic infrastructure bugs fixed,
So that sessions stop wasting time on known issues.

## Acceptance Criteria

- [x] AC1: Given a story file with `## Status: backlog` header, when `readStoryFileStatus()` runs, then it returns `'backlog'` (handles `##` prefix) <!-- verification: cli-verifiable -->
- [x] AC2: Given `bd` CLI is not installed, when `codeharness sync` runs, then it prints `[INFO] beads CLI not installed -- skipping` (not `[FAIL]`) <!-- verification: cli-verifiable -->
- [x] AC3: Given `cargo test` passes, when `codeharness.local.md` is checked, then `session_flags.tests_passed` is `true` <!-- verification: cli-verifiable -->
- [x] AC4: Given ralph times out during a story, when timeout report is generated, then `status.json` contains the correct `story` field (not `unknown`) <!-- verification: cli-verifiable -->
- [x] AC5: Given the codeharness proof format, when `commands/harness-verify.md` is read, then the expected markdown structure is documented <!-- verification: cli-verifiable -->

## Technical Notes

This is a bug-fix bundle. Five chronic issues that waste session time repeatedly.

### Fix 1: Story file status parsing (AC1)

`readStoryFileStatus()` in `src/lib/beads-sync.ts` (or `src/lib/sync/story-files.ts` after Epic 12) fails to parse `## Status: backlog` because it looks for `# Status:` (single `#`). Fix the regex to handle both `#` and `##` prefixes:

```typescript
const match = content.match(/^#{1,2}\s*Status:\s*(.+)/m);
```

### Fix 2: Beads CLI not installed (AC2)

`src/lib/beads-sync.ts` and `src/lib/beads.ts` throw errors when `bd` CLI is not installed. Use `BeadsNotInstalledError` (Decision 7) and handle gracefully:

```typescript
try {
  execSync('which bd', { stdio: 'pipe' });
} catch {
  output.info('beads CLI not installed — skipping');
  return ok(null);
}
```

The error type `BeadsNotInstalledError` should be defined per Decision 7.

### Fix 3: Session flags for Rust tests (AC3)

After `cargo test` passes during verification or dev, `session_flags.tests_passed` in `codeharness.local.md` is not being set. The flag-setting logic only triggers for `npm test` results. Add cargo test exit code handling:

Check `src/lib/state.ts` or wherever session flags are written. Ensure the test-pass detection works for all stacks, not just Node.js.

### Fix 4: Ralph timeout story tracking (AC4)

When ralph times out, `ralph/status.json` (or `sprint-state.json` `session` field after Epic 11) has `story: 'unknown'` because the story key isn't passed to the timeout handler. Ensure `src/commands/timeout-report.ts` and the ralph timeout handler receive the current story key.

### Fix 5: Proof format documentation (AC5)

Document the expected proof markdown structure in `commands/harness-verify.md` so the verify subagent knows what format to produce. This is a documentation-only change to the Claude Code plugin command file.

## Tasks/Subtasks

- [x] Fix 1: Update `readStoryFileStatus()` regex to handle `##` prefix in `src/lib/sync/story-files.ts`
- [x] Fix 1: Update `updateStoryFileStatus()` regex to handle `##` prefix and preserve format
- [x] Fix 1: Add tests for `## Status:` parsing and updating
- [x] Fix 2: Add `BeadsNotInstalledError` class and `isBeadsCLIInstalled()` to `src/lib/beads.ts`
- [x] Fix 2: Add early `isBeadsCLIInstalled()` check to sync command with graceful `[INFO]` skip
- [x] Fix 2: Add tests for `BeadsNotInstalledError`, `isBeadsCLIInstalled()`, and sync skip behavior
- [x] Fix 3: Verify and add test proving `updateCoverageState` sets `tests_passed` for Rust stack
- [x] Fix 4: Update `get_current_task()` in `ralph.sh` to read story key from `sprint-state.json`
- [x] Fix 4: Add `story` field to `update_status()` JSON output in `ralph.sh`
- [x] Fix 5: Document expected proof markdown structure in `commands/harness-verify.md`

## Files to Change

- `src/lib/beads-sync.ts` — Fix `readStoryFileStatus()` regex to handle `##` prefix
- `src/lib/beads-sync.ts` — Add `BeadsNotInstalledError` handling, graceful skip when `bd` not installed
- `src/lib/beads.ts` — Add `BeadsNotInstalledError` class, check `bd` availability before operations
- `src/lib/state.ts` — Fix session flag writing to work for all stacks (cargo test, pytest, npm test)
- `src/commands/timeout-report.ts` — Pass current story key to timeout handler, ensure `status.json` has correct story field
- `src/lib/run-helpers.ts` — Ensure story key is propagated to ralph timeout handling
- `commands/harness-verify.md` — Document the expected proof markdown structure

## Dev Agent Record

### Implementation Notes

**Fix 1 (AC1):** Changed regex in `readStoryFileStatus()` from `/^Status:\s*(.+)$/m` to `/^#{0,2}\s*Status:\s*(.+)$/m` to handle both bare `Status:`, `# Status:`, and `## Status:` prefixes. Updated `updateStoryFileStatus()` similarly with a capture group to preserve the original prefix format.

**Fix 2 (AC2):** Added `BeadsNotInstalledError` class and `isBeadsCLIInstalled()` function to `src/lib/beads.ts`. The check uses `execFileSync('which', ['bd'])`. The sync command now checks for bd availability early and prints `[INFO] beads CLI not installed -- skipping` instead of throwing. The check is at the command level (not in `bdCommand()`) to avoid breaking all existing tests.

**Fix 3 (AC3):** The coverage runner already handles all stacks (Node.js, Python, Rust) through `detectCoverageTool()` and the parser already parses cargo test output. `updateCoverageState()` is stack-agnostic — it sets `tests_passed` from `result.testsPassed`. Added an explicit test proving the flow works for Rust stack projects.

**Fix 4 (AC4):** Updated `get_current_task()` in `ralph.sh` to read the first in-progress or ready-for-dev story from `sprint-state.json` using jq. Added a `story` field to `update_status()` JSON output. The timeout report now receives the correct story key instead of `unknown`.

**Fix 5 (AC5):** Added "Expected Proof Document Format" section to `commands/harness-verify.md` documenting the required markdown structure including sections, showboat exec blocks, and rules.

## File List

- `src/lib/sync/story-files.ts` — Fixed regex in `readStoryFileStatus()` and `updateStoryFileStatus()`
- `src/lib/beads.ts` — Added `BeadsNotInstalledError` class and `isBeadsCLIInstalled()` function
- `src/commands/sync.ts` — Added early `isBeadsCLIInstalled()` check with graceful skip
- `src/lib/coverage/__tests__/evaluator.test.ts` — Added Rust stack session_flags test
- `src/lib/sync/__tests__/beads-sync.test.ts` — Added `## Status:` parsing and updating tests
- `src/lib/__tests__/beads.test.ts` — Added `BeadsNotInstalledError` and `isBeadsCLIInstalled()` tests
- `src/commands/__tests__/sync.test.ts` — Added mock for `isBeadsCLIInstalled`, added skip test
- `ralph/ralph.sh` — Updated `get_current_task()` and `update_status()` for story tracking
- `commands/harness-verify.md` — Added proof format documentation

## Senior Developer Review (AI)

**Date:** 2026-03-25
**Reviewer:** Claude Opus 4.6 (adversarial review)
**Outcome:** APPROVED — all ACs implemented, all tasks verified, no HIGH/MEDIUM issues found

### AC Validation

| AC | Status | Evidence |
|----|--------|----------|
| AC1 | IMPLEMENTED | `readStoryFileStatus()` regex `#{0,2}\s*Status:` handles bare, `#`, and `##` prefixes. Tests at beads-sync.test.ts lines 133-147. Added boundary test proving `###` does NOT match. |
| AC2 | IMPLEMENTED | `isBeadsCLIInstalled()` in beads.ts, early check in sync.ts lines 41-44, test at sync.test.ts line 211. |
| AC3 | IMPLEMENTED | `updateCoverageState()` is stack-agnostic; Rust test at evaluator.test.ts lines 211-235. |
| AC4 | IMPLEMENTED | `get_current_task()` reads from sprint-state.json, `update_status()` includes `story` field in JSON output. |
| AC5 | IMPLEMENTED | "Expected Proof Document Format" section in commands/harness-verify.md lines 121-165. |

### Task Audit

All 10 tasks marked [x] verified against implementation.

### Findings

- **No HIGH or MEDIUM issues.** Implementation is clean and well-tested.
- **Added 1 boundary test:** `readStoryFileStatus` with `### Status:` (triple hash) to prove regex does NOT match beyond `##`.

### Notes

- Coverage: 96.97% overall (target 90%), all 156 files above 80% per-file floor.
- All 3742 tests pass (3741 existing + 1 new boundary test).

## Change Log

- 2026-03-25: Implemented all 5 fixes (AC1-AC5). Fixed story file status parsing for `##` prefix, added graceful beads CLI detection, verified Rust test flag flow, fixed ralph story tracking, documented proof format.
- 2026-03-25: Code review passed. Added boundary test for triple-hash regex exclusion. Status → verifying.
