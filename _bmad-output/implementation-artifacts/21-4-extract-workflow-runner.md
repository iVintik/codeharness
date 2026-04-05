<story-spec>
# Story 21-4: Extract `workflow-runner.ts` from `workflow-machine.ts`

Status: ready-for-dev

## Story

As a developer,
I want `runWorkflowActor()`, `checkDriverHealth()`, and `loadWorkItems()` extracted into their own module (`workflow-runner.ts`),
So that the monolith `workflow-machine.ts` is reduced to a thin re-export shim, the composition root is a standalone module at ≤150 lines, and the file decomposition plan (AD6/Epic 7) reaches its final extraction milestone.

## Acceptance Criteria

1. **Given** the project is built via `npm run build`, **When** the build completes, **Then** it exits 0 with zero errors in stdout/stderr.
   <!-- verification: `npm run build` exits 0 -->

2. **Given** the full test suite is run via `npx vitest run`, **When** all tests complete, **Then** the pass count is ≥4976 with zero failures — no regressions from the extraction.
   <!-- verification: `npx vitest run` exits 0; pass count >= 4976 -->

3. **Given** the file `src/lib/workflow-runner.ts` exists, **When** its line count is measured via `wc -l`, **Then** it contains ≤150 lines (imports, whitespace, and comments included).
   <!-- verification: `wc -l src/lib/workflow-runner.ts` shows number <= 150 -->

4. **Given** the monolith `src/lib/workflow-machine.ts` was 240 lines before this extraction, **When** its current line count is measured, **Then** it contains only re-export statements and no function bodies — every `export` line uses `from` syntax (re-export), and `grep -cE "^(export )?(async )?function " src/lib/workflow-machine.ts` returns 0.
   <!-- verification: `grep -cE "^(export )?(async )?function " src/lib/workflow-machine.ts` outputs 0 -->

5. **Given** `workflow-runner.ts` is the new module, **When** its contents are searched for circular references back to the monolith via `grep -cE "from.*workflow-machine\b[^s]" src/lib/workflow-runner.ts`, **Then** the count is 0 — no circular dependency.
   <!-- verification: `grep -cE "from.*workflow-machine\b[^s]" src/lib/workflow-runner.ts` outputs 0 -->

6. **Given** `workflow-machine.ts` consumes the runner from the new module, **When** its imports are searched via `grep 'workflow-runner' src/lib/workflow-machine.ts`, **Then** at least one import/re-export line from `./workflow-runner.js` is present.
   <!-- verification: `grep 'workflow-runner' src/lib/workflow-machine.ts` shows at least one line -->

7. **Given** `src/commands/run.ts` imports `runWorkflowActor` from `workflow-machine.js`, **When** the build completes and `npx vitest run -t 'run'` is executed, **Then** all run-related tests pass — the re-export from `workflow-machine.ts` preserves backward compatibility without requiring import path changes in consumers.
   <!-- verification: `npx vitest run -t 'run'` exits 0 with 0 failures -->

8. **Given** the test suite includes health-check tests, **When** they are run via `npx vitest run -t 'health'`, **Then** all matching tests pass — the extracted `checkDriverHealth` works identically to before.
   <!-- verification: `npx vitest run -t 'health'` exits 0 with 0 failures -->

9. **Given** the test suite includes workflow-engine integration tests, **When** they are run via `npx vitest run -t 'workflow'`, **Then** all matching tests pass — `loadWorkItems` and the full `runWorkflowActor` pipeline work identically.
   <!-- verification: `npx vitest run -t 'workflow'` exits 0 with 0 failures -->

10. **Given** the project linter is run on the new file via `npx eslint src/lib/workflow-runner.ts`, **When** linting completes, **Then** it exits 0 with zero errors and zero warnings.
    <!-- verification: `npx eslint src/lib/workflow-runner.ts` exits 0 with empty output -->

