# Epic 3 Retrospective: Beads & BMAD Integration

**Epic:** Epic 3 — Beads & BMAD Integration
**Date:** 2026-03-15
**Stories Completed:** 4 (3-1, 3-2, 3-3, 3-4)
**Status:** All stories done

---

## Epic Summary

Epic 3 delivered the full beads and BMAD integration layer for codeharness. Building on the CLI foundation (Epic 1) and observability stack (Epic 2), the epic produced: a beads CLI wrapper with programmatic interface to `bd` commands (beads.ts: 158 lines), BMAD installation and a marker-based idempotent patch engine for workflow enforcement (bmad.ts: 525 lines, patch-engine.ts: 114 lines, bmad-patches.ts: 124 lines), a BMAD epics/stories markdown parser and bridge command for importing stories into beads (bridge.ts: 128 lines), and a bidirectional sync system between beads issue status, story file status, and sprint-status.yaml (beads-sync.ts: 510 lines, sync.ts: 112 lines).

By the end of Epic 3, the project has 3,385 lines of production TypeScript across 24 source files and 6,163 lines of test code across 23 test files. All 501 unit tests pass. Coverage sits at 98.56% statements, 90.6% branches, 99.3% functions, 99.34% lines. The init command grew from 398 lines (Epic 2) to 517 lines. Six new production modules were created (beads.ts, beads-sync.ts, bmad.ts, patch-engine.ts, bmad-patches.ts, bridge.ts, sync.ts) and init.ts was extended with beads and BMAD initialization steps.

---

## What Went Well

### 1. Four-Story Decomposition Was Well-Ordered

The sequence — beads wrapper first (3.1), BMAD patching second (3.2), bridge/parser third (3.3), sync fourth (3.4) — created clean dependency chains. Each story consumed outputs from the previous one: 3.2 used the init infrastructure from 3.1, 3.3 used beads.ts from 3.1 and bmad.ts from 3.2, 3.4 used the bridge-created links from 3.3. No story required rework of an earlier story's code.

### 2. Patch Engine Design Is Robust

The marker-based patch engine (patch-engine.ts) is a clean separation of concerns. It handles apply, update, remove, and detect operations with idempotency guarantees. The markers (`<!-- CODEHARNESS-PATCH-START:{name} -->` / `<!-- CODEHARNESS-PATCH-END:{name} -->`) are readable in the patched files and survive manual edits to surrounding content. The engine validates patch names and detects corrupted marker ordering. Five distinct patches are applied to BMAD workflow files, and the system is extensible for future patches.

### 3. Dependency Injection Pattern in Sync Module

The beads-sync.ts module accepts `beadsFns` as an injected parameter rather than importing beads.ts functions directly. This avoids circular dependencies (beads.ts does not import beads-sync.ts), makes the sync functions fully testable without mocking module imports, and allows callers to provide cached issue lists (syncAll caches a single listIssues call for all iterations). This pattern should be replicated in future modules that need beads access.

### 4. Epics Parser Handles Real-World Format

The parseEpicsFile() function handles the actual format of `_bmad-output/planning-artifacts/epics.md` — including duplicate epic headers (summary section vs full definition), stories without acceptance criteria, technical notes sections, and Given/When/Then AC blocks. A test fixture (`test/fixtures/sample-epics.md`) was created for unit tests, and the parser was also tested against the real epics file.

### 5. Test Growth Kept Pace

From 270 tests (Epic 2) to 501 tests (Epic 3) — an 85% increase. Nine new test files were created (beads.test.ts, bmad.test.ts, bmad-parser.test.ts, bmad-bridge.test.ts, patch-engine.test.ts, bmad-patches.test.ts, beads-sync.test.ts, bridge.test.ts, sync.test.ts). The test-to-production ratio is ~1.82:1 by lines (6,163 test / 3,385 production), maintaining the strong testing discipline from earlier epics.

---

## What Could Be Improved

### 1. index.ts Error Handler Path Still Uncovered (Lines 40-41)

This was first flagged in the Epic 1 retrospective (action A4), carried to Epic 2 (action A3), and explicitly targeted in Epic 3 stories 3.1 and 3.2 as a carried action item. It is still uncovered at 88.23% statements. The file was simplified from the original error handler pattern (the uncovered lines are now the `if (!process.env['VITEST'])` conditional entry point block), but the underlying issue persists — CLI entry point code that only executes outside of test environments is structurally hard to cover without an integration test. Three epics have now passed without resolving this. It should be addressed definitively via the subprocess integration test planned for Epic 4.

