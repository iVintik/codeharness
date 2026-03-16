# Story 11.2: Retro Finding Classification & Beads Import

Status: verified

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want retro findings to automatically become beads issues,
so that action items don't get lost between sprints.

## Acceptance Criteria

1. **Given** `epic-N-retrospective.md` exists with an action items table, **when** the user runs `codeharness retro-import --epic N`, **then** each action item is parsed (number, description, target epic, owner) **and** each is classified as `project` | `harness` | `tool:<name>` based on content analysis. (AC:1)

2. **Given** action items are classified, **when** beads issues are created, **then** each has gap-id `[gap:retro:epic-N-item-M]` for dedup **and** type is `task` **and** priority derived from action item urgency **and** description includes the original retro context. (AC:2)

3. **Given** `retro-import` is run twice for the same epic, **when** issues with matching gap-ids already exist in beads, **then** no duplicate issues are created **and** CLI prints `[INFO] Skipping existing: {title}`. (AC:3)

4. **Given** the `--json` flag is passed, **when** the command completes, **then** output is JSON: `{"imported": N, "skipped": M, "issues": [...]}`. (AC:4)

## Tasks / Subtasks

- [x] Task 1: Create retro markdown parser (AC: 1)
  - [x] 1.1: Create `src/lib/retro-parser.ts` with `parseRetroActionItems(content: string): RetroActionItem[]`
  - [x] 1.2: Parse action items from markdown tables — support the format `| # | Action | Status | Notes |` seen in existing retros (e.g., `epic-9-retrospective.md` lines 106-112)
  - [x] 1.3: Extract fields: item number (A1, A2, ...), description, status, notes
  - [x] 1.4: Implement `classifyFinding(item: RetroActionItem): Classification` with heuristics:
    - Text contains "harness" or "codeharness" → `harness`
    - Text contains tool names ("showboat", "ralph", "beads", "bmad") → `tool:<name>`
    - Everything else → `project`
  - [x] 1.5: Export `RetroActionItem` and `Classification` types

- [x] Task 2: Create retro-import command (AC: 1, 2, 3, 4)
  - [x] 2.1: Create `src/commands/retro-import.ts` with `registerRetroImportCommand(program: Command)`
  - [x] 2.2: Add `--epic <N>` required option (number, validated ≥ 1)
  - [x] 2.3: Read `epic-N-retrospective.md` from `_bmad-output/implementation-artifacts/`
  - [x] 2.4: Parse action items via `parseRetroActionItems()`
  - [x] 2.5: For each item, call `createOrFindIssue()` from `src/lib/beads.ts` with:
    - title: action item description (truncated to reasonable length)
    - gapId: `[gap:retro:epic-N-item-M]` (use `buildGapId('retro', 'epic-N-item-M')`)
    - opts: `{ type: 'task', priority: derivePriority(item), description: retroContext }`
  - [x] 2.6: Track imported vs skipped counts
  - [x] 2.7: Print `[OK] Imported: {title}` for new issues, `[INFO] Skipping existing: {title}` for dupes
  - [x] 2.8: Support `--json` flag: output `{"imported": N, "skipped": M, "issues": [...]}`

- [x] Task 3: Register command in index.ts (AC: 1)
  - [x] 3.1: Add `import { registerRetroImportCommand } from './commands/retro-import.js'` to `src/index.ts`
  - [x] 3.2: Add `registerRetroImportCommand(program)` call after existing registrations

- [x] Task 4: Unit tests (AC: 1, 2, 3, 4)
  - [x] 4.1: Test `parseRetroActionItems()` with real retro table format (use epic-9 format as reference)
  - [x] 4.2: Test `parseRetroActionItems()` with empty/missing action items table
  - [x] 4.3: Test `classifyFinding()` for each classification category (harness, tool:showboat, tool:beads, project)
  - [x] 4.4: Test retro-import command: successful import (mock `createOrFindIssue` returning `created: true`)
  - [x] 4.5: Test retro-import command: dedup skipping (mock `createOrFindIssue` returning `created: false`)
  - [x] 4.6: Test retro-import command: `--json` output format
  - [x] 4.7: Test retro-import command: missing retro file (expects fail message)
  - [x] 4.8: Test retro-import command: invalid epic number (expects error)
  - [x] 4.9: Test gap-id format is `[gap:retro:epic-N-item-M]`

## Dev Notes

### Architecture Constraints

- **Architecture Decision 10** governs this story. Retro findings flow through beads (universal store). GitHub issue creation is Story 11.3 — do NOT implement it here.
- **Architecture Decision 3**: Beads is the universal issue store. All issue operations go through `src/lib/beads.ts`.
- **Architecture Decision 6**: All templates are TypeScript string literals in `src/templates/`.
- **Commander.js pattern**: All commands use `registerXxxCommand(program: Command)` pattern, registered in `src/index.ts`.

