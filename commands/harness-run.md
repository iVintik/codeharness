---
description: Start autonomous execution — run one sprint in the current session, iterating through stories using BMAD workflows.
---

# Harness Run — In-Session Sprint Execution

Execute stories autonomously in the current Claude Code session. Reads sprint-status.yaml, iterates through stories using BMAD workflows (create-story → dev-story → code-review → verify), and updates status after each story. This is the single source of sprint execution logic.

> **MANDATORY — Never skip or shortcut verification.**
> Process stories one at a time, in order. Verification (Step 3d) is the entire point of codeharness — it catches real bugs. If there are 50 stories at `verified`, verify them one by one. Each verification may surface issues that need fixing — that is the job. Never ask the user to batch-transition statuses, never propose "lighter" verification, never skip showboat proofs. If context window is a concern, that is why Ralph loop exists — each session handles a few stories, then a fresh session continues. Do not question, negotiate, or offer alternatives to the process defined below.

## Step 1: Pre-flight — Read Sprint Status

Read the sprint status file to understand current state.

1. Read `_bmad-output/implementation-artifacts/sprint-status.yaml` in full.
2. Parse the `development_status` section. Each entry is one of:
   - **Epic entry:** key matching `epic-N` (e.g., `epic-1`) — status is `backlog`, `in-progress`, or `done`
   - **Story entry:** key matching `N-M-slug` (e.g., `1-2-user-auth`) — status is `backlog`, `ready-for-dev`, `in-progress`, `review`, `verified`, or `done`
   - **Retrospective entry:** key matching `epic-N-retrospective` — status is `optional` or `done`
3. If the file doesn't exist or has no `development_status`, HALT:
   ```
   [FAIL] No sprint-status.yaml found. Run /sprint-planning first.
   ```

Initialize tracking variables (once, before the loop):
- `stories_completed = 0`
- `stories_failed = 0`
- `retry_count = 0` (per story, resets for each new story)
- `cycle_count = 0` (per story, counts dev↔review round-trips, resets for each new story)
- `max_retries = 3`
- `max_cycles = 5` (max dev↔review round-trips before halting)
- `start_time = current timestamp`

## Step 2: Find Current Epic and Next Story

Scan `development_status` entries **in order from top to bottom**:

1. **Find current epic:** The first `epic-N` entry where status is NOT `done`. If all epics are `done`, go to Step 7 (completion).

2. **Find next story in current epic:** Scan entries in file order. Take the first `N-M-slug` entry where:
   - `N` matches the current epic number
   - Status is NOT `done`
   - Story is **actionable** — meaning status is `backlog`, `ready-for-dev`, `in-progress`, or `review`
   - A `verified` story IS actionable (needs verification step 3d)
   - **BUT**: a `verified` story that already has a proof document with `escalated > 0` and `pending === 0` is **blocked**, not actionable — skip it

3. If no actionable stories remain in the current epic:
   - If all stories are `done` → go to Step 5 (epic completion)
   - If some stories are blocked (verified with escalations) but none are actionable:
     ```
     [INFO] Epic {N}: all remaining stories are blocked (escalated ACs) — skipping to next epic
     ```
     Advance to the next `epic-M` where `M > N` and repeat from step 1. Do NOT halt.
   - If truly no work remains across all epics → go to Step 7 (completion)

4. Print the plan:
   ```
   [INFO] Current epic: Epic {N}
   [INFO] Next story: {story_key} (status: {current_status})
   [INFO] Stories in epic: {done_count}/{total_count} done
   ```

## Subagent Issues Tracking

Every subagent (create-story, dev-story, code-review, verifier, retrospective) MUST end its response with a `## Session Issues` section. This section reports problems, workarounds, suboptimal outcomes, and observations — not just success/failure status.

**After each subagent returns**, extract the `## Session Issues` section from its response and append it to the session issues log file at `_bmad-output/implementation-artifacts/.session-issues.md`. Use the following format:

```markdown
### {story_key} — {step name} ({timestamp})

{extracted issues from subagent response}
```

If the subagent didn't include a Session Issues section, append:
```markdown
### {story_key} — {step name} ({timestamp})

No issues reported (subagent did not include Session Issues section — this itself is an issue).
```

Initialize the issues file at the start of the session (Step 1) by writing a header:
```markdown
# Session Issues Log — {date}
```

