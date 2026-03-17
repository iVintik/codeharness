# Sprint Change Proposal — 2026-03-17

**Status:** PROPOSED
**Scope:** Major — changes to harness-run skill, sprint-status.yaml, and sprint execution workflow
**Priority:** CRITICAL — sprint is halted without these changes
**Triggered by:** Session retro 2026-03-17 — verification pipeline structural failures

---

## Section 1: Issue Summary

### Problem Statement

The sprint is **completely halted**. Ralph has zero reachable stories. Three structural design flaws in the verification pipeline prevent forward progress on 46 stories sitting at `verifying`:

1. **Sequential epic ordering** — harness-run processes epics in file order (0→1→2→3...). Story 2-1 is retry-exhausted in Epic 2, blocking all 40+ stories in Epics 3-11 even though they are independent.

2. **No `verifying` → `in-progress` transition** — when verification reveals that code changes are needed (2-1 needs AC5/AC6 fixes), there is no mechanism to send the story back for dev work. It gets stuck in a retry loop forever.

3. **Retry-exhausted stories with no escape** — stories 0-1, 13-3, and 2-1 have exhausted retries across sessions. `.story_retries` has format corruption (mixed delimiters). No reset mechanism exists for stories where fixes have been applied.

### Evidence

- **9/62 stories done** after 8 ralph iterations (~3+ hours wall time, ~$6+ API cost)
- **5 of 8 iterations wasted** on stories that were never going to pass
- **3 stories retry-exhausted**: 0-1 (3/3), 2-1 (4/3), 13-3 (4/3, flagged)
- **46 stories at `verifying`** with zero reachable by current algorithm
- **Estimated time to clear backlog at current throughput: ~60 hours**
- `.story_retries` corrupted: mixed `=` and space delimiters, duplicate entries

### Discovery Context

Identified across 3 session retros (2026-03-16 through 2026-03-17). Same action items raised 3 times, never executed. Each subsequent ralph run rediscovered the same problems at $2+/run.

---

## Section 2: Impact Analysis

### Epic Impact

| Epic | Status | Impact |
|------|--------|--------|
| Epic 0 | in-progress | 0-1 retry-exhausted. Markdown skill story — most ACs are integration-required. |
| Epic 1 | **done** | No impact. All 3 stories verified. |
| Epic 2 | in-progress | **BLOCKER.** 2-1 needs code fixes. 2-2, 2-3 have stale proofs. Blocks all downstream epics. |
| Epic 3-11 | in-progress | All stories at `verifying`. Unreachable due to sequential processing. Many are likely trivial to verify. |
| Epic 12 | done | No impact. |
| Epic 13 | in-progress | 13-3 blocked (escalated ACs). 13-1, 13-2, 13-4 done. |
| Epic 14 | backlog | Onboarding stories. Not yet started. |

### Artifact Impact

| Artifact | Change Needed |
|----------|--------------|
| `commands/harness-run.md` | **Major rewrite of Step 2** (story selection algorithm). Add retry-exhausted skip logic. Add `verifying` → `in-progress` transition in Step 3d. |
| `sprint-status.yaml` | Manual state fixes: 0-1 done, 2-1 back to in-progress. New epic 15 for the harness fixes. |
| `ralph/.story_retries` | Clean up format corruption. Reset counts for stories with applied fixes. |
| `src/templates/verify-prompt.ts` | Already fixed in v0.15.0 (claude in container, narrow escalation). |
| `templates/Dockerfile.verify` | Already fixed in v0.15.0 (claude CLI installed). |
| PRD | No change needed. FRs still valid. |
| Architecture | No change needed. These are skill-level fixes, not architectural. |

---

## Section 3: Recommended Approach

### Selected: Direct Adjustment (modify stories + add new epic)

**Rationale:** The fixes are all in the harness-run skill (markdown) and sprint-status.yaml (state). No architectural changes. No PRD changes. No rollback needed. The changes are:

1. A new **Epic 15** with 3 stories to fix the harness-run skill
2. Manual state corrections in sprint-status.yaml
3. Cleanup of `.story_retries`

**Effort estimate:** Low — all changes are to the harness-run.md skill file (markdown instructions, not code). 2-3 hours.

**Risk level:** Low — changes are additive (new skip logic) not destructive (removing existing logic).

**Timeline impact:** Unblocks the entire verification backlog. Should reduce estimated clearance time from ~60 hours to ~10-15 hours.

---

## Section 4: Detailed Change Proposals

### 4.1: harness-run.md — Step 2 (Story Selection)

**OLD:**
```
Scan development_status entries in order from top to bottom:

1. Find current epic: The first epic-N entry where status is NOT done.
2. Find next story in current epic: Scan entries in file order. Take the first N-M-slug entry where:
   - N matches the current epic number
   - Status is NOT done
   - Story is actionable
```

**NEW:**
```
Scan development_status entries to find the next actionable story:

1. Collect ALL stories across ALL epics (not just the first non-done epic).
2. Filter to actionable stories:
   - Status is backlog, ready-for-dev, in-progress, review, or verifying
   - NOT retry-exhausted (check ralph/.story_retries — if count >= max_retries, skip)
   - NOT blocked (verifying with escalated > 0 and pending === 0)
3. Prioritize (process in this order):
   a. Stories with existing proof documents that just need validation (quick wins)
   b. Stories at in-progress or review (resume interrupted work)
   c. Stories at verifying without proofs (need Docker verification)
   d. Stories at backlog or ready-for-dev (need create-story or dev-story)
4. Take the first story from the prioritized list.
5. Track which epic the story belongs to for status reporting.
```

