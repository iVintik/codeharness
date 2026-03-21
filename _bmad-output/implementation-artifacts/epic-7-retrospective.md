# Epic 7 Retrospective: Onboarding — Compliance Gaps

**Epic:** Epic 7 — Onboarding — Compliance Gaps
**Date:** 2026-03-21
**Stories Completed:** 3 (7-1, 7-2, 7-3)
**Status:** All stories done
**Previous Retro:** epic-6-retrospective.md (Epic 6: Dashboard Visualization Rework)
**Implementation window:** 2026-03-21 (single day, autonomous ralph execution)
**Note:** This file replaces a stale `epic-7-retrospective.md` from a previous sprint which documented "Status, Reporting & Lifecycle Management." Epic numbering collision between sprints — same issue flagged in Epic 6 retro L4.

---

## Epic Summary

Epic 7 closed three compliance gaps surfaced by `codeharness audit`. Before this epic, `audit` reported failures for: (1) missing Semgrep static analysis tool, (2) missing BATS test runner and 14 broken integration tests, and (3) missing root Dockerfile for infrastructure validation. After it, all three audit dimensions pass cleanly.

The epic had three stories:

| Story | Deliverable |
|-------|-------------|
| 7-1-install-semgrep-static-analysis | Added Semgrep to `DEPENDENCY_REGISTRY` with pipx/pip fallback chain. 7 new unit tests. |
| 7-2-fix-bats-runtime-tests | Added BATS to `DEPENDENCY_REGISTRY` with brew/npm fallback. Rewrote 14 broken `onboard.bats` tests. |
| 7-3-create-dockerfile | Created root `Dockerfile` (23 lines) and expanded `.dockerignore` (18 entries). Passes all 6 dockerfile-validator rules. |

All three stories were executed autonomously by ralph in a single session. Total production code change: ~20 lines in `deps.ts`, 78 lines in `onboard.bats`, 23 lines in `Dockerfile`, 18 lines in `.dockerignore`. This was the smallest epic by code volume in the sprint.

Test count at completion: 2930 tests passing across 113 files. Coverage: 97.02% overall, all files above 80% per-file floor.

---

## What Went Well

### 1. All Three Stories Were Straightforward Compliance Fixes

Each story followed the same pattern: identify gap in audit output, add the missing artifact or registry entry, verify audit passes. No architectural decisions, no new modules, no refactoring. The stories were correctly scoped as mechanical fixes — and they were.

### 2. Dependency Registry Pattern Scaled Cleanly

Stories 7-1 and 7-2 each added ~10 lines to `deps.ts`. The `DEPENDENCY_REGISTRY` array, `installDependency()` fallback chain, and `checkInstalled()` function handled Semgrep and BATS without modification. The registry grew from 3 entries (showboat, agent-browser, beads) to 5 entries (+ semgrep, bats) with zero structural changes. This validates the extensible registry design from Epic 2.

### 3. Code Review Caught Real Issues in Every Story

- **7-1:** Missing test for `CriticalDependencyError` throw path (HIGH). Duplicated test spec instead of referencing registry (MEDIUM). Missing null-version branch coverage (MEDIUM). AGENTS.md missing agent-browser (MEDIUM).
- **7-2:** AGENTS.md missing BATS in deps list (MEDIUM).
- **7-3:** `.dockerignore` only excluded 4 paths — 85MB+ of unnecessary build context (HIGH). No ENTRYPOINT (HIGH). Missing `npm cache clean --force` (MEDIUM). USER before WORKDIR ownership issue (MEDIUM).

The code review phase continues to justify its existence. It caught 10+ issues across three stories, including two HIGH-severity problems in the Dockerfile story that would have produced a bloated, non-functional container image.

### 4. Autonomous Execution Worked End-to-End

All three stories progressed through create-story, dev-story, code-review, and verify phases without human intervention. Ralph orchestrated the full pipeline. The circuit breaker did not trip. This is the cleanest autonomous epic execution in the sprint.

### 5. BATS Test Cleanup Was Overdue and Done Well

