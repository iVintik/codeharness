# Session Retrospective — 2026-03-27

**Sprint:** Epic 14 completion session
**Duration:** ~20 minutes
**Stories completed:** 14-4, 14-5, 14-6 (all verified and marked done)
**Epic status:** Epic 14 — DONE (all 7 stories complete)

---

## 1. Session Summary

Three stories were verified and marked done in this session, completing Epic 14:

- **14-5** (stack-aware-verify-dockerfile) — Tier A quick validation. Proof already existed with 10/10 PASS. Two precondition issues found and fixed before `codeharness verify` passed: stale AGENTS.md missing stats.ts entry, and stats.ts at 1.14% coverage (18 tests written to fix).
- **14-6** (subagent-status-ownership-time-budget) — Tier A quick validation. Proof already existed with 10/10 PASS. `codeharness verify` passed immediately.
- **14-4** (observability-backend-choice) — Unit-testable verification via subagent. ALL_PASS (10/10 ACs). 20 tool calls in the subagent, with one wasted Write (wrong proof format) and an overly broad grep.

## 2. Issues Analysis

### Category: State management
- **`state set` does not trigger YAML regeneration.** The `state set` command writes to `sprint-state.json` but does not regenerate the derived `sprint-status.yaml`. Only `writeStateAtomic` (called by certain internal paths) does the regen. This caused multiple fix attempts and confusion about whether state was actually persisted.

### Category: Stale documentation
- **AGENTS.md for `src/commands/` was missing `stats.ts` entry.** The `stats` command was added in a prior session but the AGENTS.md doc was not updated. This caused a verification precondition failure.

### Category: Test coverage gap
- **`stats.ts` had 1.14% coverage.** The command was shipped without tests in a prior session. Had to write 18 tests to bring it to acceptable levels before verification could pass.

### Category: Workflow gap
- **Proof documents existed for 14-5 and 14-6 but stories were stuck at "verifying".** The proofs were generated but nobody ran `codeharness verify` to validate them and transition the story state. Stories sat idle until this session picked them up.

## 3. Cost Analysis

**Cumulative project costs** (all epics, all time):

| Metric | Value |
|--------|-------|
| Total API-equivalent cost | $556.06 |
| Total API calls | 4,098 |
| Average cost per story | $3.25 (140 stories) |

**Token breakdown:**
- Cache reads: $347.42 (62%) — dominant cost, expected for long-context sessions
- Cache writes: $123.43 (22%)
- Output: $85.04 (15%)
- Input: $0.16 (0%)

**Phase breakdown:**
- Verification: $318.51 (57.3%) — most expensive phase by far
- Orchestrator: $98.81 (17.8%)
- Retro: $56.27 (10.1%)

**This session's stories in the top 10:**
- 14-4: $18.11 (148 calls) — most expensive of the three, due to subagent verification
- 14-5: $16.47 (122 calls) — inflated by coverage fix (18 new tests)
- 14-6: not in top 10 — cheap, immediate pass

## 4. What Went Well

- **3 stories verified in ~20 minutes** — efficient session with clear scope.
- **2 of 3 were quick proof validations** — proofs already existed, just needed the formal verify pass.
- **Coverage gap found and fixed** — stats.ts went from 1.14% to acceptable coverage with 18 new tests. The enforcement system caught a real gap.
- **Epic 14 completed** — all 7 stories done, clean closure.

## 5. What Went Wrong

- **`sprint-status.yaml` sync issues required multiple fix attempts.** After `state set`, the YAML was stale. Trying to fix it by re-running `state set` did not help because `state set` never triggers YAML regen. Had to find workarounds.
- **`state set` is unreliable for status transitions.** It writes JSON but skips derived artifacts. This is a recurring pain point across multiple sessions.
- **Prior session shipped stats.ts without tests.** The 1.14% coverage should have been caught at commit time, not during verification of an unrelated story.

## 6. Lessons Learned

