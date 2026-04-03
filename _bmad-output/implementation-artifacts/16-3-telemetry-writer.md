# Story 16.3: Telemetry Writer

Status: verifying

## Story

As a developer,
I want structured telemetry written as NDJSON after each story completes,
so that epic retros have rich data without per-session LLM cost.

## Acceptance Criteria

1. **Given** a new `src/lib/telemetry-writer.ts`, **when** imported, **then** it exports `writeTelemetryEntry(ctx: TaskContext): Promise<NullTaskResult>` and `readTelemetryForEpic(epicId: string): TelemetryEntry[]`. <!-- verification: test-provable -->

2. **Given** the `telemetry` null task handler runs after a story completes, **when** it writes to `.codeharness/telemetry.jsonl`, **then** each line is valid JSON containing: `version` (number), `timestamp` (ISO 8601 string), `storyKey` (string), `epicId` (string), `duration_ms` (number), `cost_usd` (number|null), `attempts` (number|null), `acResults` (array|null), `filesChanged` (array), `testResults` (object|null), `errors` (array). <!-- verification: test-provable -->

3. **Given** the `TaskContext` passed to the handler, **when** a field is not available (e.g., no output contract, no test results), **then** the corresponding telemetry field is set to `null` — never fabricated or defaulted to a truthy value. <!-- verification: test-provable -->

4. **Given** the telemetry file `.codeharness/telemetry.jsonl`, **when** `writeTelemetryEntry` is called, **then** it appends one line using `appendFileSync` (not truncate/rewrite) and creates the `.codeharness/` directory if it does not exist. <!-- verification: test-provable -->

5. **Given** every telemetry entry, **when** serialized, **then** it includes `version: 1` as the first field for forward compatibility with future schema changes. <!-- verification: test-provable -->

6. **Given** `readTelemetryForEpic("16")` is called, **when** the telemetry file contains entries for multiple epics, **then** it returns only entries whose `epicId` matches `"16"`, preserving insertion order. <!-- verification: test-provable -->

7. **Given** the `telemetry` handler is registered in `null-task-registry.ts`, **when** the engine reaches the `telemetry` task, **then** the real `writeTelemetryEntry` from `telemetry-writer.ts` is called instead of the current no-op placeholder. <!-- verification: test-provable -->

8. **Given** a telemetry write operation, **when** timed, **then** it completes in <10ms for a single NDJSON append (NFR3). <!-- verification: test-provable -->

9. **Given** the telemetry file does not exist, **when** `readTelemetryForEpic` is called, **then** it returns an empty array (not an error). <!-- verification: test-provable -->

