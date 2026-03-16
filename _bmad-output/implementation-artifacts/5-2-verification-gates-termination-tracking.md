# Story 5.2: Verification Gates, Termination & Tracking

Status: ready-for-dev

## Story

As a developer,
I want the autonomous loop to enforce verification before closing stories and handle termination gracefully,
So that no story is marked done without proof and the loop doesn't run forever.

## Acceptance Criteria

1. **Given** an agent completes implementation of a story, **When** the iteration reaches the verification gate, **Then** `codeharness verify --story <id>` is invoked by the `/harness-run` skill, **And** if verification passes the story is marked `done` in sprint-status.yaml, **And** if verification fails the agent iterates on the same story, **And** `[OK] Story <id>: DONE` is printed on success.

2. **Given** a story fails verification, **When** the agent retries, **Then** the same story is re-attempted in the next iteration, **And** iteration count for the story is tracked in the Ralph prompt context, **And** if the story exceeds a configurable retry limit (default 3) Ralph flags it and the loop moves on to the next story.

3. **Given** all stories are completed, **When** Ralph checks sprint-status.yaml after each session, **Then** the loop terminates normally, **And** `[OK] All stories complete. <N> stories verified in <M> iterations.` is printed.

4. **Given** `codeharness run --max-iterations <N>`, **When** the iteration count reaches N, **Then** the loop terminates with `[INFO] Max iterations (<N>) reached. <done>/<total> stories complete.`

5. **Given** the user sends a cancellation signal (SIGINT/Ctrl+C), **When** the signal is received, **Then** the current iteration is allowed to complete (or cleanly interrupted), **And** the loop exits with a summary of progress including iterations, stories completed, and elapsed time.

6. **Given** the circuit breaker detects stagnation, **When** multiple consecutive iterations fail to make progress (no file changes), **Then** the loop terminates with `[WARN] Circuit breaker: no progress in <N> iterations`, **And** the current state is preserved for manual intervention.

7. **Given** the Ralph loop crashes mid-iteration, **When** `codeharness run` is restarted, **Then** the loop resumes from the last completed story by reading sprint-status.yaml, **And** completed stories (status `done`) are skipped, **And** `[INFO] Resuming from last completed story` is printed.

8. **Given** the loop runs across multiple stories, **When** progress is tracked, **Then** iteration count, stories completed, stories remaining, and elapsed time are maintained in `ralph/status.json`, **And** periodic progress summaries are printed: `[INFO] Progress: <done>/<total> stories complete (iterations: <N>, elapsed: <time>)`.

## Tasks / Subtasks

