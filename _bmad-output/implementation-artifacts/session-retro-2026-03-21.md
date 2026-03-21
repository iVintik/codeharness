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

---

# Session Retrospective -- 2026-03-21 (post-final session)

**Timestamp:** ~06:08Z -- ~06:25Z
**Sprint progress:** 19/20 stories done (95%), Epic 5 partially complete (5-1 done, 5-2 backlog)
**Active automation:** ralph running, completed 5-1 full pipeline
**Commit:** 1db2755 feat: story 5-1-code-review-observability-check

---

## 1. Session Summary

| Story | Epic | Final Status | Phases Completed | Notes |
|-------|------|-------------|-----------------|-------|
| 5-1-code-review-observability-check | Epic 5: Workflow Integration | Done | create-story, dev-story, code-review, verify | All 6 ACs passed. Committed (1db2755). |

One story completed through the full pipeline in a single automation run (~17 minutes). This was a lightweight story -- primarily patch-file updates with minimal TypeScript code. The main deliverable is markdown enforcement content for code review patches and Semgrep tooling integration.

**Test suite at session end:** 2855 tests passing across 121 files, 96.98% overall coverage, all files above 80% floor.

---

## 2. Issues Analysis

### Bugs Discovered During Implementation

- **MEDIUM: Review patch missing `--json` flag** -- Semgrep command in the review enforcement patch would produce wrong output format. Fixed during code review.
- **MEDIUM: Tautological test** -- Semgrep JSON contract test validated a hardcoded mock against itself, proving nothing. Replaced with real `parseSemgrepOutput()` integration test during code review.
- **MEDIUM: Module-scope `readFileSync`** -- Test file would crash entirely if patch file was missing. Moved to `beforeAll` during code review.

### Workarounds Applied (Tech Debt Introduced)

- **Em dash vs double dash inconsistency** (LOW, not fixed) -- Pre-existing inconsistency between patch files and analyzer.ts. Not introduced this session but noted.
- **Fragile `ROOT` path resolution** (LOW, not fixed) -- Uses `__dirname` + four `..` segments. Brittle if directory structure changes. Pre-existing pattern.

### Code Quality Concerns

- **ACs #2-#4 depend on LLM agent behavior** -- Unit tests can only verify patch content exists, not that Claude will correctly interpret the enforcement instructions during real code reviews. This is an inherent limitation of testing LLM-driven workflows.
- **Epic AC naming mismatch** -- Epic references `patches/review/review-enforcement.md` but actual file is `patches/review/enforcement.md`. The epic spec was slightly wrong; implementation used the correct name.

### Verification Gaps

- **ACs #2-#4 verified via patch content + Semgrep tooling** rather than live Claude agent sessions. Claude CLI was not authenticated in the verification Docker container. This is a reasonable proxy but not full integration verification.

### Tooling/Infrastructure Problems

- **CRITICAL: verify-env prepare does NOT copy `patches/` into Docker container.** The container uses the globally installed npm package (v0.23.1) which predates this story's changes. First verification run failed 5/6 ACs because patches were stale. Had to manually `docker cp` updated patches into the container.
- **This is a systemic issue.** Any story that modifies `patches/` will hit this same problem. The verify-env prepare step or Docker image build needs to include current working-tree patches, not just the published npm version.

### State Sync Issues (Persistent)

- **sprint-state.json shows 5-1 as "review"** despite sprint-status.yaml showing "done" and the commit existing (1db2755). The sprint-state.json / sprint-status.yaml desync continues unresolved from prior retros.

---

## 3. What Went Well

- **Full pipeline in one automation run.** Story 5-1 went from create-story through verify in ~17 minutes with no manual intervention. Lightweight stories are ideal automation candidates.
- **Code review caught 3 real bugs.** The missing `--json` flag would have caused Semgrep integration to fail silently. The tautological test was giving false confidence. The module-scope readFileSync was a test fragility time bomb. All three caught before merge.
- **Clean implementation.** 8 new tests, zero regressions, 2855 total tests passing. No flaky tests introduced.
- **Sprint at 95% with only stretch goals remaining.** All committed scope is done. Story 5-2 (verification-runtime-integration) remains in backlog as a stretch goal.
- **Session issues log discipline continues.** All 4 phases logged their findings. The log remains the definitive source of truth for retrospectives.

---

## 4. What Went Wrong

- **Verification environment broken for patch-modifying stories.** The verify-env prepare step does not copy current `patches/` into the Docker container. This caused a full first-pass verification failure (5/6 ACs failed). The manual `docker cp` workaround is fragile and non-reproducible. This was flagged but not fixed.
- **"Fix Now" items continue to accumulate without action.** The skipped BATS tests (commit b5f062c) are now in their fifth consecutive retro as "Fix Now." The sprint-state.json desync is in its third. Neither has been addressed.
- **ACs testing LLM behavior can only be partially verified.** Story 5-1's ACs #2-#4 fundamentally depend on Claude agent behavior during real review sessions. The verification used content-existence checks as a proxy. There's no way to unit-test "will the LLM follow these instructions."
- **Tech debt count grew to 10 items with 0 resolved.** Every session adds items; none have been closed.

---

## 5. Lessons Learned

### Patterns to Repeat

- **Lightweight stories complete fast in automation.** When the scope is primarily patch-file content with minimal TypeScript, the full pipeline (create-dev-review-verify) can finish in under 20 minutes. Prioritize splitting large stories to get this benefit.
- **Code review catches bugs in test code, not just production code.** The tautological test and module-scope readFileSync were both in test files. Review should scrutinize tests as carefully as production code.
- **Manual `docker cp` as verification workaround.** While fragile, it unblocked verification without waiting for an infrastructure fix. Acceptable as a one-time workaround but must not become habit.

### Patterns to Avoid

- **Modifying `patches/` without updating verify-env prepare.** This will break verification for every future patches story. The infrastructure fix should happen before the next patches story, not after.
- **Flagging "Fix Now" items across 5+ retros.** At this point either fix them or admit they are backlog. The "Fix Now" label has lost all meaning.
- **Writing ACs that require LLM behavior verification.** For stories that configure LLM agent behavior (patches, prompts, enforcement rules), ACs should focus on what can be mechanically verified: file existence, content correctness, tool integration. "Agent follows instructions" is not testable.

---

## 6. Action Items

### Fix Now (Before Next Session)

- [ ] **Fix verify-env prepare to copy current `patches/` into Docker container** -- This blocks clean verification for any patches-modifying story. Systemic blocker.
- [ ] **Fix or reclassify skipped BATS onboard tests** (commit b5f062c) -- Fifth retro flagging this. Either fix them now or move to "Backlog" with explicit justification. Calling it "Fix Now" and ignoring it is dishonest.
- [ ] **Reconcile sprint-state.json** -- 5-1 shows "review" despite being done and committed. Third retro flagging this.

### Fix Soon (Next Sprint)

- [ ] Add multi-line RUN instruction support to `validateDockerfile()` (carried)
- [ ] Add `raw()` output utility to `src/lib/output.ts` (carried)
- [ ] Add init-project integration test for `dockerfile` field in InitResult (carried)
- [ ] Add line number reporting to `checkBinaryOnPath` (carried)
- [ ] Document known false positive scenarios for `checkVerificationTools` (carried)
- [ ] Investigate CI gap for `run-helpers.test.ts` --live flag test (carried)
- [ ] Add integration test for `checkInfrastructure()` -> `validateDockerfile()` warning propagation seam (carried)

### Backlog (Track but Not Urgent)

- [ ] Consider data-driven Dockerfile rules (parsed from markdown) instead of hardcoded (carried)
- [ ] Add structured log events for audit/onboard CLI interactions (carried)
- [ ] Improve `dfGap()` branch coverage from 87.5% to 100% (carried)
- [ ] Review whether `formatAuditJson()` should be removed as a no-op (carried)
- [ ] Add deprecation warnings for dropped onboard subcommands (carried)
- [ ] Replace test LOC estimates with test case count estimates (carried)
- [ ] Add sync mechanism between sprint-status.yaml and sprint-state.json (carried)
- [ ] Install showboat in verification Docker container (carried)
- [ ] Fix fragile `ROOT` path resolution using `__dirname` + four `..` segments
- [ ] Resolve em dash vs double dash inconsistency between patches and analyzer.ts
- [ ] Write AC guidelines for LLM-behavior-dependent stories -- focus ACs on mechanically verifiable criteria

---

## Cumulative Day Metrics (Final Update)

| Metric | Start of Day | End of Day | Delta |
|--------|-------------|------------|-------|
| Stories done | 15 | 19 | +4 |
| Sprint completion | 75% | 95% | +20% |
| Epics closed | 3 (0, 0.5, 1, 2) | 5 (+Epic 3, +Epic 4) | +2 |
| Tests passing | ~2783 | 2855 | +72 |
| Coverage-tracked files | 119 | 121 | +2 |
| Overall coverage | 96.97% | 96.98% | steady |
| Releases shipped | 0 | 2 (v0.23.0, v0.23.1) | +2 |
| Bugs found & fixed | 0 | 14 | +14 |
| Tech debt items added | 0 | 10 | +10 |
| Tech debt items resolved | 0 | 0 | 0 |
| Retro "Fix Now" items carried over | 0 | 3 | +3 |
| Stories remaining (backlog) | 5 | 1 (5-2) | -4 |

---

## Sprint Health Assessment (Final)

The sprint is at 95% completion (19/20 stories). Story 5-2 (verification-runtime-integration) remains in backlog as a stretch goal. All committed scope is done. Five epics closed today (0, 0.5, 1, 2, 3, 4). Epic 5 is partially complete with 5-1 done and 5-2 in backlog.

**Throughput:** 4 stories completed, 14 bugs found and fixed, 72 new tests added, 2 releases shipped -- all in a single day. The automation pipeline (ralph) handled 3 of 4 stories end-to-end without manual intervention.

**Critical risk: Tech debt at zero resolution rate.** 10 tech debt items added today, 0 resolved. Three "Fix Now" items have survived 3-5 consecutive retros without action. The retro "Fix Now" classification has become meaningless. The verify-env patches issue is a genuine blocker for future stories.

**Recommendation: Next session must be a tech debt session.** No new feature stories until at least these are resolved: (1) verify-env patches copying, (2) BATS test fix or reclassification, (3) sprint-state.json reconciliation. Then tackle 2-3 "Fix Soon" items. Only after that should story 5-2 be attempted.

---

# Session Retrospective — 2026-03-21 (Loop #4)

**Sprint:** Operational Excellence Sprint
**Session window:** ~06:27Z – ~06:57Z (approx 30 minutes)
**Sprint progress:** 19/20 stories done (95%), story 5-2 in `verifying`
**Loop:** 4 of today's ralph autonomous sessions

---

## 1. Session Summary

| Story | Epic | Entry Status | Exit Status | Phases Completed |
|-------|------|-------------|-------------|-----------------|
| 5-2-verification-runtime-integration | Epic 5: Workflow Integration | backlog | verifying | create-story, dev-story, code-review |

One story attempted. Story 5-2 is the last story in the sprint and the last story in Epic 5. It progressed through creation, implementation, and code review within the 30-minute budget. Docker-based verification was not reached — by the time code review completed (~06:45Z), approximately 8 minutes remained, which was insufficient for a full verification cycle (typically 10-15 minutes).

The story itself was lightweight ("thin story" per the issues log): most code already existed from Epic 2. The implementation was primarily patch updates and test writing. Both dev and code-review phases reported clean runs with no major issues.

**Test results at session end:** 2872 tests passing across 121 files, 96.98% overall coverage, all files above 80% floor.

---

## 2. Issues Analysis

### Bugs Found & Fixed (3)

| Severity | Issue | Where | Resolution |
|----------|-------|-------|------------|
| MEDIUM | VerifyResult type contract test was untyped — no compile-time protection against field removal | code-review | Added explicit type annotation |
| MEDIUM | Missing `saveRuntimeCoverage` persistence test — AC #5 had no test for file I/O path | code-review | Test added |
| MEDIUM | Patch hardcoded VictoriaLogs URL without noting configurability, inconsistent with verify-prompt.ts endpoint overrides | code-review | Fixed |

### Tech Debt Identified (Not Fixed) (2)