### 2. Branch Coverage Declined Slightly (91.3% -> 90.6%)

Despite adding 231 new tests, overall branch coverage dropped from 91.3% (Epic 2) to 90.6% (Epic 3). The new modules have meaningful branch gaps: beads.ts at 86.11%, beads-sync.ts at 83.33%, bmad.ts at 87.17%. These represent error handling paths (BeadsError construction from non-Error throwables, initBeads skipping when already initialized, JSON parse failures). The Epic 2 retro action A4 (improve branch coverage to 95%+) was not achieved — the target was carried but not enforced.

### 3. Story Files Still Show "Status: ready-for-dev"

This is now a three-epic-old finding. All four story markdown files (3-1 through 3-4) still have `Status: ready-for-dev` in their headers while sprint-status.yaml correctly shows them as `done`. Ironically, Story 3.4 implemented the exact sync mechanism (`updateStoryFileStatus()`) that could fix this, but the sync was not run against the project's own story files. The tooling exists — the process to use it does not.

### 4. init.ts Continues to Grow (517 Lines)

Init.ts grew from 398 lines (Epic 2) to 517 lines (Epic 3), a 30% increase. It now orchestrates: stack detection, Docker check, dependency install, beads init, BMAD install, BMAD patching, bmalph detection, state file creation, docs scaffold, OTLP instrumentation, and Docker stack management. While it remains an orchestrator calling into focused modules (the Epic 1/2 retro pattern), 517 lines is getting large for a single command file. The function is cohesive (all steps are part of init) but long.

### 5. sync.ts Has Lower Function Coverage (85.71%)

The sync command has two uncovered branch/function paths at lines 59 and 75. The `registerSyncCommand` function itself is covered, but some internal branches (single-story beads-to-files lookup, error catch block) are not fully exercised. This is one of only two files below 100% function coverage (along with index.ts).

---

## Lessons Learned

### L1: Dependency Injection Beats Module Mocking

The beads-sync.ts approach of accepting `beadsFns` as a parameter produces cleaner tests than the older pattern of mocking module imports. Tests directly pass mock functions, making the test setup explicit and avoiding `vi.mock()` module-level hoisting issues. Future modules that need external service access should follow this injection pattern.

### L2: Marker-Based Patching Is a Viable Strategy for Workflow Enforcement

The patch engine's approach — HTML comment markers with content replacement — is simple but effective. It survives BMAD upgrades (markers are preserved unless the user deliberately removes them), supports idempotent re-application, and the markers are self-documenting. This strategy could be extended to patch other config files (e.g., CI configs, linter configs) in future epics.

### L3: The Two-Layer Model (Beads + Story Files) Requires Active Sync

The architecture decision to split status (beads) from content (story files) is sound for separation of concerns, but it creates a sync burden. Without active synchronization, the two layers drift immediately. Story 3.4's sync module addresses this programmatically, but the project's own development process doesn't yet use it — the story files within _bmad-output/ are out of sync with sprint-status.yaml. The sync command needs to be part of the standard workflow.

### L4: Carried Action Items Need Enforcement, Not Just Tracking

Epic 2 retro actions A3 (index.ts coverage) and A4 (branch coverage 95%+) were explicitly listed in Stories 3.1 and 3.2 task lists. Both were tracked but not completed. Listing action items in story files is insufficient — they get deprioritized against the story's own acceptance criteria. Action items that carry across two+ epics need a harder gate: either a pre-merge check that blocks completion, or a dedicated "tech debt" story that is the entire scope.

### L5: Sprint-Status.yaml Is the Third Source of Truth

With beads (status), story files (content + status), and sprint-status.yaml (status), there are now three places that track story completion status. The sync module handles beads <-> story files, and Story 3.4 added sprint-status.yaml updates in the sync path. But manual updates to sprint-status.yaml (like the ones in this retro) bypass the sync system entirely. Either sprint-status.yaml should be generated from beads, or the sync system should be the only way to update it.

---

## Action Items for Subsequent Epics

