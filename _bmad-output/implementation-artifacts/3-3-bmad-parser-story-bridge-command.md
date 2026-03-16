# Story 3.3: BMAD Parser & Story Bridge Command

Status: ready-for-dev

## Story

As a developer,
I want to run `codeharness bridge --epics epics.md` to convert BMAD stories into beads tasks,
So that the autonomous loop can pick up stories from a unified task store.

## Acceptance Criteria

1. **Given** a developer runs `codeharness bridge --epics _bmad-output/planning-artifacts/epics.md`, **When** the bridge parses the epics file, **Then** all epics and stories are extracted from the markdown structure, story titles, user stories, and acceptance criteria are parsed, and bridge prints per-epic summary: `[OK] Epic 1: <title> — <N> stories`.

2. **Given** parsed stories, **When** the bridge imports them into beads, **Then** each story is created via `bd create` with `type=story`, priority is set from sprint order (first story = highest priority), description contains the path to the story file, dependencies between stories are set based on epic order, and bridge prints `[OK] Bridge: <N> stories imported into beads`.

3. **Given** a 50-story epic file, **When** `codeharness bridge` processes it, **Then** parsing and import completes in under 10 seconds (NFR7).

4. **Given** `codeharness bridge --dry-run` is used, **When** the bridge parses stories, **Then** it prints what would be imported without actually calling `bd create`, and exits with code 0.

5. **Given** `codeharness bridge` is run a second time on the same epics file, **When** existing beads issues match imported stories, **Then** duplicates are not created, and bridge prints `[INFO] Story already exists in beads: <title>`.

6. **Given** the two-layer model, **When** a story is imported, **Then** beads issue holds: status, priority, dependencies, path to story file, **And** story file holds: ACs, dev notes, tasks/subtasks, verification requirements, **And** bridge creates the link: beads description → story file path.

7. **Given** `codeharness bridge --json`, **When** bridge completes, **Then** JSON output includes array of imported stories with beads IDs and story file paths.

8. **Given** an epics file with no parseable stories, **When** `codeharness bridge --epics empty.md` runs, **Then** bridge prints `[WARN] No stories found in <path>` and exits with code 0.

9. **Given** a story in the epics file has no acceptance criteria, **When** the bridge parses it, **Then** the story is still imported with a warning: `[WARN] Story <title>: no acceptance criteria found`.

10. **Given** `codeharness bridge` is run without `--epics`, **When** the command is invoked, **Then** it prints `[FAIL] Missing required option: --epics <path>` and exits with code 2.

## Tasks / Subtasks

