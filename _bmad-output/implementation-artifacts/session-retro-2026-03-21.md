# Session Retrospective — 2026-03-21

**Sprint:** Operational Excellence Sprint
**Session window:** ~04:21Z – ~04:45Z (approx 25 minutes)
**Sprint progress:** 15/20 stories done (75%), Epic 3 nearing completion

---

## 1. Session Summary

| Story | Epic | Outcome | Phases Completed |
|-------|------|---------|-----------------|
| 3-3-onboard-alias | Epic 3: Audit Command | Verifying (all phases done, awaiting final verification) | create-story, dev-story, code-review |

One story was attempted this session. It progressed through story creation, implementation, and code review without blocking failures. The story replaced a 478-line onboard command with a 40-line alias delegating to a shared audit handler — a 92% reduction in code.

**Test results at session end:** 2783 tests passing across 119 files, 96.97% overall coverage, all files above 80% floor.

---

## 2. Issues Analysis

### Bugs Discovered During Implementation

- **Unsafe double type assertion** (HIGH) — `audit-action.ts:86` used `as unknown as Record<string, unknown>` to bypass TypeScript type safety. Fixed during code review by using spread operator instead.
- **Dead branch guard** (MEDIUM) — `audit-action.ts:101` had a `fixStories &&` check that was always true at that point. Simplified to `else`.

### Workarounds Applied (Tech Debt Introduced)

- **`console.log` in audit-action.ts:111** (LOW, not fixed) — The shared handler uses `console.log` directly instead of output utilities. Established codebase pattern but violates project conventions. Needs a new `raw()` output utility to fix properly. **Tracked as tech debt.**
- **`formatAuditJson()` is a pass-through no-op** (LOW, not fixed) — Exists for API symmetry with `formatAuditHuman()` but does nothing. Not harmful but adds a meaningless abstraction layer.

### Code Quality Concerns

- **NFR9 violation** — `onboard.test.ts` initially hit 325 lines (limit: 300). Compacted to 230 lines during code review. Shows that test file size estimates in story planning (100-150 lines) can be unreliable.
- **Branch coverage gap** — Missing test for `skipped: true` path in audit-action.ts. Added during code review, bringing branch coverage to 100%.

### Verification Gaps

- Story is in `verifying` status — final verification pass has not yet been completed as of session end.

### Tooling/Infrastructure Problems

- None reported this session.

### Planning/Ambiguity Issues

- **Ambiguous AC3** — Epic said `onboard scan` should map to "equivalent audit subcommand" but audit has no subcommands. Dev agent interpreted as deprecation warning + base audit run. Reasonable decision but AC wording needs tightening in future epics.
- **Dropped subcommands risk** — `onboard epic` and other old subcommands were silently dropped with no deprecation warning (only `onboard scan` got one). May surprise users who relied on those subcommands.
- **Old exports removal risk** — `onboard.ts` exported shared state getters (`getLastScanResult`, etc.). Dev agent verified no external consumers before removing. Good diligence.

---

## 3. What Went Well

- **Clean refactoring execution.** 478 lines reduced to 40 lines with a well-structured shared handler extraction (`audit-action.ts`). Both `audit` and `onboard` now share identical logic.
- **Code review caught real bugs.** The unsafe type assertion was a genuine type safety hole. Catching it before merge prevented potential runtime issues.
- **No regressions.** 2783 tests passing, zero failures across the full suite after the refactor.
- **Good dependency verification.** Dev agent checked all removed imports to confirm no other consumers before deleting — library files preserved as required.
- **Story creation quality.** Session issues log captured ambiguities and risks upfront during create-story phase, enabling informed decisions during implementation.

---

## 4. What Went Wrong

- **Test file size underestimated.** Story estimated 100-150 lines for `onboard.test.ts`; actual was 325 lines (needed compaction to 230). Estimates for test files are consistently too low.
- **Two code quality issues deferred.** `console.log` usage and the no-op `formatAuditJson()` were flagged but not fixed. Both are minor but accumulate as tech debt.
- **Session ended with story still in verifying.** The full pipeline (create → dev → review → verify) didn't complete within the session window.

---

## 5. Lessons Learned

### Patterns to Repeat

