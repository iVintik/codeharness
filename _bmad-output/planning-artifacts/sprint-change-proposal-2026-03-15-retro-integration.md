---
status: APPROVED
date: '2026-03-15'
scope: Moderate
trigger: Retrospective system 90% built but integration gaps — status lifecycle, finding consumption, GitHub issue loop
priority: First — execute before verification of other epics
---

# Sprint Change Proposal: Retrospective Integration & GitHub Issue Loop

**Date:** 2026-03-15
**Status:** APPROVED
**Change Scope:** Moderate

## Issue Summary

After 10 epics completed, the retrospective system produces artifacts (10 retro files exist) but has three integration gaps:

1. **Status lifecycle broken:** retro status never updates `optional` → `done` in sprint-status.yaml
2. **Findings are write-only:** Retro action items are documented but never consumed by sprint-planning or create-story
3. **No external issue integration:** No mechanism to create GitHub issues from retro findings or import GitHub issues into sprint planning

## Impact Analysis

| Artifact | Change |
|----------|--------|
| prd.md | Added FR71-FR74 (Retrospective Integration & GitHub Issue Loop) |
| epics.md | Added Epic 11 with 5 stories + FR coverage map entries |
| architecture.md | Added Decision 10 (GitHub Integration & Retro Issue Loop) |
| sprint-status.yaml | Added Epic 11 entries (5 stories + retro) |
| harness-run.md | Fixed Step 5 — explicit retro status update |

## Recommended Approach

Direct Adjustment — new Epic 11 with 5 stories. Pure additive change.

**Priority:** Epic 11 executes BEFORE verification of existing epics (per user instruction).

## Artifacts Modified

- [x] prd.md — FR71-FR74 added, "Retrospective automation" removed from Out of Scope
- [x] epics.md — Epic 11 + 5 full story definitions + FR coverage map
- [x] architecture.md — Decision 10 added
- [x] sprint-status.yaml — Epic 11 entries added
- [x] harness-run.md — Step 5 retro status fix

## New Source Files (to be created during implementation)

| File | Purpose |
|------|---------|
| `src/commands/retro-import.ts` | CLI command: parse retro → beads + GitHub |
| `src/commands/github-import.ts` | CLI command: GitHub issues → beads |
| `src/lib/github.ts` | `gh` CLI wrapper (issue create, list, search) |
| `src/lib/retro-parser.ts` | Parse retro markdown, extract action items, classify |
