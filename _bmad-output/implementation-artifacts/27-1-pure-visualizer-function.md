<story-spec>

# Story 27-1: Pure visualizer function — `visualize(snapshot, vizConfig) → string`

Status: review

## Story

As a workflow operator,
I want a one-row compressed visualization of the current workflow state rendered from the XState machine snapshot,
So that I can see at a glance which epic, story, and task step the engine is on, how many steps are done, and what's active — without the TUI maintaining hand-tracked state.

## Context

**Epic 27: TUI Visualization & Integration** — this is story 1 of 5. Epic 26 (Persistence & Resume) is complete: dual-layer persistence (XState snapshot + semantic checkpoint log) with config hash validation, atomic writes, and clear-on-completion all work.

**What exists and is usable:**

- `workflow-run-machine.ts`: `runMachine` with `RunContext` — iterates epics via `for_each`, INTERRUPT handling, 4 final states (`allDone`, `halted`, `interrupted`). Context holds `epicEntries`, `currentEpicIndex`, `storiesProcessed`, `tasksCompleted`.
- `workflow-epic-machine.ts`: `epicMachine` with `EpicContext` — iterates stories via `for_each`, then runs epic-level steps. Context holds `epicItems`, `currentStoryIndex`, `currentStepIndex`.
- `workflow-story-machine.ts`: `storyMachine` with `StoryContext` — processes sequential flow steps (tasks + gates). Context holds `item`, `tasksCompleted`, `halted`, `storyFlowTasks`.
- `workflow-gate-machine.ts`: `gateMachine` with `GateContext` — checking → evaluate → fixing cycle. Context holds `gate`, `verdicts`, iteration count.
- `workflow-types.ts` (292 lines): All shared types including `RunContext`, `EpicContext`, `StoryContext`, `GateContext`, `EngineConfig`, `FlowStep`, `GateConfig`, `ForEachConfig`.
- `workflow-persistence.ts` (297 lines): XState snapshot save/load. `getPersistedSnapshot()` output is available as the `snapshot` field inside `XStateWorkflowSnapshot`.
- `workflow-runner.ts` (214 lines): `runWorkflowActor()` composition root.
- `src/commands/run.ts`: Currently uses hand-tracked `taskStates`, `taskMeta`, `displayFlow` objects passed to `renderer.updateWorkflowState()`. This hand-tracking is what Epic 27 ultimately eliminates (story 27-5), but story 27-1 only creates the pure function — it does NOT wire it into run.ts yet.

**What this story builds:**

A new file `src/lib/workflow-visualizer.ts` containing a pure function:
```typescript
visualize(snapshot: unknown, vizConfig: VizConfig): string
```
That takes an XState persisted snapshot (the `.snapshot` field from `XStateWorkflowSnapshot`) and returns a single-line string representing the workflow state, following the visualization grammar from architecture-xstate-engine.md AD5.

**What this story does NOT build (deferred to later stories):**
- Deriving position from XState snapshot state path — that's story 27-2
- Wiring inspect API to call visualize() — that's story 27-3
- Sideband streaming to TUI — that's story 27-4
- Removing hand-tracked state from run.ts — that's story 27-5

**For story 27-1, the visualizer accepts a pre-parsed `WorkflowPosition` struct** (not a raw snapshot). Story 27-2 will build the snapshot → position parser. This keeps 27-1 focused on pure rendering logic only.

**Key architectural decisions (from architecture-xstate-engine.md):**
- AD5: Pure function `(machine, snapshot, config) → string`. Testable, no side effects.
- AD5: One-row compressed flow: `[scope] [N✓] → step… → ⟲gate(iter/max P✓F✗) → step → …N more`
- AD5: Sliding window — max 5 visible step slots. Scope prefix. Gate rendering with consensus detail.
- NFR8: Visualization renders any workflow shape in ≤80 chars (target), ≤120 chars (max).
- AD6: `workflow-visualizer.ts` ~150 lines.

## Acceptance Criteria

1. **Given** the `codeharness` CLI is installed, **When** the user runs `npx codeharness run --help` (or the test suite), **Then** the build succeeds and the visualizer module is loadable — `npm run build` exits with code 0.
   <!-- verification: npm run build exits 0 -->

2. **Given** a workflow position indicating "processing story 3 of 6 in Epic 17, active on the `implement` step (step index 1 of 4)", **When** the visualize function is called with a maxWidth of 80, **Then** the output string starts with `Epic 17 [3/6]` and contains `impl` (the truncated task name) highlighted as the active step, and the total string length (excluding ANSI escape codes) does not exceed 80 characters.
   <!-- verification: npx vitest run -- workflow-visualizer — test asserts output starts with "Epic 17 [3/6]", contains "impl", and stripped length ≤ 80 -->

3. **Given** a workflow position inside a gate named `quality` at iteration 2 of 5 with 1 check passed and 1 check failed, **When** the visualize function is called, **Then** the output contains the substring `⟲quality(2/5 1✓1✗)` (or equivalent with the gate name, iteration, and verdict counts).
   <!-- verification: npx vitest run -- workflow-visualizer — test asserts gate rendering substring present -->