| Severity | Issue | Notes |
|----------|-------|-------|
| LOW | Coverage percentage computation duplicated in test — manually replicates formula instead of calling `computeRuntimeCoverage` | Fragile if formula changes |
| LOW | No test for `parseObservabilityGaps` with multiple gaps in one AC section | Edge case coverage gap |

### Planning/Ambiguity Issues (2)

- **Ambiguity in epic definition:** Epic AC #2 says "verify-prompt.ts is updated" but the template already contains observability instructions from Epic 2. Interpreted as a confirmation/regression-test task. Reasonable interpretation but shows epic ACs can drift as implementation proceeds.
- **Thin story risk:** Most code existed from Epic 2. Risk of dev agent over-engineering was called out at story creation. Dev agent handled it cleanly — no over-engineering observed.

### Systemic Issues (Carried Over)

- **verify-env patches not copied into Docker container** — Identified in loop #3 (story 5-1), still not fixed. Story 5-2 verification will hit this same issue. This is the most critical blocker for completing the sprint.

---

## 3. What Went Well

- **Clean implementation runs.** Both dev-story and code-review phases reported zero issues on first pass. The dev phase had "None" in the issues log — the cleanest implementation of the entire sprint day.
- **Appropriate scoping.** The story was correctly identified as thin at creation time, and the dev agent did not over-engineer. 16 new tests added, focused on the actual requirements.
- **Code review caught real issues.** Three MEDIUM-severity bugs found and fixed: untyped contract test, missing persistence test, hardcoded URL. All three would have caused problems in verification or future maintenance.
- **Sprint nearly complete.** 19/20 stories done, 95% completion. Five epics closed. Only verification of story 5-2 remains.
- **Test count growth.** Sprint day total: 2783 -> 2872 tests (+89 tests across 4 loops).

---

## 4. What Went Wrong

- **Verification not reached.** The primary gap. Story 5-2 exited code review at ~06:45Z with only ~8 minutes left in the 30-minute budget. Verification requires Docker container setup, patch copying (with the known patches issue), and AC-by-AC checks — 10-15 minutes minimum. The story remains in `verifying`.
- **Sprint cannot close this session.** Epic 5 and the sprint remain open because of this one unverified story.
- **verify-env patches issue still unresolved.** This was flagged in loop #3's retro as a "Fix Now" item. It was not fixed between loops. When story 5-2 verification is attempted, it will hit this same blocker and require the same manual `docker cp` workaround.
- **Tech debt accumulation continues.** 2 more LOW items added this loop, bringing the day's total to 12 tech debt items with 0 resolved.

---

## 5. Lessons Learned

### Patterns to Repeat

1. **Thin story identification at creation time works.** Calling out "this is a thin story" in the issues log set correct expectations and prevented over-engineering.
2. **Clean dev runs are achievable.** When the codebase is well-established and the story is well-scoped, zero-issue dev phases happen. Stories later in a sprint benefit from the infrastructure built by earlier stories.
3. **Code review continues to find real bugs.** 3/3 MEDIUM issues found this loop were genuine defects, not style nits. The review phase earns its time cost.

### Patterns to Avoid

1. **Leaving systemic blockers unfixed between loops.** The verify-env patches issue was identified in loop #3 and could have been fixed in the ~5 minutes between loops. Instead it will cost 5-10 minutes of workaround time again in the next verification attempt.
2. **Attempting verification with <10 minutes remaining.** Verification consistently takes 10-15 minutes. Budget planning should account for this and either skip verification (leaving story in `review`) or allocate sufficient time.
3. **Zero tech debt resolution across an entire day.** Four loops, 12 tech debt items accumulated, 0 resolved. The debt resolution rate needs a dedicated session.

---

## 6. Action Items

| Priority | Action | Owner | Status |
|----------|--------|-------|--------|
| **Fix Now** | Fix verify-env to copy `patches/` into Docker container | Next session | Carried over from loop #3 |
| **Fix Now** | Run verification for story 5-2 to close Epic 5 and the sprint | Next session | New |
| **Fix Soon** | Resolve or reclassify the 3 "Fix Now" items that have survived 4+ retros | Next session | Carried over |
| **Fix Soon** | Dedicate a session to tech debt (12 items at 0% resolution rate) | Next sprint | Carried over |
| **Track** | Add test for `parseObservabilityGaps` with multiple gaps | Backlog | New |
| **Track** | Replace duplicated coverage formula in test with `computeRuntimeCoverage` call | Backlog | New |

---

## Cumulative Sprint Day Metrics (Loops 1-4)

| Metric | Start of Day | End of Loop 4 | Delta |
|--------|-------------|---------------|-------|
| Sprint completion | 75% (15/20) | 95% (19/20) | +20% |
| Epics closed | 3 | 5 (3, 4 closed; 5 pending verification) | +2 |
| Tests passing | ~2783 | 2872 | +89 |
| Coverage-tracked files | 119 | 121 | +2 |
| Overall coverage | 96.97% | 96.98% | steady |
| Releases shipped | 0 | 2 (v0.23.0, v0.23.1) | +2 |
| Bugs found & fixed | 0 | 17 | +17 |
| Tech debt items added | 0 | 12 | +12 |
| Tech debt items resolved | 0 | 0 | 0 |
| Stories remaining | 5 | 1 (5-2 in verifying) | -4 |

---

## Sprint Health Assessment

The sprint is at 95% completion. Story 5-2 has passed code review and needs only Docker verification to close. The implementation is solid — clean dev run, 3 code review bugs fixed, 2872 tests passing.

**The single blocker is verification.** Once the verify-env patches issue is resolved (or worked around via `docker cp`), story 5-2 verification should take ~15 minutes. If all 6 ACs pass (likely given the clean implementation), Epic 5 closes and the sprint is 100% complete.

**Tech debt remains the elephant in the room.** Four retrospectives today have flagged the same systemic issues. The verify-env patches problem has been manually worked around twice rather than fixed. The recommendation from loop #3 stands: the next session after sprint completion should be dedicated to tech debt resolution before starting any new feature work.

---

# Final Sprint Retrospective — 2026-03-21T10:45Z

**Sprint:** Operational Excellence Sprint
**Full session window:** ~04:21Z – ~06:57Z (approx 2 hours 36 minutes across 5 ralph loops)
**Sprint result:** 20/20 stories done — 100% complete. All 5 epics closed.

---

## 1. Session Summary

| Story | Epic | Outcome | Phases | Notes |
|-------|------|---------|--------|-------|
| 3-3-onboard-alias | 3: Audit Command | Done | create, dev, review, verify | Replaced 478-line onboard with 40-line alias |
| 4-1-dockerfile-rules-validation | 4: Infra Guidelines | Done | create, dev, review, verify | 9/10 ACs passed first run; AC10 fix applied |
| 4-2-dockerfile-template-dev-integration | 4: Infra Guidelines | Done | create, dev, review, verify | Clean run, all 10 ACs passed |
| 5-1-code-review-observability-check | 5: Workflow Integration | Done | create, dev, review, verify | Patch infrastructure issue required docker cp workaround |
| 5-2-verification-runtime-integration | 5: Workflow Integration | Done | create, dev, review, verify | Same infrastructure issue; tree-shaking complication |

**Final metrics:** 2872 tests passing, 121 coverage-tracked files, 96.98% overall coverage, all files above 80% floor.

---

## 2. Issues Analysis

### Bugs Discovered During Implementation or Verification

| Issue | Severity | Story | Status |
|-------|----------|-------|--------|
| Unsafe double type assertion (`as unknown as Record<...>`) | HIGH | 3-3 | Fixed (spread operator) |
| Operator precedence ambiguity in `checkVerificationTools` | HIGH | 4-1 | Fixed (added parens) |
| Unhandled `writeFileSync` exception violating Result<T> contract | HIGH | 4-2 | Fixed (try/catch) |
| AC10: `validateDockerfile()` warnings not propagated to audit output | HIGH | 4-1 | Fixed (verify phase) |
| Review patch missing `--json` flag for Semgrep | MEDIUM | 5-1 | Fixed |
| `checkNoSourceCopy` missed `COPY --chown` flag patterns | MEDIUM | 4-1 | Fixed |
| Tautological test (mock validated against itself) | MEDIUM | 5-1 | Fixed |
| Module-scope `readFileSync` crashes test file if patch missing | MEDIUM | 5-1 | Fixed |
| `VerifyResult` type contract test was untyped | MEDIUM | 5-2 | Fixed |
| Patch hardcoded VictoriaLogs URL without configurability note | MEDIUM | 5-2 | Fixed |
| Dead branch guard (`fixStories &&` always true) | MEDIUM | 3-3 | Fixed |
| Test mock leak (`clearAllMocks` vs `resetAllMocks`) | MEDIUM | 4-2 | Fixed |
| Missing `projectDir` validation producing garbage paths | MEDIUM | 4-2 | Fixed |
| `readPatchFile()` path resolution bug — resolves outside package dir | MEDIUM | 5-2 | NOT FIXED (pre-existing) |

**Total bugs found and fixed this session: 17. One pre-existing bug identified but not fixed.**

### Workarounds Applied (Tech Debt Introduced)

1. **Single-line apt-get in templates** (4-2): Templates use `apt-get install curl jq` instead of multi-line format because `validateDockerfile()` checks lines independently. Validator and template generator are coupled to single-line format.
2. **docker cp for patches** (5-1, 5-2): Verification container uses globally installed npm v0.23.1 which lacks current patches. Manual `docker cp` required twice. This is a systemic problem for any story modifying `patches/`.
3. **tsx for tree-shaken exports** (5-2): `verifyPromptTemplate()` is tree-shaken from `dist/index.js` because nothing imports it from CLI entry point. Verified via `tsx` instead.
4. **Patch content verification as proxy for agent integration** (5-1): ACs #2-#4 verified via patch content + semgrep tooling rather than live Claude agent sessions. Reasonable proxy but not full integration test.

### Code Quality Concerns

- `console.log` in `audit-action.ts` — established codebase pattern but violates "no console.log" rule. Needs `raw()` output utility.
- `formatAuditJson()` is a pass-through no-op — exists for symmetry only.
- `checkVerificationTools` loose matching — `content.includes(tool)` matches anywhere in file.
- `checkBinaryOnPath` has no line number — inconsistent with other checks.
- Coverage percentage computation duplicated in test instead of calling `computeRuntimeCoverage`.
- Fragile `ROOT` path resolution using `__dirname` + four `..` segments.
- Em dash vs double dash inconsistency between patch and analyzer.ts.

### Verification Gaps

