# Story 21-3: Extract `workflow-machines.ts` from `workflow-machine.ts`

Status: draft

## Story

As a developer,
I want the XState machine definitions and their orchestration actors extracted into their own module (`workflow-machines.ts`),
So that the monolith continues shrinking, machine definitions are co-located with their actors in a single cohesive module, and the dependency direction established by the architecture (AD6) is enforced.

## Acceptance Criteria

1. **Given** the project is built via `npm run build`, **When** the build completes, **Then** it exits 0 with zero errors in stdout/stderr.
   <!-- verification: `npm run build` exits 0 -->

2. **Given** the full test suite is run via `npx vitest run`, **When** all tests complete, **Then** the pass count is ≥4976 with zero failures — no regressions from the extraction.
   <!-- verification: `npx vitest run` exits 0; pass count >= 4976 -->

3. **Given** the file `src/lib/workflow-machines.ts` exists, **When** its line count is measured via `wc -l`, **Then** it contains ≤500 lines (imports, whitespace, and comments included).
   <!-- verification: `wc -l src/lib/workflow-machines.ts` shows number <= 500 -->

4. **Given** the monolith `src/lib/workflow-machine.ts` was 977 lines before this extraction, **When** its current line count is measured via `wc -l`, **Then** it contains ≤350 lines (at least 620 lines fewer than before).
   <!-- verification: `wc -l src/lib/workflow-machine.ts` shows number <= 350 -->

5. **Given** `workflow-machines.ts` is the new module, **When** its contents are searched for references to `workflow-machine` (singular, the monolith) via `grep -c "from.*workflow-machine\b[^s]" src/lib/workflow-machines.ts`, **Then** the count is 0 — no circular dependency back to the monolith.
   <!-- verification: `grep -cE "from.*workflow-machine\b[^s]" src/lib/workflow-machines.ts` outputs 0 -->

6. **Given** `workflow-machine.ts` consumes machines from the new module, **When** its imports are searched via `grep 'workflow-machines' src/lib/workflow-machine.ts`, **Then** at least one import line from `./workflow-machines.js` is present.
   <!-- verification: `grep 'workflow-machines' src/lib/workflow-machine.ts` shows at least one import line -->

7. **Given** the test suite includes loop-related tests, **When** they are run via `npx vitest run -t 'loop'`, **Then** all matching tests pass — the extracted `loopMachine` and `executeLoopBlock` work identically to before.
   <!-- verification: `npx vitest run -t 'loop'` exits 0 with 0 failures -->

8. **Given** the test suite includes epic-related tests, **When** they are run via `npx vitest run -t 'epic'`, **Then** all matching tests pass — the extracted `epicMachine` and `epicStepActor` work identically to before.
   <!-- verification: `npx vitest run -t 'epic'` exits 0 with 0 failures -->

9. **Given** the test suite includes run/workflow tests, **When** they are run via `npx vitest run -t 'run'`, **Then** all matching tests pass — the extracted `runMachine` works identically to before.
   <!-- verification: `npx vitest run -t 'run'` exits 0 with 0 failures -->

10. **Given** the project linter is run on the new file via `npx eslint src/lib/workflow-machines.ts`, **When** linting completes, **Then** it exits 0 with zero errors and zero warnings.
    <!-- verification: `npx eslint src/lib/workflow-machines.ts` exits 0 with empty output -->

11. **Given** the TypeScript compiler is run via `npx tsc --noEmit`, **When** type-checking completes, **Then** zero errors reference `workflow-machines.ts`. Pre-existing type errors in other files are acceptable, but the new file must introduce no new ones.
    <!-- verification: `npx tsc --noEmit 2>&1 | grep 'workflow-machines'` produces no output -->

12. **Given** `workflow-machines.ts` contains XState machine definitions, **When** its imports are inspected via `grep "^import" src/lib/workflow-machines.ts`, **Then** it imports only from allowed modules: `xstate`, `node:fs`, `node:path`, `workflow-types`, `workflow-compiler`, `workflow-actors`, `workflow-state`, `workflow-parser`, `verdict-parser`, `circuit-breaker`, `agent-dispatch`, `agent-resolver`, `agents/stream-parser`, and `output.js`. It does NOT import from `workflow-machine.ts` (the monolith), `agents/drivers/`, or `agents/capability-check`.
    <!-- verification: `grep "^import" src/lib/workflow-machines.ts` shows only allowed modules; `grep -cE "from.*workflow-machine\b[^s]|agents/drivers|capability-check" src/lib/workflow-machines.ts` outputs 0 -->

