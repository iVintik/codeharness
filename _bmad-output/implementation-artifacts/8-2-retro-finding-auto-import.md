# Story 8.2: Retro Finding Auto-Import

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want retro findings tagged as actionable (Fix Now / Fix Soon) to be automatically added to `.codeharness/issues.yaml`,
so that action items from retrospectives don't rot in markdown and instead enter the issue tracker for scheduled execution.

## Acceptance Criteria

1. **Given** a retrospective file with a `## 6. Action Items` section containing `### Fix Now` and `### Fix Soon` subsections with bullet items
   **When** `codeharness retro-import --epic <n>` runs
   **Then** each Fix Now and Fix Soon item is added to `.codeharness/issues.yaml` via the issue tracker module with `source: "retro-epic-<n>"`, `status: backlog`
   **And** Fix Now items get `priority: high`
   **And** Fix Soon items get `priority: medium`
   <!-- verification: runtime-provable -->

2. **Given** a retrospective file with a `### Backlog` subsection under Action Items
   **When** `codeharness retro-import --epic <n>` runs
   **Then** Backlog items are NOT added to `.codeharness/issues.yaml`
   **And** they are still logged to console as skipped (non-actionable)
   <!-- verification: runtime-provable -->

3. **Given** `.codeharness/issues.yaml` already contains an issue with title matching a retro action item (word overlap >= 0.8)
   **When** `codeharness retro-import --epic <n>` runs with a duplicate item
   **Then** the duplicate item is skipped with an informational message
   **And** the existing issue is not modified
   <!-- verification: test-provable -->

4. **Given** no `.codeharness/issues.yaml` exists
   **When** `codeharness retro-import --epic <n>` runs with actionable items
   **Then** `.codeharness/issues.yaml` is created with the imported issues
   <!-- verification: runtime-provable -->

5. **Given** a retrospective file with no `## 6. Action Items` section (table-only format with `| # | Action | Status | Notes |`)
   **When** `codeharness retro-import --epic <n>` runs
   **Then** items from the table are still parsed and imported using the existing `parseRetroActionItems` parser
   **And** priority is derived from status/notes fields via `derivePriority` (regressed/urgent/critical -> high, default -> medium)
   <!-- verification: test-provable -->

6. **Given** `codeharness retro-import --epic <n> --json` runs
   **When** the import completes
   **Then** JSON output includes `imported` count, `skipped` count, `duplicates` count, and an `issues` array with each imported issue's `id`, `title`, `source`, `priority`
   <!-- verification: runtime-provable -->

7. **Given** the retro file does not exist
   **When** `codeharness retro-import --epic <n>` runs
   **Then** it prints an error message and exits with code 1
   <!-- verification: test-provable -->

8. **Given** the retro file has no action items (empty table and no subsections)
   **When** `codeharness retro-import --epic <n>` runs
   **Then** it prints "No action items found in retro file" and exits with code 0
   <!-- verification: test-provable -->

9. **Given** `npm run build` is executed
   **When** the build completes
   **Then** it succeeds with zero errors
   **And** `npm run test:unit` passes with no regressions in existing test suites
   <!-- verification: test-provable -->

