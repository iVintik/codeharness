# Story 0.5.3: Ink Terminal Renderer

Status: verifying

## Story

As an operator,
I want a rich terminal UI built with Ink that shows live Claude activity, per-story progress, session timing, and story completion messages,
so that I can see at a glance what Claude is doing, how the sprint is progressing, and what happened to each story.

## Acceptance Criteria

1. **Given** Claude is executing tools during a run, **When** the operator watches the terminal, **Then** they see the active tool with a spinner (`⚡ [ToolName]`) and each completed tool as a permanent line (`✓ [ToolName] args...`). <!-- verification: cli-verifiable -->

2. **Given** Claude is producing text output, **When** the operator watches the terminal, **Then** they see the latest thought on an updating line (`💭 {text}`), truncated to terminal width. <!-- verification: cli-verifiable -->

3. **Given** a running session, **When** the Ink header renders, **Then** it shows the current story key, phase, elapsed time, and sprint progress — matching the UX spec format: `◆ {story_key} — {phase} | {elapsed} | Sprint: {done}/{total}`. <!-- verification: cli-verifiable -->

4. **Given** sprint state data with per-story statuses, **When** the renderer displays the story breakdown section, **Then** it shows stories grouped by status using the UX spec symbols: `✓` done, `◆` in-progress, `○` pending, `✗` failed, `✕` blocked/exhausted — e.g. `Done: 3-1 ✓  4-1 ✓  4-2 ✓ | This: 3-2 ◆ | Next: 3-3 ○`. <!-- verification: cli-verifiable -->

5. **Given** a story completes verification successfully, **When** the renderer receives a story-complete event, **Then** it displays `[OK] Story {key}: DONE — {AC count} ACs verified` with duration and cost on a subsequent line. <!-- verification: cli-verifiable -->

6. **Given** a story fails verification, **When** the renderer receives a story-failed event, **Then** it displays `[WARN] Story {key}: verification found {N} failing ACs → returning to dev` with the failing AC details and attempt count. <!-- verification: cli-verifiable -->

7. **Given** an API retry event, **When** rendered, **Then** it shows `⏳ API retry {attempt} (waiting {delay}ms)`. <!-- verification: cli-verifiable -->

8. **Given** the `--quiet` flag is set, **When** the renderer is started, **Then** no terminal output is produced — a no-op handle is returned. <!-- verification: cli-verifiable -->

