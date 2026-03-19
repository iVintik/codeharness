# Story 0.5.3: Ink Terminal Renderer

Status: review

## Story

As an operator,
I want a terminal UI built with Ink that shows live Claude activity,
so that I see tool calls, text thoughts, and progress like Claude Code's subagent display.

## Acceptance Criteria

1. **Given** a tool-start event, **When** rendered, **Then** the display shows `⚡ [ToolName]` with a spinner on the current line. <!-- verification: cli-verifiable -->
2. **Given** a tool-complete event, **When** rendered, **Then** the completed tool shows `✓ [ToolName] args...` as a permanent line, and the spinner moves to the next activity. <!-- verification: cli-verifiable -->
3. **Given** text delta events, **When** rendered, **Then** the display shows `💭 {last thought text}` on an updating line — not every chunk, just the latest thought truncated to terminal width. <!-- verification: cli-verifiable -->
4. **Given** sprint state from `sprint-state.json`, **When** rendered, **Then** a header shows `◆ {story_key} — {phase} | Sprint: {done}/{total}`. <!-- verification: cli-verifiable -->
5. **Given** `--quiet` flag, **When** set, **Then** the renderer is not started — no terminal output. <!-- verification: cli-verifiable -->
6. **Given** process exit (SIGINT, SIGTERM, or natural end), **When** Ink cleans up, **Then** no orphaned terminal state. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 0: Project setup for TSX/Ink (prerequisite for all)
  - [x] Install dependencies: `ink`, `react`, `@inkjs/ui`, `@types/react` (ink/react as dependencies, types as devDependency)
  - [x] Update `tsconfig.json`: add `"jsx": "react-jsx"` to compilerOptions
  - [x] Update `tsup.config.ts`: add a build entry for the renderer or ensure `.tsx` files are handled (tsup supports TSX out of the box)
  - [x] Verify `tsup` builds a `.tsx` file without errors
