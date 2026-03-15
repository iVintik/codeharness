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

3. If no actionable stories remain in the current epic, check if all stories are `done` → go to Step 5 (epic completion). Otherwise HALT with status report.

4. Print the plan:
   ```
   [INFO] Current epic: Epic {N}
   [INFO] Next story: {story_key} (status: {current_status})
   [INFO] Stories in epic: {done_count}/{total_count} done
   ```

## Step 3: Execute Story Lifecycle

Based on the story's current status, determine which workflow(s) to run. Execute them in sequence, verifying status transitions after each.

### 3a: If status is `backlog` — Run Create Story

Invoke the create-story workflow via Agent tool to generate the story file:

```
Use the Agent tool with:
  prompt: "Run /create-story for story {story_key}. The sprint-status.yaml is at _bmad-output/implementation-artifacts/sprint-status.yaml. Auto-discover the next backlog story and create it. Do NOT ask the user any questions — proceed autonomously."
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
  prompt: "Run /bmad-dev-story for the story at _bmad-output/implementation-artifacts/{story_key}.md — implement all tasks, write tests, and mark the story for review. Do NOT ask the user any questions — proceed autonomously through all tasks until complete."
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
  prompt: "Run /bmad-code-review for the story at _bmad-output/implementation-artifacts/{story_key}.md — perform adversarial review, fix all HIGH and MEDIUM issues found. After fixing, run `codeharness coverage --min-file 80` and ensure all files pass the per-file floor and the overall 90% target. Update the story status to `verified` when all issues are fixed and coverage passes. Do NOT ask the user any questions — proceed autonomously."
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
2. Run `npm run test:unit` via `showboat exec` and capture output as evidence
3. For each AC, run real commands via `showboat exec` to prove the AC is met
4. If ANY step fails — fix the underlying issue (code, tests, config), use `showboat pop` to remove the failed entry, then re-capture the passing result
5. Run a final `npm run test:unit` via `showboat exec` to confirm fixes haven't broken anything
6. Run `showboat verify` to confirm all evidence is reproducible

Do NOT write proof markdown by hand — use showboat CLI exclusively.
Do NOT skip tests — they are mandatory evidence.
Fix all failures found during verification."
```

**After the verifier completes:**

1. Confirm the proof document exists: `verification/{story_key}-proof.md`
2. Run `showboat verify verification/{story_key}-proof.md` in the main session to double-check reproducibility
3. If showboat verify fails, re-spawn the verifier to fix the non-reproducible step (up to max_retries)
4. Run `codeharness verify --story {story_key}` to update state
5. If the verifier made code fixes, run `npm run build && npm run test:unit` to confirm everything still works
6. Update sprint-status.yaml: change `{story_key}` status to `done`
7. Print: `[OK] Story {story_key}: verified → done`

**If verification reveals unfixable issues:**
1. The story status stays at `verified` (not done)
2. Increment retry_count
3. If retry_count >= max_retries, go to Step 6 (failure handling)
4. Otherwise, go to Step 3b to re-implement the failing parts

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
       prompt: "Run /retrospective for Epic {N}. All stories are complete. Review the epic's work, extract lessons learned, and produce the retrospective document. Do NOT ask the user any questions — proceed autonomously."
       subagent_type: "general-purpose"
     ```
   - After retrospective completes, verify `epic-{N}-retrospective` status changed to `done`

2. Update `epic-{N}` status to `done` in sprint-status.yaml (use Edit tool)

3. Print:
   ```
   [OK] Epic {N}: DONE (all stories complete, retrospective run)
   ```

4. Check if more epics remain (any `epic-M` with status != `done` where M > N):
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
