# Story 4.4: Documentation Health & Freshness Enforcement

Status: ready-for-dev

## Story

> **Sprint skill integration:** Implement doc freshness check as an enhancement to the sprint execution skill. The skill verifies AGENTS.md and exec-plans are current before marking a story `done`. Gate is added to the skill's story-completion flow.

As a developer,
I want the harness to enforce documentation freshness during verification,
So that documentation stays current with the code it describes.

## Acceptance Criteria

1. **Given** the doc-gardener agent or `src/lib/doc-health.ts` scans for stale documentation, **When** the scan runs, **Then** all AGENTS.md files, exec-plans, and docs/ content are checked for staleness, **And** a quality grade is produced per document (fresh/stale/missing), **And** scan completes within 60 seconds (NFR23).

2. **Given** a story modifies code in a module, **When** verification runs for that story, **Then** the AGENTS.md for the changed module is checked for freshness, **And** if AGENTS.md doesn't reflect current code, verification prints `[FAIL] AGENTS.md stale for module: <name>`, **And** the story cannot be marked verified until AGENTS.md is updated.

3. **Given** an active story is being implemented, **When** the exec-plan system is used, **Then** `docs/exec-plans/<story-id>.md` is generated for the active story, **And** upon verification passing, the exec-plan is moved to `docs/exec-plans/completed/`.

4. **Given** generated documentation in `docs/generated/` or `docs/quality/`, **When** the files are created or updated, **Then** they include `DO NOT EDIT MANUALLY` headers (NFR26).

5. **Given** `docs/index.md` references BMAD artifacts, **When** the index is generated or updated, **Then** references use relative paths — content is never copied into the index (NFR25).

## Tasks / Subtasks

