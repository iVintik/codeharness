# Story 6-1: Rewrite Ink Components to Match UX Spec

## Status: verifying

## Story

As an operator watching `codeharness run --live`,
I want the terminal display to match the UX specification exactly,
so that the output looks professional, consistent, and matches the documented design.

## Goal

The Ink terminal renderer output must visually match the UX spec mockup in `_bmad-output/planning-artifacts/ux-design-specification.md` lines 197-253. Every prior implementation diverged from the spec. This story requires literal reproduction of the spec format.

## Context: Why This Keeps Failing

Previous sessions "interpreted" the visual format instead of reproducing it literally. The current Header uses an Ink `Box` with `borderStyle="round"` and `borderColor="cyan"` — the spec shows a plain text header line with `━━━` separators. The StoryBreakdown uses a compact summary format (`N ✓ done`) — the spec shows labeled sections on separate lines (`Done:`, `This:`, `Next:`, `Blocked:`). This story bridges the gap between spec and implementation.

## Target Output (from UX spec — reproduce EXACTLY)

### Running state:
```
codeharness run | iteration 3 | 47m elapsed | $12.30 spent
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Story: 3-2-bmad-installation-workflow-patching
Phase: verify → AC 8/12 (docker exec ... codeharness init --json)

Done: 3-1 ✓  4-1 ✓  4-2 ✓
This: 3-2 ◆ verifying (8/12 ACs)
Next: 3-3 (verifying, no proof yet)

Blocked: 0-1 ✕ (10/10)  13-3 ✕ (10/10)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Story completion:
```
[OK] Story 3-2: DONE — 12/12 ACs verified
  └ Proof: verification/3-2-proof.md
  └ Duration: 18m | Cost: $4.20
[INFO] Sprint: 18/65 done (28%) — moving to 3-3
```

### Story returned to dev:
```
[WARN] Story 3-3: verification found 2 failing ACs → returning to dev
  └ AC 3: bridge --dry-run output missing epic headers
  └ AC 7: bridge creates duplicate beads issues
  └ Attempt 2/10 — dev will fix and re-verify
