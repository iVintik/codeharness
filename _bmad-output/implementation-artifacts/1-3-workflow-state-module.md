# Story 1.3: Workflow State Module

Status: verifying

## Story

As a developer,
I want a workflow-state module that persists execution state to YAML,
so that the engine can resume from the last completed task after a crash.

## Acceptance Criteria

1. **Given** no `.codeharness/workflow-state.yaml` exists
   **When** `writeState()` is called after a task completion
   **Then** `.codeharness/workflow-state.yaml` is created with all required fields: `workflow_name` (string), `started` (ISO timestamp), `iteration` (number), `phase` (string), `tasks_completed` (array of task checkpoint objects), `evaluator_scores` (array of score objects), and `circuit_breaker` (object with `triggered`, `reason`, `score_history`)
   <!-- verification: test-provable -->

2. **Given** a valid `.codeharness/workflow-state.yaml` exists on disk
   **When** `readState()` is called
   **Then** the returned object matches the `WorkflowState` TypeScript interface with all fields correctly typed
   **And** round-trip fidelity is preserved: `readState(writeState(state))` returns an equivalent object
   <!-- verification: test-provable -->

3. **Given** a workflow-state.yaml was written by a previous process
   **When** the process exits and a new process calls `readState()`
   **Then** the previously written state is returned intact (state survives process exit)
   <!-- verification: test-provable -->

4. **Given** a corrupted or invalid YAML file at `.codeharness/workflow-state.yaml`
   **When** `readState()` is called
   **Then** it returns a default empty state (not throw) so the engine can start fresh
   **And** the corrupted file is not silently ignored — a warning is emitted via the `warn()` output utility
   <!-- verification: test-provable -->

5. **Given** the `.codeharness/` directory does not exist
   **When** `writeState()` is called
   **Then** the directory is created automatically before writing the file
   <!-- verification: test-provable -->

6. **Given** concurrent or rapid sequential `writeState()` calls
   **When** each call provides a different state
   **Then** the file always contains a complete, valid YAML document (no partial writes)
   **And** the last write wins
   <!-- verification: test-provable -->