- **Extracting shared handlers** when aliasing commands. The `audit-action.ts` pattern is clean and reusable for future command aliases.
- **Session issues log as living document.** Each phase (create-story, dev-story, code-review) contributed entries, creating a complete audit trail. This works.
- **Code review as bug-catching gate.** The unsafe type assertion would have shipped without review. The review phase paid for itself this session.

### Patterns to Avoid

- **Underestimating test file sizes.** Double the estimate when test files involve multiple mock setups and flag combinations.
- **Ambiguous ACs referencing non-existent features.** "Maps to equivalent subcommand" when no subcommand exists forces dev agents to make judgment calls. Be explicit about deprecation behavior in ACs.

---

## 6. Action Items

### Fix Now (Before Next Session)

- [ ] Complete verification pass for Story 3-3-onboard-alias (currently `verifying`)

### Fix Soon (Next Sprint)

- [ ] Add `raw()` output utility to `src/lib/output.ts` for pre-formatted string output that shouldn't be prefixed — resolves the `console.log` tech debt in `audit-action.ts`
- [ ] Review whether `formatAuditJson()` should do actual formatting or be removed as a no-op
- [ ] Add deprecation warnings for `onboard coverage`, `onboard audit`, `onboard epic` subcommands (currently silently dropped)

### Backlog (Track but Not Urgent)

- [ ] Improve story estimation heuristics for test file sizes — current estimates consistently 50-100% low
- [ ] Create AC writing guideline: never reference features/subcommands that don't exist without specifying fallback behavior explicitly

---

# Session Retrospective — 2026-03-21 (continued)

**Timestamp:** ~05:10Z – ~05:40Z
**Sprint progress:** 17/20 stories done (85%), Epic 3 complete, Epic 4 in progress

---

## 1. Session Summary

| Story | Epic | Outcome | Phases Completed |
|-------|------|---------|-----------------|
| 3-3-onboard-alias | Epic 3: Audit Command | Done | verify (completed this window) |
| 4-1-dockerfile-rules-validation | Epic 4: Infrastructure Guidelines | Verifying | create-story, dev-story, code-review |

Two stories progressed this window. Story 3-3 completed its verification pass — all 8 ACs passed black-box Docker verification, closing Epic 3 entirely. Story 4-1 was created, implemented, and code-reviewed, reaching `verifying` status. It adds Dockerfile validation rules to the infrastructure check pipeline.

**Test results at session end:** 2817 tests passing across 120 files, 96.99% overall coverage, all files above 80% floor.

---

## 2. Issues Analysis

### Bugs Discovered During Implementation

- **Operator precedence ambiguity** (HIGH) — `checkVerificationTools` in dockerfile-rules had `&&`/`||` chains without parentheses, producing incorrect evaluation order. Fixed during code review.
- **COPY --chown pattern missed** (MEDIUM) — `checkNoSourceCopy` regex only matched plain `COPY` but not `COPY --chown=...` flag patterns. Regex updated during code review.
- **Redundant double-read of Dockerfile** (MEDIUM) — `checkInfrastructure` read the Dockerfile once for precondition checks, then `validateDockerfile()` read it again. Eliminated the redundant read during review.
- **Pre-existing test failure** — `run-helpers.test.ts` (`--live` flag test) was broken before this session and had to be fixed before 3-3 verification could proceed. Not caused by this sprint's changes.

### Workarounds Applied (Tech Debt Introduced)

- **Loose tool name matching** (LOW, not fixed) — `checkVerificationTools` uses `content.includes(tool)` which matches tool names anywhere in the Dockerfile, not just in `apt-get`/`apk` install lines. Accepted per story design: "False positives are acceptable."
- **`checkBinaryOnPath` has no line number** (LOW, not fixed) — Other validation checks report line numbers for failures, but this one does not. Inconsistent output format.

### Code Quality Concerns

- **Branch coverage at 87.5%** for `dfGap()` helper — The `line !== undefined` conditional has one branch not fully covered. Cosmetic; both paths exercised indirectly through integration tests.
- **Dual purpose of rules markdown** — Story chose hardcoded rules with markdown as reference docs. This means rule updates require code changes, not just doc edits. Reasonable for now but creates maintenance coupling.

### Verification Gaps

- **3-3-onboard-alias:** Observability gaps noted — no structured log events emitted for audit/onboard CLI interactions. Not a regression (was never there), but a gap.
- **4-1-dockerfile-rules-validation:** Still in `verifying` status at session end.

### Tooling/Infrastructure Problems

