# Story 9.1: Per-Module Patches Directory

Status: verifying

## Story

As a developer,
I want patches organized by module role in subdirectories,
so that enforcement rules connect to responsibilities and can be updated without rebuilding.

## Acceptance Criteria

1. **Given** directories `patches/{dev,review,verify,sprint,retro}/` exist, **When** the patch loader runs, **Then** patch templates load from the role subdirectory (e.g., `patches/dev/enforcement.md`). <!-- verification: cli-verifiable -->
2. **Given** patches are markdown files in `patches/{role}/`, **When** content is updated, **Then** no TypeScript rebuild is required to pick up the change. <!-- verification: cli-verifiable -->
3. **Given** each patch file, **When** inspected, **Then** it includes a `## WHY` section with architectural reasoning for the enforcement rules. <!-- verification: cli-verifiable -->
4. **Given** patch application via `applyAllPatches()`, **When** called, **Then** reads from `patches/{role}/` subdirectories, not from flat `patches/*.md` files. <!-- verification: cli-verifiable -->
5. **Given** the migration from flat `patches/` to `patches/{role}/`, **When** `codeharness init` runs on a project, **Then** all patches still apply correctly (no regression in patch application). <!-- verification: integration-required -->
6. **Given** backward compatibility, **When** old flat `patches/*.md` files do not exist but new `patches/{role}/*.md` do, **Then** `readPatchFile()` resolves to the new location. <!-- verification: cli-verifiable -->
7. **Given** the `PATCH_TEMPLATES` registry and `PATCH_TARGETS` map, **When** a new role-specific patch is added, **Then** adding a `.md` file in the role directory and a registry entry is sufficient — no inline fallback string needed. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Create per-role subdirectory structure (AC: 1)
  - [x] Create `patches/dev/`, `patches/review/`, `patches/verify/`, `patches/sprint/`, `patches/retro/` directories
  - [x] Move `patches/dev-enforcement.md` -> `patches/dev/enforcement.md`
  - [x] Move `patches/review-enforcement.md` -> `patches/review/enforcement.md`
  - [x] Move `patches/story-verification.md` -> `patches/verify/story-verification.md`
  - [x] Move `patches/sprint-planning.md` -> `patches/sprint/planning.md`
  - [x] Move `patches/retro-enforcement.md` -> `patches/retro/enforcement.md`
  - [x] Remove old flat files after migration
- [x] Task 2: Add WHY sections to all patch files (AC: 3)
  - [x] Each patch gets a `## WHY` block explaining the architectural reasoning
  - [x] WHY must reference the FR/NFR/operational failure that motivated the patch
- [x] Task 3: Update `readPatchFile()` in `src/templates/bmad-patches.ts` (AC: 4, 6)
  - [x] Change path resolution: `patches/{role}/{name}.md` instead of `patches/{name}.md`
  - [x] Update each exported function to pass role + name to `readPatchFile()`
  - [x] Keep inline fallback strings as safety net but document they are deprecated
- [x] Task 4: Update `PATCH_TEMPLATES` and `PATCH_TARGETS` registries (AC: 7)
  - [x] Verify `PATCH_TARGETS` in `src/lib/bmad.ts` still maps correctly after directory change
  - [x] Ensure `PATCH_TEMPLATES` keys remain stable (no downstream breakage in teardown, init)
- [x] Task 5: Update tests (AC: 1, 2, 4, 6)
  - [x] Update `src/templates/__tests__/bmad-patches.test.ts` for new directory structure
  - [x] Update `src/templates/__tests__/bmad-patches-fallback.test.ts` for fallback behavior
  - [x] Update `src/lib/__tests__/bmad.test.ts` if path resolution changed
  - [x] Add test: loading from `patches/{role}/` works
  - [x] Add test: missing role directory falls back to inline default
  - [x] Add test: no rebuild needed — runtime file read verified
- [x] Task 6: Verify no-rebuild behavior (AC: 2)
  - [x] Confirm `readPatchFile()` uses `readFileSync` at call time, not import time
  - [x] Confirm changing a `.md` file changes patch output without `npm run build`

## Dev Notes

### Current State

The patch system already works well. Key files:
- **`patches/*.md`** — 5 flat markdown files (dev-enforcement, review-enforcement, story-verification, retro-enforcement, sprint-planning)
- **`src/templates/bmad-patches.ts`** — `readPatchFile(name)` resolves `patches/{name}.md` relative to package root. Each exported function has an inline fallback via `??`.
- **`src/lib/bmad.ts`** — `PATCH_TARGETS` maps patch names to BMAD workflow target files. `applyAllPatches()` iterates this map.
- **`src/commands/teardown.ts`** — imports `PATCH_TARGETS` to remove patches on teardown.

### What Changes

The refactor is a directory reorganization + `readPatchFile` path change. The `PATCH_TEMPLATES` keys and `PATCH_TARGETS` map should remain stable to avoid breaking `applyAllPatches()` and `teardown`.

**Proposed mapping:**