| # | Action | Target Epic | Owner |
|---|--------|-------------|-------|
| A1 | Add integration test that runs `codeharness init` as a subprocess and verifies full output + file creation (carried from Epic 1, Epic 2) | Epic 4 | Dev |
| A2 | Cover the index.ts entry point block (lines 40-41) via the subprocess integration test — three epics overdue | Epic 4 | Dev |
| A3 | Improve branch coverage to 95%+ across all modules — specifically beads.ts (86.11%), beads-sync.ts (83.33%), bmad.ts (87.17%), deps.ts (84.37%), docker.ts (83.33%) | Epic 4 | Dev |
| A4 | Run `codeharness sync` against the project's own story files after each story completion to keep story file Status fields in sync (process fix, not code fix) | Ongoing | SM |
| A5 | Update architecture spec to reflect actual plugin artifact locations: `hooks/`, `knowledge/`, `skills/` at repo root (carried from Epic 2 A5) | Epic 4 | Architect |
| A6 | Consider extracting init.ts step functions into a step-runner or splitting into init-steps/ directory if it exceeds 600 lines in Epic 4 | Epic 4 | Dev |
| A7 | Create a dedicated tech-debt story for carried action items that have survived 2+ epics, rather than appending them to feature stories | Epic 4 | SM |

---

## Epic 2 Retro Action Item Status

| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Integration test for `codeharness init` as subprocess | Carried to Epic 4 | Gap is now larger with 9 command registrations, beads init, BMAD install |
| A2 | Automate story file status updates or remove Status field | Not done | Story 3.4 built the mechanism (updateStoryFileStatus), but it's not used in the dev workflow |
| A3 | Cover the error handler path in index.ts | Not done | File refactored (now lines 40-41 not 38-39), but still uncovered. Three epics overdue. |
| A4 | Improve branch coverage to 95%+ in deps.ts, docker.ts, otlp.ts, state.ts | Not done | Branch coverage declined from 91.3% to 90.6%. New modules added more uncovered branches. |
| A5 | Update architecture spec for plugin artifact locations | Not done | Carried again. Architect action — no code story has addressed it. |
| A6 | Add automated check for stale Docker image version pins | Carried to Epic 4 | No change — not in Epic 3 scope |
| A7 | Update story 2.3 task list references from plugin/ to repo-root paths | Not done | Low priority, not in Epic 3 scope |

---

## Next Epic Readiness

**Epic 4: Verification & Quality Gates** is next in the backlog. It covers:
- Story 4-1: Verification pipeline & Showboat integration
- Story 4-2: Hook architecture & enforcement
- Story 4-3: Testing coverage & quality gates
- Story 4-4: Documentation health & freshness enforcement

**Prerequisites met:**
- Beads CLI wrapper provides `createIssue()` for hooks to file bugs (Story 3.1)
- BMAD workflow patches add verification requirements to stories (Story 3.2)
- Bridge command can import epics into beads for tracking (Story 3.3)
- Sync system keeps beads/story/sprint-status in sync (Story 3.4)
- Patch engine can be reused for additional enforcement patches
- 501 passing tests with 98.56% statement coverage provide a safety net

**Risks for Epic 4:**
- Showboat is an external tool — its CLI interface stability and availability need verification before Story 4.1 begins.
- Hook architecture (Story 4.2) touches multiple systems: Claude Code hooks (hooks.json), git hooks, beads hooks. Integration testing these is complex.
- Quality gates (Story 4.3) will enforce coverage thresholds. If the current 90.6% branch coverage isn't raised first, the gates may fail on the project itself. Addressing carried action A3 early in Epic 4 would reduce this risk.
- Documentation freshness enforcement (Story 4.4) depends on having up-to-date AGENTS.md files. The current state of AGENTS.md files hasn't been audited.

---

## Metrics

- **Stories planned:** 4
- **Stories completed:** 4
- **Stories failed:** 0
- **New production TypeScript files created:** 7 (beads.ts, beads-sync.ts, bmad.ts, patch-engine.ts, bmad-patches.ts, bridge.ts, sync.ts)
- **Modified production TypeScript files:** 2 (init.ts extended, index.ts extended with sync command registration)
- **Total production TypeScript files:** 24
- **Total production lines of code:** 3,385
- **New test files created:** 9 (beads, bmad, bmad-parser, bmad-bridge, patch-engine, bmad-patches, beads-sync, bridge, sync)
- **Total test files:** 23
- **Total unit tests:** 501 (all passing)
- **Statement coverage:** 98.56%
- **Branch coverage:** 90.6%
- **Function coverage:** 99.3%
- **Line coverage:** 99.34%
- **Init command growth:** 398 lines (Epic 2) -> 517 lines (Epic 3), +29.9%
- **Build output:** ESM bundle via tsup
- **Test execution time:** ~1.10s (vitest)
- **Epic 2 retro actions resolved:** 0 of 7 (all carried or not addressed)
