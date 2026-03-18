# Story 3.2: Graceful Dev Module

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a system,
I want dev module to return Result<T> and never crash the sprint,
so that one story's failure doesn't halt the run.

## Acceptance Criteria

1. **Given** `developStory(key)` is called with a valid story key, **When** the BMAD dev-story workflow is invoked, **Then** it returns `Result<DevResult>` containing the story key, list of files changed, and count of tests added. <!-- verification: cli-verifiable -->
2. **Given** `developStory(key)` is called and the dev workflow fails (non-zero exit, missing story file, invalid key), **When** the error is caught, **Then** it returns `fail(error)` with a descriptive message — never throws an uncaught exception. <!-- verification: cli-verifiable -->
3. **Given** `developStory(key)` is called and the dev workflow times out (exceeds configured timeout), **When** the timeout is detected, **Then** it preserves any partial work (uncommitted changes remain in the working tree) and returns `fail('timeout: ...')` with duration context. <!-- verification: cli-verifiable -->
4. **Given** `DevResult` type is defined, **When** inspected, **Then** it includes: `key: string`, `filesChanged: string[]`, `testsAdded: number`, `duration: number` (milliseconds), and `output: string` (captured stdout/stderr summary). <!-- verification: cli-verifiable -->
5. **Given** `src/modules/dev/orchestrator.ts` exists, **When** reviewed, **Then** it uses `child_process.execSync` or `child_process.execFileSync` with a configurable timeout to invoke the BMAD dev-story workflow, and wraps all calls in try/catch returning `Result<T>`. <!-- verification: cli-verifiable -->
6. **Given** the dev module is invoked during a sprint run by ralph, **When** the dev workflow fails or times out, **Then** the sprint loop continues to the next iteration without crashing — the failure is logged and the story status is updated to reflect the error. <!-- verification: integration-required -->
7. **Given** `src/modules/dev/` directory, **When** all files are reviewed, **Then** no file exceeds 300 lines (NFR18) and `index.ts` is the only public interface (no direct imports of internal files from outside the module). <!-- verification: cli-verifiable -->
8. **Given** new code in `src/modules/dev/`, **When** unit tests run, **Then** 100% coverage on all new/changed code (NFR14) with tests in `src/modules/dev/__tests__/`. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x]Task 1: Extend `DevResult` type in `src/modules/dev/types.ts` (AC: #4)
  - [x]Add `duration: number` field (milliseconds elapsed during dev workflow)
  - [x]Add `output: string` field (captured stdout/stderr summary, truncated to last 200 lines)
  - [x]Keep existing `key`, `filesChanged`, `testsAdded` fields
  - [x]All fields `readonly`

- [x]Task 2: Create `src/modules/dev/orchestrator.ts` (AC: #1, #2, #3, #5)
  - [x]Implement `invokeBmadDevStory(key: string, opts?: { timeoutMs?: number }): Result<DevResult>`
  - [x]Use `child_process.execFileSync` to invoke `claude --print` with the BMAD dev-story prompt (or `npx bmad-method dev-story` depending on how BMAD is invoked)
  - [x]Set default timeout to 25 minutes (1,500,000ms) via `{ timeout: opts.timeoutMs ?? 1_500_000 }`
  - [x]Wrap entire invocation in try/catch — on `Error` with `status` property (non-zero exit), return `fail()` with exit code and stderr
  - [x]On timeout error (`error.killed === true` or `error.signal === 'SIGTERM'`), return `fail('timeout: dev workflow exceeded ...')`
  - [x]Capture git diff `--stat` after invocation to populate `filesChanged`
  - [x]Count test files changed/added to populate `testsAdded`
  - [x]Keep under 300 lines (NFR18)

- [x]Task 3: Update `src/modules/dev/index.ts` to delegate to orchestrator (AC: #1, #2, #3, #7)
  - [x]Import `invokeBmadDevStory` from `./orchestrator.js`
  - [x]Replace stub `fail('not implemented')` with delegation to `invokeBmadDevStory(key)`
  - [x]Re-export `DevResult` type
  - [x]Keep under 100 lines

- [x]Task 4: Write unit tests in `src/modules/dev/__tests__/orchestrator.test.ts` (AC: #1, #2, #3, #5, #8)
  - [x]Mock `child_process.execFileSync` to simulate successful dev workflow — assert returns `ok(DevResult)` with all fields populated
  - [x]Mock `child_process.execFileSync` to simulate non-zero exit — assert returns `fail()` with error message, never throws
  - [x]Mock `child_process.execFileSync` to simulate timeout (throw with `killed: true`) — assert returns `fail('timeout: ...')`
  - [x]Mock `child_process.execFileSync` to simulate missing story file — assert returns `fail()` with descriptive error
  - [x]Test that git diff is captured after workflow completion for `filesChanged`
  - [x]Test that all code paths return `Result<T>` — never throw

- [x]Task 5: Update `src/modules/dev/__tests__/index.test.ts` (AC: #1, #2, #7, #8)
  - [x]Update existing stub test to reflect new behavior (delegation to orchestrator)
  - [x]Add integration-level test: mock orchestrator, call `developStory()`, assert Result shape

- [x]Task 6: Verify build and tests (AC: #7, #8)
  - [x]`npm run build` succeeds
  - [x]`npm test` passes all existing + new tests
  - [x]No file in `src/modules/dev/` exceeds 300 lines
  - [x]Coverage target met on new code

## Dev Notes

### Architecture Constraints

- **Result<T> pattern** — every public function returns `Result<T>`, never throws. Import `ok`, `fail` from `../../types/result.js`. [Source: architecture-overhaul.md#Decision 1]
- **ES modules** — all imports use `.js` extension. [Source: tsconfig.json]
- **Strict TypeScript** — `strict: true`, no `any` types (NFR19).
- **File size limit** — no file exceeds 300 lines (NFR18). The orchestrator should be a focused file handling only workflow invocation.
- **100% test coverage** on new code (NFR14).
- **Module boundary** — `orchestrator.ts` is internal to dev module. Only `index.ts` is the public interface.
- **Thin CLI commands** — if a CLI command is added, it must be <100 lines (NFR, FR40).

### Key FRs & NFRs

- **FR24:** System can orchestrate story implementation via BMAD dev-story workflow.
- **FR26:** Dev module can fail independently without crashing sprint execution.
- **NFR1:** No module failure crashes the overall system — structured error results.
- **NFR2:** codeharness run survives 8+ hours without crashes or memory leaks.
- **NFR14:** 100% test coverage on new/changed code.
- **NFR18:** No source file exceeds 300 lines.
- **NFR19:** Module interfaces documented with TypeScript types — no `any`.

### How Dev Workflow is Currently Invoked

Ralph spawns a fresh Claude Code session per iteration using `ralph/.harness-prompt.md`, which instructs the session to run `/harness-run`. The harness-run skill invokes `/bmad-dev-story` for implementation. Currently this is all orchestrated at the skill/prompt level — the TypeScript dev module is a stub returning `fail('not implemented')`.

This story replaces the stub with a real orchestrator that can invoke the BMAD dev-story workflow programmatically. The orchestrator uses `child_process` to spawn the workflow, capture output, and return structured results.

### Dev Module Structure After This Story

```
src/modules/dev/
├── index.ts              # Public interface: developStory() — delegates to orchestrator
├── orchestrator.ts       # invokeBmadDevStory() — spawns BMAD workflow, captures results (NEW)
├── types.ts              # DevResult (MODIFIED — added duration, output fields)
├── __tests__/
    ├── index.test.ts     # Updated stub test
    ├── orchestrator.test.ts  # NEW — orchestrator unit tests
```

### Dependencies

- **Epic 1 (done):** Result<T> types in `src/types/result.ts` — `ok()`, `fail()`, `Result<T>`, `isOk()`, `isFail()`.
- **Epic 2 (done):** Sprint module with state management — `updateStoryStatus()` available for sprint to call after dev returns.
- **Story 3.1 (verifying):** Timeout capture pattern in `src/modules/sprint/timeout.ts` — similar `execSync` with timeout pattern to follow.
- **No external dependencies needed.** Uses `node:child_process` and `node:fs`.

### Existing Patterns to Follow

- **Timeout handling:** Follow `src/modules/sprint/timeout.ts` — `execSync` with `{ timeout: N }`, catch error, check `error.killed` for timeout detection.
- **Types:** Follow `src/modules/sprint/types.ts` — `readonly` interfaces.
- **Module index:** Follow `src/modules/sprint/index.ts` — import impl, delegate, re-export types.
- **Tests:** Follow `src/modules/sprint/__tests__/timeout.test.ts` — mock `child_process`, test all Result paths.

### References

- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md#Decision 1 — Result<T> pattern]
- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md — dev/ module: orchestrator.ts]
- [Source: _bmad-output/planning-artifacts/epics-overhaul.md#Story 3.2 — Graceful Dev Module]
- [Source: src/types/result.ts — Result<T>, ok(), fail()]
- [Source: src/modules/dev/types.ts — existing DevResult interface]
- [Source: src/modules/dev/index.ts — existing stub]
- [Source: src/modules/sprint/timeout.ts — execSync timeout pattern to follow]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [x]Showboat proof document created (`docs/exec-plans/active/3-2-graceful-dev-module.proof.md`)
- [x]All acceptance criteria verified with real-world evidence
- [x]Test coverage meets target (100%)

## Documentation Requirements

- [x]Relevant AGENTS.md files updated (list modules touched)
- [x]Exec-plan created in `docs/exec-plans/active/3-2-graceful-dev-module.md`

## Testing Requirements

- [x]Unit tests written for all new/changed code
- [x]Integration tests for cross-module interactions
- [x]Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