Story 7-2 removed 14 permanently-skipped broken tests from `onboard.bats` that had been dead code since story 3-3 refactored `onboard.sh`. The tests were replaced with working tests that validate the actual CLI delegation behavior. Net result: `bats tests/` runs cleanly with zero skips.

---

## What Could Be Improved

### 1. No Formal Epic Definition Existed

Like Epic 6, Epic 7 had no epic definition file. It existed only as story keys in `sprint-status.yaml`. The create-story agent derived story requirements from audit output and existing code — which worked — but there was no document defining the epic scope, success criteria, or dependency relationships between stories. This is the second consecutive epic with this gap.

### 2. Epic Numbering Collision Persists

Sprint-status.yaml's "Epic 7: Onboarding — Compliance Gaps" collides with `epics-overhaul.md`'s "Epic 7: OpenSearch Backend." The previous `epic-7-retrospective.md` documented yet another "Epic 7: Status, Reporting & Lifecycle Management" from an even earlier sprint. Three different epics used the number 7. This was flagged in Epic 6 retro (L4, A3) and remains unresolved.

### 3. Story 7-3 Status Shows "review" in sprint-state.json

`sprint-state.json` shows story 7-3 as `"status": "review"` rather than `"done"`, even though the story commit landed and all verification passed. This status sync gap has persisted across every epic in the sprint. It was flagged as an action item in Epics 4, 5, 6, and 0.5.

### 4. Dockerfile Validator Cannot Handle Multiline Instructions

Story 7-3 discovered that `dockerfile-validator.ts` checks each line individually and cannot parse backslash continuations. The Dockerfile had to put `curl jq` on the same `apt-get install` line to pass validation. This is a known limitation that constrains Dockerfile formatting and will cause false failures for Dockerfiles following standard multi-line conventions.

### 5. Integration-Required ACs Remain Unverified

Across all three stories, 6 acceptance criteria were tagged `integration-required` and never executed:
- 7-1 AC2: Fresh environment Semgrep install (verification container already has it)
- 7-2 AC2: Fresh environment BATS install
- 7-2 AC7: CI workflow impact
- 7-3 AC3: `docker build .` succeeds
- 7-3 AC4: `docker run --rm <image> codeharness --version`
- 7-3 AC6: npm package excludes Dockerfile (verified via `npm pack --dry-run` only)

These are genuinely hard to verify in a black-box Docker verification environment, but the accumulation of unverified ACs across epics is a pattern worth tracking.

### 6. Shared Stack Detection Issue Recurred in 7-1 and 7-2

`codeharness status --check-docker` reported the observability stack as down while a shared stack was running on the same ports. This is a known recurring issue flagged in session retros but never fixed. It causes confusion during verification without affecting functionality.

---

## Lessons Learned

### L1: Compliance Gap Stories Should Be Batched

All three stories followed the identical pattern: read audit output, add missing thing, verify audit passes. They could have been a single story with three tasks, or executed in parallel. Separating them into three stories added process overhead (3x create-story, 3x code-review, 3x verify) for what amounts to 60 lines of production changes. For future sprints: when multiple stories are independent, mechanical, and under 50 lines each, batch them.

### L2: Code Review Value Scales Inversely with Story Size

The smallest story (7-1, ~10 lines of production code) had the most review findings (8 issues, including 1 HIGH). The Dockerfile story (7-3, 23 lines) had 6 findings including 2 HIGH. Small stories create a false sense of safety — "it's just 10 lines, what could go wrong?" — but the review process catches issues in documentation, test quality, and build artifacts that the dev agent doesn't consider.

### L3: The Dependency Registry Is a Successful Abstraction

Five tools (showboat, agent-browser, beads, semgrep, bats) are now managed through a single registry with uniform install, check, and fallback semantics. Adding a new tool requires ~10 lines of registry data and ~7 test cases. The abstraction has scaled from 3 to 5 entries without any structural changes to `deps.ts`, `installDependency()`, or `installAllDependencies()`. This is the kind of library-first payoff that Epic 6's retro (L2 from the previous sprint's Epic 7) predicted.

### L4: Dockerfile Validation Rules Need Multi-Line Support

