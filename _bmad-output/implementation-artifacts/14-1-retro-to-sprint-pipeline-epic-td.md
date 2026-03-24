# Story 14-1: Retro-to-Sprint Pipeline (Step 8b) + Persistent epic-TD

## Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

<!-- verification-tier: unit-testable -->

## Story

As a developer running harness-run,
I want retro action items to auto-create stories under epic-TD,
So that tech debt gets tracked and prioritized automatically.

## Acceptance Criteria

1. Given a retro file with `### Fix Now` items, when `processRetroActionItems()` runs, then new `TD-N-slug: backlog` entries appear in sprint-state.json stories under `epic-TD` <!-- verification: cli-verifiable -->
2. Given `epic-TD` doesn't exist in sprint-state.json, when the first TD story is created via `ensureEpicTd()`, then `epic-TD` is created with `status: 'in-progress'` and `storiesTotal: 1`, `storiesDone: 0` <!-- verification: cli-verifiable -->
3. Given `epic-TD` already exists with 2 stories, when a new TD story is created, then `epic-TD.storiesTotal` is incremented to 3 and existing stories are preserved <!-- verification: cli-verifiable -->
4. Given a duplicate action item with 80%+ word overlap with an existing TD story title, when `processRetroActionItems()` processes it, then it is skipped and an `[INFO] Skipping duplicate` message is logged <!-- verification: cli-verifiable -->
5. Given a retro file with `### Fix Soon` items, when `processRetroActionItems()` runs, then those items also create `TD-N-slug: backlog` entries (same as Fix Now) <!-- verification: cli-verifiable -->
6. Given a retro file with `### Backlog` items, when `processRetroActionItems()` runs, then those items are appended to `tech-debt-backlog.md` but do NOT create sprint-state stories <!-- verification: cli-verifiable -->
7. Given `generateSprintStatusYaml()` runs on a state with `epic-TD` stories, when the YAML is generated, then `epic-TD` status is always `in-progress` regardless of whether all TD stories are done <!-- verification: cli-verifiable -->
8. Given `npm run build` runs after all changes, then TypeScript compilation succeeds with zero errors <!-- verification: cli-verifiable -->
9. Given `npm test` runs after all changes, then all existing tests pass with zero regressions <!-- verification: cli-verifiable -->
10. Given no new file created for this story, when line count is checked, then no modified file exceeds 300 lines <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1 (AC: 1, 5): Extend `src/lib/retro-parser.ts` with section-aware parsing
  - [x] Add `RetroSectionItem` interface with `section: 'fix-now' | 'fix-soon' | 'backlog'`, `text: string`
  - [x] Add `parseRetroSections(content: string): RetroSectionItem[]` that parses `## 6. Action Items` and its subsections
  - [x] Handle varying subsection header formats: `### Fix Now (Before Next Session)`, `### Fix Soon (Next Sprint)`, `#### Fix Now`, etc.
  - [x] Extract bullet items (`- ` or numbered `1. `) under each subsection

- [x] Task 2 (AC: 4): Add deduplication logic
  - [x] Add `normalizeText(text: string): string[]` — lowercase, remove punctuation, split into words
  - [x] Add `wordOverlap(a: string[], b: string[]): number` — returns overlap percentage (0-1)
  - [x] Add `isDuplicate(newItem: string, existingTitles: string[], threshold?: number): { duplicate: boolean; matchedTitle?: string }` with default threshold 0.8

- [x] Task 3 (AC: 2, 3): Add epic-TD management to `src/modules/sprint/state.ts`
  - [x] Add `ensureEpicTd(state: SprintState): SprintState` — creates `epic-TD` if absent, returns updated state
  - [x] Add `createTdStory(state: SprintState, slug: string): SprintState` — adds `TD-{N}-{slug}` story, increments `epic-TD.storiesTotal`
  - [x] Add `nextTdStoryNumber(state: SprintState): number` — scans existing `TD-*` story keys, returns max+1 (or 1 if none)

- [x] Task 4 (AC: 7): Prevent epic-TD completion in YAML generation
  - [x] In `generateSprintStatusYaml()` in `state.ts`, add check: if epicKey is `'TD'`, force status to `'in-progress'` regardless of story statuses

- [x] Task 5 (AC: 1, 5, 6): Create `src/lib/retro-to-sprint.ts` orchestrator
  - [x] Add `processRetroActionItems(retroContent: string, state: SprintState): { updatedState: SprintState; created: string[]; skipped: string[]; backlogAppended: string[] }`
  - [x] For `fix-now` and `fix-soon` items: generate slug from item text, check dedup, call `createTdStory()`
  - [x] For `backlog` items: append to `tech-debt-backlog.md` file
  - [x] Return created/skipped/backlogAppended arrays for logging

