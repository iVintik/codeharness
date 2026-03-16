# Epic 4 Retrospective: Verification Pipeline & Quality Enforcement

**Epic:** Epic 4 — Verification Pipeline & Quality Enforcement
**Date:** 2026-03-15
**Stories Completed:** 4 (4-1, 4-2, 4-3, 4-4)
**Status:** All stories done

---

## Epic Summary

Epic 4 delivered the full verification pipeline and quality enforcement layer for codeharness. Building on the CLI foundation (Epic 1), observability stack (Epic 2), and beads/BMAD integration (Epic 3), the epic produced: a Showboat proof document generator and verification orchestrator (verify-parser.ts: 153 lines, verify.ts: 219 lines, showboat-template.ts: 110 lines, commands/verify.ts: 191 lines), a mechanical hook enforcement system with four Claude Code hooks (session-start.sh, pre-commit-gate.sh, post-write-check.sh, post-test-verify.sh — 241 lines of shell, hooks.json: 52 lines), a coverage tool detection and quality gate system (coverage.ts: 474 lines, commands/coverage.ts: 113 lines), and a documentation health scanner with exec-plan lifecycle management (doc-health.ts: 710 lines, commands/doc-health.ts: 76 lines).

By the end of Epic 4, the project has 5,457 lines of production TypeScript across 31 source files and 9,378 lines of test code across 31 test files. All 702 unit tests pass. Coverage sits at 95.94% statements, 85.5% branches, 99.04% functions, 96.4% lines. Eight new production modules were created (verify-parser.ts, verify.ts, showboat-template.ts, coverage.ts, doc-health.ts, and commands for verify, coverage, doc-health). Four hook scripts were rewritten. The state command gained a `reset-session` subcommand. The status command gained `--check-docker`.

The epic's major contribution is closing the quality loop: tests must pass, coverage must meet target, documentation must be fresh, and verification must produce Showboat proof — all enforced mechanically by hooks that block commits when gates fail.

---

## What Went Well

### 1. Four-Story Sequence Built a Coherent Quality Pipeline

The ordering — verification pipeline first (4.1), hook enforcement second (4.2), coverage gates third (4.3), doc health fourth (4.4) — created a clean layered architecture. Story 4.1 established the state flags (`tests_passed`, `coverage_met`, `verification_run`) that Story 4.2's hooks read. Story 4.3 provided the mechanism to set those flags via real test execution. Story 4.4 added the documentation dimension to the verification preconditions. Each layer built on the previous without requiring rework.

### 2. Hook Architecture Fixes Were Overdue and Impactful

Story 4.2 fixed six critical bugs in the existing hook scripts: exit code 1 instead of 2 for intentional blocks, wrong JSON format for PreToolUse hooks, missing `verification_run` check, direct state file mutation via sed, incomplete hook registration in hooks.json (only 1 of 4 hooks registered), and `set -euo pipefail` causing silent failures. These bugs meant the enforcement system was essentially non-functional before Epic 4. The rewrites — canonical error traps, proper exit codes, fail-open behavior, CLI-mediated state mutations — made the hooks production-ready.

### 3. Test Count Growth Was Substantial

From 501 tests (Epic 3) to 702 tests (Epic 4) — a 40% increase. Eight new test files were created for the new modules. The test-to-production ratio is ~1.72:1 by lines (9,378 test / 5,457 production), maintaining the strong testing discipline from earlier epics. Test execution time remained fast at ~1.27s.

### 4. doc-health.ts findModules() Was Designed for Reuse

The `findModules()` function in doc-health.ts was deliberately designed to be reusable by Epic 6's onboarding scanner (`scanner.ts`). The threshold-based module detection (minimum 3 source files per NFR27), exclusion of test files and node_modules, and configurable directory parameter make it a solid foundation for the codebase scan story. This forward-looking design avoids duplicate work later.

### 5. Coverage Command Is Self-Dogfooding

The `codeharness coverage` command can be run against the codeharness project itself, detecting its own Vitest/c8 setup and reporting real coverage. This means the tool enforces its own quality standards — the coverage gate that prevents under-tested commits is itself tested by the coverage gate.

---

## What Could Be Improved

### 1. Branch Coverage Declined Further (90.6% -> 85.5%)

Branch coverage dropped from 90.6% (Epic 3) to 85.5% (Epic 4), a 5.1 percentage point decline. This is the third consecutive decline (91.3% in Epic 2, 90.6% in Epic 3). The new modules have significant branch gaps: src/lib/coverage.ts at 76.37%, src/lib/doc-health.ts at 77.12%, src/lib/verify.ts at 62.79%, src/commands/verify.ts at 77.27%. These represent error handling paths, fallback branches, and edge case code paths that are not exercised by tests. The carried action item from Epic 2 (improve branch coverage to 95%+) has now been carried across three epics and the metric has moved in the wrong direction.

### 2. Statement Coverage Also Declined (98.56% -> 95.94%)

