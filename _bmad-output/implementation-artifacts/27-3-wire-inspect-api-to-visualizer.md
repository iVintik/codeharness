<story-spec>

# Story 27-3: Wire `inspect` API to visualizer in run.ts

Status: ready-for-dev

## Story

As a workflow operator,
I want the XState inspect callback on the run machine actor to drive visualization updates automatically,
So that state transitions trigger TUI refresh using the pure visualizer — no hand-tracked task states needed for the workflow row.

## Context

**Epic 27: TUI Visualization & Integration** — this is story 3 of 5.

**What exists and is usable (stories 27-1 and 27-2 complete):**

- `src/lib/workflow-visualizer.ts` (297 lines): Two exported functions:
  - `visualize(pos: WorkflowPosition, vizConfig?: VizConfig) → string` — renders a one-line ANSI-colored workflow status
  - `snapshotToPosition(snapshot: unknown, workflow: ResolvedWorkflow) → WorkflowPosition` — derives position from XState persisted snapshot + workflow config
  - Types: `WorkflowPosition`, `StepStatus`, `GateInfo`, `VizConfig`, `stripAnsi()`
- `src/lib/workflow-runner.ts` (214 lines): `runWorkflowActor()` composition root — creates `runMachine` actor via `createActor()`, subscribes to state transitions, saves snapshots on each transition
- `src/commands/run.ts`: Currently maintains ~70 lines of hand-tracked state (`taskStates`, `taskMeta`, `inEpicPhase`, `currentStoryKey`, `currentTaskName`, `displayEpicId`, etc.) to drive `renderer.updateWorkflowState()` calls. This hand-tracking is what story 27-5 ultimately eliminates, but story 27-3 adds the new inspect-driven path alongside it.
- `src/lib/ink-renderer.tsx`: `RendererHandle` with `updateWorkflowState()` (old API using `FlowStep[]` + `taskStates` record) — story 27-3 needs either a new method or adapts the existing one.
- `src/lib/workflow-types.ts`: `EngineConfig` with `onEvent` callback, `EngineEvent` type, `ResolvedWorkflow`.

**Current actor creation (workflow-runner.ts lines 171-185):**
```typescript
const actor = createActor(runMachine, { input: runInput });
actor.subscribe({
  next: () => {
    try { saveSnapshot(actor.getPersistedSnapshot(), configHash, projectDir); }
    catch { /* best-effort */ }
  },
  complete: () => resolve(actor.getSnapshot().output!),
});
actor.start();
```

**What this story builds:**

1. An `inspect` callback on the `createActor()` options that fires on `@xstate.snapshot` events
2. Inside the callback: calls `snapshotToPosition()` + `visualize()` and passes the result to a new renderer method (or new `EngineEvent` type)
3. Debounce: only calls the visualizer when the snapshot's `value` (state name) changes — internal context-only updates (like cost accumulation) are suppressed

**What this story does NOT build (deferred to later stories):**
- Sideband streaming to TUI renderer — that's story 27-4
- Removing hand-tracked state from run.ts — that's story 27-5 (the old `updateWorkflowState` calls and hand-tracked variables remain for now; both old and new paths coexist)

**Key architectural decisions (from architecture-xstate-engine.md):**
- AD5: `inspect` API on root actor drives visualization. Snapshot changes → visualizer → renderer.
- AD5: Debounce on state transitions only — internal progress (cost, contract updates) does NOT trigger re-render.
- AD5: `run.ts` role is pre-flight, compile, create actor, wire inspect + sideband, wait.
- Boundary: `workflow-visualizer.ts` never imports machines or runner. `run.ts` imports runner, visualizer, and types.

## Acceptance Criteria

1. **Given** the `codeharness` CLI is installed, **When** the user runs `npm run build`, **Then** the build completes successfully with exit code 0 and no new TypeScript errors are introduced.
   <!-- verification: npm run build exits 0 -->

2. **Given** a workflow run is started with `codeharness run`, **When** the XState run machine transitions from one state to another (e.g., idle → processingEpic), **Then** the TUI displays a single-line workflow visualization string containing step names from the workflow config, with the active step visually distinguished from completed and pending steps.
   <!-- verification: codeharness run (with a test workflow), observe terminal output shows a line like "Epic 1 [1/N] create…" with active step highlighted; or: run tests that mock renderer and assert updateWorkflowRow called with a non-empty string on state transition -->

