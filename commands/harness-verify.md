---
description: Verify a story's acceptance criteria with real-world evidence and produce a Showboat proof document.
---

# Harness Verify

Trigger verification for the current story or a specified story.

## Step 1: Identify Story

If a story ID is provided as argument, use it. Otherwise:

1. Check the current exec-plan in `docs/exec-plans/active/` for the story in progress
2. Check `ralph/progress.json` if running in Ralph loop
3. Ask the user: "Which story should I verify?"

## Step 2: Spawn Verifier Subagent

Launch the `verifier` subagent with the story context:

- Pass the story file (with acceptance criteria)
- Pass enforcement config from `.claude/codeharness.local.md`
- The verifier produces a proof document at `verification/{story-id}-proof.md`

## Step 3: Run Showboat Verify

After the proof document is created, run:

```bash
showboat verify verification/{story-id}-proof.md
```

This re-executes all `showboat exec` blocks and compares outputs to originals.
Must complete within 5 minutes for 10-15 steps (NFR3).

## Step 4: Report

If all ACs pass and showboat verify passes:
```
[OK] Verification passed: {story-id} ({pass_count}/{total_ac} ACs)
[OK] Showboat verify: reproducible

→ Story ready for completion
```

If any AC fails:
```
[FAIL] Verification failed: {story-id} ({pass_count}/{total_ac} ACs)

Failed ACs:
- AC{N}: {description} — {failure reason}

→ Fix the failing criteria and re-run /harness-verify
```

## Step 5: Update State

Update `.claude/codeharness.local.md`:
- Set `session_flags.verification_run: true`
- Append to `verification_log`: story ID, timestamp, result, iteration count