10. **Given** unit tests for the retro-import changes
    **When** `npm run test:unit` is executed
    **Then** tests pass at 80%+ coverage for modified code covering: section-based import, table-based import, duplicate detection, priority mapping, JSON output, error handling
    <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Update `src/commands/retro-import.ts` to import actionable findings into issues.yaml (AC: #1, #2, #4, #5, #6, #7, #8)
  - [x] Import `createIssue`, `readIssues` from `../lib/issue-tracker.js`
  - [x] Import `parseRetroSections`, `isDuplicate` from `../lib/retro-parser.js`
  - [x] After parsing action items, attempt section-based parsing via `parseRetroSections(content)`
  - [x] If section-based items found (Fix Now / Fix Soon): import those into issues.yaml
  - [x] If only table-based items found: import those using `derivePriority` for priority mapping
  - [x] Map Fix Now -> `priority: high`, Fix Soon -> `priority: medium`
  - [x] Map table-based priorities: `derivePriority` returns 1 -> `high`, 2 -> `medium`
  - [x] Set `source: "retro-epic-<n>"` on all imported issues
  - [x] Skip Backlog items (log as non-actionable)
  - [x] Remove or replace the `TODO: v2 issue tracker (Epic 8)` comment at line 89
  - [x] Replace the dead-code `imported = 0` / `skipped = 0` block with actual import logic
  - [x] Update JSON output to include `imported`, `skipped`, `duplicates` counts and `issues` array

- [x] Task 2: Add duplicate detection before import (AC: #3)
  - [x] Before creating each issue, read existing issue titles from `readIssues()`
  - [x] Use `isDuplicate(itemTitle, existingTitles)` from `retro-parser.ts` with 0.8 threshold
  - [x] If duplicate detected, skip and increment `duplicates` counter, log match info

- [x] Task 3: Update `src/commands/__tests__/retro-import.test.ts` (AC: #9, #10)
  - [x] Add mock for `../lib/issue-tracker.js` (`createIssue`, `readIssues`)
  - [x] Test: section-based retro with Fix Now items creates issues with priority=high
  - [x] Test: section-based retro with Fix Soon items creates issues with priority=medium
  - [x] Test: Backlog items are skipped (not imported)
  - [x] Test: table-based retro (no subsections) falls back to table parser + derivePriority
  - [x] Test: duplicate detection skips matching items
  - [x] Test: no issues.yaml creates new file via createIssue
  - [x] Test: JSON output includes imported/skipped/duplicates counts
  - [x] Test: missing retro file → error with exit code 1
  - [x] Test: empty retro file → info message, exit code 0

- [x] Task 4: Verify build and all tests pass (AC: #9)
  - [x] Run `npm run build` — zero errors
  - [x] Run `npm run test:unit` — no regressions

## Dev Notes

### Architecture Context

This story wires together three existing modules:

1. **`retro-parser.ts`** — already has both parsers:
   - `parseRetroActionItems(content)` — table format (`| # | Action | Status | Notes |`)
   - `parseRetroSections(content)` — subsection format (`## 6. Action Items` → `### Fix Now` / `### Fix Soon` / `### Backlog`)
   - `isDuplicate(newItem, existingTitles, threshold=0.8)` — word-overlap deduplication
   - `derivePriority(item)` — maps status/notes to priority number (1 or 2)

2. **`issue-tracker.ts`** (from story 8.1) — CRUD for `.codeharness/issues.yaml`:
   - `createIssue(title, { priority, source }, dir)` — creates and persists
   - `readIssues(dir)` — returns `{ issues: Issue[] }`
   - Valid priorities: `low`, `medium`, `high`, `critical`

3. **`retro-import.ts`** (existing command) — currently:
   - Parses retro table format only
   - Creates GitHub issues via `gh` CLI
   - Has a `TODO: v2 issue tracker (Epic 8)` placeholder (line 89)
   - Does NOT write to issues.yaml — this story adds that

### Retro File Formats

Two formats exist across retro files:

**Table format** (older retros like epic-7):
```markdown
## Action Items

| # | Action | Priority | Notes |
|---|--------|----------|-------|
| A1 | Fix X | Medium | Carried from epic 6 |
```

**Subsection format** (newer retros):
```markdown
## 6. Action Items

### Fix Now (Before Next Session)
- Fix bare catch blocks in registry.ts

### Fix Soon (Next Sprint)
1. Add element type checking to isValidState()

### Backlog (Track But Not Urgent)
- Remove StackDetection type duplication
```

The command must handle BOTH formats. Strategy:
1. Try `parseRetroSections(content)` first
2. If it returns items, use those (Fix Now -> high, Fix Soon -> medium, skip Backlog)
3. If no section items found, fall back to `parseRetroActionItems(content)` + `derivePriority()`

### Priority Mapping

| Retro Source | Issue Priority |
|-------------|---------------|
| Fix Now subsection | `high` |
| Fix Soon subsection | `medium` |
| Backlog subsection | NOT imported |
| Table: derivePriority returns 1 | `high` |
| Table: derivePriority returns 2 | `medium` |

### Duplicate Detection

Use `isDuplicate()` from `retro-parser.ts` which computes word overlap. Before calling `createIssue()`, read all existing issue titles and check each new item. Threshold is 0.8 (80% word overlap = duplicate).

### Source Tag Format

All imported issues get `source: "retro-epic-<n>"` where `<n>` is the epic number from `--epic`. This matches the convention in the architecture doc (AD6): `source: retro-epic-15`.

### GitHub Issue Phase

The existing GitHub issue creation phase stays intact. The local issues.yaml import happens BEFORE the GitHub phase. Both paths run independently — local import failures should not block GitHub creation and vice versa.

### CLI Pattern

Follow the existing command pattern in `retro-import.ts`:
- Use `ok()`, `fail()`, `info()`, `warn()` from `src/lib/output.ts`
- Support `--json` global flag via `cmd.optsWithGlobals()`
- Set `process.exitCode = 1` on errors (do NOT call `process.exit()`)

### File Changes

- **Modified:** `src/commands/retro-import.ts` — add issues.yaml import logic (~40-60 lines added)
- **Modified:** `src/commands/__tests__/retro-import.test.ts` — add tests for import path (~100-150 lines added)
- **No new files** — all required modules already exist
- **No new npm dependencies** — uses existing `yaml`, `retro-parser`, `issue-tracker`

### Anti-Patterns to Avoid

- **Do NOT modify `retro-parser.ts`** — both parsers already work correctly
- **Do NOT modify `issue-tracker.ts`** — the createIssue API already handles everything needed
- **Do NOT remove the GitHub issue phase** — it runs independently of local import
- **Do NOT use `retro-to-sprint.ts`** — that module creates TD-* stories in sprint-state.json, which is a different system. This story uses the issues.yaml tracker from story 8.1
- **Do NOT use `process.exit()`** — set `process.exitCode` instead
- **Do NOT use `any`** in the API surface — explicit TypeScript types per NFR18

### Previous Story Intelligence

From story 8.1 (issue tracker module):
- `createIssue(title, { priority, source })` validates priority against `VALID_PRIORITIES` set
- Valid priorities are: `low`, `medium`, `high`, `critical` — map retro priorities accordingly
- `createIssue` auto-generates sequential IDs (`issue-NNN`)
- `readIssues()` returns `{ issues: [] }` if file doesn't exist
- Issues are stored at `.codeharness/issues.yaml` relative to cwd

From existing `retro-import.ts`:
- Line 89: `// TODO: v2 issue tracker (Epic 8)` — this is the placeholder for this story
- Lines 90-92: `imported = 0`, `skipped = 0`, `issues: ImportedIssue[] = []` — dead code to replace
- The command already handles retro file discovery, parsing, and error handling
- GitHub phase (lines 121-132) should remain untouched

### Git Intelligence

Recent commits follow: `feat: story {key} — {description}`. The latest commit `f3f552e` implemented story 8.1. This story modifies one existing command file and its tests — no new files needed.

### References

- [Source: _bmad-output/planning-artifacts/epics-v2.md#Story 8.2: Retro Finding Auto-Import]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#AD6: Issue Tracking (Beads Replacement)]
- [Source: src/commands/retro-import.ts — TODO at line 89, GitHub phase at lines 121-132]
- [Source: src/lib/retro-parser.ts — parseRetroSections(), parseRetroActionItems(), isDuplicate(), derivePriority()]
- [Source: src/lib/issue-tracker.ts — createIssue(), readIssues(), VALID_PRIORITIES]
- [Source: src/lib/output.ts — ok(), fail(), info(), warn(), jsonOutput()]
- [Source: _bmad-output/implementation-artifacts/epic-7-retrospective.md — table-format example]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/8-2-retro-finding-auto-import-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/8-2-retro-finding-auto-import.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None.

### Completion Notes List

- Added `importToIssuesYaml()` function to `retro-import.ts` that handles both section-based and table-based retro formats
- Section-based: Fix Now -> high, Fix Soon -> medium, Backlog -> skipped
- Table-based fallback: uses `derivePriority()` (1 -> high, 2 -> medium)
- Duplicate detection via `isDuplicate()` with 0.8 word overlap threshold
- All issues get `source: "retro-epic-<n>"` and `status: backlog`
- GitHub phase remains untouched and independent
- 33 tests passing (up from 22), all 4172 unit tests pass, build clean

### File List

- `src/commands/retro-import.ts` — added local issues.yaml import logic (~90 lines added)
- `src/commands/__tests__/retro-import.test.ts` — added 11 new test cases covering section-based import, table-based fallback, duplicate detection, JSON output, error handling