3. **Given** a workflow run is executing and the machine fires an `@xstate.snapshot` event where only context values changed (e.g., cost accumulation, contract update) but the state `value` did NOT change, **When** the inspect callback fires, **Then** the visualizer is NOT called and the TUI workflow row is NOT updated.
   <!-- verification: npx vitest run -- run or workflow-runner — test creates actor with inspect callback, triggers multiple context-only updates, asserts visualize() call count is 0 for those updates -->

4. **Given** a workflow run is executing and the machine transitions to a new state (e.g., from `processingEpic` to `checkNextEpic`), **When** the inspect callback fires, **Then** the visualizer IS called and the TUI workflow row IS updated with a new visualization string reflecting the new state.
   <!-- verification: npx vitest run — test creates actor with inspect callback, triggers state transition, asserts visualize() was called and renderer received the visualization string -->

5. **Given** the inspect callback is wired to the run machine actor, **When** `createActor()` is called in `runWorkflowActor()`, **Then** the `inspect` option is provided in the actor options and accepts the `@xstate.snapshot` event type.
   <!-- verification: npx vitest run — test verifies createActor is called with an inspect option; or: read workflow-runner.ts and confirm inspect is present in createActor options -->

6. **Given** the TUI renderer receives a workflow visualization string from the inspect callback, **When** the string is displayed, **Then** it is a single line ≤ 120 characters wide (per NFR8) and contains recognizable step names from the workflow configuration.
   <!-- verification: npx vitest run -- workflow-visualizer — existing tests already verify width constraint; new integration test confirms the string passed to renderer meets NFR8 -->

7. **Given** the inspect callback fires and `snapshotToPosition()` receives a snapshot it cannot parse (e.g., early in actor startup before context is populated), **When** the callback runs, **Then** no error is thrown and the TUI continues to function — the visualization row may show an empty or minimal fallback string but does not crash.
   <!-- verification: npx vitest run — test triggers inspect callback with an incomplete/empty snapshot, asserts no exception and renderer.updateWorkflowRow called with a string (possibly empty) -->

8. **Given** the full test suite, **When** `npx vitest run` is executed, **Then** all existing tests still pass (zero regressions) AND new tests for the inspect wiring pass.
   <!-- verification: npx vitest run exits 0, new test file or test cases exist and pass -->

9. **Given** the `workflow-runner.ts` file after this story, **When** its line count is checked, **Then** it is ≤ 300 lines (per NFR18).
   <!-- verification: wc -l src/lib/workflow-runner.ts ≤ 300 -->

10. **Given** a new `EngineEvent` type `workflow-viz` (or equivalent) is emitted from the inspect callback, **When** the `onEvent` handler in `run.ts` receives it, **Then** it can extract the visualization string and pass it to the renderer — the event includes at minimum the rendered string and the raw `WorkflowPosition`.
    <!-- verification: npx vitest run — test constructs a workflow-viz event and asserts it has the expected shape with vizString and position fields -->

## Tasks / Subtasks

### T1: Add `inspect` callback to `createActor()` in workflow-runner.ts (AC: #5, #9)

- Modify `runWorkflowActor()` in `workflow-runner.ts`:
  - Add `inspect` option to `createActor()` call
  - The callback receives XState inspection events; filter for `type === '@xstate.snapshot'`
  - Import `snapshotToPosition` and `visualize` from `workflow-visualizer.ts`
  - Import `ResolvedWorkflow` (already available via `config.workflow`)
- Keep the existing `actor.subscribe({ next: ... })` for snapshot persistence — the inspect callback is a separate channel

### T2: Implement debounce on state value changes (AC: #3, #4)

- Track `lastStateValue` (initially `null`) as a local variable in `runWorkflowActor()`
- When inspect fires `@xstate.snapshot`:
  - Extract the snapshot's `value` field (state name string)
  - If `value === lastStateValue`, skip visualization (debounce)
  - If `value !== lastStateValue`, update `lastStateValue`, call `snapshotToPosition()` + `visualize()`, emit event
- This ensures context-only changes (cost, contract) don't trigger re-renders

### T3: Emit `workflow-viz` engine event (AC: #2, #10)

- Add `'workflow-viz'` to the `EngineEvent.type` union in `workflow-types.ts`
- Add optional fields to `EngineEvent`: `vizString?: string`, `position?: WorkflowPosition` (import type from visualizer)
- In the inspect callback, after computing the visualization:
  ```typescript
  config.onEvent?.({ type: 'workflow-viz', taskName: '', storyKey: '', vizString, position });
  ```
