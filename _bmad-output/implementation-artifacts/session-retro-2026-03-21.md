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

---

# Session Retrospective — 2026-03-21 (late session)

**Timestamp:** ~09:30Z
**Sprint progress:** 17/20 stories done (85%), 4-1 marked done in sprint-status.yaml, 4-2 create-story in progress
**Active automation:** ralph is running, currently starting story 4-2-dockerfile-template-dev-integration

---

## 1. Session Summary

| Story | Epic | Final Status | Activity This Window | Notes |
|-------|------|-------------|---------------------|-------|
| 4-1-dockerfile-rules-validation | Epic 4: Infrastructure | Done (per sprint-status.yaml) | Marked complete | AC10 fix was committed (4f0a376). Re-verification either passed or was accepted. |
| 4-2-dockerfile-template-dev-integration | Epic 4: Infrastructure | In Progress | create-story phase starting | Ralph automation initiated story creation. No issues logged yet. |

No new entries were added to `.session-issues.md` since the last retro at ~09:20Z. Ralph is actively running (loop_count: 2, status: running) and has moved to 4-2's create-story phase.

**Test suite:** 2820 tests passing across 120 files, ~97% overall coverage (unchanged from last window).

---

## 2. Issues Analysis

### New Issues Since Last Retro

None. The session issues log has not been updated since the 4-1 verify entry at 05:35Z. All issues from today were already analyzed in the end-of-day consolidation retro.

### State Inconsistency Noted

- `sprint-status.yaml` shows `4-1-dockerfile-rules-validation: done`
- `sprint-state.json` shows `4-1-dockerfile-rules-validation: in-progress`
- These are out of sync. The yaml is authoritative per project convention. The sprint-state.json may not have been updated after 4-1 was finalized.

### Outstanding Items From Prior Retros (Still Open)

1. **BATS onboard tests still skipped** (commit b5f062c) -- marked "Fix Now" in prior retro, not yet addressed
2. **4-1 re-verification status unclear** -- sprint-status.yaml says done, but no verification entry in session issues log confirms AC10 re-pass
3. **6 tech debt items from today** -- none resolved yet (raw() utility, formatAuditJson no-op, loose tool matching, missing line numbers, skipped BATS tests, console.log usage)

---

## 3. What Went Well

- **Story 4-1 completed.** Despite the AC10 failure during first verification, the bug was found, fixed, test added, and the story reached done status. The full pipeline worked as intended -- verification caught an integration seam bug that unit tests missed.
- **Sprint at 85% completion.** 17 of 20 stories done. Epic 0, 0.5, 1, 2, and 3 all fully closed. Only Epics 4 and 5 remain.
- **Continuous automation.** Ralph seamlessly transitioned from 4-1 completion to 4-2 story creation without manual intervention.
- **Session issues log discipline held.** Every subagent phase logged its findings consistently across the entire day.

---

## 4. What Went Wrong

- **"Fix Now" items from prior retros remain unfixed.** The skipped BATS tests (b5f062c) were flagged as "Fix Now" in the ~05:40Z retro and again in the ~09:20Z consolidation. They are still skipped. This pattern of flagging items as urgent and not acting on them erodes the retro process.
- **State sync gap.** sprint-state.json and sprint-status.yaml disagree on 4-1 status. This makes it unclear whether 4-1 actually passed re-verification or was just marked done.
- **No new session issues logged for 4+ hours.** Either nothing happened between ~05:40Z and now (possible if ralph was idle), or subagents stopped logging issues. The gap makes it hard to reconstruct what happened.

---

## 5. Lessons Learned

### Patterns to Repeat

- **End-of-day consolidation retros.** The ~09:20Z retro synthesized three session windows into a single coherent analysis with cumulative metrics. This format is the most useful for tracking progress across a full day.
- **Bug discovery rate tracking.** Tracking "8 bugs across 2 stories, code review caught 75%" gives a quantitative handle on quality gate effectiveness.

### Patterns to Avoid

- **Marking items "Fix Now" without actually fixing them.** If an item has been "Fix Now" across two retros and is still unfixed, it should either be escalated or reclassified. Calling something urgent and ignoring it is worse than calling it backlog.
- **Dual state files without sync mechanism.** sprint-status.yaml and sprint-state.json serving overlapping purposes without a sync step creates confusion.

