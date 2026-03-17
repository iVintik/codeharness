# Story 15.3: Retry State Management

Status: verifying

## Story

As a developer using codeharness,
I want consistent retry state tracking with a CLI reset command,
So that retry counts don't corrupt or stale-block stories across sessions.

## Acceptance Criteria

1. **Given** `ralph/.story_retries` exists, **When** any code reads or writes it, **Then** the format is strictly `{story_key}={count}` per line, with `=` as the only delimiter. Lines not matching this format are ignored with a warning. <!-- verification: cli-verifiable -->

2. **Given** a developer runs `codeharness retry --reset`, **When** executed, **Then** ALL entries in `ralph/.story_retries` are cleared and `ralph/.flagged_stories` is emptied. Prints `[OK] All retry counters and flagged stories cleared`. <!-- verification: cli-verifiable -->

3. **Given** a developer runs `codeharness retry --reset --story 2-1-dependency-auto-install`, **When** executed, **Then** only the specified story's entry is removed from `.story_retries` and `.flagged_stories`. Other entries are preserved. <!-- verification: cli-verifiable -->

4. **Given** a developer runs `codeharness retry --status`, **When** executed, **Then** it prints a table of all stories with retry counts and flagged status. `--json` flag produces machine-readable output. <!-- verification: cli-verifiable -->

5. **Given** the verify→dev loop (from 15-2) resets a story's retry count, **When** it writes to `.story_retries`, **Then** it uses the standardized `{key}={count}` format and removes any duplicate entries for that key. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Add `retry` command to CLI (AC: #2, #3, #4)
  - [x] 1.1: Create `src/commands/retry.ts` with `--reset`, `--story <key>`, `--status`, `--json` options
  - [x] 1.2: Register command in `src/index.ts`
  - [x] 1.3: Implement `--reset` (clear all) and `--reset --story` (clear one)
  - [x] 1.4: Implement `--status` with table and JSON output