13. **Given** all downstream consumers of `executeLoopBlock`, `dispatchTask`, and machine-related exports, **When** the project is built and tests run, **Then** no consumer needs to change its import path — re-exports from `workflow-machine.ts` preserve backward compatibility.
    <!-- verification: `npm run build && npx vitest run` exits 0 (proves re-exports work) -->

## Tasks / Subtasks

- [ ] Task 1: Create `src/lib/workflow-machines.ts` with extracted machine definitions and orchestration actors (AC: 1, 3, 5, 10, 11, 12)
  - [ ] 1.1: Create the file with module header documenting "XState machine definitions and orchestration actors"
  - [ ] 1.2: Move `LoopMachineContext` interface (~16 lines)
  - [ ] 1.3: Move `loopIterationActor` — the `fromPromise` loop iteration actor (~127 lines)
  - [ ] 1.4: Move `loopMachine` — XState machine definition with guards (~67 lines)
  - [ ] 1.5: Move `executeLoopBlock()` function — creates and runs loopMachine actor (~27 lines)
  - [ ] 1.6: Move `dispatchTask()` backward-compat wrapper (~16 lines)
  - [ ] 1.7: Move `collectGuideFiles()` helper (~34 lines)
  - [ ] 1.8: Move `cleanupGuideFiles()` helper (~4 lines)
  - [ ] 1.9: Move `storyFlowActor` — the `fromPromise` story orchestration actor (~83 lines)
  - [ ] 1.10: Move `EpicMachineContext` interface (~17 lines)
  - [ ] 1.11: Move `epicStepActor` — the `fromPromise` epic step actor (~100 lines)
  - [ ] 1.12: Move `epicMachine` — XState machine definition (~40 lines)
  - [ ] 1.13: Move `RunMachineContext` interface (~14 lines)
  - [ ] 1.14: Move `runEpicActor` — the `fromPromise` run-level actor (~44 lines)
  - [ ] 1.15: Move `runMachine` — XState machine definition (~40 lines)
  - [ ] 1.16: Add all necessary imports from allowed modules
  - [ ] 1.17: Export public API: `loopMachine`, `executeLoopBlock`, `dispatchTask`, `epicMachine`, `runMachine`, `RunMachineContext`, `EpicMachineContext`

- [ ] Task 2: Apply line budget — verify `workflow-machines.ts` stays under 500 lines (AC: 3)
  - [ ] 2.1: Count lines after extraction
  - [ ] 2.2: If over 500, move context interfaces (`LoopMachineContext`, `EpicMachineContext`, `RunMachineContext`) to `workflow-types.ts`
  - [ ] 2.3: If still over, tighten whitespace/comments — collapse single-line jsdoc, remove redundant blank lines
  - [ ] 2.4: Verify final `wc -l` ≤ 500

- [ ] Task 3: Update `src/lib/workflow-machine.ts` to import from new module (AC: 2, 4, 6, 13)
  - [ ] 3.1: Remove all code moved in Task 1 from `workflow-machine.ts`
  - [ ] 3.2: Add import statement(s) from `./workflow-machines.js`
  - [ ] 3.3: Re-export `executeLoopBlock`, `dispatchTask`, `runMachine`, `RunMachineContext` — symbols that downstream consumers expect from `workflow-machine.ts`
  - [ ] 3.4: Remove imports that are no longer needed in `workflow-machine.ts` (xstate `setup`, `assign`, `fromPromise` if no longer used; `node:fs`/`node:path` if guide helpers moved)
  - [ ] 3.5: Verify that `runWorkflowActor()` still compiles — it uses `runMachine`, `RunMachineContext` (now imported)

- [ ] Task 4: Update cross-file imports if needed (AC: 1, 11)
  - [ ] 4.1: Check if any files import moved symbols directly from `workflow-machine` — if so, rely on re-exports from Task 3.3
  - [ ] 4.2: Run `npx tsc --noEmit 2>&1 | grep workflow-machines` to confirm zero new type errors