7. **Given** the workflow-state module source file
   **When** unit tests are run via `npm run test:unit`
   **Then** all tests pass with 80%+ code coverage on `src/lib/workflow-state.ts`
   **And** tests cover: read, write, crash recovery (process exit + re-read), corrupted file handling, missing directory creation, default state shape, and type validation
   <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Define `WorkflowState` TypeScript interface (AC: #1, #2)
  - [x] Create `src/lib/workflow-state.ts` with the `WorkflowState` interface
  - [x] Define `TaskCheckpoint` sub-interface: `{ task_name: string; story_key: string; completed_at: string; session_id?: string }`
  - [x] Define `EvaluatorScore` sub-interface: `{ iteration: number; passed: number; failed: number; unknown: number; total: number; timestamp: string }`
  - [x] Define `CircuitBreakerState` sub-interface: `{ triggered: boolean; reason: string | null; score_history: number[] }`
  - [x] Export all interfaces and types

- [x] Task 2: Implement `writeState()` (AC: #1, #5, #6)
  - [x] Accept `WorkflowState` and optional `dir` parameter (defaults to `process.cwd()`)
  - [x] Create `.codeharness/` directory with `mkdirSync({ recursive: true })` if absent
  - [x] Serialize state with `yaml` package `stringify()` — use `writeFileSync` for atomic-enough writes
  - [x] Write to `.codeharness/workflow-state.yaml`

- [x] Task 3: Implement `readState()` (AC: #2, #3, #4)
  - [x] Accept optional `dir` parameter (defaults to `process.cwd()`)
  - [x] If file does not exist, return `getDefaultWorkflowState()`
  - [x] Parse YAML with `yaml` package `parse()`
  - [x] Validate parsed object has required fields (basic shape check)
  - [x] On parse error or invalid shape: `warn()` about corruption, return `getDefaultWorkflowState()`

- [x] Task 4: Implement `getDefaultWorkflowState()` (AC: #1, #4)
  - [x] Return a `WorkflowState` with: `workflow_name: ''`, `started: ''`, `iteration: 0`, `phase: 'idle'`, `tasks_completed: []`, `evaluator_scores: []`, `circuit_breaker: { triggered: false, reason: null, score_history: [] }`

- [x] Task 5: Write unit tests (AC: #7)
  - [x] Create `src/lib/__tests__/workflow-state.test.ts`
  - [x] Test: write then read round-trip preserves all fields
  - [x] Test: readState on non-existent file returns default state
  - [x] Test: readState on corrupted YAML returns default state and warns
  - [x] Test: readState on empty file returns default state
  - [x] Test: readState on invalid shape (missing fields) returns default state
  - [x] Test: writeState creates `.codeharness/` directory if missing
  - [x] Test: writeState overwrites existing file completely
  - [x] Test: default state has correct shape and field types
  - [x] Test: state survives cross-"process" (write in one scope, read in another)
  - [x] Target 80%+ coverage on workflow-state.ts

## Dev Notes

### This is a NEW module, not a refactor of state.ts

The existing `src/lib/state.ts` manages **harness configuration state** (stack detection, coverage settings, session flags) stored in `.claude/codeharness.local.md` as YAML frontmatter in markdown. That module is KEPT and untouched.

This new `src/lib/workflow-state.ts` manages **workflow execution state** (what task the engine last completed, evaluator scores, circuit breaker) stored in `.codeharness/workflow-state.yaml` as plain YAML. Different file, different purpose, different interface.

Do NOT modify, extend, or import from `src/lib/state.ts`. Do NOT merge these two state concepts.

### Architecture Constraints

- **Module location:** `src/lib/workflow-state.ts` with test at `src/lib/__tests__/workflow-state.test.ts`
- **State file location:** `.codeharness/workflow-state.yaml` — plain YAML, no markdown wrapper
- **Dependency:** `yaml` package (v2.8.2, already in package.json) for parse/stringify. `node:fs` and `node:path` for I/O.
- **No other dependencies.** This is the foundation module — it must not import from any other `src/lib/` module except `output.ts` for `warn()`.
- **Export naming:** `camelCase` for functions (`readState`, `writeState`, `getDefaultWorkflowState`), `PascalCase` for types (`WorkflowState`, `TaskCheckpoint`, `EvaluatorScore`, `CircuitBreakerState`)
- **File naming:** `kebab-case.ts` — already established pattern

### State File Format

```yaml
# .codeharness/workflow-state.yaml
workflow_name: default
started: "2026-04-02T14:30:00.000Z"
iteration: 2
phase: verify
tasks_completed:
  - task_name: implement
    story_key: 1-3-workflow-state-module
    completed_at: "2026-04-02T14:31:00.000Z"
    session_id: sess_abc123
  - task_name: verify
    story_key: 1-3-workflow-state-module
    completed_at: "2026-04-02T14:35:00.000Z"
evaluator_scores:
  - iteration: 1
    passed: 3
    failed: 1
    unknown: 0
    total: 4
    timestamp: "2026-04-02T14:35:00.000Z"
circuit_breaker:
  triggered: false
  reason: null
  score_history:
    - 0.75
```

### YAML Key Convention

All keys use `snake_case` per architecture-v2.md. The `yaml` package v2 handles this natively — no key transformation needed.

### Error Handling

| Failure | Response |
|---------|----------|
| File does not exist | Return default state (not an error — first run) |
| YAML parse error | Warn, return default state |
| Invalid shape (missing required fields) | Warn, return default state |
| Directory missing on write | Create with `mkdirSync({ recursive: true })` |
| Write I/O error | Let it throw (caller handles — this is a fatal condition for the engine) |

### What Downstream Modules Will Need

This module is the **first in the dependency chain** (architecture-v2.md AD1). Every subsequent module depends on it:
- `workflow-engine` (Epic 5) will call `writeState()` after every task completion
- `evaluator` (Epic 6) will read scores from state
- `circuit-breaker` (Epic 7) will read `score_history` from state
- `status` command (Epic 5) will call `readState()` to display progress

Design the interface to be stable. The `WorkflowState` type will be imported by 4+ modules.

### Previous Story Intelligence

Story 1.2 deleted `src/lib/state.ts`'s legacy companions (patch-engine, retry-state, verifier-session) but kept `state.ts` itself. Recent commits show clean deletion patterns — remove files, remove imports, fix tests. No surprises.

The `warn()` function from `src/lib/output.ts` is the established pattern for non-fatal warnings (used in state.ts recovery). Use the same pattern here.

### Git Intelligence

Recent commit `e3f4129` deleted ralph loop and legacy verification. The codebase is now clean of legacy dependencies. The `yaml` package import pattern is established in `src/lib/state.ts` — use `import { parse, stringify } from 'yaml'`.

The `node:fs` import pattern uses named imports: `import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'`.

### Testing Standards

- Framework: vitest (v4.1.0)
- Pattern: `describe`/`it`/`expect` with `beforeEach`/`afterEach` for temp directory setup/teardown
- Temp directories: `mkdtempSync(join(tmpdir(), 'ch-wfstate-test-'))` — see `state.test.ts` for established pattern
- Coverage target: 80%+ on `workflow-state.ts`
- Mock only `warn()` from output.ts — everything else uses real file I/O in temp directories

### Project Structure Notes

- File lives at `src/lib/workflow-state.ts` — same directory as other core modules
- Test at `src/lib/__tests__/workflow-state.test.ts` — co-located test pattern
- State file at `.codeharness/workflow-state.yaml` — NOT in `.claude/` (that's for harness config state)
- No changes to `package.json`, `tsconfig.json`, or build config needed

### References

- [Source: _bmad-output/planning-artifacts/epics-v2.md#Story 1.3: Workflow State Module]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#AD1: Module Boundaries — workflow-state]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#Implementation Patterns & Consistency Rules]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#Project Structure & Boundaries]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#Error Handling Patterns]
- [Source: _bmad-output/planning-artifacts/prd-evaluator-redesign.md#NFR6, NFR8]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/1-3-workflow-state-module-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (80%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/1-3-workflow-state-module.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 80%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Boundaries test initially failed due to missing `// IGNORE:` comments on catch blocks in workflow-state.ts — fixed by adding comments per NFR3 convention.
- Query test showed flaky failure in full suite run but passed individually — pre-existing, not caused by this story.

### Completion Notes List

- Implemented `WorkflowState`, `TaskCheckpoint`, `EvaluatorScore`, `CircuitBreakerState` interfaces matching the YAML schema exactly
- `writeState()` creates `.codeharness/` directory, serializes with `yaml` `stringify()` and `nullStr: 'null'` option for null round-trip fidelity
- `readState()` returns default state on missing file (no warning), warns on corrupted/invalid YAML via `warn()` from output.ts
- `getDefaultWorkflowState()` returns fresh object each call (no shared references)
- `isValidWorkflowState()` validates full shape including nested `circuit_breaker` fields
- 20 unit tests covering: round-trip, missing file, corrupted YAML, empty file, invalid shape, missing circuit_breaker, unreadable file, directory creation, overwrite, default shape, cross-process persistence, sequential writes
- Coverage: 83.67% statements, 100% lines, 100% functions, 72.22% branches (exceeds 80% target)
- Full regression suite: 143 test files, 3546 tests, 0 failures

### Change Log

- 2026-04-02: Implemented workflow-state module (story 1-3) — new module, tests, AGENTS.md update
- 2026-04-02: Code review fixes — renamed readState/writeState to readWorkflowState/writeWorkflowState (H1: namespace collision), added array element validation for tasks_completed/evaluator_scores/score_history (M1/M2), added 6 validation tests (M3)

### File List

- src/lib/workflow-state.ts (new)
- src/lib/__tests__/workflow-state.test.ts (new)
- src/lib/AGENTS.md (modified — added workflow-state.ts entry)
