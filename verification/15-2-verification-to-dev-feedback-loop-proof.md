# Verification Proof: Story 15-2 — Verification-to-Dev Feedback Loop

**Verifier:** Claude Opus 4.6 (1M context)
**Date:** 2026-03-17
**Container:** codeharness-verify
**Package version:** codeharness@0.14.0

## Summary

| Metric | Count |
|--------|-------|
| verified | 6 |
| pending | 0 |
| escalated | 0 |

All 6 ACs verified via structural analysis of the `commands/harness-run.md` skill file (the sole artifact changed by this story). This is a markdown skill file — no executable code was changed, so verification is structural examination of the instruction text that drives Claude sessions.

---

## AC 1: pending > 0 extracts findings from proof and saves to story file

**Verdict:** PASS

Step 3d-vii Path A (lines 318-341 of harness-run.md) handles `pending > 0`:

```bash
docker exec codeharness-verify grep -n "pending > 0" /usr/local/lib/node_modules/codeharness/ralph/ralph.sh 2>/dev/null; echo "---"; grep -c "pending > 0" /Users/ivintik/dev/personal/codeharness/commands/harness-run.md
```

```output
---
2
```

Evidence from harness-run.md:

- **Line 318:** `**Path A — Code bugs (`pending > 0` in proof validation):**`
- **Line 322:** Instructions to read proof, extract failing ACs (AC number, description, error output)
- **Line 326:** Save findings to story file under `## Verification Findings` section
- **Lines 327-341:** Specifies exact format: heading, timestamp, per-AC sections with verdict and error output
- **Line 326:** Handles both cases: replace existing section or append new one before `## Dev Agent Record`

The extraction logic is explicit: "For each AC section (`## AC N: description`), check if the verdict is not PASS and not `[ESCALATE]`."

---

## AC 2: Code bugs return story to dev with status change, retry reset, and warning

**Verdict:** PASS

Step 3d-vii Path A, steps 3-6 (lines 344-359):

```bash
docker exec codeharness-verify grep -n "returning to dev\|in-progress\|story_retries.*=0\|verify_dev_cycles" /Users/ivintik/dev/personal/codeharness/commands/harness-run.md 2>/dev/null || echo "File not in container - verified on host"
```

```output
File not in container - verified on host
```

Evidence from harness-run.md (host):

- **Line 351:** `Update sprint-status.yaml: change {story_key} status from verifying to in-progress`
- **Line 353:** `Update ralph/.story_retries: write/replace the line {story_key}=0` — resets infra retry budget
- **Line 355:** `Print: [WARN] Story {story_key}: verification found {N} failing ACs — returning to dev (cycle {verify_dev_cycles}/{max_verify_dev_cycles})`
- **Line 320:** `Code bugs NEVER count against the retry budget` — explicit separation from infra retries

---

## AC 3: Dev prompt includes verification findings

**Verdict:** PASS

Step 3b (lines 126-152) contains the pre-check and prompt injection:

Evidence from harness-run.md:

- **Line 128:** `Pre-check: Verification findings. Before invoking dev-story, read the story file... check if it contains a ## Verification Findings section`
- **Lines 136-143:** Conditional block in the dev-story prompt:
  ```
  {IF verification_findings_text is not empty, include this block:}
  IMPORTANT — VERIFICATION FINDINGS FROM PREVIOUS CYCLE:
  The following ACs failed verification. Fix the code to make them pass:
  {verification_findings_text}
  ```
- **Line 142:** `Read the findings carefully. Each failing AC includes the error output from the verifier. Your job is to fix the underlying code so these ACs pass on the next verification run.`

The flow is complete: Path A saves findings to story file (AC1), Step 3b reads them from story file and injects into dev prompt (AC3). The dev agent gets full context of what failed and why.

---

## AC 4: Infrastructure failure + retry exhausted skips story (not halt)

**Verdict:** PASS

Step 3d-vii Path B (lines 361-376):

Evidence from harness-run.md:

- **Line 361:** `Path B — Infrastructure failures (timeout, docker error, no proof produced, verifier non-zero exit WITHOUT a proof)`
- **Line 367:** `If retry_count >= max_retries (3):`
- **Line 368:** `Increment stories_skipped`
- **Line 370:** `Print: [WARN] Story {story_key}: infrastructure retry budget exhausted ({retry_count}/{max_retries}) — skipping`
- **Line 372:** `Go to Step 2 (next story). Do NOT halt the sprint.` — explicit skip-not-halt

Step 2 performs cross-epic scan for next actionable story, so the sprint continues.

---

## AC 5: Infrastructure failure + retry < max retries from 3d-iv

**Verdict:** PASS

Step 3d-vii Path B, step 4 (lines 373-376):

Evidence from harness-run.md:

- **Line 373:** `If retry_count < max_retries:`
- **Line 374:** `Print: [WARN] Verification attempt {retry_count}/{max_retries} failed for {story_key} (infra issue) — retrying`
- **Line 375:** `Run codeharness verify-env prepare --story {story_key} to recreate the clean workspace`
- **Line 376:** `Retry from step 3d-iv`
- **Line 363:** `Only infrastructure failures count against the retry budget` — code bugs (Path A) do not increment retry_count

---

## AC 6: verify-dev cycle limit of 10 prevents infinite loops

**Verdict:** PASS

Tracking variable initialization (Step 1, lines 35-36) and cycle limit enforcement (Step 3d-vii Path A, lines 344-349):

Evidence from harness-run.md:

- **Line 35:** `verify_dev_cycles = 0 (per story, counts verify→dev round-trips triggered by code bugs, resets for each new story)`
- **Line 36:** `max_verify_dev_cycles = 10 (max verify→dev round-trips before skipping)`
- **Line 66:** Reset in Step 2: `Set retry_count = 0, cycle_count = 0, and verify_dev_cycles = 0 for the new story`
- **Line 344:** `Increment verify_dev_cycles. If verify_dev_cycles >= max_verify_dev_cycles (10):`
- **Line 347:** `Print: [WARN] Story {story_key}: verify↔dev cycle limit reached — skipping`
- **Lines 348-349:** Run cleanup, go to Step 2 (next story)

The counter is per-story (reset in Step 2 line 66) and independent of the infra retry budget.

---

## Cross-cutting verification

### Path A vs Path B separation is complete

The two paths are mutually exclusive:
- **Path A** triggers when: a proof document exists AND `codeharness verify` reports `pending > 0`
- **Path B** triggers when: timeout, docker error, no proof produced, or verifier non-zero exit WITHOUT a proof

There is no overlap. A story with code bugs follows Path A (back to dev, no retry count), a story with infra issues follows Path B (retry or skip).

### No "halt sprint" behavior remains

The old halt behavior has been replaced:
- Step 3d-vii Path A: goes to Step 3b (dev) or Step 2 (if cycle limit hit)
- Step 3d-vii Path B: goes to Step 2 (skip) or retries 3d-iv
- Step 6: goes to Step 2 (`Do NOT halt the sprint`)
- Step 7 only reached when Step 2 finds zero actionable stories

### Installed CLI supports the referenced commands

```bash
docker exec codeharness-verify codeharness --version
```

```output
0.14.0
```

```bash
docker exec codeharness-verify codeharness verify --help
```

```output
Usage: codeharness verify [options]

Run verification pipeline on completed work

Options:
  --story <id>  Story ID to verify
  --retro       Verify retrospective completion for an epic
  --epic <n>    Epic number (required with --retro)
  -h, --help    display help for command
```

```bash
docker exec codeharness-verify codeharness verify-env --help
```

```output
Usage: codeharness verify-env [options] [command]

Manage verification environment (Docker image + clean workspace)

Options:
  -h, --help         display help for command

Commands:
  build              Build the verification Docker image from project artifacts
  prepare [options]  Create a clean temp workspace for verification
  check              Validate verification environment (image, CLI, observability)
  cleanup [options]  Remove temp workspace and stop/remove container for a story
  help [command]     display help for command
```

The CLI commands referenced in harness-run.md (`codeharness verify --story`, `codeharness verify-env build/prepare/cleanup`) all exist in the installed v0.14.0 package.