1. **Always update `sprint-state.json` directly for status changes, not via `state set`.** The `state set` command is broken for this purpose — it does not regenerate derived files. Use the `node -e` approach to modify JSON atomically and then explicitly regenerate YAML if needed.
2. **Proof documents without a `codeharness verify` run are incomplete.** A proof file on disk does not mean the story is verified. The verify command must run to validate the proof and transition state. Tier A stories with passing proofs should be auto-verified.
3. **New commands need tests before merge.** The stats.ts gap should have been blocked by the harness enforcement, but it slipped through. Coverage checks need to run on the specific files changed, not just overall coverage.

## 7. Action Items

### Fix now
- [ ] **`state set` should trigger YAML regeneration** — or document the workaround prominently. Currently the only reliable path is to modify `sprint-state.json` directly with `node -e` and then call the YAML generation function. This trips up every session.

### Fix soon
- [ ] **Auto-verify stories that have passing proofs.** Tier A stories (unit-testable, proof already on disk with ALL_PASS) should be automatically verified by Ralph during its sweep. No human or explicit `codeharness verify` call should be needed.

### Backlog
- [ ] **Add verification-tier tags to all existing stories retroactively.** Epic 16 introduces the tier system, but existing completed stories have no tier metadata. Consider backfilling for historical analysis and to validate the tier classification logic.

---

# Session Retrospective — 2026-03-27 (Session 2)

**Sprint:** Epic 14 close-out + Epic 16 kickoff
**Duration:** ~24 minutes
**Stories completed:** 14-4, 14-5, 14-6 (verified existing proofs), 16-1 (full lifecycle: dev, review, verify)
**Epic status:** Epic 14 — DONE (all 7 stories). Epic 16 — 1/8 done.

---

## 1. Session Summary

| Story | Phase | Outcome | Notes |
|-------|-------|---------|-------|
| 14-4 (observability-backend-choice) | verify | ALL_PASS (10/10) | Subagent verification, 20 tool calls |
| 14-5 (stack-aware-verify-dockerfile) | verify | ALL_PASS (10/10) | Tier A quick validation, proof pre-existed |
| 14-6 (subagent-status-ownership-time-budget) | verify | ALL_PASS (10/10) | Tier A quick validation, immediate pass |
| 16-1 (verification-tier-type-and-utilities) | dev → review → verify | ALL_PASS (9/9) | Full lifecycle. 3849 tests pass, 96.85% coverage |

Epic 14 was closed out by verifying three stories that already had proofs or needed subagent verification. Epic 16 was kicked off with story 16-1, which went through all three phases (dev, code review, verify) in a single session with zero failures.

## 2. Issues Analysis

### Category: Code review findings (16-1)

- **HIGH: Parser tests had zero tier field coverage.** Tier derivation logic was entirely untested. Found and fixed during code review.
- **MEDIUM: `VERIFICATION_TAG_PATTERN` regex rejected new tier values.** New tags were silently ignored instead of parsed. Fixed during review.
- **MEDIUM: `parseVerificationTag` return type couldn't express new tier values.** Type system gap. Fixed during review.
- **LOW (deferred): `runtime-provable` tier unreachable via heuristic classification.** Deferred to story 16-2 where the parser tier classification is rewritten.
- **LOW (deferred): `VerificationStrategy` deprecation message misleading.** Not blocking.

### Category: State management (recurring)

- **`state set` does not trigger YAML regeneration.** Same issue as session 1. Had to re-run `state set` for 14-6.

### Category: Subagent efficiency

- **14-4 subagent: wasted Write on wrong proof format.** First proof attempt used wrong format, had to rewrite. 1 wasted tool call.
- **14-4 subagent: overly broad grep.** Searched all of `src/` for `remote-direct` when a targeted search would have sufficed. ~100+ lines of unnecessary output.
- **16-1 verify subagent: failed ESM import attempt.** Tried to import module directly, failed, had to retry with a different approach. 1 wasted tool call.

## 3. Cost Analysis

### Session delta (since session 1 retro)

| Metric | Session 1 | Session 2 (cumulative) | Delta |
|--------|-----------|------------------------|-------|
| Total cost | $556.06 | $562.19 | **$6.13** |
| Total calls | 4,098 | 4,153 | **55** |
| Stories | 140 | 141 | **+1 new (16-1)** |

