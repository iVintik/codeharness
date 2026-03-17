# Exec Plan: 15-2 Verification-to-Dev Feedback Loop

## Summary

This story modifies `commands/harness-run.md` (a Claude Code slash command) to split verification failure handling into two distinct paths: code bugs vs infrastructure failures. Code bugs go back to dev with extracted findings; infra failures use the retry budget.

## Changes Made

### Step 1 (Pre-flight)
- Added `verify_dev_cycles = 0` tracking variable (per story, counts verify-to-dev round-trips)
- Added `max_verify_dev_cycles = 10` safety limit

### Step 2 (Find Next Actionable Story)
- Added `verify_dev_cycles = 0` to the per-story counter reset alongside `retry_count` and `cycle_count`

### Step 3b (Dev Story)
- Added pre-check: reads story file for `## Verification Findings` section before invoking dev-story subagent
- If findings exist, they are injected into the dev-story prompt with explicit instructions to fix the failing ACs
- Findings section is preserved in the story file for reference across cycles

### Step 3d-vii (Failure Handling — complete rewrite)
- **Path A (Code bugs):** When `pending > 0` in proof validation:
  1. Extract failing ACs from proof document
  2. Save findings to story file under `## Verification Findings`
  3. Check verify_dev_cycles limit (skip at 10)
  4. Set story status to `in-progress`
  5. Reset retry count to 0 in `ralph/.story_retries`
  6. Route to Step 3b (dev-story)
- **Path B (Infra failures):** When no proof produced, timeout, or docker error:
  1. Increment retry_count against budget
  2. Skip story at max_retries (go to Step 2, not halt)
  3. Retry from 3d-iv if budget remains

## Design Decisions

- Code bugs NEVER count against retry budget — only the verify_dev_cycles counter (max 10) limits them
- Infrastructure failures NEVER go back to dev — they retry or skip
- The old "halt sprint" path in 3d-vii is fully removed; both paths either continue or skip
- Verification findings persist in the story file across dev cycles for traceability
