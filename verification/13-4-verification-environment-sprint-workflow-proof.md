# Verification Proof: 13-4-verification-environment-sprint-workflow

*2026-03-16T15:57:30Z by Showboat 0.6.1*
<!-- showboat-id: 2c84c37b-1da5-4249-a199-8cd3e5656632 -->

## Story: 13-4 Verification Workflow Integration

Acceptance Criteria:
1. AC1: Step 3d follows exact 8-step sequence (build, verify-env build, docker run, prepare, claude --print, copy proof, verify, cleanup)
2. AC2: No fallback to white-box — old Agent-based verifier removed, failure path says no fallback
3. AC3: Retry logic — retries up to max_retries (3), updates .story_retries after each attempt
4. AC4: Observability auto-start — checks codeharness status --check-docker, runs stack start if down
5. AC5: --network host on docker run command
6. AC6: 10-minute timeout for entire verification flow
7. AC7: .story_retries persistence across sessions (ralph/.story_retries)

Verification strategy: cli-direct (structural verification of skill file content).
All ACs are tagged integration-required — runtime orchestration needs Docker + Claude subprocess.
We verify structural correctness of the harness-run.md skill file.

```bash
npm run test:unit 2>&1 | tail -20
```

```output

> codeharness@0.13.2 test:unit
> vitest run


[1m[46m RUN [49m[22m [36mv4.1.0 [39m[90m/Users/ivintik/dev/personal/codeharness/src[39m

error: required option '--story <key>' not specified
error: required option '--story <key>' not specified

[2m Test Files [22m [1m[32m52 passed[39m[22m[90m (52)[39m
[2m      Tests [22m [1m[32m1613 passed[39m[22m[90m (1613)[39m
[2m   Start at [22m 19:57:49
[2m   Duration [22m 8.55s[2m (transform 3.23s, setup 0ms, import 5.73s, tests 11.71s, environment 6ms)[22m

```

```bash
grep -n '3d-i\|3d-ii\|3d-iii\|3d-iv\|3d-v\|3d-vi\|3d-vii\|3d-viii' /Users/ivintik/dev/personal/codeharness/commands/harness-run.md
```

```output
171:Record `verify_start_time = current timestamp` at the start of this step. At any point during the flow, if elapsed time exceeds 10 minutes, abort the current operation, treat it as a failure, and jump to cleanup (step 3d-viii).
200:**3d-i: Build Docker verify image**
212:**3d-ii: Start Docker container**
222:**3d-iii: Prepare clean workspace**
230:If this fails, log `[FAIL] verify-env prepare failed: {error}`, leave story at `verifying`, and go to cleanup (step 3d-viii) then Step 6. The container is running and must be cleaned up.
232:**3d-iv: Run verifier session**
257:If the verifier process exits non-zero or times out, treat as failure (proceed to retry logic in step 3d-vii).
259:**3d-v: Copy proof document back**
265:If the proof file does not exist (verifier crashed or failed to produce one), treat as failure (step 3d-vii).
267:**3d-vi: Validate proof quality**
275:- If `pending === 0` and `escalated === 0` → proof quality passed. Update sprint-status.yaml: change `{story_key}` status to `done`. Print: `[OK] Story {story_key}: verifying → done`. Proceed to cleanup (step 3d-viii).
281:  - Proceed to cleanup (step 3d-viii)
282:- If `pending > 0` → proof has gaps. Treat as failure (step 3d-vii).
288:to confirm fixes haven't broken anything. Then proceed to cleanup (step 3d-viii).
290:**3d-vii: Retry logic (on failure)**
297:   - Run cleanup (step 3d-viii)
302:   - Retry from step 3d-iv
304:**3d-viii: Cleanup (unconditional — runs on both success and failure)**
```

```bash
grep -n 'npm run build\|verify-env build\|docker run.*--name\|verify-env prepare\|claude --print\|cp /tmp/codeharness-verify\|codeharness verify --story\|verify-env cleanup' /Users/ivintik/dev/personal/codeharness/commands/harness-run.md
```

```output
193:npm run build 2>&1
203:codeharness verify-env build 2>&1
208:[FAIL] verify-env build failed: {error}
215:docker run -d --name codeharness-verify --network host codeharness-verify sleep infinity
225:codeharness verify-env prepare --story {story_key} 2>&1
230:If this fails, log `[FAIL] verify-env prepare failed: {error}`, leave story at `verifying`, and go to cleanup (step 3d-viii) then Step 6. The container is running and must be cleaned up.
241:cd /tmp/codeharness-verify-{story_key} && claude --print --max-budget-usd 3 -p "{verification_prompt}"
262:cp /tmp/codeharness-verify-{story_key}/verification/{story_key}-proof.md verification/
270:codeharness verify --story {story_key} 2>&1
286:npm run build && npm run test:unit
301:   - Run `codeharness verify-env prepare --story {story_key}` to recreate the clean workspace (the container and image may be reused)
307:codeharness verify-env cleanup --story {story_key} 2>&1
314:[WARN] verify-env cleanup failed for {story_key}: {error}
```

```bash
grep -c 'subagent_type.*codeharness:verifier' /Users/ivintik/dev/personal/codeharness/commands/harness-run.md; echo 'Exit code:' $?
```

```output
0
Exit code: 1
```

```bash
grep -n 'No fallback\|no fallback\|No fallback to white-box' /Users/ivintik/dev/personal/codeharness/commands/harness-run.md
```

```output
167:Verification runs in a Docker container with NO source code access. The verifier exercises the built CLI and queries observability endpoints to produce a proof document. This is the entire point of codeharness — no fallback to white-box verification exists.
210:Leave story at `verifying`, go to Step 6. No fallback.
```

