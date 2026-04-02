# Story 1.2: Delete Ralph Loop & Legacy Verification

Status: verifying

## Story

As a developer,
I want the Ralph bash loop, old hooks, and proof document system deleted,
So that only the new architecture's code paths exist.

## Acceptance Criteria

1. **Given** the `ralph/` directory exists with 23+ files (ralph.sh, drivers/, lib/, logs/, state files)
   **When** the entire `ralph/` directory is deleted
   **Then** `ralph/` directory no longer exists on disk
   <!-- verification: test-provable -->

2. **Given** the `hooks/` directory exists with 5 files (4 bash hooks + hooks.json)
   **When** the entire `hooks/` directory is deleted
   **Then** `hooks/` directory no longer exists on disk
   <!-- verification: test-provable -->

3. **Given** `src/lib/verifier-session.ts`, `src/lib/patch-engine.ts`, `src/lib/retry-state.ts`, and `src/lib/state.ts` exist
   **When** all four legacy lib modules are deleted
   **Then** none of these files exist on disk
   **And** their corresponding test files are also deleted (`src/lib/__tests__/patch-engine.test.ts`, `src/lib/__tests__/retry-state.test.ts`, `src/modules/verify/__tests__/verifier-session.test.ts`)
   <!-- verification: test-provable -->

4. **Given** `src/templates/showboat-template.ts` and `src/templates/verify-prompt.ts` exist
   **When** both legacy template files are deleted
   **Then** neither file exists on disk
   **And** their corresponding test files are also deleted (`src/templates/__tests__/showboat-template.test.ts`, `src/modules/verify/__tests__/verify-prompt.test.ts`, `src/modules/verify/__tests__/verification-observability-patch.test.ts`)
   <!-- verification: test-provable -->

5. **Given** `src/lib/agents/ralph.ts` and `src/lib/agents/ralph-prompt.ts` exist
   **When** both ralph agent modules are deleted
   **Then** neither file exists on disk
   **And** their corresponding test files are also deleted (`src/lib/agents/__tests__/ralph.test.ts`, `src/lib/agents/__tests__/ralph-prompt.test.ts`)
   **And** `src/lib/agents/index.ts` no longer re-exports ralph symbols
   <!-- verification: test-provable -->

6. **Given** `src/commands/retry.ts` exists
   **When** the retry command is deleted
   **Then** the file no longer exists on disk
   **And** its test file `src/commands/__tests__/retry.test.ts` is also deleted
   <!-- verification: test-provable -->

7. **Given** dependent files import from deleted modules (verifier-session, patch-engine, retry-state, showboat-template, verify-prompt, ralph, ralph-prompt)
   **When** all imports of deleted modules are removed from dependent files
   **Then** `grep -r "from.*(verifier-session|patch-engine|retry-state|verify-prompt|showboat-template|ralph-prompt|ralph)" src/ --include="*.ts"` returns zero matches (excluding AGENTS.md docs)
   <!-- verification: test-provable -->

8. **Given** all legacy files and imports are removed
   **When** `npm run build` is executed
   **Then** the build succeeds with exit code 0
   <!-- verification: test-provable -->

9. **Given** all legacy files and imports are removed
   **When** `npm run test:unit` is executed
   **Then** all unit tests pass
   <!-- verification: test-provable -->

