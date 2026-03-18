# Session Retrospective — 2026-03-19

**Sprint:** Architecture Overhaul Sprint
**Session window:** ~19:08Z (2026-03-18) – ~00:15Z (2026-03-19), approx 5 hours
**Stories attempted:** 4
**Stories completed:** 1 (done), 3 in verifying

---

## 1. Session Summary

| Story | Start Status | End Status | Phases Completed | Notes |
|-------|-------------|------------|-----------------|-------|
| 5-1-review-module-extraction | backlog | verifying | create-story, dev, code-review | Review module built from scratch. 3 HIGH bugs found and fixed in code review. Awaiting Docker verification. |
| 3-1-error-capture-on-timeout | verifying | done | verification, dev (AC6 fix), code-review | 5/6 ACs passed first verification. AC6 (status --story drill-down) was not implemented by dev. Fixed in second dev pass. 4 new tests added in review. |
| 6-1-infra-module-init-extraction | backlog | verifying | create-story, dev, code-review | Largest story of session — init.ts decomposed into 6 sub-modules. 51 test regressions found and fixed in code review. Skipped review initially due to time; completed in next session window. |
| 3-4-eight-hour-stability-test | verifying | verifying | (not touched) | Carried over, no work this session. |
| 4-3-verifier-session-reliability | verifying | verifying | (not touched) | Carried over, no work this session. |

**Net progress:** 1 story moved to done. 2 stories moved from backlog to verifying. Epic 3 nearing completion (3/4 done). Epics 5 and 6 unblocked.

---

## 2. Issues Analysis

### Bugs Discovered During Implementation or Review