9. **Given** process exit (SIGINT, SIGTERM, or natural end), **When** Ink cleans up, **Then** no orphaned terminal state (cursor, alternate screen buffer) remains. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Expand SprintInfo type and Header component (AC: #3)
  - [x] Add `elapsed?: string` to SprintInfo
  - [x] Update Header to render elapsed time: `◆ {storyKey} — {phase} | {elapsed} | Sprint: {done}/{total}`
  - [x] Update tests for new header format

- [x] Task 2: Add per-story status breakdown component (AC: #4)
  - [x] Define `StoryStatusEntry` type: `{ key: string; status: StoryStatusValue }`
  - [x] Add `stories: StoryStatusEntry[]` to RendererState
  - [x] Create `StoryBreakdown` component that groups stories by status and renders with correct symbols (✓/◆/○/✗/✕)
  - [x] Add `updateStories(stories: StoryStatusEntry[])` to RendererHandle
  - [x] Compact single-line format: `Done: 3-1 ✓  4-1 ✓ | This: 3-2 ◆ | Next: 3-3 ○`
  - [x] Update tests

- [x] Task 3: Add story completion/failure message components (AC: #5, #6)
  - [x] Define `StoryMessage` type: `{ type: 'ok' | 'warn' | 'fail'; key: string; message: string; details?: string[] }`
  - [x] Add `messages: StoryMessage[]` to RendererState
  - [x] Create `StoryMessages` component rendering `[OK]`/`[WARN]`/`[FAIL]` lines per UX spec format
  - [x] Add `addMessage(msg: StoryMessage)` to RendererHandle
  - [x] Messages are permanent (append-only, not overwritten)
  - [x] Update tests

- [x] Task 4: Wire new components into App and renderer controller (AC: #1-#9)
  - [x] Add StoryBreakdown and StoryMessages to App component tree
  - [x] Expose new methods on RendererHandle: `updateStories()`, `addMessage()`
  - [x] Ensure no-op handle includes new methods
  - [x] Verify signal handling still works with expanded state

- [x] Task 5: Update tests for all new/changed behavior (AC: #1-#9)
  - [x] Test Header renders elapsed time
  - [x] Test StoryBreakdown renders correct symbols per status
  - [x] Test StoryMessages renders [OK], [WARN], [FAIL] formats
  - [x] Test updateStories() and addMessage() on RendererHandle
  - [x] Test no-op handle includes new methods
  - [x] All 29 existing tests still pass (47 total now)

## Dev Notes

### What Exists (Enhance, Don't Rewrite)

The Ink renderer already works for tool activity display. This story ENHANCES it with:
1. Richer header (add elapsed time)
2. Per-story status section (new component)
3. Story completion messages (new component)

**Do NOT rewrite ink-components.tsx or ink-renderer.tsx from scratch.** Add new components and expand existing types. The existing tool activity display (⚡ spinner, ✓ completed, 💭 thought, ⏳ retry) is correct and should not change.

### Key Files to Modify

- `src/lib/ink-components.tsx` — Add StoryBreakdown, StoryMessages components; expand SprintInfo type; update Header; update App
- `src/lib/ink-renderer.tsx` — Expand RendererState; add updateStories(), addMessage() to handle; update no-op handle
- `src/lib/__tests__/ink-renderer.test.tsx` — Add tests for new components and API

### Key Files to Read (Do NOT Modify)

- `src/lib/stream-parser.ts` — StreamEvent types consumed by the renderer
- `src/commands/run.ts` — Where the renderer is integrated (modified in 0.5.4, not this story)

### Architecture Constraints

- **NFR9: No file > 300 lines.** If ink-components.tsx exceeds 300 lines after adding new components, split into `ink-components.tsx` (existing) and `ink-status-components.tsx` (new story/status components).
- **Vitest** for unit tests, **100% coverage target**
- **ink-testing-library** for component rendering tests (already a devDependency)
- **TSX** with `"jsx": "react-jsx"` in tsconfig (already configured)

### UX Spec Reference — Expected Visual Output

The live mode display should look like this (from UX spec):

```
◆ 3-2-bmad-installation-workflow-patching — verify | 47m | Sprint: 18/65
Done: 3-1 ✓  4-1 ✓  4-2 ✓
This: 3-2 ◆ verifying
Next: 3-3 ○

✓ [Bash] npm run test:unit 2>&1 | tail -20
✓ [Read] src/modules/sprint/state.ts
⚡ [Bash] docker exec codeharness-verify ...
💭 Running the verification container to check AC 8...
```

Story completion messages (displayed between stories):
```
[OK] Story 3-2: DONE — 12/12 ACs verified (18m, $4.20)
[WARN] Story 3-3: verification found 2 failing ACs → returning to dev (attempt 2/10)
```

### Previous Story Intelligence (0.5.2)

- Parser is stateless per-line; renderer is stateful
- `content_block_stop` after text block (no activeTool) must be ignored in tool-complete handler — this is already correctly handled
- Codepoint-aware truncation for emoji/CJK already implemented in `truncateToWidth()`

### Display Layout Order (top to bottom)

1. **Header** — story key, phase, elapsed, sprint progress
2. **Story Breakdown** — per-story status with symbols (compact single line)
3. **Story Messages** — [OK]/[WARN]/[FAIL] messages (permanent, append-only)
4. **Completed Tools** — ✓ lines (scrolling, max 50)
5. **Active Tool** — ⚡ with spinner
6. **Last Thought** — 💭 text
7. **Retry Notice** — ⏳ (when active)

### What This Story Does NOT Include

- No integration with `run.ts` — that's Story 0.5.4
- No data sourcing (reading sprint-status.yaml, computing elapsed time) — that's 0.5.4
- No changes to stream-parser.ts
- No changes to ralph or bash scripts
- This story builds the components that CAN render the data; 0.5.4 feeds data in

### Anti-Patterns to Avoid

- Do NOT use `console.log` — Ink manages the terminal
- Do NOT use ANSI escape codes — use Ink's `<Text>` and `<Box>` components
- Do NOT accumulate ALL text deltas — only keep the LAST thought
- Do NOT hardcode story data — components receive data via props/state
- Do NOT break existing tool activity display — enhance, don't replace

### References

- [Source: _bmad-output/planning-artifacts/epics-operational-excellence.md#Story 0.5.3] — original epic ACs
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Lines 199-252] — live mode display format, story completion messages, status symbols
- [Source: _bmad-output/planning-artifacts/prd-overhaul.md#Lines 163-197] — journey 1 evening/morning display
- [Source: src/lib/ink-components.tsx] — existing components to enhance
- [Source: src/lib/ink-renderer.tsx] — existing controller to enhance
- [Source: src/lib/stream-parser.ts] — StreamEvent types

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`verification/0-5-3-ink-terminal-renderer.proof.md`)
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

- Enhanced existing Ink renderer with 3 new capabilities: elapsed time in header, per-story status breakdown, story completion messages
- Added `StoryStatusEntry`, `StoryStatusValue`, `StoryMessage` types to ink-components.tsx
- Added `StoryBreakdown` component — groups stories by status, renders with UX spec symbols (✓/◆/○/✗/✕)
- Added `StoryMessages` component — renders [OK]/[WARN]/[FAIL] lines with optional detail lines (└ prefix)
- Expanded `SprintInfo` with optional `elapsed` field, Header renders it when present
- Expanded `RendererState` with `stories` and `messages` arrays
- Added `updateStories()` and `addMessage()` to RendererHandle (including no-op handle)
- 47 vitest tests pass (18 new + 29 existing), 2676 total vitest tests pass, 316 BATS tests pass
- Both files remain under 300 lines (NFR9): ink-components.tsx=228, ink-renderer.tsx=202

### File List

- src/lib/ink-components.tsx (modified) — added StoryStatusEntry, StoryMessage types; StoryBreakdown, StoryMessages components; expanded SprintInfo and Header; updated App layout
- src/lib/ink-renderer.tsx (modified) — expanded RendererState; added updateStories(), addMessage() to handle and no-op; re-exported new types
- src/lib/__tests__/ink-renderer.test.tsx (modified) — 18 new tests for header elapsed, StoryBreakdown, StoryMessages, controller methods
