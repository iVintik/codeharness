<story-spec>

# Story 27-2: Derive workflow position from XState snapshot state path

Status: ready-for-dev

## Story

As a workflow operator,
I want the visualizer to automatically extract the current workflow position from an XState persisted snapshot,
So that the visualization is derived entirely from machine state — no hand-tracked variables needed.

## Context

**Epic 27: TUI Visualization & Integration** — this is story 2 of 5. Story 27-1 (pure visualizer function) is complete: `visualize(position, vizConfig) → string` renders a one-line ANSI-colored workflow status from a `WorkflowPosition` struct.

**What exists and is usable:**

- `src/lib/workflow-visualizer.ts` (229 lines): Pure function `visualize()` accepting `WorkflowPosition` and returning a formatted string. Types: `WorkflowPosition`, `StepStatus`, `GateInfo`, `VizConfig`. All exported.
- `src/lib/workflow-run-machine.ts`: `runMachine` with state `processingEpic` → `checkNextEpic` → `allDone`/`halted`/`interrupted`. Context holds `epicEntries`, `currentEpicIndex`, `halted`.
- `src/lib/workflow-epic-machine.ts`: `epicMachine` iterates stories then epic-level steps. Context holds `epicId`, `epicItems`, `currentStoryIndex`, `currentStepIndex`, `storiesProcessed`, `halted`.
- `src/lib/workflow-story-machine.ts`: `storyMachine` processes sequential flow steps (tasks + gates). Context holds `item`, `tasksCompleted`, `halted`, `storyFlowTasks`.
- `src/lib/workflow-gate-machine.ts`: `gateMachine` with checking → evaluate → fixing cycle. Context holds `gate`, `verdicts`, iteration count.
- `src/lib/workflow-persistence.ts` (297 lines): `XStateWorkflowSnapshot` type with `.snapshot` field containing XState `getPersistedSnapshot()` output.
- `src/lib/workflow-types.ts` (292 lines): `RunContext`, `EpicContext`, `StoryContext`, `GateContext`, `ResolvedWorkflow`, `FlowStep`, `GateConfig`, `ForEachConfig`.

**Machine architecture (from AD2):**
- Machines use `fromPromise` actors for child orchestration (not XState child machines)
- Snapshot `value` is a flat state name (e.g., `"processingEpic"`)
- Nested position info lives in context fields: `currentEpicIndex`, `currentStoryIndex`, `currentStepIndex`
- The `epicEntries` array in `RunContext` gives total epic count
- The `epicItems` array in `EpicContext` gives total story count per epic
- The `config.workflow.storyFlow` gives the step list for step enumeration

**What this story builds:**

A new exported function in `src/lib/workflow-visualizer.ts`:
```typescript
snapshotToPosition(snapshot: unknown, workflow: ResolvedWorkflow): WorkflowPosition
```
That takes an XState persisted snapshot (the `.snapshot` field from `XStateWorkflowSnapshot`) plus the resolved workflow config, and returns a `WorkflowPosition` struct suitable for passing to `visualize()`.

**What this story does NOT build (deferred to later stories):**
- Wiring inspect API to call snapshotToPosition() + visualize() — that's story 27-3
- Sideband streaming to TUI — that's story 27-4
- Removing hand-tracked state from run.ts — that's story 27-5

**Key constraints:**
- `workflow-visualizer.ts` is at 229 lines. Adding snapshotToPosition() must keep total ≤ 300 lines (NFR18).
- `workflow-types.ts` is at 292 lines. Do NOT add types there — keep parser types in the visualizer file.
- The function must be pure — no I/O, no file reads, no network calls.
- Must handle all machine states: active processing, completed (allDone), halted, interrupted.

## Acceptance Criteria

1. **Given** the `codeharness` CLI is installed, **When** the user runs `npm run build`, **Then** the build completes successfully with exit code 0 and the visualizer module is loadable.
   <!-- verification: npm run build exits 0 -->

2. **Given** a persisted snapshot from a run that is actively processing its 2nd epic (of 4 total) while on story 3 of 6 at step index 1 (the `implement` step), **When** `snapshotToPosition()` is called with that snapshot and the workflow config, **Then** the returned `WorkflowPosition` has `epicIndex: 2`, `totalEpics: 4`, `storyIndex: 3`, `totalStories: 6`, and `activeStepIndex: 1`, **And** passing the result to `visualize()` produces output containing `Epic` and `[3/6]`.
   <!-- verification: npx vitest run -- workflow-visualizer — test constructs snapshot fixture, calls snapshotToPosition, asserts fields, pipes to visualize() and checks output -->

