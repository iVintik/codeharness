---
description: Start autonomous execution — run one sprint in the current session, iterating through stories using BMAD workflows.
---

# Harness Run — In-Session Sprint Execution

Execute stories autonomously in the current Claude Code session. Reads sprint-status.yaml, iterates through stories using BMAD workflows (create-story → dev-story → code-review → verify), and updates status after each story. This is the single source of sprint execution logic.

> **MANDATORY — Never skip or shortcut verification.**
> Process stories one at a time, in order. Verification (Step 3d) is the entire point of codeharness — it catches real bugs. If there are 50 stories at `verifying`, verify them one by one. Each verification may surface issues that need fixing — that is the job. Never ask the user to batch-transition statuses, never propose "lighter" verification, never skip showboat proofs. If context window is a concern, that is why Ralph loop exists — each session handles a few stories, then a fresh session continues. Do not question, negotiate, or offer alternatives to the process defined below.

## Step 1: Pre-flight — Read Sprint Status

Read the sprint status file to understand current state.

1. Read `_bmad-output/implementation-artifacts/sprint-status.yaml` in full.
2. Parse the `development_status` section. Each entry is one of:
   - **Epic entry:** key matching `epic-N` (e.g., `epic-1`) — status is `backlog`, `in-progress`, or `done`
   - **Story entry:** key matching `N-M-slug` (e.g., `1-2-user-auth`) — status is `backlog`, `ready-for-dev`, `in-progress`, `review`, `verifying`, or `done`
   - **Retrospective entry:** key matching `epic-N-retrospective` — status is `optional` or `done`
3. If the file doesn't exist or has no `development_status`, HALT:
   ```
   [FAIL] No sprint-status.yaml found. Run /sprint-planning first.
   ```

Initialize tracking variables (once, before the loop):
- `stories_completed = 0`
- `stories_failed = 0`
- `stories_skipped = 0`
- `skipped_reasons = []` (list of `{story_key}: {reason}` strings)
- `attempts = 0` (per story, resets for each new story — counts ALL retries: dev failures, review round-trips, verify→dev loops)
- `max_attempts = 10` (single limit for all retry types)
- `start_time = current timestamp`

## Step 2: Find Next Actionable Story (Cross-Epic Scan)

Scan ALL stories across ALL epics to find the highest-priority actionable story. Epic boundaries do not constrain selection.

1. **Collect all stories:** Gather every `N-M-slug` entry from `development_status`, regardless of which epic it belongs to.

2. **Filter out non-actionable stories.** Remove any story that matches ANY of these conditions:
   - Status is `done`
   - **Retry-exhausted:** Read `ralph/.story_retries`. If a line `{story_key}={count}` exists and `count >= max_attempts` (10), the story is retry-exhausted. Increment `stories_skipped`, append `{story_key}: retry-exhausted ({count}/{max_attempts})` to `skipped_reasons`, and print:
     ```
     [INFO] Skipping {story_key}: retry-exhausted ({count}/{max_attempts})
     ```
   - **Blocked (escalated):** A `verifying` story that already has a proof document (`verification/{story_key}-proof.md` exists) with `escalated > 0` and `pending === 0` is blocked. Increment `stories_skipped`, append `{story_key}: blocked (escalated ACs)` to `skipped_reasons`, and print:
     ```
     [INFO] Skipping {story_key}: blocked (escalated ACs)
     ```

3. **Prioritize remaining stories.** Sort actionable stories into priority tiers (process highest tier first, file order within each tier):
   - **Tier A — Proof exists, needs validation:** Status is `verifying` AND `verification/{story_key}-proof.md` exists (but story is not blocked per step 2). These are quick wins — just need validation.
   - **Tier B — In-progress or review:** Status is `in-progress` or `review`. Resume partially-completed work.
   - **Tier C — Verifying without proof:** Status is `verifying` AND no proof document exists. Needs full Docker verification.
   - **Tier D — Backlog/ready-for-dev:** Status is `backlog` or `ready-for-dev`. New work.

4. **Select the first story from the prioritized list.** If the list is empty (no actionable stories remain anywhere), go to Step 7 with result `NO_WORK`.

