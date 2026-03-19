# Story 0.5.1: Stream-JSON Claude Driver

Status: review

## Story

As an operator,
I want ralph's Claude driver to use stream-json output format,
so that tool calls and text are available in real time instead of buffered until exit.

## Acceptance Criteria

1. **Given** the claude-code driver (`ralph/drivers/claude-code.sh`), **When** it builds the command, **Then** it uses `--output-format stream-json --verbose --include-partial-messages` instead of `--output-format json`. <!-- verification: cli-verifiable -->
2. **Given** stream-json output, **When** Claude runs, **Then** stdout produces NDJSON (one JSON object per line) during execution — not 0 bytes until exit. <!-- verification: cli-verifiable -->
3. **Given** the driver change, **When** the final result is needed, **Then** the last line with `type: "result"` contains session_id, cost, result text. <!-- verification: cli-verifiable -->
4. **Given** stream-json piped through ralph, **When** an iteration completes, **Then** ralph detects success/failure/timeout from the output. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Change `driver_build_command()` to use stream-json (AC: #1)
  - [x] In `ralph/drivers/claude-code.sh`, replace the `CLAUDE_OUTPUT_FORMAT` check block (lines 83-85) so it always emits `--output-format stream-json --verbose --include-partial-messages` instead of conditionally emitting `--output-format json`
  - [x] Remove or update the `CLAUDE_OUTPUT_FORMAT` env var handling — the driver now always uses stream-json
  - [x] Remove the `driver_prepare_live_command()` function (lines 127-148) — it is now redundant since the base command already uses stream-json
- [x] Task 2: Update `CLAUDE_OUTPUT_FORMAT` default in ralph.sh (AC: #1, #2)
  - [x] In `ralph/ralph.sh` line 50, change `CLAUDE_OUTPUT_FORMAT="${CLAUDE_OUTPUT_FORMAT:-json}"` to `CLAUDE_OUTPUT_FORMAT="${CLAUDE_OUTPUT_FORMAT:-stream-json}"`
  - [x] In `src/commands/run.ts` line 213-215, update the env block that sets `CLAUDE_OUTPUT_FORMAT = 'json'` — this should now set `stream-json` (or be removed if run.ts should not override the default)
- [x] Task 3: Update `execute_iteration()` result extraction for NDJSON (AC: #3, #4)
  - [x] The output file now contains NDJSON (many lines) instead of one JSON blob
  - [x] After Claude exits with code 0, extract the result from the LAST line matching `"type".*"result"` using: `grep '"type"' "$output_file" | grep '"result"' | tail -1`
  - [x] The error-detection grep at line 785 still works on NDJSON since it greps through the full file — verify it doesn't false-positive on stream event lines
  - [x] The API limit detection grep at line 828 and transient error grep at line 832 should still work — they grep the full output file for error strings
  - [x] The `wc -c` output size check at line 791 still works — NDJSON is larger than buffered JSON, so this is fine
- [x] Task 4: Update live output mode for NDJSON (AC: #2)
  - [x] In the `LIVE_OUTPUT == true` branch (line 709-720), the `tee` pipeline already writes all output to both the terminal and the output file — this works unchanged with NDJSON
  - [x] Consider piping through the existing `driver_stream_filter()` jq filter (lines 151-166) for terminal display during live mode, so the operator sees formatted tool/text events instead of raw JSON
  - [x] For background mode (line 722-754), the monitoring loop polling `sprint-state.json` continues to work — output file grows during execution instead of being empty
- [x] Task 5: Write BATS integration tests (AC: #1, #3, #4)
  - [x] Test that `driver_build_command` produces args containing `--output-format stream-json --verbose --include-partial-messages`
  - [x] Test that `driver_build_command` does NOT produce `--output-format json`
  - [x] Test extracting the result line from a mock NDJSON output file
  - [x] Test that error detection greps work correctly against NDJSON content (no false positives from stream event type fields)

## Dev Notes

### Current State — What Exists

**Epic 0 (done)** established:
- Story 0.1: `sprint-state.json` live updates during execution
- Story 0.2: Ralph polls `sprint-state.json` and displays structured progress
- Story 0.3: `DashboardFormatter` in `src/lib/dashboard-formatter.ts` reformats ralph output for the `codeharness run` terminal

**The driver already has stream-json infrastructure** (partially built):
- `driver_supports_live_output()` returns 0 (true) — line 122-124
- `driver_prepare_live_command()` exists (lines 127-148) — it clones `CLAUDE_CMD_ARGS`, swaps `json` for `stream-json`, and appends `--verbose --include-partial-messages`
- `driver_stream_filter()` exists (lines 151-166) — a jq filter that extracts text deltas and tool starts from stream events

**The problem:** `driver_build_command()` still builds the command with `--output-format json` by default. The live command builder is a separate function that was never integrated into the main flow. This story makes stream-json the default and only format.

### Key Files to Modify

- `ralph/drivers/claude-code.sh` — Change `driver_build_command()` to always use stream-json. Remove `driver_prepare_live_command()` (redundant). Keep `driver_stream_filter()` (used for terminal display).
- `ralph/ralph.sh` — Change `CLAUDE_OUTPUT_FORMAT` default. Update `execute_iteration()` result extraction to handle NDJSON.
- `src/commands/run.ts` — Update `CLAUDE_OUTPUT_FORMAT` env var value from `'json'` to `'stream-json'` in the JSON output mode block (lines 213-215).

### Key Files to Read (do NOT modify)

- `_bmad-output/planning-artifacts/research/technical-stream-json-terminal-rendering-research-2026-03-19.md` — stream-json event format reference
- `src/lib/dashboard-formatter.ts` — Understands ralph's `[LEVEL] message` output format. NOT changed in this story.
- `_bmad-output/implementation-artifacts/0-3-run-command-dashboard.md` — predecessor story context

### stream-json Event Format (Quick Reference)

Each stdout line is a JSON object. Key event types:

| Wrapper type | Inner event type | What it means |
|:------------|:----------------|:-------------|
| `stream_event` | `content_block_start` (tool_use) | Tool call starting (has `.event.content_block.name`) |
| `stream_event` | `content_block_delta` (text_delta) | Text streaming (has `.event.delta.text`) |
| `stream_event` | `content_block_delta` (input_json_delta) | Tool input streaming |
| `stream_event` | `content_block_stop` | Content block complete |
| `stream_event` | `message_start` / `message_stop` | Message lifecycle |
| `result` | — | Final result with `session_id`, `cost_usd`, `result` text |

The `result` event is always the LAST line. It contains the same data that the old `--output-format json` mode returned as a single blob.

### NDJSON Result Extraction

Old approach (json mode):
```bash
# output_file contains one JSON object
jq '.result' "$output_file"
```

New approach (stream-json mode):
```bash
# output_file contains many NDJSON lines, result is the last one
tail -1 "$output_file"
# Or more defensively:
grep '"type"' "$output_file" | grep '"result"' | tail -1
```

### Critical Constraint: Ralph's Error Detection

Ralph's `execute_iteration()` greps the output file for error patterns (lines 785-838). These greps scan the entire file, which now contains NDJSON. Key concern:

- `grep -qi "5.*hour.*limit"` — safe, these strings don't appear in stream events
- `grep -qi "Internal server error\|api_error\|overloaded"` — safe, stream events don't contain these strings
- `grep -v '"[^"]*error[^"]*":' | grep -qE '(^Error:|^ERROR:)'` — the `-v` filter excludes lines with JSON error keys, and the second grep looks for lines STARTING with "Error:" — NDJSON lines start with `{`, so this is safe

No changes needed to error detection logic.

### What This Story Does NOT Include

- No changes to `DashboardFormatter` — that reads ralph's `[LEVEL]` lines, not Claude's NDJSON
- No terminal rendering of stream events — that's Story 0.5.3 (Ink renderer)
- No stream event parsing module — that's Story 0.5.2 (Stream Event Parser)
- No changes to `sprint-state.json` format or writing

### Architecture Decision: stream-json as Default

After this story, ALL Claude invocations through ralph use stream-json. There is no fallback to json mode. Rationale:
- stream-json output is a superset — the result event contains everything json mode returned
- The output file is slightly larger (many lines vs one blob) but this doesn't matter for logs
- Future stories (0.5.2, 0.5.3, 0.5.4) depend on stream-json being the default

### Project Structure Notes

- Driver files live in `ralph/drivers/` — one file per platform driver
- Ralph core is `ralph/ralph.sh` with helper libs in `ralph/lib/`
- Tests for ralph are BATS tests in `ralph/tests/` (if they exist) or can be added
- TypeScript run command is `src/commands/run.ts`

### References

- [Source: _bmad-output/planning-artifacts/epics-operational-excellence.md#Story 0.5.1] — acceptance criteria and user story
- [Source: _bmad-output/planning-artifacts/research/technical-stream-json-terminal-rendering-research-2026-03-19.md] — stream-json format, event types, implementation options
- [Source: ralph/drivers/claude-code.sh] — current driver with existing stream-json infrastructure (lines 121-166)
- [Source: ralph/ralph.sh#execute_iteration] — iteration execution, output handling, error detection (lines 653-840)
- [Source: src/commands/run.ts] — run command, env var setup, DashboardFormatter integration
- [Source: _bmad-output/implementation-artifacts/0-3-run-command-dashboard.md] — predecessor story, DashboardFormatter design

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/0-5-1-stream-json-claude-driver.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/0-5-1-stream-json-claude-driver.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

N/A

### Completion Notes List

- Changed driver to always use `--output-format stream-json --verbose --include-partial-messages`
- Removed `driver_prepare_live_command()` — redundant now that base command uses stream-json
- Updated `CLAUDE_OUTPUT_FORMAT` default from `json` to `stream-json` in ralph.sh
- Updated `run.ts` to set `stream-json` instead of `json` in env
- Verified error detection greps in `execute_iteration()` work correctly with NDJSON (no false positives)
- Live output tee pipeline works unchanged — NDJSON flows through
- Background mode monitoring works unchanged — output file grows during execution
- 28 BATS tests pass (including 8 new NDJSON-specific tests)
- 32 TypeScript tests pass (including updated env var assertion)

### File List

- `ralph/drivers/claude-code.sh` — driver_build_command uses stream-json, removed driver_prepare_live_command
- `ralph/ralph.sh` — CLAUDE_OUTPUT_FORMAT default changed to stream-json
- `src/commands/run.ts` — env var set to stream-json
- `tests/driver_claude_code.bats` — updated + 8 new NDJSON tests
- `src/commands/__tests__/run.test.ts` — updated env assertion