Statement coverage dropped by 2.6 percentage points, from 98.56% (Epic 3) to 95.94% (Epic 4). Several modules are below 95%: src/lib/verify.ts at 85.48%, src/lib/coverage.ts at 87.05%, src/lib/doc-health.ts at 91.63%, src/commands/verify.ts at 93.75%. While the new modules are larger and more complex than earlier ones (doc-health.ts is 710 lines — the largest single module), the coverage decline contradicts the stated 100% coverage target for new code.

### 3. index.ts Entry Point Still Uncovered (Lines 44-45)

This is now a four-epic-old finding, first flagged in the Epic 1 retrospective. The uncovered lines are the `if (!process.env['VITEST'])` conditional entry point block. The subprocess integration test that was supposed to address this has been carried as an action item through Epics 1, 2, 3, and 4. At this point, the action item tracking system itself has failed — carrying the same item for four epics with no resolution demonstrates that listing it in story dev notes is insufficient enforcement.

### 4. Story Files Still Show "Status: ready-for-dev"

All four story files (4-1 through 4-4) have `Status: ready-for-dev` in their headers despite being marked `done` in sprint-status.yaml. This is a four-epic-old finding. Story 3.4 built the sync mechanism (`updateStoryFileStatus()`), and the `codeharness sync` command exists, but the project's own development process does not use it. The sync tooling works — the workflow to invoke it does not.

### 5. doc-health.ts Is the Largest Module at 710 Lines

At 710 lines, doc-health.ts is significantly larger than any other module (the next largest is init.ts at 517 lines, then beads-sync.ts at ~510 lines). It combines four distinct concerns: documentation scanning, freshness checking, module detection, and exec-plan lifecycle management. While the functions are cohesive to the "documentation health" domain, the file size makes it harder to navigate and test comprehensively (its 77.12% branch coverage is evidence of this).

### 6. verify.ts Has the Lowest Branch Coverage at 62.79%

The verification orchestrator (src/lib/verify.ts) at 62.79% branch coverage is the weakest-tested module in the codebase. Lines 68-81 are uncovered, suggesting error handling and fallback paths in the precondition checking and showboat integration are not exercised by tests. Given that this module is the foundation of the entire quality enforcement pipeline, its low coverage is particularly concerning.

---

## Lessons Learned

### L1: Coverage Targets Must Be Enforced, Not Declared

The story files all state "Coverage target: 100%" but the actual coverage for new modules ranges from 62.79% to 96.55% branch coverage. Declaring a target in a markdown file has no enforcement power. The `codeharness coverage` command built in Story 4.3 can now provide that enforcement — but it needs to be wired into the pre-commit gate or the sprint skill's story-completion flow to have teeth. The tool to enforce coverage now exists; the enforcement itself does not yet run automatically.

### L2: Large Modules Correlate with Lower Coverage

The three modules with the lowest branch coverage — verify.ts (62.79%, 219 lines), coverage.ts (76.37%, 474 lines), and doc-health.ts (77.12%, 710 lines) — are among the largest. Larger modules have more branches to cover, and developers naturally focus on the happy path when time pressure mounts. Smaller, more focused modules consistently achieve 100% coverage (patch-engine.ts, templates.ts, stack-detect.ts, output.ts). This suggests a module size threshold (~200 lines) above which coverage discipline deteriorates.

### L3: Hook Scripts Need Their Own Test Infrastructure

The hook scripts (shell) operate in a different testing paradigm than the TypeScript codebase. BATS integration tests exist (verify_gates.bats, coverage_gate.bats, doc_health.bats), but hook behavior is harder to test deterministically — it depends on state file presence, CLI availability, and Claude Code's hook invocation protocol. The error trap pattern (`trap 'echo JSON; exit 0' ERR`) is a pragmatic solution to the "hooks must always produce valid JSON" requirement, but it also means that hook internal errors are swallowed silently. A hook debug mode that logs errors to a file would improve observability.

### L4: The Quality Pipeline Is Complete But Untested End-to-End

Stories 4.1 through 4.4 build individual pipeline stages (verification, hooks, coverage, doc health), and each stage was tested in isolation. But the full pipeline — session starts, hooks reset flags, developer writes code, hook prompts OTLP check, tests run, coverage sets flags, verification produces proof, hooks allow commit — has not been tested as a complete flow. The integration between stages is implicit (shared state flags). An end-to-end test or smoke test of the full quality loop would validate the pipeline architecture.

### L5: Carried Action Items Need a Hard Gate After Two Epics

Action items A1 (integration test for init), A2 (index.ts coverage), and A3 (branch coverage 95%+) have been carried for four, four, and three epics respectively. The pattern is clear: listing carried items in story dev notes doesn't work. After two epics, a carried action item should become a blocking prerequisite for the next epic — either a dedicated tech-debt story that must be completed first, or a CI gate that fails the build.

---

## Action Items for Subsequent Epics