- **Pre-existing broken test** blocked verification of 3-3. The `--live` flag test in `run-helpers.test.ts` was unrelated to any current story but had to be fixed to get a clean test run. Time wasted on unrelated fix.

### Planning/Ambiguity Issues

- **Rules as code vs. documentation ambiguity** — Epic 4 story spec was unclear on whether Dockerfile rules should be data-driven (parsed from markdown) or hardcoded. Dev agent chose hardcoded, which is simpler but less flexible.
- **AC expansion** — Epic defined 4 ACs for 4-1; story creation expanded to 10 ACs to cover each rule category individually. Good granularity but shows epic-level ACs were too coarse.

---

## 3. What Went Well

- **Epic 3 fully completed.** All three stories (3-1, 3-2, 3-3) done and verified. The audit command subsystem is production-ready.
- **Clean verification for 3-3.** All 8 ACs passed black-box Docker verification on first attempt. No escalations needed.
- **Code review caught three real bugs in 4-1.** Operator precedence, missed COPY pattern, and redundant I/O — all fixed before merge. Review continues to be the highest-value gate.
- **Test suite growth healthy.** 34 new tests added (2783 to 2817), one new file added to coverage tracking (119 to 120). No test inflation or flaky additions.
- **Coverage held steady.** 96.97% to 96.99% — new code matched existing quality bar.

---

## 4. What Went Wrong

- **Pre-existing broken test wasted time.** The `--live` flag test failure in `run-helpers.test.ts` was unrelated to any current work but blocked the verification pipeline. This should have been caught and fixed in a prior session.
- **4-1 did not complete verification.** Same pattern as first window — the full pipeline (create, dev, review, verify) does not fit in a single session window for non-trivial stories.
- **Loose matching accepted as "good enough."** The `content.includes(tool)` pattern in `checkVerificationTools` will produce false positives. Deliberately accepted, but adds noise to audit output for users with tool names appearing in comments or other contexts.

---

## 5. Lessons Learned

### Patterns to Repeat

- **AC expansion during story creation.** Going from 4 epic-level ACs to 10 story-level ACs gave clear pass/fail criteria for each validation rule. Verification is straightforward when ACs are granular.
- **Fixing pre-existing failures immediately.** The `--live` flag test fix during 3-3 verification was a good decision — carrying broken tests forward compounds problems.
- **Code review as mandatory gate.** Two sessions in a row, code review caught HIGH-severity bugs (type assertion bypass, operator precedence). The gate is paying for itself consistently.

### Patterns to Avoid

- **Letting broken tests accumulate.** The pre-existing `run-helpers.test.ts` failure should have been caught by CI, not discovered during manual verification. If CI is green with a broken test, the CI configuration has a gap.
- **Accepting loose matching without documenting the known false positive scenarios.** "False positives are acceptable" needs a list of known false positives so users understand the tradeoffs.

---

## 6. Action Items

### Fix Now (Before Next Session)

- [ ] Complete verification pass for Story 4-1-dockerfile-rules-validation (currently `verifying`)
- [x] Complete verification pass for Story 3-3-onboard-alias — done this window

### Fix Soon (Next Sprint)

- [ ] Add line number reporting to `checkBinaryOnPath` for consistency with other Dockerfile checks
- [ ] Document known false positive scenarios for `checkVerificationTools` loose matching
- [ ] Investigate why the `--live` flag test in `run-helpers.test.ts` was broken without CI catching it — possible CI gap

### Backlog (Track but Not Urgent)

- [ ] Consider data-driven Dockerfile rules (parsed from markdown) instead of hardcoded — reduces maintenance coupling for rule updates
- [ ] Add structured log events for audit/onboard CLI interactions (observability gap noted during 3-3 verification)
- [ ] Improve `dfGap()` branch coverage from 87.5% to 100% — cosmetic but keeps the bar clean

---

# Session Retrospective — 2026-03-21 (end-of-day consolidation)

**Timestamp:** ~09:20Z
**Sprint progress:** 17/20 stories done (85%), Epic 3 complete (released as v0.23.1), Epic 4 blocked on 4-1 re-verification
**Releases this session:** v0.23.0 (Epic 0.5 dashboard), v0.23.1 (Epic 3 audit command)

---

## 1. Session Summary

