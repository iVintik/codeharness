# Story 5.1: Ralph Loop Integration & Beads Task Source

Status: done

## Story

As a developer,
I want to run `codeharness run` to start autonomous multi-session development,
So that Ralph spawns fresh Claude Code instances that invoke `/harness-run`, with rate limiting, circuit breaker, and crash recovery handling concerns the in-session skill cannot.

## Acceptance Criteria

1. **Given** a developer runs `codeharness run`, **When** the run command starts, **Then** vendored Ralph is invoked via `child_process.spawn('bash', ['ralph/ralph.sh', ...])`, **And** `--plugin-dir` points to the installed plugin directory, **And** `[INFO] Starting autonomous execution` is printed with story count from sprint-status.yaml.

2. **Given** Ralph is running, **When** it needs the next task, **Then** the spawned Claude Code instance runs `/harness-run` (the sprint execution skill from Epic 0), **And** Ralph does NOT implement its own task-picking logic — the skill reads sprint-status.yaml directly.

3. **Given** Ralph spawns a Claude Code instance, **When** a fresh iteration starts, **Then** the instance is created with `claude --plugin-dir <path>`, **And** the previous iteration's context is NOT carried over (fresh context per iteration), **And** the prompt instructs Claude to run `/harness-run`.

4. **Given** Ralph detects all stories are done, **When** it checks sprint-status.yaml after each session, **Then** the loop terminates normally, **And** `[OK] All stories complete. <N> stories verified in <M> iterations.` is printed.

5. **Given** `codeharness run` receives configurable options, **When** the developer passes `--max-iterations <N>`, `--timeout <S>`, `--iteration-timeout <M>`, or `--live`, **Then** these are forwarded to Ralph's CLI arguments.

6. **Given** `codeharness run --json`, **When** the loop runs, **Then** each iteration outputs JSON with iteration count, status, and timing.

7. **Given** `codeharness run` is restarted after a crash, **When** Ralph resumes, **Then** it reads sprint-status.yaml to determine progress, **And** completed stories (status `done`) are skipped, **And** `[INFO] Resuming from last completed story` is printed.

8. **Given** the circuit breaker detects stagnation, **When** multiple consecutive iterations fail to make progress, **Then** the loop terminates with `[WARN] Circuit breaker: no progress in <N> iterations`, **And** the current state is preserved for manual intervention.

## Tasks / Subtasks

