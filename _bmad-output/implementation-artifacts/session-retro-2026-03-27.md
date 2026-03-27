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