11. **Given** the TypeScript compiler is run via `npx tsc --noEmit`, **When** type-checking completes, **Then** zero errors reference `workflow-runner.ts`. Pre-existing type errors in other files are acceptable, but the new file must introduce no new ones.
    <!-- verification: `npx tsc --noEmit 2>&1 | grep 'workflow-runner'` produces no output -->

12. **Given** `workflow-runner.ts` is the composition root, **When** its imports are inspected via `grep "^import" src/lib/workflow-runner.ts`, **Then** it imports only from allowed modules: `xstate`, `node:fs`, `node:path`, `yaml`, `workflow-types`, `workflow-compiler`, `workflow-machines`, `workflow-state`, `workflow-parser`, `agents/drivers/factory`, `agents/capability-check`, and `output.js`. It does NOT import from `workflow-machine.ts` (the monolith shim).
    <!-- verification: `grep "^import" src/lib/workflow-runner.ts` shows only allowed modules; `grep -cE "from.*workflow-machine\b[^s]" src/lib/workflow-runner.ts` outputs 0 -->

## Tasks / Subtasks

- [ ] Task 1: Create `src/lib/workflow-runner.ts` with extracted entry-point logic (AC: 1, 3, 5, 10, 11, 12)
  - [ ] 1.1: Create the file with module header documenting "Workflow runner — composition root and entry point"
  - [ ] 1.2: Move `HEALTH_CHECK_TIMEOUT_MS` constant
  - [ ] 1.3: Move `loadWorkItems()` function (~58 lines — YAML parsing, sprint status filtering, issues loading)
  - [ ] 1.4: Move `checkDriverHealth()` function (~34 lines — driver health check with timeout race)
  - [ ] 1.5: Move `runWorkflowActor()` function (~96 lines — pre-flight, work item loading, machine creation and execution, result assembly)
  - [ ] 1.6: Add all necessary imports from allowed modules (xstate, node:fs, yaml, workflow-machines, workflow-types, workflow-compiler, workflow-state, workflow-parser, agents/drivers/factory, agents/capability-check, output)
  - [ ] 1.7: Export public API: `runWorkflowActor`, `checkDriverHealth`, `loadWorkItems`

- [ ] Task 2: Convert `src/lib/workflow-machine.ts` into a pure re-export shim (AC: 4, 6)
  - [ ] 2.1: Remove all function bodies, constants, and logic from `workflow-machine.ts`
  - [ ] 2.2: Add re-exports from `./workflow-runner.js` for: `runWorkflowActor`, `checkDriverHealth`, `loadWorkItems`
  - [ ] 2.3: Preserve all existing re-exports from `workflow-types.ts`, `workflow-compiler.ts`, `workflow-actors.ts`, `workflow-machines.ts`, `verdict-parser.ts`
  - [ ] 2.4: Remove imports that are no longer needed (`xstate`, `node:fs`, `yaml`, `agents/drivers/factory`, `agents/capability-check`, `workflow-parser`, `workflow-state`)
  - [ ] 2.5: Verify no function bodies remain — only `export ... from` and `export type ... from` lines

- [ ] Task 3: Verify backward compatibility for all consumers (AC: 2, 7, 8, 9)
  - [ ] 3.1: Confirm `src/commands/run.ts` compiles without import changes (imports `runWorkflowActor`, `EngineConfig`, `EngineEvent` from `workflow-machine.js`)
  - [ ] 3.2: Confirm `src/lib/lane-pool.ts` compiles without import changes (imports `EngineResult` from `workflow-machine.js`)
  - [ ] 3.3: Confirm `src/lib/workflow-persistence.ts` compiles without import changes (imports `EngineError` from `workflow-machine.js`)
  - [ ] 3.4: Confirm all test files compile without import changes (workflow-machine.test.ts, workflow-engine.test.ts, driver-health-check.test.ts, story-flow-execution.test.ts, null-task-engine.test.ts, lane-pool.test.ts)