- [ ] Task 1: Implement `codeharness run` command in `src/commands/run.ts` (AC: #1, #5, #6)
  - [ ] 1.1: Replace the existing stub with a full Commander.js command. Register options: `--max-iterations <n>` (default 50), `--timeout <seconds>` (default 14400 = 4h), `--iteration-timeout <minutes>` (default 15), `--live` (stream output), `--calls <n>` (max API calls per hour, default 100). Inherit global `--json` flag.
  - [ ] 1.2: Resolve the Ralph script path: `path.join(__dirname, '..', 'ralph', 'ralph.sh')` relative to the package root. Verify the file exists; if missing, print `[FAIL] Ralph loop not found — reinstall codeharness` and exit 1.
  - [ ] 1.3: Resolve the plugin directory path. During init, the plugin is scaffolded to a known location (check `src/lib/state.ts` or init output for the canonical path). If no plugin directory is found, print `[FAIL] Plugin directory not found — run codeharness init first` and exit 1.
  - [ ] 1.4: Read sprint-status.yaml via `readSprintStatus()` from `beads-sync.ts` to count remaining stories. Print `[INFO] Starting autonomous execution — <N> stories ready` where N is the count of stories with status `backlog` or `ready-for-dev`.

- [ ] Task 2: Implement Ralph spawning logic in `src/commands/run.ts` (AC: #1, #3, #5)
  - [ ] 2.1: Build the spawn argument array: `['ralph/ralph.sh', '--plugin-dir', pluginDir, '--max-iterations', String(maxIterations), '--timeout', String(timeout), '--iteration-timeout', String(iterationTimeout), '--calls', String(maxCalls)]`. Add `--live` if the flag is set. Add `--prompt` pointing to the harness run prompt file.
  - [ ] 2.2: Spawn Ralph via `child_process.spawn('bash', args, { stdio: 'inherit', cwd: process.cwd() })`. Use `stdio: 'inherit'` so Ralph's output streams directly to the terminal.
  - [ ] 2.3: Handle spawn errors: if `bash` is not found or Ralph script has no execute permission, print `[FAIL] Failed to start Ralph: <error>` and exit 1.
  - [ ] 2.4: Wait for the spawned process to exit. Propagate Ralph's exit code as the CLI's exit code. Map exit codes: 0 = success, non-zero = failure.

- [ ] Task 3: Create the harness-run prompt file (AC: #2, #3)
  - [ ] 3.1: Create `src/templates/ralph-prompt.ts` with an embedded prompt template. The prompt instructs Claude to: (1) run `/harness-run` to execute the next story in the sprint, (2) follow all BMAD workflows (create-story, dev-story, code-review), (3) update sprint-status.yaml after each story completes.
  - [ ] 3.2: The prompt template is a TypeScript string literal — no external file reads. It should reference the sprint-status.yaml path and the story location from codeharness state.
  - [ ] 3.3: Implement `generateRalphPrompt(config: { projectDir: string, sprintStatusPath: string }): string` — interpolates config values into the prompt template.
  - [ ] 3.4: In the run command, generate the prompt file to a temp location (e.g., `ralph/.harness-prompt.md`) before spawning Ralph. Pass this path via `--prompt` to Ralph.

- [ ] Task 4: Modify Ralph to use sprint-status.yaml for completion detection (AC: #2, #4, #7)
  - [ ] 4.1: In `ralph/ralph.sh`, replace the `get_current_task()` / `all_tasks_complete()` / `progress.json` logic with sprint-status.yaml reading. Add a function `check_sprint_complete()` that parses sprint-status.yaml and returns 0 (true) if all story entries in `development_status` have status `done`.
  - [ ] 4.2: Replace `get_current_task()` with a no-op or stub — task picking is now done by the `/harness-run` skill inside each Claude session, not by Ralph. Ralph just spawns sessions and checks if the sprint is done afterwards.
  - [ ] 4.3: Replace `all_tasks_complete()` with `check_sprint_complete()`. After each iteration completes, Ralph reads sprint-status.yaml to decide whether to continue or stop.
  - [ ] 4.4: Remove the `--progress` CLI argument from Ralph (or make it optional/deprecated). The `PROGRESS_FILE` variable is no longer required for task tracking.
  - [ ] 4.5: Update `get_task_counts()` to read from sprint-status.yaml: count total stories (entries matching pattern `N-N-*`) and completed stories (entries with value `done`).

- [ ] Task 5: Remove verify_gates.sh from Ralph's main loop (AC: #2)
  - [ ] 5.1: In `ralph/ralph.sh`, remove the call to `verify_gates.sh` in the post-iteration block (lines ~571-584). Verification gates are now handled by the `/harness-run` skill's story-completion flow (Epic 4 enhancements).
  - [ ] 5.2: Keep `verify_gates.sh` in the `ralph/` directory for now — it may be useful as a standalone diagnostic tool. Add a comment at the top: `# DEPRECATED: Verification gates are now handled by the /harness-run sprint execution skill.`
  - [ ] 5.3: Remove the `mark_task_complete()` function from ralph.sh — story completion is handled by the skill updating sprint-status.yaml.

- [ ] Task 6: Update Ralph summary and status reporting (AC: #4, #8)
  - [ ] 6.1: Update the final summary block in `ralph/ralph.sh` (lines ~619-656) to read from sprint-status.yaml instead of progress.json. Report: iterations, stories completed/total, elapsed time.
  - [ ] 6.2: Update `update_status()` to include sprint-status data in the status JSON file (`ralph/status.json`).
  - [ ] 6.3: Keep circuit breaker logic unchanged — it already works based on file changes and error detection, not on progress.json.

- [ ] Task 7: Handle JSON output mode in the run command (AC: #6)
  - [ ] 7.1: When `--json` is passed to `codeharness run`, set Ralph's `CLAUDE_OUTPUT_FORMAT=json` environment variable.
  - [ ] 7.2: After Ralph exits, if `--json` was passed, read `ralph/status.json` and output it as the final JSON response. Structure: `{ status: 'completed' | 'stopped' | 'halted', iterations: number, storiesCompleted: number, storiesTotal: number, exitReason: string }`.

- [ ] Task 8: Write unit tests for `src/commands/run.ts` (AC: #1, #5, #6)
  - [ ] 8.1: Create `src/commands/__tests__/run.test.ts`. Test that the run command resolves Ralph script path correctly.
  - [ ] 8.2: Test that CLI options are correctly mapped to Ralph spawn arguments: `--max-iterations`, `--timeout`, `--iteration-timeout`, `--live`, `--calls`.
  - [ ] 8.3: Test that `--json` flag is handled: environment variable set, status.json read on exit.
  - [ ] 8.4: Test error cases: Ralph script not found (exit 1), plugin directory not found (exit 1), spawn failure.
  - [ ] 8.5: Test that sprint-status.yaml is read for initial story count message.
  - [ ] 8.6: Mock `child_process.spawn` — do NOT actually spawn Ralph in unit tests.

- [ ] Task 9: Write unit tests for `src/templates/ralph-prompt.ts` (AC: #2, #3)
  - [ ] 9.1: Create `src/templates/__tests__/ralph-prompt.test.ts`. Test that `generateRalphPrompt()` produces a prompt containing `/harness-run` instruction.
  - [ ] 9.2: Test that prompt includes the sprint-status.yaml path.
  - [ ] 9.3: Test that prompt is a non-empty string and contains key instructions (follow BMAD workflows, update sprint-status.yaml).

- [ ] Task 10: Write BATS integration test for Ralph sprint-status integration (AC: #4, #7)
  - [ ] 10.1: Create `tests/integration/ralph-sprint-status.bats` (or extend `tests/integration/ralph.bats`). Test the `check_sprint_complete()` function with a sample sprint-status.yaml where all stories are `done` — should return 0.
  - [ ] 10.2: Test `check_sprint_complete()` with stories still in progress — should return 1.
  - [ ] 10.3: Test `get_task_counts()` with a sample sprint-status.yaml — verify correct total and completed counts.
  - [ ] 10.4: Test that the `--progress` flag is optional and Ralph doesn't fail without it.

- [ ] Task 11: Build and verify (AC: #1-#8)
  - [ ] 11.1: Run `npm run build` — verify tsup compiles successfully with the updated `run.ts` and new `ralph-prompt.ts`.
  - [ ] 11.2: Run `npm test` — verify all unit tests pass including new run command tests and ralph-prompt tests.
  - [ ] 11.3: Run BATS tests — verify Ralph sprint-status integration tests pass.
  - [ ] 11.4: Verify `codeharness run --help` shows all options: `--max-iterations`, `--timeout`, `--iteration-timeout`, `--live`, `--calls`.
  - [ ] 11.5: Verify `codeharness run` outside a harness project prints `[FAIL]` with actionable message.

## Dev Notes

### Architecture Context

Ralph is a vendored bash script (~725 lines) that provides multi-session autonomous execution. The key architectural insight from the Epic 5 amendment is the division of responsibilities:

- **Ralph owns:** Session spawning, rate limiting (API calls/hour), circuit breaker (stagnation detection), crash recovery (resume from sprint-status.yaml), timeout management (per-iteration and total loop).
- **`/harness-run` skill owns:** Task picking (reads sprint-status.yaml), BMAD workflow execution (create-story, dev-story, code-review), verification gates, story status updates.

Ralph does NOT implement task-picking or verification logic. It spawns a Claude Code instance, tells it to run `/harness-run`, and checks sprint-status.yaml after each session to decide whether to continue.

### Key Files to Modify

| File | Change |
|------|--------|
| `src/commands/run.ts` | Replace stub with full implementation |
| `ralph/ralph.sh` | Replace progress.json with sprint-status.yaml |
| `ralph/verify_gates.sh` | Deprecate (add comment header) |
| `src/templates/ralph-prompt.ts` | New — prompt template for Ralph iterations |
| `src/commands/__tests__/run.test.ts` | New — unit tests |
| `src/templates/__tests__/ralph-prompt.test.ts` | New — unit tests |

### Existing Code to Leverage

- `src/lib/beads-sync.ts` — `readSprintStatus()` already reads sprint-status.yaml and returns the `development_status` map. Use this for story counting.
- `src/lib/beads.ts` — `getReady()` calls `bd ready --json` if beads integration is still needed alongside sprint-status.yaml.
- `ralph/lib/circuit_breaker.sh` — Circuit breaker is file-change based (git diff), not progress.json based. No changes needed.
- `ralph/drivers/claude-code.sh` — Driver builds `claude --plugin-dir` commands. No changes needed.
- `ralph/lib/timeout_utils.sh` and `ralph/lib/date_utils.sh` — Utility libraries. No changes needed.

### Sprint-Status.yaml Format

```yaml
development_status:
  epic-5: in-progress
  5-1-ralph-loop-integration-beads-task-source: in-progress
  5-2-verification-gates-termination-tracking: backlog
```

Story keys match the pattern `N-N-slug` (e.g., `5-1-ralph-loop-integration-beads-task-source`). Epic keys match `epic-N`. The `check_sprint_complete()` function should only count story keys, not epic keys or retrospective keys.

### Risk: Ralph Script Modifications

Ralph.sh is vendored from snarktank/ralph. Modifications should be minimal and clearly marked with `# codeharness:` comments. The core loop, rate limiting, circuit breaker, and driver system should remain untouched. Only the task-source layer (progress.json -> sprint-status.yaml) and verification gate invocation need changes.

### NFR Compliance

- **NFR8:** `bd ready --json` < 1s — still applies if beads integration is used alongside sprint-status.yaml.
- **NFR21:** Ralph crash recovery — sprint-status.yaml is the recovery mechanism. Completed stories have status `done` and are skipped on restart.
- **NFR9:** Plugin coexistence — `--plugin-dir` flag ensures codeharness plugin is loaded without interfering with other plugins.
