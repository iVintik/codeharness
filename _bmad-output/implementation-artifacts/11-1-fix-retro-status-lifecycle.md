# Story 11.1: Fix Retro Status Lifecycle

Status: verified

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer using codeharness,
I want retrospective status to update from `optional` to `done` when a retro is completed,
so that sprint-status.yaml accurately reflects which epics have had retrospectives.

## Acceptance Criteria

1. **Given** all stories in an epic are `done`, **when** the harness-run skill executes Step 5 (epic completion), **then** the retrospective agent is invoked **and** `epic-N-retrospective` status is updated to `done` in sprint-status.yaml by the harness-run skill itself (not delegated to the retro agent). (AC:1)

2. **Given** a user runs `codeharness verify --retro --epic N`, **when** `epic-N-retrospective.md` exists in implementation-artifacts, **then** the status is updated to `done` in sprint-status.yaml **and** the CLI prints `[OK] Epic N retrospective: marked done`. (AC:2)

3. **Given** sprint planning is invoked for a new sprint, **when** previous epics have completed retrospectives, **then** unresolved action items from those retros are surfaced during planning. (AC:3)

## Tasks / Subtasks

- [x] Task 1: Add `--retro` and `--epic` flags to verify command (AC: 2)
  - [x] 1.1: Add `--retro` boolean flag and `--epic <N>` option to Commander.js registration in `src/commands/verify.ts`
  - [x] 1.2: Add new code path: when `--retro` is set, skip story-based verification and instead check for `epic-N-retrospective.md` in `_bmad-output/implementation-artifacts/`
  - [x] 1.3: If retro file exists, call `updateSprintStatus('epic-N-retrospective', 'done')` from `src/lib/beads-sync.ts`
  - [x] 1.4: Print `[OK] Epic N retrospective: marked done` (or `[FAIL] epic-N-retrospective.md not found`)
  - [x] 1.5: Support `--json` output: `{"status": "ok", "epic": N, "retroFile": "path"}`

- [x] Task 2: Fix harness-run Step 5 to explicitly update retro status (AC: 1)
  - [x] 2.1: Edit `commands/harness-run.md` Step 5 to add explicit instruction: after retrospective agent completes, use Edit tool to update `epic-N-retrospective` from `optional` to `done` in sprint-status.yaml
  - [x] 2.2: Verify the instruction already exists at line 187 (`a. Update epic-{N}-retrospective status to done`) -- confirm it is unambiguous and the agent cannot skip it

- [x] Task 3: Patch sprint-planning to surface unresolved retro action items (AC: 3)
  - [x] 3.1: Create new BMAD patch template function `sprintPlanningRetroPatch()` in `src/templates/bmad-patches.ts`
  - [x] 3.2: Patch content: instruct sprint-planning to read all `epic-N-retrospective.md` files, extract action items table, surface unresolved items
  - [x] 3.3: Add patch target entry in `src/lib/bmad.ts` `PATCH_TARGETS` map: `'sprint-retro': 'bmm/workflows/4-implementation/sprint-planning/instructions.md'`
  - [x] 3.4: Add patch name to `PATCH_TEMPLATES` export so `init` command applies it

- [x] Task 4: Unit tests (AC: 1, 2, 3)
  - [x] 4.1: Test verify command with `--retro --epic N` when retro file exists (expects status update + ok message)
  - [x] 4.2: Test verify command with `--retro --epic N` when retro file missing (expects fail message)
  - [x] 4.3: Test verify command with `--retro --epic N --json` (expects JSON output)
  - [x] 4.4: Test verify command with `--retro` but no `--epic` (expects error: --epic required)
  - [x] 4.5: Test sprint-planning retro patch content is well-formed
  - [x] 4.6: Test PATCH_TARGETS includes the new sprint-retro entry

## Dev Notes

### Architecture Constraints