- [ ] Task 1: Implement BMAD epics/stories parser in `src/lib/bmad.ts` (AC: #1, #8, #9)
  - [ ] 1.1: Define `ParsedEpic` interface: `{ number: number, title: string, stories: ParsedStory[] }`
  - [ ] 1.2: Define `ParsedStory` interface: `{ epicNumber: number, storyNumber: number, key: string, title: string, userStory: string, acceptanceCriteria: string[], technicalNotes: string | null }`
  - [ ] 1.3: Implement `parseEpicsFile(filePath: string): ParsedEpic[]` — reads the epics markdown file and extracts epic headers (`### Epic N:` or `## Epic N:`), story headers (`### Story N.M:`), user stories (the "As a..., I want..., So that..." block), and acceptance criteria (`**Given**/**When**/**Then**` blocks or bulleted AC lists)
  - [ ] 1.4: Handle edge cases: empty file (return []), no stories found (return []), stories without ACs (include with empty criteria array)
  - [ ] 1.5: Implement `getStoryFilePath(storyKey: string): string` — returns the conventional path `_bmad-output/implementation-artifacts/<story-key>.md` for linking in beads description

- [ ] Task 2: Implement bridge import logic in `src/lib/bmad.ts` (AC: #2, #5, #6)
  - [ ] 2.1: Define `BridgeImportResult` interface: `{ storyKey: string, title: string, beadsId: string | null, status: 'created' | 'exists' | 'skipped' | 'failed', storyFilePath: string, error?: string }`
  - [ ] 2.2: Implement `importStoriesToBeads(stories: ParsedStory[], opts: { dryRun?: boolean }): BridgeImportResult[]` — for each story: check if a beads issue with matching title already exists (via `listIssues()` and title comparison), if exists skip with status `'exists'`, if not call `createIssue()` with type=story, priority from story order (first = 1), and description set to the story file path. Set deps from previous story in the same epic.
  - [ ] 2.3: Handle deduplication — compare story titles against existing beads issues. Use normalized title matching (trim whitespace, case-insensitive).
  - [ ] 2.4: Handle `dryRun` mode — skip `createIssue()` call, return results with `beadsId: null` and `status: 'skipped'`

- [ ] Task 3: Implement the bridge command in `src/commands/bridge.ts` (AC: #1, #2, #4, #7, #10)
  - [ ] 3.1: Replace the stub implementation with a full Commander.js command accepting `--epics <path>` (required), `--dry-run` (optional boolean), and global `--json` flag
  - [ ] 3.2: Validate `--epics` is provided — if missing, print `[FAIL] Missing required option: --epics <path>` and exit with code 2
  - [ ] 3.3: Validate the epics file exists — if not found, print `[FAIL] Epics file not found: <path>` and exit with code 1
  - [ ] 3.4: Call `parseEpicsFile()` to extract stories, then `importStoriesToBeads()` to create beads issues
  - [ ] 3.5: Print per-epic summary: `[OK] Epic <N>: <title> — <count> stories`
  - [ ] 3.6: Print final summary: `[OK] Bridge: <N> stories imported into beads` (or `[INFO] Bridge: <N> stories processed (<M> new, <K> existing)`)
  - [ ] 3.7: For `--dry-run`, print what would be imported with `[INFO] Dry run:` prefix, do not call beads
  - [ ] 3.8: For `--json`, output a `BridgeResult` JSON object: `{ status: 'ok' | 'fail', epics_parsed: number, stories_processed: number, stories_created: number, stories_existing: number, results: BridgeImportResult[] }`

- [ ] Task 4: Write unit tests for BMAD parser (AC: #1, #3, #8, #9)
  - [ ] 4.1: Create `src/lib/__tests__/bmad-parser.test.ts` (or extend existing `bmad.test.ts`)
  - [ ] 4.2: Create test fixture: sample epics markdown file in `test/fixtures/sample-epics.md` with 2-3 epics and 4-6 stories
  - [ ] 4.3: Test `parseEpicsFile()` — correctly extracts epic titles and story count
  - [ ] 4.4: Test `parseEpicsFile()` — correctly extracts story titles, user stories, and acceptance criteria
  - [ ] 4.5: Test `parseEpicsFile()` — handles empty file (returns empty array)
  - [ ] 4.6: Test `parseEpicsFile()` — handles file with no stories (returns epics with empty stories arrays)
  - [ ] 4.7: Test `parseEpicsFile()` — handles stories without acceptance criteria (includes them with empty criteria)
  - [ ] 4.8: Test `parseEpicsFile()` against the actual `_bmad-output/planning-artifacts/epics.md` file — verify it correctly parses all 7 epics and their stories
  - [ ] 4.9: Test `getStoryFilePath()` — returns correct conventional path

- [ ] Task 5: Write unit tests for bridge import logic (AC: #2, #4, #5)
  - [ ] 5.1: Create `src/lib/__tests__/bmad-bridge.test.ts` (or extend existing test file)
  - [ ] 5.2: Mock `beads.ts` functions: `createIssue`, `listIssues`
  - [ ] 5.3: Test `importStoriesToBeads()` — creates beads issues with correct args (type=story, priority, description=path)
  - [ ] 5.4: Test `importStoriesToBeads()` — sets dependencies from previous story in same epic
  - [ ] 5.5: Test `importStoriesToBeads()` — deduplication: skips existing stories with status `'exists'`
  - [ ] 5.6: Test `importStoriesToBeads()` — dry run mode: returns results without calling `createIssue()`
  - [ ] 5.7: Test `importStoriesToBeads()` — handles `createIssue()` failure gracefully (status `'failed'`, continues with remaining stories)

- [ ] Task 6: Write unit tests for bridge command (AC: #1, #7, #10)
  - [ ] 6.1: Create `src/commands/__tests__/bridge.test.ts`
  - [ ] 6.2: Test bridge command fails with code 2 when `--epics` not provided
  - [ ] 6.3: Test bridge command fails with code 1 when epics file doesn't exist
  - [ ] 6.4: Test bridge command prints per-epic summary and total imported count
  - [ ] 6.5: Test bridge command `--dry-run` mode prints without creating beads issues
  - [ ] 6.6: Test bridge command `--json` outputs valid JSON with expected structure
  - [ ] 6.7: Test bridge command handles empty epics file gracefully

- [ ] Task 7: Build and verify (AC: #3, #7)
  - [ ] 7.1: Run `npm run build` — verify tsup compiles successfully with updated bridge.ts and bmad.ts
  - [ ] 7.2: Run `npm run test:unit` — all tests pass including new parser and bridge tests
  - [ ] 7.3: Run `npm run test:coverage` — verify 100% coverage for new parser/bridge code, maintain overall coverage
  - [ ] 7.4: Manual test: `codeharness bridge --epics _bmad-output/planning-artifacts/epics.md --dry-run` — verify parsing output against actual epics file
  - [ ] 7.5: Manual test: `codeharness bridge --json --epics <path> --dry-run` — verify JSON output structure
  - [ ] 7.6: Manual test: `codeharness bridge` without `--epics` — verify error message and exit code 2

## Dev Notes

### This Story Implements the BMAD Parser and Bridge Command

Story 3.1 created the beads CLI wrapper (`src/lib/beads.ts`). Story 3.2 created the BMAD installation and patch engine (`src/lib/bmad.ts`, `src/lib/patch-engine.ts`, `src/templates/bmad-patches.ts`). This story extends `src/lib/bmad.ts` with BMAD epics/stories parsing and implements the `codeharness bridge` command that was previously a stub in `src/commands/bridge.ts`.

### What Already Exists (from Epics 1-3.2)

- `src/commands/bridge.ts` — 13-line stub that prints `[FAIL] Not yet implemented. Coming in Epic 3.` and exits with code 1. Replace entirely.
- `src/lib/bmad.ts` — ~230 lines. Contains: `BmadError`, `BmadInstallResult`, `PatchResult`, `PATCH_TARGETS`, `isBmadInstalled()`, `detectBmadVersion()`, `detectBmalph()`, `installBmad()`, `applyAllPatches()`. This story adds parsing functions to this module.
- `src/lib/beads.ts` — Full beads CLI wrapper: `createIssue()`, `getReady()`, `closeIssue()`, `updateIssue()`, `listIssues()`, `initBeads()`, etc. The bridge command uses `createIssue()` and `listIssues()` from this module.
- `src/lib/output.ts` — `ok()`, `fail()`, `warn()`, `info()`, `jsonOutput()` utilities.
- `src/commands/init.ts` — ~515 lines. The bridge command is independent of init — it runs after init has already set up BMAD and beads.
- `_bmad-output/planning-artifacts/epics.md` — The actual epics file this parser needs to handle. Contains 8 epics (Epic 0 through Epic 7) with stories using `### Story N.M:` headers, `**Given**/**When**/**Then**` acceptance criteria format, and `**Technical notes:**` blocks.

### Architecture Decisions That Apply

- **Decision 3 (Beads Integration):** Bridge is the entry point for the two-layer model. Beads holds status/priority/deps/path. Story files hold ACs/dev notes/tasks. Bridge creates the link via beads issue description → story file path.
- **Decision 1 (CLI ↔ Plugin Boundary):** Bridge is CLI-only. The plugin does not parse epics or create beads issues directly.
- **Beads Interaction Patterns:** Always use `--json` flag when calling `bd` programmatically. Error messages include the failed command.

### BMAD Epics File Format

The parser must handle the actual format of `_bmad-output/planning-artifacts/epics.md`:

```markdown
## Epic N: Title

Description paragraph...

### Story N.M: Story Title

As a <persona>,
I want <capability>,
So that <benefit>.

**Acceptance Criteria:**

**Given** <precondition>
**When** <action>
**Then** <outcome>
**And** <additional outcome>

**Given** <another precondition>
**When** <action>
**Then** <outcome>

**Technical notes:**
- Note 1
- Note 2
```

Key parsing considerations:
- Epic headers use `## Epic N:` or `### Epic N:` format
- Story headers use `### Story N.M:` format
- User stories follow the "As a/I want/So that" pattern
- Acceptance criteria use `**Given**/**When**/**Then**` blocks (may have multiple blocks per story)
- Some stories have a `**Technical notes:**` section
- Epic 0 exists (sprint execution skill) — include it in parsing

### Deduplication Strategy

When bridge is run a second time, it must not create duplicate beads issues. Strategy:
1. Before importing, call `listIssues()` to get all existing beads issues
2. For each story to import, check if a beads issue with a matching title exists (case-insensitive, trimmed)
3. If match found → skip with `[INFO] Story already exists in beads: <title>`
4. If no match → create new issue

This is simple title-based matching. Not perfect, but sufficient for the common case (re-running bridge on the same file). More sophisticated matching (by story key or ID) can be added later if needed.

### Bridge Command Options

```
codeharness bridge --epics <path>          # Required: path to epics.md
codeharness bridge --epics <path> --dry-run  # Parse only, don't create beads issues
codeharness bridge --json --epics <path>     # JSON output
```

The `--epics` option is required. If omitted, print error and exit 2. The epics file must exist; if not found, exit 1.

### Priority Assignment

Stories are assigned priority from their order in the epics file:
- Epic 0, Story 0.1 → priority 1 (highest)
- Epic 1, Story 1.1 → priority 2
- Epic 1, Story 1.2 → priority 3
- etc.

This gives beads a natural ordering that matches the BMAD sprint plan.

### Dependency Assignment

Within each epic, stories depend on the previous story:
- Story 1.1 → no deps
- Story 1.2 → depends on Story 1.1
- Story 1.3 → depends on Story 1.2
- Story 2.1 → no deps (new epic, no cross-epic deps in automatic mode)

Cross-epic dependencies are not automatically set. They can be added manually via `bd update` if needed.

### What NOT To Do

- **Do NOT implement beads-to-story sync** — that's Story 3.4.
- **Do NOT implement sprint-status.yaml updating** — bridge creates beads issues, not sprint-status.yaml entries.
- **Do NOT modify init.ts** — bridge is a standalone command, not an init step.
- **Do NOT modify beads.ts** — use the existing wrapper API as-is.
- **Do NOT use `console.log` directly** — use output utilities from `src/lib/output.ts`.
- **Do NOT add `any` types** — strict TypeScript.
- **Do NOT create the story files** — bridge only creates beads issues that link to story file paths. The story files themselves are created by the BMAD create-story workflow.

### Scope Boundaries

**IN SCOPE (this story):**
- BMAD epics/stories markdown parser (added to `src/lib/bmad.ts`)
- Bridge import logic with deduplication (added to `src/lib/bmad.ts`)
- Full `codeharness bridge` command implementation (`src/commands/bridge.ts`)
- Unit tests for parser, import logic, and command
- Test fixture: sample epics markdown file

**OUT OF SCOPE (later stories):**
- Beads-to-story file bidirectional sync — Story 3.4
- Sprint-status.yaml management — handled by sprint execution skill
- Story file creation — BMAD create-story workflow
- Verification pipeline — Epic 4
- Ralph integration — Epic 5

### Dependencies

- **Depends on:** Story 3.1 (beads CLI wrapper — `createIssue`, `listIssues`) — DONE. Story 3.2 (BMAD installation — `src/lib/bmad.ts` module exists) — DONE.
- **Depended on by:** Story 3.4 (beads sync uses the links created by bridge)

### New npm Dependencies

None. The parser uses Node.js built-ins (`fs`, `path`). Beads interaction uses the existing `src/lib/beads.ts` wrapper.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 3, Story 3.3]
- [Source: _bmad-output/planning-artifacts/architecture.md — Decision 3 (Beads Integration), Bridge Flow, Beads Interaction Patterns]
- [Source: _bmad-output/planning-artifacts/prd.md — FR33, FR40, FR41, NFR7]
- [Source: src/lib/beads.ts — createIssue(), listIssues() API]
- [Source: src/lib/bmad.ts — Existing module to extend with parser]
- [Source: src/commands/bridge.ts — Existing stub to replace]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/3-3-bmad-parser-story-bridge-command.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100% of all new code in src/)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (src/lib module — bmad.ts parser additions, src/commands — bridge.ts)
- [ ] Exec-plan created in `docs/exec-plans/active/3-3-bmad-parser-story-bridge-command.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