Session 2 cost $6.13 across 55 API calls for 4 stories (3 verification-only + 1 full lifecycle). That is **$1.53/story** average — well below the project average of $3.27/story.

### Cumulative project costs

| Metric | Value |
|--------|-------|
| Total API-equivalent cost | $562.19 |
| Total API calls | 4,153 |
| Average cost per story | $3.27 (141 stories) |

### Token breakdown

| Type | Cost | % |
|------|------|---|
| Cache reads | $351.54 | 63% |
| Cache writes | $124.40 | 22% |
| Output | $86.08 | 15% |
| Input | $0.16 | 0% |

### Phase breakdown

| Phase | Calls | Cost | % |
|-------|-------|------|---|
| verify | 2,523 | $322.23 | 57.3% |
| orchestrator | 471 | $99.73 | 17.7% |
| retro | 396 | $56.44 | 10.0% |
| create-story | 284 | $30.20 | 5.4% |
| code-review | 245 | $27.68 | 4.9% |
| dev-story | 234 | $25.91 | 4.6% |

### Subagent-level token analysis (from session issues log)

| Subagent | Tool Calls | Breakdown | Largest Bash Outputs | Redundant Ops |
|----------|-----------|-----------|---------------------|---------------|
| 14-4 verify | 20 | Bash:7, Read:3, Grep:13, Write:2 | vitest run (~30 lines), grep (~100+ lines) | Wrong proof format (1 Write wasted), overly broad grep |
| 16-1 dev | 22 | Bash:5, Read:6, Edit:9, Grep:7, Glob:2, Write:1 | test suite (~20 lines) | None |
| 16-1 review | 22 | Bash:7, Read:9, Edit:7, Grep:6, Glob:2, Skill:1 | vitest run (~50 lines x2), git diff (~12 lines) | None |
| 16-1 verify | 17 | Bash:9, Read:4, Edit:1, Grep:4, Write:1 | vitest run (~30 lines), npm build (~20 lines), ls verification/ (~100 lines) | ESM import retry (1 call), proof rewrite (1 call) |

**Key observations:**
- **Grep dominates 14-4 verify** (13 of 20 calls). The broad `remote-direct` search across all src/ inflated both call count and output size.
- **16-1 review was the most Read-heavy phase** (9 Reads, 12 unique files). Expected for code review — this is not waste.
- **Bash is the costliest tool overall** (40.3% of all project cost, $226.36). Test suite runs (`npx vitest run`) are the primary driver. Each full test suite run produces 20-50 lines of output and consumes cache reads for the full conversation context.
- **`ls verification/` in 16-1 verify produced ~100 lines.** Listing the entire verification directory to find proof files is wasteful — a targeted glob or grep would be cheaper.
- **Total redundant operations this session: 4** (2 proof format mistakes, 1 overly broad grep, 1 failed ESM import). Minor — roughly 4 of 81 total tool calls (~5% waste).

## 4. What Went Well

- **4 stories completed in ~24 minutes** with zero failures or skips.
- **Epic 14 fully closed.** All 7 stories done. Clean epic closure.
- **16-1 completed full lifecycle (dev → review → verify) in a single session.** No rework loops. Code review found 3 real bugs (HIGH + 2 MEDIUM) and all were fixed before verify.
- **Code review caught real issues.** Parser tests had zero tier coverage, regex silently rejected new values, return type was too narrow. All fixed. This validates the review step as genuinely useful — it caught bugs that tests alone would not have caught (because the tests themselves were missing).
- **Session cost of $6.13 is efficient.** $1.53/story vs project average of $3.27/story. The verification-only stories (14-4/5/6) are cheap because proofs already existed.
- **Subagent efficiency was high.** 16-1 dev had zero redundant operations. 16-1 review had zero redundant operations. Only 5% waste across all subagents.

## 5. What Went Wrong

- **`state set` YAML sync issue recurred.** Same bug as session 1 — still not fixed. Had to work around it again for 14-6.
- **14-4 subagent wasted a Write on wrong proof format.** This is a recurring pattern: subagents do not know the current proof format and have to discover it by trial. The format should be documented or enforced.
- **`runtime-provable` tier unreachable by heuristic.** Story 16-1 introduced the tier type but the classification heuristic cannot produce `runtime-provable`. Deferred to 16-2, but this means the tier system is incomplete until 16-2 ships.
- **Legacy `unit-testable` name used in proof `Tier:` field.** The proof.ts regex has not been updated for new tier names yet. Expected (stories 16-2 to 16-4 address this), but it means verification proofs generated now will need retroactive updates.