- **CLI orchestrates all verification** (Architecture Decision 8). The verify command owns status updates -- agents do not.
- **All templates are TypeScript string literals** (Architecture Decision 6). New patches go in `src/templates/bmad-patches.ts`.
- **Patch engine pattern**: patches use `<!-- CODEHARNESS-PATCH-START:name -->` / `<!-- CODEHARNESS-PATCH-END:name -->` markers, applied by `src/lib/patch-engine.ts`.
- **Commander.js pattern**: all commands use `registerXxxCommand(program: Command)` pattern, registered in `src/index.ts`.

### Existing Code to Reuse

- `updateSprintStatus(key, status, dir)` in `src/lib/beads-sync.ts` -- line-level YAML replacement preserving comments. Use this for retro status updates.
- `readSprintStatus(dir)` in `src/lib/beads-sync.ts` -- reads development_status map.
- `ok()`, `fail()`, `warn()`, `info()`, `jsonOutput()` from `src/lib/output.ts` -- standard CLI output helpers.
- `PATCH_TARGETS` map in `src/lib/bmad.ts` line 37 -- maps patch names to target files.
- `PATCH_TEMPLATES` in `src/templates/bmad-patches.ts` -- patch content generators.

### Key File Locations

| File | Purpose |
|------|---------|
| `src/commands/verify.ts` | Add `--retro`/`--epic` flags here |
| `src/lib/beads-sync.ts` | `updateSprintStatus()` -- reuse for retro status |
| `src/templates/bmad-patches.ts` | Add `sprintPlanningRetroPatch()` here |
| `src/lib/bmad.ts` | Add `'sprint-retro'` to `PATCH_TARGETS` |
| `commands/harness-run.md` | Step 5 -- verify explicit retro status update instruction |
| `_bmad/bmm/workflows/4-implementation/sprint-planning/instructions.md` | Patch target for retro action items |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | Status file with `epic-N-retrospective` entries |

### Anti-Patterns to Avoid

- Do NOT delegate retro status updates to the retrospective agent. The harness-run skill and verify CLI own this.
- Do NOT create a new command for retro verification -- extend the existing `verify` command with flags.
- Do NOT parse sprint-status.yaml with the `yaml` library for updates -- use `updateSprintStatus()` which preserves comments via regex replacement.
- Do NOT modify `src/index.ts` unless adding a new top-level command (we are extending `verify`, not creating a new command).

### Project Structure Notes

- Verify command registration: `src/commands/verify.ts` exports `registerVerifyCommand()`, registered in `src/index.ts` line 28.
- The `--story` option is currently `requiredOption`. With `--retro` mode, `--story` must become optional (conditionally required when `--retro` is not set).
- Sprint-status.yaml uses `epic-N-retrospective: optional` format. The key is literal (e.g., `epic-11-retrospective`).

### References

- [Source: _bmad-output/planning-artifacts/epics.md, Story 11.1]
- [Source: _bmad-output/planning-artifacts/architecture.md, Decision 8 (CLI orchestrates verification)]
- [Source: _bmad-output/planning-artifacts/architecture.md, Decision 10 (GitHub Integration & Retro Issue Loop)]
- [Source: commands/harness-run.md, Step 5 (Epic Completion)]
- [Source: src/commands/verify.ts (current verify command implementation)]
- [Source: src/lib/beads-sync.ts (updateSprintStatus, readSprintStatus)]
- [Source: src/templates/bmad-patches.ts (patch template pattern)]
- [Source: src/lib/bmad.ts (PATCH_TARGETS map)]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/11-1-fix-retro-status-lifecycle.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/11-1-fix-retro-status-lifecycle.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

No debug issues encountered.

### Completion Notes List

