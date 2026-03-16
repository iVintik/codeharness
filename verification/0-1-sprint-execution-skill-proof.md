# Verification Proof: 0-1-sprint-execution-skill

*2026-03-16T04:32:43Z by Showboat 0.6.1*
<!-- showboat-id: a607cbe1-4e68-4920-83cb-4c77b7301e86 -->

## Story: Sprint Execution Skill — Autonomous In-Session Loop

Acceptance Criteria:
1. Given sprint-status.yaml with backlog stories, /harness-run reads it to find current epic and next backlog story
2. Given next story identified, skill invokes create-story, dev-story, code-review via Agent tool with proper status transitions
3. Given story completes, skill proceeds to next story automatically
4. Given all stories in epic done, skill runs retrospective and proceeds to next epic
5. Given failure, skill retries (max 3) then halts with status report
6. Given completion/halt, sprint-status.yaml reflects current state and summary is printed

NOTE: This story produces a markdown command file (commands/harness-run.md), not executable code. All ACs describe runtime behavior requiring a live Claude Code session with Agent tool. Verification focuses on command file content inspection + escalation for integration-required behavior.

```bash
npm run test:unit 2>&1 | grep -E 'Test Files|Tests |passed'
```

```output
[2m Test Files [22m [1m[32m45 passed[39m[22m[90m (45)[39m
[2m      Tests [22m [1m[32m1437 passed[39m[22m[90m (1437)[39m
```

## AC1: Reads sprint-status.yaml to find current epic and next backlog story

```bash
test -f /Users/ivintik/dev/personal/codeharness/commands/harness-run.md && echo 'PASS: commands/harness-run.md exists' && head -3 /Users/ivintik/dev/personal/codeharness/commands/harness-run.md
```

```output
PASS: commands/harness-run.md exists
---
description: Start autonomous execution — run one sprint in the current session, iterating through stories using BMAD workflows.
---
```

```bash
grep -c 'sprint-status.yaml' /Users/ivintik/dev/personal/codeharness/commands/harness-run.md && echo 'references to sprint-status.yaml found'
```

```output
18
references to sprint-status.yaml found
```

```bash
grep -n 'Find current epic\|Find next story\|Step 1.*Pre-flight\|Step 2.*Find' /Users/ivintik/dev/personal/codeharness/commands/harness-run.md
```

```output
12:## Step 1: Pre-flight — Read Sprint Status
35:## Step 2: Find Current Epic and Next Story
39:1. **Find current epic:** The first `epic-N` entry where status is NOT `done`. If all epics are `done`, go to Step 7 (completion).
41:2. **Find next story in current epic:** Scan entries in file order. Take the first `N-M-slug` entry where:
```

```bash
grep -n 'development_status\|Epic entry\|Story entry\|Retrospective entry' /Users/ivintik/dev/personal/codeharness/commands/harness-run.md
```

```output
17:2. Parse the `development_status` section. Each entry is one of:
18:   - **Epic entry:** key matching `epic-N` (e.g., `epic-1`) — status is `backlog`, `in-progress`, or `done`
19:   - **Story entry:** key matching `N-M-slug` (e.g., `1-2-user-auth`) — status is `backlog`, `ready-for-dev`, `in-progress`, `review`, `verified`, or `done`
20:   - **Retrospective entry:** key matching `epic-N-retrospective` — status is `optional` or `done`
21:3. If the file doesn't exist or has no `development_status`, HALT:
37:Scan `development_status` entries **in order from top to bottom**:
```

## AC2: Story lifecycle orchestration via Agent tool (create-story, dev-story, code-review)

```bash
grep -c 'Agent tool with' /Users/ivintik/dev/personal/codeharness/commands/harness-run.md && grep -c 'subagent_type' /Users/ivintik/dev/personal/codeharness/commands/harness-run.md && echo 'Agent tool invocations and subagent_type declarations found'
```

```output
6
6
Agent tool invocations and subagent_type declarations found
```

```bash
grep -n 'Step 3.*Execute\|3a.*backlog.*Create\|3b.*ready-for-dev.*Dev\|3c.*review.*Code Review\|3d.*verified.*Verification\|3e.*Commit' /Users/ivintik/dev/personal/codeharness/commands/harness-run.md
```

```output
78:## Step 3: Execute Story Lifecycle
82:### 3a: If status is `backlog` — Run Create Story
105:### 3b: If status is `ready-for-dev` or `in-progress` — Run Dev Story
130:### 3c: If status is `review` — Run Code Review
155:### 3d: If status is `verified` — Run Acceptance Verification
252:### 3e: Commit Story Changes
```

