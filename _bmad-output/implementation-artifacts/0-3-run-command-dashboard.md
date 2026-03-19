# Story 0.3: Run Command Dashboard Output

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an operator,
I want `codeharness run` to show a clean dashboard during execution,
so that I see structured progress instead of raw ralph logs.

## Acceptance Criteria

1. **Given** `codeharness run` starts, **When** output is displayed, **Then** it shows: sprint summary (done/remaining), current story, phase — not raw ralph debug/info lines. <!-- verification: cli-verifiable -->
2. **Given** ralph prints a story completion line, **When** the dashboard displays it, **Then** format is: `✓ Story {key}: DONE ({duration}, ${cost})`. <!-- verification: cli-verifiable -->
3. **Given** ralph prints a failure, **When** displayed, **Then** format is: `✗ Story {key}: FAIL at AC {n} — {one-line error}`. <!-- verification: cli-verifiable -->
4. **Given** `--quiet` flag, **When** run starts, **Then** all output is suppressed (background mode). <!-- verification: cli-verifiable -->
5. **Given** no `--quiet` flag, **When** ralph is running Claude, **Then** dashboard shows: `◆ {story_key} — {phase} (elapsed {time})` updating every 10 seconds. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Create `DashboardFormatter` class in `src/lib/dashboard-formatter.ts` (AC: #1, #2, #3, #5)
  - [x] Define interface with `formatLine(rawLine: string): string | null` method — returns formatted string or null to suppress
  - [x] Parse ralph `[SUCCESS]` lines containing "Story {key}: DONE" and reformat as `✓ Story {key}: DONE ({duration}, ${cost})`
  - [x] Parse ralph `[FAIL]` lines containing story failure info and reformat as `✗ Story {key}: FAIL at AC {n} — {one-line error}`
  - [x] Parse ralph `[INFO]` lines containing sprint progress and reformat as sprint summary (done/remaining)
  - [x] Suppress all other `[INFO]`, `[DEBUG]`, and noise lines — return null
- [x] Add live progress ticker to `DashboardFormatter` (AC: #5)
  - [x] Track `currentStory`, `currentPhase`, `startTime` from parsed ralph output
  - [x] Expose `getTickerLine(): string | null` that returns `◆ {story_key} — {phase} (elapsed {time})` when a story is active
  - [x] Format elapsed time as `Xm Ys`
- [x] Integrate `DashboardFormatter` into `run.ts` `filterOutput` function (AC: #1, #2, #3)
  - [x] Replace the current simple `[DEBUG]` filter with `DashboardFormatter.formatLine()` calls
  - [x] Pass formatted output to `process.stdout.write()`, skip null returns
- [x] Add 10-second ticker interval to `run.ts` when not `--quiet` (AC: #5)
  - [x] After spawning ralph, start a `setInterval(10000)` that calls `formatter.getTickerLine()`
  - [x] Write ticker line to stdout with `\r` (carriage return) for in-place update
  - [x] Clear interval on child process exit
- [x] Verify `--quiet` flag suppresses all output including ticker (AC: #4)
  - [x] Existing `stdio: 'ignore'` already handles stdout/stderr suppression
  - [x] Ensure ticker interval is NOT started when `--quiet` is true
- [x] Write unit tests for `DashboardFormatter` (AC: #1, #2, #3, #5)
  - [x] Test: `[SUCCESS] Story 1-1-foo: DONE` → `✓ Story 1-1-foo: DONE ({duration}, ${cost})`
  - [x] Test: `[FAIL] Story 1-1-foo: FAIL` → `✗ Story 1-1-foo: FAIL at AC {n} — {error}`
  - [x] Test: `[DEBUG] ...` → null (suppressed)
  - [x] Test: `[INFO] Sprint: 5/12 done...` → formatted sprint summary
  - [x] Test: `getTickerLine()` returns `◆ {key} — {phase} (elapsed Xm Ys)` when story active
  - [x] Test: `getTickerLine()` returns null when no story active
- [x] Write integration tests for `run.ts` dashboard output (AC: #1, #4)
  - [x] Test: spawned ralph output goes through formatter, not raw to stdout
  - [x] Test: `--quiet` mode does not start ticker interval
- [x] Verify <300 lines for new file `dashboard-formatter.ts` (NFR)

## Dev Notes

### Existing Infrastructure — What's Already Done

Stories 0.1 and 0.2 are complete:

- **Story 0.1** added `codeharness progress` command and live `sprint-state.json` updates with fields: `run.currentStory`, `run.currentPhase`, `run.lastAction`, `run.acProgress`, `run.cost`, `run.completed`, `run.failed`.
- **Story 0.2** made ralph poll `sprint-state.json` and display structured progress with icons (✓/✗/✕), suppressed startup noise to DEBUG level.

The current `run.ts` (`src/commands/run.ts`) already:
- Has a `--quiet` flag that sets `stdio: 'ignore'` on the spawned ralph process (AC #4 is partially done)
- Pipes ralph stdout/stderr through a `filterOutput` function that suppresses `[DEBUG]` lines
- Spawns ralph as a child process and waits for exit

### Key Files to Modify

- `src/commands/run.ts` — Replace `filterOutput` with `DashboardFormatter` integration, add ticker interval
- `src/commands/__tests__/run.test.ts` — Add tests for dashboard output integration

### Key Files to Create

- `src/lib/dashboard-formatter.ts` — New module: line parsing, reformatting, ticker state
- `src/lib/__tests__/dashboard-formatter.test.ts` — Unit tests for formatter

### Key Files to Read (do NOT modify)

- `src/types/state.ts` — `SprintState` interface with `run.*` fields
- `ralph/ralph.sh` — Ralph output format (what lines to parse)
- `0-1-sprint-state-live-updates.md` — Data contract for sprint-state.json
- `0-2-ralph-progress-display.md` — Ralph's output format established in that story

### Dashboard Formatter Design

The formatter is a stateful class that parses ralph output lines and reformats them:

```typescript
export class DashboardFormatter {
  private currentStory: string | null = null;
  private currentPhase: string | null = null;
  private phaseStartTime: number | null = null;

  formatLine(rawLine: string): string | null {
    // Returns formatted string or null to suppress
  }

  getTickerLine(): string | null {
    // Returns live status line or null
  }
}
```

**Line parsing patterns** (from ralph's output after Story 0.2):

| Ralph output pattern | Dashboard format |
|---------------------|-----------------|
| `[SUCCESS] Story {key}: DONE` | `✓ Story {key}: DONE ({duration}, ${cost})` |
| `[FAIL] Story {key}: ...` | `✗ Story {key}: FAIL at AC {n} — {error}` |
| `[INFO] Sprint: X/Y done...` | Sprint summary line (pass through reformatted) |
| `[INFO] Story {key}: {phase}` | Update internal state for ticker, suppress line |
| `[DEBUG] ...` | null (suppress) |
| `[INFO] Plugin: ...` | null (suppress — startup noise) |
| `[LOOP] ...` | Pass through (loop lifecycle events) |
| `[WARN] ...` | Pass through (warnings are actionable) |

### Ticker Interval

```typescript
if (!quiet && child.stdout) {
  const tickerInterval = setInterval(() => {
    const line = formatter.getTickerLine();
    if (line) {
      process.stdout.write(`\r${line}`);
    }
  }, 10_000);

  child.on('close', () => clearInterval(tickerInterval));
}
```

The ticker overwrites the current line with `\r` so it doesn't scroll. When a real event line comes in, it prints with `\n` which pushes the ticker down naturally.

### Elapsed Time Format

```typescript
function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
}
```

### Duration and Cost Extraction

Ralph's `[SUCCESS]` story completion lines from Story 0.2 include cost and elapsed info from `sprint-state.json`. The formatter extracts these via regex from the raw line. If not present, omit from formatted output.

### Critical Constraints

- **One new file** — `src/lib/dashboard-formatter.ts` (plus its test file)
- **<300 lines** per file (NFR9)
- **Backward compatible** — If ralph output format doesn't match expected patterns, pass lines through unchanged
- **No modification of ralph.sh** — This story formats ralph's existing output, does not change what ralph emits
- **No modification of sprint-state.json** — Read-only from run.ts perspective

### What This Story Does NOT Include

- No changes to ralph.sh — ralph's output format was set in Story 0.2
- No changes to sprint-state.json writing — that's Story 0.1
- No TUI framework (blessed, ink, etc.) — plain stdout formatting only
- No color support — icons (✓/✗/◆) provide visual distinction without ANSI colors

### Testing Approach

Unit tests for `DashboardFormatter` in isolation — feed it raw lines, assert formatted output. Integration tests in `run.test.ts` — verify formatter is wired into the spawn pipeline and ticker starts/stops correctly.

### References

- [Source: _bmad-output/planning-artifacts/epics-operational-excellence.md#Story 0.3] — acceptance criteria and user story
- [Source: _bmad-output/implementation-artifacts/0-2-ralph-progress-display.md] — predecessor story, ralph output format
- [Source: _bmad-output/implementation-artifacts/0-1-sprint-state-live-updates.md] — data contract for sprint-state.json
- [Source: src/commands/run.ts] — current filterOutput implementation to replace
- [Source: src/types/state.ts] — SprintState.run interface

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [x] Showboat proof document created (`verification/0-3-run-command-dashboard-proof.md`)
- [x] All acceptance criteria verified with real-world evidence
- [x] Test coverage meets target (100%)

## Documentation Requirements

- [x] Relevant AGENTS.md files updated (src/lib/AGENTS.md if it exists)
- [x] Exec-plan created in `docs/exec-plans/active/0-3-run-command-dashboard.md`

## Testing Requirements

- [x] Unit tests written for all new/changed code
- [x] Integration tests for cross-module interactions
- [x] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
