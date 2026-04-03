# Story 16-2: Engine-Handled Null Tasks — Verification Proof

**Story:** `_bmad-output/implementation-artifacts/16-2-engine-handled-null-tasks.md`
**Verification Tier:** test-provable
**Date:** 2026-04-03
**Verdict:** ALL_PASS (8/8 ACs)

---

## Build & Test Summary

| Check | Result |
|-------|--------|
| Build (`npm run build`) | PASS — tsup success, no errors |
| Tests (`npx vitest run`) | PASS — 4717 passed, 1 failed (pre-existing `stats.test.ts`, unrelated) |
| Story tests (26 tests) | PASS — 26/26 passed (9 registry + 17 engine) |
| Lint (`npm run lint`) | PASS for story files — no errors in `null-task-registry.ts` |
| Coverage (`null-task-registry.ts`) | 100% Stmts, 100% Branch, 100% Funcs, 100% Lines |

---

## File Inventory

| File | Status | Evidence |
|------|--------|----------|
| `src/lib/null-task-registry.ts` | NEW | Exists, 2680 bytes, exports: `TaskContext`, `NullTaskResult`, `NullTaskHandler`, `registerNullTask`, `getNullTask`, `listNullTasks`, `clearNullTaskRegistry` |
| `src/lib/workflow-engine.ts` | MODIFIED | Contains `executeNullTask()` function, null-agent branches at lines 737, 985, 1148-1178 |
| `src/commands/run.ts` | VERIFIED | Line 141: `if (task.agent != null && !agents[task.agent])` — correctly skips null agents |
| `src/lib/__tests__/null-task-registry.test.ts` | NEW | 9 tests, all passing |
| `src/lib/__tests__/null-task-engine.test.ts` | NEW | 17 tests, all passing |

---

## Acceptance Criteria Verification

### AC #1: Engine skips driver dispatch for agent: null tasks
**PASS**
- **Test:** `does not call getDriver or driver.dispatch for null tasks` — PASSED
- **Code:** `workflow-engine.ts` line 737: `if (task.agent === null)` branches to `executeNullTask()` instead of `dispatchTaskWithResult()`
- **Evidence:** Test verifies no `getDriver()` or `driver.dispatch()` calls occur

### AC #2: Registry returns handler or undefined
**PASS**
- **Tests:** `returns undefined for an unregistered handler` — PASSED; `returns the registered handler` — PASSED
- **Code:** `null-task-registry.ts` exports `getNullTask(name)` returning `NullTaskHandler | undefined`
- **Engine test:** `engine calls getNullTask to look up handler` — PASSED

### AC #3: Handler receives correct TaskContext
**PASS**
- **Test:** `passes storyKey, taskName, cost, durationMs, outputContract, projectDir` — PASSED
- **Interface:** `TaskContext` exported with all 6 fields: `storyKey`, `taskName`, `cost`, `durationMs`, `outputContract`, `projectDir`
- **Additional test:** `handler receives all expected fields` — PASSED (registry test)

### AC #4: TaskCheckpoint written after null task completion
**PASS**
- **Test:** `writes checkpoint to workflow state` — PASSED
- **Code:** `executeNullTask()` writes checkpoint at workflow-engine.ts after handler completion

### AC #5: Unknown null task throws EngineError with NULL_TASK_NOT_FOUND
**PASS**
- **Test:** `records error with code NULL_TASK_NOT_FOUND for unknown handler` — PASSED
- **Code:** `workflow-engine.ts` line 306: `code: 'NULL_TASK_NOT_FOUND'`

### AC #6: Null task completes in <10ms
**PASS**
- **Tests:** `completes in under 10ms (AC #6)` — PASSED (registry); `null task dispatch and checkpoint takes less than 10ms` — PASSED (engine)
- **Evidence:** Performance assertion in both test files

### AC #7: Mixed null and agent tasks interleave correctly
**PASS**
- **Test:** `executes null and agent tasks in flow order` — PASSED
- **Additional tests:** `null task in loop block` — PASSED; `per-story null task iterates all work items` — PASSED; `per-run null task runs once with sentinel key` — PASSED; `skips null task with existing checkpoint` (crash recovery) — PASSED

### AC #8: Null task OutputContract has driver=engine, cost_usd=0
**PASS**
- **Test:** `produces contract with engine driver and zero cost` — PASSED
- **Code:** `executeNullTask()` builds OutputContract with `driver: "engine"`, `model: "null"`, `cost_usd: 0`

---

## Additional Coverage

| Test | Result |
|------|--------|
| Handler failure (success: false) → NULL_TASK_FAILED error | PASSED |
| Handler throws exception → NULL_TASK_HANDLER_ERROR | PASSED |
| No success checkpoint on failure | PASSED |
| Accumulated cost tracking across tasks | PASSED |
| clearNullTaskRegistry for test isolation | PASSED |
| checkDriverHealth skips null agent tasks | PASSED |

---

## Verdict

**ALL_PASS — 8/8 ACs verified with test evidence.**