```

## Acceptance Criteria

- [x] AC1: Header line renders as `codeharness run | iteration N | Xm elapsed | $Y.ZZ spent` — plain text, NO Ink Box border, NO `borderStyle`, NO `◆` prefix <!-- verification: cli-verifiable -->
- [x] AC2: `━━━` separator line rendered below header and below story breakdown, spanning terminal width (no Ink Box border) <!-- verification: cli-verifiable -->
- [x] AC3: `Story:` and `Phase:` rendered on separate lines below header separator, with `Phase:` including AC progress (`AC N/M`) and current command <!-- verification: cli-verifiable -->
- [x] AC4: Story breakdown uses labeled sections on separate lines: `Done:` with individual short keys + `✓`, `This:` with current story + `◆` + AC progress, `Next:` with next pending, `Blocked:` with `✕` and retry counts in parens <!-- verification: cli-verifiable -->
- [x] AC5: Story completion messages render as `[OK] Story {key}: DONE — {N}/{M} ACs verified` with `└` detail lines for proof path, duration, and cost <!-- verification: cli-verifiable -->
- [x] AC6: Story warning/failure messages render as `[WARN] Story {key}: ...` with `└` detail lines for failing AC descriptions and attempt count <!-- verification: cli-verifiable -->
- [x] AC7: Cost tracking field (`totalCost`) added to `SprintInfo` type, sourced from stream-json `result` events (accumulated per session), displayed as `$Y.ZZ spent` in header <!-- verification: cli-verifiable -->
- [x] AC8: Iteration number field (`iterationCount`) added to `SprintInfo` type, sourced from ralph stderr `[LOOP]` messages, displayed as `iteration N` in header <!-- verification: cli-verifiable -->
- [x] AC9: All existing ink-renderer tests updated to match new component structure — zero test regressions <!-- verification: cli-verifiable -->
- [x] AC10: Visual snapshot test added — renders a known state and asserts output matches spec format (header line, separators, labeled story sections) <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Rewrite Header component to match spec (AC: #1, #2, #7, #8)
  - [x] Remove `<Box borderStyle="round" borderColor="cyan" paddingX={1}>` wrapper
  - [x] Render header as plain `<Text>` line: `codeharness run | iteration {N} | {elapsed} elapsed | ${cost} spent`
  - [x] Add `iterationCount?: number` and `totalCost?: number` to `SprintInfo` type
  - [x] Render `━━━` separator as a `<Text>` line using `━` repeated to `process.stdout.columns || 60`
  - [x] Render `Story:` and `Phase:` on separate lines below separator
  - [x] Add `acProgress?: string` (e.g., `8/12`) and `currentCommand?: string` to `SprintInfo`
  - [x] Format Phase line as `Phase: {phase} → AC {acProgress} ({currentCommand})`

- [x] Task 2: Rewrite StoryBreakdown to match spec layout (AC: #4)
  - [x] Change from horizontal compact format to vertical labeled sections
  - [x] `Done:` line — list each done story as `{shortKey} ✓` separated by two spaces
  - [x] `This:` line — show current story as `{shortKey} ◆ {status} ({acProgress} ACs)`
  - [x] `Next:` line — show next pending story with status hint
  - [x] `Blocked:` line — show blocked stories as `{shortKey} ✕ ({retryCount}/{maxRetries})`
  - [x] Add `retryCount?: number` and `maxRetries?: number` to `StoryStatusEntry` type
  - [x] Render bottom `━━━` separator after story breakdown

- [x] Task 3: Parse iteration count from ralph stderr (AC: #8)
  - [x] Add `[LOOP]` pattern match to `parseIterationMessage()` in `run-helpers.ts`
  - [x] Extract iteration number from `[LOOP] iteration N` messages
  - [x] Handle in run.ts directly via `currentIterationCount` variable

- [x] Task 4: Accumulate cost from result events (AC: #7)
  - [x] In `ink-renderer.tsx`, update `result` event handler to accumulate cost
  - [x] Extract `cost` from `result` event payload (already parsed by stream-parser as `cost_usd`)
  - [x] Update `SprintInfo.totalCost` directly in the result event handler

- [x] Task 5: Update all existing tests (AC: #9)
  - [x] Update Header test — assert no Box border in output, assert plain text header format
  - [x] Update StoryBreakdown test — assert labeled sections (`Done:`, `This:`, `Next:`, `Blocked:`)
  - [x] Update App integration tests for new layout
  - [x] Ensure all 2889 tests pass with new component structure (0 regressions)

- [x] Task 6: Add visual snapshot test (AC: #10)
  - [x] Create known RendererState with populated sprint info, stories, messages
  - [x] Render App with ink-testing-library
  - [x] Assert output contains exact header format line
  - [x] Assert output contains `━━━` separators
  - [x] Assert output contains labeled story sections (`Done:`, `This:`, `Next:`)
  - [x] Assert output matches spec format structure

## Dev Notes

### What Exists (Rewrite, Not Enhance)

Unlike story 0-5-3 which enhanced existing components, this story REWRITES the visual layout. The underlying state management (`RendererState`, `update()`, `updateSprintState()`, etc.) is correct and should be preserved. The components that render the state need restructuring.

### Key Divergences from Current Implementation

| Current | Spec | Fix |
|---------|------|-----|
| `<Box borderStyle="round">` header | Plain text `codeharness run \| iteration N \| ...` | Remove Box, use Text |
| `◆ {storyKey} — {phase} \| {elapsed} \| Sprint: {done}/{total}` | `codeharness run \| iteration N \| Xm elapsed \| $Y.ZZ spent` | Different header content entirely |
| No `Story:` / `Phase:` lines | Separate lines below separator | Add new lines |
| Horizontal compact `N ✓ done \| ◆ key \| next: key` | Vertical `Done:` / `This:` / `Next:` / `Blocked:` | Rewrite StoryBreakdown |
| No iteration count | `iteration N` in header | Parse from `[LOOP]` stderr |
| No cost tracking | `$Y.ZZ spent` in header | Accumulate from `result` events |
| No `━━━` separators | Full-width `━━━` lines | Add separator component |

### Key Files to Modify

- `src/lib/ink-components.tsx` — Rewrite Header, StoryBreakdown, add Separator; expand SprintInfo type
- `src/lib/ink-renderer.tsx` — Accumulate cost from result events; update SprintInfo with new fields
- `src/lib/run-helpers.ts` — Parse `[LOOP]` iteration messages from ralph stderr
- `src/commands/run.ts` — Wire iteration count and cost into SprintInfo updates
- `src/lib/__tests__/ink-renderer.test.tsx` — Update all component tests

### Key Files to Read (Do NOT Modify)

- `src/lib/stream-parser.ts` — StreamEvent types (check `result` event shape for cost field)
- `_bmad-output/planning-artifacts/ux-design-specification.md` lines 197-253 — The spec to match

### Architecture Constraints

- **NFR9: No file > 300 lines.** ink-components.tsx is currently 252 lines. The rewrite should stay under 300. If it exceeds, split into `ink-layout-components.tsx` (Header, Separator, StoryBreakdown) and `ink-activity-components.tsx` (tools, thoughts, retry).
- **Vitest** for unit tests, **100% coverage target**
- **ink-testing-library** for component rendering tests
- **TSX** with `"jsx": "react-jsx"` in tsconfig

### Anti-Patterns to Avoid

- Do NOT use `console.log` — Ink manages the terminal
- Do NOT use raw ANSI escape codes for colors — use Ink's `<Text>` color props
- Do NOT break the RendererHandle API — consumers (run.ts) depend on the existing interface
- Do NOT change the event handling logic in ink-renderer.tsx — only add cost accumulation to `result` handler
- Do NOT hardcode terminal width — use `process.stdout.columns` with a fallback

### References

- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Lines 197-253] — live mode display format (THE spec to match)
- [Source: src/lib/ink-components.tsx] — current components to rewrite
- [Source: src/lib/ink-renderer.tsx] — controller (preserve API, update result handler)
- [Source: src/lib/run-helpers.ts] — add [LOOP] parsing
- [Source: src/lib/__tests__/ink-renderer.test.tsx] — tests to update

## Dev Agent Record

### Implementation Plan

1. Rewrote Header component: removed Box border, plain text `codeharness run | ...` format, added Separator, Story/Phase lines
2. Rewrote StoryBreakdown: vertical labeled sections (Done/This/Next/Blocked) with retry counts
3. Added `parseIterationMessage()` to run-helpers.ts for `[LOOP]` stderr parsing
4. Added cost accumulation in ink-renderer.tsx result event handler
5. Wired iteration count tracking in run.ts via `currentIterationCount` variable
6. Split ink-components.tsx into 3 files to comply with NFR9 (300-line limit):
   - `ink-components.tsx` (200 lines) — types + layout components + re-exports
   - `ink-activity-components.tsx` (100 lines) — tool/thought/retry/message components
   - `ink-app.tsx` (31 lines) — root App component (avoids circular imports)
7. Updated all tests to match new component structure
8. Added visual snapshot test asserting exact spec format match

### Debug Log

No issues encountered during implementation.

### Completion Notes

All 6 tasks completed. Full test suite passes: 2889 tests, 0 failures, 0 regressions.
17 new tests added (6 for parseIterationMessage, 11 new/updated ink-renderer tests including visual snapshot).
Files split to comply with NFR9 — no file exceeds 300 lines.
RendererHandle API preserved — no breaking changes to consumers.

## File List

- `src/lib/ink-components.tsx` — Modified: rewrote Header, StoryBreakdown, Separator; expanded SprintInfo/StoryStatusEntry types; re-exports activity components
- `src/lib/ink-activity-components.tsx` — New: extracted CompletedTool, CompletedTools, ActiveTool, LastThought, RetryNotice, StoryMessageLine
- `src/lib/ink-app.tsx` — New: App root component (avoids circular imports between layout and activity modules)
- `src/lib/ink-renderer.tsx` — Modified: added cost accumulation in result event handler
- `src/lib/run-helpers.ts` — Modified: added `[LOOP]` regex and `parseIterationMessage()` function
- `src/commands/run.ts` — Modified: added `parseIterationMessage` import, `currentIterationCount` tracking, `iterationCount` in SprintInfo updates
- `src/lib/__tests__/ink-renderer.test.tsx` — Modified: updated all component tests for new format, added visual snapshot tests
- `src/lib/__tests__/run-helpers.test.ts` — Modified: added parseIterationMessage tests

## Change Log

- Rewrote Ink components to match UX spec format exactly (Date: 2026-03-21)
- Split ink-components.tsx into 3 files for NFR9 compliance (Date: 2026-03-21)
- Added iteration count parsing from ralph stderr [LOOP] messages (Date: 2026-03-21)
- Added cost accumulation from stream-json result events (Date: 2026-03-21)

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`verification/6-1-rewrite-ink-components-match-ux-spec.proof.md`)
- [x] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/6-1-rewrite-ink-components-match-ux-spec.md`

## Testing Requirements

- [x] Unit tests written for all new/changed code
- [x] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