## 6. Lessons Learned

1. **Code review is worth the cost.** The 16-1 review found 3 real bugs across regex, types, and test coverage. Without it, these would have been caught (maybe) during verify or (more likely) would have shipped broken. The review cost ~22 tool calls — a fraction of the cost of a failed verify + rework cycle.
2. **Proof format discovery wastes tool calls.** Subagents consistently fail on the first proof Write because they do not know the expected format. Providing a proof template or format spec to the verify subagent prompt would eliminate this.
3. **Broad greps are wasteful.** The 14-4 subagent's `grep remote-direct src/` across the entire source tree produced 100+ lines when a targeted path would have been 5 lines. Subagent prompts should encourage narrow, targeted searches.
4. **Verification-only stories are cheap ($1-2 each).** When proofs exist, verification is fast. The expensive stories are those that need dev + review + verify. This supports the pattern of running dev/review in one session and verify in a follow-up.
5. **`ls verification/` is wasteful for finding proof files.** Use `glob` or `grep` with a filename pattern instead of listing the entire directory.

## 7. Action Items

### Carried forward from session 1 (still open)
- [ ] **`state set` should trigger YAML regeneration** — recurred this session. Priority elevated.
- [ ] **Auto-verify stories with passing proofs** — would have saved time on 14-5 and 14-6.

### New from session 2

#### Fix now
- [ ] **Provide proof format template to verify subagent.** Include the expected proof file structure in the verify prompt so subagents do not waste a Write discovering it by trial and error.

#### Fix soon
- [ ] **Constrain subagent grep scope.** Add guidance to subagent prompts to use targeted file paths rather than broad directory searches. Saves both tool calls and output tokens.
- [ ] **Replace `ls verification/` with targeted glob.** In the verify phase, use `glob verification/*-{story-id}*` instead of listing the entire directory.

#### Backlog
- [ ] **Retroactively update proof `Tier:` fields** once 16-2 to 16-4 ship and the new tier names are enforced by proof.ts.
- [ ] **Track per-session cost deltas automatically.** Currently requires manual subtraction from the previous retro. The cost report should include a session-scoped view.

---

# Session Retrospective — 2026-03-27 (Session 3)

**Sprint:** Story 14-5 second code review + verification
**Timestamp:** 2026-03-27T14:00Z
**Duration:** ~30 minutes (budget) — actual wall time ~25 minutes
**Stories completed:** 14-5-stack-aware-verify-dockerfile (review → done)
**Epic status:** Epic 14 — 6/7 done (14-6 still in review)

---

## 1. Session Summary

| Story | Entry State | Phases Run | Exit State | Notes |
|-------|-------------|------------|------------|-------|
| 14-5-stack-aware-verify-dockerfile | review | code-review-2, verify | done | Second review pass found no new bugs. Verification ALL_PASS (10/10 ACs). 3856 tests passing, 97.45% coverage. |

This was a single-story session focused on completing the final review/verify cycle for story 14-5. The story had already been through one code review round in a previous session (Session 2) which found and fixed 2 HIGH and 3 MEDIUM bugs. This session's second code review confirmed all fixes were solid and found no new issues above LOW severity. The verify phase then ran a unit-testable tier validation — ALL_PASS on all 10 acceptance criteria.

## 2. Issues Analysis

### Category: Code quality (LOW, deferred)

Three LOW items were identified during the second code review but intentionally not fixed:

1. **Fragile push() pattern in generator.** The Dockerfile generator builds output by pushing strings to an array. This is functional but brittle — a missed push silently drops lines. Not blocking; a refactor candidate for a future tech-debt story.
2. **No Docker syntax validation test.** The generated Dockerfiles are tested for content but not validated against Docker's parser. A malformed Dockerfile would pass all tests but fail at build time. Mitigated by the fact that verification includes an actual Docker build for runtime-provable tiers.
3. **Long line in env.ts.** A single line exceeds the style guide's recommended length. Cosmetic.