- [ ] Task 5: Final verification (AC: 1-13)
  - [ ] 5.1: `npm run build` exits 0
  - [ ] 5.2: `npx vitest run` — all tests pass, pass count ≥ 4976
  - [ ] 5.3: `wc -l src/lib/workflow-machines.ts` ≤ 500
  - [ ] 5.4: `wc -l src/lib/workflow-machine.ts` ≤ 350
  - [ ] 5.5: `grep -cE "from.*workflow-machine\b[^s]" src/lib/workflow-machines.ts` outputs 0
  - [ ] 5.6: `grep 'workflow-machines' src/lib/workflow-machine.ts` shows import line(s)
  - [ ] 5.7: `npx vitest run -t 'loop'` passes
  - [ ] 5.8: `npx vitest run -t 'epic'` passes
  - [ ] 5.9: `npx vitest run -t 'run'` passes
  - [ ] 5.10: `npx eslint src/lib/workflow-machines.ts` exits 0
  - [ ] 5.11: `npx tsc --noEmit 2>&1 | grep workflow-machines` produces no output
  - [ ] 5.12: `grep -cE "from.*workflow-machine\b[^s]|agents/drivers|capability-check" src/lib/workflow-machines.ts` outputs 0
  - [ ] 5.13: `npm run build && npx vitest run` exits 0 (re-export backward compat)

## Dev Notes

### Line Budget: Why 500, Not 250

The epic estimated ≤250 lines for this extraction. That estimate assumed the machines would be thin `setup().createMachine()` wrappers that import actors from elsewhere. In practice, the orchestration actors (`loopIterationActor`, `storyFlowActor`, `epicStepActor`, `runEpicActor`) are **tightly coupled** to their machine definitions — each machine references its actor in `setup({ actors: { ... } })`. Extracting machines without their actors would force a circular dependency:

```
workflow-machines.ts → imports actors from → workflow-machine.ts → imports machines from → workflow-machines.ts
```

The only way to avoid this cycle is to co-locate machines and their actors. The raw line counts are:

| Item | Lines |
|------|-------|
| `LoopMachineContext` interface | 16 |
| `loopIterationActor` | 127 |
| `loopMachine` definition | 67 |
| `executeLoopBlock()` | 27 |
| `dispatchTask()` wrapper | 16 |
| `collectGuideFiles()` | 34 |
| `cleanupGuideFiles()` | 4 |
| `storyFlowActor` | 83 |
| `EpicMachineContext` interface | 17 |
| `epicStepActor` | 100 |
| `epicMachine` definition | 40 |
| `RunMachineContext` interface | 14 |
| `runEpicActor` | 44 |
| `runMachine` definition | 40 |
| Imports + exports + header | ~40 |
| **Total** | **~669** |

To hit ≤500:
1. Move `LoopMachineContext`, `EpicMachineContext`, `RunMachineContext` to `workflow-types.ts` (~47 lines saved)
2. Tighten whitespace: collapse jsdoc to single-line where possible, remove redundant blank lines (~50 lines saved)
3. Remove comments that duplicate XState's self-documenting state names (~30 lines saved)
4. Consider inlining `collectGuideFiles`/`cleanupGuideFiles` into `epicStepActor` if they aren't used elsewhere (~net zero, but reduces export surface)

Estimated after budget: ~480-500 lines.

### What Gets Extracted

All XState machine definitions and their directly-coupled orchestration actors:

**Loop layer:**
- `LoopMachineContext` interface — context type for loop machine
- `loopIterationActor` — `fromPromise` actor that runs one full iteration of all tasks in a loop block
- `loopMachine` — XState machine with states: checkEmpty → iterating → checkTermination → done/halted/maxIterations/circuitBreaker
- `executeLoopBlock()` — creates `loopMachine` actor, runs to completion, returns `LoopBlockResult`
- `dispatchTask()` — backward-compat wrapper for tests

**Story layer:**
- `storyFlowActor` — `fromPromise` actor that runs one story through its storyFlow tasks sequentially

**Epic layer:**
- `EpicMachineContext` interface — context type for epic machine
- `epicStepActor` — `fromPromise` actor that processes one epic-flow step (story_flow, loop block, or epic task)
- `epicMachine` — XState machine with states: processingStep → checkNext → done
- `collectGuideFiles()` — helper for blind verify tasks (called by `epicStepActor`)
- `cleanupGuideFiles()` — cleanup helper (called by `epicStepActor`)

**Run layer:**
- `RunMachineContext` interface — context type for run machine
- `runEpicActor` — `fromPromise` actor that processes one epic by running the epic machine
- `runMachine` — XState machine with states: processingEpic → checkNext → allDone

### What Stays in `workflow-machine.ts`