- [x] Task 1: Create Ink renderer component tree (AC: #1, #2, #3, #4)
  - [x] Create `src/lib/ink-renderer.tsx` with the main `ActivityDisplay` React component
  - [x] Implement `Header` component: reads sprint state and renders `◆ {story_key} — {phase} | Sprint: {done}/{total}` (AC: #4)
  - [x] Implement `CompletedTools` component: renders permanent lines `✓ [ToolName] args...` for each completed tool (AC: #2)
  - [x] Implement `ActiveTool` component: renders `⚡ [ToolName]` with Ink `<Spinner />` on current line (AC: #1)
  - [x] Implement `LastThought` component: renders `💭 {text}` truncated to `process.stdout.columns` on an updating line (AC: #3)
  - [x] Implement `RetryIndicator` component: renders `⏳ API retry {attempt}/{max} (waiting {delay}ms)` when retry event is active
- [x] Task 2: Create renderer controller / API (AC: #1, #2, #3, #5, #6)
  - [x] Export `startRenderer(options: RendererOptions): RendererHandle` function
  - [x] `RendererOptions`: `{ quiet?: boolean; sprintState?: { storyKey: string; phase: string; done: number; total: number } }`
  - [x] `RendererHandle`: `{ update(event: StreamEvent): void; updateSprintState(state): void; cleanup(): void }`
  - [x] If `quiet === true`, return a no-op handle — no Ink instance created (AC: #5)
  - [x] Use `render()` from Ink to mount the component tree
  - [x] `cleanup()` calls `inkInstance.unmount()` and `inkInstance.cleanup()` (AC: #6)
- [x] Task 3: Wire stream events to component state (AC: #1, #2, #3)
  - [x] Maintain state: `completedTools: Array<{ name: string; args: string }>`, `activeTool: { name: string } | null`, `lastThought: string | null`, `retryInfo: { attempt: number; delay: number } | null`
  - [x] On `tool-start`: set `activeTool = { name }`, clear `lastThought`
  - [x] On `tool-input`: accumulate partial input into active tool's args buffer
  - [x] On `tool-complete`: move `activeTool` to `completedTools` with accumulated args, clear `activeTool`
  - [x] On `text`: update `lastThought` with latest text (overwrite, not append — show last chunk only)
  - [x] On `retry`: set `retryInfo`; clear on next `tool-start` or `text`
  - [x] On `result`: no rendering change (handled by caller)
  - [x] Handle `content_block_stop` after text blocks (not tool blocks): the parser emits `tool-complete` for ALL `content_block_stop` events. The renderer must track whether the active block was a tool or text and ignore `tool-complete` when no `activeTool` is set.
- [x] Task 4: Signal handling and cleanup (AC: #6)
  - [x] Register `SIGINT` and `SIGTERM` handlers that call `cleanup()`
  - [x] Ensure Ink's `exitOnCtrlC` option is set appropriately
  - [x] On natural process exit, call `cleanup()` to restore terminal state
  - [x] Verify no orphaned cursor-hide or alternate-screen-buffer state after cleanup
- [x] Task 5: Write unit tests (AC: #1-#6)
  - [x] Create `src/lib/__tests__/ink-renderer.test.tsx` (uses ink-testing-library for component rendering tests + API tests)
  - [x] Test `startRenderer({ quiet: true })` returns no-op handle (AC: #5)
  - [x] Test `update()` with tool-start event sets active tool state
  - [x] Test `update()` with tool-complete moves tool to completed list
  - [x] Test `update()` with text event updates last thought
  - [x] Test `update()` with retry event sets retry info
  - [x] Test `cleanup()` can be called multiple times without error
  - [x] Test tool-complete after text block (no activeTool) is handled gracefully
  - [x] For Ink component rendering tests, use `ink-testing-library` if needed (devDependency)

## Dev Notes

### Current State — What Exists

**Story 0.5.1 (done)** switched ralph's Claude driver to `--output-format stream-json`. Claude now emits NDJSON during execution.

**Story 0.5.2 (done)** created `src/lib/stream-parser.ts` with `parseStreamLine()` that returns a `StreamEvent` discriminated union:
- `ToolStartEvent` — `{ type: 'tool-start', name: string, id: string }`
- `ToolInputEvent` — `{ type: 'tool-input', partial: string }`
- `ToolCompleteEvent` — `{ type: 'tool-complete' }`
- `TextEvent` — `{ type: 'text', text: string }`
- `RetryEvent` — `{ type: 'retry', attempt: number, delay: number }`
- `ResultEvent` — `{ type: 'result', cost: number, sessionId: string }`

**Story 0.3 (done)** created `src/lib/dashboard-formatter.ts` — the existing non-Ink dashboard used by `src/commands/run.ts`. This will be replaced by the Ink renderer in Story 0.5.4.

**Sprint state** is in `sprint-state.json` (read via `src/modules/sprint/state.ts`). The `SprintState` interface has:
- `sprint.done`, `sprint.total` — progress counts
- `run.currentStory`, `run.currentPhase` — active work

### Key Files to Read (do NOT modify)

- `src/lib/stream-parser.ts` — the `StreamEvent` types this renderer consumes
- `src/lib/dashboard-formatter.ts` — existing formatter (reference for display patterns, will be replaced in 0.5.4)
- `src/modules/sprint/state.ts` — `readState()`, `SprintState` interface
- `src/types/state.ts` — `SprintState`, `StoryState` type definitions
- `src/commands/run.ts` — where the renderer will be integrated (in 0.5.4, not this story)

### Key Files to Create

- `src/lib/ink-renderer.tsx` — main renderer component and API
- `src/lib/__tests__/ink-renderer.test.ts` — unit tests

### Critical Design Decisions

1. **TSX is new to this project.** `tsconfig.json` needs `"jsx": "react-jsx"`. `tsup` handles `.tsx` files natively — no extra config beyond ensuring the entry/include covers `.tsx`.

2. **Ink is React for terminals.** Use `ink` (v5+) and `react` (v18+). Use `<Spinner />` from `@inkjs/ui` for the active tool indicator.

3. **The renderer is a library, not a command.** It exports a `startRenderer()` function that returns a handle. The `run` command (Story 0.5.4) will call this. This story does NOT modify `run.ts`.

4. **Stateless parser, stateful renderer.** The parser (`parseStreamLine`) is stateless per-line. The renderer accumulates state: it tracks which tool is active, what args have been collected, completed tools list, last thought text.

5. **`content_block_stop` ambiguity.** The parser emits `tool-complete` for ALL `content_block_stop` events (both tool and text blocks) because the parser is stateless. The renderer MUST check whether `activeTool` is set before promoting to completed. If `activeTool` is null when `tool-complete` arrives, ignore it — it was a text block stop.

6. **Text truncation.** Truncate `lastThought` to `process.stdout.columns - 4` (room for `💭 ` prefix and padding). Use `slice()`, not word wrap.

7. **Args truncation for completed tools.** When a tool completes, show `✓ [ToolName] {first ~60 chars of accumulated input}...` as the permanent line. The full args are not needed — just enough to identify the call.

8. **No file >300 lines (NFR9).** If the component tree exceeds this, split into `src/lib/ink-renderer.tsx` (main export + controller) and `src/lib/ink-components.tsx` (individual React components).

### Dependencies to Install

```
npm install ink react @inkjs/ui
npm install -D @types/react ink-testing-library
```

Ink v5 requires React 18. Both `ink` and `react` must be production dependencies since the renderer runs at runtime.

### tsconfig.json Change

Add to `compilerOptions`:
```json
"jsx": "react-jsx"
```

This enables JSX transform without needing `import React from 'react'` in every file.

### Renderer API Contract

```typescript
interface RendererOptions {
  quiet?: boolean;
  sprintState?: {
    storyKey: string;
    phase: string;
    done: number;
    total: number;
  };
}

interface RendererHandle {
  update(event: StreamEvent): void;
  updateSprintState(state: RendererOptions['sprintState']): void;
  cleanup(): void;
}

function startRenderer(options?: RendererOptions): RendererHandle;
```

### What This Story Does NOT Include

- No integration with `run.ts` or ralph — that's Story 0.5.4
- No modification of existing commands or modules
- No changes to `stream-parser.ts` (consumed as-is)
- No changes to `dashboard-formatter.ts` (replaced in 0.5.4, not this story)

### Anti-Patterns to Avoid

- Do NOT use `console.log` for terminal output — Ink manages the terminal
- Do NOT use ANSI escape codes directly — use Ink's `<Text>` and `<Box>` components
- Do NOT accumulate ALL text deltas — only keep the LAST thought text for display
- Do NOT create a separate process or thread for rendering — Ink runs in the same Node.js process
- Do NOT import from `@inkjs/ui` things that don't exist — verify the package exports `Spinner` (it does as of v2+)

### References

- [Source: _bmad-output/planning-artifacts/epics-operational-excellence.md#Story 0.5.3] — acceptance criteria
- [Source: src/lib/stream-parser.ts] — StreamEvent types consumed by the renderer
- [Source: src/lib/dashboard-formatter.ts] — existing display patterns
- [Source: src/modules/sprint/state.ts] — sprint state reading
- [Source: src/types/state.ts] — SprintState type definition

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/0-5-3-ink-terminal-renderer.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/0-5-3-ink-terminal-renderer.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- Installed ink, react, @inkjs/ui as production deps; @types/react and ink-testing-library as dev deps
- Added "jsx": "react-jsx" to tsconfig.json compilerOptions
- Split components into ink-components.tsx (107 lines) and controller into ink-renderer.tsx (97 lines) per NFR9 (<300 lines each)
- Components render correctly with ink-testing-library: Header, CompletedTool, ActiveTool, LastThought, RetryNotice, App
- Controller handles all StreamEvent types; tool-complete after text block (no activeTool) is safely ignored
- Signal handlers (SIGINT/SIGTERM) call cleanup(); exitOnCtrlC set to false so we control cleanup ourselves
- 29 tests pass, full suite (2579 tests) unaffected
- tsup JS build succeeds; pre-existing DTS build error is unrelated to this story
- vitest.config.ts updated to include .tsx in coverage

### File List

- src/lib/ink-components.tsx (new) — React components: Header, CompletedTool, ActiveTool, LastThought, RetryNotice, App
- src/lib/ink-renderer.tsx (new) — Controller API: startRenderer(), RendererHandle, event-to-state wiring
- src/lib/__tests__/ink-renderer.test.tsx (new) — 29 tests covering all ACs
- tsconfig.json (modified) — added "jsx": "react-jsx"
- vitest.config.ts (modified) — added .tsx to coverage include/exclude
- package.json (modified) — new dependencies: ink, react, @inkjs/ui, @types/react, ink-testing-library