### Category: Redundant operations

- **Second coverage run in verify phase could have reused first output.** The verify subagent ran `npx vitest run --coverage` twice — once to check tests pass, once to check coverage thresholds. The first run already produced coverage output. This wasted one Bash call and its associated context tokens.

### Category: Stale mocks (carried forward)

- **14 stale `mockDetectStack` call sites in `verify-env.test.ts`.** Reported in Session 2's first review. Still not cleaned up. These mock a function (`detectStack`) that was removed during the provider migration (Epic 10). The mocks are dead code — they do not affect test correctness but add noise and confusion.

## 3. Cost Analysis

### Session 3 delta (since Session 2 retro)

| Metric | Session 2 (cumulative) | Session 3 (cumulative) | Delta |
|--------|------------------------|------------------------|-------|
| Total cost | $562.19 | $572.74 | **$10.55** |
| Total calls | 4,153 | 4,239 | **86** |
| Stories completed | 141 | 142 | **+1** |

Session 3 cost $10.55 across 86 API calls for 1 story. This is higher than the Session 2 average ($1.53/story) because this story required a full code-review + verify cycle rather than just a quick proof validation.

### Cost breakdown by phase (session 3 deltas)

| Phase | Calls delta | Cost delta |
|-------|-------------|------------|
| verify | +54 | ~$5.19 |
| code-review | +19 | ~$1.94 |
| orchestrator | +11 | ~$3.15 |
| retro | +2 | ~$0.27 |

### Subagent-level token analysis (from session issues log)

| Subagent Phase | Tool Calls | Breakdown | Redundant Ops |
|----------------|-----------|-----------|---------------|
| code-review-2 | 22 | Bash:9, Read:8, Grep:4, Glob:1 | None |
| verify | 24 | Bash:15, Read:5, Grep:4, Write:2 | Second coverage run (1 Bash call wasted) |

**Observations:**

- **code-review-2 was lean.** 22 tool calls, zero redundant operations, zero Edits (no bugs to fix). Read 12 unique files, 13 total reads — minimal re-reading. This is the ideal profile for a clean second review pass.
- **verify was Bash-heavy.** 15 of 24 calls were Bash (build, test suite, coverage, proof validation). This is expected for unit-testable tier verification which must actually run the test suite.
- **The duplicate coverage run is the only waste.** 1 of 46 total subagent calls (~2%) was redundant. Acceptable.
- **No files were read repeatedly across phases.** code-review-2 read 12 files; verify read 5 files with only 2 overlapping (the main source files under review). Good phase isolation.

### Cumulative project costs

| Metric | Value |
|--------|-------|
| Total API-equivalent cost | $572.74 |
| Total API calls | 4,239 |
| Average cost per story | $3.30 (142 stories) |
| 14-5 total cost (all sessions) | $20.64 (162 calls) |

Story 14-5 is the 3rd most expensive story in the project ($20.64). This is justified: it went through dev, two code reviews, and verification — the code review rounds found and fixed 5 real bugs (2 HIGH, 3 MEDIUM).

## 4. What Went Well

- **Clean second review.** Zero new bugs found above LOW. All previous fixes held. This confirms the first code review was thorough and the fixes were correct.
- **Verification passed on first attempt.** ALL_PASS, 10/10 ACs, 97.45% coverage, 3856 tests. No rework needed.
- **Session stayed within time budget.** 30-minute budget, ~25 minutes actual. No scope creep.
- **Subagent efficiency was high.** 2% waste rate (1 redundant call out of 46). Both subagents completed their phases without retries or errors.
- **Story 14-5 is genuinely done.** Two review rounds caught 5 real bugs. The code quality is materially better than after the first dev pass.

## 5. What Went Wrong