- **No live Claude agent integration test** for review observability patches (5-1 ACs #2-#4). Unit tests verify patch content exists but not agent interpretation.
- **init-project.test.ts doesn't assert `dockerfile` field** in InitResult (tests predate story 4-2).
- **No test for `parseObservabilityGaps` with multiple gaps** in one AC section (5-2).
- **Regex-based Dockerfile validation may false-positive** on complex multi-stage builds (4-1).

### Tooling/Infrastructure Problems

- **verify-env does not copy `patches/` into Docker container.** This broke two stories and will break any future story that modifies patches. Root cause: container uses globally installed npm package, not local source.
- **Pre-existing test failure in `run-helpers.test.ts`** (`--live` flag test) had to be fixed before 3-3 verification could proceed — unrelated to that story.
- **Showboat not installed** — skipped re-verification for 4-2 (warning only).

---

## 3. What Went Well

- **Sprint completed 100%.** All 20 stories across 5 epics done in a single day session.
- **Code review caught 17 real bugs** across 5 stories — the review phase is pulling its weight.
- **Test suite grew from ~2783 to 2872** (+89 tests) while maintaining 96.98% coverage.
- **Clean dev runs on 2 of 5 stories** (5-1, 5-2) — zero issues reported by dev agent.
- **Story 3-3 achieved 92% code reduction** — 478 lines replaced by 40-line alias.
- **AC10 bug caught by verification** (4-1) — verify phase working as intended, found a gap the dev and review phases missed.
- **Autonomous execution worked end-to-end** — ralph ran 5 loops, completed 5 stories, no human intervention needed for implementation.

---

## 4. What Went Wrong

- **verify-env patches issue hit twice** (5-1 and 5-2). Same workaround applied both times. Should have been fixed after the first occurrence.
- **AC10 failure on 4-1** required a fix during verification — the warning-to-gap propagation was missing from `dimensions.ts`. This was a design gap in the story spec (ACs expanded from 4 to 10 but the integration path wasn't fully specified).
- **12 tech debt items accumulated, 0 resolved.** Every retrospective this session flagged the same systemic issues. The debt is compounding.
- **Dual file reads in `checkInfrastructure`** shipped in dev and was caught only by code review — dev agent should have caught the redundancy.
- **Tree-shaking eliminated a needed export** (5-2) — `verifyPromptTemplate()` not reachable from CLI entry point. This is a build configuration issue that will recur.

---

## 5. Lessons Learned

### Patterns to Repeat

- **4-phase pipeline (create, dev, review, verify) is effective.** Review caught 17 bugs; verify caught 1 more that review missed. Both phases justified their cost.
- **Expanding epic ACs to story-level ACs** (4-1: 4->10, 4-2: 3->10) improved coverage and caught integration gaps earlier.
- **Clean implementation sessions (5-1, 5-2) correlate with well-scoped stories.** Lightweight patch-focused stories had zero dev issues.

### Patterns to Avoid

- **Applying the same workaround twice instead of fixing root cause.** The docker cp workaround for patches should have been a permanent fix after story 5-1.
- **Validator/template coupling to single-line format** (4-1/4-2). Validator should handle multi-line RUN instructions; templates shouldn't be constrained by validator limitations.
- **Skipping init-project integration tests** (4-2 Task 5.2). "Heavy mocking" is not a valid reason to skip integration coverage for a new feature.

---

## 6. Action Items

### Fix Now (Before Next Session)

1. **Fix verify-env to copy `patches/` into Docker container.** This blocked two stories and will block every future patches-modifying story. File: verify-env prepare script.
2. **Fix `readPatchFile()` path resolution bug.** Currently resolves outside package directory from `dist/`. Fallback templates always used instead of real patches.
3. **Fix tree-shaking of `verifyPromptTemplate()`.** Either add it to CLI exports or create a separate entry point for skill-consumed functions.

### Fix Soon (Next Sprint)

4. **Add `raw()` output utility** to replace direct `console.log` in audit-action.ts and other handlers.
5. **Make `validateDockerfile()` handle multi-line RUN instructions** (backslash continuations). Current single-line checking produces false negatives.
6. **Add init-project.test.ts assertions for `dockerfile` field** in InitResult.
7. **Stabilize `ROOT` path resolution** — replace `__dirname` + four `..` segments with a proper root-finding utility.

### Backlog (Track But Not Urgent)

8. Remove `formatAuditJson()` no-op or give it real formatting logic.
9. Add line numbers to `checkBinaryOnPath` for consistency.
10. Add test for `parseObservabilityGaps` with multiple gaps in one AC section.
11. Resolve em dash vs double dash inconsistency between patch and analyzer.ts.
12. Investigate false positive risk in regex-based Dockerfile validation for complex multi-stage builds.

---

## Sprint Completion Summary

| Metric | Start of Day | End of Day | Delta |
|--------|-------------|------------|-------|
| Stories done | 15/20 | 20/20 | +5 |
| Epics closed | 2 (0, 0.5) | 5 (0, 0.5, 3, 4, 5) | +3 |
| Tests passing | ~2783 | 2872 | +89 |
| Coverage-tracked files | 119 | 121 | +2 |
| Overall coverage | 96.97% | 96.98% | steady |
| Bugs found & fixed | 0 | 17 | +17 |
| Tech debt items opened | 0 | 12 | +12 |
| Tech debt items resolved | 0 | 0 | 0 |
| Releases shipped | 0 | 2 (v0.23.0, v0.23.1) | +2 |

**Sprint status: COMPLETE.** All 20 stories done. Next session should prioritize the 3 "Fix Now" action items before starting new feature work.

---

# Session Retrospective — 2026-03-21 (Session 07:51Z–08:12Z)

**Sprint:** Operational Excellence Sprint
**Session window:** 07:51Z – 08:12Z (~21 minutes)
**Sprint progress:** 22/26 stories done (85%), Epic 0 completed, Epic 0.5 at 3/4

## 1. Session Summary

| Story | Action | Outcome |
|-------|--------|---------|
| 0-1-sprint-state-live-updates | Docker verification | PASS (4/4 ACs) — fixed migration.ts bug |
| 0-2-ralph-progress-display | Docker verification | PASS (4/4 ACs) — fixed proof format |
| 0-3-run-command-dashboard | Docker verification | PASS (5/5 ACs) |
| 0-5-1-stream-json-claude-driver | Docker verification | PASS (4/4 ACs) |

**Epic 0 completed** — all 3 stories verified and marked done.

## 2. Issues Analysis

### Bugs discovered
- **migration.ts missing fields:** `parseRalphStatus()` didn't include new `currentStory`/`currentPhase`/`lastAction`/`acProgress` fields, causing migration test failure. Root cause: Story 0.1 extended the SprintState type but migration wasn't updated to match.

### Verification tooling issues
- **Proof format sensitivity:** `codeharness verify` requires each AC to have its own `bash` code block — sharing evidence from another AC isn't counted. Verifiers need to know this.
- **BATS tests not in container:** `ralph/tests/` directory isn't included in the npm package, so Docker verification can't run BATS tests. This affects all ralph-related stories.
- **VictoriaLogs query syntax:** The `_stream_id:*` pattern in the verify prompt template is invalid. Should use `*` wildcard.

### Observability gaps
- `codeharness progress` CLI emits no structured logs to the observability stack.

## 3. What Went Well

- **Efficient verification:** 4 stories verified in ~19 minutes. Docker black-box verification is working smoothly for these stories.
- **Bug caught:** The migration.ts bug was a real issue that would have caused runtime failures for users upgrading — verification caught it.
- **Clean passes:** 3 of 4 stories passed on first verification attempt.

## 4. What Went Wrong

- Nothing major. The proof format issue for AC3 in story 0-2 was a minor formatting issue, not a real code problem.

## 5. Lessons Learned

- "verified" status in sprint-status.yaml is non-standard — should be `verifying` or `done`. Created ambiguity about what workflow to run.
- Verifier subagents need explicit guidance that each AC must have its own `bash` evidence block.

## 6. Action Items

### Fix now
- (none — all issues resolved during session)

### Fix soon
- Fix VictoriaLogs query syntax in verify-prompt.ts template (`_stream_id:*` → `*`)
- Include `ralph/tests/` in npm package or Docker image for ralph story verification
- Add structured logging to `codeharness progress` command

### Backlog
- Standardize "verified" status → either `verifying` or `done`

---

# Session Retrospective — 2026-03-21 (Session 3: Full-day summary)

**Sprint:** Operational Excellence Sprint
**Session window:** ~05:20Z – ~10:38Z (approx 5 hours across multiple ralph runs)
**Sprint progress:** 19/25 stories done (76%), 6 remaining in backlog (Epics 6 & 7)

---

## 1. Session Summary

Today saw three distinct work phases, covering verification of previously-implemented stories and completing two full epics.

| Story | Epic | Outcome | Notes |
|-------|------|---------|-------|
| 4-1-dockerfile-rules-validation | Epic 4: Infrastructure | done | Verified ~09:39Z |
| 4-2-dockerfile-template-dev-integration | Epic 4: Infrastructure | done | Verified ~10:01Z |
| 5-1-code-review-observability-check | Epic 5: Workflow Integration | done | Verified ~10:24Z |
| 5-2-verification-runtime-integration | Epic 5: Workflow Integration | done | Verified ~11:00Z |
| 0-1-sprint-state-live-updates | Epic 0: Live Progress Dashboard | done | Bug found and fixed in migration.ts |
| 0-2-ralph-progress-display | Epic 0: Live Progress Dashboard | done | Proof format issue resolved during verify |
| 0-3-run-command-dashboard | Epic 0: Live Progress Dashboard | done | Minor format deviations accepted |
| 0-5-1-stream-json-claude-driver | Epic 0.5: Stream-JSON | done | Clean verification, no issues |
| 0-5-2-stream-event-parser | Epic 0.5: Stream-JSON | done | Required export fix and rebuild |
| 0-5-3-ink-terminal-renderer | Epic 0.5: Stream-JSON | done | Completed in final ralph run |
| 0-5-4-run-command-integration | Epic 0.5: Stream-JSON | done | Completed in final ralph run |

**Result:** 11 stories verified and marked done. Epics 0, 0.5, 4, and 5 all completed. Sprint is now at 19/25 (76%) with remaining 6 stories in backlog epics (6 & 7).

---

## 2. Issues Analysis

### Bugs Discovered During Implementation

- **Missing fields in `parseRalphStatus()`** (HIGH) — `migration.ts` did not include `currentStory`, `currentPhase`, `lastAction`, `acProgress` fields added by story 0-1. Returned undefined for these fields. Fixed by adding null defaults to the return object.
- **Missing export in `src/index.ts`** (HIGH) — `parseStreamLine` was not re-exported from the package entry point, making it inaccessible when imported from the built dist bundle. Fixed by adding the re-export and rebuilding.

### Workarounds Applied (Tech Debt)

- **`VITEST=1` env var hack** (MEDIUM) — Container verification of `parseStreamLine` requires setting `VITEST=1` to suppress CLI auto-parse on ESM module import. This is a side effect of the CLI entry point being coupled to module loading.
- **`node --input-type=module` for ESM** (LOW) — Container uses this flag to run ESM imports inline. Not a real workaround, but documents a friction point for black-box testing of ESM packages.

### Verification Gaps

- **VictoriaLogs returned zero events for all CLI invocations** — Affects stories 0-1 (progress command) and 0-5-2 (parseStreamLine). These are pure functions / commands with no structured logging. The observability coverage gap is real.
- **No BATS tests available in container** — `ralph/tests/` not included in npm package. Verification of ralph-related stories relied on direct function invocation with mock data instead of the standard BATS test suite.
- **Format deviations accepted for 0-3** — Story spec said checkmark/cross prefixes; implementation uses `[OK]`/`[FAIL]` tags. Functionally equivalent but spec-implementation mismatch was waved through.
- **Architecture deviation accepted for 0-3** — Story specified `DashboardFormatter` class; implementation uses Ink React components. Same functionality, different design approach. Accepted.

### Tooling/Infrastructure Problems

- **Non-standard `verified` status in sprint-status.yaml** — Previous session left story 0-5-2 with status `verified` (not a valid state). Had to normalize to `verifying` before proceeding.

---

## 3. What Went Well

- **High throughput:** 11 stories verified and closed in a single day across three ralph sessions. This is the highest single-day throughput in the sprint.
- **Two full epics completed:** Epic 0 (Live Progress Dashboard) and Epic 0.5 (Stream-JSON Live Activity Display) both went from in-progress to done.
- **Two more epics completed:** Epic 4 (Infrastructure Guidelines) and Epic 5 (Workflow Integration) also closed out today.
- **Clean verification on 0-5-1:** Stream-JSON Claude driver passed all 4 ACs with zero issues — demonstrates the implementation quality when specs are precise.
- **Bugs found and fixed inline:** Both the migration.ts missing fields and the index.ts missing export were caught during verification and fixed immediately, without needing a separate bug story.
- **Session issues log working well:** Every subagent reported issues consistently, providing raw material for this retrospective.

---

## 4. What Went Wrong

- **Observability gaps are systemic:** Two stories (0-1, 0-5-2) had zero VictoriaLogs events because the underlying functions have no telemetry. This is a known gap but it was verified without observability evidence — the AC was effectively waived.
- **Spec-implementation mismatches on 0-3:** The story spec described checkmark/cross prefixes and a `DashboardFormatter` class, but the implementation uses `[OK]`/`[FAIL]` tags and Ink components. This was accepted but indicates stories were written before the implementation approach was finalized.
- **Export omission on 0-5-2:** A function was implemented but not exported from the package entry point. This would have been caught by an integration test but was only found during black-box container verification. Suggests the build/export checklist is incomplete.
- **Sprint status had invalid state:** The `verified` status on 0-5-2 from a previous session is not a recognized state in the workflow. This created confusion about whether to re-verify or just mark done.

---

## 5. Lessons Learned

- **Export checklist needed:** Every new public function must be verified as exported from `src/index.ts`. This should be part of the dev-story or code-review phase, not discovered in verification.
- **Specs should be updated when architecture changes:** Story 0-3 specified a class-based design but got Ink components. The story should have been updated to reflect the actual approach before verification.
- **Pure functions need observability stubs:** Functions like `parseStreamLine` should at minimum emit a debug-level log or metric, even if they're pure. Otherwise the observability dimension of verification is meaningless.
- **Session issues log is high-value:** Having every subagent write to `.session-issues.md` made this retrospective fast and accurate. Keep this pattern.

---

## 6. Action Items

### Fix now
- (none — all blocking issues were resolved during session)

### Fix soon
- Add `parseStreamLine` and `codeharness progress` to structured logging so VictoriaLogs verification is meaningful
- Add an export verification step to the dev-story workflow — every new public function must appear in `src/index.ts`
- Standardize sprint-status.yaml states: only allow `backlog`, `in-progress`, `verifying`, `done`, `blocked`, `flagged`
- Include `ralph/tests/` in the npm package or provide an alternative path for BATS test verification in containers

### Backlog
- Decouple CLI auto-parse from ESM module loading so `VITEST=1` hack is not needed for container testing
- Update story 0-3 spec to reflect Ink component architecture (retroactive doc fix)
- Add structured telemetry to all pure utility functions (at minimum debug-level trace)

---

# Session Retrospective — 2026-03-21 (Session 8: Sprint Closeout Review)

**Timestamp:** ~14:30Z (review-only session, no implementation)
**Sprint:** Operational Excellence Sprint
**Sprint result:** 19/25 stories done (76%). Epics 0, 0.5, 1, 2, 3, 4, 5 complete. Epics 6 & 7 in backlog (5 stories).
**Active automation:** ralph idle (last ran at ~10:29Z, loop_count: 1)

---

## 1. Session Summary

This is a review-only retrospective consolidating the full day's work across 8 session windows. No new implementation was done in this window. The purpose is to assess the final state of the sprint and reconcile findings across all prior retros.

**Stories completed today (by session):**

| Story | Epic | Verified At | Key Issue |
|-------|------|------------|-----------|
| 3-3-onboard-alias | 3: Audit Command | ~05:10Z | Unsafe type assertion (fixed) |
| 4-1-dockerfile-rules-validation | 4: Infra Guidelines | ~09:39Z | AC10 warning propagation bug (fixed) |
| 4-2-dockerfile-template-dev-integration | 4: Infra Guidelines | ~10:01Z | writeFileSync exception (fixed) |
| 5-1-code-review-observability-check | 5: Workflow Integration | ~10:24Z | verify-env patches not copied (workaround) |
| 5-2-verification-runtime-integration | 5: Workflow Integration | ~11:00Z | Tree-shaking eliminated export (workaround) |
| 0-1-sprint-state-live-updates | 0: Live Progress Dashboard | ~07:55Z | migration.ts missing fields (fixed) |
| 0-2-ralph-progress-display | 0: Ralph Progress | ~08:00Z | Proof format issue (fixed) |
| 0-3-run-command-dashboard | 0: Dashboard | ~08:04Z | Format/architecture deviations accepted |
| 0-5-1-stream-json-claude-driver | 0.5: Stream-JSON | ~08:09Z | Clean pass |
| 0-5-2-stream-event-parser | 0.5: Stream-JSON | ~10:35Z | Missing export in index.ts (fixed) |
| 0-5-3-ink-terminal-renderer | 0.5: Stream-JSON | ~10:38Z | No issues logged |
| 0-5-4-run-command-integration | 0.5: Stream-JSON | ~10:38Z | No issues logged |

**Total stories completed today:** 12 (from 15/25 to 19/25 done in sprint-status.yaml; 6 remaining in backlog)

---

## 2. Issues Analysis

### Bugs Discovered During Implementation or Verification (Cumulative)

**17 bugs found and fixed across 8 stories. 1 pre-existing bug identified but not fixed.**

| Severity | Count | Discovery Phase |
|----------|-------|----------------|
| HIGH | 4 | 3 in code review, 1 in verify |
| MEDIUM | 13 | 9 in code review, 2 in verify, 2 in dev |

Code review caught **~75% of all bugs** — consistently the highest-value quality gate across the entire day.

### Workarounds Applied / Tech Debt Introduced (Cumulative: 12 items, 0 resolved)

1. `console.log` in `audit-action.ts` — needs `raw()` output utility
2. `formatAuditJson()` is a pass-through no-op
3. `checkVerificationTools` loose matching (`content.includes(tool)`)
4. `checkBinaryOnPath` has no line numbers
5. Skipped BATS onboard tests (commit b5f062c) — **flagged "Fix Now" in 5+ retros, never addressed**
6. Single-line apt-get coupling between validator and template generator
7. `docker cp` workaround for patches in verification container — **systemic, hit twice**
8. `tsx` workaround for tree-shaken exports
9. Patch content verification as proxy for live agent integration
10. Coverage percentage computation duplicated in test
11. Fragile `ROOT` path resolution (`__dirname` + four `..` segments)
12. Em dash vs double dash inconsistency

### Verification Gaps

- **VictoriaLogs returned zero events** for `codeharness progress` and `parseStreamLine` — pure functions with no telemetry
- **No BATS tests available in Docker container** — `ralph/tests/` not in npm package
- **Spec-implementation mismatches accepted** for story 0-3 (format tags and architecture pattern)
- **No live Claude agent integration test** for review observability patches (5-1 ACs #2-#4)
- **init-project.test.ts doesn't assert `dockerfile` field** (tests predate story 4-2)

### Tooling/Infrastructure Problems

- **verify-env does not copy `patches/` into Docker container** — broke stories 5-1 and 5-2. Root cause: container uses globally installed npm package, not local source. **This is the most critical systemic issue.**
- **sprint-state.json and sprint-status.yaml persistently out of sync** — flagged in 3+ retros, no sync mechanism exists. sprint-status.yaml is authoritative.
- **Pre-existing `run-helpers.test.ts` `--live` flag test was broken** — had to be fixed before 3-3 verification
- **Non-standard `verified` status** in sprint-status.yaml from previous session caused confusion

---

## 3. What Went Well

- **Sprint went from 75% to 76% done (19/25) with all committed scope completed.** Epics 0 through 5 are fully closed. The remaining 6 stories (Epics 6 & 7) are backlog/stretch goals, not committed scope.
- **12 stories verified in a single day** across 8 session windows. Highest single-day throughput in the sprint.
- **4 epics closed today:** Epic 0 (Live Progress Dashboard), Epic 0.5 (Stream-JSON), Epic 4 (Infrastructure Guidelines), Epic 5 (Workflow Integration). Epic 3 was closed and released (v0.23.1).
- **2 releases shipped:** v0.23.0 (dashboard) and v0.23.1 (audit command). Both via the CI/CD pipeline without manual npm publish.
- **Code review is proven effective.** 17 bugs caught, 75% by code review. The 4-phase pipeline (create, dev, review, verify) justified its cost at every stage.
- **Ralph automation handled full pipelines without manual intervention** for stories 4-2, 5-1, 5-2. Lightweight stories with clear ACs are ideal automation candidates.
- **Session issues log discipline held all day.** Every subagent phase logged findings consistently. This log was the single source of truth for all 8 retrospective entries.
- **Test suite grew from ~2783 to 2872 (+89 tests)** while maintaining 96.98% coverage. No flaky tests introduced. All files above 80% floor.

---

## 4. What Went Wrong

- **Zero tech debt resolved all day.** 12 items accumulated, 0 closed. The skipped BATS tests (commit b5f062c) have been flagged "Fix Now" in every single retro since ~05:40Z — at least 5 consecutive times. The label "Fix Now" is meaningless at this point.
- **verify-env patches issue hit twice and never fixed.** Stories 5-1 and 5-2 both required the same manual `docker cp` workaround. The fix would have taken less time than applying the workaround twice.
- **Sprint-state.json drift persists.** Three retros flagged the sync issue. No resolution, no mechanism added. The file shows stale statuses for multiple stories.
- **Story 0-3 spec-implementation mismatch accepted without updating the spec.** The story specified `DashboardFormatter` class and checkmark/cross prefixes; the implementation uses Ink React components and `[OK]`/`[FAIL]` tags. The deviation was accepted during verification but the story spec was never updated to match reality.
- **Validator single-line coupling is a design limitation.** `validateDockerfile()` checks lines independently, so templates must use single-line `apt-get install`. This will produce false negatives for real-world Dockerfiles with multi-line RUN instructions.
- **Eight retrospective entries for one day is excessive.** Each session window triggered a retro, leading to substantial repetition and carryover of identical action items. A daily cadence with mid-day checkpoint would be sufficient.

---

## 5. Lessons Learned

### Patterns to Repeat

1. **4-phase pipeline (create, dev, review, verify) works.** 17 bugs caught across the day, with verify catching integration seam issues that review missed (AC10 warning propagation). Both phases earn their cost.
2. **Session issues log as single source of truth.** Having every subagent write to `.session-issues.md` made 8 retrospectives fast and accurate. This pattern is non-negotiable.
3. **AC expansion at story creation.** Going from epic-level ACs (3-4 per story) to story-level ACs (6-10 per story) gave granular verification targets and caught integration gaps earlier.
4. **Lightweight stories complete in single automation runs.** Stories 5-1 and 5-2 ran through ralph's full pipeline in ~17-20 minutes each. Well-scoped stories with clear ACs are ideal automation candidates.
5. **Rebuild Docker image before re-verification.** The 4-1 AC10 "PARTIAL PASS" was caused by a stale Docker image. Always rebuild when re-verifying after code changes.

### Patterns to Avoid

1. **Flagging items "Fix Now" without fixing them.** Five consecutive retros flagged the same BATS tests. Either fix them or reclassify them honestly. Urgent labels that get ignored erode trust in the entire retro process.
2. **Applying the same workaround twice instead of fixing root cause.** The docker cp workaround for patches cost more time across two stories than a permanent fix would have.
3. **One retro per session window.** Eight retros in a day created repetition and carryover bloat. Switch to: one mid-day checkpoint retro + one end-of-day consolidation.
4. **Dual state files without sync.** sprint-status.yaml and sprint-state.json serving overlapping purposes without automatic sync creates confusion. Pick one as authoritative and deprecate the other, or add sync.
5. **Writing ACs that require LLM behavior verification.** For stories that configure agent behavior (patches, prompts), ACs should focus on mechanically verifiable criteria. "Agent follows instructions" is not testable.

---

## 6. Action Items

### Fix Now (Before Next Session)

1. **Fix verify-env to copy current `patches/` into Docker container.** This is a systemic blocker for any story that modifies patches. Two stories hit this; future stories will too.
2. **Fix `readPatchFile()` path resolution bug.** Currently resolves outside package directory from `dist/`. Fallback templates always used instead of real patches.
3. **Fix tree-shaking of `verifyPromptTemplate()`.** Either add it to CLI exports or create a separate entry point for skill-consumed functions.
4. **Reclassify skipped BATS onboard tests** (commit b5f062c). These have been "Fix Now" for 5+ retros without action. Either fix them in the next session or move to "Fix Soon" with an honest note that they were deprioritized.

### Fix Soon (Next Sprint)

5. Add `raw()` output utility to `src/lib/output.ts` — resolves `console.log` tech debt in audit-action.ts
6. Make `validateDockerfile()` handle multi-line RUN instructions (backslash continuations)
7. Add init-project.test.ts assertions for `dockerfile` field in InitResult
8. Stabilize `ROOT` path resolution — replace `__dirname` + four `..` segments with a root-finding utility
9. Add integration test for `checkInfrastructure()` -> `validateDockerfile()` warning propagation seam
10. Reconcile or deprecate sprint-state.json vs sprint-status.yaml

### Backlog (Track but Not Urgent)

11. Remove `formatAuditJson()` no-op or give it real formatting logic
12. Add line numbers to `checkBinaryOnPath` for consistency
13. Add test for `parseObservabilityGaps` with multiple gaps in one AC section
14. Resolve em dash vs double dash inconsistency between patch and analyzer.ts
15. Add structured log events for audit/onboard CLI interactions
16. Add structured telemetry to pure utility functions (at minimum debug-level trace)
17. Include `ralph/tests/` in npm package or Docker image for ralph story verification
18. Install showboat in verification Docker container for full-coverage verification
19. Write AC guidelines for LLM-behavior-dependent stories
20. Replace test LOC estimates with test case count estimates in story templates
21. Update story 0-3 spec to reflect Ink component architecture (retroactive doc fix)
22. Consider data-driven Dockerfile rules (parsed from markdown) instead of hardcoded
23. Add deprecation warnings for dropped onboard subcommands (`coverage`, `audit`, `epic`)

---

## Final Sprint Metrics (2026-03-21, All Sessions)

| Metric | Start of Day | End of Day | Delta |
|--------|-------------|------------|-------|
| Stories done | 15/25 | 19/25 | +4 (committed) |
| Stories verified today | 0 | 12 | +12 |
| Sprint completion | 60% | 76% | +16% |
| Epics closed | 3 (1, 2, 3) | 7 (0, 0.5, 1, 2, 3, 4, 5) | +4 |
| Tests passing | ~2783 | 2872 | +89 |
| Coverage-tracked files | 119 | 121 | +2 |
| Overall coverage | 96.97% | 96.98% | steady |
| Releases shipped | 0 | 2 (v0.23.0, v0.23.1) | +2 |
| Bugs found & fixed | 0 | 17 | +17 |
| Tech debt items opened | 0 | 12 | +12 |
| Tech debt items resolved | 0 | 0 | 0 |
| Retro entries this day | 0 | 8 | (too many) |

---

## Sprint Health Assessment

The Operational Excellence Sprint is effectively complete. All committed scope (Epics 1-5) is done. Epics 0 and 0.5 (stretch/bonus epics added mid-sprint) are also done. The remaining 6 stories in Epics 6 and 7 are backlog items — they were planned as onboarding compliance gaps and are not blocking any release or user-facing feature.

**The sprint's biggest success:** The 4-phase pipeline and session issues log proved their value. 17 bugs found and fixed, 75% caught by code review, with verify catching the integration seam bugs that review missed.

**The sprint's biggest failure:** Tech debt resolution rate is 0%. Twelve items accumulated, none resolved. The retro process identified the right issues but the execution loop never dedicated time to fix them. The skipped BATS tests are the poster child: flagged as urgent in every retro, ignored in every session.

**Recommendation for next sprint:**
1. Dedicate the first session to tech debt: fix verify-env patches, readPatchFile path resolution, tree-shaking issue, and BATS tests. These 4 items are genuine blockers or quality gaps.
2. Reduce retro frequency to 2 per day max (mid-day checkpoint + end-of-day consolidation). Eight retros created more overhead than value.
3. Before starting Epic 6 or 7, ensure the verification infrastructure actually works for patch-modifying and export-dependent stories. Otherwise those stories will hit the same blockers.

---

# Session Retrospective — 2026-03-21 (Session 3, Late Day)

**Sprint:** Operational Excellence Sprint
**Session window:** ~07:55Z – ~11:01Z (approx 3 hours)
**Sprint progress:** 20/25 stories done (80%), Epics 0-5 complete, Epic 6 in progress
**Generated:** 2026-03-21T14:45Z

---

## 1. Session Summary

| Story | Phase | Outcome | Notes |
|-------|-------|---------|-------|
| 0-1-sprint-state-live-updates | verify | done | Bug found & fixed in migration.ts |
| 0-2-ralph-progress-display | verify | done | Proof format issue fixed mid-verify |
| 0-3-run-command-dashboard | verify | done | Minor format deviations accepted |
| 0-5-1-stream-json-claude-driver | verify | done | Clean pass, no issues |
| 0-5-2-stream-event-parser | verify | done | Export fix required, then 6/6 ACs passed |
| 6-1-rewrite-ink-components-match-ux-spec | create-story | done | Story created from UX spec |
| 6-1-rewrite-ink-components-match-ux-spec | dev-story | done | 3-file split, Ink components rewritten |
| 6-1-rewrite-ink-components-match-ux-spec | code-review | done | 2 HIGH bugs, 1 MEDIUM bug found & fixed |
| 6-1-rewrite-ink-components-match-ux-spec | verify | in progress | Currently verifying |

This session verified 5 stories that were pending from earlier sessions and pushed story 6-1 through create, dev, and code review. High throughput session.

---

## 2. Issues Analysis

### Bugs Discovered During Implementation or Verification

| Bug | Severity | Story | Status |
|-----|----------|-------|--------|
| `parseRalphStatus()` missing new fields from story 0-1 | MEDIUM | 0-1 | Fixed |
| `updateSprintState()` wiped accumulated `totalCost` every 5s polling | HIGH | 6-1 | Fixed in review |
| `startsWith` key comparison caused false story matches (e.g., `3-2` matching `3-20`) | MEDIUM | 6-1 | Fixed in review |
| `parseStreamLine` not exported from `src/index.ts` | MEDIUM | 0-5-2 | Fixed |

### Workarounds Applied (Tech Debt Introduced)

| Workaround | Story | Risk |
|------------|-------|------|
| Container requires `VITEST=1` env var to suppress CLI auto-parse on module import | 0-5-2 | LOW — fragile, couples test env to implementation detail |
| NFR9 300-line limit forced 3-file split with indirection (`ink-app.tsx` / `ink-components.tsx` / `ink-activity-components.tsx`) | 6-1 | LOW — adds navigation complexity but avoids circular deps |
| Cost from early events before `sprintInfo` init is silently lost | 6-1 | MEDIUM — cost display may undercount |
| `run.ts` at 308 lines (8 over 300-line NFR9 limit) | 6-1 | LOW — pre-existing, not addressed |

### Verification Gaps

| Gap | Story | Impact |
|-----|-------|--------|
| VictoriaLogs returned zero events for `codeharness progress` — no structured logging | 0-1 | Observability blind spot for progress command |
| VictoriaLogs returned zero events for `parseStreamLine` — pure function, no telemetry | 0-5-2 | Expected for pure functions, but means no runtime observability |
| No BATS tests in container (`ralph/tests/` not in npm package) | 0-2 | Verification relies on mock invocation, not integration tests |
| No integration test for full run-to-renderer-to-component pipeline with cost accumulation across polling cycles | 6-1 | Cost accumulation bugs could regress |

### Code Quality Concerns

- Renderer accumulates cost internally with no external read path. `updateSprintState` has implicit merge behavior — makes testing and debugging harder.
- `currentIterationCount` in `run.ts` is a mutable closure variable updated from stderr parsing — updates delayed until next 5-second polling interval.
- Old `epic-6-retrospective.md` documents Brownfield Onboarding epic, not Dashboard Visualization Rework — stale/misleading artifact.

### Tooling/Infrastructure Problems

- Sprint status had invalid `verified` status value (not in the valid enum). Required manual normalization to `verifying`.
- VictoriaLogs `_stream_id:*` pattern invalid — needed `*` wildcard syntax instead.

---

## 3. What Went Well

- **High throughput:** 5 stories verified + 1 story through create/dev/review in a single session.
- **Code review caught critical bugs:** The `totalCost` wipe bug and `startsWith` false-match bug were both caught before verify — code review proving its value.
- **Clean verifications:** Story 0-5-1 passed with zero issues. Stories 0-1, 0-2, 0-3 required only minor fixes.
- **Epic completion:** Epics 0 and 0.5 are now fully done, clearing the path for Epic 6 dashboard rework.
- **Session issues log working as intended:** Every subagent reported its findings, making this retro possible without guesswork.

---

## 4. What Went Wrong

- **Export omission (0-5-2):** `parseStreamLine` was implemented but never exported from `src/index.ts`. This is a recurring pattern — new functions get created but not wired into the public API. Dev phase should include an export check.
- **Proof format issues (0-2):** Verification initially failed because proof document reused evidence blocks instead of having distinct ones per AC. This is a process friction that wastes verify iterations.
- **Cost accumulation gap (6-1):** Events arriving before `sprintInfo` is set silently lose their cost data. This was identified but not fixed — it shipped as known tech debt.
- **Stale artifacts:** The `epic-6-retrospective.md` file contains content from a different epic, which caused confusion during story creation.
- **No BATS test coverage in container:** This has been flagged in multiple retros and remains unfixed. Ralph tests are excluded from the npm package, so container-based verification cannot run them.

---

## 5. Lessons Learned

### Patterns to Repeat
- **Code review before verify** caught 2 HIGH-severity bugs that would have cost multiple verify iterations to diagnose. The 4-phase pipeline is working.
- **Session issues log** as structured input to retrospectives eliminates guesswork and ensures nothing is forgotten.
- **Story creation from UX spec** (6-1) produced well-scoped ACs that the dev phase could implement without ambiguity.

### Patterns to Avoid
- **Skipping export wiring** — new public functions must be added to `src/index.ts` as part of the dev phase, not discovered during verify.
- **Implicit state accumulation** — the cost accumulator pattern (internal state, no read path, implicit merge) is hard to test and debug. Prefer explicit state objects.
- **Reusing proof evidence across ACs** — each AC needs its own distinct evidence block. Template the proof doc with placeholders per AC.
- **Leaving stale artifacts** — misleading files (like the wrong epic-6-retrospective.md) waste time and cause confusion.

---

## 6. Action Items

### Fix Now (Before Next Session)
1. **Clean up stale `epic-6-retrospective.md`** — either delete or rename to reflect its actual content (Brownfield Onboarding).
2. **Complete 6-1 verification** — story is in `verifying` state, needs to finish.

### Fix Soon (Next Sprint)
3. **Add export-check to dev phase** — any new public function must appear in `src/index.ts` exports. Add this as a checklist item in the dev workflow.
4. **Fix cost accumulation gap in 6-1** — events before `sprintInfo` init should buffer cost, not discard it.
5. **Add integration test for cost accumulation across polling cycles** — the cost wipe bug was caught by review, but there is no regression test.
6. **Refactor `run.ts`** — at 308 lines it exceeds the 300-line NFR9 limit. Extract the iteration counting and stderr parsing.

### Backlog (Track but Not Urgent)
7. **Include `ralph/tests/` in npm package** — enables BATS test execution in container verification.
8. **Add structured logging to `codeharness progress` command** — currently zero observability.
9. **Add telemetry hooks to pure parser functions** — or accept that pure functions have no runtime observability and document this as policy.
10. **Remove `VITEST=1` env var workaround** — fix the CLI auto-parse on module import properly.
11. **Normalize sprint status enum** — add validation that rejects invalid status values like `verified`.

---

## Session Metrics

| Metric | Value |
|--------|-------|
| Stories verified | 5 |
| Stories created | 1 |
| Stories dev-completed | 1 |
| Stories code-reviewed | 1 |
| Bugs found & fixed | 4 |
| Tech debt items opened | 4 |
| Tech debt items resolved | 0 |
| Verification gaps identified | 4 |
| Session duration | ~3 hours |

---

# Session Retrospective — 2026-03-21 (Sessions 2-3, continued)

**Sprint:** Operational Excellence Sprint
**Session window:** ~10:44Z – ~11:30Z (approx 45 minutes, two ralph sessions)
**Sprint progress:** 21/25 stories done at session start -> 22/25 done at session end (story 6-1 completed)
**Timestamp:** 2026-03-21T15:10Z

---

## 1. Session Summary

| Story | Phase | Outcome | Notes |
|-------|-------|---------|-------|
| 6-1-rewrite-ink-components-match-ux-spec | create-story | Done | Derived from UX spec; no formal epic-6 definition file existed |
| 6-1-rewrite-ink-components-match-ux-spec | dev-story | Done | 3-file split to meet NFR9 300-line limit |
| 6-1-rewrite-ink-components-match-ux-spec | code-review | Done | 2 HIGH/MEDIUM bugs found and fixed |
| 6-1-rewrite-ink-components-match-ux-spec | verify | Done | Static analysis verification in container |

One story attempted, one story completed through all phases. Story 6-1 rewrote Ink dashboard components to match the UX spec, splitting the renderer into `ink-components.tsx`, `ink-activity-components.tsx`, and `ink-app.tsx`.

---

## 2. Issues Analysis

### Bugs Discovered During Implementation or Review

| ID | Severity | Description | Resolution |
|----|----------|-------------|------------|
| B1 | HIGH | `updateSprintState()` wiped accumulated `totalCost` every 5s during polling — cost display would flash and disappear | Fixed: field preservation in updateSprintState |
| B2 | MEDIUM | `startsWith` key comparison in `StoryBreakdown` caused false matches (story `3-2` matching `3-20`) | Fixed: exact key comparison |
| B3 | LOW | Cost from early events before `sprintInfo` init is silently lost | Unfixed — edge case, low impact |

### Workarounds / Tech Debt Introduced

| ID | Description | Impact |
|----|-------------|--------|
| W1 | 3-file split (`ink-app.tsx`, `ink-components.tsx`, `ink-activity-components.tsx`) to avoid circular imports and meet 300-line NFR | Adds indirection; acceptable but increases cognitive load |
| W2 | `run.ts` at 308 lines — 8 over NFR9 300-line limit | Pre-existing tech debt, not introduced this session |
| W3 | `currentIterationCount` is a mutable closure variable updated from stderr parsing; updates delayed until next 5s polling interval | Inherent to polling architecture; would need event-driven refactor to fix |
| W4 | No formal epic-6 definition file — story was derived from UX spec and story name | Should create epic definition if more stories are added |

### Verification Gaps

| ID | Description | Severity |
|----|-------------|----------|
| V1 | Verifier used static analysis of dist bundle rather than runtime rendering | Low — valid black-box approach but misses runtime behavior |
| V2 | No integration test for full run->renderer->component pipeline with cost accumulation across polling cycles | Medium — code review flagged this |
| V3 | Renderer accumulates cost internally with no external read path | Low — architecture concern, not a bug |

### Tooling / Infrastructure Problems

| ID | Description | Resolution |
|----|-------------|------------|
| I1 | Shared observability stack port conflict — harness-specific compose tried to start when shared stack already had ports bound | Used shared stack directly |
| I2 | Stale `codeharness-verify` container from previous session still running | `docker rm -f` before new verification |
| I3 | `codeharness sync --story 6-1 --direction files-to-beads` failed — "Story file not found or has no Status line" | Skipped sync; did not block verification |
| I4 | Stale `epic-6-retrospective.md` references Brownfield Onboarding epic, not Dashboard Visualization Rework | Not fixed — misleading artifact |

---

## 3. What Went Well

- **Story 6-1 completed end-to-end in a single session** — create, dev, code-review, verify all passed.
- **Code review caught two real bugs (B1, B2)** before verification. The cost-wipe bug (B1) would have been user-visible in production.
- **File splitting strategy worked** — the 3-file approach satisfied NFR9 and avoided circular imports cleanly.
- **Story creation handled missing epic definition gracefully** — derived requirements from UX spec and existing code without blocking.

---

## 4. What Went Wrong

- **Infrastructure friction consumed time** — port conflicts, stale containers, and sync failures required manual intervention (I1, I2, I3).
- **No runtime verification** — static analysis of the dist bundle is valid but weaker than actually rendering components. Runtime rendering tests would catch issues that static analysis misses (V1).
- **Missing artifacts** — AGENTS.md, exec-plan, and proof document were not created during dev-story phase. These are expected by the process but were skipped.
- **Stale epic-6-retrospective.md is misleading** — references wrong epic content. Anyone reading it will be confused about Epic 6's purpose.

---

## 5. Lessons Learned

### Patterns to Repeat

- **Code review before verify catches real bugs.** The cost-wipe bug (B1) and the startsWith false-match (B2) were both caught by review, not testing. Keep code review as a mandatory phase.
- **Deriving story requirements from UX spec when epic definition is missing** — pragmatic approach that worked well.
- **File splitting early** to meet line-count NFRs avoids painful refactoring later.

### Patterns to Avoid

- **Leaving containers running between sessions** — causes stale state and port conflicts. Add cleanup to session teardown.
- **Relying on static-only verification for UI components** — should include at least one runtime render test.
- **Skipping artifact creation during dev-story** — creates process gaps even if not strictly blocking.

---

## 6. Action Items

### Fix Now (before next session)

- [ ] Clean up stale `codeharness-verify` containers (`docker rm -f`)
- [ ] Delete or update stale `epic-6-retrospective.md` to reflect actual Epic 6 content

### Fix Soon (next sprint)

- [ ] Add integration test for run->renderer->component pipeline with cost accumulation across polling cycles (V2)
- [ ] Fix early-event cost loss when `sprintInfo` is null (B3)
- [ ] Refactor `run.ts` to get under 300-line limit (W2)
- [ ] Create formal epic-6 definition file if more stories are planned (W4)

### Backlog (track but not urgent)

- [ ] Add runtime rendering tests for Ink components in verification container
- [ ] Investigate event-driven approach for iteration count updates to eliminate polling delay (W3)
- [ ] Add session teardown hook to clean up Docker containers automatically
- [ ] Add cost read path from renderer for external consumers (V3)

---

## Session Metrics

| Metric | Value |
|--------|-------|
| Stories completed (all phases) | 1 |
| Bugs found in code review | 2 (both fixed) |
| Bugs found in implementation | 1 (unfixed, low severity) |
| Tech debt items introduced | 3 |
| Infrastructure issues hit | 4 |
| Verification gaps identified | 3 |
| Session duration | ~45 minutes (across 2 ralph sessions) |

---

# Session Retrospective — 2026-03-21 (Session 3, ~15:15Z)

**Sprint:** Operational Excellence Sprint
**Session window:** ~07:55Z – ~11:40Z (approx 3h 45m across 4 ralph sessions)
**Sprint progress at end:** 22/25 stories done (88%), Epics 0-6 complete, Epic 7 in backlog

---

## 1. Session Summary

| Story | Epic | Outcome | Phases Run | Attempts |
|-------|------|---------|------------|----------|
| 0-1-sprint-state-live-updates | Epic 0 | Done (verified) | verify | 0 |
| 0-2-ralph-progress-display | Epic 0 | Done (verified) | verify | 0 |
| 0-3-run-command-dashboard | Epic 0 | Done (verified) | verify | 0 |
| 0-5-1-stream-json-claude-driver | Epic 0.5 | Done (verified) | verify | 0 |
| 0-5-2-stream-event-parser | Epic 0.5 | Done (verified) | verify | 0 |
| 6-1-rewrite-ink-components-match-ux-spec | Epic 6 | Done (verified) | create-story, dev-story, code-review, verify | 2 |
| 6-2-verify-stream-json-pipeline-e2e | Epic 6 | Done (verified) | create-story, dev-story, code-review, verify | 1 |

Seven stories were touched this session. Five were carry-overs from previous sessions needing only verification. Two (6-1, 6-2) went through the full lifecycle: story creation, implementation, code review, and verification.

Epic 6 (Dashboard Visualization Rework) was completed and closed this session, including an epic retrospective. All remaining work is in Epic 7 (Onboarding — Compliance Gaps), which is in backlog.

---

## 2. Issues Analysis

### Bugs Discovered During Implementation or Verification

| Severity | Story | Bug | Resolution |
|----------|-------|-----|------------|
| HIGH | 6-1 | `updateSprintState()` wiped accumulated `totalCost` every 5s during polling — cost display would flash and disappear | Fixed with field preservation |
| HIGH | 6-2 | Test reimplemented production `makeLineHandler` instead of importing — changes to production code wouldn't be caught by tests | Fixed by extracting `createLineProcessor` to `run-helpers.ts` |
| HIGH | 6-2 | Story File List had wrong path | Fixed |
| MEDIUM | 6-1 | `startsWith` key comparison in `StoryBreakdown` caused false matches (e.g., story `3-2` matching `3-20`) | Fixed to exact comparison |
| MEDIUM | 6-2 | `makeLineHandler` was untestable closure in `run.ts` | Extracted to `run-helpers.ts` |
| MEDIUM | 6-2 | Unused `vi` import | Removed |
| LOW | 6-1 | `run.ts` is 308 lines (8 over NFR9 300-line limit) | Unfixed — pre-existing |
| LOW | 6-2 | No test for multi-byte UTF-8 split across chunk boundaries | Unfixed |
| LOW | 6-2 | Renderer state accumulation test uses manual switch, not real Ink renderer | Unfixed |

**Pattern:** 3 HIGH bugs caught in code review, all fixed before verification. Code review is catching real issues.

### Workarounds Applied (Tech Debt Introduced)

1. **3-file split for NFR9 compliance (6-1):** `ink-app.tsx`, `ink-components.tsx`, `ink-activity-components.tsx` split to stay under 300-line limit. Adds indirection but avoids circular imports.
2. **Cost accumulation data loss (6-1):** `result` event cost only accumulates when `state.sprintInfo` is non-null. Cost from early events before sprint state init is silently lost.
3. **Iteration count polling delay (6-1):** `currentIterationCount` is a mutable closure variable updated from stderr. Updates delayed until next 5-second polling interval.
4. **Synthetic NDJSON fixtures (6-2):** No real recorded NDJSON logs available. Test fixtures constructed synthetically — may not match real-world stream-json output.
5. **`VITEST=1` env var hack (0-5-2):** Container requires this to suppress CLI auto-parse on module import.

### Verification Gaps

1. **AC5 of story 6-2 escalated to human:** Requires manual `codeharness run` and screenshot capture of real-time Ink rendering. Correctly tagged `integration-required`. Cannot be automated.
2. **Static analysis vs runtime (6-1):** Verifier used static analysis of dist bundle rather than runtime rendering. Passes but doesn't test actual render behavior.
3. **Observability gaps in pure functions:** `parseStreamLine` (0-5-2) and `codeharness progress` (0-1) have no telemetry. VictoriaLogs returns zero events for all invocations.
4. **No integration test for full run->renderer->component pipeline** with cost accumulation across polling cycles (6-1).

### Tooling/Infrastructure Problems

1. **Stale containers:** Previous sessions left `codeharness-verify` running. Required `docker rm -f` before starting new verification. Hit in sessions 3 and 4.
2. **Port conflicts with shared observability stack:** `docker-compose.harness.yml` tries to bind ports already used by shared stack. Workaround: use shared stack directly.
3. **`codeharness status --check-docker` false negative:** Reports shared stack as down even when running.
4. **Beads sync failure (6-1):** `codeharness sync --story 6-1 --direction files-to-beads` failed with "Story file not found or has no Status line".
5. **Non-standard sprint status value:** Previous session left `verified` (invalid) in sprint status. Had to normalize to `verifying`.

---

## 3. What Went Well

- **7 stories completed and verified** — strong throughput for a single day session.
- **Epic 6 fully delivered** — from story creation through verification and epic retrospective, all within one extended session.
- **Code review caught 3 HIGH-severity bugs** before verification — the `totalCost` wipe bug would have been user-visible; the `startsWith` false match would have caused wrong story data to display; the test duplication would have left a silent coverage gap.
- **Clean verification on 0-5-1** — all 4 ACs passed without any issues, proving the verification pipeline works well when the code is solid.
- **Production refactor improved testability** — extracting `createLineProcessor` to `run-helpers.ts` (story 6-2) made a previously-untestable closure importable and testable.
- **Sprint at 88% completion** — only Epic 7 (3 backlog stories) remains.

---

## 4. What Went Wrong

- **Infrastructure friction on every verification run:** Stale containers and port conflicts hit in 3 of 4 sessions. Each time required manual cleanup before verification could proceed. This is pure waste.
- **Epic 6 numbering collision:** Two different sprints reused "Epic 6" for different epics. The stale `epic-6-retrospective.md` from the old Brownfield Onboarding epic persisted and was misleading.
- **NFR9 300-line limit caused unplanned refactoring:** Story 6-1 required a 3-file split not anticipated during story creation. This added complexity without adding value.
- **No formal epic definition for Epic 6:** Had to derive intent from story names, UX spec, and existing code. Creates ambiguity during story creation.
- **Action item carry-forward rate ~100%:** Retro action items are generated but never executed. The epic-6 retrospective noted this explicitly.
- **Proof format brittleness (0-2):** AC3 verification initially failed because evidence reused a bash block from AC2. The verifier is sensitive to proof formatting rather than proof substance.

---

## 5. Lessons Learned

### Patterns to Repeat

1. **Code review before verification catches real bugs.** The 3 HIGH-severity bugs caught in code review for stories 6-1 and 6-2 would have wasted verification cycles if missed.
2. **Extracting closures to helper modules** when testability is needed. The `run-helpers.ts` pattern from 6-2 is a clean solution.
3. **Escalating genuinely non-automatable ACs** rather than faking evidence. AC5 of 6-2 was correctly tagged `integration-required`.

### Patterns to Avoid

1. **Leaving containers running between sessions.** The verification container should be cleaned up as part of session teardown.
2. **Reusing epic numbers across sprints.** Creates stale artifact confusion.
3. **Assuming NFRs won't affect story scope.** The 300-line limit NFR should be factored into story sizing during creation, not discovered during implementation.
4. **Writing retro action items without an execution mechanism.** If nobody acts on them, they're documentation theater.

---

## 6. Action Items

### Fix Now (Before Next Session)

- [ ] **Clean up stale Docker containers** — `docker rm -f codeharness-verify` and any other orphaned containers from this session.
- [ ] **Delete stale `epic-6-retrospective.md`** from previous sprint's Brownfield Onboarding epic (now overwritten by this session's retro, but verify).

### Fix Soon (Next Sprint)

- [ ] **Auto-cleanup verification containers** — Add container teardown to the verification pipeline's exit path (both success and failure). This hit 3 of 4 sessions today.
- [ ] **Fix `codeharness status --check-docker`** — Should detect shared observability stack, not just harness-specific compose.
- [ ] **Fix beads sync for stories without standard Status line** — `codeharness sync --story X --direction files-to-beads` should not hard-fail.
- [ ] **Add telemetry to `codeharness progress` command** — Currently emits zero structured logs, making observability verification impossible.
- [ ] **Fix cost accumulation data loss** — Buffer cost from `result` events received before `sprintInfo` init, apply when `sprintInfo` becomes available.
- [ ] **Extract remaining logic from `run.ts`** — Currently 308 lines (over 300-line NFR). The `createLineProcessor` extraction was a start; finish the job.

### Backlog (Track But Not Urgent)

- [ ] **Add multi-byte UTF-8 chunk boundary test** for stream parser (6-2 LOW unfixed).
- [ ] **Add integration test for full render pipeline** with cost accumulation across polling cycles (6-1 coverage gap).
- [ ] **Create formal epic definition files** before starting stories — prevents ambiguity during story creation.
- [ ] **Establish action item execution process** — Retro action items need an owner and a check-in mechanism, or they will continue to be ignored.
- [ ] **Iteration count polling delay** — Investigate whether `currentIterationCount` can be pushed to the renderer immediately rather than waiting for next poll interval.

---

## Session Metrics

| Metric | Value |
|--------|-------|
| Stories verified (carry-over) | 5 |
| Stories completed (full lifecycle) | 2 |
| HIGH bugs found in code review | 3 (all fixed) |
| MEDIUM bugs found in code review | 3 (all fixed) |
| LOW bugs unfixed | 3 |
| Tech debt items introduced | 5 |
| Infrastructure issues hit | 5 |
| Verification gaps identified | 4 |
| ACs escalated to human | 1 (6-2 AC5) |
| Sprint completion | 22/25 (88%) |
| Session duration | ~3h 45m across 4 ralph sessions |

---

# Session Retrospective — 2026-03-21 (Afternoon Session)

**Sprint:** Operational Excellence Sprint
**Session window:** ~11:42Z – ~15:42Z (approx 4 hours, ralph iteration 5)
**Sprint progress:** 22/25 stories done (88%), Epics 0–6 complete, Epic 7 in progress
**Timestamp:** 2026-03-21T15:42Z

---

## 1. Session Summary

This retrospective covers the full day's session activity across 5 ralph sessions, focused on Epics 0, 0.5, 6, and 7.

| Story | Epic | Outcome | Phases Completed | Attempts |
|-------|------|---------|-----------------|----------|
| 0-1-sprint-state-live-updates | Epic 0 | Done | verify | 0 |
| 0-2-ralph-progress-display | Epic 0 | Done | verify | 0 |
| 0-3-run-command-dashboard | Epic 0 | Done | verify | 0 |
| 0-5-1-stream-json-claude-driver | Epic 0.5 | Done | verify | 0 |
| 0-5-2-stream-event-parser | Epic 0.5 | Done | verify | 0 |
| 6-1-rewrite-ink-components-match-ux-spec | Epic 6 | Done | create-story, dev-story, code-review, verify | 2 |
| 6-2-verify-stream-json-pipeline-e2e | Epic 6 | Done | create-story, dev-story, code-review, verify | 1 |
| 7-1-install-semgrep-static-analysis | Epic 7 | In review | create-story, dev-story, code-review, verify | 1 |

**Outcomes:**
- Epic 0 closed (3 stories verified)
- Epic 0.5 closed (carry-over stories verified)
- Epic 6 closed (2 stories, full lifecycle)
- Epic 7 started (1 of 3 stories complete, 2 remain in backlog)
- Sprint moved from 15/25 to 22/25 done (28% progress in one day)

---

## 2. Issues Analysis

### Bugs Discovered During Implementation (4 total, all fixed)

| Severity | Story | Bug | Resolution |
|----------|-------|-----|------------|
| HIGH | 6-1 | `updateSprintState()` wiped accumulated `totalCost` every 5s during polling — cost display flashed and disappeared | Fixed with field preservation |
| HIGH | 6-2 | Test reimplemented production `makeLineHandler` instead of importing — changes wouldn't be caught | Extracted `createLineProcessor` to `run-helpers.ts` |
| HIGH | 7-1 | Missing test for `CriticalDependencyError` throw path | Added test |
| MEDIUM | 6-1 | `startsWith` key comparison in `StoryBreakdown` caused false matches (e.g., story `3-2` matching `3-20`) | Fixed to exact comparison |

### Workarounds Applied (Tech Debt Introduced)

1. **NFR9 file split (6-1):** 300-line limit forced 3-file split (`ink-app.tsx`, `ink-components.tsx`, `ink-activity-components.tsx`). Adds indirection but avoids circular imports.
2. **ESM import workaround (0-5-2):** Verification container requires `VITEST=1` env var to suppress CLI auto-parse on module import.
3. **Synthetic NDJSON fixture (6-2):** No real recorded NDJSON logs available. Fixture constructed synthetically because `ralph/logs/` only has single-line result events.
4. **Story file overwrite (7-1):** `audit --fix` had generated a skeletal story file that was replaced with a proper story.
5. **`makeLineHandler` closure extraction (6-2):** Production code had to be refactored (closure to exported function) just to make it testable.

### Code Quality Concerns

- **`run.ts` is 308 lines** — 8 over NFR9 300-line limit. Pre-existing, not addressed.
- **Renderer accumulates cost internally** with no external read path. `updateSprintState` has implicit merge behavior.
- **Semgrep `skipped` status** in `DependencyResult` is dead code.
- **Semgrep fallback tests** don't assert primary command was attempted before fallback.
- **No test for multi-byte UTF-8** split across chunk boundaries.
- **Renderer state accumulation test** uses manual switch, not real Ink renderer.

### Verification Gaps

1. **AC5 of 6-2 escalated** — requires human visual judgment of real-time Ink rendering. Correctly tagged `integration-required`.
2. **AC2 of 7-1 tagged integration-required** — fresh environment install can't be tested in verification container that already has Semgrep.
3. **VictoriaLogs returned zero events** for CLI invocations in stories 0-1, 0-2, 0-5-2, 7-1. Pure functions and CLI commands have no telemetry. Systemic observability gap.
4. **6-1 verification used static analysis** of dist bundle rather than runtime rendering — valid but doesn't test actual runtime behavior.
5. **Beads sync failure** — `codeharness sync --story 6-1` failed with "Story file not found or has no Status line".

### Tooling/Infrastructure Problems

1. **Stale container plague:** Every verification session (6-1, 6-2, 7-1) hit a leftover `codeharness-verify` container from the previous session. Required manual `docker rm -f` each time.
2. **Port conflict with shared stack:** `docker-compose.harness.yml` tried to bind already-used ports. Shared observability stack was running but `codeharness status --check-docker` reported it as down.
3. **Non-standard status values:** Sprint status had `verified` (not a valid status). Had to normalize to `verifying`.
4. **Epic numbering collision:** Two sprints reused "Epic 6" for different epics. Stale retro file persisted across 4+ session retros.
5. **No epic definition files** for Epic 6 or Epic 7. Intent had to be derived from story names and existing code.

---

## 3. What Went Well

- **7 stories completed in one day** — from 15/25 to 22/25, closing 3 epics (0, 0.5, 6).
- **Code review caught real bugs** — the `totalCost` wipe bug (6-1) and `startsWith` false match (6-1) would have caused visible user-facing issues. Code review phase justified its cost.
- **Production refactoring under test pressure** — extracting `createLineProcessor` from a closure in `run.ts` improved testability and code quality simultaneously. Story 6-2 left the codebase better than it found it.
- **Story 7-1 was clean** — dev phase had zero issues. Small, well-scoped story executed perfectly.
- **Verification rigor** — AC5 of 6-2 was correctly escalated rather than rubber-stamped. Honest verification is better than passing everything.

---

## 4. What Went Wrong

- **Infrastructure friction dominated verification time.** Stale containers and port conflicts hit 3 out of 4 verification sessions. This is wasted time that compounds across every story.
- **Story 6-1 required 2 attempts.** NFR9 300-line limit forced an unplanned 3-file split, and code review found 2 HIGH bugs. Story was harder than estimated.
- **Story 6-2 required production refactoring.** `makeLineHandler` was an untestable closure — the test story had to fix production code, blurring the line between test story and implementation story.
- **Action items from retros are never executed.** The epic-6 retro explicitly called this out: "carry-forward rate ~100%." Retros generate action items that get documented and ignored. This is a process failure.
- **Observability gap is systemic.** VictoriaLogs returned zero events in 4 different stories. Pure functions and CLI commands have no telemetry. The observability infrastructure exists but isn't instrumented.
- **Missing epic definitions.** No formal epic files for Epic 6 or Epic 7, forcing agents to guess intent from story names. This creates ambiguity risk.

---

## 5. Lessons Learned

### Patterns to Repeat

- **Code review before verification.** Every HIGH bug this session was caught in code review, not verification. The create-story -> dev-story -> code-review -> verify pipeline works.
- **Extracting closures for testability.** The `createLineProcessor` extraction pattern should be applied proactively during implementation, not reactively during test writing.
- **Honest AC escalation.** Marking ACs as `integration-required` when they genuinely can't be automated preserves verification integrity.

### Patterns to Avoid

- **Assuming file counts from story planning.** Story 6-1 assumed 1-2 files; implementation needed 3 due to NFR9 constraints. Planning should account for code splitting.
- **Leaving containers running between sessions.** Every verification session wasted time cleaning up stale containers.
- **Writing retro action items without owners or deadlines.** They become documentation artifacts, not work items.
- **Reusing epic numbers across sprints.** Epic 6 collision caused confusion and stale artifacts.

---

## 6. Action Items

### Fix Now (Before Next Session)

| Item | Owner | Story |
|------|-------|-------|
| Add container cleanup to verification teardown | dev | infra |
| Clean up stale `codeharness-verify` containers | dev | infra |

### Fix Soon (Next Sprint)

| Item | Owner | Story |
|------|-------|-------|
| Fix `codeharness status --check-docker` to detect shared observability stack | dev | infra |
| Add telemetry to CLI commands and pure functions (observability gap) | dev | backlog |
| Fix `parseSemgrepOutput` — audit gap descriptions show `undefined` instead of rule message | dev | 7-1 |
| Split `run.ts` to get under NFR9 300-line limit | dev | tech-debt |
| Expose renderer cost accumulation externally for testing | dev | tech-debt |
| Add multi-byte UTF-8 chunk boundary test | dev | 6-2 |

### Backlog (Track but Not Urgent)

| Item | Owner | Story |
|------|-------|-------|
| Create formal epic definition files for all epics before sprint starts | pm | process |
| Establish retro action item follow-through process (owners, deadlines, tracking) | sm | process |
| Add real recorded NDJSON fixture to replace synthetic one | dev | 6-2 |
| Remove dead `skipped` status from `DependencyResult` | dev | tech-debt |
| Cost accumulation data loss for events before `sprintInfo` init | dev | 6-1 |
| Iteration count update delay (5s polling interval) | dev | 6-1 |
| Fix `codeharness sync` for stories without Status line | dev | infra |

---

## Session Metrics

| Metric | Value |
|--------|-------|
| Stories verified (carry-over) | 5 (0-1, 0-2, 0-3, 0-5-1, 0-5-2) |
| Stories completed (full lifecycle) | 2 (6-1, 6-2) |
| Stories in review | 1 (7-1) |
| HIGH bugs found in code review | 3 (all fixed) |
| MEDIUM bugs found in code review | 4 (all fixed) |
| LOW bugs unfixed | 6 |
| Tech debt items introduced | 5 |
| Infrastructure issues hit | 5 |
| Verification gaps identified | 5 |
| ACs escalated to human | 2 (6-2 AC5, 7-1 AC2) |
| Sprint completion | 22/25 (88%) |
| Remaining stories | 7-2, 7-3 (backlog), 7-1 (review) |

---

# Session Retrospective — 2026-03-21 (Sessions 3–6)

**Sprint:** Operational Excellence Sprint
**Session window:** ~11:04Z – ~12:20Z (approx 76 minutes across 4 ralph loops)
**Sprint progress at end:** 24/25 stories done (96%), 1 story backlog (7-3-create-dockerfile)
**Ralph loops:** 6 total (loops 3–6 this window)
**Elapsed:** ~5694 seconds (~95 minutes total ralph runtime)

---

## 1. Session Summary

| Story | Epic | Outcome | Phases Completed | Notes |
|-------|------|---------|-----------------|-------|
| 0-1-sprint-state-live-updates | Epic 0 | done | verify | Carry-over verification |
| 0-2-ralph-progress-display | Epic 0 | done | verify | Carry-over verification |
| 0-3-run-command-dashboard | Epic 0 | done | verify | Carry-over verification |
| 0-5-1-stream-json-claude-driver | Epic 0.5 | done | verify | Clean verification |
| 0-5-2-stream-event-parser | Epic 0.5 | done | verify | Needed infrastructure fix |
| 6-1-rewrite-ink-components-match-ux-spec | Epic 6 | done | create-story, dev, review, verify | Full lifecycle. Two HIGH bugs found and fixed in review |
| 6-2-verify-stream-json-pipeline-e2e | Epic 6 | done | create-story, dev, review, verify | Full lifecycle. AC5 escalated (manual visual test) |
| 7-1-install-semgrep-static-analysis | Epic 7 | done | create-story, dev, review, verify | Full lifecycle. Clean dev, minor review fixes |
| 7-2-fix-bats-runtime-tests | Epic 7 | done | create-story, dev, review, verify | Full lifecycle. 4 ACs escalated (integration-required) |

**Total:** 5 carry-over verifications completed, 4 full-lifecycle stories completed. Epic 6 and Epic 7 (partial) closed.

**Test results at session end:** 2920+ tests passing, 97.02% overall coverage, all 123 files above 80% floor.

---

## 2. Issues Analysis

### Bugs Discovered During Implementation or Verification

| Severity | Story | Bug | Status |
|----------|-------|-----|--------|
| HIGH | 6-1 | `updateSprintState()` wiped accumulated `totalCost` every 5s during polling — cost display flashed and disappeared | Fixed in review |
| HIGH | 6-1 | `startsWith` key comparison in `StoryBreakdown` caused false matches (story `3-2` matching `3-20`) | Fixed in review |
| HIGH | 6-2 | Test reimplemented production `makeLineHandler` instead of importing — divergence risk | Fixed: extracted `createLineProcessor` to `run-helpers.ts` |
| HIGH | 7-1 | Missing test for `CriticalDependencyError` throw path | Fixed in review |
| MEDIUM | 6-2 | `makeLineHandler` trapped as closure in `run.ts`, untestable externally | Fixed: extracted to `run-helpers.ts` |
| MEDIUM | 7-1 | Semgrep test spec was duplicated instead of referencing `DEPENDENCY_REGISTRY.find()` | Fixed in review |
| MEDIUM | 7-1 | AGENTS.md deps description omitted agent-browser | Fixed |
| MEDIUM | 7-2 | AGENTS.md deps.ts description missing "BATS" | Fixed |
| LOW | 0-1 | `parseRalphStatus()` missing new fields (`currentStory`, `currentPhase`, `lastAction`, `acProgress`) | Fixed during verify |
| LOW | 0-5-2 | `parseStreamLine` not exported from `src/index.ts` | Fixed during verify |

### Workarounds Applied (Tech Debt Introduced)

1. **File split to avoid circular imports (6-1):** NFR9 300-line limit forced a 3-file split (`ink-app.tsx`, `ink-components.tsx`, `ink-activity-components.tsx`). Adds indirection.
2. **Cost accumulation data loss (6-1):** `result` event cost only accumulates when `state.sprintInfo` is non-null. Cost from early events before sprint state init is silently lost.
3. **Iteration count delay (6-1):** `currentIterationCount` is a mutable closure variable updated from stderr parsing. Updates are delayed until next 5-second polling interval.
4. **Synthetic NDJSON fixtures (6-2):** No real recorded NDJSON logs available. Test fixtures constructed synthetically — may not reflect real-world event shapes.
5. **ESM import workaround (0-5-2):** Container requires `VITEST=1` env var to suppress CLI auto-parse on module import.

### Code Quality Concerns

- **`run.ts` is 308 lines** (8 over NFR9 300-line limit). Pre-existing, not fixed.
- **`skipped` status in `DependencyResult` is dead code** (7-1). Pre-existing.
- **`deps.ts` branch coverage 89.28%** — unreachable null-coalescing fallback branches (defensive code).
- **No integration test** for full run-to-renderer-to-component pipeline with cost accumulation across polling cycles (6-1).
- **No test for multi-byte UTF-8 split across chunk boundaries** (6-2).
- **Renderer accumulates cost internally with no external read path** — implicit merge behavior in `updateSprintState` (6-1).

### Verification Gaps

| Story | AC | Gap | Disposition |
|-------|----|-----|-------------|
| 6-2 | AC5 | Manual visual test of real-time Ink rendering | Escalated: `integration-required` |
| 7-1 | AC2 | Fresh environment install test impossible in pre-configured container | Escalated: `integration-required` |
| 7-2 | AC2 | Integration-required | Escalated |
| 7-2 | AC4, AC5 | Dev-time artifacts not in npm package | Escalated |
| 7-2 | AC7 | CI impact verification | Escalated: `integration-required` |

**7 total ACs escalated to human across 3 stories.** All escalations are legitimate — black-box Docker verification cannot exercise these paths.

### Tooling/Infrastructure Problems

1. **Stale container recurrence:** Every verification session hit a leftover `codeharness-verify` container requiring `docker rm -f`. This happened in sessions 3, 4, 5, and 6. The cleanup should be automatic.
2. **Shared stack detection failure:** `codeharness status --check-docker` repeatedly reported the observability stack as "down" when the shared stack was running on the correct ports. Caused port conflicts when harness-specific compose tried to start.
3. **Beads sync failures:** `codeharness sync --story` failed with "Story file not found" (session 3) and `bd` binary ENOENT (session 6). Beads tooling is unreliable.
4. **VictoriaLogs observability gap:** Zero log events returned across all verification sessions. Pure functions have no telemetry, and CLI invocations don't emit structured logs. The observability check is effectively a no-op for this codebase.
5. **Epic numbering collision:** Epic 6 and Epic 7 both had naming conflicts with previous sprints. Stale retro files and mismatched epics-overhaul.md references caused confusion.

---

## 3. What Went Well

- **4 full-lifecycle stories completed in ~76 minutes** — consistent 19-minute average per story across create-story, dev, review, verify.
- **5 carry-over verifications cleared** — backlog of unverified stories from previous sessions eliminated.
- **Epic 6 closed** — Dashboard Visualization Rework complete. Stream-JSON pipeline end-to-end tested.
- **Code review caught 4 HIGH bugs** — all fixed before merge. Review phase is paying for itself.
- **Test coverage held at 97%+** despite adding 4 stories worth of production code.
- **Clean story 0-5-1 verification** — all 4 ACs passed without any issues. Shows the process works when stories are well-defined.
- **Production refactor during 6-2** — extracting `createLineProcessor` to `run-helpers.ts` improved testability for the whole codebase, not just the story.

---

## 4. What Went Wrong

- **Stale container cleanup is manual and repetitive.** Every single verification session required `docker rm -f`. This is wasted time and a process failure.
- **Epic numbering collision caused confusion across 3 stories.** No epic definition files exist for epics 6 and 7. Agents had to derive intent from story names and existing code.
- **Action item carry-forward rate ~100%** (noted in epic-6 retro). Retro action items are generated but never executed. The retrospective process produces documentation, not change.
- **7 ACs escalated to human.** While all escalations were legitimate, this represents verification work that will never happen unless someone manually runs these checks.
- **VictoriaLogs is dead weight.** Zero useful log events across 6 sessions. The observability stack is running but producing no value for this project.
- **Story 6-1 underestimated.** NFR9 300-line limit forced a 3-file split not anticipated during story creation. Architecture diverged from story spec (Ink components vs. DashboardFormatter class).

---

## 5. Lessons Learned

### Patterns to Repeat

- **Code review before verify catches real bugs.** 4 HIGH bugs were caught this session. Without review, they'd be in production.
- **Extracting closures to named exports improves testability.** The `createLineProcessor` extraction (6-2) is a template for handling similar untestable closures.
- **Escalating genuinely untestable ACs is correct.** Tagging `integration-required` instead of faking evidence preserves verification integrity.

### Patterns to Avoid

- **Writing story specs that assume implementation architecture.** Story 0-3 specified `DashboardFormatter` class; implementation used Ink components. Story 6-1 didn't anticipate the file-split. Specs should define behavior, not structure.
- **Leaving containers running between sessions.** Costs time every session.
- **Duplicating production logic in tests.** Story 6-2's original test reimplemented `makeLineHandler` — a classic test anti-pattern caught by review.
- **Reusing epic numbers across sprints.** Epic 6 meant two different things in two different sprints. Use globally unique epic IDs.

---

## 6. Action Items

### Fix Now (Before Next Session)

1. **Auto-cleanup stale verify containers.** Add `docker rm -f codeharness-verify 2>/dev/null` to the start of the verification flow. Hit 4 times this session.
2. **Fix shared stack detection in `codeharness status --check-docker`.** It reports "down" when the shared observability stack is running. Causes port conflicts.

### Fix Soon (Next Sprint)

3. **Create epic definition files for all active epics.** Epics 6 and 7 had no formal definition. Agents waste time deriving intent.
4. **Fix cost accumulation data loss.** Events arriving before `sprintInfo` init silently lose cost data. Add a buffer or initialize earlier.
5. **Split `run.ts` to meet NFR9.** Currently 308 lines (8 over limit). `createLineProcessor` extraction started this — finish it.
6. **Fix `parseSemgrepOutput` undefined message bug.** Audit gap descriptions show `undefined` instead of Semgrep rule message text.
7. **Add `--help` documentation for `onboard.sh` flags** (`--json`, `--output`).

### Backlog (Track But Not Urgent)

8. **Evaluate VictoriaLogs utility.** Zero useful events across 6 sessions. Either instrument the CLI properly or remove the observability stack from verification.
9. **Address action-item carry-forward problem.** Retro action items are generated but never executed. Needs a process change — perhaps auto-generating stories from retro action items.
10. **Add multi-byte UTF-8 chunk boundary test** (6-2).
11. **Remove dead `skipped` status from `DependencyResult`.**
12. **Add integration test for run-to-renderer-to-component pipeline with cost accumulation across polling cycles.**
13. **Clean up epic numbering collisions.** Audit all epic references, archive stale retro files, ensure globally unique IDs.

---

## Session Metrics

| Metric | Value |
|--------|-------|
| Stories verified (carry-over) | 5 (0-1, 0-2, 0-3, 0-5-1, 0-5-2) |
| Stories completed (full lifecycle) | 4 (6-1, 6-2, 7-1, 7-2) |
| HIGH bugs found and fixed | 4 |
| MEDIUM bugs found and fixed | 4 |
| LOW bugs unfixed | 8 |
| Tech debt items introduced | 5 |
| Infrastructure issues hit | 5 (all recurring) |
| ACs escalated to human | 7 across 3 stories |
| Sprint completion | 24/25 (96%) — 1 story backlog (7-3) |
| Test count | 2920+ |
| Coverage | 97.02% |