5. **Determine the story's parent epic** (epic number N from the story key `N-M-slug`).

6. **Reset per-story counter:** Set `attempts = 0` for the new story. (Note: if the story has persisted retry state in `ralph/.story_retries` that is below `max_attempts`, read that count and set `attempts` accordingly — this ensures retry budgets persist across sessions.)

7. Print the plan:
   ```
   [INFO] Next story: {story_key} (status: {current_status}, tier: {A|B|C|D})
   [INFO] Parent epic: Epic {N}
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
3. If status didn't change, increment attempts and retry this step (up to max_attempts)
4. Print: `[OK] Story {story_key}: backlog → ready-for-dev`

### 3b: If status is `ready-for-dev` or `in-progress` — Run Dev Story

**Pre-check: Verification findings.** Before invoking dev-story, read the story file at `_bmad-output/implementation-artifacts/{story_key}.md` and check if it contains a `## Verification Findings` section. If it does, extract the full content of that section (everything from `## Verification Findings` until the next `##` heading or end of file). Store this as `verification_findings_text`.

Invoke the dev-story workflow via Agent tool to implement the story:

```
Use the Agent tool with:
  prompt: "Run /bmad-dev-story for the story at _bmad-output/implementation-artifacts/{story_key}.md — implement all tasks, write tests, and mark the story for review. Do NOT ask the user any questions — proceed autonomously through all tasks until complete. Do NOT run git commit. Do NOT run git add. Do NOT modify sprint-status.yaml.

{IF verification_findings_text is not empty, include this block:}
IMPORTANT — VERIFICATION FINDINGS FROM PREVIOUS CYCLE:
The following ACs failed verification. Fix the code to make them pass:

{verification_findings_text}

Read the findings carefully. Each failing AC includes the error output from the verifier. Your job is to fix the underlying code so these ACs pass on the next verification run. Do NOT remove the ## Verification Findings section from the story file — it stays for reference.
{END IF block}

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
3. If status is still `in-progress` or `ready-for-dev`, this may indicate failure — increment attempts
4. If attempts >= max_attempts, go to Step 6 (failure handling)
5. If status didn't reach `review`, retry this step
6. Print: `[OK] Story {story_key}: → review`

### 3c: If status is `review` — Run Code Review

Invoke the code-review workflow via Agent tool:

```
Use the Agent tool with:
  prompt: "Run /bmad-code-review for the story at _bmad-output/implementation-artifacts/{story_key}.md — perform adversarial review, fix all HIGH and MEDIUM issues found. After fixing, run `codeharness coverage --min-file 80` and ensure all files pass the per-file floor and the overall 90% target. Update the story status to `verifying` when all issues are fixed and coverage passes. Do NOT ask the user any questions — proceed autonomously. Do NOT run git commit. Do NOT run git add. Do NOT modify sprint-status.yaml.

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
   - If `verifying` → Code review passed and coverage verified. Print `[OK] Story {story_key}: review → verifying`. Go to Step 3d.
   - If `in-progress` → Code review found issues and sent story back for fixes. Increment `attempts`. If `attempts >= max_attempts`, go to Step 6 (failure). Print `[WARN] Story {story_key}: review → in-progress (issues found, re-developing, attempt {attempts}/{max_attempts})`. Go to Step 3b to re-run dev-story.
   - If still `review` → Code review may have failed silently. Increment attempts. If attempts >= max_attempts, go to Step 6. Otherwise retry this step.

### 3d: If status is `verifying` — Run Verification

**Step 3d-0: Classify verification tier.**

Read the story file at `_bmad-output/implementation-artifacts/{story_key}.md`. Scan ALL acceptance criteria text for black-box keywords:

**Black-box keywords:** `docker exec`, `docker run`, `agent-browser`, `container`, `screenshot`, `observability`, `VictoriaLogs`, `VictoriaMetrics`, `OpenSearch`, `curl localhost`, `codeharness-verify`, `--print`

If ANY AC contains ANY black-box keyword → **black-box tier**. Otherwise → **unit-testable tier**.

Print the classification:
```
[INFO] Story {story_key}: verification tier = {unit-testable|black-box}
```

