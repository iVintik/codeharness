# Epic 8 Retrospective: Onboarding Hardening & Issue Deduplication

**Epic:** Epic 8 — Onboarding Hardening & Issue Deduplication
**Date:** 2026-03-15
**Stories Completed:** 4 (8-1, 8-2, 8-3, 8-4)
**Status:** All stories done
**Final Epic:** Yes — this is the last epic in the codeharness project.

---

## Epic Summary

Epic 8 hardened the `codeharness onboard` pipeline to be state-aware, incremental, and deduplication-safe. The four stories built on each other in strict dependency order: 8-1 laid the gap-id foundation, 8-2 added precondition checks and gap filtering, 8-3 extended gap detection to three new dimensions, and 8-4 added scan caching and progress tracking.

**Story 8.1 — Stable Issue Identity & Beads-Level Deduplication** introduced a `[gap:<category>:<identifier>]` tag system embedded in beads issue descriptions. This replaced the fragile title-based dedup in `importStoriesToBeads` with deterministic, content-addressable identity. New functions `buildGapId()`, `findExistingByGapId()`, `createOrFindIssue()`, and `appendGapId()` were added to `src/lib/beads.ts`. The bridge command and post-test-verify hook were updated to use gap-id-based dedup. The key insight: a gap's *identity* is separate from its *title* — the gap-id captures identity, while the title is for humans.

**Story 8.2 — Onboard Precondition Checks & State Awareness** added a precondition gate at the top of every `onboard` action: hard-fail if the harness isn't initialized, soft-warn if BMAD or hooks are missing. A `--full` flag was added to override the new gap filtering behavior. The `filterTrackedGaps()` function uses gap-ids from 8-1 to suppress already-tracked gaps on re-runs, and `storyToGapId()` maps each story type to its gap-id category. Both functions live in the new `src/lib/onboard-checks.ts` module.

**Story 8.3 — Extended Gap Detection** broadened the scanner from three gap categories (module coverage, docs, bmalph cleanup) to seven by adding verification gaps (done stories without proof documents), per-file coverage gaps (files individually below 80%), and observability gaps (OTLP config and Docker stack status). The `OnboardingStory` type was extended with `verification` and `observability` types, and `storyToGapId()` was updated to map them. Observability detection respects the `enforcement.observability` state flag — if disabled, no observability gaps are generated.

**Story 8.4 — Scan Persistence & Onboarding Progress Tracking** added two capabilities. Scan caching persists scan/coverage/audit results to `.harness/last-onboard-scan.json` with a 24-hour TTL, avoiding redundant scans across sessions. The `--force-scan` flag bypasses the cache. Progress tracking derives onboarding completion from beads issues: `getOnboardingProgress()` counts gap-tagged issues and reports "X/Y gaps resolved (Z remaining)". When all gaps are resolved, onboard prints "Onboarding complete" and exits early. The `.harness/` directory was added to `.gitignore` and teardown cleanup.

By the end of Epic 8, the project has 8,144 lines of production TypeScript across 36 source files and 14,276 lines of test code across 38 test files. All 1,001 unit tests pass. Coverage sits at 95.23% statements, 85.09% branches, 98.10% functions, 95.62% lines. Test execution time is ~1.63s.

---

## What Went Well

### 1. The Gap-ID System Is a Clean Abstraction

The `[gap:<category>:<identifier>]` format is simple, deterministic, and extensible. It solved dedup not just for the onboard command but across the entire pipeline: bridge imports, post-test-verify hooks, and onboarding epic generation all share the same mechanism. The decision to embed gap-ids in issue descriptions (rather than a separate metadata field) was pragmatic — it works with beads as-is without schema changes. Story 8-3 validated the extensibility by adding `verification` and `observability` categories with zero changes to the core gap-id infrastructure.

### 2. Four-Story Epic With Clean Dependencies Delivered Without Rework

