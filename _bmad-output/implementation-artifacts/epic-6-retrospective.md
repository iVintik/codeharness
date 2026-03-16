# Epic 6 Retrospective: Brownfield Onboarding

**Epic:** Epic 6 — Brownfield Onboarding
**Date:** 2026-03-15
**Stories Completed:** 2 (6-1, 6-2)
**Status:** All stories done

---

## Epic Summary

Epic 6 delivered the brownfield onboarding pipeline for codeharness. It enables developers with existing projects to run `codeharness onboard` to scan their codebase, identify coverage gaps, audit documentation quality, generate an onboarding epic with prioritized stories, and import those stories into beads after user approval.

The epic produced three new production modules: `src/lib/scanner.ts` (493 lines) for codebase scanning, module detection, coverage gap analysis, and documentation auditing; `src/lib/epic-generator.ts` (320 lines) for generating onboarding epics from scan findings, writing them to markdown, prompting for user approval, and importing into beads; and `src/commands/onboard.ts` (245 lines) replacing the previous stub with a full multi-phase command supporting `scan`, `coverage`, `audit`, and `epic` subcommands, `--min-module-size`, `--auto-approve`, and `--json` flags. Total new production code: 1,058 lines across 3 files.

Three corresponding test files were created: `scanner.test.ts` (382 lines), `epic-generator.test.ts` (634 lines), and `onboard.test.ts` (415 lines). Total new test code: 1,431 lines across 3 files.

By the end of Epic 6, the project has 6,852 lines of production TypeScript across 34 source files and 11,201 lines of test code across 36 test files. All 807 unit tests pass. Coverage sits at 92.33% statements, 82.32% branches, 95.95% functions, 92.85% lines. Test execution time remains at ~1.45s.

The epic's major contribution is completing the onboarding pipeline: scan -> coverage -> audit -> epic generation -> approval -> beads import. This is Architecture Decision 9 fully realized.

---

## What Went Well

### 1. Clean Three-Module Architecture

The separation of scanner.ts (data gathering), epic-generator.ts (plan creation), and onboard.ts (CLI orchestration) follows a clean data-flow pattern. Each module has a single responsibility: scanner produces findings, epic-generator transforms findings into stories, and onboard.ts wires the pipeline together with CLI concerns (subcommands, flags, output formatting). This made testing straightforward — each module can be tested independently with mocked inputs.

### 2. Substantial Test Investment

Epic 6 added 69 new tests (738 -> 807, a 9.3% increase) and 1,431 lines of test code. The epic-generator.ts module achieved excellent coverage (97.11% statements, 88.88% branches). The onboard.ts command achieved 97% statement coverage. This is the highest test growth rate of any epic since Epic 1.

### 3. Effective Code Reuse from Prior Epics

Story 6.1's dev notes identified `findModules()` from doc-health.ts and `detectCoverageTool()`/`runCoverage()` from coverage.ts as reuse targets. The scanner module leveraged these existing functions rather than reimplementing them. Story 6.2 reused `parseEpicsFile()` and `importStoriesToBeads()` from bmad.ts for the beads import phase. This is the first epic where prior investment in library code paid off directly.

### 4. Subcommand Design Enables Phased Usage

The `onboard scan`, `onboard coverage`, `onboard audit`, and `onboard epic` subcommands allow developers to run individual phases independently. This is useful for large codebases where coverage analysis may be slow, and for debugging specific phases. The bare `codeharness onboard` runs all phases sequentially. This design pattern should be used for future multi-phase commands.

### 5. First Interactive Prompt in the CLI

The `promptApproval()` function in epic-generator.ts introduces the first interactive prompt. The `--auto-approve` flag provides a non-interactive escape hatch for CI and Ralph usage. The implementation is clean — readline-based, with JSON mode bypassing the prompt entirely. This establishes the pattern for any future interactive commands.

---

## What Could Be Improved

### 1. scanner.ts Has the Second-Lowest Coverage in the Codebase (84.48% statements, 74.1% branches)

The scanner module contains 493 lines but achieves only 84.48% statement coverage and 74.1% branch coverage. Uncovered lines include the coverage gap analysis path (lines 397-418) and parts of the documentation audit (line 464). For a module that is foundational to the onboarding pipeline, this coverage level is insufficient. The per-module coverage aggregation logic and edge cases in the doc audit (stale detection thresholds, missing docs directory) appear to be the primary gaps.