After this extraction, the monolith retains only:
- `HEALTH_CHECK_TIMEOUT_MS` constant
- `loadWorkItems()` function (~67 lines)
- `checkDriverHealth()` function (~34 lines)
- `runWorkflowActor()` entry point (~96 lines)
- Re-exports from `workflow-types.ts`, `workflow-compiler.ts`, `workflow-actors.ts`, `workflow-machines.ts`, `verdict-parser.ts`
- Imports + header (~40 lines)

**Estimated: ~280-340 lines.** This sets up Story 21-4 (extract `workflow-runner.ts`) to move the remaining entry-point logic.

### Dependency Direction (CRITICAL)

```
workflow-machines.ts  <-- imports from --  workflow-machine.ts (runWorkflowActor uses runMachine)
       |
       | imports from
       v
  xstate (setup, assign, fromPromise, createActor)
  node:fs (readFileSync, existsSync, writeFileSync, mkdirSync, rmSync)
  node:path (join)
  workflow-actors.ts (dispatchTaskCore, nullTaskCore)
  workflow-compiler.ts (helpers, constants, types)
  workflow-types.ts (EngineConfig)
  workflow-state.ts (readWorkflowState, writeWorkflowState, WorkflowState)
  workflow-parser.ts (ResolvedTask, LoopBlock)
  verdict-parser.ts (parseVerdict, parseVerdictTag, VerdictParseError, EvaluatorVerdict)
  circuit-breaker.ts (evaluateProgress)
  agent-dispatch.ts (DispatchError)
  agent-resolver.ts (SubagentDefinition)
  agents/stream-parser.ts (StreamEvent)
  output.ts (warn)
```

`workflow-machines.ts` must NOT import from `workflow-machine.ts`. The dependency flows one way: the monolith (and eventually `workflow-runner.ts`) imports from machines. Violation creates a circular dependency.

### Lessons from 21-2 Review Failure

The 21-2 review flagged `workflow-compiler.ts` for importing from `agent-dispatch.ts` and `agents/types.ts`, violating the purity boundary. For 21-3, the situation is different: `workflow-machines.ts` is NOT a pure module — it contains XState actors with IO (file writes, dispatch calls). Importing from `agent-dispatch.ts`, `node:fs`, `xstate` etc. is architecturally correct for this module. The import boundary constraint (AC12) explicitly allows these imports.

### Anti-Patterns to Avoid

- **Do NOT refactor any actor logic** — this is a pure move/extract. Zero behavior changes.
- **Do NOT split machines from their actors** — that creates circular dependencies (see line budget discussion above).
- **Do NOT move `runWorkflowActor()`** — that's Story 21-4 (extract `workflow-runner.ts`).
- **Do NOT move `checkDriverHealth()` or `loadWorkItems()`** — those belong in the runner module (Story 21-4).
- **Do NOT change any function signatures** — inputs, outputs, and error types must remain identical.
- **Do NOT break re-exports** — if `workflow-machine.ts` currently exports a symbol, it must continue to do so (via re-export from machines or direct export).

### Testing Strategy

No new tests needed. This is a pure extraction — existing tests cover all behavior. The verification is structural:
- Build passes (compilation correctness)
- All tests pass (behavioral correctness)
- Line counts meet constraints (architectural correctness)
- No circular deps (dependency correctness)
- Only imports from allowed modules (boundary correctness)

### References

- Architecture: `_bmad-output/planning-artifacts/architecture-xstate-engine.md` — AD6 (File Organization)
- Epics: `_bmad-output/planning-artifacts/epics-xstate-engine.md` — Epic 7, Story 7.3
- Prior stories: `21-1-extract-workflow-actors.md`, `21-2-extract-workflow-compiler.md` — established extraction patterns
- Review failure context: 21-2 review flagged dependency boundary violations — this story's AC12 explicitly defines the allowed import surface

<!-- CODEHARNESS-PATCH-START:verification-requirements -->

## Verification Requirements

Before this story can be marked complete, the following must be verified:

- [ ] All acceptance criteria verified via Docker-based blind verification
- [ ] Proof document at `verification/21-3-extract-workflow-machines-proof.md`
- [ ] Evidence is reproducible

## Documentation Requirements

- [ ] Per-subsystem AGENTS.md updated for any new/changed modules
- [ ] Exec-plan created at `docs/exec-plans/active/21-3-extract-workflow-machines.md`
- [ ] Inline code documentation for new public APIs

## Testing Requirements

- [ ] Tests written for all new code
- [ ] Project-wide test coverage at 100%
- [ ] All tests passing

<!-- CODEHARNESS-PATCH-END:verification-requirements -->
