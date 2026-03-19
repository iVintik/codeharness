# Story 0.2: Ralph Progress Display

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an operator,
I want ralph to show a rolling status between iterations,
so that I see what completed, what's next, and overall progress without reading files.

## Acceptance Criteria

1. **Given** ralph polls `sprint-state.json` while Claude runs, **When** progress changes, **Then** ralph prints a structured update line: `[INFO] Story {key}: {phase} ({detail})`. <!-- verification: cli-verifiable -->
2. **Given** an iteration completes, **When** ralph processes the result, **Then** it prints: completed stories (✓), failed stories (✗), blocked stories (✕), and next story. <!-- verification: cli-verifiable -->
3. **Given** ralph is between iterations, **When** it prints progress, **Then** it shows: iteration count, elapsed time, cost, stories done/total. <!-- verification: cli-verifiable -->
4. **Given** ralph startup, **When** it prints initial status, **Then** it suppresses internal config lines (Platform driver, Plugin path, etc.) and shows only the sprint summary. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Add `poll_sprint_state_progress()` function to ralph.sh (AC: #1)
  - [x] Read `sprint-state.json` fields: `run.currentStory`, `run.currentPhase`, `run.lastAction`, `run.acProgress`
  - [x] Track previous values in shell variables to detect changes
  - [x] On change, print: `[INFO] Story {currentStory}: {currentPhase} ({lastAction})`
  - [x] When `acProgress` changes, print: `[INFO] Story {currentStory}: verify (AC {acProgress})`
- [x] Integrate progress polling into `execute_iteration()` background monitoring loop (AC: #1)
  - [x] In the `while kill -0 $claude_pid` loop (line ~627), call `poll_sprint_state_progress()` each cycle (every 10 seconds)
  - [x] Only poll when NOT in LIVE_OUTPUT mode (background mode already has the 10s sleep loop)
- [x] Enhance `print_progress_summary()` to show iteration results with status icons (AC: #2)
  - [x] After detecting changed stories, print completed with ✓ prefix (already partially done via `log_status "SUCCESS"`)
  - [x] Print failed stories with ✗ prefix from `sprint-state.json` `run.failed` array
  - [x] Print blocked/flagged stories with ✕ prefix from `FLAGGED_STORIES_FILE`
  - [x] Print next story at end of summary
- [x] Enhance `print_progress_summary()` to include cost (AC: #3)
  - [x] Read `run.cost` from `sprint-state.json` if available
  - [x] Add cost to progress line: `Progress: {done}/{total} done, {remaining} remaining (iterations: {n}, elapsed: {time}, cost: ${cost})`
- [x] Suppress startup config noise and show sprint summary instead (AC: #4)
  - [x] Replace startup `log_status "INFO"` lines for Plugin path, Platform driver, Sprint status file, Prompt file, Max iterations with `log_status "DEBUG"` so they only appear in log file
  - [x] Add a new `print_sprint_summary()` function that prints: total stories, done, remaining, next story — in a compact block
  - [x] Call `print_sprint_summary()` after `log_status "SUCCESS" "Ralph loop starting"` in `main()`
- [x] Write BATS integration tests for new output (AC: #1, #2, #3, #4)
  - [x] Test that `poll_sprint_state_progress()` prints structured update when `sprint-state.json` changes
  - [x] Test that iteration result shows ✓/✗/✕ icons
  - [x] Test that progress summary includes cost when available
  - [x] Test that startup output does NOT contain "Platform driver:" or "Plugin:" lines (only DEBUG level)

## Dev Notes

### Existing Infrastructure — What's Already Done

Story 0.1 is complete. `sprint-state.json` now has live run progress fields:

```json
{
  "run": {
    "active": true,
    "iteration": 3,
    "cost": 4.52,
    "completed": ["0-1-sprint-state-live-updates"],
    "failed": [],
    "currentStory": "1-1-semgrep-rules-for-observability",
    "currentPhase": "verify",
    "lastAction": "Running AC verification 3/5",
    "acProgress": "3/5"
  }
}
```

These fields are updated atomically by the Claude session via `codeharness progress` CLI during `harness-run.md` execution. Ralph just needs to READ them.

### Key Files to Modify

- `ralph/ralph.sh` — All changes are here:
  - `execute_iteration()` (line ~549) — Add progress polling in the background monitoring loop
  - `print_progress_summary()` (line ~449) — Enhance with status icons and cost
  - `main()` (line ~797) — Suppress config lines, add sprint summary at startup

### Key Files to Read (do NOT modify)

- `src/types/state.ts` — `SprintState` interface with `run.currentStory`, `run.currentPhase`, `run.lastAction`, `run.acProgress` fields
- `src/modules/sprint/state.ts` — `updateRunProgress()` and `clearRunProgress()` functions (these write; ralph reads)
- `0-1-sprint-state-live-updates.md` — Predecessor story, explains the data contract

### Progress Polling Design

The background monitoring loop in `execute_iteration()` already runs every 10 seconds:

```bash
while kill -0 $claude_pid 2>/dev/null; do
    progress_counter=$((progress_counter + 1))
    if [[ -f "$output_file" && -s "$output_file" ]]; then
        cp "$output_file" "$LIVE_LOG_FILE" 2>/dev/null
    fi
    sleep 10
done
```

Add a call to `poll_sprint_state_progress` inside this loop. The function reads `sprint-state.json` with `jq`, compares to previous values stored in shell variables, and prints a structured line on change.

Shell variables for tracking previous state:

```bash
PREV_STORY=""
PREV_PHASE=""
PREV_AC_PROGRESS=""
PREV_LAST_ACTION=""
```

### Startup Suppression

Current startup output (lines 882-887):

```bash
log_status "SUCCESS" "Ralph loop starting"
log_status "INFO" "Plugin: $PLUGIN_DIR"
log_status "INFO" "Max iterations: $MAX_ITERATIONS | Timeout: $((LOOP_TIMEOUT_SECONDS / 3600))h"
log_status "INFO" "Prompt: $PROMPT_FILE"
log_status "INFO" "Sprint status: $SPRINT_STATUS_FILE"
log_status "INFO" "Max story retries: $MAX_STORY_RETRIES"
```

Change the INFO lines to DEBUG, then add:

```bash
print_sprint_summary
```

Which prints something like:

```
[SUCCESS] Ralph loop starting
[INFO] Sprint: 5/12 done, 7 remaining — next: 0-2-ralph-progress-display (backlog)
```

### Cost Tracking

`sprint-state.json` has `run.cost` (number, in dollars). Read it with:

```bash
local cost=$(jq -r '.run.cost // 0' sprint-state.json 2>/dev/null)
```

Format as `$X.XX` in the progress summary.

### Iteration Result Icons (AC #2)

The iteration result handling in `main()` (lines 998-1018) already prints `log_status "SUCCESS" "Story ${skey}: DONE"` for changed stories. Enhance to also show:

- Failed: Read `run.failed` array from `sprint-state.json` after iteration, print with ✗
- Blocked/flagged: Read from `FLAGGED_STORIES_FILE`, print with ✕

### Critical Constraints

- **No new files** — All changes are in `ralph/ralph.sh` (plus BATS tests)
- **jq required** — Already a checked dependency (line 836-838)
- **<300 line additions** — This adds ~80-100 lines to ralph.sh
- **Backward compatible** — If `sprint-state.json` doesn't exist or lacks run fields, polling silently skips (no errors)
- **No modification of sprint-state.json** — Ralph is read-only; it never writes to sprint-state.json

### What This Story Does NOT Include

- No dashboard formatting — that's Story 0.3
- No `--quiet` flag — that's Story 0.3
- No modification to sprint-state.json writing — that's Story 0.1 (done)
- No cost calculation — ralph reads cost from sprint-state.json, it doesn't compute it

### Testing Approach

BATS tests in `ralph/tests/`. Create a mock `sprint-state.json` with known values, run the polling function, assert output contains expected structured lines.

### References

- [Source: _bmad-output/planning-artifacts/epics-operational-excellence.md#Story 0.2] — acceptance criteria and user story
- [Source: _bmad-output/implementation-artifacts/0-1-sprint-state-live-updates.md] — predecessor story, data contract
- [Source: ralph/ralph.sh] — all functions to modify
- [Source: src/types/state.ts] — SprintState.run interface with live progress fields

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`verification/0-2-ralph-progress-display-proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (ralph/AGENTS.md if it exists)
- [ ] Exec-plan created in `docs/exec-plans/active/0-2-ralph-progress-display.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