- [ ] Task 1: Add per-story retry tracking to Ralph (AC: #2, #8)
  - [ ] 1.1: In `ralph/ralph.sh`, add a `STORY_RETRY_FILE` variable (e.g., `ralph/.story_retries`) that tracks per-story iteration counts as a simple key-value file (`story-key count`). Initialize it in `main()` alongside other state files.
  - [ ] 1.2: Add `increment_story_retry(story_key)` function that reads the retry file, increments the count for the given story key, and writes it back. Returns the new count.
  - [ ] 1.3: Add `get_story_retry_count(story_key)` function that returns the current retry count for a story key (0 if not tracked yet).
  - [ ] 1.4: Add `--max-story-retries <N>` CLI option (default 3). Store in `MAX_STORY_RETRIES` variable.
  - [ ] 1.5: In `src/commands/run.ts`, add `--max-story-retries <n>` option (default 3) and forward it to Ralph spawn args.

- [ ] Task 2: Integrate retry tracking into the Ralph loop (AC: #1, #2, #6)
  - [ ] 2.1: After each iteration completes (exit code 0), read sprint-status.yaml to determine which story was being worked on. Compare story statuses before and after the iteration to detect which story changed (or didn't change).
  - [ ] 2.2: If a story's status did NOT change to `done` after an iteration, increment its retry counter via `increment_story_retry()`. Log: `[WARN] Story <key> — retry <N>/<MAX>`.
  - [ ] 2.3: If a story's retry count exceeds `MAX_STORY_RETRIES`, log `[WARN] Story <key> exceeded retry limit (<N>) — flagging and moving on`. Write the story key to a `ralph/.flagged_stories` file so subsequent iterations skip it.
  - [ ] 2.4: Update the Ralph prompt template (`src/templates/ralph-prompt.ts`) to include retry context: add a `retryCount` field to `RalphPromptConfig` and include it in the prompt so Claude knows how many attempts have been made. Add `flaggedStories` list so the prompt tells Claude to skip flagged stories.

- [ ] Task 3: Add progress summary logging to Ralph (AC: #3, #4, #8)
  - [ ] 3.1: In `ralph/ralph.sh`, add a `print_progress_summary()` function that reads `get_task_counts()` and prints `[INFO] Progress: <done>/<total> stories complete (iterations: <N>, elapsed: <time>)`. Calculate elapsed time from `$loop_start_time`.
  - [ ] 3.2: Call `print_progress_summary()` at the end of each iteration (after the `case` block in the main loop), regardless of success/failure.
  - [ ] 3.3: Update the completion message (when `all_tasks_complete` returns true) to print: `[OK] All stories complete. <total> stories verified in <loop_count> iterations.` — this is already partially implemented but verify the format matches the AC exactly.
  - [ ] 3.4: Update the max-iterations message to print: `[INFO] Max iterations (<N>) reached. <done>/<total> stories complete.` — verify the existing message in lines ~537-545 matches the AC format.

- [ ] Task 4: Enhance termination handling in Ralph (AC: #5, #6)
  - [ ] 4.1: Update the `cleanup()` trap handler to include a full progress summary before exiting: print iterations completed, stories done/total, elapsed time. Ensure `update_status()` is called with exit reason `user_cancelled`.
  - [ ] 4.2: Update circuit breaker halt message (lines ~558-561) to print: `[WARN] Circuit breaker: no progress in <N> iterations` where N comes from the circuit breaker state's `consecutive_no_progress` value.
  - [ ] 4.3: After circuit breaker halts, ensure sprint-status.yaml and `ralph/status.json` reflect the true state — no data loss on halt.

- [ ] Task 5: Add crash recovery resume detection (AC: #7)
  - [ ] 5.1: In `ralph/ralph.sh`, at the start of `main()` (after initialization), check if `ralph/status.json` exists with a non-completed status. If so, log `[INFO] Resuming from last completed story` and continue the loop normally.
  - [ ] 5.2: The existing sprint-status.yaml-based completion check already handles resume correctly (done stories are skipped by `/harness-run`). This task is about adding the explicit log message and verifying the behavior.
  - [ ] 5.3: If `ralph/.story_retries` exists from a previous run, preserve it — retry counts carry across restarts to prevent infinite retry loops on consistently failing stories.

- [ ] Task 6: Update `status.json` schema and generation (AC: #8)
  - [ ] 6.1: Update `update_status()` in `ralph/ralph.sh` to include additional fields: `stories_remaining` (total - completed), `elapsed_seconds`, `flagged_stories` (list from `.flagged_stories` file).
  - [ ] 6.2: Update the JSON output in `src/commands/run.ts` (lines ~201-236) to include the new fields from status.json: `storiesRemaining`, `elapsedSeconds`, `flaggedStories`.
  - [ ] 6.3: Update `buildSpawnArgs()` in `src/commands/run.ts` to forward `--max-story-retries`.

- [ ] Task 7: Update Ralph prompt template for verification context (AC: #1)
  - [ ] 7.1: In `src/templates/ralph-prompt.ts`, add to the prompt template a section on verification gates: "After completing a story, run `codeharness verify --story <id>` to verify. If verification fails, fix the issues and re-verify. The story is not done until verification passes."
  - [ ] 7.2: Add `RalphPromptConfig` fields: `retryCount?: number`, `flaggedStories?: string[]`, `currentStoryKey?: string`. Update `generateRalphPrompt()` to conditionally include retry information when `retryCount > 0`.
  - [ ] 7.3: In `src/commands/run.ts`, before spawning Ralph, read `.story_retries` and `.flagged_stories` files (if they exist) and pass the data to `generateRalphPrompt()`.

- [ ] Task 8: Write unit tests for new Ralph retry tracking (AC: #2, #8)
  - [ ] 8.1: In `src/commands/__tests__/run.test.ts`, add tests for the new `--max-story-retries` option: verify it defaults to 3, verify it's forwarded to Ralph spawn args.
  - [ ] 8.2: Add tests for the updated JSON output structure: verify `storiesRemaining`, `flaggedStories` fields are present in output.
  - [ ] 8.3: Add tests for `buildSpawnArgs()` to verify `--max-story-retries` is included.

- [ ] Task 9: Write unit tests for updated Ralph prompt template (AC: #1, #2)
  - [ ] 9.1: In `src/templates/__tests__/ralph-prompt.test.ts`, add tests that `generateRalphPrompt()` includes verification gate instructions (contains `codeharness verify`).
  - [ ] 9.2: Test that when `retryCount > 0`, the prompt includes retry context.
  - [ ] 9.3: Test that when `flaggedStories` is non-empty, the prompt mentions them.

- [ ] Task 10: Write BATS tests for Ralph retry and termination (AC: #2, #3, #4, #5)
  - [ ] 10.1: In `tests/integration/ralph-sprint-status.bats`, add a test for `increment_story_retry()` and `get_story_retry_count()`: verify counts are tracked correctly across calls.
  - [ ] 10.2: Test `print_progress_summary()` output format matches the AC.
  - [ ] 10.3: Test that the cleanup handler produces a progress summary.
  - [ ] 10.4: Test that `.story_retries` persists across simulated Ralph restarts.

- [ ] Task 11: Build and verify (AC: #1-#8)
  - [ ] 11.1: Run `npm run build` — verify tsup compiles successfully with updated `run.ts` and `ralph-prompt.ts`.
  - [ ] 11.2: Run `npm test` — verify all unit tests pass including new retry tracking and prompt template tests.
  - [ ] 11.3: Run BATS tests — verify Ralph retry tracking and termination tests pass.
  - [ ] 11.4: Verify `codeharness run --help` shows the new `--max-story-retries` option.
  - [ ] 11.5: Manual verification: run `codeharness run` in a test project with a sprint-status.yaml — confirm progress summaries print, retry tracking works, and termination is graceful.

## Dev Notes

### Architecture Context

This story builds on Story 5.1 which established Ralph as a session-spawning wrapper around the `/harness-run` skill. The key architectural principle remains: **Ralph does NOT implement verification logic** — the `/harness-run` skill (Epic 0) with Epic 4 enhancements handles verification gates inside each Claude Code session. Ralph's responsibility is detecting whether verification succeeded (by checking sprint-status.yaml changes) and managing the outer retry/termination loop.

The division of concerns:
- **`/harness-run` skill (in-session):** Runs `codeharness verify --story <id>`, updates sprint-status.yaml status to `done` on pass, retries within the session on fail.
- **Ralph (cross-session):** Detects if the session moved the story to `done`. If not, spawns a new session for the same story (retry). Tracks retry counts, enforces retry limits, handles termination.

### Key Files to Modify

| File | Change |
|------|--------|
| `ralph/ralph.sh` | Add retry tracking, progress summaries, enhanced cleanup, resume detection |
| `src/commands/run.ts` | Add `--max-story-retries` option, forward to Ralph, update JSON output |
| `src/templates/ralph-prompt.ts` | Add verification gate instructions, retry context, flagged stories |
| `src/commands/__tests__/run.test.ts` | Add tests for new option and JSON fields |
| `src/templates/__tests__/ralph-prompt.test.ts` | Add tests for verification and retry prompt content |
| `tests/integration/ralph-sprint-status.bats` | Add retry tracking and termination tests |

### Existing Code to Leverage

- `ralph/ralph.sh` — Already has `check_sprint_complete()`, `get_task_counts()`, `update_status()`, circuit breaker integration, and `cleanup()` trap. Extend rather than replace.
- `ralph/lib/circuit_breaker.sh` — Circuit breaker is file-change based (git diff detection). No changes needed to the breaker itself — just improve the log messages when it triggers.
- `src/commands/run.ts` — Already has `buildSpawnArgs()`, `countStories()`, and JSON output handling. Extend with new option and fields.
- `src/templates/ralph-prompt.ts` — Already has `RalphPromptConfig` and `generateRalphPrompt()`. Extend the config interface and template.
- `src/lib/verify.ts` — `checkPreconditions()`, `runShowboatVerify()`, `updateVerificationState()` are already implemented (Epic 4). Not modified in this story.
- `src/commands/verify.ts` — Already fully implemented. Ralph relies on it working correctly.

### Retry Tracking Design

The retry tracking uses a simple file-based approach rather than in-memory state because Ralph must survive crashes and restarts (NFR21). The `.story_retries` file format:

```
5-1-ralph-loop-integration-beads-task-source 0
5-2-verification-gates-termination-tracking 2
```

The `.flagged_stories` file is a newline-separated list of story keys that exceeded the retry limit:

```
5-2-verification-gates-termination-tracking
```

Both files live under `ralph/` to keep Ralph's state separate from the harness state in `.claude/`.

### Sprint-Status.yaml Change Detection

To determine which story was worked on in an iteration, Ralph reads sprint-status.yaml before and after each iteration. Stories that changed from a non-`done` status to `done` are newly completed. Stories whose status didn't change are candidates for retry tracking.

This avoids coupling Ralph to the `/harness-run` skill's internal state — Ralph only observes the sprint-status.yaml artifact.

### NFR Compliance

- **NFR21:** Crash recovery — `.story_retries` and `.flagged_stories` persist across restarts. Sprint-status.yaml is the single source of truth for story completion.
- **NFR1:** Hook execution <500ms — not affected by this story (hooks are in-session).
- **NFR3:** Showboat verify <5min — not affected (verification is in-session via `/harness-run`).

### Risk: Prompt Size

Adding retry context and flagged stories to the Ralph prompt increases its size. Keep additions concise — a few lines per retry context, not full story details. The prompt should remain under 1KB total.