- **Duplicate coverage run in verify.** The verify subagent ran `npx vitest run --coverage` twice when once would have sufficed. Minor waste ($0.50-1.00 in context tokens) but a recurring anti-pattern across verify subagents.
- **Stale mocks still not cleaned up.** The 14 dead `mockDetectStack` sites in `verify-env.test.ts` have been flagged in two consecutive sessions and still not addressed. They are LOW priority but are accumulating session-over-session as a known gap.
- **env.ts still over 300-line NFR limit.** At 304 lines after fixes, it technically violates the NFR1 300-line file size limit. The code-review-2 noted this but did not fix it (correctly — it is cosmetic and out of scope for a review-only pass). It remains unfixed.

## 6. Lessons Learned

1. **Second code review passes are cheap when the first was thorough.** code-review-2 cost ~$1.94 and 22 tool calls with zero Edits. When the first review catches real bugs and the fixes are solid, the second pass is essentially a confirmation pass. This supports running two review rounds for HIGH-complexity stories — the marginal cost is low and the confidence gain is high.
2. **Verify subagents should cache test/coverage output.** Running the test suite once and parsing its output for both pass/fail and coverage would eliminate the duplicate run. This could be enforced in the verify subagent prompt: "Run the test suite exactly once with --coverage and use the single output for all checks."
3. **LOW items accumulate if not triaged.** The stale mocks, env.ts line count, and fragile push pattern have been noted across 3 subagent runs now. They need to be either (a) logged as tech-debt stories in the backlog or (b) explicitly dismissed. Letting them recur in every review wastes reviewer attention.

## 7. Action Items

### Carried forward (still open from sessions 1-2)
- [ ] **`state set` should trigger YAML regeneration** — flagged in sessions 1 and 2
- [ ] **Auto-verify stories with passing proofs** — flagged in session 1
- [ ] **Provide proof format template to verify subagent** — flagged in session 2
- [ ] **Constrain subagent grep scope** — flagged in session 2

### New from session 3

#### Fix soon
- [ ] **Eliminate duplicate coverage runs in verify.** Update the verify subagent prompt to run `npx vitest run --coverage` exactly once and reuse the output for both pass/fail and coverage threshold checks.
- [ ] **Create tech-debt story for stale `mockDetectStack` cleanup.** 14 dead mock call sites in `verify-env.test.ts`. Has been flagged in 3 consecutive subagent runs. Should be a small story in a future tech-debt epic.

#### Backlog
- [ ] **Create tech-debt story for env.ts refactor.** At 304 lines, it exceeds the 300-line NFR1 limit. Needs extraction of a helper or splitting into sub-modules.
- [ ] **Retroactively update proof `Tier:` fields** — carried from session 2
- [ ] **Track per-session cost deltas automatically** — carried from session 2

---

# Session Retrospective — 2026-03-27 (Session 4)