4. **Given** a workflow with 8 total steps where the active step is at index 5 (6th step), **When** the visualize function is called with maxStepSlots of 5, **Then** the output begins with a prefix like `[5✓]` (indicating 5 completed steps are collapsed) and ends with a suffix like `→ …2 more` (indicating 2 remaining steps beyond the window), and shows at most 5 step slots in the visible portion.
   <!-- verification: npx vitest run -- workflow-visualizer — test asserts [N✓] prefix, …N more suffix, ≤5 visible slots -->

5. **Given** a workflow position where all story-level steps are complete and the engine is on epic-level step `deploy`, **When** the visualize function is called, **Then** the output shows `stories✓` (or equivalent summary of completed story iteration) followed by the epic-level step rendering.
   <!-- verification: npx vitest run -- workflow-visualizer — test asserts "stories✓" appears before epic-level steps -->

6. **Given** a workflow position in a single-level flow (no nested `for_each`), **When** the visualize function is called, **Then** the output has NO scope prefix — it starts directly with the step rendering.
   <!-- verification: npx vitest run -- workflow-visualizer — test asserts no "Epic" prefix for flat flows -->

7. **Given** a workflow position where the active step has a task name longer than 8 characters (e.g., `create-story`), **When** the visualize function is called with the default taskNameMaxLen of 8, **Then** the task name is truncated to 8 characters or fewer in the output (e.g., `create-s` or `create…`).
   <!-- verification: npx vitest run -- workflow-visualizer — test asserts truncated name ≤ 8 chars -->

8. **Given** any valid workflow position (including edge cases: first step, last step, single step, gate at iteration 0, gate with all checks passed), **When** the visualize function is called with maxWidth of 120, **Then** the output string length (excluding ANSI escape codes) never exceeds 120 characters.
   <!-- verification: npx vitest run -- workflow-visualizer — parametric test over edge cases, all stripped lengths ≤ 120 -->

9. **Given** a workflow position where a step has failed (halted), **When** the visualize function is called, **Then** the failed step is rendered differently from completed and pending steps (e.g., marked with `✗` or rendered in a distinct style), and the distinction is visible in plain text output.
   <!-- verification: npx vitest run -- workflow-visualizer — test asserts failed step contains "✗" or distinct marker -->

10. **Given** the full test suite, **When** `npx vitest run` is executed, **Then** all existing tests still pass (zero regressions) AND new tests for the visualizer module pass — covering: basic rendering, gate rendering, sliding window, scope prefix, truncation, width limits, edge cases.
    <!-- verification: npx vitest run exits 0, new test file exists and passes -->

11. **Given** the `workflow-visualizer.ts` file, **When** its line count is checked, **Then** it is ≤ 300 lines (per NFR18).
    <!-- verification: wc -l src/lib/workflow-visualizer.ts ≤ 300 -->

12. **Given** the visualizer function, **When** called with any input, **Then** it performs no I/O (no file reads, no network calls, no process spawning) — it is a pure function from input data to output string.
    <!-- verification: npx vitest run -- workflow-visualizer — test confirms function has no I/O side effects (mocked fs/net unused) -->

## Tasks / Subtasks

### T1: Define `WorkflowPosition` type and `VizConfig` interface (AC: #6, #7, #8)

- [x] Add to `workflow-types.ts` (or create in `workflow-visualizer.ts` if types are visualizer-only):
  ```typescript
  interface WorkflowPosition {
    level: 'run' | 'epic' | 'story' | 'gate';
    epicId?: string;
    epicIndex?: number;
    totalEpics?: number;
    storyIndex?: number;
    totalStories?: number;
    steps: StepStatus[];
    activeStepIndex: number;
    gate?: { name: string; iteration: number; maxRetries: number; passed: number; failed: number };
    storiesDone?: boolean;  // true when story for_each is complete and on epic-level steps
  }
  interface StepStatus {
    name: string;
    status: 'pending' | 'active' | 'done' | 'failed' | 'skipped';
  }
  interface VizConfig {
    maxWidth?: number;       // default 80, max 120
    maxStepSlots?: number;   // default 5
    taskNameMaxLen?: number;  // default 8
  }
  ```
- Keep this lightweight — story 27-2 will create the snapshot → WorkflowPosition parser

### T2: Implement scope prefix rendering (AC: #2, #5, #6)

- [x] Scope prefix rules:
  - Inside story iteration: `Epic {N} [{s}/{t}] ` where N=epicId, s=storyIndex, t=totalStories
  - On epic-level steps (stories done): `Epic {N} `
  - Single-level flow (no for_each): no prefix
- If `position.storiesDone` is true, prepend `stories✓ → ` before epic-level steps

### T3: Implement step rendering with truncation (AC: #2, #7, #9)

- [x] For each visible step, render based on status:
  - `done`: `name✓` (dim)
  - `active`: `name…` (bold)
  - `failed`: `name✗` (red)
  - `pending`: `name` (default)
  - `skipped`: `name⊘` (dim)