```bash
echo '[ESCALATE] AC 2: Requires integration test — invoking create-story, dev-story, code-review via Agent tool needs a live Claude Code session. Command file contains 6 Agent tool invocations with subagent_type declarations across Steps 3a-3e (lines 82-262).'
```

```output
[ESCALATE] AC 2: Requires integration test — invoking create-story, dev-story, code-review via Agent tool needs a live Claude Code session. Command file contains 6 Agent tool invocations with subagent_type declarations across Steps 3a-3e (lines 82-262).
```

## AC3: Proceeds to next story automatically after completion

```bash
sed -n '264,275p' /Users/ivintik/dev/personal/codeharness/commands/harness-run.md
```

```output
## Step 4: Story Complete — Continue or Finish Epic

A story just completed successfully.

1. Re-read `sprint-status.yaml` to get current state
2. Check if more stories remain in the current epic (any `N-M-slug` with status != `done` where N = current epic number)
3. If more stories remain:
   - Reset retry_count and cycle_count to 0
   - Go to Step 2 to pick the next story
4. If all stories in current epic are `done`:
   - Go to Step 5 (epic completion)

```

```bash
echo '[ESCALATE] AC 3: Requires integration test — automatic story continuation needs multiple stories completing in a live sprint loop. Step 4 (lines 264-275) contains the continuation logic with retry/cycle reset and loop-back to Step 2.'
```

```output
[ESCALATE] AC 3: Requires integration test — automatic story continuation needs multiple stories completing in a live sprint loop. Step 4 (lines 264-275) contains the continuation logic with retry/cycle reset and loop-back to Step 2.
```

## AC4: Epic completion — runs retrospective and advances to next epic

```bash
grep -n 'Step 5\|retrospective\|epic.*done\|next epic\|more epics remain' /Users/ivintik/dev/personal/codeharness/commands/harness-run.md | grep -v 'prompt\|session\|MUST\|subagent\|Every\|If the retro'
```

```output
18:   - **Epic entry:** key matching `epic-N` (e.g., `epic-1`) — status is `backlog`, `in-progress`, or `done`
20:   - **Retrospective entry:** key matching `epic-N-retrospective` — status is `optional` or `done`
39:1. **Find current epic:** The first `epic-N` entry where status is NOT `done`. If all epics are `done`, go to Step 7 (completion).
45:3. If no actionable stories remain in the current epic, check if all stories are `done` → go to Step 5 (epic completion). Otherwise HALT with status report.
51:   [INFO] Stories in epic: {done_count}/{total_count} done
269:2. Check if more stories remain in the current epic (any `N-M-slug` with status != `done` where N = current epic number)
273:4. If all stories in current epic are `done`:
274:   - Go to Step 5 (epic completion)
276:## Step 5: Epic Completion
278:All stories in the current epic are done.
280:1. Check if `epic-{N}-retrospective` entry exists and status is `optional`:
281:   - If yes, run the retrospective:
294:   - After retrospective completes:
295:     a. Update `epic-{N}-retrospective` status to `done` in sprint-status.yaml (use Edit tool — do NOT rely on the retro agent to do this)
298:2. Update `epic-{N}` status to `done` in sprint-status.yaml (use Edit tool)
308:   [OK] Epic {N}: DONE (all stories complete, retrospective run)
311:5. Check if more epics remain (any `epic-M` with status != `done` where M > N):
312:   - If yes, go to Step 2 to start the next epic
348:If all epics are done:
367:Invoke the BMAD retrospective workflow:
378:Produce a retrospective that covers:
405:[OK] Session retrospective complete
410:[WARN] Session retrospective failed: {error}
```

```bash
echo '[ESCALATE] AC 4: Requires integration test — epic completion with retrospective needs all stories in an epic done within a live loop. Step 5 (lines 276-313) contains retrospective Agent invocation, epic status update, and next-epic advancement logic.'
```

```output
[ESCALATE] AC 4: Requires integration test — epic completion with retrospective needs all stories in an epic done within a live loop. Step 5 (lines 276-313) contains retrospective Agent invocation, epic status update, and next-epic advancement logic.
```

## AC5: Retry logic — max 3 attempts, then halt with status report

```bash
grep -n 'retry_count\|max_retries\|max_cycles\|Step 6' /Users/ivintik/dev/personal/codeharness/commands/harness-run.md | head -15
```