### 2. run.ts Remains at 29.8% Statement Coverage — Sixth Epic Without Improvement

The `codeharness run` command action handler (lines 110-276) is still almost entirely uncovered. This was flagged as action item A1 in the Epic 5 retrospective with explicit instructions to create a shared spawn mock helper. It was not addressed. The run command is the primary user-facing command for autonomous execution, and it remains essentially untested at the integration level.

### 3. Overall Coverage Stagnated (92.45% -> 92.33% statements, 82.4% -> 82.32% branches)

Coverage effectively flatlined rather than improving. While this is better than the declining trend of Epics 2-5, it means the new code added roughly matched the project average — no progress was made on the pre-existing coverage gaps. The action item to raise branch coverage from 82.4% to 90%+ (A3 from Epic 5) was not addressed.

### 4. verify.ts Still at 62.79% Branch Coverage

This has been flagged in every retrospective since Epic 4. Lines 68-81 remain uncovered. The verification orchestrator is the foundation of the quality enforcement pipeline and has the lowest branch coverage in the codebase.

### 5. index.ts Entry Point Still Uncovered (Lines 44-45) — Sixth Epic Running

The `if (!process.env['VITEST'])` conditional block remains at 89.47% statement coverage. Per Epic 5's retrospective, this was to be resolved in Epic 6 or dropped permanently. It was neither resolved nor dropped. Dropping it now — this is accepted technical debt.

### 6. Story File Statuses Still Diverge from sprint-status.yaml

Both story 6-1 and 6-2 files show `Status: ready-for-dev` despite being marked `done` in sprint-status.yaml. This is the sixth consecutive epic with this divergence. The `codeharness sync` command exists but is not used in the development workflow.

---

## Lessons Learned

### L1: Library Investment Compounds — Epic 6 Proved It

Epics 1-4 built doc-health.ts, coverage.ts, bmad.ts, and beads.ts as general-purpose libraries. Epic 6 was the first epic to reuse multiple libraries substantially. The scanner module called `findModules()`, `isDocStale()`, `detectCoverageTool()`, and `runCoverage()`. The epic generator called `parseEpicsFile()` and `importStoriesToBeads()`. This reuse reduced the amount of new code needed and increased confidence in the implementation because the underlying functions were already tested. The lesson: investing in well-tested, reusable library functions pays off when later features compose them.

### L2: Coverage Gaps Are Self-Perpetuating Without Automated Enforcement

Six epics of retrospective findings about coverage decline, and zero automated enforcement has been implemented. The `codeharness coverage` command can check coverage against a target, but it has never been wired into pre-commit hooks or CI. Manual tracking in retrospectives demonstrably does not drive improvement. The project continues to build coverage enforcement tooling while not enforcing its own coverage. This action item (A4 from Epic 5, originally from Epic 4) should either be implemented in Epic 7 or explicitly deprioritized and removed from the backlog.

### L3: scanner.ts Needs Integration-Level Testing for Coverage Analysis

The scanner's `analyzeCoverageGaps()` function depends on parsing coverage report JSON files produced by vitest/c8. Unit tests with mocked data verify the aggregation logic, but the integration with real coverage output (JSON format, file path mapping to modules) is harder to test without running actual coverage. A dedicated integration test that runs coverage on a small fixture project would catch format mismatches and parsing edge cases that unit tests miss.

### L4: Two-Story Epics Are the Right Size for This Project

Both Epic 5 and Epic 6 were two-story epics. Both delivered cleanly. The focused scope kept each story manageable (7 tasks each) and the two stories had a clear dependency (6.1 produces data, 6.2 consumes it). Compared to four-story epics (3, 4) where later stories sometimes lost context or accumulated technical debt, two-story epics with clear data flow between them appear to be the sweet spot.

---

## Action Items for Subsequent Epics

| # | Action | Target Epic | Owner |
|---|--------|-------------|-------|
| A1 | Cover run.ts action handler (lines 110-276) — at 29.8% statements for two epics now. Create a shared spawn mock helper. | Epic 7 | Dev |
| A2 | Raise scanner.ts branch coverage from 74.1% to 90%+ — cover coverage gap analysis (lines 397-418) and doc audit edge cases. | Epic 7 | Dev |
| A3 | Raise overall branch coverage from 82.32% to 85%+ — focus on verify.ts (62.79%), scanner.ts (74.1%), coverage.ts (76.37%). | Epic 7 | Dev |
| A4 | Wire `codeharness coverage` into pre-commit gate or CI — carried from Epic 4. If not done in Epic 7, drop permanently. | Epic 7 | Dev |
| A5 | Run `codeharness sync` after each story completion to keep story file statuses aligned with sprint-status.yaml. | Ongoing | SM |