### Existing Code to Reuse

| Function | File | Purpose |
|----------|------|---------|
| `createOrFindIssue(title, gapId, opts)` | `src/lib/beads.ts:177` | Creates beads issue or finds existing by gap-id. Returns `{ issue, created }`. This is the core dedup mechanism. |
| `buildGapId(category, identifier)` | `src/lib/beads.ts:147` | Builds `[gap:category:identifier]` string. Use `buildGapId('retro', 'epic-N-item-M')`. |
| `findExistingByGapId(gapId, issues)` | `src/lib/beads.ts:155` | Scans issues array for matching gap-id. Used internally by `createOrFindIssue`. |
| `ok()`, `fail()`, `info()`, `jsonOutput()` | `src/lib/output.ts` | Standard CLI output helpers. All support `OutputOptions` with `json` flag. |
| `isValidStoryId()` pattern | `src/commands/verify.ts:24` | Input validation pattern — replicate for epic number validation. |

### Retro File Format (Real Example)

Action items table from `epic-9-retrospective.md` (lines 104-112):

```markdown
## Epic 8 Retro Action Item Status

| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Cover run.ts action handler (lines 110-276) | Not done | Permanent technical debt. |
| A2 | Raise scanner.ts branch coverage from 74.1% to 90%+ | Not done | Permanent technical debt. |
```

The parser must handle:
- Table header: `| # | Action | Status | Notes |`
- Separator row: `|---|--------|--------|-------|`
- Data rows: `| A1 | description | status | notes |`
- Item numbers may be `A1`, `A2`, etc. (alphanumeric prefix)

### Classification Heuristics

Priority derivation from retro context:
- Items marked "Regressed" or with urgency indicators → priority 1
- Items marked "Not done" with multiple carries → priority 2
- Default → priority 2

Classification rules (applied to action item description text):
1. Contains "harness" or "codeharness" (case-insensitive) → `harness`
2. Contains known tool names: "showboat", "ralph", "beads", "bmad" (case-insensitive) → `tool:<matched_name>`
3. Everything else → `project`

### Key File Locations

| File | Purpose |
|------|---------|
| `src/commands/retro-import.ts` | **NEW** — Commander.js command registration |
| `src/lib/retro-parser.ts` | **NEW** — Markdown parsing, action item extraction, classification |
| `src/lib/beads.ts` | `createOrFindIssue()`, `buildGapId()` — reuse, do NOT modify |
| `src/lib/output.ts` | `ok()`, `fail()`, `info()`, `jsonOutput()` — reuse |
| `src/index.ts` | Register new command — add import + `registerRetroImportCommand(program)` |
| `_bmad-output/implementation-artifacts/epic-*-retrospective.md` | Input files — retro markdown with action items |

### Anti-Patterns to Avoid

- Do NOT implement GitHub issue creation — that is Story 11.3.
- Do NOT modify `src/lib/beads.ts` — use `createOrFindIssue()` as-is.
- Do NOT parse YAML sprint-status.yaml in this story — no status updates needed.
- Do NOT use `yaml` library for retro parsing — it's markdown, parse with regex/string operations.
- Do NOT hardcode retro file paths — derive from `--epic N` argument: `_bmad-output/implementation-artifacts/epic-${N}-retrospective.md`.
- Do NOT create a separate classification module — keep `classifyFinding()` in `retro-parser.ts`.

### Previous Story Intelligence (11.1)

Story 11.1 established:
- `--retro` and `--epic` flags on `verify` command — similar flag pattern for `retro-import`
- Epic number validation: must be ≥ 1 (story 11.1 had a bug where epic 0 was accepted — fixed to `epicNum < 1`)
- `updateSprintStatus()` for YAML status updates (not needed here, but available for future stories)
- Sprint-planning retro patch reads retro files — the parser here must produce output compatible with that consumption

Code review findings from 11.1:
- Always wrap external calls (`bdCommand` etc.) in try/catch
- Validate all user inputs before use
- Keep test descriptions accurate to what they assert
- Use `as unknown as Type` for complex type assertions (TS2352)

### Project Structure Notes

- New commands follow the pattern in `src/commands/*.ts` — export `registerXxxCommand(program: Command)`
- New lib modules in `src/lib/*.ts` — pure functions, no side effects at module level
- Tests in `src/commands/__tests__/` and `src/lib/__tests__/` respectively
- Build: `tsup` ESM bundle. Imports use `.js` extension (e.g., `import { ... } from '../lib/retro-parser.js'`)
- Test framework: Vitest with `vi.mock()` for module mocking

### References