```output
29:- `retry_count = 0` (per story, resets for each new story)
31:- `max_retries = 3`
32:- `max_cycles = 5` (max dev↔review round-trips before halting)
102:3. If status didn't change, increment retry_count and retry this step (up to max_retries)
125:3. If status is still `in-progress` or `ready-for-dev`, this may indicate failure — increment retry_count
126:4. If retry_count >= max_retries, go to Step 6 (failure handling)
152:   - If `in-progress` → Code review found issues and sent story back for fixes. Increment cycle_count. If cycle_count >= max_cycles, go to Step 6 (failure — stuck in dev↔review loop). Print `[WARN] Story {story_key}: review → in-progress (issues found, re-developing, cycle {cycle_count}/{max_cycles})`. Go to Step 3b to re-run dev-story.
153:   - If still `review` → Code review may have failed silently. Increment retry_count. If retry_count >= max_retries, go to Step 6. Otherwise retry this step.
228:   - If `proofQuality.pending > 0` → re-spawn the verifier to fill in missing evidence (up to max_retries)
233:4. If showboat verify fails, re-spawn the verifier to fix the non-reproducible step (up to max_retries)
237:   - `pending > 0` means verifier failed to produce evidence → re-spawn verifier (up to max_retries)
248:2. Increment retry_count
249:3. If retry_count >= max_retries, go to Step 6 (failure handling)
271:   - Reset retry_count and cycle_count to 0
315:## Step 6: Failure Handling
```

```bash
sed -n '315,327p' /Users/ivintik/dev/personal/codeharness/commands/harness-run.md
```

```output
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

```

```bash
echo '[ESCALATE] AC 5: Requires integration test — retry execution needs Agent tool failures in a live session. Command file defines retry_count (line 29), max_retries=3 (line 31), max_cycles=5 (line 32), Step 6 halt logic (lines 315-327), and retry_count reset per story (line 271).'
```

```output
[ESCALATE] AC 5: Requires integration test — retry execution needs Agent tool failures in a live session. Command file defines retry_count (line 29), max_retries=3 (line 31), max_cycles=5 (line 32), Step 6 halt logic (lines 315-327), and retry_count reset per story (line 271).
```

## AC6: sprint-status.yaml reflects state, summary printed on completion/halt

```bash
sed -n '328,356p' /Users/ivintik/dev/personal/codeharness/commands/harness-run.md
```

````output
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
````

```bash
grep -n 'stories_completed\|stories_failed\|start_time\|ALL_DONE\|HALTED_ON_FAILURE\|NO_WORK' /Users/ivintik/dev/personal/codeharness/commands/harness-run.md
```

```output
27:- `stories_completed = 0`
28:- `stories_failed = 0`
33:- `start_time = current timestamp`
319:1. Increment stories_failed
336:Stories completed: {stories_completed}
337:Stories failed:    {stories_failed}
339:Elapsed time:     {elapsed since start_time}
344:Result: {ALL_DONE | HALTED_ON_FAILURE | NO_WORK}
```

```bash
echo '[ESCALATE] AC 6: Requires integration test — summary output and sprint-status.yaml persistence need a complete sprint loop. Step 7 (lines 328-356) defines the summary with 3 result states (ALL_DONE, HALTED_ON_FAILURE, NO_WORK) and tracking variables initialized in Step 1 (lines 27-33).'
```

```output
[ESCALATE] AC 6: Requires integration test — summary output and sprint-status.yaml persistence need a complete sprint loop. Step 7 (lines 328-356) defines the summary with 3 result states (ALL_DONE, HALTED_ON_FAILURE, NO_WORK) and tracking variables initialized in Step 1 (lines 27-33).
```

```bash
npm run test:unit 2>&1 | grep -E 'Test Files|Tests |passed'
```

```output
[2m Test Files [22m [1m[32m45 passed[39m[22m[90m (45)[39m
[2m      Tests [22m [1m[32m1437 passed[39m[22m[90m (1437)[39m
```

## Verdict: PASS

- Total ACs: 6
- Content verified: 6/6 — command file contains all required logic for every AC
- Escalated: 5 (ACs 2-6 require live Agent tool + BMAD workflow integration)
- AC1: PASS — sprint-status.yaml parsing logic with epic/story identification (Steps 1-2)
- AC2: ESCALATE — Agent tool invocations for create-story/dev-story/code-review present, needs live session
- AC3: ESCALATE — Story continuation logic present (Step 4), needs live loop
- AC4: ESCALATE — Epic completion + retrospective logic present (Step 5), needs live session
- AC5: ESCALATE — Retry logic present (max_retries=3, max_cycles=5, Step 6), needs live failures
- AC6: ESCALATE — Summary output logic present (Step 7, 3 result states), needs live execution
- Tests: 1437 passing (45 test files) — no regressions
- Note: This story produces a markdown command file (commands/harness-run.md), not executable code. All ACs describe orchestration behavior requiring Agent tool access in a live Claude Code session.