| # | Action | Target Epic | Owner |
|---|--------|-------------|-------|
| A1 | Add integration test that runs `codeharness init` as a subprocess and verifies full output + file creation — FOUR epics overdue, must be a dedicated story or blocking prerequisite | Epic 5 | Dev |
| A2 | Cover the index.ts entry point block (lines 44-45) via subprocess integration test — FOUR epics overdue | Epic 5 | Dev |
| A3 | Raise branch coverage from 85.5% to 95%+ — specifically verify.ts (62.79%), coverage.ts (76.37%), doc-health.ts (77.12%), beads-sync.ts (83.33%) | Epic 5 | Dev |
| A4 | Run `codeharness sync` against project's own story files after each story completion — process fix, still not adopted after four epics | Ongoing | SM |
| A5 | Update architecture spec to reflect actual plugin artifact locations — carried from Epic 2 | Epic 5 | Architect |
| A6 | Consider splitting doc-health.ts (710 lines) into doc-scanner.ts and exec-plan.ts if it grows further in Epic 5/6 | Epic 5 | Dev |
| A7 | Wire `codeharness coverage` into the pre-commit gate or sprint skill so coverage targets are enforced automatically, not just declared | Epic 5 | Dev |
| A8 | Create an end-to-end smoke test for the full quality pipeline (session start -> code -> test -> coverage -> verify -> commit) | Epic 5 | Dev |
| A9 | Add hook debug mode that logs internal errors to a file instead of silently swallowing them via error trap | Epic 5 | Dev |

---

## Epic 3 Retro Action Item Status

| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Integration test for `codeharness init` as subprocess | Not done | Carried for fourth time. No dedicated story created. |
| A2 | Cover index.ts entry point block (lines 40-41, now 44-45) | Not done | Four epics overdue. Lines shifted but still uncovered. |
| A3 | Improve branch coverage to 95%+ | Not done | Coverage declined from 90.6% to 85.5%. Opposite direction. |
| A4 | Run `codeharness sync` against project's own story files | Not done | Story files still show ready-for-dev. |
| A5 | Update architecture spec for plugin artifact locations | Not done | Carried again. Architect action — no code story has addressed it. |
| A6 | Consider extracting init.ts steps if >600 lines | Not applicable | init.ts held at 517 lines. No growth in Epic 4. |
| A7 | Create dedicated tech-debt story for carried action items | Not done | No tech-debt story was created. Items continued to be appended to feature stories. |

---

## Next Epic Readiness

**Epic 5: Ralph Loop Integration** is next in the backlog. It covers:
- Story 5-1: Ralph loop integration & beads task source
- Story 5-2: Verification gates & termination tracking

**Prerequisites met:**
- Verification pipeline produces Showboat proof documents (Story 4.1)
- Hook architecture enforces quality gates mechanically (Story 4.2)
- Coverage command measures and reports test coverage (Story 4.3)
- Doc health scanner checks documentation freshness (Story 4.4)
- Full quality flag lifecycle: session-start resets -> coverage/verify set -> pre-commit-gate reads
- 702 passing tests with 95.94% statement coverage provide a safety net

**Risks for Epic 5:**
- Branch coverage at 85.5% is the lowest it has been. If Epic 5 adds more modules with complex error handling, it will drop further. The coverage command built in 4.3 could enforce this, but only if it's wired into the workflow.
- verify.ts at 62.79% branch coverage is the foundation that Story 5.2's verification gates build on. Gaps in verification logic testing could mask bugs in gate behavior.
- Five action items have been carried for 3+ epics. If not addressed, they become normalized technical debt that erodes confidence in the quality pipeline the project is building.
- Ralph integration (Epic 5) requires the sprint skill to call CLI commands in sequence. The full pipeline has not been tested end-to-end.

---

## Metrics

- **Stories planned:** 4
- **Stories completed:** 4
- **Stories failed:** 0
- **New production TypeScript files created:** 8 (verify-parser.ts, verify.ts, showboat-template.ts, commands/verify.ts replacement, coverage.ts, commands/coverage.ts, doc-health.ts, commands/doc-health.ts)
- **Modified production TypeScript files:** 4 (index.ts, commands/state.ts, commands/status.ts, lib/verify.ts preconditions extended)
- **Hook scripts rewritten:** 4 (session-start.sh, pre-commit-gate.sh, post-write-check.sh, post-test-verify.sh)
- **Total production TypeScript files:** 31
- **Total production lines of code:** 5,457 (up from 3,385 in Epic 3, +61.2%)
- **New test files created:** 8
- **Total test files:** 31
- **Total unit tests:** 702 (up from 501 in Epic 3, +40.1%)
- **Total test lines:** 9,378 (up from 6,163 in Epic 3, +52.2%)
- **Statement coverage:** 95.94% (down from 98.56%)
- **Branch coverage:** 85.5% (down from 90.6%)
- **Function coverage:** 99.04% (down from 99.3%)
- **Line coverage:** 96.4% (down from 99.34%)
- **Init command size:** 517 lines (unchanged from Epic 3)
- **Largest module:** doc-health.ts at 710 lines
- **Build output:** ESM bundle via tsup
- **Test execution time:** ~1.27s (vitest) (up from ~1.10s)
- **Epic 3 retro actions resolved:** 0 of 7 (all carried or not addressed)
- **BATS integration tests:** 23 test files, 3,671 lines
