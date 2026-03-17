# Verification Proof: 15-1-non-sequential-story-selection

**Story:** Non-Sequential Story Selection
**Verified by:** Black-box verifier (Claude Opus 4.6)
**Date:** 2026-03-17
**Container:** codeharness-verify

## Context

This story modifies `commands/harness-run.md` — a Claude Code slash command (markdown skill file). There is no executable code; the "logic" is natural-language instructions that Claude follows at runtime. Verification therefore checks:

1. The skill file contains correct instructions for each AC
2. The CLI pre-flight (`codeharness run`) correctly counts stories across all epics
3. No contradictory sequential logic remains in the codebase

## AC 1: Cross-epic scan, skip retry-exhausted stories

**Verdict:** PASS

**Evidence:**

Step 2 of `commands/harness-run.md` is titled "Find Next Actionable Story (Cross-Epic Scan)" and begins with:

> Scan ALL stories across ALL epics to find the highest-priority actionable story. Epic boundaries do not constrain selection.

Step 2.1 says: "Collect all stories: Gather every N-M-slug entry from development_status, regardless of which epic it belongs to."

Step 2.2 filters out retry-exhausted stories: "Read ralph/.story_retries. If a line {story_key}={count} exists and count >= max_retries (3), the story is retry-exhausted."

CLI pre-flight verification — ran `codeharness run --max-iterations 1 --json` with stories across 3 epics:

```bash
docker exec codeharness-verify bash -c 'cd /workspace && codeharness run --max-iterations 1 --timeout 5 --iteration-timeout 1 --json 2>&1 | head -1'
```

```output
{"status":"info","message":"Starting autonomous execution — 3 ready, 2 in progress, 2 verified, 2/9 done"}
```

Counts span all 3 epics correctly (total=9, done=2 from epic-1).

Retry state verified:

```bash
docker exec codeharness-verify bash -c 'cd /workspace && codeharness retry --status'
```

```output
Story                                  Retries  Flagged
───────────────────────────────────────────────────────
1-2-auth-signup                           3  no
2-1-dashboard-layout                      1  no
```

Story `1-2-auth-signup` at 3 retries (= max_retries) would be skipped by Step 2 instructions.

## AC 2: Priority tier ordering (A > B > C > D)

**Verdict:** PASS

**Evidence:**

Step 2.3 of the skill file defines four explicit priority tiers:

- **Tier A** — Proof exists, needs validation: Status is `verifying` AND proof file exists (not blocked)
- **Tier B** — In-progress or review: Resume partially-completed work
- **Tier C** — Verifying without proof: Needs full Docker verification
- **Tier D** — Backlog/ready-for-dev: New work

Step 2.4: "Select the first story from the prioritized list."

The ordering matches the AC exactly: (a) proof-exists needing validation, (b) in-progress/review, (c) verifying without proofs, (d) backlog/ready-for-dev.

## AC 3: Retry-exhausted info message, sprint not halted

**Verdict:** PASS

**Evidence:**

Step 2.2 specifies the exact message format:

> `[INFO] Skipping {story_key}: retry-exhausted ({count}/{max_retries})`

Step 6 explicitly says: "Go to Step 2 to find the next actionable story. Do NOT halt the sprint."

The old `HALTED_ON_FAILURE` result does not appear anywhere in the skill file. Searched with:

```bash
grep -c "HALTED_ON_FAILURE" /Users/ivintik/dev/personal/codeharness/commands/harness-run.md
```

```output
0
```

## AC 4: Blocked stories (escalated > 0, pending === 0) skipped

**Verdict:** PASS

**Evidence:**

Step 2.2 defines the blocked condition:

> **Blocked (escalated):** A `verifying` story that already has a proof document (`verification/{story_key}-proof.md` exists) with `escalated > 0` and `pending === 0` is blocked.

The info message is: `[INFO] Skipping {story_key}: blocked (escalated ACs)`

Step 3d-vi also handles this case during verification: "If escalated > 0 and pending === 0 -> verifier correctly identified unverifiable ACs. Story is blocked."

The skip logic in Step 2 will then advance past these stories in subsequent iterations.

## AC 5: NO_WORK result instead of HALTED_ON_FAILURE

**Verdict:** PASS

**Evidence:**

Step 2.4: "If the list is empty (no actionable stories remain anywhere), go to Step 7 with result NO_WORK."

Step 7 summary shows only two possible results:

> Result: {ALL_DONE | NO_WORK}

NO_WORK is defined as: "no actionable stories remain, but some are not done (blocked, retry-exhausted, or failed). The sprint is not halted — it simply has no more work it can do autonomously."

`HALTED_ON_FAILURE` does not appear in the file (zero matches).

## AC 6: Re-scan all epics after story completion

**Verdict:** PASS

**Evidence:**

Step 4 (Story Complete) routes to Step 2 in both branches:

- "If yes [all stories in epic done] -> go to Step 5 (epic completion). After Step 5, return to Step 2 for the next cross-epic scan."
- "If no -> go directly to Step 2 for the next cross-epic scan"

Step 5 (Epic Completion) ends with: "Return to Step 2 for the next cross-epic scan. Step 2 will determine if more actionable stories exist or if the sprint is complete."

Step 6 (Failure Handling) ends with: "Go to Step 2 to find the next actionable story. Do NOT halt the sprint."

All paths loop back to the cross-epic Step 2 scan.

## Additional Findings

### Minor: Stale description in ralph prompt template

The ralph prompt template (`src/templates/ralph-prompt.ts`, compiled into `dist/index.js`) still contains the old description: "Picks the first story with status NOT done". This is informational text in the high-level prompt to Claude and does not affect behavior because:

1. The prompt explicitly says "Do NOT implement your own task-picking logic. Let /harness-run handle it."
2. The actual story selection logic is entirely within the `/harness-run` skill file
3. Claude will follow the skill's detailed Step 2 instructions over the summary text

This is a documentation inconsistency, not a functional bug. Consider updating the prompt template for consistency.

## Summary

| AC | Verdict | Notes |
|----|---------|-------|
| 1  | PASS    | Cross-epic scan implemented, retry-exhausted check present |
| 2  | PASS    | Four priority tiers defined in correct order |
| 3  | PASS    | Info message format correct, sprint not halted |
| 4  | PASS    | Blocked skip condition preserved |
| 5  | PASS    | NO_WORK replaces HALTED_ON_FAILURE entirely |
| 6  | PASS    | All paths route back to Step 2 cross-epic scan |

**Overall verdict: PASS (6/6 ACs verified)**
