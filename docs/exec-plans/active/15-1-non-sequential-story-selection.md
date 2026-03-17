# Exec Plan: 15-1 Non-Sequential Story Selection

## Summary

Rewrote `commands/harness-run.md` (a Claude Code slash command / skill file) to select stories by readiness across all epics instead of processing epics sequentially. A single stuck story in an early epic no longer blocks work in later epics.

## Changes Made

### Step 1 (Pre-flight)
- Added `stories_skipped = 0` and `skipped_reasons = []` tracking variables

### Step 2 (Complete Rewrite)
- **Before:** Find first non-done epic, then find first actionable story within that epic
- **After:** Scan ALL stories across ALL epics, filter out non-actionable (done, retry-exhausted, blocked/escalated), then prioritize into 4 tiers:
  - Tier A: Proof exists, needs validation (quick wins)
  - Tier B: In-progress or review (resume work)
  - Tier C: Verifying without proof (full Docker verification)
  - Tier D: Backlog/ready-for-dev (new work)
- Added retry-exhausted check: reads `ralph/.story_retries`, skips stories with count >= max_retries
- Preserved blocked-story skip logic (escalated > 0, pending === 0)
- Empty actionable list goes to Step 7 with `NO_WORK` (not HALT)

### Step 4 (Story Complete)
- **Before:** Check only current epic for more stories, then advance to next epic
- **After:** Check if parent epic is fully done (triggers Step 5 if so), then always return to Step 2 for cross-epic scan

### Step 5 (Epic Completion)
- Changed final step from "check if more epics remain" to "return to Step 2 for cross-epic scan"

### Step 6 (Failure Handling)
- **Before:** Halt sprint execution on failure
- **After:** Skip story, persist retry state to `ralph/.story_retries`, return to Step 2 for next actionable story. Sprint only ends when Step 2 finds zero actionable stories.

### Step 7 (Summary)
- Added `stories_skipped` counter and skipped stories list with reasons
- Removed `HALTED_ON_FAILURE` result — replaced with `NO_WORK`
- Updated messaging for NO_WORK case

## Files Modified
- `commands/harness-run.md`
- `_bmad-output/implementation-artifacts/15-1-non-sequential-story-selection.md`
