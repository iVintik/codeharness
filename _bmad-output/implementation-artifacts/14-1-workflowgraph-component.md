# Story 14.1: WorkflowGraph Component

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to see a schematic workflow graph in the TUI,
so that I can see all tasks, their order, and loop blocks at a glance while a workflow is running.

## Acceptance Criteria

1. **Given** a running workflow with sequential flow steps `["create-story", "implement", "verify"]`
   **When** the TUI renders
   **Then** the `WorkflowGraph` component displays each task as a node with its name, connected by `→` arrows in a single-line flow
   <!-- verification: test-provable -->

2. **Given** a workflow with a loop block `{ loop: ["implement", "verify"] }`
   **When** the TUI renders
   **Then** the loop block is rendered as `loop(N)[ implement → verify ]` where N is the current iteration count (starting at 0 before any iteration, incrementing each iteration)
   <!-- verification: test-provable -->

3. **Given** the `WorkflowGraph` component
   **When** it receives `flow`, `currentTask`, and `taskStates` as props
   **Then** each task node renders with a status indicator: pending tasks show dim text, the active task shows cyan text with a `◆` marker, completed tasks show green `✓`, and failed tasks show red `✗`
   <!-- verification: test-provable -->

4. **Given** a workflow is running
   **When** the Ink app renders
   **Then** the `WorkflowGraph` component is positioned between the `Header` and `StoryBreakdown` components in the layout
   <!-- verification: test-provable -->

5. **Given** the `WorkflowGraph` component receives props
   **When** `flow` is an empty array or `taskStates` is empty
   **Then** the component returns `null` (renders nothing)
   <!-- verification: test-provable -->

6. **Given** the `RendererState` interface in `ink-components.tsx`
   **When** inspected
   **Then** it includes a `workflowFlow` field of type `FlowStep[]` (from `workflow-parser.ts`), a `currentTaskName` field of type `string | null`, and a `taskStates` field of type `Record<string, TaskNodeState>` where `TaskNodeState` is `'pending' | 'active' | 'done' | 'failed'`
   <!-- verification: test-provable -->

7. **Given** the `RendererHandle` interface in `ink-renderer.tsx`
   **When** inspected
   **Then** it includes an `updateWorkflowState(flow, currentTask, taskStates)` method that updates the workflow graph props and triggers a rerender
   <!-- verification: test-provable -->