3. **Given** a persisted snapshot from a run where the story machine is inside a gate named `quality` at iteration 2 of 5 with 1 check passed and 1 check failed, **When** `snapshotToPosition()` is called, **Then** the returned position has `gate` set with `name: 'quality'`, `iteration: 2`, `maxRetries: 5`, `passed: 1`, `failed: 1`, **And** passing the result to `visualize()` produces output containing `⟲quality(2/5 1✓1✗)`.
   <!-- verification: npx vitest run -- workflow-visualizer — test constructs gate snapshot fixture, calls snapshotToPosition, asserts gate fields, pipes to visualize() -->

4. **Given** a persisted snapshot where the run machine is in state `allDone` (all epics completed), **When** `snapshotToPosition()` is called, **Then** the returned position has all steps marked with status `done` and no step is `active`, **And** passing the result to `visualize()` produces output where every step has the `✓` marker.
   <!-- verification: npx vitest run -- workflow-visualizer — test constructs allDone snapshot, asserts all steps done, visualize output has no "…" active marker -->

5. **Given** a persisted snapshot where the run machine is in state `halted` due to an error, **When** `snapshotToPosition()` is called, **Then** the returned position has the step that was active at halt time marked with status `failed`, **And** passing the result to `visualize()` produces output containing `✗`.
   <!-- verification: npx vitest run -- workflow-visualizer — test constructs halted snapshot, asserts failed step, visualize output contains "✗" -->

6. **Given** a persisted snapshot where the run machine is in state `interrupted`, **When** `snapshotToPosition()` is called, **Then** the returned position has the step that was active at interrupt time marked with a non-`done` status (either `active` or `failed`), **And** the function does not throw an error.
   <!-- verification: npx vitest run -- workflow-visualizer — test constructs interrupted snapshot, asserts no exception, asserts position has non-done active step -->

7. **Given** a persisted snapshot from a run where all stories in an epic are done and the engine is processing epic-level step `deploy`, **When** `snapshotToPosition()` is called, **Then** the returned position has `storiesDone: true`, **And** passing the result to `visualize()` produces output containing `stories✓`.
   <!-- verification: npx vitest run -- workflow-visualizer — test constructs epic-level-step snapshot, asserts storiesDone true, visualize output contains "stories✓" -->

8. **Given** a persisted snapshot from a single-level workflow (no `for_each` nesting — flat step list), **When** `snapshotToPosition()` is called, **Then** the returned position has no `epicId`, no `storyIndex`, and no `totalStories`, **And** passing the result to `visualize()` produces output with no `Epic` prefix.
   <!-- verification: npx vitest run -- workflow-visualizer — test constructs flat workflow snapshot, asserts no epic fields, visualize output has no "Epic" prefix -->

9. **Given** a persisted snapshot with the `steps` derived from the workflow config (`storyFlow` + `epicFlow`), **When** `snapshotToPosition()` is called, **Then** the `steps` array in the returned position matches the task/gate names from the workflow config in order, with correct `isGate` flags on gate steps.
   <!-- verification: npx vitest run -- workflow-visualizer — test constructs snapshot, asserts steps array names match workflow config storyFlow order -->

10. **Given** the full test suite, **When** `npx vitest run` is executed, **Then** all existing tests still pass (zero regressions) AND new tests for `snapshotToPosition()` pass — covering: active processing, gate parsing, terminal states (allDone/halted/interrupted), epic-level steps, flat workflows, step enumeration.
    <!-- verification: npx vitest run exits 0, new test cases exist and pass -->

11. **Given** the `workflow-visualizer.ts` file after this story, **When** its line count is checked, **Then** it is ≤ 300 lines (per NFR18).
    <!-- verification: wc -l src/lib/workflow-visualizer.ts ≤ 300 -->

12. **Given** the `snapshotToPosition()` function, **When** called with any input (including malformed or null snapshots), **Then** it performs no I/O and does not throw — it returns a safe default position with an empty steps array if the snapshot is unparseable.
    <!-- verification: npx vitest run -- workflow-visualizer — test confirms no I/O, test confirms no throw on null/undefined/garbage input -->

## Tasks / Subtasks

### T1: Analyze snapshot structure and define parser strategy (AC: #2, #3, #9)

- Examine `getPersistedSnapshot()` output structure from the existing machines:
  - `runMachine` snapshot: `{ status, value, context: RunContext }` — `value` is `"processingEpic"` | `"checkNextEpic"` | `"allDone"` | `"halted"` | `"interrupted"`
  - The child epic/story/gate state is NOT in the run snapshot value — it's inside the `fromPromise` actor, which is opaque in the persisted snapshot
  - Position must be derived from **context fields**: `currentEpicIndex`, `epicEntries.length` (run level); `currentStoryIndex`, `epicItems.length`, `currentStepIndex` (epic level); gate context fields
- Determine what's available in the persisted snapshot vs what needs the workflow config:
  - Snapshot provides: current indices, terminal state, gate verdicts
  - Workflow config provides: step names, step order, gate definitions, flow structure

### T2: Implement `snapshotToPosition()` core parser (AC: #2, #4, #5, #6, #8)