- [ ] Task 4: Final verification (AC: 1-12)
  - [ ] 4.1: `npm run build` exits 0
  - [ ] 4.2: `npx vitest run` — all tests pass, pass count ≥ 4976
  - [ ] 4.3: `wc -l src/lib/workflow-runner.ts` ≤ 150
  - [ ] 4.4: `grep -cE "^(export )?(async )?function " src/lib/workflow-machine.ts` outputs 0
  - [ ] 4.5: `grep -cE "from.*workflow-machine\b[^s]" src/lib/workflow-runner.ts` outputs 0
  - [ ] 4.6: `grep 'workflow-runner' src/lib/workflow-machine.ts` shows re-export line(s)
  - [ ] 4.7: `npx vitest run -t 'run'` passes
  - [ ] 4.8: `npx vitest run -t 'health'` passes
  - [ ] 4.9: `npx vitest run -t 'workflow'` passes
  - [ ] 4.10: `npx eslint src/lib/workflow-runner.ts` exits 0
  - [ ] 4.11: `npx tsc --noEmit 2>&1 | grep workflow-runner` produces no output
  - [ ] 4.12: `grep -cE "from.*workflow-machine\b[^s]" src/lib/workflow-runner.ts` outputs 0

## Dev Notes

### What Gets Extracted

All entry-point, pre-flight, and work-item-loading logic from `workflow-machine.ts`:

| Item | Lines | Description |
|------|-------|-------------|
| `HEALTH_CHECK_TIMEOUT_MS` | 1 | Constant (5000ms) |
| `loadWorkItems()` | ~58 | Reads sprint-status.yaml + issues.yaml, filters by status, returns WorkItem[] |
| `checkDriverHealth()` | ~34 | Probes all workflow drivers with timeout race |
| `runWorkflowActor()` | ~96 | Composition root: reads state, health check, capability check, loads work items, groups by epic, creates+runs XState machine, assembles EngineResult |
| Imports + header | ~10 | Module documentation and import statements |
| **Total** | **~150** | Within budget |

### What Stays in `workflow-machine.ts`

After this extraction, the monolith becomes a pure re-export shim:

```typescript
// workflow-machine.ts — backward-compatible re-export shim
// All logic now lives in specialized modules. This file exists
// only to preserve import paths for existing consumers.

export { runWorkflowActor, checkDriverHealth, loadWorkItems } from './workflow-runner.js';
export { executeLoopBlock, dispatchTask } from './workflow-machines.js';
export { buildCoverageDeduplicationContext } from './workflow-actors.js';
export type { DispatchInput, DispatchOutput, NullTaskInput, EngineEvent, EngineConfig } from './workflow-types.js';
export type { EngineResult, EngineError, WorkItem, LoopBlockResult, DriverHealth, OutputContract } from './workflow-compiler.js';
export { isTaskCompleted, isLoopTaskCompleted, buildRetryPrompt, buildAllUnknownVerdict, getFailedItems, PER_RUN_SENTINEL } from './workflow-compiler.js';
export type { EvaluatorVerdict } from './verdict-parser.js';
export { parseVerdict } from './verdict-parser.js';
```

This is ~15-20 lines. Story 21-5 (`Delete workflow-machine.ts`) will update all consumers to import from the new canonical modules and remove this shim entirely.

### Dependency Direction (CRITICAL)

```
workflow-runner.ts   (NEW — composition root)
       |
       | imports from
       v
  xstate (createActor)
  node:fs (readFileSync, existsSync)
  yaml (parse)
  workflow-machines.ts (runMachine)
  workflow-types.ts (EngineConfig, RunMachineContext)
  workflow-compiler.ts (EngineResult, EngineError, WorkItem, DriverHealth)
  workflow-state.ts (readWorkflowState, writeWorkflowState)
  workflow-parser.ts (ResolvedWorkflow)
  agents/drivers/factory.ts (getDriver)
  agents/capability-check.ts (checkCapabilityConflicts)
  output.ts (warn, info)
```

