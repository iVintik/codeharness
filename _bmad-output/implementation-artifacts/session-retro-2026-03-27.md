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

---

# Session Retrospective — 2026-03-27 (Session 5)

**Sprint:** Story 16-4 full lifecycle
**Timestamp:** 2026-03-27T15:50Z
**Duration:** ~17 minutes
**Stories completed:** 16-4-update-validation-acs-and-runner (backlog → done)
**Epic status:** Epic 16 — 4/8 done (16-1 through 16-4). 4 stories remain in backlog.

---

## 1. Session Summary

| Story | Entry State | Phases Run | Exit State | Notes |
|-------|-------------|------------|------------|-------|
| 16-4-update-validation-acs-and-runner | backlog | create-story, dev, code-review, verify | done | Full lifecycle in ~17 minutes. Two code review rounds (second was a re-run catching same vocabulary issues). 3892 tests passing, 97.45% coverage. |

Story 16-4 updated the validation AC types and runner to use the new verification tier vocabulary introduced in Epic 16. The dev phase updated `validation-ac-types.ts` and `validation-runner.ts` with new tier-aware helper functions (`getTestProvableACs`, `getEnvironmentProvableACs`) while maintaining backward-compatible deprecated aliases (`getCliVerifiableACs`, `getIntegrationRequiredACs`). Code review found 3 MEDIUM issues — a broken JSDoc link, stale vocabulary in function docs, and old vocabulary in 10 test descriptions — all fixed. Verification passed 5/5 ACs.

## 2. Issues Analysis

### Category: Code review findings (16-4)

- **MEDIUM: Broken `{@link VerificationTier}` JSDoc link.** The `validation-ac-types.ts` file referenced `VerificationTier` in a JSDoc `@link` but did not import the type. The link would be unresolvable by any IDE or documentation generator. Fixed with a type import.
- **MEDIUM: Old vocabulary in `validation-runner.ts` JSDoc.** Function documentation still used "CLI-verifiable" and "Integration-required" instead of the new "test-provable" and "environment-provable" terms. Fixed.
- **MEDIUM: Old vocabulary in 10 test description strings.** Test names in `validation-acs.test.ts` used the old tier terminology. Fixed to match new vocabulary.
- **LOW (not fixed): No caching on `getTestProvableACs`/`getEnvironmentProvableACs`.** These functions filter ACs on every call. Caching would help for repeated calls but is not needed at current scale.
- **LOW (not fixed): Mild test bloat from deprecated alias tests.** Tests for backward-compatible aliases add coverage but are redundant once the aliases are eventually removed.

### Category: Duplicate code review

The session issues log shows two code-review entries for 16-4:
1. First at 11:40Z (26 tool calls) — found and fixed the 3 MEDIUM issues.
2. Second at 15:42Z (implicit from log) — found the exact same 3 MEDIUM issues again and fixed them again.

This indicates the second code review either ran against un-committed code from a different session context or the state was not properly advanced after the first review. The duplicate review wasted ~26 tool calls and ~$3-4 in tokens.

### Category: Structural/process (recurring)

- **Epic 16 still has no standard epics file.** Same observation as Session 4 — the create-story subagent had to use the tech spec as authoritative source.

### Category: Vocabulary mismatch

- **AC tags use old vocabulary (`cli-verifiable`) per instruction, while story header uses new (`test-provable`).** The create-story subagent flagged this tension. The story spec deliberately uses old tags in ACs (since the runner still processes them) but new vocabulary in the header. This is intentional during the migration but creates confusion.

## 3. Cost Analysis

### Session 5 delta (since Session 4 retro)

| Metric | Session 4 (cumulative) | Session 5 (cumulative) | Delta |
|--------|------------------------|------------------------|-------|
| Total cost | $582.73 | $591.72 | **$8.99** |
| Total calls | 4,314 | 4,390 | **76** |
| Stories completed | 144 | 147 | **+3** |

The +3 stories delta includes 16-3 and its phases from prior session work that was not yet counted, plus 16-4 from this session. The $8.99 cost covers all subagent work since Session 4.

### Subagent-level token analysis (from session issues log)

| Subagent Phase | Tool Calls | Breakdown | Files Read (unique/total) | Redundant Ops |
|----------------|-----------|-----------|--------------------------|---------------|
| 16-4 create-story | 18 | Bash:1, Read:9, Grep:7, Write:1, Glob:2, Skill:1 | 11/12 | None |
| 16-4 dev | 17 | Read:8, Edit:10, Bash:2, Glob:1, Skill:1 | 10/10 | None |
| 16-4 code-review | 26 | Bash:7, Read:9, Edit:13, Grep:4, Glob:1, Skill:1 | 10/11 | None individually, but entire phase was duplicated |
| 16-4 verify | 16 | Bash:9, Read:6, Grep:1, Write:1 | 6/7 | None |

