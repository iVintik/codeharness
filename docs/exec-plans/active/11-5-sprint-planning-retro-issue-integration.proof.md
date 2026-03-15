# Proof: 11-5-sprint-planning-retro-issue-integration

## AC:1 — Retro import integration in sprint planning

**Evidence:** `sprintPlanningRetroPatch()` now includes step 2: "Import retro findings to beads: For each retrospective not yet imported, run `codeharness retro-import --epic N`" and checklist item "`codeharness retro-import --epic N` run for each unimported retrospective". Tests `includes codeharness retro-import step` and `instructs scanning for retrospective files` verify this content.

## AC:2 — GitHub import integration in sprint planning

**Evidence:** `sprintPlanningRetroPatch()` now includes step 3: "Import GitHub issues to beads: Run `codeharness github-import`" and checklist item "`codeharness github-import` run to pull labeled GitHub issues". `sprintBeadsPatch()` includes "Confirm `codeharness github-import` was run". Tests `includes codeharness github-import step` and `contains pre-triage import verification checklist` verify this content.

## AC:3 — Source-aware backlog presentation with uniform triage

**Evidence:** `sprintPlanningRetroPatch()` contains "Source-Aware Backlog Presentation" section with three source types: retro `[gap:retro:...]`, GitHub `[source:github:...]`, manual (no gap-id prefix). Checklist item: "All sources (retro, GitHub, manual) triaged uniformly". `sprintBeadsPatch()` includes "Verify issues from all sources are visible: retro, GitHub, and manual". Tests `contains source-aware backlog presentation section`, `contains uniform triage checklist item`, `contains multi-source visibility checklist item` verify this content.

## Test Results

- 1383 tests pass, 0 failures, 0 regressions
- `bmad-patches.ts` coverage: 100% statements, 100% branches, 100% functions, 100% lines