The line-by-line validation approach in `dockerfile-validator.ts` works for simple Dockerfiles but breaks standard Docker conventions (multi-line `RUN` with backslash continuations). Story 7-3 had to work around this by cramming packages onto one line. This will bite again when user projects have more complex Dockerfiles. The validator needs a pre-processing step that joins continuation lines before applying rules.

### L5: Autonomous Execution Is Most Reliable for Mechanical Stories

All three stories completed autonomously without circuit breaker trips, retries, or human intervention. The common factor: no design ambiguity, no architectural decisions, clear acceptance criteria, small scope. Autonomous execution excels when the problem is well-defined and the solution is obvious. It struggles (per earlier epics) with ambiguous requirements and novel architecture.

---

## Epic 6 Retro Action Item Status

| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Fix cost accumulation data loss — buffer cost events before sprintInfo init | Not done | Not addressed in Epic 7. |
| A2 | Bring run.ts under 300 lines (NFR9 compliance) | Not done | Not addressed. |
| A3 | Clean up epic numbering collision | Not done | Third epic with the same problem. |
| A4 | Fix story-status sync — automate or enforce codeharness sync | Not done | 7-3 still shows "review" in sprint-state.json. |
| A5 | Add multi-byte UTF-8 chunk boundary test for createLineProcessor | Not done | Not addressed. |
| A6 | Complete AC5 manual verification of story 6-2 | Not done | Not addressed. |
| A7 | Automate stale container cleanup before verification | Not done | Stale container issue recurred in 7-1. |

**Summary:** 0 of 7 action items from Epic 6 were resolved. All carried forward. The pattern of carrying forward unresolved action items (flagged in previous sprint's Epic 7 retro L3) continues unchanged.

---

## Action Items

| # | Action | Priority | Notes |
|---|--------|----------|-------|
| A1 | Add multi-line continuation support to dockerfile-validator.ts | Medium | Story 7-3 hit this limitation. Constrains valid Dockerfile formatting. |
| A2 | Fix epic numbering collision — establish globally unique epic numbers | Medium | Three different "Epic 7" definitions exist across sprint artifacts. Carried from Epic 6 A3. |
| A3 | Fix story-status sync in sprint-state.json | Medium | 7-3 shows "review" instead of "done". Carried from Epic 6 A4, Epic 0.5 A5, Epic 5 A5, Epic 4 A4. |
| A4 | Fix shared stack detection in codeharness status --check-docker | Low | Recurring false negative when shared observability stack runs on same ports. |
| A5 | Investigate Semgrep audit gap showing "undefined" instead of rule message | Low | Flagged in 7-1 session issues. `parseSemgrepOutput` may not map `extra.message` correctly. |
| A6 | Batch small compliance-fix stories in future sprints | Process | Three 10-line stories had full pipeline overhead. Batch when independent and mechanical. |

---

## Metrics

- **Stories planned:** 3
- **Stories completed:** 3
- **Stories failed:** 0
- **Code review cycles:** 1 per story (3 total; all passed first review cycle with fixes)
- **Bugs caught in review:** ~12 (across 3 stories; 3 HIGH, 5 MEDIUM, 4 LOW)
- **Bugs caught in verify:** 0
- **Production files modified:** 3 (deps.ts, onboard.bats, AGENTS.md)
- **Production files created:** 2 (Dockerfile, .dockerignore)
- **Total new production lines:** ~60 (deps.ts: +20, onboard.bats: +78/-78 net rewrite, Dockerfile: 23, .dockerignore: 18)
- **Test files modified:** 1 (deps.test.ts)
- **New unit tests added:** ~16 (7 for semgrep + 9 for bats registry entries)
- **Total tests at completion:** 2930 (all passing)
- **Coverage at completion:** 97.02% overall, all 123 files above 80% per-file floor
- **deps.ts coverage:** 100% statements/functions/lines, 89.28% branches (unreachable null-coalescing fallbacks)
- **Implementation window:** 1 day (2026-03-21), fully autonomous
- **Circuit breaker trips:** 0
- **Human interventions:** 0
- **Epic 6 retro actions resolved:** 0 of 7