- [Source: _bmad-output/planning-artifacts/epics.md, Story 11.2 (lines 1644-1680)]
- [Source: _bmad-output/planning-artifacts/architecture.md, Decision 10 (GitHub Integration & Retro Issue Loop)]
- [Source: _bmad-output/planning-artifacts/architecture.md, Decision 3 (Beads as universal issue store)]
- [Source: src/lib/beads.ts (createOrFindIssue, buildGapId, findExistingByGapId)]
- [Source: src/lib/output.ts (ok, fail, info, jsonOutput)]
- [Source: src/index.ts (command registration pattern)]
- [Source: _bmad-output/implementation-artifacts/11-1-fix-retro-status-lifecycle.md (previous story learnings)]
- [Source: _bmad-output/implementation-artifacts/epic-9-retrospective.md (retro action item table format)]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [x] Showboat proof document created (`docs/exec-plans/active/11-2-retro-finding-classification-beads-import.proof.md`)
- [x] All acceptance criteria verified with real-world evidence
- [x] Test coverage meets target (retro-parser.ts 100%/100%/100%/100%, retro-import.ts 100%/96%/100%/100%)

## Documentation Requirements

- [x] Relevant AGENTS.md files updated (src/lib/AGENTS.md, src/commands/AGENTS.md)
- [x] Exec-plan created in `docs/exec-plans/active/11-2-retro-finding-classification-beads-import.md`

## Testing Requirements

- [x] Unit tests written for all new/changed code (42 tests total)
- [x] Integration tests for cross-module interactions
- [x] Coverage target: met (overall 94.91%, all 41 files above 80% floor)
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

No debug issues encountered. All tests passed on first run after fixing the CLI registration count test.

### Completion Notes List

- Created `src/lib/retro-parser.ts` with `parseRetroActionItems()`, `classifyFinding()`, `derivePriority()` and associated types
- Created `src/commands/retro-import.ts` with `registerRetroImportCommand()` following Commander.js pattern
- Registered command in `src/index.ts`
- 22 unit tests for retro-parser (parsing, classification, priority derivation)
- 20 command tests for retro-import (import, dedup, JSON output, error handling, validation)
- Updated CLI test to expect 14 commands (was 13)
- Updated AGENTS.md files for src/lib/ and src/commands/
- All 1292 tests pass, zero regressions
- Coverage: retro-parser.ts 100%/100%/100%/100%, retro-import.ts 100%/96%/100%/100%

### Change Log

- 2026-03-15: Implemented Story 11.2 — retro finding classification and beads import
- 2026-03-15: Code review fixes — fixed silent error swallowing in JSON mode, removed dead `headerFound` variable, added 4 test cases

### File List

- src/lib/retro-parser.ts (NEW)
- src/commands/retro-import.ts (NEW)
- src/lib/__tests__/retro-parser.test.ts (NEW)
- src/commands/__tests__/retro-import.test.ts (NEW)
- src/index.ts (MODIFIED — added retro-import registration)
- src/__tests__/cli.test.ts (MODIFIED — updated command count from 13 to 14)
- src/lib/AGENTS.md (MODIFIED — added retro-parser entry)
- src/commands/AGENTS.md (MODIFIED — added retro-import entry)
- docs/exec-plans/active/11-2-retro-finding-classification-beads-import.md (NEW — exec plan)
- docs/exec-plans/active/11-2-retro-finding-classification-beads-import.proof.md (NEW — proof doc)

## Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.6 (1M context) on 2026-03-15

### Findings

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | HIGH | Silent error swallowing: `createOrFindIssue` errors dropped in JSON mode (catch block only logged when `!isJson`) | Fixed: now calls `fail()` with `{ json: isJson }` in all modes |
| 2 | HIGH | `retro-parser.ts` branch coverage 96.96% — `cells.length < 4` branch untested | Fixed: added test for rows with fewer than 4 columns |
| 3 | MEDIUM | Dead code: `headerFound` variable always true when `inTable` is true | Fixed: removed redundant variable |
| 4 | MEDIUM | Missing Showboat proof document | Fixed: created `docs/exec-plans/active/11-2-retro-finding-classification-beads-import.proof.md` |
| 5 | MEDIUM | Missing exec-plan document | Fixed: created `docs/exec-plans/active/11-2-retro-finding-classification-beads-import.md` |
| 6 | MEDIUM | Insufficient test coverage for error paths — no tests for JSON-mode errors, non-Error exceptions, or readFileSync failures | Fixed: added 4 new test cases |
| 7 | LOW | `retro-import.ts` line 61 ternary `String(err)` branch unreachable in practice (Node.js `readFileSync` always throws Error instances) | Accepted: defensive coding, 96.15% branch coverage exceeds 80% floor |

**Outcome:** All HIGH and MEDIUM issues fixed. 42 tests pass, 1292 total tests pass, overall coverage 94.91%, all files above 80% floor.