- [ ] Task 1: Create `src/lib/doc-health.ts` — documentation freshness scanner (AC: #1, #2)
  - [ ] 1.1: Define `DocHealthResult` interface: `{ path: string, grade: 'fresh' | 'stale' | 'missing', lastModified: Date | null, codeLastModified: Date | null, reason: string }`. Each scanned document gets a grade. `reason` explains why a document is stale/missing (e.g., "module src/lib/ modified after AGENTS.md last update").
  - [ ] 1.2: Define `DocHealthReport` interface: `{ documents: DocHealthResult[], summary: { fresh: number, stale: number, missing: number, total: number }, passed: boolean, scanDurationMs: number }`. `passed` is true only when `stale === 0 && missing === 0`.
  - [ ] 1.3: Implement `scanDocHealth(dir?: string): DocHealthReport` — the main scan function. Scans: (1) root `AGENTS.md`, (2) any per-module `AGENTS.md` files if they exist (in subdirectories that qualify as modules per NFR27 — minimum 3 files threshold), (3) `docs/index.md`, (4) files in `docs/exec-plans/active/`, (5) files in `docs/quality/` and `docs/generated/` for `DO NOT EDIT MANUALLY` headers. Returns the full report. Must complete within 60 seconds (NFR23).
  - [ ] 1.4: Implement `isDocStale(docPath: string, codeDir: string): boolean` — compares the last modification time of the document against the newest file modification time in the corresponding code directory. If any source file in `codeDir` is newer than the document, the document is stale. Use `fs.statSync().mtime` for timestamps.
  - [ ] 1.5: Implement `findModules(dir: string, threshold?: number): string[]` — finds directories that qualify as modules. A directory is a module if it contains at least `threshold` (default 3, from NFR27) source files (`.ts`, `.js`, `.py` — not test files, not `node_modules`). Returns array of relative paths. Reusable by Epic 6 onboarding scanner.
  - [ ] 1.6: Implement `checkAgentsMdForModule(modulePath: string, dir?: string): DocHealthResult` — checks if a module has a corresponding AGENTS.md and whether it's fresh. The module's AGENTS.md can be at `<modulePath>/AGENTS.md` or the root `AGENTS.md` if the module is the top-level source directory. Checks freshness against source files in the module.
  - [ ] 1.7: Implement `checkDoNotEditHeaders(docPath: string): boolean` — reads the file and checks if it starts with a `DO NOT EDIT MANUALLY` header line. Used for `docs/generated/` and `docs/quality/` files (NFR26).
  - [ ] 1.8: Implement `formatDocHealthOutput(report: DocHealthReport): string[]` — returns array of output lines using `ok()`, `fail()`, `info()` format. Example: `[OK] AGENTS.md: fresh`, `[FAIL] AGENTS.md stale for module: src/lib (code modified 2h after doc)`, `[INFO] Doc health: 5 fresh, 1 stale, 0 missing`.

- [ ] Task 2: Implement module-specific freshness checking for story verification (AC: #2)
  - [ ] 2.1: Implement `checkStoryDocFreshness(storyId: string, dir?: string): DocHealthReport` — given a story ID, determines which modules were changed by the story (via `git diff --name-only` against the story's changes or by reading the story file for referenced modules), then checks AGENTS.md freshness for those specific modules only. This is the targeted check for verification flow.
  - [ ] 2.2: If `git` is available, use `git diff --name-only HEAD~5` (or a configurable range) to identify recently changed files, map them to their parent module directories, and check only those modules' AGENTS.md files. If git is unavailable, fall back to full scan.
  - [ ] 2.3: When a module's AGENTS.md is stale, the function must return `passed: false` with the specific failure: `[FAIL] AGENTS.md stale for module: <name>`. This blocks verification completion.
  - [ ] 2.4: AGENTS.md files must not exceed 100 lines (NFR24). If an AGENTS.md exceeds 100 lines, report as `[WARN] AGENTS.md exceeds 100 lines for module: <name>` — warning, not a failure.

- [ ] Task 3: Implement exec-plan lifecycle management (AC: #3)
  - [ ] 3.1: Implement `createExecPlan(storyId: string, dir?: string): string` — generates `docs/exec-plans/active/<storyId>.md` from story file content. The exec-plan contains: story title, acceptance criteria summary, task checklist (extracted from story file tasks), and a `Status: active` header. Returns the path to the created file.
  - [ ] 3.2: Implement `completeExecPlan(storyId: string, dir?: string): string | null` — moves `docs/exec-plans/active/<storyId>.md` to `docs/exec-plans/completed/<storyId>.md`. Updates the `Status:` header from `active` to `completed`. Adds completion timestamp. Returns the new path, or null if no active exec-plan exists.
  - [ ] 3.3: Implement `getExecPlanStatus(storyId: string, dir?: string): 'active' | 'completed' | 'missing'` — checks whether an exec-plan exists for the story and its current location.

- [ ] Task 4: Create `codeharness doc-health` CLI subcommand in `src/commands/doc-health.ts` (AC: #1-#5)
  - [ ] 4.1: Register `doc-health` command in `src/index.ts` with Commander.js. Options: `--json` (machine-readable output), `--story <id>` (check only modules changed by specific story), `--fix` (auto-generate missing AGENTS.md stubs — placeholder for future implementation).
  - [ ] 4.2: Implement command action: call `scanDocHealth()` for full scan or `checkStoryDocFreshness()` when `--story` is provided. Print formatted output. Exit code 0 if all documents healthy, 1 if any stale/missing.
  - [ ] 4.3: JSON output structure: `{ status: 'ok'|'fail', documents: DocHealthResult[], summary: { fresh: number, stale: number, missing: number, total: number }, scanDurationMs: number }`.
  - [ ] 4.4: Exit codes: 0 if all healthy, 1 if stale/missing docs found, 2 if invalid usage.

- [ ] Task 5: Integrate doc-health gate into verification pipeline (AC: #2, #3)
  - [ ] 5.1: Modify `src/lib/verify.ts` — add `checkDocHealth()` as a new precondition in `checkPreconditions()`. After checking `tests_passed` and `coverage_met`, also check doc freshness for the story being verified by calling `checkStoryDocFreshness(storyId)`. If doc health fails, add failure message to preconditions.
  - [ ] 5.2: Modify `src/commands/verify.ts` — after verification passes successfully, call `completeExecPlan(storyId)` to move the exec-plan to completed. If no exec-plan exists, print `[WARN] No exec-plan found for story: <id>` but do not block verification.
  - [ ] 5.3: The sprint execution skill (`/harness-run` from Epic 0) should call `codeharness doc-health --story <id>` as a gate before marking a story `done`, alongside the existing `codeharness coverage` gate. If doc-health fails, the skill should prompt the agent to update AGENTS.md before proceeding.

- [ ] Task 6: Ensure `DO NOT EDIT MANUALLY` headers and relative paths (AC: #4, #5)
  - [ ] 6.1: Verify that `src/commands/init.ts` already generates `DO NOT EDIT MANUALLY` headers for `docs/quality/` and `docs/generated/` files. The existing `DO_NOT_EDIT_HEADER` constant in init.ts is used for `.gitkeep` files — confirm this is applied correctly. If not, fix it.
  - [ ] 6.2: Verify that `docs/index.md` uses relative paths to reference BMAD artifacts (e.g., `../_bmad-output/planning-artifacts/`). The existing `generateDocsIndexContent()` in `src/commands/init.ts` already generates relative paths — confirm and document.
  - [ ] 6.3: Add validation in `scanDocHealth()` to check that generated docs have the `DO NOT EDIT MANUALLY` header (NFR26) and that `docs/index.md` does not contain copied content (NFR25 — only relative path references allowed).

- [ ] Task 7: Create unit tests for `src/lib/doc-health.ts` (AC: #1-#5)
  - [ ] 7.1: Create `src/lib/__tests__/doc-health.test.ts`. Test `scanDocHealth()`: set up a tmpdir with AGENTS.md and docs/ structure, verify scan produces correct grades for fresh/stale/missing documents.
  - [ ] 7.2: Test `isDocStale()`: create a doc file and a source file, set source file mtime to after doc mtime → expect stale. Set doc mtime to after source → expect fresh.
  - [ ] 7.3: Test `findModules()`: create a directory with subdirectories containing varying numbers of files. Verify threshold filtering works (3 files = module, 2 files = not a module). Verify test files and node_modules are excluded.
  - [ ] 7.4: Test `checkAgentsMdForModule()`: test with existing fresh AGENTS.md → `fresh`. Test with stale AGENTS.md (code newer) → `stale`. Test with missing AGENTS.md → `missing`.
  - [ ] 7.5: Test `checkDoNotEditHeaders()`: file with header → true. File without header → false. Empty file → false.
  - [ ] 7.6: Test `createExecPlan()`: verify file is created in `docs/exec-plans/active/` with correct content. Test `completeExecPlan()`: verify file is moved to `completed/` with updated status. Test `getExecPlanStatus()` for all three states.
  - [ ] 7.7: Test `checkStoryDocFreshness()`: mock git output to simulate changed files, verify only relevant modules are checked.
  - [ ] 7.8: Test `formatDocHealthOutput()`: verify output strings match expected format for healthy and unhealthy reports.
  - [ ] 7.9: Test NFR23 compliance: scan of a reasonably-sized project (50 files) completes within 60 seconds.
  - [ ] 7.10: Test NFR24 check: AGENTS.md with >100 lines produces a warning.

- [ ] Task 8: Create unit tests for `src/commands/doc-health.ts` (AC: #1-#5)
  - [ ] 8.1: Create `src/commands/__tests__/doc-health.test.ts`. Test the full command flow: mock the underlying doc-health functions, verify CLI output format matches expectations for text and JSON modes.
  - [ ] 8.2: Test `--json` flag: verify JSON output structure matches spec from Task 4.3.
  - [ ] 8.3: Test `--story <id>` flag: verify `checkStoryDocFreshness()` is called instead of `scanDocHealth()`.
  - [ ] 8.4: Test exit codes: 0 for healthy, 1 for stale/missing, 2 for invalid usage.
  - [ ] 8.5: Test error handling: state file not found → `[FAIL]` with exit 1.

- [ ] Task 9: Create BATS integration test for doc-health command (AC: #1-#5)
  - [ ] 9.1: Create `tests/doc_health.bats`. Test `codeharness doc-health` as a subprocess with a real project directory fixture.
  - [ ] 9.2: Set up a fixture with: AGENTS.md (fresh), docs/index.md, docs/exec-plans/active/, docs/quality/ with DO NOT EDIT header. Run `codeharness doc-health` and verify: exit code 0, all grades are `fresh`.
  - [ ] 9.3: Set up a fixture where source code is newer than AGENTS.md. Verify: exit code 1, output includes `[FAIL] AGENTS.md stale`.
  - [ ] 9.4: Test with `--story` flag: verify targeted scan behavior.
  - [ ] 9.5: Test `--json` output: parse JSON output and verify fields.

- [ ] Task 10: Build and verify (AC: #1-#5)
  - [ ] 10.1: Run `npm run build` — verify tsup compiles successfully with new `doc-health.ts` and `doc-health` command.
  - [ ] 10.2: Run `npm run test:unit` — all tests pass including new doc-health tests.
  - [ ] 10.3: Run `npm run test:coverage` — verify 100% coverage for all new code in `src/`.
  - [ ] 10.4: Manual test: run `codeharness doc-health` in the codeharness project itself — verify it detects AGENTS.md, scans docs/ structure, produces correct grades.
  - [ ] 10.5: Manual test: run `codeharness doc-health --json` — verify JSON output format.
  - [ ] 10.6: Verify exec-plan lifecycle: create an exec-plan for a test story, run verification, confirm exec-plan moves to completed/.

## Dev Notes

### This Story Is the Fourth and Final in Epic 4

Story 4.1 (Verification Pipeline & Showboat Integration) — DONE. Established the verification orchestration, Showboat proof pipeline, and `codeharness verify` command.
Story 4.2 (Hook Architecture & Enforcement) — DONE. Established the hook architecture including `pre-commit-gate.sh`, `post-write-check.sh`, `post-test-verify.sh`, and `session-start.sh`.
Story 4.3 (Testing, Coverage & Quality Gates) — DONE. Created `src/lib/coverage.ts` and `codeharness coverage` command for test execution, coverage measurement, and state flag updates.

This story completes Epic 4 by adding the documentation health dimension to the quality gate pipeline.

### What Already Exists

**Documentation scaffold (from Epic 1, `src/commands/init.ts`):**
- `generateAgentsMdContent()` — generates root `AGENTS.md` with project structure, build commands, and conventions. Already called during `codeharness init`.
- `generateDocsIndexContent()` — generates `docs/index.md` with relative paths to BMAD artifacts.
- `DO_NOT_EDIT_HEADER` constant — used for generated docs in `docs/quality/` and `docs/generated/`.
- Existing `docs/` scaffold: `index.md`, `exec-plans/active/`, `exec-plans/completed/`, `quality/`, `generated/`.

**State infrastructure (from Epic 1):**
- `src/lib/state.ts` — Full state file read/write with nested value support. `HarnessState` interface with `session_flags` including `verification_run`.
- `src/commands/state.ts` — `state show`, `state get`, `state set`, `state reset-session` subcommands.

**Verification pipeline (from Story 4.1):**
- `src/lib/verify.ts` — `checkPreconditions()` checks `tests_passed` and `coverage_met` flags. This story adds doc health as a third precondition check.
- `src/commands/verify.ts` — Full verify command with story file parsing, proof document creation, showboat integration. This story adds exec-plan completion after verification passes.

**Coverage gate (from Story 4.3):**
- `src/lib/coverage.ts` — Coverage tool detection, test execution, state updates. Provides the pattern for how this story's doc-health module should integrate with the verification flow.
- `src/commands/coverage.ts` — CLI command with `--json`, `--check-only`, `--story` options. The `doc-health` command follows this same pattern.

**Templates library (from Epic 1):**
- `src/lib/templates.ts` — `generateFile()` and `renderTemplate()` utilities. Used for creating exec-plan files.

**Output utilities:**
- `src/lib/output.ts` — `ok()`, `fail()`, `warn()`, `info()`, `jsonOutput()` formatting functions. All output in this story must use these.

### Architecture Decisions That Apply

- **Decision 1 (CLI <-> Plugin Boundary):** Doc health scanning, freshness checking, and exec-plan management belong in the CLI (`src/lib/doc-health.ts`). The sprint skill calls the CLI command. The `doc-gardener.md` agent spec (in plugin/) provides guidance for the agent, but all mechanical work runs in the CLI.
- **Decision 2 (State Management):** Doc health results do not currently have dedicated session flags in `HarnessState`. Instead, doc health is checked as a verification precondition — if doc health fails, verification fails. No new session flags are needed.
- **FR56-FR60 mapping:** FR56 (AGENTS.md generation) = already in init.ts, FR57 (docs/ scaffold) = already in init.ts, FR58 (stale doc scanning) = `scanDocHealth()`, FR59 (exec-plan management) = `createExecPlan()` / `completeExecPlan()`, FR60 (doc freshness enforcement) = `checkStoryDocFreshness()` integrated into verify preconditions.

### Module Naming: `doc-health.ts` Not `scanner.ts`

The architecture doc maps FR58-FR60 to `src/lib/scanner.ts`, but that file is also mapped to FR62-FR64 (onboarding codebase scan, module detection, gap analysis — Epic 6). To avoid overloading a single file with two distinct concerns (doc health vs onboarding scan), this story creates `src/lib/doc-health.ts` for documentation-specific functionality. The `findModules()` function is designed to be reusable by Epic 6's `scanner.ts` when that story is implemented.

### Freshness Detection Strategy

**Timestamp-based comparison:**
- Compare `mtime` of AGENTS.md against newest `mtime` of source files in the corresponding module directory.
- If any source file is newer than AGENTS.md, the document is stale.
- This is a conservative heuristic — a file can be modified without changing the module's public interface. But for autonomous enforcement, false positives (requiring unnecessary doc updates) are safer than false negatives (allowing stale docs through).

**Git-based targeted checking (for `--story` mode):**
- Use `git diff --name-only` to identify files changed in recent commits.
- Map changed files to their parent module directories.
- Check only those modules' AGENTS.md files.
- Falls back to full scan if git is unavailable.

### Exec-Plan File Format

```markdown
<!-- DO NOT EDIT MANUALLY — managed by codeharness -->
# Exec Plan: <story-id>

Status: active
Created: <ISO timestamp>

## Acceptance Criteria

<extracted from story file>

## Task Checklist

<extracted from story file tasks>
```

Upon completion, `Status: active` becomes `Status: completed` and a `Completed: <ISO timestamp>` line is added.

### What NOT To Do

- **Do NOT create `scanner.ts`** — that's Epic 6 (onboarding scan). This story creates `doc-health.ts`.
- **Do NOT modify hook scripts** — hooks are Story 4.2 (done). This story integrates with the verification pipeline, not hooks.
- **Do NOT modify `src/lib/coverage.ts`** — that's Story 4.3 (done).
- **Do NOT add new session flags to HarnessState** — doc health is checked via verify preconditions, not session flags.
- **Do NOT hardcode doc health results** — use real filesystem timestamps.
- **Do NOT use `console.log` directly** — use output utilities from `src/lib/output.ts`.
- **Do NOT add `any` types** — strict TypeScript.
- **Do NOT copy content into `docs/index.md`** — only relative path references (NFR25).

### Scope Boundaries

**IN SCOPE (this story):**
- Create `src/lib/doc-health.ts` with doc scanning, freshness checking, exec-plan management
- Create `src/commands/doc-health.ts` CLI command
- Register doc-health command in `src/index.ts`
- Integrate doc-health check into `src/lib/verify.ts` preconditions
- Add exec-plan completion to `src/commands/verify.ts` post-verification flow
- Integrate doc-health gate into sprint skill story-completion flow
- Unit tests for `src/lib/doc-health.ts` and `src/commands/doc-health.ts`
- BATS integration test for the doc-health command

**OUT OF SCOPE (other stories):**
- Hook modifications (Story 4.2 — done)
- Coverage gate (Story 4.3 — done)
- Verification pipeline core (Story 4.1 — done)
- Onboarding codebase scanner (Epic 6 — `scanner.ts`)
- Ralph integration (Epic 5)
- `doc-gardener.md` agent spec content (plugin artifact, not CLI code)

### Dependencies

- **Depends on:** Story 4.1 (verify.ts preconditions check — will be extended), Story 4.3 (coverage gate pattern — followed as template), Story 1.2 (core libraries — state.ts, templates.ts, output.ts), Story 1.3 (init command — creates AGENTS.md and docs/ scaffold).
- **Depended on by:** Epic 5 (Ralph sessions will run `codeharness doc-health` as part of story completion), Epic 6 (`findModules()` from doc-health.ts is reusable by onboarding scanner).

### Carried Action Items from Epic 3 Retrospective

- **A1:** Integration test for `codeharness init` as subprocess — address if scope allows in Task 9, otherwise carry forward.
- **A3:** index.ts error handler path coverage — three epics overdue. If addressed, create a subprocess test in BATS that exercises the CLI entry point.
- **A4:** Branch coverage 95%+ — new code in this story must have 100% coverage including branches.
- **A6:** Automated check for stale Docker image version pins — not in scope for this story, carry forward.

### New npm Dependencies

None. Uses Node.js built-ins (`fs`, `path`, `child_process`) and existing project dependencies (`yaml`, `commander`).

### Files Modified

| File | Change |
|------|--------|
| `src/index.ts` | Register `doc-health` command via `registerDocHealthCommand()` |
| `src/lib/verify.ts` | Add doc health check to `checkPreconditions()` |
| `src/commands/verify.ts` | Add exec-plan completion after successful verification |

### New Files Created

| File | Purpose |
|------|---------|
| `src/lib/doc-health.ts` | Doc scanning, freshness checking, module detection, exec-plan management (FR58-FR60) |
| `src/commands/doc-health.ts` | `codeharness doc-health` CLI command with `--json`, `--story`, `--fix` options |
| `src/lib/__tests__/doc-health.test.ts` | Unit tests for doc-health.ts |
| `src/commands/__tests__/doc-health.test.ts` | Unit tests for doc-health command |
| `tests/doc_health.bats` | BATS integration test for doc-health command |

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 4, Story 4.4]
- [Source: _bmad-output/planning-artifacts/architecture.md — Docs (FR56-FR60) maps to `src/lib/templates.ts`, `src/lib/scanner.ts`, `agents/doc-gardener.md`]
- [Source: _bmad-output/planning-artifacts/prd.md — FR56-FR60 (Documentation & Doc Health), NFR23-NFR27]
- [Source: src/lib/verify.ts — checkPreconditions() to be extended with doc health check]
- [Source: src/commands/verify.ts — post-verification flow to include exec-plan completion]
- [Source: src/commands/init.ts — generateAgentsMdContent(), generateDocsIndexContent(), DO_NOT_EDIT_HEADER]
- [Source: src/lib/templates.ts — generateFile(), renderTemplate() utilities]
- [Source: src/lib/output.ts — ok(), fail(), warn(), info(), jsonOutput() formatting]
- [Source: _bmad-output/implementation-artifacts/epic-3-retrospective.md — Carried action items A1, A3, A4, A6]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/4-4-documentation-health-freshness-enforcement.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100% of all new code in src/)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (src/lib — doc-health.ts; src/commands — doc-health.ts)
- [ ] Exec-plan created in `docs/exec-plans/active/4-4-documentation-health-freshness-enforcement.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for doc-health command (BATS)
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