Stories 8-1 through 8-4 formed a strict dependency chain: each story built on the previous one's output. Despite this, no story required rework of a predecessor. The story decomposition correctly anticipated the interfaces: 8-1's `buildGapId` and `findExistingByGapId` were used exactly as designed by 8-2's `filterTrackedGaps`, 8-3's new story types plugged into 8-2's `storyToGapId` switch, and 8-4's progress tracking reused the gap-id regex pattern established in 8-1.

### 3. Coverage Improved Significantly

Statement coverage rose from 92.56% to 95.23% (+2.67 points), branch coverage from 82.71% to 85.09% (+2.38 points), function coverage from 96.07% to 98.10% (+2.03 points), and line coverage from 93.04% to 95.62% (+2.58 points). This is the largest single-epic coverage improvement in the project. The new modules (`onboard-checks.ts`, `scan-cache.ts`) were written with thorough test suites, and the gap-id functions in `beads.ts` brought additional coverage to that file.

### 4. Test Count Grew Substantially

From 856 tests in Epic 7 to 1,001 in Epic 8 — a 16.9% increase. This is the largest test count jump in any single epic, reflecting the four-story scope and the testability of the new pure-function modules (gap-id builders, cache validators, precondition checks, progress counters).

### 5. Fail-Open Pattern Applied Consistently

Every external dependency check (beads unavailable in `filterTrackedGaps`, beads unavailable in `getOnboardingProgress`, state file missing in `findObservabilityGaps`, cache file corrupt in `loadScanCache`) fails open rather than blocking the command. This means partial infrastructure failures degrade gracefully to "show everything" rather than crashing.

---

## What Could Be Improved

### 1. run.ts Still at Low Coverage — Accepted as Permanent Technical Debt

Carried since Epic 5 (three epics ago). The primary autonomous execution command was never properly tested. For a tool whose core value proposition is autonomous execution, this remains the project's most significant quality gap. This was the final epic; no further action will be taken.

### 2. verify.ts Branch Coverage Still Below Target

Carried since Epic 4. The verification orchestrator's branch coverage was never raised to target levels. Like run.ts, this is now permanent technical debt.

### 3. Story File Status Headers Still Show "ready-for-dev"

All four story files (8-1 through 8-4) show `Status: ready-for-dev` in their headers while sprint-status.yaml correctly shows `done`. This divergence has persisted across all eight epics without being addressed. The `codeharness sync` command exists but was never integrated into the workflow.

### 4. No Integration Tests for the Full Onboard Pipeline

Each new function has unit tests, but there are no end-to-end tests that exercise the full onboard pipeline: preconditions -> cache check -> scan -> coverage -> audit -> extended gaps -> gap filtering -> progress tracking -> epic generation. The pipeline involves eight modules interacting in sequence, and the integration surface is tested only indirectly through command-level tests with mocked dependencies.

---

## Lessons Learned

### L1: Content-Addressable Identity Beats Title-Based Matching Every Time

The title-based dedup in the original `importStoriesToBeads` was inherently fragile: rename a story title and dedup breaks. The gap-id system uses structured, deterministic identifiers derived from the *nature* of the gap (category + path/key), not from human-readable labels. This pattern applies broadly: any system that needs to detect "same thing" across sessions should use a content-addressable identity, not a display name.

### L2: Preconditions Should Be Designed Into Commands From the Start

The onboard command ran for six epics without precondition checks. Adding them in Epic 8 was straightforward technically but revealed a design gap: commands should validate their prerequisites at the top of every action handler from day one. The cost of adding preconditions later is low, but the cost of debugging failures caused by missing prerequisites (init not run, BMAD not installed) is high. Future CLI tools should include a `runPreconditions()` gate in their command template.

### L3: Cache Modules Are Small, Self-Contained, and Worth Extracting Early

`scan-cache.ts` is 99 lines — four functions with clear inputs and outputs. It could have been part of `onboard.ts` or `state.ts`, but extracting it as a standalone module made it trivially testable (178 lines of focused tests). The lesson: any read/write/validate cycle for persistent data should be its own module, regardless of how small it is. The separation pays for itself in test clarity.