**Rationale:** Sequential epic ordering was the #1 throughput blocker. This change processes stories by readiness across all epics, bypassing stuck stories in earlier epics.

### 4.2: harness-run.md — Step 3d (Verification as Find-and-Fix, Not Retry-Until-Exhausted)

**Core philosophy change:** Verification exists to find problems and fix them. When verification fails, the FIRST response should be "what's broken and how do we fix it?" — not "retry the same thing." Retries are only for transient failures (timeouts, infra glitches). Code bugs get sent back to dev immediately, on the first failure.

**OLD:**
```
3d-vii: Retry logic (on failure)
If retry failed:
   1. Increment retry_count
   2. If retry_count >= max_retries → halt sprint
   3. Otherwise retry from 3d-iv
```

**NEW:**
```
3d-vii: Handle verification result

If proof has pending > 0 (some ACs failed):
   - Read the proof document to extract what failed and why
   - Save the failure details to the story file under "## Verification Findings"
   - Update sprint-status.yaml: verifying → in-progress
   - Reset retry_count to 0 in ralph/.story_retries
   - Run cleanup (step 3d-viii)
   - Print: [WARN] Story {story_key}: verification found {N} failing ACs — returning to dev
   - Go to Step 3b (dev-story) with the verification findings appended to the prompt:
     "The following ACs failed verification. Fix the code to make them pass:
      {list of failing ACs with the verifier's error descriptions}"

If verification had an infrastructure failure (timeout, no proof produced, docker error):
   - Increment retry_count
   - If retry_count >= max_retries (3):
     - Print: [WARN] Story {story_key}: infra failures exhausted retries — skipping
     - Run cleanup, go to Step 2 for next story (do NOT halt)
   - Otherwise retry from 3d-iv

If proof has pending === 0 and escalated > 0:
   - Story is blocked (existing behavior — skip it)
```

**Rationale:** The distinction is between "verification found real bugs" (→ fix them) vs "verification infrastructure broke" (→ retry, then skip). Code bugs should NEVER exhaust retries — they always go back to dev. Only infra failures count against the retry budget.

### 4.3: harness-run.md — Step 6 (Failure Handling)

**OLD:**
```
Step 6: Failure Handling
1. Increment stories_failed
2. Print: [FAIL] Story {story_key}: exceeded {max_retries} retries
3. Go to Step 7 (summary)
```

**NEW:**
```
Step 6: Failure Handling
1. Increment stories_failed
2. Print: [WARN] Story {story_key}: skipped (retry-exhausted)
3. Go to Step 2 to pick the next actionable story
   - If Step 2 finds no more actionable stories → go to Step 7 (summary)
```

**Rationale:** A single failed story should not halt the entire sprint. Skip it and move on.

### 4.4: sprint-status.yaml — State Corrections

```yaml
# 0-1: Mark done — this is a markdown skill, ACs are integration-required.
# Proof exists with escalated=5, pending=0. That's the correct outcome.
0-1-sprint-execution-skill: done

# 2-1: Send back to in-progress — needs code fixes for AC5, AC6
2-1-dependency-auto-install-otlp-instrumentation: in-progress
```

### 4.5: ralph/.story_retries — Cleanup

**OLD (corrupted):**
```
13-3-black-box-verifier-agent 4
2-1-dependency-auto-install-otlp-instrumentation=4
0-1-sprint-execution-skill=3
0-1-sprint-execution-skill 1
```

**NEW (clean, reset fixed stories):**
```
13-3-black-box-verifier-agent=4
```

Reset 2-1 (going back for dev work) and 0-1 (marked done). Keep 13-3 (still blocked with escalations).

### 4.6: New Epic 15 — Verification Pipeline Fixes

Three stories to implement the harness-run changes:

| Story | Title | Scope |
|-------|-------|-------|
| 15-1 | Non-sequential story selection | Rewrite Step 2 of harness-run.md with cross-epic prioritized selection |
| 15-2 | Verification-to-dev feedback loop | Add verifying → in-progress transition in Step 3d-vii, change Step 6 to skip-not-halt |
| 15-3 | Retry state management | Fix .story_retries format (standardize on `=` delimiter), add `codeharness retry --reset [--story key]` CLI command |

---

## Section 5: Implementation Handoff

### Change Scope: Minor

All changes are to the harness-run.md skill file (markdown) and sprint-status.yaml (YAML). No TypeScript code changes required for stories 15-1 and 15-2. Story 15-3 has a small CLI addition.

### Handoff

| Action | Owner | Priority |
|--------|-------|----------|
| Apply state corrections (4.4, 4.5) | SM (now) | Immediate — do before next ralph run |
| Add Epic 15 to sprint-status.yaml | SM (now) | Immediate |
| Implement 15-1 (story selection) | Dev | First priority — highest impact |
| Implement 15-2 (verify→dev loop) | Dev | Second priority |
| Implement 15-3 (retry management) | Dev | Third priority |

### Success Criteria

1. Ralph can process stories from any epic, not just the first non-done one
2. Stories needing code fixes automatically return to `in-progress`
3. Retry-exhausted stories are skipped, not halted
4. `.story_retries` uses consistent format and can be reset per-story
5. After implementing all 3 stories, ralph can clear the 46-story verification backlog without manual intervention

---

## Execution Order

**Epic 15 must be completed BEFORE resuming verification.** The current verification pipeline is broken — running it without these fixes will produce zero-progress sessions at $2+ each.

Sequence:
1. Apply manual state fixes (immediate, no code)
2. Implement 15-1, 15-2, 15-3 (dev work)
3. Reset retry counts
4. Resume /harness-run for verification backlog clearance
