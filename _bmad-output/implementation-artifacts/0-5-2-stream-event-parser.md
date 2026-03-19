# Story 0.5.2: Stream Event Parser

Status: in-progress

## Story

As a developer,
I want a stream event parser that extracts tool calls and text from NDJSON events,
so that the renderer has structured data to display.

## Acceptance Criteria

1. **Given** `content_block_start` with `tool_use`, **When** parsed, **Then** emits `{ type: 'tool-start', name: 'Bash', id: 'toolu_xxx' }`. <!-- verification: cli-verifiable -->
2. **Given** `content_block_delta` with `input_json_delta`, **When** parsed, **Then** accumulates tool input and emits `{ type: 'tool-input', partial: '...' }`. <!-- verification: cli-verifiable -->
3. **Given** `content_block_stop` after a tool, **When** parsed, **Then** emits `{ type: 'tool-complete' }`. <!-- verification: cli-verifiable -->
4. **Given** `content_block_delta` with `text_delta`, **When** parsed, **Then** emits `{ type: 'text', text: '...' }`. <!-- verification: cli-verifiable -->
5. **Given** `system/api_retry`, **When** parsed, **Then** emits `{ type: 'retry', attempt: N, delay: ms }`. <!-- verification: cli-verifiable -->
6. **Given** `result` event, **When** parsed, **Then** emits `{ type: 'result', cost: N, sessionId: '...' }`. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [ ] Task 1: Define typed event discriminated union (AC: #1-#6)
  - [ ] Create `StreamEvent` discriminated union type with `type` field as discriminant
  - [ ] Define `ToolStartEvent`, `ToolInputEvent`, `ToolCompleteEvent`, `TextEvent`, `RetryEvent`, `ResultEvent`, `UnknownEvent`
  - [ ] Export all event types from the module
- [ ] Task 2: Implement `parseStreamLine()` function (AC: #1-#6)
  - [ ] Accept a single NDJSON line as string input
  - [ ] Parse JSON, return `null` for invalid JSON or unrecognized events
  - [ ] Handle `stream_event` wrapper type with inner API event types
  - [ ] Handle `content_block_start` with `tool_use` content block (AC: #1)
  - [ ] Handle `content_block_delta` with `input_json_delta` delta type (AC: #2)
  - [ ] Handle `content_block_delta` with `text_delta` delta type (AC: #4)
  - [ ] Handle `content_block_stop` (AC: #3)
  - [ ] Handle `system` type with `api_retry` subtype (AC: #5)
  - [ ] Handle `result` type (AC: #6)
  - [ ] Return `null` for events we don't need (message_start, message_stop, message_delta)
- [ ] Task 3: Write unit tests (AC: #1-#6)
  - [ ] Test tool-start extraction from content_block_start
  - [ ] Test tool-input extraction from input_json_delta
  - [ ] Test tool-complete extraction from content_block_stop
  - [ ] Test text extraction from text_delta
  - [ ] Test retry extraction from system/api_retry
  - [ ] Test result extraction from result event
  - [ ] Test invalid JSON returns null
  - [ ] Test unrecognized event types return null
  - [ ] Test empty/whitespace lines return null

## Dev Notes

### Current State -- What Exists

**Story 0.5.1 (done)** switched ralph's Claude driver to `--output-format stream-json --verbose --include-partial-messages`. Claude now emits NDJSON (one JSON object per line) during execution. This story provides the TypeScript parser that converts those raw NDJSON lines into typed event objects.

### Key Files to Read (do NOT modify)

- `_bmad-output/planning-artifacts/research/technical-stream-json-terminal-rendering-research-2026-03-19.md` -- stream-json event format reference
- `_bmad-output/implementation-artifacts/0-5-1-stream-json-claude-driver.md` -- predecessor story context
- `ralph/drivers/claude-code.sh` -- driver with `driver_stream_filter()` jq reference (lines 151-166)

### Key Files to Create

- `src/lib/stream-parser.ts` -- the parser module
- `src/lib/__tests__/stream-parser.test.ts` -- unit tests

### stream-json Event Format (Quick Reference)

Each stdout line is a JSON object. The parser handles these:

| Wrapper type | Inner event type | Parser output |
|:------------|:----------------|:-------------|
| `stream_event` | `content_block_start` (tool_use) | `{ type: 'tool-start', name, id }` |
| `stream_event` | `content_block_delta` (input_json_delta) | `{ type: 'tool-input', partial }` |
| `stream_event` | `content_block_delta` (text_delta) | `{ type: 'text', text }` |
| `stream_event` | `content_block_stop` | `{ type: 'tool-complete' }` |
| `system` | `api_retry` | `{ type: 'retry', attempt, delay }` |
| `result` | -- | `{ type: 'result', cost, sessionId }` |

Events we skip (return null): `message_start`, `message_stop`, `message_delta`, `ping`.

### Design Decisions

1. **Stateless per-line** -- the parser does not accumulate state. Each line in, one event out. Accumulation (e.g., building full tool input from deltas) is the caller/renderer's responsibility.
2. **Returns null for unrecognized events** -- not an error. The stream contains many event types we don't care about.
3. **Placed in `src/lib/`** -- it's a utility library, not a module with state or side effects.
4. **Discriminated union** -- follows the project's `Result<T>` pattern of using a `type` field as discriminant for exhaustive matching.

### What This Story Does NOT Include

- No terminal rendering -- that's Story 0.5.3 (Ink renderer)
- No integration with ralph -- that's Story 0.5.4
- No state accumulation -- caller's responsibility
- No changes to existing files

### References

- [Source: _bmad-output/planning-artifacts/epics-operational-excellence.md#Story 0.5.2] -- acceptance criteria and user story
- [Source: _bmad-output/planning-artifacts/research/technical-stream-json-terminal-rendering-research-2026-03-19.md] -- stream-json format, event types
- [Source: _bmad-output/implementation-artifacts/0-5-1-stream-json-claude-driver.md] -- predecessor story

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/0-5-2-stream-event-parser.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/0-5-2-stream-event-parser.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