1. **HIGH — Dead code in review orchestrator (5-1):** `captureFilesChanged()` and `execSync` import copied from dev module but never wired up. Removed in code review.
2. **HIGH — Boolean logic bug in `parseReviewOutput` (5-1):** Tautological expression that would always evaluate one way. Simplified.
3. **HIGH — No top-level error boundary in `initProject` (6-1):** Unexpected errors would propagate as uncaught promise rejections, violating the "never throws" contract (AC #6/#7).
4. **HIGH — Sub-modules re-threw non-domain errors (6-1):** `beads-init.ts`, `bmad-setup.ts`, `deps-install.ts` all violated the never-throw contract by re-throwing.
5. **HIGH — 51 test regressions (6-1):** 3 "re-throws" tests tested old behavior, plus cascading mock state corruption from `vi.restoreAllMocks()` not resetting `vi.fn()` mocks from `vi.mock()` factories.
6. **MEDIUM — Missing test coverage for timeout summary in status command (3-1):** No tests for `status --story` timeout display in text or JSON mode. 4 tests added.
7. **MEDIUM — AGENTS.md stale (3-1):** `findLatestTimeoutReport`, `TimeoutSummary`, and `opts?` parameter undocumented. Fixed.

### Workarounds Applied (Tech Debt Introduced)

1. **Heuristic-based review output parsing (5-1):** `parseReviewOutput` matches keywords like "changes requested", "not approved", "LGTM". Fragile — Claude's output format is not guaranteed. No standardized machine-readable approval signal exists.
2. **Code duplication between dev and review orchestrators (5-1):** `truncateOutput`, `isTimeoutError`, and git diff logic copy-pasted from `src/modules/dev/orchestrator.ts`. ~60% identical code. Needs extraction to shared utility.
3. **Markdown regex parsing for timeout reports (3-1):** `findLatestTimeoutReport` parses markdown with regex to extract duration/files-changed. A JSON sidecar file would be more robust.
4. **Type escape hatches in init-project.ts (6-1):** `result as unknown as Record<string, unknown>` used 4 times. Dirty cast working around Result type narrowing.
5. **`process.exitCode = 1` set inside infra module (6-1):** Should be in the command layer, not the module. Mixes concerns.

### Code Quality Concerns

1. **`status.ts` at 722 lines** — exceeds NFR18 300-line limit. Pre-existing but flagged again. Needs splitting.
2. **`src/lib/bmad.ts` at 521 lines** — also over NFR18 limit. Pre-existing, not in scope this session.
3. **`init-project.ts` mixes business logic with presentation** — direct `console.log` calls in a module file.
4. **`getObservabilityBackend()` throws instead of returning `Result<T>`** — inconsistent with never-throw contract used everywhere else.
5. **`isTimeoutError` checks `signal === 'SIGTERM'`** — could misclassify non-timeout kills.

### Verification Gaps

1. **AC #9 on 6-1 (integration-required):** End-to-end CLI execution across all 4 Docker/observability modes not verified. Requires real infrastructure.
2. **AC #3 on 5-1 (review rejection loop):** No integration test for review rejection triggering story status transition back to `in-progress`. Depends on sprint loop logic that may not exist yet.
3. **`docker-setup.ts` failure path:** `handleRemoteRouted` failure has no assertion on error message content.
4. **`docs-scaffold.ts` error path:** `fail()` return not tested at unit level.
5. **`index.test.ts`:** Doesn't verify `findLatestTimeoutReport` integration in orchestration flow.

### Tooling/Infrastructure Problems

1. **Container missing codeharness CLI (3-1 verification):** `verify-env build` doesn't pre-install the artifact. Had to `npm install -g codeharness` inside container manually. Will affect all future verifications.
2. **BATS not installed locally:** Full integration test suite can't run locally. Verification relies on `npx vitest run` only.
3. **Session time pressure:** 6-1 skipped code review initially due to <10 minutes remaining. Review happened in next session window and found 51 regressions — exactly the kind of thing that happens when review is skipped.

---

## 3. What Went Well

- **3-1 completed end-to-end** — Story went through verification failure, back to dev for AC6 fix, code review with 4 new tests, and reached done status. The feedback loop worked as designed.
- **Code review caught 6 HIGH-severity bugs across 3 stories** — Dead code, logic bugs, missing error boundaries, contract violations, and 51 test regressions. Review continues to earn its keep.
- **6-1 decomposition succeeded** — `init.ts` (a monolith) was split into 6 focused sub-modules (`beads-init`, `bmad-setup`, `deps-install`, `docker-setup`, `docs-scaffold`, `init-project`) with individual test files. Architecture is cleaner.
- **5-1 built from scratch** — Review module went from stub (`fail('not implemented')`) to functional orchestrator with timeout handling, output parsing, and file size limits in one session.
- **Session issues log discipline maintained** — Every subagent logged problems as they occurred. 7 distinct entries with structured categories. Made this retrospective possible.
- **Coverage stayed healthy** — 96.46% overall, all 77 files above 80% floor, despite significant code churn.

---

## 4. What Went Wrong

- **Dev agent skipped AC6 on 3-1** — Explicitly called it "beyond scope" when it was in the acceptance criteria. Verification caught it, but this wasted an entire verification cycle.
- **6-1 code review found 51 test regressions** — The dev agent didn't run the full test suite before declaring done, or the regressions were masked by mock state corruption. Either way, review was the last line of defense.
- **Time pressure forced skipping review on 6-1** — With <10 minutes left, dev declared done without review. When review finally ran, it found 3 HIGH bugs and 51 test failures. Skipping review is always a false economy.
- **Copy-paste engineering in 5-1** — ~60% of review orchestrator is identical to dev orchestrator. This creates a maintenance burden and divergence risk. Should have been extracted to shared utilities from the start.
- **Vitest mock subtlety bit 6-1** — `vi.restoreAllMocks()` doesn't reset `vi.fn()` mocks from `vi.mock()` factories. This caused cascading mock state corruption that was hard to diagnose. Known issue but not documented in project conventions.

---

## 5. Lessons Learned

**Repeat:**
- Running code review as a mandatory gate — caught 6 HIGH bugs this session alone.
- Using the session issues log for every subagent. Structured problem reporting made this retro data-driven.
- Verification catching dev agent shortcuts (AC6 skip on 3-1). The pipeline works.

**Avoid:**
- Skipping code review under time pressure. The 6-1 experience proves this always costs more later.
- Copy-pasting orchestrator logic between modules. Extract shared utilities proactively.
- Trusting dev agent "done" status without reviewing test results. 51 regressions should not reach review.
- Using `vi.restoreAllMocks()` without understanding its scope — document the `vi.clearAllMocks()` requirement for `vi.mock()` factories.

---

## 6. Action Items

### Fix Now (Before Next Session)

- [ ] **Verify 5-1 and 6-1** — Both are in `verifying` status. Run Docker-based verification to move them to done or back to dev.
- [ ] **Document vitest mock reset convention** — Add to AGENTS.md or CONVENTIONS.md: use `vi.clearAllMocks()` in `beforeEach` when using `vi.mock()` factories, not just `vi.restoreAllMocks()`.

### Fix Soon (Next Sprint)

- [ ] **Extract shared orchestrator utilities** — `truncateOutput`, `isTimeoutError`, git diff helpers should live in a shared module (e.g., `src/modules/shared/orchestrator-utils.ts`). Both dev and review orchestrators import from there.
- [ ] **Fix verify-env to pre-install CLI** — Container build should include `npm install -g codeharness` so verification doesn't require manual intervention.
- [ ] **Split `status.ts` (722 lines)** — Exceeds NFR18 300-line limit. Has been flagged in two consecutive retros now.
- [ ] **Replace `parseReviewOutput` heuristics** — Consider structured output (JSON mode) or explicit approval markers in the review workflow prompt.
- [ ] **Fix `getObservabilityBackend()` to return `Result<T>`** — Align with the never-throw contract used by all other module functions.
- [ ] **Remove type escape hatches in `init-project.ts`** — The 4 `as unknown as Record<string, unknown>` casts should be replaced with proper type narrowing.

### Backlog (Track But Not Urgent)

- [ ] **Consolidate `process.exitCode` setting** — Move from infra module to command layer.
- [ ] **Add integration tests for review rejection loop (AC #3 on 5-1)** — Requires sprint loop to support `ReviewResult.approved === false` status transition.
- [ ] **Split `src/lib/bmad.ts` (521 lines)** — Pre-existing NFR18 violation.
- [ ] **Investigate `isTimeoutError` SIGTERM misclassification risk** — Low probability but could cause silent bugs.
- [ ] **Add JSON sidecar for timeout reports** — Replace regex-based markdown parsing in `findLatestTimeoutReport`.

---

## Addendum — 2026-03-19T00:45Z

### Final Session State Snapshot

Retro review confirmed no additional subagent activity occurred after the 6-1 verification pass at ~00:30Z. The session issues log contains 8 entries across 4 stories covering all phases executed. No data was missed in the initial retro above.

**Sprint velocity this session:** 4 loop iterations, 3 subagent calls in the final hour, ~$4.41 USD API cost for the last subagent run (code review for 6-1).

**Carry-forward status for next session:**

| Story | Status | Blocking Issue |
|-------|--------|----------------|
| 5-1-review-module-extraction | verifying | Needs Docker-based verification |
| 6-1-infra-module-init-extraction | verifying | AC #9 escalated (integration-required: end-to-end mode comparison) |
| 3-4-eight-hour-stability-test | verifying | Not touched this session — needs dedicated long-running test |
| 4-3-verifier-session-reliability | verifying | Not touched this session |

**Key metric:** Code review found **6 HIGH-severity bugs** across 3 stories this session. Zero HIGH bugs escaped to verification. The review gate is the highest-value phase in the pipeline right now.

**Unresolved risk:** The `verify-env build` container problem (no source code, wrong stack detection) affected both 3-1 and 6-1 verification. Until this is fixed, every verification pass requires manual container setup, which wastes time and introduces human error.

---

## Addendum — 2026-03-19 (end-of-session update)

_Timestamp: 2026-03-19, appended by retrospective review._

### Additional Work After Initial Retro

The initial retro (above) was written at ~00:45Z. After that, three more activities occurred:

#### Story 6-2-shared-stack-management (new this session)

| Phase | Timestamp | Outcome |
|-------|-----------|---------|
| create-story | ~00:45Z | Story created. Noted ambiguity in AC #4 scope (overlap with existing `getStackHealth()` path) and overlap with verify module's `cleanupStaleContainers()`. |
| dev-story | ~00:50Z | Implementation complete. Stack management, container cleanup, port conflict detection all implemented with `Result<T>` returns. `StackStatus` type extended with `composePath` and `projectName`. Outer catch blocks marked with `c8 ignore`. AC #9 (data volumes preserved) marked integration-required. |
| code-review | ~01:00Z | **Zero bugs found.** Clean implementation — all functions return `Result<T>`, never throw, handle Docker-unavailable gracefully. Coverage at 96.58% overall, 85 files, all above 80% floor. New code at 100% statements/functions. |

This is the first story this session where code review found zero bugs. The pattern: 5-1 had 3 HIGH bugs, 6-1 had 3 HIGH bugs + 51 test regressions, 6-2 had zero. The dev agent may be learning from the review feedback.

#### 6-1 Verification Completed

The 6-1-infra-module-init-extraction verification ran in a subsequent loop (~00:30Z entry in session log). Result: **9/10 ACs PASS, 1 ESCALATE** (AC 9 — integration-required: end-to-end mode comparison across local-shared, remote-direct, remote-routed, no-observability). The verification proof is at `verification/6-1-infra-module-init-extraction-proof.md`.

Verification was complicated by the same `verify-env build` problem — generic Dockerfile with no source code. Required manual `docker cp` of source into the container.

#### Ralph Hit NO_WORK State

The final ralph loop (~00:37Z, loop 5) scanned all stories and found no actionable work:
- 4 stories at `verifying` — all blocked on escalated ACs requiring integration testing or manual acceptance
- 9 stories at `backlog` — need `/create-story` before dev can begin
- Total API cost for last two loops: ~$7.82 USD ($4.41 for 6-1 code review + $3.41 for the NO_WORK scan)

### Updated Session Summary Table

| Story | Start Status | End Status | Phases Completed | Notes |
|-------|-------------|------------|-----------------|-------|
| 5-1-review-module-extraction | backlog | verifying | create-story, dev, code-review | 3 HIGH bugs fixed in review. Awaiting Docker verification. |
| 3-1-error-capture-on-timeout | verifying | done | verification, dev (AC6 fix), code-review | Completed end-to-end. AC6 fixed after verification caught the gap. |
| 6-1-infra-module-init-extraction | backlog | verifying | create-story, dev, code-review, verification | 3 HIGH bugs + 51 test regressions fixed in review. 9/10 ACs pass, AC9 escalated. |
| 6-2-shared-stack-management | backlog | verifying | create-story, dev, code-review | Clean implementation, zero bugs in review. Awaiting verification. |
| 3-4-eight-hour-stability-test | verifying | verifying | (not touched) | Needs dedicated long-running test. |
| 4-3-verifier-session-reliability | verifying | verifying | (not touched) | Needs Docker kill scenario testing. |

**Revised net progress:** 1 story to done. 3 stories from backlog to verifying (was 2 in initial retro). 5 stories total now at verifying. Sprint loop reached NO_WORK — all remaining stories either need integration testing or story creation.

### Updated Metrics

| Metric | Value |
|--------|-------|
| Stories attempted | 4 (was 4 in initial retro, now includes 6-2) |
| Stories completed (done) | 1 (3-1) |
| Stories moved to verifying | 3 (5-1, 6-1, 6-2) |
| HIGH bugs found by code review | 6 (across 5-1 and 6-1; 6-2 had zero) |
| Test regressions found by code review | 51 (all in 6-1) |
| Overall test coverage | 96.58% statements, 97.11% lines |
| Total files tracked | 85 (all above 80% per-file floor) |
| Estimated session API cost | ~$12+ USD across all ralph loops |
| Ralph loop iterations | 5 |

### Additional Action Items

**Fix Now:**
- [ ] Run verification for 5-1-review-module-extraction and 6-2-shared-stack-management — both at verifying without proofs.

**Fix Soon:**
- [ ] Investigate `verify-env build` stack detection — it fell back to "generic" template in both 3-1 and 6-1 verification, requiring manual `docker cp`. This is the single biggest time sink in the pipeline.
- [ ] Create stories for the 9 backlog items so the sprint loop can pick them up — ralph is at NO_WORK without them.
- [ ] Consider adding a "dev agent learning" mechanism — feed code review findings back into dev agent context so the same bug patterns don't repeat. The 6-2 zero-bug result suggests implicit learning but it's not systematic.

**Backlog:**
- [ ] Unified container cleanup — `verify/env.ts` has `cleanupStaleContainers()` for verify containers, 6-2 adds `cleanupContainers()` for infra containers. Future story should consolidate.
- [ ] Port conflict detection only works on macOS/Linux (`lsof`). Not blocking but should be noted for cross-platform support.

---

## Addendum — 2026-03-19T01:20Z (final session review)

_Timestamp: 2026-03-19, appended by retrospective agent._

### Additional Work After Second Addendum

Two more activities occurred after the previous addendum was written, completing the full session picture.

#### Story 6-2-shared-stack-management: Verification Completed (~01:00Z)

- **Result:** 9/10 ACs PASS, 1 ESCALATE (AC 9 — integration-required: volume persistence across `docker compose down`/`up` cycles)
- Story remains at `verifying` due to the escalated AC
- AGENTS.md for infra module was stale (missing `container-cleanup.ts` and `stack-management.ts`) — had to update before verification preconditions would pass
- Stale Docker container from previous session required manual `docker rm -f`

#### Story 6-3-non-interactive-bmad-install: Full Pipeline (~01:05Z–01:15Z)

| Phase | Timestamp | Outcome |
|-------|-----------|---------|
| create-story | ~01:05Z | Story created with 12 ACs (expanded from epic's 3). Noted overlap with 6-1 — much of the implementation already exists. AC #12 (no-network) tagged integration-required. |
| dev-story | ~01:10Z | Primarily verification/hardening of existing functionality from 6-1. All 2123 unit tests pass. `src/lib/bmad.ts` at 521 lines flagged as pre-existing NFR18 violation. |
| code-review | ~01:15Z | One MEDIUM bug found: unused `fail` import in `bmad-setup.ts`. Fixed. Coverage at 96.58%, bmad-setup.ts at 100%. |

This is the second consecutive story (after 6-2) where code review found zero HIGH bugs. The dev agent appears to have internalized the "never throw" and "Result<T> everywhere" patterns from earlier review feedback.

### Final Session Summary Table (Complete)

| Story | Start Status | End Status | Phases Completed | Bugs Found (Review) |
|-------|-------------|------------|-----------------|---------------------|
| 3-1-error-capture-on-timeout | verifying | done | verification, dev (AC6 fix), code-review | 0 HIGH, 2 MEDIUM |
| 5-1-review-module-extraction | backlog | verifying | create-story, dev, code-review | 3 HIGH |
| 6-1-infra-module-init-extraction | backlog | verifying | create-story, dev, code-review, verification | 3 HIGH + 51 test regressions |
| 6-2-shared-stack-management | backlog | verifying | create-story, dev, code-review, verification | 0 |
| 6-3-non-interactive-bmad-install | backlog | verifying | create-story, dev, code-review | 0 HIGH, 1 MEDIUM |
| 3-4-eight-hour-stability-test | verifying | verifying | (not touched) | -- |
| 4-3-verifier-session-reliability | verifying | verifying | (not touched) | -- |

### Final Metrics (Complete)

| Metric | Value |
|--------|-------|
| Stories attempted | 5 |
| Stories completed (done) | 1 (3-1) |
| Stories moved to verifying | 4 (5-1, 6-1, 6-2, 6-3) |
| HIGH bugs found by code review | 6 (all in 5-1 and 6-1; 6-2 and 6-3 had zero) |
| MEDIUM bugs found by code review | 3 |
| Test regressions found by code review | 51 (all in 6-1) |
| Overall test coverage | 96.58% statements |
| Total files tracked | 85 (all above 80% per-file floor) |
| Unit tests passing | 2123 |
| Ralph loop iterations | 6 |
| Estimated session API cost | ~$13+ USD |
| Session duration | ~6 hours (19:08Z to ~01:15Z) |

### Pattern: Bug Rate Declining Through Session

| Story (chronological) | HIGH bugs | MEDIUM bugs | Test regressions |
|----------------------|-----------|-------------|------------------|
| 5-1 (first) | 3 | 0 | 0 |
| 6-1 (second) | 3 | 0 | 51 |
| 3-1 (third, AC6 fix) | 0 | 2 | 0 |
| 6-2 (fourth) | 0 | 0 | 0 |
| 6-3 (fifth) | 0 | 1 | 0 |

The dev agent's code quality improved measurably over the session. The last two stories had zero HIGH bugs, suggesting the review feedback loop is working — at least within a single session where context carries over.

### Revised Action Items

**Fix Now (before next session):**
- [ ] Run verification for 5-1-review-module-extraction — only story at verifying without a verification pass
- [ ] Run verification for 6-3-non-interactive-bmad-install — completed code review, needs Docker verification

**Fix Soon (next sprint):**
- All items from previous addendum remain valid, plus:
- [ ] Decide on escalated ACs — 6-1 AC9, 6-2 AC9, and 6-3 AC12 all require integration testing that the current pipeline cannot automate. Either build integration test infrastructure or accept manual sign-off.
- [ ] Create remaining backlog stories (9 items) — ralph hit NO_WORK because no backlog stories have been through `/create-story`

**Backlog:**
- [ ] Track `src/lib/bmad.ts` 521-line NFR18 violation — flagged in both 6-1 and 6-3 sessions now
- [ ] Investigate whether dev agent learning can be made systematic (context injection of prior review findings)

---

## Addendum — 2026-03-19T01:30Z (6-3 verification failure + full session closeout)

_Timestamp: 2026-03-19, appended by retrospective agent._

### 6-3-non-interactive-bmad-install: Verification Failed

After the previous addendum, ralph loop 7 attempted Docker verification of 6-3-non-interactive-bmad-install (~01:17Z). The verifier session (`claude --print`) timed out after ~8 minutes without producing a proof document.

**Root causes (from session issues log):**

1. **Container missing codeharness CLI** -- `verify-env build` produces containers without the project CLI installed. Required manual `docker cp dist/` and `npm install` of dependencies, then binary symlinking. This is the same infrastructure bug reported in every verification attempt this sprint.
2. **`npx bmad-method install --yes --tools claude-code` hangs in Docker** -- The `codeharness init` command (which 6-3 specifically tests) downloads packages at runtime via npx. In a container with limited network or no cache, this takes too long or hangs entirely, causing the verifier to time out.
3. **Observability stack was down** -- Required `codeharness stack start` before verification could begin.

**Outcome:** No proof produced. Story stays at `verifying`, retry 1/10. This is the only story that completed code review but failed verification this session.

### Final Session State (Complete)

| Story | Start Status | End Status | Phases Completed | Bugs Found (Review) | Verification Result |
|-------|-------------|------------|-----------------|---------------------|---------------------|
| 3-1-error-capture-on-timeout | verifying | done | verification, dev (AC6 fix), code-review | 0 HIGH, 2 MEDIUM | PASS (done) |
| 5-1-review-module-extraction | backlog | verifying | create-story, dev, code-review | 3 HIGH | Not attempted |
| 6-1-infra-module-init-extraction | backlog | verifying | create-story, dev, code-review, verification | 3 HIGH + 51 test regressions | 9/10 PASS, 1 ESCALATE |
| 6-2-shared-stack-management | backlog | verifying | create-story, dev, code-review, verification | 0 | 9/10 PASS, 1 ESCALATE |
| 6-3-non-interactive-bmad-install | backlog | verifying | create-story, dev, code-review, verification (failed) | 0 HIGH, 1 MEDIUM | Timed out, no proof |
| 3-4-eight-hour-stability-test | verifying | verifying | (not touched) | -- | -- |
| 4-3-verifier-session-reliability | verifying | verifying | (not touched) | -- | -- |

### Metrics (Final)

| Metric | Value |
|--------|-------|
| Stories attempted | 5 |
| Stories completed (done) | 1 (3-1) |
| Stories moved to verifying | 4 (5-1, 6-1, 6-2, 6-3) |
| Stories at verifying (total) | 6 (including 3-4, 4-3 carried over) |
| HIGH bugs found by code review | 6 |
| MEDIUM bugs found by code review | 3 |
| Test regressions found by code review | 51 (all in 6-1) |
| Verification passes | 2 (6-1, 6-2) — both with 1 escalated AC |
| Verification failures | 1 (6-3 — timeout) |
| Verifications not attempted | 1 (5-1) |
| Overall test coverage | 96.58% statements, 97.11% lines |
| Unit tests passing | 2123 |
| Ralph loop iterations (total) | 7 |
| Estimated session API cost | ~$19+ USD ($4.41 + $3.41 + $5.31 + $5.96 = $19.09 across loops 4-7) |
| Session duration | ~7 hours (2026-03-18 19:08Z to 2026-03-19 ~01:30Z) |

### The verify-env Build Problem: Sprint-Level Analysis

This is the third consecutive retro flagging the same infrastructure bug. Summary of impact:

| Session | Stories Affected | Time Wasted | Workaround |
|---------|-----------------|-------------|------------|
| 2026-03-18 (initial) | 3-1 | ~10 min | Manual npm install in container |
| 2026-03-19 (loop 2) | 6-1 | ~15 min | Manual docker cp + npm install |
| 2026-03-19 (loop 4) | 6-2 | ~5 min | Manual docker rm + rebuild |
| 2026-03-19 (loop 7) | 6-3 | ~8 min (then timeout) | Could not work around — verifier timed out |

The 6-3 failure is qualitatively different: the story being verified (non-interactive bmad install) specifically requires a working `codeharness init` inside Docker, which triggers `npx bmad-method install`. This downloads npm packages at runtime, compounding the missing-CLI problem with a network-dependent operation. Fixing `verify-env build` alone won't solve 6-3 — the bmad-method package also needs to be pre-cached or the install needs a timeout/retry mechanism.

### Revised Action Items (Final)

**Fix Now (before next session):**
- [ ] Run verification for **5-1-review-module-extraction** — the only story at verifying with no verification attempt
- [ ] Fix `verify-env build` to pre-install codeharness CLI from built `dist/` — this is now a P0 blocker, not a nice-to-have. It has caused failures or workarounds in every verification pass this sprint.

**Fix Soon (next sprint):**
- [ ] Pre-cache `bmad-method` package in verification containers — 6-3 cannot be verified without this, even after the CLI install fix
- [ ] Decide on escalated ACs — 6-1 AC9, 6-2 AC9, 6-3 AC12 all need integration testing or manual acceptance
- [ ] Create remaining 9 backlog stories so ralph has work to pick up
- [ ] Extract shared orchestrator utilities (dev/review code duplication)
- [ ] Split `status.ts` (722 lines) — flagged in 3 consecutive retros now

**Backlog:**
- All previous backlog items remain valid
- [ ] Add verification timeout configuration — 8 minutes may not be enough for stories that require npm installs inside containers

---

## Addendum — 2026-03-19T01:45Z (second 6-3 verification failure + session closeout)

_Timestamp: 2026-03-19, appended by retrospective agent._

### 6-3-non-interactive-bmad-install: Second Verification Failure (~01:39Z)

Ralph loop 8 attempted 6-3 verification again. The verifier session (`claude --print`) timed out after ~9 minutes — same outcome as the first attempt. No proof document was produced.

**From the session issues log (01:39Z entry):**
- Verifier was likely still working through initial AC verification steps when it ran out of time/budget
- The $5 budget may be insufficient for a verifier session that needs to run multiple `codeharness init` invocations with different scenarios (fresh install, already installed, failure simulation, bmalph detection, etc.)
- Recommendation from the session: tag this story as `unit-testable` since all 11 CLI-verifiable ACs test internal function behavior fully covered by unit tests. Black-box verification of internal function signatures (AC 4, 5) is impossible anyway.

**Outcome:** No proof produced. Infrastructure retry 2/10. Story stays at `verifying`.

The final ralph log at 01:37Z produced an empty output file, indicating the session terminated after this second verification failure.

### Updated Final Metrics

| Metric | Value |
|--------|-------|
| Stories attempted | 5 |
| Stories completed (done) | 1 (3-1) |
| Stories moved to verifying | 4 (5-1, 6-1, 6-2, 6-3) |
| Stories at verifying (total) | 6 (including 3-4, 4-3 carried over) |
| HIGH bugs found by code review | 6 |
| MEDIUM bugs found by code review | 3 |
| Test regressions found by code review | 51 (all in 6-1) |
| Verification passes | 2 (6-1, 6-2) — both with 1 escalated AC |
| Verification failures | 2 (6-3 — both timeouts) |
| Verifications not attempted | 1 (5-1) |
| Overall test coverage | 96.58% statements, 97.11% lines |
| Unit tests passing | 2123 |
| Ralph loop iterations (total) | 8 |
| Estimated session API cost | ~$21+ USD |
| Session duration | ~7.5 hours (2026-03-18 19:08Z to 2026-03-19 ~01:45Z) |

### Key Takeaway: 6-3 Verification Is Structurally Blocked

Two consecutive verification timeouts with the same root cause confirm this is not a transient failure. The story requires running `codeharness init` (which triggers `npx bmad-method install`) inside a Docker container that lacks both the CLI and cached npm packages. Retrying with the current infrastructure will produce the same result.

**Recommended resolution (choose one):**
1. Accept unit test coverage as sufficient — all ACs are tested at the unit level, Docker verification adds no value for this story's function-level ACs
2. Pre-cache bmad-method in the verification container AND fix verify-env to install the CLI — then retry
3. Increase verifier budget and timeout to 20+ minutes — brute force approach, expensive

### Final Action Items (Consolidated)

**Fix Now (before next session):**
- [ ] Decide 6-3 verification strategy — stop retrying with current infra, pick one of the three options above
- [ ] Run verification for 5-1-review-module-extraction — only story with no verification attempt
- [ ] Fix `verify-env build` to pre-install codeharness CLI — P0 blocker affecting all verifications

**Fix Soon (next sprint):**
- [ ] Pre-cache `bmad-method` package in verification containers
- [ ] Decide on all escalated ACs — 6-1 AC9, 6-2 AC9, 6-3 AC12 need integration testing or manual sign-off
- [ ] Create remaining 9 backlog stories so ralph has work
- [ ] Extract shared orchestrator utilities (dev/review duplication)
- [ ] Split `status.ts` (722 lines) — flagged in 3+ consecutive retros

**Backlog:**
- All previous backlog items remain valid
- [ ] Add verification timeout/budget configuration for network-dependent stories
- [ ] Consider `unit-testable` tag for stories where Docker verification adds no value over unit tests