**Also in this session's issues log (16-3 subagents):**

| Subagent Phase | Tool Calls | Breakdown | Files Read (unique/total) | Redundant Ops |
|----------------|-----------|-----------|--------------------------|---------------|
| 16-3 create-story | 10 | Bash:2, Read:5, Edit:1, Glob:3 | 5/5 | None |
| 16-3 dev | 12 | Read:4, Edit:5, Glob:2, Grep:1, Bash:2 | 5/6 | None |
| 16-3 code-review | 21 | Bash:7, Read:6, Edit:5, Grep:5, Glob:4, Skill:1 | — | None |
| 16-3 verify | 13 | Bash:8, Read:3, Grep:2, Write:1 | 5/5 | None |

**Key observations:**

- **16-4 code-review was the heaviest phase** at 26 tool calls, with 13 Edits. The high Edit count is because it fixed vocabulary across multiple files and 10 test description strings. This was legitimate work, not waste.
- **16-4 dev was Edit-heavy (10/17 calls).** 10 Edits for a story that updated types, functions, and tests across 2 source files and 1 test file. Efficient — no redundant operations.
- **The duplicate code review is the major waste.** If the second review at 15:42Z re-did all work from the first at 11:40Z, that is ~26 wasted calls (~$3-4). This is the largest single waste event in the session.
- **16-3 subagents were lean.** All four phases completed with zero redundant operations. The code review found 4 real bugs (2 HIGH, 2 MEDIUM) and fixed them all — a high-value pass.
- **Verify phases continue to be Bash-heavy.** Both 16-3 verify (8/13 Bash) and 16-4 verify (9/16 Bash) are dominated by test suite and build runs. This is structural — unit-testable tier verification requires actually running tests.

### Cumulative project costs

| Metric | Value |
|--------|-------|
| Total API-equivalent cost | $591.72 |
| Total API calls | 4,390 |
| Average cost per story | $3.29 (147 stories) |

### Cost by phase (cumulative)

| Phase | Calls | Cost | % |
|-------|-------|------|---|
| verify | 2,656 | $336.48 | 56.9% |
| orchestrator | 490 | $105.66 | 17.9% |
| retro | 407 | $57.83 | 9.8% |
| create-story | 311 | $32.99 | 5.6% |
| code-review | 282 | $31.76 | 5.4% |
| dev-story | 244 | $27.00 | 4.6% |

### Cost by tool (cumulative)

| Tool | Calls | Cost | % |
|------|-------|------|---|
| Bash | 1,915 | $236.49 | 40.0% |
| Read | 838 | $109.28 | 18.5% |
| Edit | 544 | $69.57 | 11.8% |

Bash remains the dominant tool cost (40%) driven by test suite runs in verify phases.

## 4. What Went Well

- **Story 16-4 completed full lifecycle in ~17 minutes.** backlog → create-story → dev → code-review → verify → done, with zero failures or rework loops.
- **Code review caught vocabulary drift.** The old "CLI-verifiable" / "Integration-required" terminology was still present in JSDoc and test descriptions. Without review, this vocabulary inconsistency would have shipped and created confusion.
- **16-3 code review found 4 real bugs (2 HIGH, 2 MEDIUM).** Metrics zeroed when Docker enforcement skipped, `black-box` missing from tier map, hardcoded tier names in regex, and no test for unrecognized tiers. All fixed.
- **Zero redundant operations in dev phases.** Both 16-3 dev (12 calls) and 16-4 dev (17 calls) had no wasted work. The dev subagents are efficient.
- **Coverage held at 97.45%.** No regressions despite adding new code.
- **3892 tests passing.** Net increase of 36 tests since Session 3 (3856 → 3892).

## 5. What Went Wrong

- **Duplicate code review for 16-4.** Two code-review entries in the session issues log (11:40Z and 15:42Z) both found and fixed the same 3 MEDIUM issues. The second review was likely triggered by a state management issue or session boundary problem. ~26 wasted tool calls.
- **Epic 16 epics file still missing.** Flagged in Session 4. Still using tech spec as source. Not blocking but adds friction to every create-story call.
- **Vocabulary mismatch between AC tags and story headers.** The create-story subagent had to navigate the tension between old vocabulary in AC tags and new vocabulary in headers. This is an intentional migration choice but should be documented to avoid subagent confusion.

## 6. Lessons Learned