10. **Given** the codebase after all deletions
    **When** searching for shell scripts in the execution path
    **Then** zero `.sh` files remain under `src/` or any directory referenced by the build/runtime execution path
    **And** `find src/ -name "*.sh"` returns zero results
    <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Delete ralph/ directory (AC: #1)
  - [x] Delete entire `ralph/` directory recursively (ralph.sh, drivers/, lib/, logs/, state files, AGENTS.md)
  - [x] Update `.gitignore` if it has ralph-specific entries

- [x] Task 2: Delete hooks/ directory (AC: #2)
  - [x] Delete entire `hooks/` directory recursively (post-test-verify.sh, post-write-check.sh, session-start.sh, time-warning.sh, hooks.json, AGENTS.txt)

- [x] Task 3: Delete legacy lib modules (AC: #3)
  - [x] Delete `src/lib/verifier-session.ts`
  - [x] Delete `src/lib/patch-engine.ts`
  - [x] Delete `src/lib/retry-state.ts`
  - [x] Delete `src/lib/state.ts`
  - [x] Delete `src/lib/__tests__/patch-engine.test.ts`
  - [x] Delete `src/lib/__tests__/retry-state.test.ts`
  - [x] Delete `src/modules/verify/__tests__/verifier-session.test.ts`

- [x] Task 4: Delete legacy template files (AC: #4)
  - [x] Delete `src/templates/showboat-template.ts`
  - [x] Delete `src/templates/verify-prompt.ts`
  - [x] Delete `src/templates/__tests__/showboat-template.test.ts`
  - [x] Delete `src/modules/verify/__tests__/verify-prompt.test.ts`
  - [x] Delete `src/modules/verify/__tests__/verification-observability-patch.test.ts`

- [x] Task 5: Delete ralph agent modules (AC: #5)
  - [x] Delete `src/lib/agents/ralph.ts`
  - [x] Delete `src/lib/agents/ralph-prompt.ts`
  - [x] Delete `src/lib/agents/__tests__/ralph.test.ts`
  - [x] Delete `src/lib/agents/__tests__/ralph-prompt.test.ts`
  - [x] Remove ralph re-exports from `src/lib/agents/index.ts` (RalphDriver, RalphConfig, buildSpawnArgs, resolveRalphPath, parseRalphMessage, parseIterationMessage, generateRalphPrompt, RalphPromptConfig)

- [x] Task 6: Delete retry command (AC: #6)
  - [x] Delete `src/commands/retry.ts`
  - [x] Delete `src/commands/__tests__/retry.test.ts`

- [x] Task 7: Remove imports of deleted modules from dependent files (AC: #7)
  - [x] `src/lib/bmad.ts` — remove `applyPatch` import from `patch-engine.js`; keep non-patch-engine logic
  - [x] `src/modules/verify/orchestrator.ts` — remove `showboatProofTemplate` and `AcceptanceCriterion` imports from `showboat-template.js`
  - [x] `src/commands/run.ts` — remove `generateRalphPrompt` import from `ralph-prompt.js`; refactor to use workflow-engine call instead
  - [x] `src/commands/teardown.ts` — remove `removePatch` import from `patch-engine.js`
  - [x] `src/lib/run-helpers.ts` — remove `parseRalphMessage`, `parseIterationMessage` imports from `ralph.js`
  - [x] `src/lib/dashboard-formatter.ts` — remove any ralph-specific formatting logic if present

- [x] Task 8: Fix test files that mock deleted modules (AC: #9)
  - [x] `src/commands/__tests__/teardown.test.ts` — remove `removePatch` mock from `patch-engine.js`
  - [x] `src/commands/__tests__/run.test.ts` — remove `generateRalphPrompt` mock from `ralph-prompt.js`
  - [x] `src/lib/__tests__/run-helpers.test.ts` — remove ralph import mocks
  - [x] `src/lib/__tests__/dashboard-formatter.test.ts` — remove ralph-specific test cases if any

- [x] Task 9: Verify build and tests pass (AC: #8, #9, #10)
  - [x] Run `npm run build` and confirm exit 0
  - [x] Run `npm run test:unit` and confirm all pass
  - [x] Run `find src/ -name "*.sh"` and confirm zero results

## Dev Notes

### Surgical Removal Strategy

The architecture document (architecture-v2.md) explicitly lists this as priority #2 after beads cleanup: **"Legacy deletion (ralph/, hooks/, old verify/proof modules)."** Story 1.1 (beads cleanup) is already done, so this story can proceed.

Delete entire directories first (ralph/, hooks/), then delete individual source files, then fix all compiler errors in one pass. Do NOT attempt to build between deletions — do all deletions atomically.

### What to Do with Functions That Called Deleted Modules

When a function's sole purpose was to call a deleted module (e.g., `applyPatch` in bmad.ts, `generateRalphPrompt` in run.ts):
- If the function has no other logic, **remove it entirely** or replace with a `// TODO: v2 workflow-engine (Epic 5)` comment
- If the function has mixed logic, **keep the non-legacy lines** and remove only the deleted-module calls
- The `run.ts` command is a REWORK target (Epic 5) — for now, remove the Ralph spawn and leave a placeholder

### Key risk: run.ts depends heavily on Ralph

`src/commands/run.ts` imports `generateRalphPrompt` and likely orchestrates the Ralph bash loop. Removing Ralph from run.ts may leave it non-functional. This is expected — Epic 5 (Story 5.4) will rebuild `codeharness run` to use the workflow engine. For this story, remove Ralph references and leave a stub or TODO.

### Files That Import Deleted Modules — Complete Dependency Map

**Directories to delete entirely:**
- `ralph/` — 23+ files (bash loop, drivers, lib, logs, state)
- `hooks/` — 5 files (4 bash hooks + hooks.json)

**Source files to delete (from src/lib/):**
- `src/lib/verifier-session.ts` — old black-box verifier session spawner
- `src/lib/patch-engine.ts` — BMAD patch engine (will be rebuilt in v2)
- `src/lib/retry-state.ts` — legacy retry/flagged state management
- `src/lib/state.ts` — old state module (replaced by workflow-state in Story 1.3)

**Source files to delete (from src/templates/):**
- `src/templates/showboat-template.ts` — proof document format (replaced by JSON verdict in Epic 6)
- `src/templates/verify-prompt.ts` — black-box verifier prompt (replaced by evaluator agent YAML in Epic 6)

**Source files to delete (from src/lib/agents/):**
- `src/lib/agents/ralph.ts` — Ralph driver and parser
- `src/lib/agents/ralph-prompt.ts` — Ralph loop prompt generator

**Source files to delete (from src/commands/):**
- `src/commands/retry.ts` — retry command (merged into workflow-state in Epic 5)

**Dependents (surgical cleanup):**
- `src/lib/bmad.ts` — imports `applyPatch` from `patch-engine.js`
- `src/modules/verify/orchestrator.ts` — imports `showboatProofTemplate`, `AcceptanceCriterion` from `showboat-template.js`
- `src/commands/run.ts` — imports `generateRalphPrompt` from `ralph-prompt.js`
- `src/commands/teardown.ts` — imports `removePatch` from `patch-engine.js`
- `src/lib/run-helpers.ts` — imports `parseRalphMessage`, `parseIterationMessage` from `ralph.js`
- `src/lib/agents/index.ts` — barrel re-exports ralph symbols

**Test files to delete:**
- `src/lib/__tests__/patch-engine.test.ts`
- `src/lib/__tests__/retry-state.test.ts`
- `src/modules/verify/__tests__/verifier-session.test.ts`
- `src/templates/__tests__/showboat-template.test.ts`
- `src/modules/verify/__tests__/verify-prompt.test.ts`
- `src/modules/verify/__tests__/verification-observability-patch.test.ts`
- `src/lib/agents/__tests__/ralph.test.ts`
- `src/lib/agents/__tests__/ralph-prompt.test.ts`
- `src/commands/__tests__/retry.test.ts`

**Test files to update (remove mocks):**
- `src/commands/__tests__/teardown.test.ts`
- `src/commands/__tests__/run.test.ts`
- `src/lib/__tests__/run-helpers.test.ts`
- `src/lib/__tests__/dashboard-formatter.test.ts`

### Architecture Compliance

- **FR48:** System does not contain Ralph bash loop, session flags, proof parsers, self-verify hooks, beads
- **FR49:** System has exactly one verification path: blind evaluator session
- **NFR16:** Zero shell scripts in execution path
- **NFR17:** Net negative LOC after legacy removal — this story should delete significantly more lines than it adds
- **Anti-pattern:** Do NOT create replacements in this story. Ralph replacement is Epic 5 (workflow engine). Verify replacement is Epic 6 (blind evaluator). Proof replacement is Epic 6 (JSON verdict).

### Testing Standards

- After cleanup, `npm run build` must succeed (zero references to deleted modules in compiled output)
- After cleanup, `npm run test:unit` must pass
- No new tests required for this story — it is pure deletion
- Test files that mock deleted modules must have those mocks removed; remaining test logic should still assert non-legacy behavior

### References

- [Source: _bmad-output/planning-artifacts/epics-v2.md#Story 1.2: Delete Ralph Loop & Legacy Verification]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#DELETE — Entire Files]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#Dependency Chain Breaks to Handle]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#Implementation Priority]
- [Source: _bmad-output/planning-artifacts/prd-evaluator-redesign.md#FR48, FR49]