| Story | Epic | Final Status | Phases Completed Today | Notes |
|-------|------|-------------|----------------------|-------|
| 3-3-onboard-alias | Epic 3: Audit Command | Done | verify | All 8 ACs passed. Epic 3 closed. Released in v0.23.1. |
| 4-1-dockerfile-rules-validation | Epic 4: Infrastructure | Verifying | create-story, dev-story, code-review, verify (partial) | 9/10 ACs passed. AC10 failed, bug fixed, awaiting re-verification. |

**Full-day throughput:** 2 stories progressed, 1 completed and released, 1 epic closed, 2 releases shipped.

**Test suite at session end:** 2820 tests passing across 120 files, ~97% overall coverage, all files above 80% floor.

---

## 2. Issues Analysis

### Bugs Discovered (cumulative, all sessions today)

| Severity | Story | Issue | Resolution |
|----------|-------|-------|------------|
| HIGH | 3-3 | Unsafe double type assertion (`as unknown as Record`) | Fixed: spread operator |
| HIGH | 4-1 | Operator precedence ambiguity in `checkVerificationTools` | Fixed: added parentheses |
| MEDIUM | 3-3 | Dead branch guard (`fixStories &&` always true) | Fixed: simplified to `else` |
| MEDIUM | 4-1 | `checkNoSourceCopy` missed `COPY --chown` patterns | Fixed: regex updated |
| MEDIUM | 4-1 | Redundant double-read of Dockerfile | Fixed: removed duplicate read |
| MEDIUM | 4-1 | Missing test for `COPY --from=` binary install pattern | Fixed: test added |
| **MEDIUM** | **4-1** | **AC10: `validateDockerfile()` warnings not propagated to audit output** | **Fixed: warning-to-gap propagation added in dimensions.ts. Needs re-verification.** |
| LOW | 3-3 | Branch coverage gap — `skipped: true` path untested | Fixed: test added, 100% branch coverage |

**Bug discovery rate:** 8 bugs across 2 stories — 4 per story average. Code review caught 6 of 8 (75%). Verification caught 1 (AC10 propagation). Pre-implementation analysis caught 1 (dead branch).

### Workarounds / Tech Debt Introduced This Session

1. **`console.log` in audit-action.ts** — Needs `raw()` output utility. Not fixed.
2. **`formatAuditJson()` is a no-op** — Exists for symmetry. Not fixed.
3. **Loose tool matching in `checkVerificationTools`** — `content.includes(tool)` matches anywhere. Accepted by design.
4. **`checkBinaryOnPath` missing line numbers** — Inconsistent with other checks. Not fixed.
5. **Broken BATS tests skipped** — `fix: skip broken onboard BATS tests that block CI` (commit b5f062c). Tests were skipped rather than fixed to unblock the release. **This is real tech debt.**

### Verification Gaps

- **4-1 AC10 re-verification pending** — Bug was found and fixed, but the story needs a clean verification pass to confirm the fix works end-to-end.
- **Observability gap** — No structured log events for audit/onboard CLI interactions. Pre-existing, not introduced this session.

### Tooling/Infrastructure Problems

- **Pre-existing `run-helpers.test.ts` failure** — `--live` flag test was broken before this session. Had to be fixed ad-hoc during 3-3 verification. Wasted time.
- **BATS test breakage** — Onboard BATS integration tests broke after the onboard-to-audit refactor. Rather than fixing them, they were skipped (commit b5f062c) to unblock CI for the release. The skipped tests need to be updated to match the new onboard-as-alias behavior.

---

## 3. What Went Well

- **Epic 3 fully completed and released.** Three stories (3-1, 3-2, 3-3) all done, verified, committed, and shipped as v0.23.1. Clean epic closure.
- **Two releases shipped in one session.** v0.23.0 (dashboard) and v0.23.1 (audit command) both released without pipeline failures.
- **Code review consistently catches real bugs.** 6 of 8 bugs found during code review across both stories. The review gate is the highest-value quality check in the pipeline.
- **Session issues log worked as designed.** Every subagent phase (create-story, dev-story, code-review, verify) contributed entries. The log provided complete raw materials for this retrospective without requiring any file archaeology.
- **Shared handler pattern successful.** The `audit-action.ts` extraction reduced 478 lines to 40 lines while maintaining identical behavior. Clean, testable, reusable.
- **Test suite growth healthy.** 2783 to 2820 tests (+37), one new coverage-tracked file, coverage held at ~97%.