---

## 6. Action Items

### Fix Now (Before Next Session)

- [ ] **Reconcile sprint-state.json with sprint-status.yaml** -- 4-1 status disagrees between the two files
- [ ] **Fix or rewrite skipped BATS onboard tests** (commit b5f062c) -- third consecutive retro flagging this as urgent

### Fix Soon (Next Sprint)

- [ ] Add `raw()` output utility to `src/lib/output.ts`
- [ ] Add line number reporting to `checkBinaryOnPath`
- [ ] Document known false positive scenarios for `checkVerificationTools`
- [ ] Investigate CI gap that let `run-helpers.test.ts` --live flag test stay broken
- [ ] Add integration test for `checkInfrastructure()` -> `validateDockerfile()` warning propagation seam

### Backlog (Track but Not Urgent)

- [ ] Consider data-driven Dockerfile rules (parsed from markdown)
- [ ] Add structured log events for audit/onboard CLI interactions
- [ ] Improve `dfGap()` branch coverage from 87.5% to 100%
- [ ] Review whether `formatAuditJson()` should be removed as a no-op
- [ ] Add deprecation warnings for dropped onboard subcommands
- [ ] Replace test LOC estimates with test case count estimates
- [ ] Add sync mechanism between sprint-status.yaml and sprint-state.json

---

## Cumulative Day Metrics (Updated)

| Metric | Start of Day | Current | Delta |
|--------|-------------|---------|-------|
| Stories done | 15 | 17 | +2 |
| Sprint completion | 75% | 85% | +10% |
| Epics closed | 3 | 4 (+Epic 3) | +1 |
| Tests passing | ~2783 | 2820 | +37 |
| Coverage-tracked files | 119 | 120 | +1 |
| Overall coverage | 96.97% | ~97% | steady |
| Releases shipped | 0 | 2 (v0.23.0, v0.23.1) | +2 |
| Bugs found & fixed | 0 | 8 | +8 |
| Tech debt items added | 0 | 6 | +6 |
| Tech debt items resolved | 0 | 0 | 0 |
| Retro "Fix Now" items carried over | 0 | 2 | +2 |
| Stories in progress | 0 | 1 (4-2) | +1 |

---

# Session Retrospective — 2026-03-21 (final session)

**Timestamp:** ~10:00Z
**Sprint progress:** 19/20 stories done (95%), Epics 0-4 complete, Epic 5 (2 stories) in backlog
**Active automation:** ralph completed -- stories 4-1 and 4-2 fully verified, Epic 4 closed

---

## 1. Session Summary

| Story | Epic | Final Status | Activity Since Last Retro | Notes |
|-------|------|-------------|--------------------------|-------|
| 4-1-dockerfile-rules-validation | Epic 4: Infrastructure | Done | Re-verification completed | AC10 re-verified after bug fix. 10/10 ACs passed. Committed (4f0a376). |
| 4-2-dockerfile-template-dev-integration | Epic 4: Infrastructure | Done | Full pipeline: create-story, dev-story, code-review, verify | All 10 ACs passed black-box Docker verification. Committed (84bf111). |
| Epic 4 closure | — | Done | Epic marked complete | Committed (81025b2). |

Both remaining Epic 4 stories reached done status. Epic 4 is fully closed. The sprint now stands at 19/20 stories done with only Epic 5 (2 stories: 5-1, 5-2) remaining in backlog.

**Test suite at session end:** 2845 tests passing across 121 files, 96.98% overall coverage, all files above 80% floor.

---

## 2. Issues Analysis

### Bugs Discovered During Implementation

- **HIGH: Unhandled writeFileSync exception** in 4-2 dockerfile-template.ts -- violated Result<T> "never throws" contract. Fixed with try/catch during code review.
- **MEDIUM: Missing projectDir validation** in 4-2 -- falsy values produced garbage paths. Fixed with guard clause.
- **MEDIUM: Test mock leak** in 4-2 -- `vi.clearAllMocks()` doesn't reset implementations, causing inter-test pollution. Fixed by switching to `vi.resetAllMocks()`.

### Workarounds Applied (Tech Debt Introduced)