| Old path | New path | Role |
|----------|----------|------|
| `patches/dev-enforcement.md` | `patches/dev/enforcement.md` | Dev |
| `patches/review-enforcement.md` | `patches/review/enforcement.md` | Review |
| `patches/story-verification.md` | `patches/verify/story-verification.md` | Verify |
| `patches/sprint-planning.md` | `patches/sprint/planning.md` | Sprint |
| `patches/retro-enforcement.md` | `patches/retro/enforcement.md` | Retro |

**`readPatchFile` change:** Accept `(role, name)` instead of `(name)` and resolve `patches/{role}/{name}.md`.

### Architecture Compliance

- FR33: Patches encode real operational learnings — already true, this story reorganizes for role clarity
- FR34: Markdown patches, not hardcoded — already true, inline fallbacks are safety nets only
- FR35: Per-module patches directory — this is the primary FR for this story
- FR36: Patches include WHY context — add `## WHY` sections to all patch files
- NFR20: Patches are markdown files readable by humans and agents — preserved
- No file >300 lines (NFR18) — `bmad-patches.ts` is currently 109 lines, will stay well under

### File Structure

```
patches/
  dev/
    enforcement.md          # Dev agent guardrails (was dev-enforcement.md)
  review/
    enforcement.md          # Review gates (was review-enforcement.md)
  verify/
    story-verification.md   # Verification requirements (was story-verification.md)
  sprint/
    planning.md             # Sprint planning integration (was sprint-planning.md)
  retro/
    enforcement.md          # Retrospective quality metrics (was retro-enforcement.md)
```

### Testing Standards

- Vitest for all unit tests
- 100% coverage on new/changed code
- Existing tests in `src/templates/__tests__/bmad-patches.test.ts` and `src/templates/__tests__/bmad-patches-fallback.test.ts` must pass after migration
- `src/lib/__tests__/bmad.test.ts` tests `applyAllPatches` — verify no regression

### Anti-Patterns to Avoid

- Do NOT change `PATCH_TARGETS` keys — they are used by teardown and other consumers
- Do NOT remove inline fallback strings — they serve as safety net when `patches/` dir is missing (e.g., npm package without patches dir)
- Do NOT import patch content at module load time — `readFileSync` must stay at call time for hot-reload behavior
- Do NOT create a new module for this — it stays in `src/templates/bmad-patches.ts`

### Project Structure Notes

- Alignment: `patches/{role}/` matches the architecture doc's prescribed structure exactly
- The `files` array in `package.json` must include `patches/**` to ensure subdirectories ship with the npm package

### References

- [Source: _bmad-output/planning-artifacts/epics-overhaul.md#Epic 9: Enforcement & Patches]
- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md#Module Boundaries — patches/ directory structure]
- [Source: src/templates/bmad-patches.ts — current patch loader implementation]
- [Source: src/lib/bmad.ts#PATCH_TARGETS — patch-to-target mapping]
- [Source: src/commands/teardown.ts — patch removal on teardown]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`verification/9-1-per-module-patches-directory-proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (src/templates, patches)
- [ ] Exec-plan created in `docs/exec-plans/active/9-1-per-module-patches-directory.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

N/A — single-session implementation

### Completion Notes List

- Moved 5 flat patch files into `patches/{role}/` subdirectories
- Added `## WHY` sections to all 5 patch files referencing FR33, FR34, FR36, NFR20
- Changed `readPatchFile(name)` to `readPatchFile(role, name)` with `patches/{role}/{name}.md` resolution
- PATCH_TEMPLATES keys and PATCH_TARGETS map unchanged — no downstream breakage
- Inline fallback strings preserved as safety net for npm installs without patches dir
- Updated `src/templates/__tests__/bmad-patches.test.ts` with 7 new tests (WHY sections, directory loading, runtime read)
- Fallback test (`bmad-patches-fallback.test.ts`) passes unchanged — mocks fs correctly
- `bmad.test.ts` (applyAllPatches) passes unchanged — PATCH_TARGETS stable
- Updated `src/templates/AGENTS.md` with new directory layout docs
- Created `patches/AGENTS.md` documenting directory structure and editing rules
- Build succeeds, 56/56 patch-related tests pass, no regressions in 2264 other tests
- 2 pre-existing failures in `modules/sprint/__tests__/migration.test.ts` (unrelated)

### File List

- `patches/dev/enforcement.md` (new — moved from `patches/dev-enforcement.md`)
- `patches/review/enforcement.md` (new — moved from `patches/review-enforcement.md`)
- `patches/verify/story-verification.md` (new — moved from `patches/story-verification.md`)
- `patches/sprint/planning.md` (new — moved from `patches/sprint-planning.md`)
- `patches/retro/enforcement.md` (new — moved from `patches/retro-enforcement.md`)
- `patches/AGENTS.md` (new)
- `patches/dev-enforcement.md` (deleted)
- `patches/review-enforcement.md` (deleted)
- `patches/story-verification.md` (deleted)
- `patches/sprint-planning.md` (deleted)
- `patches/retro-enforcement.md` (deleted)
- `src/templates/bmad-patches.ts` (modified — readPatchFile(role, name))
- `src/templates/__tests__/bmad-patches.test.ts` (modified — new tests)
- `src/templates/AGENTS.md` (modified — updated docs)
- `_bmad-output/implementation-artifacts/9-1-per-module-patches-directory.md` (modified — tasks checked, status review)