- [x] Task 6 (AC: 1, 5, 6, 4): Create `src/lib/__tests__/retro-to-sprint.test.ts`
  - [x] Test: Fix Now items create TD stories in state
  - [x] Test: Fix Soon items create TD stories in state
  - [x] Test: Backlog items do NOT create stories, append to file
  - [x] Test: Duplicate items (80%+ overlap) are skipped
  - [x] Test: Non-duplicate items (< 80% overlap) are created
  - [x] Test: epic-TD auto-created on first TD story
  - [x] Test: epic-TD.storiesTotal incremented on subsequent stories
  - [x] Test: TD story numbering auto-increments correctly

- [x] Task 7 (AC: 4): Create `src/lib/__tests__/retro-parser-sections.test.ts`
  - [x] Test: Parses `### Fix Now` items from retro content
  - [x] Test: Parses `### Fix Soon` items from retro content
  - [x] Test: Parses `### Backlog` items from retro content
  - [x] Test: Handles varying header formats (with/without parenthetical suffixes)
  - [x] Test: Deduplication normalizeText and wordOverlap edge cases

- [x] Task 8 (AC: 7): Add test for epic-TD YAML generation
  - [x] Test: `generateSprintStatusYaml()` always shows `epic-TD: in-progress` even when all TD stories are done

- [x] Task 9 (AC: 8): Run `npm run build` — TypeScript compilation succeeds
- [x] Task 10 (AC: 9): Run `npm test` — all existing tests pass, zero regressions
- [x] Task 11 (AC: 10): Verify all modified/new files are under 300 lines

## Dev Notes

### Architecture Compliance

- **Decision 6 (Retro-to-Sprint Pipeline):** This story implements the first two mechanisms from architecture-v3.md Decision 6: persistent epic-TD and retro-to-sprint auto-creation. The third mechanism (tech debt gate in story selection) is story 14-2.
- **Decision 7 (300-line limit, NFR5):** All new/modified files must stay under 300 lines.

### Implementation Guidance

#### Retro Section Parser

The existing `parseRetroActionItems()` in `retro-parser.ts` parses table-format action items (the `| # | Action | Status | Notes |` table). This story adds a NEW function `parseRetroSections()` that parses the **subsection-based** action items format used in the `## 6. Action Items` section.

Real retro files use varying header formats:
- `### Fix Now (Before Next Session)` or `#### Fix Now (Before Next Session)`
- `### Fix Soon (Next Sprint / Next Session)` or `### Fix Soon (Next Sprint)`
- `### Backlog (Track But Not Urgent)` or `### Backlog (Escalated Priority)` or `### Backlog (Carry Forward)`

Items under each subsection are bullet lists:
```markdown
### Fix Now (Before Next Session)
- Item one description here
- Item two description here

### Fix Soon (Next Sprint)
1. Another item here
2. Yet another item
```

The parser should match headers case-insensitively and strip parenthetical suffixes to classify into `fix-now`, `fix-soon`, or `backlog`.

#### TD Story Key Generation

Story keys follow the pattern `TD-{N}-{slug}` where:
- `N` is auto-incremented (scan existing TD-* keys, take max number + 1)
- `slug` is derived from the item text: lowercase, replace non-alphanumeric with hyphens, truncate to 40 chars, trim trailing hyphens

Example: "Fix bare catch blocks in registry.ts" → `TD-1-fix-bare-catch-blocks-in-registry-ts`

#### Deduplication

Normalize: lowercase, remove all punctuation (keep alphanumeric and spaces), split on whitespace.
Overlap = |intersection(a, b)| / min(|a|, |b|).
Using min rather than max prevents short items from being considered duplicates of unrelated long items.

#### Epic-TD in State

`epic-TD` is stored in `state.epics['epic-TD']` like any other epic. The key difference:
1. It is auto-created (not pre-defined in epics YAML)
2. Its status must NEVER be set to `done` — force `in-progress` in all paths
3. `generateSprintStatusYaml()` at line ~157 computes `const allDone = storyKeys.every(...)` — this must check `if (epicKey === 'TD') epicStatus = 'in-progress'` to override

TD stories are stored in `state.stories` alongside regular stories. The `TD-` prefix distinguishes them. The `parseStoryKey()` function returns `[Infinity, Infinity]` for non-numeric prefixes, so TD stories will sort after all numeric-prefixed stories in YAML output. This is acceptable.

#### Backlog File

`tech-debt-backlog.md` lives at project root. Append items with timestamp:
```markdown
## Backlog Items (auto-appended from retros)

- [2026-03-24] Item description here
```

If the file doesn't exist, create it with the header.

### Testing Guidance