---

## 4. What Went Wrong

- **4-1 verification discovered a real integration bug (AC10).** `validateDockerfile()` warnings were stored in the result but never propagated through `checkInfrastructure()` to the audit output. This is an integration seam that unit tests missed — the validator worked, the coordinator worked, but the wiring between them dropped warnings.
- **BATS tests skipped instead of fixed.** Commit b5f062c skips broken onboard BATS tests to unblock CI. This is a shortcut that reduces integration test coverage. The tests need updating, not skipping.
- **Full pipeline doesn't fit in one window for non-trivial stories.** Both stories required multiple session windows to complete create-dev-review-verify. Story 4-1 still hasn't completed verification after two windows.
- **Pre-existing broken tests wasted time.** The `--live` flag test failure in `run-helpers.test.ts` was unrelated to any current work but blocked 3-3 verification.
- **Test file size estimates remain unreliable.** Story 3-3 estimated 100-150 lines for `onboard.test.ts`; actual was 325 (compacted to 230). This pattern repeats across sprints.

---

## 5. Lessons Learned

### Patterns to Repeat

- **Code review as mandatory gate.** Two stories, 6 bugs caught before merge. Non-negotiable.
- **Session issues log as retrospective source material.** Every subagent writes to it. The retro just categorizes and synthesizes.
- **AC expansion during story creation.** Going from 4 epic-level ACs to 10 story-level ACs gave granular verification targets. Do this for every story.
- **Shared handler extraction for command aliases.** The `audit-action.ts` pattern eliminates code duplication cleanly. Use this whenever two commands share behavior.

### Patterns to Avoid

- **Skipping tests to unblock releases.** Fix the tests or mark them as `TODO` with a tracking issue. Skipping silently erodes coverage.
- **Trusting unit tests alone for integration seams.** The AC10 bug (warnings not propagated) existed because the validator and coordinator were tested in isolation. Integration tests or end-to-end tests are needed at module boundaries.
- **Carrying broken tests forward.** If a test is broken, fix it immediately or it will block something else later.
- **Estimating test sizes at story planning time.** The estimates are consistently 50-100% low. Stop estimating test LOC; estimate test case count instead.

---

## 6. Action Items

### Fix Now (Before Next Session)

- [ ] Complete re-verification of 4-1-dockerfile-rules-validation (AC10 fix needs clean verification pass)
- [ ] Fix or properly rewrite the skipped BATS onboard tests (commit b5f062c) — they should test the new alias behavior, not be skipped

### Fix Soon (Next Sprint)

- [ ] Add `raw()` output utility to `src/lib/output.ts` — resolves `console.log` tech debt in `audit-action.ts`
- [ ] Add line number reporting to `checkBinaryOnPath`
- [ ] Document known false positive scenarios for `checkVerificationTools`
- [ ] Investigate why `run-helpers.test.ts` `--live` flag test was broken without CI catching it
- [ ] Add integration test for `checkInfrastructure()` -> `validateDockerfile()` warning propagation path (the seam where AC10 bug lived)

### Backlog (Track but Not Urgent)

- [ ] Consider data-driven Dockerfile rules (parsed from markdown) instead of hardcoded
- [ ] Add structured log events for audit/onboard CLI interactions
- [ ] Improve `dfGap()` branch coverage from 87.5% to 100%
- [ ] Review whether `formatAuditJson()` should do actual formatting or be removed
- [ ] Add deprecation warnings for dropped onboard subcommands (`coverage`, `audit`, `epic`)
- [ ] Replace test LOC estimates with test case count estimates in story templates

---

## End-of-Day Metrics

| Metric | Start of Day | End of Day | Delta |
|--------|-------------|------------|-------|
| Stories done | 15 | 17 | +2 |
| Sprint completion | 75% | 85% | +10% |
| Epics closed | 3 (0, 0.5, 1, 2) | 4 (+Epic 3) | +1 |
| Tests passing | ~2783 | 2820 | +37 |
| Coverage-tracked files | 119 | 120 | +1 |
| Overall coverage | 96.97% | ~97% | steady |
| Releases shipped | — | 2 (v0.23.0, v0.23.1) | +2 |
| Bugs found & fixed | — | 8 | — |
| Tech debt items added | — | 6 | — |
| Stories still verifying | — | 1 (4-1) | — |