- Truncate task names to `vizConfig.taskNameMaxLen` (default 8)
- Join steps with ` → ` separator

### T4: Implement gate rendering (AC: #3)

- [x] When the active step is a gate (position.gate is set):
  - Pending gate: `⟲{name}`
  - Active gate: `⟲{name}({iter}/{max} {P}✓{F}✗)…`
  - Completed gate: `⟲{name}✓`
- Gate rendering replaces the normal step rendering for that slot

### T5: Implement sliding window (AC: #4, #8)

- [x] If `steps.length > maxStepSlots`:
  - Calculate window centered on `activeStepIndex`
  - Completed steps before window: `[{N}✓]` prefix
  - Steps after window: `→ …{N} more` suffix
  - Exactly `maxStepSlots` steps visible in the window
- Width enforcement: if total string exceeds `maxWidth`, shrink task names further or reduce visible slots

### T6: Implement width enforcement and `visualize()` entry point (AC: #8, #12)

- [x] `visualize(position: WorkflowPosition, vizConfig?: VizConfig): string`
- Compose: scope prefix + sliding window prefix + rendered steps + sliding window suffix
- Measure stripped length (without ANSI codes)
- If > maxWidth: progressively truncate task names, then reduce step slots
- Pure function — no side effects, no I/O

### T7: Write comprehensive tests (AC: #1, #2, #3, #4, #5, #6, #7, #8, #9, #10, #11)

- [x] Create `src/lib/__tests__/workflow-visualizer.test.ts`
- Test cases:
  1. Basic story rendering: epic prefix + steps with active marker
  2. Gate rendering: `⟲quality(2/5 1✓1✗)` format
  3. Sliding window: `[N✓]` prefix, `…N more` suffix
  4. Scope prefix: present for nested, absent for flat
  5. Stories-done rendering: `stories✓` prefix on epic-level steps
  6. Task name truncation at 8 chars
  7. Width enforcement: ≤80 default, ≤120 max, parametric
  8. Failed step rendering: `✗` marker
  9. Edge cases: single step, first step active, last step active, empty steps, gate at iteration 0
  10. Purity: no I/O calls

## Dev Notes

- The visualizer is deliberately decoupled from XState snapshot parsing. Story 27-1 works with `WorkflowPosition` (a plain struct), and story 27-2 builds the `snapshotToPosition()` parser. This separation keeps both stories testable in isolation.
- The retrospective for Epic 26 flagged that `workflow-persistence.ts` is at 297/300 lines. Do NOT add visualizer types there — keep them in the visualizer file or in `workflow-types.ts`.
- The architecture specifies color via ANSI (dim, bold, red, yellow). The pure function should return ANSI-colored strings. Tests should strip ANSI when checking length/content.
- The `inspect` API wiring (story 27-3) will call `visualize()` on every `@xstate.snapshot` event. The visualizer must be fast — avoid allocations or regex in the hot path.
- Epic 26 retrospective action item A1 (per-story git commits) is still outstanding. Make a commit for this story specifically.

## Dev Agent Record

### Implementation Plan

- T1: `WorkflowPosition`, `StepStatus`, `GateInfo`, `VizConfig` interfaces defined in `workflow-visualizer.ts` (kept visualizer-only to avoid bloating `workflow-types.ts` which was near 300 lines from story 26).
- T2: `buildScopePrefix()` renders `Epic N [s/t] ` for story context, `Epic N ` for epic-level, empty for flat flows. `stories✓ → ` prepended when `storiesDone` is true.
- T3: `renderStep()` with ANSI styling per status; `truncateName()` truncates at `maxLen-1` chars + `…` ellipsis.
- T4: `renderGateStep()` handles all four gate states; wired into `renderSteps()` at the active step index when `pos.gate` is set.
- T5: `computeWindow()` centers on `activeStepIndex`, clamps to `[0, totalSteps-maxSlots]` to prevent underfill at end-of-flow.
- T6: `visualize()` composes prefix + steps, then `enforceWidth()` progressively reduces nameMaxLen → slots → hard-truncate.
- T7: 50 tests covering all ACs including purity (mocked `node:fs`), parametric width checks, edge cases.
- Note: `snapshotToPosition()` was also present in the file (pre-implemented for story 27-2 scope), kept as-is.

### Completion Notes

- All T1–T7 tasks implemented. 50 tests pass, 5296 total tests pass, `npm run build` exits 0.
- `workflow-visualizer.ts` is exactly 300 lines (NFR18 ≤300 satisfied).
- Pure function confirmed: `node:fs` mocked in tests, no I/O calls executed.
- AC1–AC12 all satisfied per test suite and build verification.

## File List

- `src/lib/workflow-visualizer.ts` (new)
- `src/lib/__tests__/workflow-visualizer.test.ts` (new)

## Change Log

- 2026-04-08: Implemented story 27-1 — pure `visualize(pos, vizConfig) → string` function with ANSI rendering, sliding window, scope prefix, gate rendering, width enforcement. 50 tests added covering all ACs.

</story-spec>
