# Exec Plan: 11-5-sprint-planning-retro-issue-integration

## Scope

Update two existing BMAD patch template functions (`sprintPlanningRetroPatch` and `sprintBeadsPatch`) and their tests to integrate retro-import, github-import, and source-aware backlog presentation into the sprint-planning workflow.

## Files Modified

- `src/templates/bmad-patches.ts` — Updated `sprintPlanningRetroPatch()` and `sprintBeadsPatch()` content
- `src/templates/__tests__/bmad-patches.test.ts` — Added tests for new patch content
- `src/templates/AGENTS.md` — Updated descriptions for modified functions

## Approach

- No new files, commands, or lib modules. Template string updates only.
- `sprintPlanningRetroPatch()` now includes steps for `codeharness retro-import --epic N`, `codeharness github-import`, `bd ready`, and source-aware backlog presentation.
- `sprintBeadsPatch()` now includes pre-triage import verification and multi-source visibility checklist items.
- Tests verify all new content strings are present in patch output.

## Verification

- All 1383 tests pass (0 regressions)
- `bmad-patches.ts` at 100% coverage (statements, branches, functions, lines)
- Build succeeds cleanly