- **Single-line apt-get format coupling** (4-2) -- Templates use `apt-get install curl jq` on one line because `validateDockerfile()` checks lines independently. Multi-line `\` continuations cause false negatives. The validator and template generator are now coupled to single-line format. This is a design constraint, not a simple workaround.
- **Task 5.2 skipped** (4-2) -- No init-project integration tests added. Template function tested via its own 22-test file instead. init-project.test.ts does not assert on the `dockerfile` field in InitResult.

### Code Quality Concerns

- **Coverage gap in init-project.test.ts** -- Tests predate story 4-2 and don't cover the new `dockerfile` field in InitResult. Functional coverage exists in the dedicated template test file, but integration coverage is missing.
- **Redundant `resolvedStack` variable** (LOW, not fixed) -- Accepted as-is during code review; clarity over brevity.

### Verification Gaps

- **4-1 AC10 re-verification passed cleanly.** The warning-to-gap propagation fix in dimensions.ts (from prior session) was confirmed working with a rebuilt Docker image. The previous PARTIAL PASS was due to a stale Docker image.
- **Story files still say "verifying"** -- Both 4-1 and 4-2 story markdown files have `Status: verifying` but sprint-status.yaml says `done`. The story file status was not updated after verification passed.

### Tooling/Infrastructure Problems

- **Showboat not installed in verification container** -- 4-2 verification noted "Showboat not installed -- skipping re-verification." Warning only, not blocking, but means showboat-dependent features are not verified in the container.
- **sprint-state.json shows 4-2 as "ready" with 1 attempt** -- Despite 4-2 being done per sprint-status.yaml and committed. The sprint-state.json sync issue (flagged in prior retro) persists.

---

## 3. What Went Well

- **Epic 4 fully completed.** Both stories (4-1, 4-2) passed all 20 ACs combined (10 each) through black-box Docker verification. Zero escalations on 4-2.
- **Sprint at 95% completion.** 19 of 20 stories done. 5 epics closed (0, 0.5, 1, 2, 3, 4). Only Epic 5 (workflow integration, 2 stories in backlog) remains.
- **4-1 AC10 bug fix confirmed.** The integration seam bug (warnings not propagated from validator to audit output) was properly fixed and re-verified. The full find-fix-verify cycle worked.
- **Code review caught 3 bugs in 4-2.** Continues the pattern -- code review is the highest-value quality gate (11 bugs caught across all stories today, ~80% found during review).
- **4-2 completed in a single automation run.** Create-story through verify with no manual intervention needed. Ralph automation handled the full pipeline.
- **Test suite growth continues.** 2820 to 2845 tests (+25), one new coverage-tracked file (120 to 121). Coverage held steady at ~97%.

---

## 4. What Went Wrong

- **"Fix Now" items from prior retros still unfixed.** The skipped BATS onboard tests (commit b5f062c) have been flagged as "Fix Now" in three consecutive retros. They remain skipped. This item should be reclassified or actually fixed.
- **Sprint-state.json / sprint-status.yaml sync still broken.** Flagged in the ~09:30Z retro, still unresolved. sprint-state.json shows 4-2 as "ready" despite being done and committed. No sync mechanism exists.
- **Story file statuses not updated after verification.** Both 4-1 and 4-2 story files still say `Status: verifying` despite passing all ACs. This is cosmetic but creates confusion when reading story files directly.
- **Validator single-line coupling.** The decision to make templates use single-line `apt-get install` because the validator can't handle multi-line RUN instructions is a design limitation that will bite when users write real-world Dockerfiles with multi-line commands.
- **No init-project integration test coverage for Dockerfile template.** The template function is tested, but the integration point (init-project calling the template function and including results in InitResult) is untested.

---

## 5. Lessons Learned

### Patterns to Repeat

- **Rebuild Docker image before re-verification.** The 4-1 AC10 "PARTIAL PASS" was caused by a stale Docker image. Rebuilding before re-verification gave a clean 10/10 PASS. Always rebuild when re-verifying after code changes.
- **Dedicated test files for new modules.** 4-2's `dockerfile-template.ts` got its own 22-test file rather than being shoehorned into init-project tests. This kept tests focused and avoided heavy mocking dependencies.
- **Full automation for non-blocking stories.** 4-2 ran through ralph's full pipeline (create-dev-review-verify) without manual intervention. Stories with clear ACs and no external dependencies are ideal automation candidates.

### Patterns to Avoid

- **Ignoring "Fix Now" across multiple retros.** If an item survives 3+ retros as "Fix Now" without action, it should either be done immediately, reclassified to "Fix Soon" with a reason, or removed. Keeping it as "Fix Now" while ignoring it degrades trust in the retro process.
- **Coupling validators and generators to implementation details.** The single-line format coupling between `validateDockerfile()` and `generateDockerfileTemplate()` means a bug fix in the validator (adding multi-line support) would break templates, and vice versa. These should be independent.
- **Dual state files without a sync mechanism.** sprint-state.json and sprint-status.yaml continue to diverge. Pick one as authoritative and deprecate the other, or add automatic sync.

---

## 6. Action Items

### Fix Now (Before Next Session)

- [ ] **Fix or rewrite skipped BATS onboard tests** (commit b5f062c) -- fourth consecutive retro flagging this. If not fixable now, reclassify to "Fix Soon" with documented reason.
- [ ] **Reconcile sprint-state.json with sprint-status.yaml** -- 4-2 shows "ready" in sprint-state.json despite being done
- [ ] **Update story file statuses** -- 4-1 and 4-2 story files still say `Status: verifying`; should say `Status: done`

### Fix Soon (Next Sprint)

- [ ] Add multi-line RUN instruction support to `validateDockerfile()` -- decouples validator from single-line format assumption
- [ ] Add `raw()` output utility to `src/lib/output.ts` (carried from prior retro)
- [ ] Add init-project integration test asserting `dockerfile` field in InitResult
- [ ] Add line number reporting to `checkBinaryOnPath` (carried from prior retro)
- [ ] Document known false positive scenarios for `checkVerificationTools` (carried from prior retro)
- [ ] Investigate CI gap that let `run-helpers.test.ts` --live flag test stay broken (carried from prior retro)
- [ ] Add integration test for `checkInfrastructure()` -> `validateDockerfile()` warning propagation seam (carried from prior retro)

### Backlog (Track but Not Urgent)

- [ ] Consider data-driven Dockerfile rules (parsed from markdown) instead of hardcoded
- [ ] Add structured log events for audit/onboard CLI interactions
- [ ] Improve `dfGap()` branch coverage from 87.5% to 100%
- [ ] Review whether `formatAuditJson()` should be removed as a no-op
- [ ] Add deprecation warnings for dropped onboard subcommands (`coverage`, `audit`, `epic`)
- [ ] Replace test LOC estimates with test case count estimates
- [ ] Add sync mechanism between sprint-status.yaml and sprint-state.json (or deprecate one)
- [ ] Install showboat in verification Docker container for full-coverage verification

---

## Final Day Metrics (2026-03-21)

| Metric | Start of Day | End of Day | Delta |
|--------|-------------|------------|-------|
| Stories done | 15 | 19 | +4 |
| Sprint completion | 75% | 95% | +20% |
| Epics closed | 3 (0, 0.5, 1, 2) | 5 (+Epic 3, +Epic 4) | +2 |
| Tests passing | ~2783 | 2845 | +62 |
| Coverage-tracked files | 119 | 121 | +2 |
| Overall coverage | 96.97% | 96.98% | steady |
| Releases shipped | 0 | 2 (v0.23.0, v0.23.1) | +2 |
| Bugs found & fixed | 0 | 11 | +11 |
| Tech debt items added | 0 | 8 | +8 |
| Tech debt items resolved | 0 | 0 | 0 |
| Retro "Fix Now" items carried over | 0 | 3 | +3 |
| Stories remaining (backlog) | 5 | 1 (Epic 5: 2 stories) | -3 |

---

## Sprint Health Assessment

The sprint is effectively complete at 95% (19/20 stories). The remaining 2 stories (5-1, 5-2) are in Epic 5 (Workflow Integration) and marked as backlog -- they were stretch goals, not committed scope. All committed scope is done.

**Key risk:** 8 tech debt items added today with 0 resolved. The skipped BATS tests have been "Fix Now" for 4 retros without action. If this pattern continues, tech debt will compound faster than it can be addressed.

**Recommendation:** Before starting any new feature work, dedicate one session to tech debt resolution -- fix the BATS tests, add the `raw()` utility, reconcile the state files, and close at least 3-4 of the 8 open items.