### L4: Four-Story Epics Work When Dependencies Are Linear

Epics 5-7 used two-story scopes, which worked well for independent deliverables. Epic 8 returned to four stories but with a strict linear dependency chain (8-1 -> 8-2 -> 8-3 -> 8-4). This worked because each story's output type and interface were predictable from the acceptance criteria — there was no ambiguity about what 8-1 would produce for 8-2 to consume. The risk with four-story epics is when stories have unclear interfaces; the risk with two-story epics is scope fragmentation. Choose based on dependency clarity.

### L5: Retrospective Action Items Without Enforcement Mechanisms Are Documentation, Not Drivers

This lesson was identified in Epic 7 (L3) and is confirmed by the final state of the project: run.ts coverage, verify.ts branch coverage, story status sync, and coverage enforcement in CI were flagged as action items across multiple retrospectives and none were resolved. The project completed all planned features without addressing any of these recurring action items. For future projects, the only action items that get resolved are those encoded as automated gates (failing tests, CI checks, pre-commit hooks). Everything else is aspirational documentation.

---

## Epic 7 Retro Action Item Status

| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Cover run.ts action handler (lines 110-276) | Not done | Permanent technical debt. |
| A2 | Raise scanner.ts branch coverage from 74.1% to 90%+ | Not done | Permanent technical debt. |
| A3 | Raise overall branch coverage from 82.32% to 85%+ | Done | Branch coverage reached 85.09% through Epic 8's new modules. |
| A4 | Wire `codeharness coverage` into pre-commit gate or CI | Not done | Permanent technical debt. |
| A5 | Run `codeharness sync` after story completion | Not done | Ninth consecutive carry. Permanent process gap. |

