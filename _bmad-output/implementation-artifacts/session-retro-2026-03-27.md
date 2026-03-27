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