1. **State management between code review rounds needs guardrails.** The duplicate code review happened because the state transition after the first review was not properly persisted or recognized. The orchestrator should check whether a code review has already been completed before dispatching another one.
2. **Vocabulary migration creates a transitional confusion period.** During Epic 16's tier vocabulary migration, AC tags, JSDoc, test descriptions, and story headers all use different terms depending on when they were written. A migration guide or mapping table in the story spec would help subagents navigate this without wasting time.
3. **Dev subagents are the most efficient phase.** Across sessions 4-5, dev subagents consistently have zero redundant operations and the lowest waste rate. This suggests the dev prompt and workflow are well-tuned.
4. **Code review continues to justify its cost.** 16-3 review found 4 bugs (2 HIGH), 16-4 review found 3 bugs (all MEDIUM). The cost of these reviews (~26 calls each) is small compared to the cost of shipping these bugs and fixing them later.

## 7. Action Items

### Carried forward (still open from sessions 1-4)

- [ ] **`state set` should trigger YAML regeneration** — flagged sessions 1-3
- [ ] **Auto-verify stories with passing proofs** — flagged session 1
- [ ] **Provide proof format template to verify subagent** — flagged session 2
- [ ] **Constrain subagent grep scope** — flagged session 2
- [ ] **Eliminate duplicate coverage/test runs in verify** — flagged sessions 3-4
- [ ] **Create tech-debt story for stale `mockDetectStack` cleanup** — flagged session 3
- [ ] **Add state reconciliation at session start** — flagged session 4
- [ ] **Baseline pre-existing test failures for verify subagent** — flagged session 4

### New from session 5

#### Fix soon
- [ ] **Prevent duplicate code review dispatches.** The orchestrator should check whether a code review has already been completed (and its fixes committed) before dispatching another review for the same story. This would have prevented the ~26 wasted calls in this session.
- [ ] **Create standard epics file for Epic 16.** Carried from Session 4. Two sessions now have flagged this. The create-story subagents are improvising with the tech spec — a proper epics file would eliminate this friction.

#### Backlog
- [ ] **Document vocabulary migration mapping for Epic 16.** Create a reference table (old term → new term) that subagents can use during the migration period. Include which files/tags still use old vocabulary and which have been updated.
- [ ] **Retroactively update proof `Tier:` fields** — carried from session 2
- [ ] **Track per-session cost deltas automatically** — carried from session 2
- [ ] **Create tech-debt story for env.ts refactor (304 lines, over 300-line limit)** — carried from session 3

---

# Session Retrospective — 2026-03-27 (Session 6)

**Sprint:** Epic 16 — stories 16-5 and 16-6
**Timestamp:** 2026-03-27T16:30Z
**Duration:** ~24 minutes
**Stories completed:** 16-5-rewrite-harness-run-verification-dispatch, 16-6-update-create-story-tier-criteria
**Epic status:** Epic 16 — 6/8 done (16-1 through 16-6). 2 stories remain: 16-7 (knowledge/docs), 16-8 (update all tests).

---

## 1. Session Summary