8. **Given** `npm run build` is executed after all changes
   **When** the build completes
   **Then** it succeeds with zero TypeScript errors
   **And** `npm run test:unit` passes with no regressions in existing test suites
   <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Define `TaskNodeState` type and extend `RendererState` (AC: #6)
  - [x] In `src/lib/ink-components.tsx`, add `export type TaskNodeState = 'pending' | 'active' | 'done' | 'failed';`
  - [x] Import `FlowStep` from `./workflow-parser.js` in `ink-components.tsx`
  - [x] Add `workflowFlow: FlowStep[]`, `currentTaskName: string | null`, and `taskStates: Record<string, TaskNodeState>` to `RendererState`

- [x] Task 2: Create `WorkflowGraph` Ink component (AC: #1, #2, #3, #5)
  - [x] Create `src/lib/ink-workflow.tsx` with the `WorkflowGraph` component
  - [x] Props: `{ flow: FlowStep[]; currentTask: string | null; taskStates: Record<string, TaskNodeState>; }`
  - [x] Return `null` if `flow.length === 0`
  - [x] For each `FlowStep` in `flow`:
    - If string: render as a task node with status indicator
    - If `LoopBlock`: render as `loop(N)[ task1 → task2 ]` with nested task nodes
  - [x] Status indicators via Ink `<Text>` color props:
    - `pending` → `dimColor` attribute
    - `active` → `color="cyan"` with `◆` prefix
    - `done` → `color="green"` with `✓` prefix
    - `failed` → `color="red"` with `✗` prefix
  - [x] Connect nodes with ` → ` separator
  - [x] Wrap the entire graph in a `<Box flexDirection="column">` with separator lines

- [x] Task 3: Integrate `WorkflowGraph` into `App` layout (AC: #4)
  - [x] In `src/lib/ink-app.tsx`, import `WorkflowGraph` from `./ink-workflow.js`
  - [x] Import `LoopBlock` type from `./workflow-parser.js` (for type checking)
  - [x] Insert `<WorkflowGraph flow={state.workflowFlow} currentTask={state.currentTaskName} taskStates={state.taskStates} />` between `<Header>` and `<StoryBreakdown>`

- [x] Task 4: Add `updateWorkflowState` to `RendererHandle` (AC: #7)
  - [x] In `src/lib/ink-renderer.tsx`, import `TaskNodeState` from `./ink-components.js` and `FlowStep` from `./workflow-parser.js`
  - [x] Add `updateWorkflowState(flow: FlowStep[], currentTask: string | null, taskStates: Record<string, TaskNodeState>): void` to `RendererHandle` interface
  - [x] Implement: update `state.workflowFlow`, `state.currentTaskName`, `state.taskStates`, then call `rerender()`
  - [x] Add to `noopHandle` as empty function
  - [x] Initialize `workflowFlow: []`, `currentTaskName: null`, `taskStates: {}` in the initial `RendererState`

- [x] Task 5: Write unit tests (AC: #1-#8)
  - [x] Create `src/lib/__tests__/ink-workflow.test.tsx`:
    - Test: renders sequential flow as `task1 → task2 → task3`
    - Test: renders loop block as `loop(0)[ task1 → task2 ]`
    - Test: pending tasks render with dim text
    - Test: active task renders with cyan and `◆`
    - Test: completed task renders with green and `✓`
    - Test: failed task renders with red and `✗`
    - Test: returns null for empty flow
    - Test: returns null for empty taskStates
  - [x] Use `ink-testing-library` or Ink's `render()` test helper with snapshot or string matching

- [x] Task 6: Verify build and tests (AC: #8)
  - [x] Run `npm run build` — zero TypeScript errors
  - [x] Run `npm run test:unit` — all tests pass, no regressions

## Dev Notes

### Architecture Compliance

This story implements Epic 5, Story 5.1 (mapped to sprint Epic 14, Story 14-1) "WorkflowGraph Component" from `epics-multi-framework.md`. It covers:
- **FR24:** System can render a schematic workflow graph in the Ink TUI showing all tasks as nodes with directional flow
- **FR25:** System can highlight the currently executing task node in the workflow graph
- **FR28:** System can render loop blocks in the workflow graph with visual grouping and iteration counter
- **FR30:** System can show task completion status (checkmark, spinner, pending) per node in the workflow graph

Key architecture decisions honored:
- **Decision 5 (TUI Workflow Graph Component):** New `WorkflowGraph` Ink component inserted between Header and StoryBreakdown. Renders a single-line flow with status indicators.
- **TUI Boundary:** TUI consumes workflow state updates. TUI does NOT dispatch drivers or write contracts. `WorkflowGraph` component receives flow structure and task states as props.

### Rendering Format (from Architecture)

```
━━━ Workflow: story 3-1 ━━━━━━━━━━━━━━━━━━━━━━━━━
  implement ✓  →  verify ◆  →  loop(1)[ retry → verify ]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Note: Driver labels and cost/time per node are NOT part of this story. Those are covered in story 14-2 (Task Status & Driver Labels). This story focuses on the structural graph rendering and status indicators only.

### Implementation Strategy

1. **Types first:** Extend `RendererState` with workflow graph fields. Add `TaskNodeState` type.
2. **Component:** Create `ink-workflow.tsx` as a pure presentational component. It receives `flow`, `currentTask`, and `taskStates` as props and renders the graph. No side effects, no state management.
3. **Layout integration:** Insert the component into `ink-app.tsx` between Header and StoryBreakdown.
4. **Renderer handle:** Add `updateWorkflowState()` to the renderer handle so the workflow engine can push state updates.
5. **Tests:** Use Ink's test renderer to verify output strings and color attributes.

### What Already Exists

- `FlowStep` and `LoopBlock` types in `src/lib/workflow-parser.ts` (lines 17-40) — reuse these directly
- `RendererState` interface in `src/lib/ink-components.tsx` (lines 53-62) — extend with workflow fields
- `RendererHandle` interface in `src/lib/ink-renderer.tsx` (lines 26-39) — add `updateWorkflowState()`
- `App` component in `src/lib/ink-app.tsx` — insert WorkflowGraph into layout
- `Header`, `Separator`, `StoryBreakdown` components in `src/lib/ink-components.tsx` — existing layout components
- Status symbols: `✓` (done), `✗` (failed), `◆` (in-progress), `○` (pending) — already used in the codebase (see `ink-components.tsx` and UX spec)
- `noopHandle` in `ink-renderer.tsx` (lines 43-49) — add `updateWorkflowState` no-op

### What NOT to Do

- Do NOT add driver labels, cost, or elapsed time per node — that is story 14-2.
- Do NOT connect this to the workflow engine yet — this story builds the component and its API. The engine integration for calling `updateWorkflowState()` will come when the workflow engine is wired to the renderer.
- Do NOT use a spinner for active tasks. The architecture mentions "cyan + spinner" but spinners add complexity and dependency on `ink-spinner`. Use `◆` as the active indicator (consistent with existing `StoryBreakdown` component which uses `◆` for in-progress). Story 14-2 can upgrade to a spinner if needed.
- Do NOT use `async` or state hooks in the component — it is purely presentational, driven by props from the renderer handle.
- Do NOT add `ink-testing-library` as a new dependency if it's not already installed. Use Ink's built-in `render()` from `ink` for tests, or use `react-test-renderer` if already available.

### Previous Story Intelligence

From story 13-3 (Cross-Framework Workflow Execution):
- The workflow engine now writes output contracts after each task and passes them to the next task.
- `dispatchTaskWithResult()` returns `{ updatedState, output, contract }`.
- 4526+ tests passing across 168+ test files.
- The `workflow-engine.ts` already imports `FlowStep` and `LoopBlock` from `workflow-parser.js`.
- The engine iterates flow steps in `executeWorkflow()` — sequential steps and loop blocks are handled separately.

### Git Intelligence

Recent commits (94f08f9..c1dbd42) all follow the pattern of Epic 13 (output contracts). The last 3 stories (13-1, 13-2, 13-3) touched:
- `src/lib/workflow-engine.ts` — heavily modified for contract integration
- `src/lib/__tests__/workflow-engine.test.ts` — extensive test additions
- `src/lib/agents/output-contract.ts` — new module
- `src/lib/agents/types.ts` — `OutputContract` interface added

This story does NOT touch `workflow-engine.ts` or `output-contract.ts`. It is isolated to the TUI layer.

### Testing Patterns

The existing Ink component tests are in `src/lib/__tests__/ink-renderer.test.tsx`. Follow the same pattern:
- Import `render` from `ink-testing-library` (if available) or use Ink's `render()` + `lastFrame()`
- Create a minimal `RendererState` fixture and render `<WorkflowGraph>` directly
- Assert on output text content (task names, arrows, status symbols)
- Assert on color attributes (green for done, red for failed, cyan for active, dim for pending)

Check the test infrastructure before writing tests:

```bash
# Check if ink-testing-library is available
grep -r "ink-testing-library" package.json
# Check existing Ink test patterns
head -40 src/lib/__tests__/ink-renderer.test.tsx
```

### Project Structure Notes

Files to CREATE:
- `src/lib/ink-workflow.tsx` — WorkflowGraph component (architecture specifies this exact path)

Files to MODIFY:
- `src/lib/ink-components.tsx` — Add `TaskNodeState` type, extend `RendererState` with workflow fields
- `src/lib/ink-app.tsx` — Import and insert `WorkflowGraph` into layout between Header and StoryBreakdown
- `src/lib/ink-renderer.tsx` — Add `updateWorkflowState()` to `RendererHandle`, implement in controller, add to `noopHandle`, initialize state fields

Files NOT to modify:
- `src/lib/workflow-engine.ts` — Engine integration is NOT part of this story
- `src/lib/workflow-parser.ts` — Types already exist, no changes needed
- `src/lib/agents/*` — Driver/contract layer not touched
- `src/lib/ink-activity-components.tsx` — Activity display changes are story 14-3

### References

- [Source: _bmad-output/planning-artifacts/epics-multi-framework.md#Story 5.1: WorkflowGraph Component]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md — Decision 5: TUI Workflow Graph Component]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md — TUI Boundary]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md — Project Structure (ink-workflow.tsx)]
- [Source: _bmad-output/planning-artifacts/epics-multi-framework.md — FR24, FR25, FR28, FR30]
- [Source: src/lib/ink-components.tsx — RendererState interface, existing layout components]
- [Source: src/lib/ink-renderer.tsx — RendererHandle interface, noopHandle, controller pattern]
- [Source: src/lib/ink-app.tsx — App component layout]
- [Source: src/lib/workflow-parser.ts — FlowStep, LoopBlock, ResolvedTask types]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/14-1-workflowgraph-component-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/14-1-workflowgraph-component.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

### File List

- `src/lib/ink-workflow.tsx` — NEW: WorkflowGraph component
- `src/lib/__tests__/ink-workflow.test.tsx` — NEW: 9 unit tests for WorkflowGraph
- `src/lib/ink-components.tsx` — MODIFIED: Added `TaskNodeState` type, `FlowStep` import, extended `RendererState`
- `src/lib/ink-app.tsx` — MODIFIED: Imported and inserted `WorkflowGraph` between Header and StoryBreakdown
- `src/lib/ink-renderer.tsx` — MODIFIED: Added `updateWorkflowState()` to `RendererHandle`, implementation, noopHandle, initial state
- `src/lib/__tests__/ink-renderer.test.tsx` — MODIFIED: Updated `makeState` helper with new fields