`workflow-runner.ts` imports from all workflow modules (it's the composition root — this is correct). It must NOT import from `workflow-machine.ts` (the shim).

`workflow-machine.ts` re-exports from `workflow-runner.ts` and other modules. It has zero logic of its own.

### Line Budget: Exactly 150

The epic spec says ≤150 lines. The current `workflow-machine.ts` has exactly 240 lines, of which ~90 are re-export statements, imports that won't move, and the module header. The remaining ~150 lines are the three functions + their constant + their local imports. This is a clean fit.

If the line count is tight after adding the `workflow-runner.ts` header and its own imports:
1. Remove redundant blank lines between function sections
2. Collapse single-line jsdoc comments
3. Inline the `HEALTH_CHECK_TIMEOUT_MS` constant directly into `checkDriverHealth`

### Anti-Patterns to Avoid

- **Do NOT refactor any function logic** — this is a pure move/extract. Zero behavior changes.
- **Do NOT change any function signatures** — inputs, outputs, and error types must remain identical.
- **Do NOT update consumer import paths** — that's Story 21-5's job. All consumers continue importing from `workflow-machine.ts` via re-exports.
- **Do NOT delete `workflow-machine.ts`** — it becomes a re-export shim, deleted in Story 21-5.
- **Do NOT move type re-exports** — `EngineConfig`, `EngineResult`, etc. stay re-exported from `workflow-machine.ts` for backward compat.
- **Do NOT introduce new dependencies** — `workflow-runner.ts` uses exactly the same imports the functions already had in `workflow-machine.ts`.

### Consumers That Must Keep Working (via re-exports)

| File | Imports from `workflow-machine.js` |
|------|-------------------------------------|
| `src/commands/run.ts` | `runWorkflowActor`, `EngineConfig`, `EngineEvent` |
| `src/lib/lane-pool.ts` | `EngineResult` (type) |
| `src/lib/workflow-persistence.ts` | `EngineError` (type) |
| `src/lib/__tests__/workflow-machine.test.ts` | Multiple: `executeLoopBlock`, `dispatchTask`, helpers, types |
| `src/lib/__tests__/workflow-engine.test.ts` | Multiple: helpers, types |
| `src/lib/__tests__/driver-health-check.test.ts` | `checkDriverHealth`, `runWorkflowActor`, `EngineConfig` |
| `src/lib/__tests__/story-flow-execution.test.ts` | `runWorkflowActor`, `EngineConfig` |
| `src/lib/__tests__/null-task-engine.test.ts` | Multiple: helpers, types |
| `src/lib/__tests__/lane-pool.test.ts` | `EngineResult` (type) |

All of these continue to import from `workflow-machine.js`. The re-export shim ensures zero breakage.

### Testing Strategy

No new tests needed. This is a pure extraction — existing tests cover all behavior. The verification is structural:
- Build passes → compilation correctness
- All tests pass → behavioral correctness
- Line count ≤150 → architectural correctness
- No circular deps → dependency correctness
- Only imports from allowed modules → boundary correctness
- Monolith has no function bodies → extraction completeness

### References

- Architecture: `_bmad-output/planning-artifacts/architecture-xstate-engine.md` — AD6 (File Organization)
- Epics: `_bmad-output/planning-artifacts/epics-xstate-engine.md` — Epic 7, Story 7.4
- Prior stories: `21-1-extract-workflow-actors.md`, `21-2-extract-workflow-compiler.md`, `21-3-extract-workflow-machines.md` — established extraction patterns
- Current source: `src/lib/workflow-machine.ts` — 240 lines, functions to extract at lines 46-240

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/21-4-extract-workflow-runner-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (src/lib/AGENTS.md — add workflow-runner.ts entry)
- [ ] Exec-plan created in docs/exec-plans/active/21-4-extract-workflow-runner.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
</story-spec>