## Step 3: Execute Story Lifecycle

Based on the story's current status, determine which workflow(s) to run. Execute them in sequence, verifying status transitions after each.

### 3a: If status is `backlog` — Run Create Story

Invoke the create-story workflow via Agent tool to generate the story file:

```
Use the Agent tool with:
  prompt: "Run /create-story for story {story_key}. The sprint-status.yaml is at _bmad-output/implementation-artifacts/sprint-status.yaml. Auto-discover the next backlog story and create it. For each AC, append `<!-- verification: cli-verifiable -->` or `<!-- verification: integration-required -->` based on whether the AC can be verified by running CLI commands in a subprocess. ACs referencing workflows, sprint planning, user sessions, or external system interactions should be tagged as integration-required. Do NOT ask the user any questions — proceed autonomously. Do NOT run git commit. Do NOT run git add. Do NOT modify sprint-status.yaml.

MANDATORY — End your response with a `## Session Issues` section listing:
- Problems encountered (errors, ambiguities in epic definition, missing context)
- Workarounds applied (anything you did that felt hacky or suboptimal)
- Risks identified (ACs that seem untestable, unclear requirements, missing dependencies)
- Observations (anything surprising or noteworthy about this story)
If nothing to report, write `## Session Issues\n\nNone.`"
  subagent_type: "general-purpose"
```

After the Agent completes:
1. Re-read `sprint-status.yaml`
2. Verify the story status changed from `backlog` to `ready-for-dev`
3. If status didn't change, increment retry_count and retry this step (up to max_retries)
4. Print: `[OK] Story {story_key}: backlog → ready-for-dev`

### 3b: If status is `ready-for-dev` or `in-progress` — Run Dev Story

Invoke the dev-story workflow via Agent tool to implement the story:

```
Use the Agent tool with:
  prompt: "Run /bmad-dev-story for the story at _bmad-output/implementation-artifacts/{story_key}.md — implement all tasks, write tests, and mark the story for review. Do NOT ask the user any questions — proceed autonomously through all tasks until complete. Do NOT run git commit. Do NOT run git add. Do NOT modify sprint-status.yaml.

MANDATORY — End your response with a `## Session Issues` section listing:
- Problems encountered (build failures, test failures, unclear task specs, missing APIs)
- Workarounds applied (anything hacky, copied patterns that felt wrong, TODOs left behind)
- Code quality concerns (areas that need refactoring, edge cases not handled, tech debt added)
- Observations (unexpected complexity, architectural mismatches, dependency issues)
If nothing to report, write `## Session Issues\n\nNone.`"
  subagent_type: "general-purpose"
```

After the Agent completes:
1. Re-read `sprint-status.yaml`
2. Verify the story status changed to `review`
3. If status is still `in-progress` or `ready-for-dev`, this may indicate failure — increment retry_count
4. If retry_count >= max_retries, go to Step 6 (failure handling)
5. If status didn't reach `review`, retry this step
6. Print: `[OK] Story {story_key}: → review`

### 3c: If status is `review` — Run Code Review

Invoke the code-review workflow via Agent tool:

```
Use the Agent tool with:
  prompt: "Run /bmad-code-review for the story at _bmad-output/implementation-artifacts/{story_key}.md — perform adversarial review, fix all HIGH and MEDIUM issues found. After fixing, run `codeharness coverage --min-file 80` and ensure all files pass the per-file floor and the overall 90% target. Update the story status to `verified` when all issues are fixed and coverage passes. Do NOT ask the user any questions — proceed autonomously. Do NOT run git commit. Do NOT run git add. Do NOT modify sprint-status.yaml.