**Summary:** 1 of 5 action items from Epic 7 was resolved (A3 — branch coverage crossed 85% organically through Epic 8's new code, not through targeted action on the debt items).

---

## Overall Project Summary (Final)

Codeharness was built across 9 epics (Epic 0 through Epic 8), delivering a CLI development harness for Claude Code that instruments projects with observability, quality gates, issue tracking, brownfield onboarding, and autonomous execution capabilities.

### Epic Timeline

| Epic | Focus | Stories | Key Deliverables |
|------|-------|---------|------------------|
| 0 | Sprint Execution Skill | 1 | `/harness-run` in-session sprint loop |
| 1 | Project Scaffold | 3 | CLI entry point, core libraries, `init` command |
| 2 | Observability Stack | 3 | Dependency install, Docker Compose, OTLP, observability querying |
| 3 | Beads & BMAD Integration | 4 | Beads install/CLI, BMAD install/patching, parser bridge, issue sync |
| 4 | Verification & Quality | 4 | Verification pipeline, hook architecture, testing/coverage, doc health |
| 5 | Ralph Loop Integration | 2 | Ralph task source, verification gates, termination tracking |
| 6 | Brownfield Onboarding | 2 | Codebase scan, coverage gap analysis, onboarding epic generation |
| 7 | Status & Lifecycle | 2 | Status command, clean teardown |
| 8 | Onboarding Hardening | 4 | Gap-id dedup, precondition checks, extended gap detection, scan caching, progress tracking |

### Final Metrics

- **Total production TypeScript:** 8,144 lines across 36 source files
- **Total test code:** 14,276 lines across 38 test files
- **Total unit tests:** 1,001 (all passing)
- **Statement coverage:** 95.23%
- **Branch coverage:** 85.09%
- **Function coverage:** 98.10%
- **Line coverage:** 95.62%
- **Test execution time:** ~1.63s
- **Build system:** tsup (ESM bundle)
- **Test framework:** vitest
- **Test-to-production ratio:** 1.75x (14,276 / 8,144)

### Growth Across Epics

| Metric | Epic 7 (End) | Epic 8 (End) | Delta |
|--------|-------------|-------------|-------|
| Production lines | 7,297 | 8,144 | +847 (+11.6%) |
| Test lines | 12,059 | 14,276 | +2,217 (+18.4%) |
| Unit tests | 856 | 1,001 | +145 (+16.9%) |
| Source files | 34 | 36 | +2 |
| Test files | 36 | 38 | +2 |
| Statement coverage | 92.56% | 95.23% | +2.67 pts |
| Branch coverage | 82.71% | 85.09% | +2.38 pts |
| Function coverage | 96.07% | 98.10% | +2.03 pts |
| Line coverage | 93.04% | 95.62% | +2.58 pts |

### Known Technical Debt (Final State)

| Item | Coverage | Carried Since |
|------|----------|---------------|
| run.ts action handler (lines 110-276) | ~30% statements | Epic 5 |
| verify.ts branch coverage | ~63% branches | Epic 4 |
| Story file status headers vs sprint-status.yaml | N/A | Epic 1 |
| Coverage enforcement not in CI/pre-commit | N/A | Epic 4 |

### What the Project Got Right

1. **Library-first architecture:** Well-factored modules enabled heavy reuse. Epic 8's four stories composed `buildGapId`, `findExistingByGapId`, `readSprintStatus`, `checkPerFileCoverage`, `readState`, `isStackRunning`, and `listIssues` from existing libraries without modification.
2. **Gap-id system as a cross-cutting concern:** A single identity mechanism unified dedup across bridge, onboard, hooks, and progress tracking.
3. **Fail-open pattern:** External dependency failures (beads, Docker, state file) degrade to "show everything" rather than crashing — critical for a CLI tool that runs in varied environments.
4. **Test investment from day one:** 14,276 lines of test code with 1,001 tests running in 1.63s. The 1.75x test-to-production ratio reflects genuine coverage, not test bloat.
5. **Consistent output formatting:** `ok()`, `fail()`, `info()`, `warn()`, `jsonOutput()` used everywhere gave uniform CLI presentation across all commands.

### What the Project Should Have Done Differently

1. **Coverage enforcement was never automated.** Flagged in every retrospective from Epic 4 onward, never addressed. The tool can check coverage but doesn't enforce it on itself.
2. **run.ts was never properly tested.** The autonomous execution command — the tool's core value proposition — stayed at ~30% coverage for four epics.
3. **Retrospective action items had no teeth.** Without automated enforcement, action items were carried forward and eventually dropped. The only action item that was "resolved" (branch coverage reaching 85%) happened organically through new code, not through targeted effort.
4. **Integration tests were never written for multi-module pipelines.** Each module is well unit-tested in isolation, but the onboard pipeline (8 modules in sequence) and the run pipeline have no end-to-end tests.

---

## Metrics

- **Stories planned:** 4
- **Stories completed:** 4
- **Stories failed:** 0
- **New production TypeScript files created:** 2 (onboard-checks.ts, scan-cache.ts)
- **Production files substantially modified:** 4 (beads.ts, epic-generator.ts, onboard.ts, bridge.ts)
- **Total new production lines:** ~847 (8,144 - 7,297)
- **Total production TypeScript files:** 36 (up from 34)
- **Total production lines of code:** 8,144
- **Test files created:** 2 (onboard-checks.test.ts, scan-cache.test.ts)
- **Total new test lines:** ~2,217 (14,276 - 12,059)
- **Total test files:** 38 (up from 36)
- **Total unit tests:** 1,001 (up from 856, +16.9%)
- **Total test lines:** 14,276 (up from 12,059, +18.4%)
- **Statement coverage:** 95.23% (up from 92.56%)
- **Branch coverage:** 85.09% (up from 82.71%)
- **Function coverage:** 98.10% (up from 96.07%)
- **Line coverage:** 95.62% (up from 93.04%)
- **Build output:** ESM bundle via tsup
- **Test execution time:** ~1.63s (vitest)
- **Epic 7 retro actions resolved:** 1 of 5 (A3 resolved organically)