- This allows `run.ts` to receive the visualization string via the existing event bridge

### T4: Handle `workflow-viz` event in run.ts `onEvent` handler (AC: #2, #6)

- In the `onEvent` handler in `run.ts`, add a case for `event.type === 'workflow-viz'`:
  - Call a new renderer method `renderer.updateWorkflowRow(event.vizString)` or adapt the existing `updateWorkflowState()` call
  - If a new method is needed on `RendererHandle`, add `updateWorkflowRow(vizLine: string): void` to the interface and implement it (both active and noop handles)
- The old hand-tracked `updateWorkflowState()` calls remain for now — both paths coexist until story 27-5 removes the old one

### T5: Add `updateWorkflowRow` to RendererHandle (AC: #2, #6, #7)

- Add to `RendererHandle` interface in `ink-renderer.tsx`:
  ```typescript
  updateWorkflowRow(vizLine: string): void;
  ```
- Implement in the active renderer: update a state field that the Ink component renders as a dedicated row
- Implement in the noop handle: empty function
- This is the new API that replaces the old `updateWorkflowState()` (but old method stays until 27-5)

### T6: Defensive error handling in inspect callback (AC: #7)

- Wrap the entire inspect callback body in try/catch
- On any error: silently ignore (do not crash the workflow runner)
- `snapshotToPosition()` already handles malformed input, but the callback itself must also be safe against unexpected inspect event shapes

### T7: Write tests (AC: #1–#10)

- Add tests to `src/lib/__tests__/workflow-runner.test.ts` or create a new test file:
  1. **Inspect callback is wired**: mock `createActor` or verify the options passed include `inspect`
  2. **Debounce — same state value**: fire multiple inspect events with same `value`, assert `visualize` called only once (first time)
  3. **Debounce — different state value**: fire inspect events with different `value`, assert `visualize` called each time
  4. **Visualization string emitted**: verify `onEvent` receives a `workflow-viz` event with a non-empty `vizString`
  5. **Error resilience**: mock `snapshotToPosition` to throw, verify inspect callback does not propagate the error
  6. **Renderer receives update**: mock `RendererHandle`, trigger state transition, verify `updateWorkflowRow` called with a string
  7. **NFR8 width**: verify the string passed to renderer has stripped length ≤ 120

## Dev Notes

- **XState inspect API**: The `inspect` option on `createActor()` accepts a function `(inspectionEvent) => void`. The event has `type: '@xstate.snapshot' | '@xstate.event' | '@xstate.actor'`. For `@xstate.snapshot`, the event has `snapshot` (the machine snapshot) and `actorRef` properties. See: https://stately.ai/docs/inspection
- **Debounce strategy**: The architecture says "debounce on state transitions only." This means checking `snapshot.value` (the state name string, e.g., `"processingEpic"`, `"checkNextEpic"`, `"allDone"`). Context-only changes (like `accumulatedCostUsd` incrementing) don't change `value`, so they're naturally debounced by this check.
- **Two visualization paths coexist**: After this story, `run.ts` will have both the old hand-tracked `updateWorkflowState()` calls (driven by `onEvent` dispatch-start/end) AND the new `updateWorkflowRow()` calls (driven by inspect → workflow-viz). Story 27-5 removes the old path. For now, both are active — the renderer should display whichever was updated most recently, or dedicate a separate row for the new visualizer output.
- **Line budget**: `workflow-runner.ts` is at 214/300 lines. Adding the inspect callback + debounce + event emission should cost ~15-20 lines. Keep it tight.
- **Import discipline**: `workflow-runner.ts` imports `snapshotToPosition` and `visualize` from `workflow-visualizer.ts`. It already imports `ResolvedWorkflow` indirectly via `EngineConfig.workflow`. Add a direct import of `WorkflowPosition` type only if needed for the event payload.
- **No persistence file changes**: Snapshot persistence continues via `actor.subscribe()` — the inspect callback is orthogonal.
- **Renderer API evolution**: `updateWorkflowRow(vizLine: string)` is intentionally simpler than the old `updateWorkflowState(flow, currentTask, taskStates, taskMeta)`. It receives a pre-rendered string, so the renderer just displays it — no rendering logic in the TUI layer. This aligns with AD5's "pure function" design.
- **EngineEvent extension**: Adding `vizString` and `position` as optional fields on `EngineEvent` is the lightest-touch approach. An alternative is a separate event type, but the existing pattern uses a single union discriminated by `type`.

</story-spec>
