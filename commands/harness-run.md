---
description: Start autonomous execution — the vendored Ralph loop executes stories with verification gates per story.
---

# Harness Run

Start the autonomous execution loop. Each iteration spawns a fresh Claude Code instance with the codeharness plugin.

## Prerequisites

1. Harness must be initialized (`/harness-init` completed)
2. BMAD sprint plan must exist (or standalone task list)
3. Stories must be mapped to verification tasks

## Step 1: Pre-flight Check

Verify the following. If any check fails, report `[FAIL]` with the specific failure and suggest `→ Run /harness-init`.

1. Check `.claude/codeharness.local.md` exists and is valid YAML frontmatter
2. Check Docker stack is healthy (if observability enforcement is enabled in state file)
3. Check task list exists — either `ralph/progress.json` (from bridge) or standalone tasks
4. Check `ralph/ralph.sh` exists and is executable

If any check fails:
```
[FAIL] Cannot start harness loop.

{specific failure}

→ Run /harness-init to set up the harness
```

## Step 2: Bridge BMAD Stories to Tasks

If `ralph/progress.json` does not exist, run `ralph/bridge.sh` to convert BMAD stories to Ralph execution tasks:
- Each task includes: story ID, title, ACs, verification requirements
- Tasks ordered by sprint plan sequence
- Output stored in `ralph/progress.json`

If standalone mode (no BMAD), read the user's task list directly and generate `ralph/progress.json`.

## Step 3: Start Ralph Loop

Execute the vendored Ralph loop:

```bash
bash ralph/ralph.sh --plugin-dir . --max-iterations 50 --timeout 14400
```

The vendored loop (`ralph/ralph.sh`):
1. Reads next incomplete task from `ralph/progress.json`
2. Spawns a fresh `claude --plugin-dir .` instance with task context
3. Agent implements the story (harness hooks enforce verification)
4. Circuit breaker monitors for stagnation (no-progress detection)
5. If iteration succeeds → check task completion, pick next task
6. If iteration fails → retry with backoff (max 3 consecutive failures)
7. Rate limiting prevents API overuse (100 calls/hour default)

Supported options:
- `--max-iterations NUM` — max loop iterations (default: 50)
- `--timeout SECONDS` — total loop timeout (default: 14400 = 4h)
- `--iteration-timeout MIN` — per-iteration timeout (default: 15m)
- `--calls NUM` — max API calls per hour (default: 100)
- `--live` — show live streaming output
- `--prompt FILE` — override prompt file
- `--progress FILE` — override progress file
- `--reset-circuit` — reset circuit breaker and exit

## Step 4: Loop Termination

The loop terminates when:
- All stories done → success summary (tasks completed, total iterations)
- Max iterations reached → progress report (completed/remaining stories)
- User cancels (Ctrl+C) → preserve progress cleanly
- Circuit breaker opens → stagnation detected, halt with diagnostics
- 3 consecutive failures → halt with error report
- API limit reached → wait 60 minutes, then retry

In all cases, progress is saved to `ralph/progress.json` and readable via `/harness-status`.

Status is tracked in `ralph/status.json` with: iteration count, calls made, status, exit reason.

## Output

```
Harness Run — starting autonomous execution

Stories: {N} total, {M} remaining
Loop: max 50 iterations, 4h timeout

Starting iteration 1...
```