| Story | Entry State | Phases Run | Exit State | Notes |
|-------|-------------|------------|------------|-------|
| 16-5-rewrite-harness-run-verification-dispatch | verifying (proof existed) | verify (proof format fix) | done | Proof existed but had format issues (### vs ## headers, missing showboat markers). Fixed format, validation passed. |
| 16-6-update-create-story-tier-criteria | backlog | create-story, dev, code-review, verify | done | Full lifecycle. Updated BMAD create-story workflow with four-tier verification criteria. |

Story 16-5 was already at `verifying` with a proof document on disk, but the proof format did not match the parser expectations — section headers used `###` instead of `##`, and showboat markers were missing. After fixing the proof format, validation passed and the story was marked done. No code changes were needed; this was purely a proof-document formatting issue.

Story 16-6 went through the complete lifecycle in a single session. It updated the BMAD create-story workflow (`_bmad/bmm/tasks/create-story-workflow.md` or equivalent) to include four-tier verification criteria guidance, ensuring new stories are created with the correct tier classification from the start.

## 2. Issues Analysis

### Category: Proof format mismatch (16-5)

- **Proof document used wrong header levels.** The proof for 16-5 used `###` headers instead of `##`, which the proof parser expects. This is the same class of issue flagged in Session 2 (proof format discovery waste) — but here the proof already existed and just had the wrong format.
- **Missing showboat markers.** The proof lacked the expected showboat section markers that the validation pipeline looks for. This prevented automated validation from passing.
- **Root cause:** The dev/verify subagent that originally generated the proof was not aware of the current proof format requirements. This validates the Session 2 action item to provide a proof format template to verify subagents.

### Category: Code review findings (16-5)

From earlier session work (logged in session issues):
- **HIGH: test-provable subagent prompt missing mandatory `## Session Issues` section.** Fixed.
- **HIGH: runtime-provable subagent prompt missing mandatory `## Session Issues` section.** Fixed.
- **MEDIUM: escalate dispatch missing Docker cleanup guidance for environment-provable sub-verification.** Fixed.
- **LOW (not fixed): Escalate section uses inline instructions (no subagent wrapper).** Deferred.
- **LOW (not fixed): Tests are string-containment — brittle to rewording.** Accepted risk.

### Category: Code review findings (16-6)

No issues logged in the session issues file for 16-6, indicating a clean review pass.

### Category: Process

- **No failures or skips this session.** Both stories completed on first attempt.
- **Proof format issues are a recurring theme.** Sessions 2, 4, and now 6 have all encountered proof format problems. The proof template action item remains the highest-leverage fix.

## 3. Cost Analysis

### Session 6 delta (since Session 5 retro)

| Metric | Session 5 (cumulative) | Session 6 (cumulative) | Delta |
|--------|------------------------|------------------------|-------|
| Total cost | $591.72 | $602.28 | **$10.56** |
| Total calls | 4,390 | 4,480 | **90** |
| Stories completed | 147 | 150 | **+3** |

The +3 stories delta includes 16-5, 16-6, and likely 16-3 verification work that was counted in this window. Session 6 cost $10.56 across 90 API calls — consistent with Sessions 3-5 ($9-11 per session).

### Cumulative project costs

| Metric | Value |
|--------|-------|
| Total API-equivalent cost | $602.28 |
| Total API calls | 4,480 |
| Average cost per story | $3.28 (150 stories) |

### Token breakdown (cumulative)

| Type | Cost | % |
|------|------|---|
| Cache reads | $374.81 | 62% |
| Cache writes | $134.46 | 22% |
| Output | $92.85 | 15% |
| Input | $0.17 | 0% |

### Phase breakdown (cumulative)

| Phase | Calls | Cost | % |
|-------|-------|------|---|
| verify | 2,702 | $341.30 | 56.7% |
| orchestrator | 494 | $107.17 | 17.8% |
| retro | 411 | $58.34 | 9.7% |
| create-story | 330 | $34.93 | 5.8% |
| code-review | 287 | $32.34 | 5.4% |
| dev-story | 256 | $28.20 | 4.7% |

Verification remains the dominant cost at 56.7%. No significant shift in cost distribution since Session 5.

### Cost per story this session

$10.56 / 2 stories completed = **$5.28/story** — above the project average of $3.28/story. This is because 16-6 was a full-lifecycle story (create through verify) and 16-5 required proof format debugging rather than a simple pass.

## 4. What Went Well

- **2 stories completed, 0 failures, 0 skips.** Clean session with no rework loops.
- **16-6 full lifecycle in a single session.** backlog to done with no issues — the BMAD workflow update was straightforward.
- **Epic 16 at 75% completion (6/8).** Steady progress; only docs (16-7) and test updates (16-8) remain.
- **16-5 proof format fix was quick.** Once the format issues were identified, the fix was mechanical — no code changes needed, just proof document reformatting.
- **Session stayed within time budget.** ~24 minutes for 2 stories.
- **Code review for 16-5 found 2 HIGH bugs** (missing Session Issues sections in subagent prompts). These would have caused subagent failures in production use.

## 5. What Went Wrong

- **16-5 proof format mismatch blocked automated validation.** The proof existed but was unusable due to wrong header levels and missing showboat markers. This is the 3rd session where proof format issues have caused friction. The proof template action item (Session 2) would have prevented this.
- **Architecture concern in 16-5 escalate flow remains unresolved.** The code review flagged ambiguity in whether the escalate dispatch runs separate subagents per tier group or one combined subagent. This was noted but not resolved — it is a design decision that will surface when the escalate path is actually exercised.
- **Brittle string-containment tests in 16-5.** The test suite for harness-run dispatch uses string-containment checks that will break on any rewording. Accepted as LOW risk but adds maintenance burden.

## 6. Lessons Learned

1. **Proof format enforcement is overdue.** Three sessions (2, 4, 6) have now hit proof format issues. The fix is straightforward: provide a proof template to the verify subagent prompt with exact header levels and required sections. This is the single highest-leverage improvement for verification efficiency.
2. **Stories that modify markdown commands (not TypeScript) have a different verification profile.** Story 16-5 changed `commands/harness-run.md`, not TypeScript code. The standard unit-test/coverage verification is not directly applicable. The test file (`harness-run-dispatch.test.ts`) validates the command content via string checks — a different verification pattern that should be documented.
3. **Full-lifecycle stories cost ~$5/story; verification-only stories cost ~$1-2/story.** The cost split is consistent across Sessions 2-6. This supports batching dev+review work in one session and verification in a follow-up session when cost efficiency matters.
4. **Remaining Epic 16 stories (16-7, 16-8) are documentation and test updates.** These are typically lower-risk, lower-cost stories. Epic 16 should close out in 1-2 more sessions.

## 7. Action Items

### Carried forward (still open from sessions 1-5)

- [ ] **`state set` should trigger YAML regeneration** — flagged sessions 1-3
- [ ] **Auto-verify stories with passing proofs** — flagged session 1
- [ ] **Provide proof format template to verify subagent** — flagged session 2, recurred sessions 4 and 6. Priority: HIGH.
- [ ] **Constrain subagent grep scope** — flagged session 2
- [ ] **Eliminate duplicate coverage/test runs in verify** — flagged sessions 3-4
- [ ] **Create tech-debt story for stale `mockDetectStack` cleanup** — flagged session 3
- [ ] **Add state reconciliation at session start** — flagged session 4
- [ ] **Baseline pre-existing test failures for verify subagent** — flagged session 4
- [ ] **Prevent duplicate code review dispatches** — flagged session 5

### New from session 6

#### Fix soon
- [ ] **Document markdown-command verification pattern.** Stories that modify `.md` command files (not TypeScript) need a different verification approach — string-containment tests on the command content rather than unit tests. Document this as a recognized verification pattern so subagents and story creators handle it correctly.

#### Backlog
- [ ] **Resolve escalate dispatch ambiguity in harness-run.** The 16-5 code review flagged that the escalate flow is unclear about whether it runs separate subagents per tier group or one combined subagent. This needs a design decision before the escalate path is used in production.
- [ ] **Create standard epics file for Epic 16** — carried from sessions 4-5
- [ ] **Document vocabulary migration mapping for Epic 16** — carried from session 5
- [ ] **Retroactively update proof `Tier:` fields** — carried from session 2
- [ ] **Track per-session cost deltas automatically** — carried from session 2
- [ ] **Create tech-debt story for env.ts refactor** — carried from session 3

---

# Session Retrospective — 2026-03-27 Session 7

**Sprint:** Epic 16 — Verification Tier Rework (stories 16-5, 16-6)
**Duration:** ~20 minutes
**Stories completed:** 16-5 (rewrite-harness-run-verification-dispatch), 16-6 (update-create-story-tier-criteria)
**Timestamp:** 2026-03-27T16:55Z

## 1. Session Summary

| Story | Start Status | End Status | Phases Run | ACs | Outcome |
|-------|-------------|------------|------------|-----|---------|
| 16-5-rewrite-harness-run-verification-dispatch | review | done | code-review x2, verify | 7/7 PASS | Clean completion after 2nd code review |
| 16-6-update-create-story-tier-criteria | review | done | code-review, verify | 10/10 PASS | Clean completion |

Both stories were test-provable tier (no Docker required). Total 17 ACs verified across both stories. Build passing, 3961 tests, 96.86% coverage at session end.

## 2. Issues Analysis

### Bugs Found and Fixed This Session

**Story 16-5 (code-review round 1):**
- HIGH: test-provable subagent prompt missing mandatory `## Session Issues` section
- HIGH: runtime-provable subagent prompt missing mandatory `## Session Issues` section
- MEDIUM: Escalate dispatch missing Docker cleanup guidance for environment-provable

**Story 16-5 (code-review round 2):**
- MEDIUM: Stale "black-box verification" text in failure template
- MEDIUM: Stale "unit-testable verification" text in retrospective prompt
- MEDIUM: `VERIFICATION_TAG_PATTERN` regex missing `black-box` value

**Story 16-6 (code-review):**
- HIGH: AC8 test missing `distributed system` criterion
- MEDIUM: AC1 test used global search instead of scoping to Step 5
- MEDIUM: "Default to test-provable when unsure" instruction had no test coverage

**Total: 3 HIGH, 6 MEDIUM bugs caught and fixed by code review.**

### Architecture Concerns Logged

1. LEGACY_TIER_MAP in types.ts and VERIFICATION_TAG_PATTERN regex in parser.ts must stay in sync manually — no compile-time enforcement.
2. Escalate flow ambiguity — unclear if orchestrator runs separate subagents per tier group or one combined subagent.

### LOW Items Deferred (not fixed)

- Section ordering mismatch in harness-run.md routing table vs actual sections
- 34 dispatch tests are string-matching against markdown (brittle)
- Escalate section uses inline instructions (no subagent wrapper)
- AC6-AC9 tests use broader scope than necessary
- Hardcoded relative paths in test file

## 3. Cost Analysis

### Project Lifetime Totals (from cost report)

| Metric | Value |
|--------|-------|
| Total cost | $606.30 |
| Total API calls | 4,506 |
| Avg cost/story | $3.28 (151 stories) |

### Cost by Phase (project lifetime)

| Phase | Cost | % |
|-------|------|---|
| verify | $342.64 | 56.5% |
| orchestrator | $108.36 | 17.9% |
| retro | $58.98 | 9.7% |
| create-story | $35.25 | 5.8% |
| code-review | $32.88 | 5.4% |
| dev-story | $28.20 | 4.7% |

**Key observation:** Verify phase consumes 56.5% of all cost. This is the dominant spend area.

### Token Type Breakdown

Cache reads dominate at 62% ($376.61) — healthy, means prompt caching is working. Output tokens are 15% ($93.48). Cache writes at 22% ($136.04) indicate significant new context being loaded each session.

### Subagent Token Report — This Session

Aggregated from session issues log tool-call counts for stories 16-5 and 16-6:

| Subagent Phase | Tool Calls | Top Tools |
|----------------|------------|-----------|
| 16-5 create-story | 14 | Read: 7, Grep: 5, Bash: 2 |
| 16-5 dev | 19 | Read: 8, Edit: 8, Bash: 4 |
| 16-5 code-review (round 1) | 22 | Read: 10, Bash: 6, Edit: 4 |
| 16-5 code-review (round 2) | 24 | Read: 11, Bash: 7, Edit: 4 |
| 16-5 verify | 12 | Read: 6, Bash: 5, Grep: 1 |
| 16-6 code-review | 18 | Bash: 7, Read: 5, Edit: 3 |
| 16-6 verify | 22 | Bash: 16, Read: 4, Grep: 1 |
| **Total** | **131** | |

**Hotspots:**
- 16-5 code-review needed 2 rounds (46 tool calls total) — the most expensive phase for this session. Round 1 found 3 bugs, round 2 found 3 more stale-vocabulary bugs that should have been caught in round 1.
- 16-6 verify had 16 Bash calls — higher than typical. Likely redundant test/coverage runs.
- harness-run.md was read 5 times across offsets in 16-5 code-review round 1, and 4 times in dev. Large file requiring repeated partial reads is a cost driver.

**Redundant operations identified:**
- `commands/harness-run.md` read repeatedly across phases (at least 9+ reads across 16-5 subagents) due to file size requiring offset-based reading
- No redundant npm test runs reported this session (improvement over earlier sessions)

## 4. What Went Well

- **Clean verifications:** Both stories passed all ACs on first verify attempt (17/17 total)
- **Code review catching real bugs:** 9 bugs found and fixed across the two stories before verification. The two-round code review on 16-5 caught stale vocabulary that would have caused verify failures.
- **Fast session:** ~20 minutes for 2 stories review-to-done is efficient
- **Test suite stability:** 3961 tests passing, 96.86% coverage maintained — no regressions introduced
- **No Docker needed:** Both stories correctly classified as test-provable, avoiding container overhead
- **Session issues log is working:** Every subagent faithfully reported tool call counts and issues — provides excellent raw data for retros

## 5. What Went Wrong

- **Story 16-5 needed 2 code review rounds:** The first review missed 3 stale-vocabulary instances that the second review caught. This doubled the code-review cost for that story.
- **Sprint status shows 16-5 and 16-6 still as "review":** The sprint-status.yaml was not updated to "done" despite commits confirming completion. This is a recurring state-sync issue (same pattern as the state corruption fix noted earlier in the session).
- **Architecture sync debt:** LEGACY_TIER_MAP and VERIFICATION_TAG_PATTERN must be kept in sync manually. The `black-box` regex omission in 16-5 round 2 is a direct consequence. No compile-time or test-time enforcement exists.
- **Brittle test pattern:** 34 dispatch tests in 16-5 are string-matching against markdown content. Any markdown rewording will break them.

## 6. Lessons Learned

### Patterns to Repeat
1. **Two-story review-to-done batches** work well for test-provable tier — fast, focused, low overhead
2. **Session issues log** as retro input is highly effective — subagent token reports give granular cost visibility
3. **Test-provable classification** is saving significant time by avoiding Docker for stories that don't need it

### Patterns to Avoid
1. **Stale vocabulary scanning** should be a checklist item in code review, not something caught only on re-review. When renaming concepts (e.g., tier names), a project-wide grep for old names should be mandatory in round 1.
2. **Large markdown files** (harness-run.md) cause repeated partial reads. Consider sharding or adding section markers that allow targeted reads.
3. **Manual sync between types.ts and parser.ts** is error-prone. Need either a single source of truth or a test that validates consistency.

## 7. Action Items

| # | Action | Priority | Owner |
|---|--------|----------|-------|
| 1 | Add a unit test that validates LEGACY_TIER_MAP keys match VERIFICATION_TAG_PATTERN regex alternatives | HIGH | Next sprint |
| 2 | Add "stale vocabulary grep" step to code-review workflow (grep old tier names after any rename story) | MEDIUM | Process improvement |
| 3 | Consider sharding harness-run.md into smaller section files to reduce repeated partial reads | MEDIUM | Tech debt backlog |
| 4 | Update sprint-status.yaml sync — stories 16-5 and 16-6 should reflect done status | HIGH | Orchestrator fix |
| 5 | Replace string-matching dispatch tests with structured assertion (parse sections, check keys) | LOW | Tech debt backlog |
| 6 | Complete Epic 16 remaining stories: 16-7 (knowledge/enforcement docs) and 16-8 (update all tests) | HIGH | Next session |

---

# Session Retrospective — 2026-03-27 Session 8

**Sprint:** Epic 16 — Verification Tier Rework (continued)
**Stories completed this session:** 16-7-update-knowledge-and-enforcement-docs (backlog -> done, full pipeline)
**State fixes:** 16-5 and 16-6 restored to `done` (both had ALL_PASS proofs but sprint-state.json showed `review`)

---

## 1. Session Summary

One story was executed end-to-end through all four pipeline phases (create-story, dev, code-review, verify) and one state corruption fix was applied.

| Story | Outcome | ACs | Pipeline Phases |
|-------|---------|-----|-----------------|
| 16-7-update-knowledge-and-enforcement-docs | ALL_PASS 12/12 | 12 | create -> dev -> review -> verify |
| 16-5 state fix | Restored to `done` | n/a | Manual state correction |
| 16-6 state fix | Restored to `done` | n/a | Manual state correction |

**Epic 16 status:** 7 of 8 stories done. Only 16-8-update-all-tests remains in backlog.

---

## 2. Issues Analysis

### Category: State Corruption (RECURRING)

Stories 16-5 and 16-6 were verified ALL_PASS in earlier sessions (sessions 6-7) with commits confirming completion, but sprint-state.json reverted them to `review`. This is the same root cause identified in the session 1 retro: ralph state reconciliation overwrites committed state between sessions. This has now happened twice in one day across different session boundaries.

**Impact:** Wasted orchestrator time detecting and fixing state drift. No code lost, but incorrect sprint status creates confusion and blocks downstream planning.

### Category: Template/Enforcement Mismatch

- **CODEHARNESS-PATCH in story files says "verified with real-world evidence via docker exec" even for test-provable stories.** The harness template is not tier-aware — it stamps the same Docker-oriented proof language regardless of verification tier. Found during code review of 16-7.
- **`patches/review/enforcement.md` mandates `docker exec` for ALL proofs.** This directly contradicts the tier system introduced in Epic 16. Story 16-7 updated these docs, but the template itself still needs fixing.

### Category: Pre-existing Test Failures

- **6 BATS tests fail independently of story changes** (`all_tasks_complete`, `get_current_task`). Reported during 16-7 dev phase. These have been pre-existing across multiple sessions and are not caused by any Epic 16 work.

### Category: Naming Ambiguity

- **`unit-testable` as prose vs. tier name.** The phrase "functions are unit-testable" appeared in enforcement docs after rewrite, creating ambiguity with the `unit-testable` tier name. Dev agent caught and fixed this by rewording to "functions have test coverage."

### Category: Missing Epic File

- **No dedicated epics file for Epic 16.** All story creation phases had to use the tech spec as the authoritative source. This is a process gap — every other epic had a proper epics file. Reported consistently across 16-2 through 16-7.

---

## 3. Cost Analysis

### Cumulative Project Costs (all epics, all time)

| Metric | Value | Delta from Session 7 |
|--------|-------|---------------------|
| Total API-equivalent cost | $614.74 | +$58.68 |
| Total API calls | 4,563 | +465 |
| Average cost per story | $3.30 | +$0.05 |
| Stories tracked | 152 | +12 |

**Session 8 estimated spend: ~$58.68** across 465 API calls.

### Token Breakdown (cumulative)

| Type | Cost | % |
|------|------|---|
| Cache reads | $382.26 | 62% |
| Cache writes | $137.70 | 22% |
| Output | $94.61 | 15% |
| Input | $0.17 | 0% |

Cache reads remain the dominant cost driver. The ratio is stable across sessions.

### Phase Breakdown (cumulative)

| Phase | Cost | % |
|-------|------|---|
| verify | $346.27 | 56.3% |
| orchestrator | $109.39 | 17.8% |
| retro | $59.31 | 9.6% |
| create-story | $36.01 | 5.9% |
| code-review | $34.00 | 5.5% |
| dev-story | $29.76 | 4.8% |

Verification phase continues to dominate at 56% of total spend. This session's story (16-7) was test-provable tier, so verification was cheaper than environment-provable stories.

### Subagent-Level Token Breakdown (Story 16-7 only)

| Phase | Tool Calls | Dominant Tools | Redundant Operations |
|-------|-----------|----------------|---------------------|
| create-story | 12 | Read: 8, Bash: 3 | None |
| dev | 22 | Grep: 10, Read: 8 | 1 redundant grep on patches/dev/enforcement.md |
| code-review | 24 | Read: 8, Bash: 7, Grep: 9 | None |
| verify | 25 | Grep: 13, Bash: 7 | 1 re-grep + 1 re-run of verify after proof format fix |
| **Total** | **83** | | **3 redundant operations** |

**Observations:**
- **Grep-heavy verify phase** (13 of 25 calls). All 12 ACs were file-content checks, so grep was appropriate. No wasted large Bash outputs.
- **Dev phase largest Bash outputs:** `npm test | tail -80` (~80 lines), `npx vitest run | tail -30` (~30 lines). Both appropriately bounded with `tail`.
- **No repeated file reads across phases.** Each phase read different files (create-story: 8, dev: 10, review: 9, verify: 4 unique files).
- **Clean pipeline:** Only 83 total tool calls for a 12-AC story through all 4 phases. This is efficient compared to 14-5 which used 190 calls for a 10-AC story.

### Most Expensive Story This Session

Story 16-7 is not in the top 10 most expensive stories — it was a documentation-focused story with no TypeScript code changes, making it one of the cheapest full-pipeline executions.

---

## 4. What Went Well

1. **Clean 4-phase pipeline execution.** 16-7 went from backlog to done in a single pass: create -> dev -> review -> verify. No rework loops, no stuck phases.
2. **Code review caught real bugs.** Three MEDIUM issues found and fixed: AC8 scoping, AC3 missing tier in test, missing file-existence guards. All fixed before verify.
3. **Efficient tool usage.** 83 total tool calls for 12 ACs through 4 phases with only 3 redundant operations.
4. **State corruption detected and fixed.** 16-5 and 16-6 were restored to correct `done` status, unblocking accurate sprint tracking.
5. **Dev agent self-corrected naming ambiguity.** Caught "unit-testable" prose vs. tier name collision and fixed proactively without needing review feedback.
6. **All 4015 tests passing, 0 regressions.** Build remained clean throughout.

---

## 5. What Went Wrong

1. **State corruption recurrence.** sprint-state.json reverted 16-5 and 16-6 from `done` to `review` between sessions. Same root cause as session 1. Not yet fixed at the infrastructure level.
2. **No Epic 16 epics file.** Every create-story phase wasted reads looking for a standard epics document before falling back to the tech spec. This has been flagged in 6 consecutive stories (16-2 through 16-7) without being addressed.
3. **Pre-existing BATS failures still unfixed.** 6 BATS tests continue to fail across all sessions. These create noise in every dev and verify phase output.
4. **Architecture concern left unresolved:** CODEHARNESS-PATCH template stamps Docker-oriented proof language on test-provable stories. The tier system is now in place but the templates have not been updated to reflect it.

---

## 6. Lessons Learned

### Patterns to Repeat
1. **Documentation-only stories are cheap and fast.** 16-7 was 83 tool calls for 12 ACs — roughly 40% of the cost of a typical code story. Batching doc updates into dedicated stories is efficient.
2. **File-content ACs with grep verification** is a proven pattern for documentation stories. All 12 ACs verified via grep without needing build/test cycles.
3. **Tail-bounded Bash outputs** (dev agent used `tail -80`, `tail -30`) prevent context blowup from test output.

### Patterns to Avoid
1. **Ignoring recurring state corruption.** Two incidents in one day. The ralph state reconciliation logic needs a fix, not just manual corrections.
2. **Missing standard artifacts** (no epics file for Epic 16) creates repeated friction across every story in the epic. Better to create the artifact once upfront.
3. **Leaving pre-existing test failures unfixed** adds noise to every session's dev and verify output.

---

## 7. Action Items

| # | Action | Priority | Owner |
|---|--------|----------|-------|
| 1 | Fix ralph state reconciliation to not overwrite `done` stories back to `review` | HIGH | Infrastructure |
| 2 | Create Epic 16 epics file from tech spec to stop fallback behavior in create-story | MEDIUM | Process |
| 3 | Fix 6 pre-existing BATS test failures (`all_tasks_complete`, `get_current_task`) | MEDIUM | Tech debt |
| 4 | Update CODEHARNESS-PATCH template to be tier-aware (remove Docker language for test-provable stories) | MEDIUM | Story 16-8 or tech debt |
| 5 | Complete Epic 16: story 16-8-update-all-tests is the only remaining story | HIGH | Next session |
| 6 | Address `allFiles()` recreating array per call (LOW from code review) | LOW | Tech debt backlog |