MANDATORY — End your response with a `## Session Issues` section listing:
- Bugs found and their severity (HIGH/MEDIUM/LOW with brief description)
- Code quality issues found but NOT fixed (LOW priority items, tech debt)
- Coverage gaps (files below floor, untested edge cases, areas needing integration tests)
- Architecture concerns (patterns that don't fit, coupling issues, missing abstractions)
- Items sent back for re-development (what failed and why)
If nothing to report, write `## Session Issues\n\nNone.`"
  subagent_type: "general-purpose"
```

After the Agent completes:
1. Re-read `sprint-status.yaml`
2. Check the story status:
   - If `verified` → Code review passed and coverage verified. Print `[OK] Story {story_key}: review → verified`. Go to Step 3d.
   - If `in-progress` → Code review found issues and sent story back for fixes. Increment cycle_count. If cycle_count >= max_cycles, go to Step 6 (failure — stuck in dev↔review loop). Print `[WARN] Story {story_key}: review → in-progress (issues found, re-developing, cycle {cycle_count}/{max_cycles})`. Go to Step 3b to re-run dev-story.
   - If still `review` → Code review may have failed silently. Increment retry_count. If retry_count >= max_retries, go to Step 6. Otherwise retry this step.

### 3d: If status is `verified` — Run Acceptance Verification

Verification produces a showboat proof document with real, executable evidence. This step runs tests, captures CLI output, and fixes any issues discovered.

**Pre-verification: Run tests and coverage in the main session first.**

```bash
npm run test:unit 2>&1
codeharness coverage 2>&1
```

If tests fail, fix them before proceeding. If coverage is below target, note it but continue.

**Spawn the verifier subagent:**

```
Use the Agent tool with:
  subagent_type: "codeharness:verifier"
  prompt: "Verify story {story_key}.

Story file: _bmad-output/implementation-artifacts/{story_key}.md
Proof output: verification/{story_key}-proof.md

Read the story file, extract all acceptance criteria, and produce a showboat proof document.

You MUST:
1. Run `showboat init` to create the proof document
2. For each AC, run real CLI commands via `showboat exec` to prove the AC is met
3. Every AC MUST have at least one `showboat exec bash \"...\"` block with a real CLI command
4. If ANY step fails — fix the underlying issue (code, tests, config), use `showboat pop` to remove the failed entry, then re-capture the passing result
5. Run a final `npm run test:unit` via `showboat exec` to confirm fixes haven't broken anything
6. Run `showboat verify` to confirm all evidence is reproducible

ESCALATION RULES — for ACs that cannot be verified in the current session:
- If an AC mentions 'sprint planning', 'workflow', 'run /command', 'user session', or references multi-system interaction, it is integration-required
- If an AC has a `<!-- verification: integration-required -->` tag, it is explicitly integration-required
- For integration-required ACs, write `[ESCALATE] Requires integration test — cannot verify in current session` in the proof section instead of attempting fake evidence
- Use `showboat exec bash \"echo '[ESCALATE] AC {N}: {reason}'\"` to formally record the escalation in the proof document
- NEVER fake evidence for integration-required ACs — that is the exact problem escalation solves

MANDATORY — `showboat exec` rules:
- Every AC MUST use `showboat exec` with real CLI commands (e.g., `codeharness verify ...`, `cat <file> | grep <expected>`, running the actual binary)
- Unit test output (`npm run test:unit`) is NEVER valid as PRIMARY AC evidence — it may be used as supplementary evidence only
- Each AC must prove the feature works from the user/consumer perspective, not just that tests pass

Valid evidence examples:
  - `showboat exec bash \"codeharness verify --story 4-1-test --json\"` → shows CLI output proving verification works
  - `showboat exec bash \"cat verification/4-1-test-proof.md | grep 'PASS'\"` → proves proof file has correct content
  - `showboat exec bash \"codeharness status --json | jq .stories\"` → shows real CLI output

Invalid evidence examples:
  - `showboat exec bash \"npm run test:unit\"` as the ONLY evidence for an AC
  - Hand-written markdown claiming evidence without a `showboat exec` block
  - Copy-pasting test output without running it through `showboat exec`

Do NOT write proof markdown by hand — use showboat CLI exclusively.
Do NOT skip tests — they are mandatory evidence.
Fix all failures found during verification.
Do NOT run git commit. Do NOT run git add. Do NOT modify sprint-status.yaml.

MANDATORY — End your response with a `## Session Issues` section listing:
- Verification failures discovered (code bugs, broken tests, missing functionality)
- Code fixes applied during verification (what was broken and how you fixed it)
- Escalated ACs and why they couldn't be verified (what would be needed to verify them)
- Evidence quality concerns (ACs with weak evidence, reproducibility issues)
- Showboat/tooling issues (CLI problems, format mismatches, sandbox restrictions)
If nothing to report, write `## Session Issues\n\nNone.`"
```

**After the verifier completes:**

1. Confirm the proof document exists: `verification/{story_key}-proof.md`
2. Parse the proof file to check AC quality — run `codeharness verify --story {story_key} --json` and check:
   - If `proofQuality.pending > 0` → re-spawn the verifier to fill in missing evidence (up to max_retries)
   - If `proofQuality.escalated > 0` → verifier correctly identified unverifiable ACs (do NOT re-spawn)
   - If `proofQuality.pending === 0` → proof quality passed, proceed
   - Do NOT trust the verifier agent's claim that all ACs are verified — the CLI must independently validate
3. Run `showboat verify verification/{story_key}-proof.md` in the main session to double-check reproducibility
4. If showboat verify fails:
   - Check if `proofQuality.pending === 0` (all ACs have evidence). If yes, the failure is due to non-deterministic output (test counts, timestamps, durations). Log the showboat diff as a **warning** but do NOT re-spawn the verifier — the structural proof quality is what matters:
     ```
     [WARN] showboat verify failed for {story_key} — non-deterministic output diff (proof quality OK, proceeding)
     ```
   - If `proofQuality.pending > 0`, the failure is real (missing evidence) — re-spawn the verifier (up to max_retries)
5. Run `codeharness verify --story {story_key}` to update state (this will also re-check proof quality)
6. If the verifier made code fixes, run `npm run build && npm run test:unit` to confirm everything still works
7. Handle escalated ACs separately from pending:
   - `pending > 0` means verifier failed to produce evidence → re-spawn verifier (up to max_retries)
   - `escalated > 0` means verifier correctly identified ACs that cannot be verified in the current session:
     - Print: `[WARN] Story {story_key} has {N} escalated ACs — story stays at verified`
     - Do NOT mark story as `done` — story stays at `verified` status
     - Do NOT re-spawn the verifier — escalation is the correct outcome
     - The story is **blocked** — Step 2 skip logic will advance past it
8. If no escalated ACs and `pending === 0`: Update sprint-status.yaml: change `{story_key}` status to `done`
9. Print: `[OK] Story {story_key}: verified → done`

**If verification reveals unfixable issues:**
1. The story status stays at `verified` (not done)
2. Increment retry_count
3. If retry_count >= max_retries, go to Step 6 (failure handling)
4. Otherwise, go to Step 3b to re-implement the failing parts

### 3e: Sync Beads Status

After the story reaches `done`, sync the status to beads (if initialized):

```bash
codeharness sync --story {story_key} --direction files-to-beads
```

If this fails, log a warning but continue — beads sync is not a blocking step:
```
[WARN] Beads sync failed for {story_key}: {error message}
```

### 3f: Commit Story Changes

After the story reaches `done`, commit all changes with a coherent message.

1. Stage all changes: `git add -A`
2. Commit with message: `feat: story {story_key} — {short title from story file}`
3. The commit must include source code, tests, story file, sprint-status.yaml, proof document, and any other changed files
4. If `git commit` fails (e.g., pre-commit hooks), log the error and continue — do not halt the sprint:
   ```
   [WARN] git commit failed for story {story_key}: {error message}
   ```

## Step 4: Story Complete — Continue or Finish Epic

A story just completed successfully.

1. Re-read `sprint-status.yaml` to get current state
2. Check if more stories remain in the current epic (any `N-M-slug` with status != `done` where N = current epic number)
3. If more stories remain:
   - Reset retry_count and cycle_count to 0
   - Go to Step 2 to pick the next story
4. If all stories in current epic are `done`:
   - Go to Step 5 (epic completion)

## Step 5: Epic Completion

All stories in the current epic are done.

1. Check if `epic-{N}-retrospective` entry exists and status is `optional`:
   - If yes, run the retrospective:
     ```
     Use the Agent tool with:
       prompt: "Run /retrospective for Epic {N}. All stories are complete. Review the epic's work, extract lessons learned, and produce the retrospective document. Do NOT ask the user any questions — proceed autonomously. Do NOT run git commit. Do NOT run git add. Do NOT modify sprint-status.yaml.

MANDATORY — End your response with a `## Session Issues` section listing:
- Epic-level problems (recurring patterns across stories, process breakdowns)
- Stories that were harder than expected and why
- Action items that need immediate attention vs. backlog
- Process improvements that should be encoded in tooling/config, not just documented
If nothing to report, write `## Session Issues\n\nNone.`"
       subagent_type: "general-purpose"
     ```
   - After retrospective completes:
     a. Update `epic-{N}-retrospective` status to `done` in sprint-status.yaml (use Edit tool — do NOT rely on the retro agent to do this)
     b. Verify the update was applied

2. Update `epic-{N}` status to `done` in sprint-status.yaml (use Edit tool)

3. Commit epic completion: `git add -A && git commit -m "feat: epic {N} complete"`
   - If `git commit` fails, log the error and continue:
     ```
     [WARN] git commit failed for epic {N}: {error message}
     ```

4. Print:
   ```
   [OK] Epic {N}: DONE (all stories complete, retrospective run)
   ```

5. Check if more epics remain (any `epic-M` with status != `done` where M > N):
   - If yes, go to Step 2 to start the next epic
   - If no, go to Step 7 (sprint complete)

## Step 6: Failure Handling

A story has exceeded max_retries (3 stagnation retries) or max_cycles (5 dev↔review round-trips).

1. Increment stories_failed
2. Print:
   ```
   [FAIL] Story {story_key}: exceeded {max_retries} retries
   [FAIL] Last status: {current_status}
   [FAIL] Halting sprint execution
   ```
3. Go to Step 7 (summary)

## Step 7: Sprint Execution Summary

Print the final summary:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Harness Run — Sprint Execution Complete

Stories completed: {stories_completed}
Stories failed:    {stories_failed}
Stories remaining: {remaining_count}
Elapsed time:     {elapsed since start_time}

Epic status:
{for each epic: "  Epic {N}: {status}"}

Result: {ALL_DONE | HALTED_ON_FAILURE | NO_WORK}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

If all epics are done:
```
All sprint work complete. Consider running /sprint-planning for the next sprint.
```

If halted on failure:
```
Sprint halted. Review the failing story and fix manually, then re-run /harness-run to continue.
```

## Step 8: Session Retrospective (Mandatory)

**This step runs at the end of EVERY session — regardless of whether work succeeded, failed, or stalled.** After printing the summary in Step 7, ALWAYS run the retrospective before the session ends.

**Time awareness:** Ralph passes your time budget and start time in the system prompt (e.g. "Time budget: 30 minutes, started: 2026-03-16T08:00:00Z"). Use this to manage your time:
- **Before starting a new story or verification step**, check elapsed time. If less than 10 minutes remain, skip to Step 7 → Step 8.
- **Reserve the last 5 minutes** for the session retrospective (Step 8). The retro is more valuable than starting work you can't finish.
- A session that completes one story with a good retro is better than a session that starts two stories and gets killed before writing either.

Invoke the BMAD retrospective workflow:

```
Use the Agent tool with:
  prompt: "Run /retrospective for the current sprint session.

Sprint status: _bmad-output/implementation-artifacts/sprint-status.yaml
Session issues log: _bmad-output/implementation-artifacts/.session-issues.md

CRITICAL: Read the session issues log FIRST. This file contains real problems, workarounds, bugs, and observations reported by every subagent that ran this session. These are the raw materials for your retrospective — do not ignore them.

Produce a retrospective that covers:
1. **Session summary** — which stories were attempted, their outcomes, time spent
2. **Issues analysis** — categorize and analyze all issues from the session log:
   - Bugs discovered during implementation or verification
   - Workarounds applied (tech debt introduced this session)
   - Code quality concerns raised by reviewers
   - Verification gaps (escalated ACs, weak evidence)
   - Tooling/infrastructure problems (sandbox, permissions, CLI issues)
3. **What went well** — stories completed, bugs fixed, process improvements
4. **What went wrong** — failures, blockers, stuck stories, wasted iterations
5. **Lessons learned** — patterns to repeat or avoid
6. **Action items** — concrete next steps, split into:
   - Fix now (before next session)
   - Fix soon (next sprint)
   - Backlog (track but not urgent)

Write the retrospective to _bmad-output/implementation-artifacts/session-retro-{date}.md where {date} is today's date in YYYY-MM-DD format.

If a session retro for today already exists, append to it with a `---` separator and timestamp.

Do NOT ask the user any questions — proceed autonomously.
Do NOT run git commit. Do NOT run git add. Do NOT modify sprint-status.yaml."
  subagent_type: "general-purpose"
```

Print:
```
[OK] Session retrospective complete
```

If the retrospective agent fails, log the warning but do NOT halt — the session is ending anyway:
```
[WARN] Session retrospective failed: {error}
```