---

#### If unit-testable tier:

**Unit-testable verification** — verify via tests, file checks, and import validation. No Docker needed.

1. **Run tests:**
```bash
npm test 2>&1
```
If tests fail, treat as verification failure — return to dev with test output.

2. **Run build:**
```bash
npm run build 2>&1
```
If build fails, treat as verification failure.

3. **Check ACs directly:** For each AC in the story, verify programmatically:
   - "file exists" → check with `ls` or `stat`
   - "exports X" → check with `node -e "import('...').then(m => console.log(Object.keys(m)))"`
   - "returns Result<T>" → verified by tests passing (tests should cover this)
   - "no file exceeds N lines" → check with `wc -l`

4. **Generate proof document** at `verification/{story_key}-proof.md` with each AC result:
```markdown
## AC N: {description}

```bash
{command used to verify}
```

```output
{actual output}
```

**Verdict:** PASS|FAIL
```

5. **Validate proof** — run `codeharness verify --story {story_key}` to check proof quality.

6. If all ACs pass → update status to `done`. If any fail → return to dev with findings.


---

#### If black-box tier:

**Black-box verification** — full Docker container with no source code access.

**No internal timeout.** Verification takes as long as it takes. Ralph's iteration timeout is the safety net.

**Pre-verification: Read retry state from `ralph/.story_retries`.**

Read the file `ralph/.story_retries`. If the file contains a line matching `{story_key}={N}`, set `attempts = N`. If no matching line exists, set `attempts = 0`. This ensures retry budgets persist across sessions.

**Pre-verification: Check observability infrastructure.**

```bash
codeharness status --check-docker 2>&1
```

If the output indicates the observability stack is down:
```bash
codeharness stack start 2>&1
```

If `codeharness stack start` fails, log `[FAIL] Observability stack failed to start — cannot verify` and go to Step 6 (failure handling).

**Pre-verification: Build dist/.**

```bash
npm run build 2>&1
```

If the build fails, fix errors before proceeding. The Docker image needs current dist/.

**Verification flow — execute these steps sequentially:**

**3d-i: Build Docker verify image**

```bash
codeharness verify-env build 2>&1
```

If this fails:
```
[FAIL] verify-env build failed: {error}
```
Leave story at `verifying`, go to Step 6. No fallback.

**3d-ii: Start Docker container**

```bash
docker run -d --name codeharness-verify --network host \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  codeharness-verify sleep infinity
```

`--network host` allows the container to reach OTEL Collector at `localhost:4318`, VictoriaLogs at `:9428`, VictoriaMetrics at `:8428`, and VictoriaTraces at `:16686`. The `ANTHROPIC_API_KEY` env var enables the `claude` CLI inside the container for verifier sessions that need to spawn Claude subprocesses.

If `docker run` fails, log `[FAIL] docker run failed: {error}`, leave story at `verifying`, and go to Step 6. No cleanup needed — the container never started.

**3d-iii: Prepare clean workspace**

```bash
codeharness verify-env prepare --story {story_key} 2>&1
```

This creates `/tmp/codeharness-verify-{story_key}` with built artifacts, docs, and story file — but NO source code.

If this fails, log `[FAIL] verify-env prepare failed: {error}`, leave story at `verifying`, and go to cleanup (step 3d-viii) then Step 6. The container is running and must be cleaned up.

**3d-iv: Run verifier session**

Build the verification prompt and spawn the verifier:

1. Read the story content from `/tmp/codeharness-verify-{story_key}/story.md`
2. Read the prompt template from `src/templates/verify-prompt.ts` — use `verifyPromptTemplate()` with the story content, container name `codeharness-verify`, and default observability endpoints
3. Run the verifier:

```bash
cd /tmp/codeharness-verify-{story_key} && claude --print --max-budget-usd 5 --allowedTools Bash Read Write Glob Grep Edit -p "{verification_prompt}"
```

The prompt (from `src/templates/verify-prompt.ts`) instructs the verifier that:

- It has **NO source code access** — `src/` does not exist in the workspace
- **ALL CLI commands** must run via `docker exec codeharness-verify <command>`
- It should read `README.md` for usage guidance
- It should query observability endpoints from the host:
  - VictoriaLogs: `http://localhost:9428`
  - VictoriaMetrics: `http://localhost:8428`
  - VictoriaTraces: `http://localhost:16686`
- The proof document goes in `verification/{story_key}-proof.md` within the clean workspace
- REAL failures must be reported — never fabricate evidence
- ACs that cannot be verified should be marked `[ESCALATE]`

If the verifier process exits non-zero or times out, treat as failure (proceed to retry logic in step 3d-vii).

**3d-v: Copy proof document back**

```bash
cp /tmp/codeharness-verify-{story_key}/verification/{story_key}-proof.md verification/
```

If the proof file does not exist (verifier crashed or failed to produce one), treat as failure (step 3d-vii).

**3d-vi: Validate proof quality**

```bash
codeharness verify --story {story_key} 2>&1
```

Parse the output/exit code:

- If `pending === 0` and `escalated === 0` → proof quality passed. Update sprint-status.yaml: change `{story_key}` status to `done`. Print: `[OK] Story {story_key}: verifying → done`. Proceed to cleanup (step 3d-viii).
- If `escalated > 0` and `pending === 0` → verifier correctly identified unverifiable ACs. Story is **blocked**:
  - Print: `[WARN] Story {story_key} has {N} escalated ACs — story stays at verifying`
  - Do NOT mark story as `done` — it stays at `verifying`
  - Do NOT retry — escalation is the correct outcome
  - Step 2 skip logic will advance past blocked stories
  - Proceed to cleanup (step 3d-viii)
- If `pending > 0` → proof has gaps. Treat as failure (step 3d-vii).

If the verifier made code fixes (detected by checking `git diff` after verification), run:
```bash
npm run build && npm run test:unit
```
to confirm fixes haven't broken anything. Then proceed to cleanup (step 3d-viii).

**3d-vii: Failure handling — code bugs vs infrastructure failures**

Determine the failure type. There are two distinct paths:

**Path A — Code bugs (`pending > 0` in proof validation):**

A proof document exists and `codeharness verify` reported `pending > 0`. This means the feature has real bugs — the code does not satisfy the ACs. Code bugs NEVER count against the retry budget.

1. **Extract failing ACs from the proof document.** Read `verification/{story_key}-proof.md`. For each AC section (`## AC N: description`), check if the verdict is not PASS and not `[ESCALATE]`. For each failing AC, extract:
   - The AC number and description (from the `## AC N:` heading)
   - The error output (from the `output` code blocks and any verdict text)