---

## Epic 5 Retro Action Item Status

| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Cover run.ts action handler (lines 110-276) | Not done | Still at 29.8%. Carried to Epic 7. |
| A2 | Cover index.ts entry point (lines 44-45) — six epics overdue | Dropped | Accepted as permanent technical debt per Epic 5 retro guidance. |
| A3 | Raise branch coverage from 82.4% to 90%+ | Not done | Coverage flatlined at 82.32%. Carried with reduced target (85%+). |
| A4 | Wire coverage into pre-commit gate | Not done | Third epic carrying this. Final carry to Epic 7. |
| A5 | Run `codeharness sync` after story completion | Not done | Sixth epic of divergence. |
| A6 | Update architecture spec for plugin artifact locations | Not done | Carried from Epic 2. Dropping — low priority. |
| A7 | Update story 5-2 file header to done | Not done | Story files continue to diverge. |

**Summary:** 0 of 7 action items from Epic 5 were resolved. 1 dropped (A2 — accepted debt). 1 dropped (A6 — stale, low priority). 5 carried forward (A1, A3, A4, A5, consolidated; A7 subsumed by A5).

---

## Next Epic Readiness

**Epic 7: Status, Reporting & Lifecycle Management** is next in the backlog. It covers:
- Story 7-1: Status command & reporting
- Story 7-2: Clean teardown

**Prerequisites met:**
- Full onboarding pipeline operational (`codeharness onboard` -> scan -> epic -> beads import)
- Autonomous execution loop operational (`codeharness run` -> Ralph -> `/harness-run`)
- Sprint-status.yaml as single source of truth for task tracking
- Verification pipeline, hook architecture, and quality gates in place
- 807 passing tests provide a safety net
- status.ts and teardown.ts exist as stubs ready for implementation

**Risks for Epic 7:**
- Branch coverage at 82.32% remains below any reasonable quality target. If Epic 7 adds complex status aggregation logic with many conditional branches, it will drop further without deliberate effort to address the pre-existing gaps.
- run.ts at 29.8% coverage means the core autonomous execution command remains untested. The status command will likely query run state, and bugs in the run command's output handling would propagate silently.
- Five action items carried forward (four of which have been carried across multiple epics) indicates the retrospective process is identifying but not driving resolution of technical debt. Epic 7 should either address A1, A3, and A4, or the project should acknowledge that these gaps are accepted and stop carrying them.

---

## Metrics

- **Stories planned:** 2
- **Stories completed:** 2
- **Stories failed:** 0
- **New production TypeScript files created:** 3 (scanner.ts, epic-generator.ts, onboard.ts full implementation replacing stub)
- **Total new production lines:** 1,058 (scanner.ts: 493, epic-generator.ts: 320, onboard.ts: 245)
- **Total production TypeScript files:** 34 (up from 32 in Epic 5)
- **Total production lines of code:** 6,852 (up from 5,807 in Epic 5, +18.0%)
- **New test files created:** 3 (scanner.test.ts, epic-generator.test.ts, onboard.test.ts)
- **Total new test lines:** 1,431 (scanner.test.ts: 382, epic-generator.test.ts: 634, onboard.test.ts: 415)
- **Total test files:** 36 (up from 33 in Epic 5)
- **Total unit tests:** 807 (up from 738 in Epic 5, +9.3%)
- **Total test lines:** 11,201 (up from 9,772 in Epic 5, +14.6%)
- **Statement coverage:** 92.33% (down from 92.45%, effectively flat)
- **Branch coverage:** 82.32% (down from 82.4%, effectively flat)
- **Function coverage:** 95.95% (down from 96.8%)
- **Line coverage:** 92.85% (up from 92.78%, effectively flat)
- **Build output:** ESM bundle via tsup
- **Test execution time:** ~1.45s (vitest)
- **Epic 5 retro actions resolved:** 0 of 7 (1 dropped as accepted debt, 1 dropped as stale)