```bash
grep -n 'retry_count\|max_retries\|story_retries' /Users/ivintik/dev/personal/codeharness/commands/harness-run.md
```

```output
29:- `retry_count = 0` (per story, resets for each new story)
31:- `max_retries = 3`
112:3. If status didn't change, increment retry_count and retry this step (up to max_retries)
135:3. If status is still `in-progress` or `ready-for-dev`, this may indicate failure — increment retry_count
136:4. If retry_count >= max_retries, go to Step 6 (failure handling)
163:   - If still `review` → Code review may have failed silently. Increment retry_count. If retry_count >= max_retries, go to Step 6. Otherwise retry this step.
173:**Pre-verification: Read retry state from `ralph/.story_retries`.**
175:Read the file `ralph/.story_retries`. If the file contains a line matching `{story_key}={N}`, set `retry_count = N`. If no matching line exists, set `retry_count = 0`. This ensures retry budgets persist across sessions.
294:1. Increment `retry_count`
295:2. Update `ralph/.story_retries`: write/replace the line `{story_key}={retry_count}` in the file. Read the existing file first to preserve other story entries.
296:3. If `retry_count >= max_retries` (3):
299:4. If `retry_count < max_retries`:
300:   - Print: `[WARN] Verification attempt {retry_count}/{max_retries} failed for {story_key} — retrying`
349:   - Reset retry_count and cycle_count to 0
395:A story has exceeded max_retries (3 stagnation retries) or max_cycles (5 dev↔review round-trips).
400:   [FAIL] Story {story_key}: exceeded {max_retries} retries
```

```bash
grep -n 'status --check-docker\|stack start' /Users/ivintik/dev/personal/codeharness/commands/harness-run.md
```

```output
180:codeharness status --check-docker 2>&1
185:codeharness stack start 2>&1
188:If `codeharness stack start` fails, log `[FAIL] Observability stack failed to start — cannot verify` and go to Step 6 (failure handling).
```

```bash
grep -n '\-\-network host' /Users/ivintik/dev/personal/codeharness/commands/harness-run.md
```

```output
215:docker run -d --name codeharness-verify --network host codeharness-verify sleep infinity
218:`--network host` allows the container to reach OTEL Collector at `localhost:4318`, VictoriaLogs at `:9428`, VictoriaMetrics at `:8428`, and VictoriaTraces at `:16686`.
```

```bash
grep -n '10 minute\|timeout\|verify_start_time' /Users/ivintik/dev/personal/codeharness/commands/harness-run.md
```

```output
169:**Total timeout: 10 minutes for the entire verification flow (build → prepare → verify → validate → cleanup).**
171:Record `verify_start_time = current timestamp` at the start of this step. At any point during the flow, if elapsed time exceeds 10 minutes, abort the current operation, treat it as a failure, and jump to cleanup (step 3d-viii).
292:If the verifier session failed (non-zero exit, timeout, no proof produced, or `pending > 0`):
441:- **Before starting a new story or verification step**, check elapsed time. If less than 10 minutes remain, skip to Step 7 → Step 8.
```

```bash
grep -n 'ralph/.story_retries' /Users/ivintik/dev/personal/codeharness/commands/harness-run.md
```

```output
173:**Pre-verification: Read retry state from `ralph/.story_retries`.**
175:Read the file `ralph/.story_retries`. If the file contains a line matching `{story_key}={N}`, set `retry_count = N`. If no matching line exists, set `retry_count = 0`. This ensures retry budgets persist across sessions.
295:2. Update `ralph/.story_retries`: write/replace the line `{story_key}={retry_count}` in the file. Read the existing file first to preserve other story entries.
```

```bash
echo '[ESCALATE] AC 1-7 runtime behavior: Full end-to-end orchestration (build -> prepare -> verify -> validate -> cleanup) requires a running Docker daemon, Claude subprocess with ANTHROPIC_API_KEY, and an active observability stack. Structural correctness of the skill file is verified above. Runtime integration testing requires executing /harness-run against a real story in verifying state.'
```

```output
[ESCALATE] AC 1-7 runtime behavior: Full end-to-end orchestration (build -> prepare -> verify -> validate -> cleanup) requires a running Docker daemon, Claude subprocess with ANTHROPIC_API_KEY, and an active observability stack. Structural correctness of the skill file is verified above. Runtime integration testing requires executing /harness-run against a real story in verifying state.
```

```bash
npm run test:unit 2>&1 | tail -5
```

```output
[2m Test Files [22m [1m[32m52 passed[39m[22m[90m (52)[39m
[2m      Tests [22m [1m[32m1613 passed[39m[22m[90m (1613)[39m
[2m   Start at [22m 19:58:35
[2m   Duration [22m 8.70s[2m (transform 3.08s, setup 0ms, import 5.82s, tests 12.04s, environment 3ms)[22m

```

## Verdict: PASS

- Total ACs: 7
- Verified (structural): 7
- Escalated (runtime): 7 (all ACs are tagged integration-required; structural correctness verified via grep)
- Failed: 0
- Tests: 52 files, 1613 tests — all passing
- Showboat verify: pending

AC-by-AC structural evidence:
- AC1: All 8 sub-steps (3d-i through 3d-viii) present with correct commands
- AC2: Zero references to subagent_type codeharness:verifier; explicit 'no fallback' language at lines 167, 210
- AC3: retry_count increment, max_retries=3 check, .story_retries read/write at lines 173-175, 294-302
- AC4: codeharness status --check-docker at line 180, codeharness stack start at line 185
- AC5: --network host in docker run at line 215, with port documentation at line 218
- AC6: 10-minute timeout at line 169, verify_start_time at line 171
- AC7: ralph/.story_retries read at line 175 (session start), write at line 295 (after each attempt)