- Add to `workflow-visualizer.ts`:
  ```typescript
  export function snapshotToPosition(snapshot: unknown, workflow: ResolvedWorkflow): WorkflowPosition
  ```
- Extract run-level state from `snapshot.value` and `snapshot.context`:
  - `"allDone"` / `"halted"` / `"interrupted"` → terminal state handling
  - `"processingEpic"` → active processing, read `currentEpicIndex` + `epicEntries`
- Extract epic-level info from context:
  - `currentStoryIndex`, `epicItems.length` → story progress
  - `currentStepIndex` → active step within flow
  - Detect `storiesDone` from whether `currentStoryIndex >= epicItems.length` or the engine is on epic-level steps
- Import `ResolvedWorkflow` from `workflow-types.ts` (single import, no new types needed there)

### T3: Implement step enumeration from workflow config (AC: #9)

- Build the `steps: StepStatus[]` array from `workflow.storyFlow` (for story-level) and `workflow.epicFlow` (for epic-level):
  - String steps → `{ name, status, isGate: false }`
  - GateConfig steps → `{ name: gate.gate, status, isGate: true }`
- Derive status for each step:
  - Steps before `activeStepIndex` → `'done'`
  - Step at `activeStepIndex` → `'active'`
  - Steps after `activeStepIndex` → `'pending'`
  - If terminal state `halted` → mark active step as `'failed'`

### T4: Implement gate info extraction (AC: #3)

- When the active step is a gate and the snapshot context indicates gate processing:
  - Extract `gate.gate` (name), iteration count, max retries from `GateConfig`
  - Parse verdicts from context to compute `passed` and `failed` counts
  - Set `gate` field on returned `WorkflowPosition`

### T5: Implement defensive parsing for edge cases (AC: #6, #8, #12)

- Wrap all snapshot access in safe property checks — snapshot is typed `unknown`
- Handle null/undefined/malformed snapshots: return safe default `WorkflowPosition` with empty steps
- Handle flat (non-nested) workflows: detect absence of `for_each` nesting, return position without epic/story fields
- Handle interrupted state: treat as active at the interruption point

### T6: Write comprehensive tests (AC: #1–#12)

- Add test cases to `src/lib/__tests__/workflow-visualizer.test.ts` (or create a new test file if the existing one is too large):
  - **Fixture construction**: Build realistic snapshot fixtures matching the structure from `getPersistedSnapshot()` for each machine state
  - Test cases:
    1. Active processing: epic 2/4, story 3/6, step 1 → correct indices
    2. Gate parsing: quality gate at iteration 2/5 with mixed verdicts → correct GateInfo
    3. Terminal allDone: all steps marked done
    4. Terminal halted: active step marked failed
    5. Terminal interrupted: no throw, active step not done
    6. Epic-level steps: storiesDone true, deploy step active
    7. Flat workflow: no epic/story fields, no prefix
    8. Step enumeration: names match workflow config order
    9. Defensive: null snapshot → empty position, no throw
    10. Defensive: malformed snapshot → empty position, no throw
    11. Integration: snapshotToPosition → visualize pipeline produces valid output
    12. Purity: no I/O calls (mocked fs/net unused)

## Dev Notes

- **Snapshot structure caveat**: The current machines use `fromPromise` actors for child orchestration. This means the run machine's persisted snapshot does NOT contain nested child machine states — the child state lives inside the running `fromPromise` actor and is opaque once serialized. The context fields (`currentEpicIndex`, `currentStoryIndex`, `currentStepIndex`) are the primary data source for position derivation, NOT the `value` field's state path.
- **Line budget**: `workflow-visualizer.ts` is at 229/300 lines. `snapshotToPosition()` has a budget of ~70 lines including the function body and any helper functions. Keep it tight — aggressive use of early returns and inline logic.
- **Import discipline**: Only import `ResolvedWorkflow` from `workflow-types.ts`. Do NOT import context types (`RunContext`, `EpicContext`, etc.) — access snapshot context fields dynamically via safe property access on the `unknown` typed snapshot.
- **No persistence file changes**: `workflow-persistence.ts` is at 297/300 lines. This story does not modify it. The snapshot format is read-only input.
- **Gate verdict parsing**: The `verdicts` field in `GateContext` is `Record<string, string>`. Each value is a raw output string that would need `parseVerdict()` for structured scoring. For the visualizer, it's simpler to count entries and use the `evaluator_scores` from `workflowState` for pass/fail counts.
- **Testing approach**: Construct snapshot fixtures as plain objects matching the observed `getPersistedSnapshot()` output format (see `.codeharness/workflow-snapshot.json` for a real example). The fixtures should be minimal — only include the fields that `snapshotToPosition()` actually reads.
- **Epic 26 retrospective action A2**: The persistence module split has NOT happened yet. If `snapshotToPosition()` needs any persistence helpers, do NOT add them to `workflow-persistence.ts`. Keep the parser self-contained in the visualizer file.

</story-spec>