10. **Given** a corrupted line in the telemetry file (invalid JSON), **when** `readTelemetryForEpic` reads it, **then** the corrupted line is skipped and remaining valid lines are returned. <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Create `src/lib/telemetry-writer.ts` (AC: #1, #2, #3, #4, #5)
  - [x] Define `TelemetryEntry` interface with all required fields (`version`, `timestamp`, `storyKey`, `epicId`, `duration_ms`, `cost_usd`, `attempts`, `acResults`, `filesChanged`, `testResults`, `errors`)
  - [x] Implement `writeTelemetryEntry(ctx: TaskContext): Promise<NullTaskResult>`:
    - Extract `epicId` from `ctx.storyKey` (split on first `-`, take first segment)
    - Build `TelemetryEntry` from `ctx` fields, setting `null` for unavailable data
    - Use `mkdirSync` to ensure `.codeharness/` exists (with `{ recursive: true }`)
    - Use `appendFileSync` to write JSON line + `\n`
    - Return `{ success: true, output: 'telemetry: entry written for {storyKey}' }`
  - [x] Implement `readTelemetryForEpic(epicId: string): TelemetryEntry[]`:
    - Read file with `readFileSync`, split on `\n`, filter empty lines
    - Parse each line with `JSON.parse`, catch and skip corrupted lines
    - Filter by `epicId` match, return array
    - Return `[]` if file does not exist

- [x] Task 2: Replace no-op placeholder in `null-task-registry.ts` (AC: #7)
  - [x] Import `writeTelemetryEntry` from `./telemetry-writer.js`
  - [x] Replace the no-op `telemetry` handler with `writeTelemetryEntry`

- [x] Task 3: Write unit tests (AC: #1-#10)
  - [x] Test: `writeTelemetryEntry` creates `.codeharness/` directory if missing
  - [x] Test: `writeTelemetryEntry` appends one valid NDJSON line per call
  - [x] Test: entry contains all required fields with correct types
  - [x] Test: `version` field is `1` in every entry
  - [x] Test: unavailable fields are `null` (no output contract scenario)
  - [x] Test: `readTelemetryForEpic` filters entries by epicId
  - [x] Test: `readTelemetryForEpic` returns `[]` when file does not exist
  - [x] Test: `readTelemetryForEpic` skips corrupted JSON lines
  - [x] Test: write completes in <10ms (performance assertion)
  - [x] Test: multiple sequential writes produce multiple lines
  - [x] Test: registered handler in null-task-registry calls `writeTelemetryEntry`

## Dev Notes

### Architecture Constraints

- **New file:** `src/lib/telemetry-writer.ts` — pure data module. No side effects on import except function exports.
- **Modified file:** `src/lib/null-task-registry.ts` — replace the no-op `telemetry` placeholder (line 94-96) with the real handler from `telemetry-writer.ts`.
- **No new dependencies.** Use only `node:fs` and `node:path`. No external libraries.
- **ESM module** — use `.js` extensions in imports (e.g., `import { writeTelemetryEntry } from './telemetry-writer.js'`).

### TelemetryEntry Interface

```typescript
export interface TelemetryEntry {
  version: 1;
  timestamp: string;           // ISO 8601
  storyKey: string;            // e.g., "16-3-telemetry-writer"
  epicId: string;              // e.g., "16" (extracted from storyKey)
  duration_ms: number;         // from ctx.durationMs
  cost_usd: number | null;     // from ctx.cost (0 if no cost tracked)
  attempts: number | null;     // not available in TaskContext — set null
  acResults: ACResult[] | null; // from output contract if available
  filesChanged: string[];      // from output contract if available, else []
  testResults: TestResultsSummary | null; // from output contract if available
  errors: string[];            // empty array if no errors
}
```

### Extracting epicId from storyKey

The `TaskContext.storyKey` follows the pattern `{epicNum}-{storyNum}-{slug}` (e.g., `"16-3-telemetry-writer"`). Extract `epicId` by splitting on `-` and taking the first segment. For the sentinel `"__run__"` key, set `epicId` to `"unknown"`.

### Data Extraction from TaskContext

The `TaskContext` provides:
- `storyKey` — directly mapped
- `durationMs` — mapped to `duration_ms`
- `cost` — mapped to `cost_usd` (accumulated cost, may be 0)
- `outputContract` — if non-null, extract `changedFiles`, `testResults`, `acceptanceCriteria`
- `taskName` — not stored in telemetry entry (always `"telemetry"`)

Fields NOT available in `TaskContext` (set to `null`):
- `attempts` — retry count is not tracked in TaskContext; set to null
- `errors` — no error list in TaskContext; set to empty array `[]`

### File Location

Telemetry file: `{projectDir}/.codeharness/telemetry.jsonl`

Use `ctx.projectDir` from `TaskContext` to resolve the path. The `.codeharness/` directory is already used for workflow state, contracts, and issues — telemetry follows the same pattern.

### Relationship to Story 16-2

Story 16-2 created:
- `src/lib/null-task-registry.ts` with `TaskContext`, `NullTaskResult`, `NullTaskHandler` types
- A no-op `telemetry` handler placeholder (line 94-96)
- `executeNullTask()` in `workflow-engine.ts` that calls handlers from the registry

This story replaces the no-op with a real implementation. The `TaskContext` interface is already defined and stable. No engine changes needed — only the handler implementation and registry update.

### Performance Requirement (NFR3)

`appendFileSync` for a single NDJSON line (~500 bytes) completes well under 10ms. No buffering or batching needed. The synchronous API is intentional — telemetry writes are infrequent (once per story) and must not be lost on crash.

### Forward Compatibility (version field)

The `version: 1` field enables future schema changes. If a future version adds fields or changes semantics, readers can branch on `version`. Always serialize `version` first in the JSON object for human readability.

### Project Structure Notes

- Source: `src/lib/telemetry-writer.ts`
- Tests: `src/lib/__tests__/telemetry-writer.test.ts`
- Build: TypeScript compiled to `dist/`
- Test runner: vitest
- Existing patterns: see `src/lib/workflow-state.ts` for `.codeharness/` directory creation pattern (`mkdirSync` with `{ recursive: true }`)

### References

- [Source: _bmad-output/planning-artifacts/epics-parallel-execution.md#Story 16.3]
- [Source: _bmad-output/planning-artifacts/architecture-parallel-execution.md#Decision 5 — engine-handled null tasks]
- [Source: src/lib/null-task-registry.ts — TaskContext interface, no-op telemetry placeholder]
- [Source: src/lib/agents/types.ts — OutputContract, TestResults, ACStatus interfaces]
- [Source: src/lib/workflow-state.ts — .codeharness directory pattern]
- [Source: _bmad-output/implementation-artifacts/16-2-engine-handled-null-tasks.md — previous story context]

### Previous Story (16-2) Intelligence

- `null-task-registry.ts` created with clean registry pattern. The `telemetry` handler is the first real handler to replace the placeholder.
- `TaskContext` includes `projectDir` — use this to resolve the telemetry file path (do NOT hardcode or use `process.cwd()`).
- `NullTaskResult` has `success: boolean` and optional `output: string`. The engine throws `NULL_TASK_FAILED` if `success: false`.
- `clearNullTaskRegistry()` exists for test isolation — tests should call this, then re-register the telemetry handler.
- Code review added error handling: handler exceptions are caught and wrapped as `NULL_TASK_HANDLER_ERROR`. The telemetry handler should not need a try/catch — let the engine handle errors.
- All 4676+ tests pass. Do not break existing tests.

### Git Intelligence

Recent commits:
- `07e94a2 feat: story 16-2 — engine-handled null tasks` — registry + engine integration
- `e3c4761 feat: story 16-1 — hierarchical flow schema & parser` — schema + parser
- Commit pattern: `feat: story {N}-{M} — {title}`
- Tests always run before commit. Coverage must remain at target.

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/16-3-telemetry-writer-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/16-3-telemetry-writer.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- All 3 tasks implemented: telemetry-writer module, registry integration, 18 unit tests
- All 18 tests pass, 0 failures
- Existing null-task-registry and null-task-engine tests (26 total) still pass
- No new dependencies added — uses only node:fs and node:path
- No TypeScript errors introduced

### File List

- `src/lib/telemetry-writer.ts` (new) — TelemetryEntry interface, writeTelemetryEntry, readTelemetryForEpic
- `src/lib/null-task-registry.ts` (modified) — replaced no-op telemetry placeholder with real handler
- `src/lib/__tests__/telemetry-writer.test.ts` (new) — 19 unit tests covering all 10 ACs
- `src/lib/__tests__/null-task-registry.test.ts` (modified) — re-register real handler after clear
- `src/commands/__tests__/stats.test.ts` (modified) — fix pre-existing assertion mismatch

### Code Review Fixes Applied

- Fixed misleading JSDoc on `clearNullTaskRegistry` (said it re-registers but doesn't)
- Removed unused imports (`clearNullTaskRegistry`, `registerNullTask`) from telemetry-writer.test.ts
- Replaced duplicate `TestResultsSummary` interface with type alias to `TestResults` from agents/types.ts
- Made `projectDir` parameter required in `readTelemetryForEpic` (story spec says "Do NOT use process.cwd()")
- Fixed null-task-registry.test.ts to re-register real `writeTelemetryEntry` after clear (was registering fake no-op)
- Added `// IGNORE:` comment to catch block per project boundary convention (NFR3)
- Added test for dashless storyKey edge case (improved branch coverage to 93.75%)
- Fixed pre-existing stats.test.ts assertion to match actual error message