- Task 1: Extended `verify` command with `--retro` and `--epic` flags. Changed `--story` from `requiredOption` to `option` with conditional enforcement. Added `verifyRetro()` function that checks for `epic-N-retrospective.md`, calls `updateSprintStatus()`, and outputs OK/FAIL messages. JSON output supported for both success and failure cases.
- Task 2: Verified that `commands/harness-run.md` Step 5 (line 187) already contains an explicit, unambiguous instruction: "Update `epic-{N}-retrospective` status to `done` in sprint-status.yaml (use Edit tool — do NOT rely on the retro agent to do this)". No code changes needed.
- Task 3: Added `sprintPlanningRetroPatch()` template function in `src/templates/bmad-patches.ts`. Patch instructs sprint-planning to scan `epic-N-retrospective.md` files, extract action items, and surface unresolved items. Added `'sprint-retro'` to both `PATCH_TARGETS` (target: `bmm/workflows/4-implementation/sprint-planning/instructions.md`) and `PATCH_TEMPLATES`.
- Task 4: Added 6 new unit tests for retro verification (file exists, file missing, JSON output success/fail, missing --epic, invalid epic number). Updated existing tests: first test now checks `--story is required when --retro is not set` instead of Commander's requiredOption. Added 6 new tests for `sprintPlanningRetroPatch`. Updated `PATCH_TEMPLATES` count assertions from 5 to 6. Updated `applyAllPatches` assertions from `toHaveLength(5)` to `toHaveLength(6)`.

### Change Log

- 2026-03-15: Implemented retro status lifecycle (Tasks 1-4). Extended verify command with --retro/--epic flags, added sprint-planning retro patch, verified harness-run Step 5 instructions, added comprehensive unit tests.
- 2026-03-15: Code review fixes — 6 issues found (2 HIGH, 4 MEDIUM), all fixed. See Senior Developer Review below.

### File List

- src/commands/verify.ts (modified — added --retro/--epic flags, refactored into verifyStory/verifyRetro functions; review: fixed type assertion, epic validation, error handling)
- src/templates/bmad-patches.ts (modified — added sprintPlanningRetroPatch, added to PATCH_TEMPLATES)
- src/lib/bmad.ts (modified — added 'sprint-retro' to PATCH_TARGETS; review: removed stale bmalph_detected, fixed comment)
- src/commands/__tests__/verify.test.ts (modified — added 6 retro mode tests, updated story mode tests for optional --story; review: added epic-0 and error-handling tests)
- src/commands/__tests__/init.test.ts (modified — review: removed bmalph_detected from mock)
- src/templates/__tests__/bmad-patches.test.ts (modified — added sprintPlanningRetroPatch tests, updated PATCH_TEMPLATES count to 6)
- src/lib/__tests__/bmad.test.ts (modified — updated applyAllPatches length assertions from 5 to 6; review: fixed test description)
- _bmad-output/implementation-artifacts/sprint-status.yaml (modified — story status updates)

### Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.6 (1M context) on 2026-03-15
**Outcome:** Approved (after fixes)
**Issues Found:** 2 HIGH, 4 MEDIUM, 0 LOW — all fixed

#### HIGH Issues (fixed)

1. **Stale comment in `bmad.ts:138`** — JSDoc said "all 5 harness patches" but there are now 6 after adding `sprint-retro`. Fixed to "all harness patches" (count-free).
2. **TypeScript error in `verify.ts:241`** — `result as Record<string, unknown>` was an invalid type assertion (TS2352). Fixed to `result as unknown as Record<string, unknown>`.

#### MEDIUM Issues (fixed)

3. **Test description mismatch in `bmad.test.ts:201`** — Test said "applies all 5 patches" but asserted `toHaveLength(6)`. Fixed description to match.
4. **Missing error handling in `verifyRetro()`** — `updateSprintStatus()` call was not wrapped in try/catch, unlike analogous calls in `verifyStory()`. Could crash on I/O errors. Added try/catch with `warn()`.
5. **`verifyRetro()` accepted `epicNum === 0`** — Validation used `epicNum < 0` but epic 0 is not valid. Fixed to `epicNum < 1`. Added test.
6. **Stale `bmalph_detected` property in `bmad.ts`** — Property not in `BmadInstallResult` interface (TS2353). Removed from source and test mock.