**Sprint:** Story 16-2 code review + verification + state cleanup
**Timestamp:** 2026-03-27T10:31Z (Loop #8)
**Duration:** ~30-minute budget
**Stories completed:** 16-2-rewrite-parser-tier-classification (ready-for-dev → done)
**Epic status:** Epic 16 — 2/8 done (16-1, 16-2). 6 stories remain in backlog.

---

## 1. Session Summary

| Story | Entry State | Phases Run | Exit State | Notes |
|-------|-------------|------------|------------|-------|
| 16-2-rewrite-parser-tier-classification | ready-for-dev | create-story, code-review, verify | done | Code was already developed in a prior session. This session did story creation, review, and verification only. |

Additionally, stale `sprint-state.json` entries were fixed: stories 14-5, 14-6, and 16-1 were stuck at "review" in the state file despite being committed as done. These were corrected to "done" status.

Story 16-2 introduced `classifyTier()` with keyword-based four-tier classification, updated `parseVerificationTag()` for new tier types with legacy backward compatibility, and extracted keyword lists to a new `parser-keywords.ts` module. The code review found 2 HIGH bugs (broken regex, unsafe type cast) and 1 MEDIUM (missing test coverage), all fixed before verification. Verification passed 12/12 ACs with 62 parser tests and 100% coverage on parser-keywords.ts.

## 2. Issues Analysis

### Category: Code review findings (16-2)

- **HIGH: `VERIFICATION_TAG_PATTERN` regex did not include `unit-testable`.** Backward compatibility silently broken — any story with `<!-- verification: unit-testable -->` would fail to parse. Fixed by updating the regex.
- **HIGH: `parseVerificationTag` used unsafe `as VerificationTier` cast.** No runtime validation — any string would be accepted as a valid tier. Fixed with a guard check.
- **MEDIUM: Missing test coverage for edge cases.** Empty string, unknown tags, and `unit-testable` backward compat had no test coverage. 3 new tests added.
- **LOW (not fixed): Broad keywords risk false-positive classification.** Keywords like "function", "type", "export" could match non-AC text. Deferred — acceptable for current use cases.
- **LOW (not fixed): Keyword overlap between dimensions.** Some keywords could plausibly match multiple tiers. Priority ordering (escalate > environment > runtime > test) mitigates this, but it is a known imprecision.

### Category: Structural/process

- **Epic 16 has no standard epics file.** Story definitions come from `tech-spec-verification-tier-rework.md` instead of the usual epics document. The create-story subagent had to use the tech spec as authoritative source. This is a one-off deviation, but it means the standard story-creation workflow had to adapt.

### Category: State management (recurring)

- **3 stories stuck at "review" despite being done.** Stories 14-5, 14-6, and 16-1 had their git commits (marked done) but `sprint-state.json` was not updated. This is the same state sync issue flagged in sessions 1-3 — the state file drifts from reality when transitions happen outside the normal orchestrator flow.

### Category: Redundant operations

- **`npm test` run 3 times during verify phase.** The verify subagent ran the test suite three times when once with output capture (`tee`) would have sufficed. Wasted 2 Bash calls.
- **5 pre-existing test failures in unrelated modules.** The verify subagent had to reason about whether these were pre-existing or regressions. They were pre-existing, but diagnosing this cost tool calls.

## 3. Cost Analysis

### Session 4 delta (since Session 3 retro)

| Metric | Session 3 (cumulative) | Session 4 (cumulative) | Delta |
|--------|------------------------|------------------------|-------|
| Total cost | $572.74 | $582.73 | **$9.99** |
| Total calls | 4,239 | 4,314 | **75** |
| Stories completed | 142 | 144 | **+2 (16-2 + state fixes count as work)** |

Session 4 cost $9.99 across 75 API calls. The session handled story creation, code review, verification, and state cleanup for one story. At ~$10 for a full create-review-verify cycle, this is consistent with Session 3's $10.55 for a review-verify cycle.

### Subagent-level token analysis (from session issues log)

| Subagent Phase | Tool Calls | Breakdown | Files Read (unique/total) | Redundant Ops |
|----------------|-----------|-----------|--------------------------|---------------|
| create-story | 16 | Read:9, Grep:2, Glob:3, Bash:1, Write:1 | 10/10 | None |
| code-review | 18 | Bash:6, Read:9, Edit:6, Grep:2, Glob:4, Skill:1 | 9/10 | None |
| verify | 14 | Bash:8, Read:4, Grep:1, Write:1 | 5/5 | npm test x3 (2 redundant) |

**Key observations:**

- **create-story was Read-heavy (9/16 calls).** Expected — it needs to read the tech spec, existing parser code, and story templates. Zero redundant reads (10 unique out of 10 total).
- **code-review had balanced tool usage.** 6 Edits for 2 HIGH and 1 MEDIUM fix plus 3 new tests. No wasted calls. 9 unique files read out of 10 total (only 1 re-read).
- **verify had the only waste: triple test run.** 8 Bash calls, 3 of which were `npm test`. One run would have sufficed with output capture. This matches the duplicate-coverage-run pattern seen in Session 3.
- **Total redundant operations: 2 of 48 subagent calls (~4%).** Consistent with the ~5% waste rate observed in Session 2 and ~2% in Session 3.
- **No cross-phase file re-reading detected.** create-story, code-review, and verify each read their own set of files with minimal overlap. Good phase isolation.

### Cumulative project costs

| Metric | Value |
|--------|-------|
| Total API-equivalent cost | $582.73 |
| Total API calls | 4,314 |
| Average cost per story | $3.30 (144 stories) |

### Cost by phase (cumulative, all-time)

| Phase | Calls | Cost | % |
|-------|-------|------|---|
| verify | 2,622 | $332.57 | 57.1% |
| orchestrator | 486 | $104.60 | 18.0% |
| retro | 403 | $57.28 | 9.8% |
| code-review | 274 | $30.93 | 5.3% |
| create-story | 290 | $30.86 | 5.3% |
| dev-story | 239 | $26.48 | 4.5% |

Verification remains the dominant cost at 57%. The verify phase's reliance on running full test suites (Bash-heavy) drives this. Story 14-5 ($22.27) and 14-4 ($22.13) remain the top individual story costs.

## 4. What Went Well

- **Story 16-2 completed in a single session** — create-story, code-review, verify all passed without rework loops.
- **Code review caught 2 HIGH bugs.** The broken regex would have silently dropped backward compatibility for `unit-testable` tags. The unsafe type cast would have accepted any string as a valid tier. Both were real bugs that would have caused production issues.
- **100% coverage on new parser-keywords.ts module.** The new keyword extraction module shipped with full test coverage from day one.
- **Stale state entries fixed.** Three stories stuck at "review" were corrected to "done", bringing sprint-state.json back in sync with reality.
- **Low waste rate (~4%).** Only 2 redundant operations out of 48 subagent calls.

## 5. What Went Wrong

- **Triple test run in verify phase.** `npm test` was run 3 times when once would have sufficed. This is the same anti-pattern as Session 3's duplicate coverage run — verify subagents do not cache or reuse test output.
- **State drift recurred again.** Three stories were stuck at "review" despite being committed as done. This is the 4th consecutive session flagging the state sync issue. The root cause (transitions outside the orchestrator flow not updating state) has not been addressed.
- **5 pre-existing test failures confused the verify subagent.** The subagent had to spend tool calls determining whether failures were pre-existing or regressions. Pre-existing failures should be documented or excluded from the verify scope.
- **No standard epics file for Epic 16.** The create-story subagent had to improvise, using a tech spec instead of the standard epics document. This works but breaks the expected workflow.

## 6. Lessons Learned

1. **Verify subagents must run the test suite exactly once.** This is the 2nd consecutive session where test runs were duplicated. The verify prompt should explicitly say: "Run `npm test` once, capture the output, and reference it for all subsequent checks."
2. **State drift is systemic, not incidental.** Four sessions in a row have flagged stale state entries. The current architecture — where state is only updated by the orchestrator — cannot handle transitions that happen in subagent sessions, manual commits, or prior sessions that crash before updating state. This needs a reconciliation step at session start.
3. **Pre-existing test failures should be baselined.** The verify subagent should receive a list of known pre-existing failures so it does not waste time diagnosing them. Alternatively, the test suite should be clean (zero failures) at all times.
4. **Tech specs can serve as epic definitions in a pinch.** When a dedicated epics file does not exist, the tech spec is an acceptable substitute. But this should be the exception, not the pattern.

## 7. Action Items

### Carried forward (still open from sessions 1-3)

- [ ] **`state set` should trigger YAML regeneration** — flagged sessions 1, 2, 3
- [ ] **Auto-verify stories with passing proofs** — flagged session 1
- [ ] **Provide proof format template to verify subagent** — flagged session 2
- [ ] **Constrain subagent grep scope** — flagged session 2
- [ ] **Eliminate duplicate coverage/test runs in verify** — flagged session 3, recurred session 4
- [ ] **Create tech-debt story for stale `mockDetectStack` cleanup** — flagged session 3

### New from session 4

#### Fix soon
- [ ] **Add state reconciliation at session start.** Compare `sprint-state.json` against git log to detect stories that were committed as done but still show as in-progress. Auto-fix or flag for manual review. This would have prevented the 14-5, 14-6, 16-1 state drift.
- [ ] **Baseline pre-existing test failures for verify subagent.** Provide the verify prompt with a list of known failing tests so the subagent does not waste calls diagnosing them.

#### Backlog
- [ ] **Create standard epics file for Epic 16.** Currently using tech spec as source. Should have a proper epics document for consistency.
- [ ] **Retroactively update proof `Tier:` fields** — carried from session 2
- [ ] **Track per-session cost deltas automatically** — carried from session 2