- [x] Task 2: Create `src/lib/retry-state.ts` for shared retry read/write logic (AC: #1, #5)
  - [x] 2.1: `readRetries(dir): Map<string, number>` — parse `.story_retries`, warn on bad format
  - [x] 2.2: `writeRetries(dir, retries: Map<string, number>)` — write with strict `key=count` format
  - [x] 2.3: `getRetryCount(dir, storyKey): number` — convenience read
  - [x] 2.4: `setRetryCount(dir, storyKey, count): void` — convenience write, deduplicates
  - [x] 2.5: `resetRetry(dir, storyKey?): void` — clear one or all
  - [x] 2.6: `readFlaggedStories(dir): string[]` and `removeFlaggedStory(dir, key)` for `.flagged_stories`

- [x] Task 3: Write unit tests (AC: #1, #2, #3, #4, #5)
  - [x] 3.1: Tests for parsing strict format, ignoring bad lines
  - [x] 3.2: Tests for reset all, reset single, status output
  - [x] 3.3: Tests for deduplication on write
  - [x] 3.4: Tests for JSON output mode

## Dev Notes

### This Story Has TypeScript Code

Unlike 15-1 and 15-2 (markdown-only), this story adds a new CLI command and a shared library module. Tests are required.

### Key Files

| File | Purpose |
|------|---------|
| `src/commands/retry.ts` | **NEW** — CLI command for retry management |
| `src/lib/retry-state.ts` | **NEW** — shared retry state read/write |
| `src/lib/__tests__/retry-state.test.ts` | **NEW** — unit tests |
| `src/index.ts` | **MODIFY** — register new command |
| `ralph/.story_retries` | Data file — format standardized |
| `ralph/.flagged_stories` | Data file — managed by reset command |

### Current Format Problem

The `.story_retries` file had mixed formats:
```
13-3-black-box-verifier-agent 4        # space delimiter (ralph.sh wrote this)
2-1-dependency-auto-install=4           # = delimiter (harness-run.md wrote this)
0-1-sprint-execution-skill=3            # = delimiter
0-1-sprint-execution-skill 1            # duplicate with different delimiter and value
```

Multiple code paths write to this file with inconsistent serialization. The shared `retry-state.ts` module ensures one canonical format.

### Integration with harness-run.md and ralph.sh

After this story, harness-run.md Step 3d-vii should use the `retry-state.ts` functions instead of directly reading/writing the file. But since harness-run.md is a skill (markdown instructions, not code), it can't import TypeScript. Instead:
- The harness-run skill instructs the agent to use `codeharness retry --status --json` to read
- And `codeharness retry --reset --story {key}` to reset

Ralph.sh also reads/writes `.story_retries`. It should be updated to use `=` delimiter consistently. This is a minor fix in ralph.sh (search for `story_retries` writes).

### References

- [Source: sprint-change-proposal-2026-03-17.md — Section 4.5, 4.6]
- [Source: session-retro-2026-03-17.md — Action items A1, A13, A17, A18]
- [Source: ralph/ralph.sh — increment_story_retry, get_story_retry_count functions]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/15-3-retry-state-management.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (src/commands, src/lib)
- [ ] Exec-plan created in `docs/exec-plans/active/15-3-retry-state-management.md`

## Testing Requirements

- [x] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [x] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

N/A — no debugging needed.

### Completion Notes List

- All 3 tasks complete. 47 tests across 2 test files, 100% coverage on both new modules.
- Updated cli.test.ts to expect 17 registered commands (was 16).
- Command test file also created at `src/commands/__tests__/retry.test.ts` (not in original story plan but needed for command coverage).

### Change Log

- NEW: `src/lib/retry-state.ts` — shared retry state read/write (readRetries, writeRetries, getRetryCount, setRetryCount, resetRetry, readFlaggedStories, writeFlaggedStories, removeFlaggedStory)
- NEW: `src/commands/retry.ts` — CLI command: `codeharness retry --status`, `--reset`, `--reset --story <key>`, `--json`
- NEW: `src/lib/__tests__/retry-state.test.ts` — 30 unit tests for retry-state module
- NEW: `src/commands/__tests__/retry.test.ts` — 17 unit tests for retry command
- MODIFIED: `src/index.ts` — registered retry command
- MODIFIED: `src/__tests__/cli.test.ts` — updated command count from 16 to 17, added 'retry' to expected list

### Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.6 (1M context) on 2026-03-17

**Findings (3 HIGH, 1 MEDIUM fixed; 2 LOW deferred):**

1. **[HIGH][FIXED]** `--story` flag silently ignored without `--reset` — user could run `codeharness retry --story foo` with no `--reset`/`--status` and see all stories instead of the one they asked for. Fixed: now warns and shows filtered status for that story.
2. **[HIGH][FIXED]** No input validation on `--story` key — other commands (verify.ts) validate story IDs against path traversal and special characters. Added `isValidStoryKey()` with the same pattern.
3. **[HIGH][FIXED]** `RALPH_DIR = 'ralph'` used as bare relative path — inconsistent with other commands that use `join(process.cwd(), 'ralph', ...)`. Fixed to `join(process.cwd(), RALPH_SUBDIR)`.
4. **[MEDIUM][FIXED]** `--status --story` had no filtering support — AC #4 says `--status` prints a table, but `--story` flag could not filter the table view. Added `filterStory` parameter to `handleStatus`.
5. **[LOW][DEFERRED]** `run.ts` reads `.flagged_stories` directly instead of using shared `retry-state.ts` module. Story notes acknowledge this as future work.
6. **[LOW][DEFERRED]** No `try/catch` error handling around file operations in command handler — permission errors propagate unhandled. Consistent with other commands in codebase.

**Tests:** 55 tests (35 retry-state + 20 retry command), all passing. Coverage 100% on both modules.

**Coverage:** 95.31% overall, all 50 files above 80% per-file floor.

**Verdict:** All HIGH and MEDIUM issues fixed. Status set to `verifying`.

### File List

- `src/lib/retry-state.ts`
- `src/commands/retry.ts`
- `src/lib/__tests__/retry-state.test.ts`
- `src/commands/__tests__/retry.test.ts`
- `src/index.ts`
- `src/__tests__/cli.test.ts`
- `_bmad-output/implementation-artifacts/15-3-retry-state-management.md`