2. **Save findings to the story file.** Read `_bmad-output/implementation-artifacts/{story_key}.md`. If it already has a `## Verification Findings` section, replace that section entirely with the new findings. If not, append a new `## Verification Findings` section before the `## Dev Agent Record` section (or at the end if that section doesn't exist). Format:
   ```markdown
   ## Verification Findings

   _Last updated: {timestamp}_

   The following ACs failed black-box verification:

   ### AC {N}: {description}
   **Verdict:** FAIL
   **Error output:**
   ```
   {relevant error output from proof}
   ```

   {repeat for each failing AC}
   ```

3. **Increment `attempts`.** If `attempts >= max_attempts` (10):
   - Increment `stories_skipped`
   - Append `{story_key}: verify↔dev cycle limit (10)` to `skipped_reasons`
   - Print: `[WARN] Story {story_key}: verify↔dev cycle limit reached — skipping`
   - Run cleanup (step 3d-viii)
   - Go to Step 2 (next story)

4. **Return story to dev.** Update sprint-status.yaml: change `{story_key}` status from `verifying` to `in-progress`.

5. **Reset retry count.** Update `ralph/.story_retries`: write/replace the line `{story_key}=0` in the file (read existing file first to preserve other entries). This resets the infra retry budget since the story is going back to dev.

6. Print: `[WARN] Story {story_key}: verification found {N} failing ACs — returning to dev (attempt {attempts}/{max_attempts})`

7. Run cleanup (step 3d-viii).

8. Go to Step 3b (dev-story) — the story is now `in-progress` and the dev prompt will include the verification findings.

**Path B — Infrastructure failures (timeout, docker error, no proof produced, verifier non-zero exit WITHOUT a proof):**

The verification could not complete due to infrastructure issues — NOT code quality. Only infrastructure failures count against the retry budget.

1. Increment `attempts`.
2. Update `ralph/.story_retries`: write/replace the line `{story_key}={attempts}` in the file. Read the existing file first to preserve other story entries.
3. If `attempts >= max_attempts` (3):
   - Increment `stories_skipped`
   - Append `{story_key}: infra-retry-exhausted ({attempts}/{max_attempts})` to `skipped_reasons`
   - Print: `[WARN] Story {story_key}: infrastructure retry budget exhausted ({attempts}/{max_attempts}) — skipping`
   - Run cleanup (step 3d-viii)
   - Go to Step 2 (next story). Do NOT halt the sprint.
4. If `attempts < max_attempts`:
   - Print: `[WARN] Verification attempt {attempts}/{max_attempts} failed for {story_key} (infra issue) — retrying`
   - Run `codeharness verify-env prepare --story {story_key}` to recreate the clean workspace (the container and image may be reused)
   - Retry from step 3d-iv

**3d-viii: Cleanup (unconditional — runs on both success and failure)**

```bash
codeharness verify-env cleanup --story {story_key} 2>&1
```

This removes the temp workspace at `/tmp/codeharness-verify-{story_key}` and stops/removes the Docker container. This step MUST run even if verification failed — leaked containers and temp directories accumulate.

If cleanup fails, log a warning but continue:
```
[WARN] verify-env cleanup failed for {story_key}: {error}
```

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

1. Increment `stories_completed`
2. Re-read `sprint-status.yaml` to get current state
3. Determine the story's parent epic (epic number N from the story key)
4. Check if all stories in epic N are `done` (every `N-M-slug` has status `done`):
   - If yes → go to Step 5 (epic completion). After Step 5, return to Step 2 for the next cross-epic scan.
   - If no → go directly to Step 2 for the next cross-epic scan (attempts will be reset there for the new story)

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

5. Return to Step 2 for the next cross-epic scan. Step 2 will determine if more actionable stories exist or if the sprint is complete.

## Step 6: Failure Handling

A story has exceeded max_attempts (10).

1. Increment `stories_failed`
2. Increment `stories_skipped`
3. Append `{story_key}: failed ({reason})` to `skipped_reasons` where reason is `retry-exhausted` or `max-cycles-exceeded`
4. Update `ralph/.story_retries`: write/replace the line `{story_key}={attempts}` in the file (read existing file first to preserve other entries). This persists the retry state so future sessions skip this story immediately via the retry-exhausted check in Step 2.
5. Print:
   ```
   [FAIL] Story {story_key}: exceeded {max_attempts} attempts
   [FAIL] Last status: {current_status}
   [INFO] Skipping story — continuing to next actionable story
   ```
6. Go to Step 2 to find the next actionable story. Do NOT halt the sprint. Step 2 will go to Step 7 only when zero actionable stories remain.

## Step 7: Sprint Execution Summary

Print the final summary:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Harness Run — Sprint Execution Complete

Stories completed: {stories_completed}
Stories failed:    {stories_failed}
Stories skipped:   {stories_skipped}
Stories remaining: {remaining_count (total non-done minus skipped)}
Elapsed time:     {elapsed since start_time}

Skipped stories:
{for each entry in skipped_reasons: "  - {story_key}: {reason}"}
{if skipped_reasons is empty: "  (none)"}

Epic status:
{for each epic: "  Epic {N}: {status}"}

Result: {ALL_DONE | NO_WORK}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Result meanings:
- `ALL_DONE` — every story across all epics has reached `done`
- `NO_WORK` — no actionable stories remain, but some are not `done` (blocked, retry-exhausted, or failed). The sprint is not halted — it simply has no more work it can do autonomously.

If all epics are done:
```
All sprint work complete. Consider running /sprint-planning for the next sprint.
```

If no actionable work remains:
```
No actionable stories remain. Skipped stories need manual intervention. Review the skipped list above, then re-run /harness-run after resolving blockers.
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