- **Vitest** (not Jest). Use `vi.fn()`, `vi.mock()`, `vi.mocked()`.
- Imports: `import { describe, it, expect } from 'vitest'`
- Import convention: use `.js` extension for ESM resolution (e.g., `from '../retro-parser.js'`).
- Mock `writeFileSync` for backlog file append tests.
- Use fixture retro content strings — do NOT read real retro files in tests.
- Test deduplication with edge cases: exact match (100%), slight variation (85%), clearly different (30%), empty items.

### Previous Story Intelligence (13-3)

- Story 13-3 completed successfully. All tests passing.
- The `src/commands/run.ts` has been refactored to use the AgentDriver pattern.
- `src/lib/retro-parser.ts` currently has 123 lines — well within budget for extension.
- `src/modules/sprint/state.ts` currently has 525 lines — consider putting new TD functions in a separate file if they push it over 300 (it's already over). Recommendation: create `src/modules/sprint/td-state.ts` to keep functions isolated.

### Key Observations About Existing Code

1. **`generateSprintStatusYaml()`** (state.ts:122-169) computes epic status from stories at line 157. The epic-TD override must go here.
2. **`parseStoryKey()`** (state.ts:175-179) expects numeric prefixes — `TD-1-slug` will return `[Infinity, Infinity]`. This means TD stories will group under a single "Infinity" epic group in YAML. This needs a fix: add special-case handling for `TD-` prefix in `parseStoryKey()` or in `generateSprintStatusYaml()`.
3. **`state.ts` is already 525 lines** — over the 300-line limit. New functions MUST go in a new file (`src/modules/sprint/td-state.ts` or `src/lib/retro-to-sprint.ts`).
4. **The retro parser's existing `parseRetroActionItems()`** parses the table format, not the subsection format. These are two different sections of the retro file. The new parser is additive.

### Retro File Format Reference

From real retro files (e.g., `session-retro-2026-03-24.md`):
```markdown
## 6. Action Items

### Fix Now (Before Next Session)
- Fix bare catch blocks in registry.ts (line 73)
- Update init-project to persist multi-stacks

### Fix Soon (Next Sprint)
1. Add element type checking to isValidState()
2. Unit test recoverCorruptedState() recovery paths

### Backlog (Track But Not Urgent)
- Remove StackDetection type duplication (deferred to 10-5)
- Address pre-existing TS compilation errors in test files
```

### Project Structure After This Story

```
src/lib/
├── retro-parser.ts          # Extended with parseRetroSections(), normalizeText(), wordOverlap()
├── retro-to-sprint.ts       # NEW: processRetroActionItems() orchestrator
├── __tests__/
│   ├── retro-parser-sections.test.ts  # NEW: section parsing + dedup tests
│   └── retro-to-sprint.test.ts        # NEW: integration tests for TD story creation
src/modules/sprint/
├── state.ts                 # Modified: epic-TD override in generateSprintStatusYaml()
```

### References

- [Source: _bmad-output/planning-artifacts/epics-architecture-v3.md lines 313-331] — Story 14-1 epic definition
- [Source: _bmad-output/planning-artifacts/architecture-v3.md] — Decision 6 (Retro-to-Sprint Pipeline)
- [Source: src/lib/retro-parser.ts] — Existing retro parser (table format)
- [Source: src/modules/sprint/state.ts lines 122-169] — generateSprintStatusYaml() to modify
- [Source: src/modules/sprint/state.ts lines 175-179] — parseStoryKey() limitation with non-numeric prefixes

## Files to Change

- `src/lib/retro-parser.ts` — Add `parseRetroSections()`, `normalizeText()`, `wordOverlap()`, `isDuplicate()` functions
- `src/lib/retro-to-sprint.ts` — NEW: `processRetroActionItems()` orchestrator, slug generation, backlog file append
- `src/modules/sprint/state.ts` — Modify `generateSprintStatusYaml()` to force epic-TD status to in-progress; fix `parseStoryKey()` for TD- prefix
- `src/lib/__tests__/retro-parser-sections.test.ts` — NEW: Tests for section parsing and deduplication
- `src/lib/__tests__/retro-to-sprint.test.ts` — NEW: Tests for TD story creation orchestration

## Change Log

- 2026-03-24: Story created from epic definition with 3 ACs, expanded to 10 ACs with full task breakdown, verification tags, and dev notes. Status set to ready-for-dev.
- 2026-03-25: Adversarial code review. Fixed 3 HIGH issues (empty slug fallback, misleading backlogAppended when no projectRoot, wordOverlap >1.0 with duplicate words) and 1 MEDIUM issue (wordOverlap set-based dedup). Added 4 new tests. Status set to verifying.
