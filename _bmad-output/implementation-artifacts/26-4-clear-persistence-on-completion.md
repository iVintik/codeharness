<story-spec>

# Story 26-4: Clear persistence on completion

Status: review

## Story

As a workflow operator,
I want both persistence files (snapshot and checkpoint log) to be reliably cleaned up when a run completes successfully, preserved when it fails, and accompanied by clear CLI feedback about what happened,
So that I start each new run with a clean slate after success, can always resume after failure, and can diagnose persistence state from the CLI output alone.

## Context

**Epic 26: Persistence & Resume** — this is story 4 of 4 (the final story). Stories 26-1 (snapshot persistence), 26-2 (snapshot resume with config hash), and 26-3 (semantic checkpoint log) are all done.

**What exists and is usable:**

- `workflow-persistence.ts` (244 lines): `saveSnapshot()`, `loadSnapshot()`, `clearSnapshot()`, `computeConfigHash()`, `appendCheckpoint()`, `loadCheckpointLog()`, `clearCheckpointLog()` — all working. Atomic writes. Corrupt file detection. Config hash comparison.
- `workflow-runner.ts` (207 lines): `runWorkflowActor()` composition root. Already calls `clearSnapshot()` and `clearCheckpointLog()` in the success branch. Preserves both on error/halt/interrupt. Loads checkpoint log on config mismatch.
- `workflow-story-machine.ts` (233 lines): Story machine with checkpoint skip guard (`completedTasks` set), checkpoint append after task completion.
- `workflow-state.ts`: Legacy YAML state read/write (`readWorkflowState`/`writeWorkflowState`) — still active for phase tracking.
- `workflow-types.ts` (282 lines): All shared types.

**What this story refines:**

The basic "clear on success, preserve on error" logic exists from stories 26-1 and 26-3 but has gaps:

1. **No CLI feedback** — cleanup happens silently. The operator cannot tell from CLI output whether persistence files were deleted or preserved.
2. **No consolidated clear function** — `clearSnapshot()` and `clearCheckpointLog()` are called separately with independent try/catch blocks. If one fails, the other may still succeed, leaving inconsistent state.
3. **Re-entry after completion** — if the runner returns early because `workflowState.phase === 'completed'`, it never checks for stale persistence files left from a previous run (e.g., if a crash happened between the snapshot clear and the checkpoint log clear).
4. **Stale `.tmp` files** — only `loadSnapshot()` cleans up `.tmp` files; there is no cleanup on success path.
5. **No verification output** — no way for an operator to confirm cleanup happened without manually running `ls`.

**What this story does NOT build:**
- Checkpoint log compaction or rotation
- Gate iteration state restore (stays coarse: skip entire completed tasks)
- Persistence file migration between versions

**Key architectural decisions (from architecture-xstate-engine.md):**
- AD3: On successful completion, both snapshot and checkpoint log are deleted — clean slate
- AD3: On error/halt/interrupt, both are preserved for resume
- AD6: All modified files stay under 300 lines (NFR18)

## Acceptance Criteria

1. **Given** a workflow run that completes all tasks successfully with zero errors, **When** the run finishes, **Then** the CLI output contains a message indicating persistence files were cleaned up (e.g., containing "cleared" or "cleanup" and "persistence" or "snapshot").
   <!-- verification: run a workflow to successful completion (or use a minimal workflow with null-agent tasks), check CLI output (stdout/stderr) for cleanup confirmation message -->

2. **Given** a workflow run that completes successfully, **When** the operator lists the `.codeharness/` directory after the run, **Then** neither `workflow-snapshot.json` nor `workflow-checkpoints.jsonl` exists — both are deleted.
   <!-- verification: after successful run, ls .codeharness/ — neither workflow-snapshot.json nor workflow-checkpoints.jsonl appears -->

3. **Given** a workflow run that halts with errors (e.g., a task dispatch fails), **When** the operator lists the `.codeharness/` directory after the run, **Then** `workflow-snapshot.json` exists and contains valid JSON, and `workflow-checkpoints.jsonl` exists and contains valid JSONL (one JSON object per line).
   <!-- verification: after halted/failed run, cat .codeharness/workflow-snapshot.json | python3 -c "import json,sys; json.load(sys.stdin)" exits 0, and each non-empty line of workflow-checkpoints.jsonl parses as JSON -->

4. **Given** a workflow run that is interrupted (e.g., Ctrl+C / SIGINT), **When** the operator lists the `.codeharness/` directory after the interrupt, **Then** both `workflow-snapshot.json` and `workflow-checkpoints.jsonl` are preserved on disk for resume.
   <!-- verification: start a run, interrupt it (kill -INT <pid> or Ctrl+C), verify both files exist in .codeharness/ -->

5. **Given** stale persistence files exist from a previous run (both `workflow-snapshot.json` and `workflow-checkpoints.jsonl` are present) AND the workflow state file shows phase "completed", **When** the operator starts a new run, **Then** the runner detects the completed state and does NOT leave stale persistence files on disk — it either clears them or the run exits cleanly.
   <!-- verification: manually create both persistence files in .codeharness/, set workflow state phase to "completed", start a new run, verify persistence files are cleaned up or the run returns immediately with a clean exit -->

6. **Given** a successful run where `clearSnapshot()` succeeds but `clearCheckpointLog()` fails (simulated by making the checkpoint file read-only before run completion), **When** the next run starts, **Then** the stale checkpoint log does not cause incorrect behavior — the engine either clears it on startup or ignores it because the snapshot is absent (fresh start path).
   <!-- verification: after a successful run with a read-only checkpoint file left behind, start a new run, verify no "skip" messages from stale checkpoints — all tasks run normally -->

7. **Given** a stale `.tmp` file exists at `.codeharness/workflow-snapshot.json.tmp` from a previous crashed write, **When** the operator starts a new run, **Then** the stale `.tmp` file is deleted — it does not accumulate across runs.
   <!-- verification: create a file at .codeharness/workflow-snapshot.json.tmp with arbitrary content, start a run, verify the .tmp file is gone after the run starts -->

8. **Given** a workflow run that halts with errors after completing some tasks, **When** the CLI output is inspected, **Then** there is a message indicating persistence files were preserved for resume (e.g., containing "preserved" or "kept" and "resume").
   <!-- verification: trigger a halted run (e.g., configure an invalid driver), check CLI output for preservation message -->

9. **Given** a workflow run that resumes via checkpoint log (config changed) and then completes all remaining tasks successfully, **When** the run finishes, **Then** both persistence files are deleted — the cleanup applies to resumed runs too, not just fresh runs.
   <!-- verification: interrupt a run after some tasks, edit workflow YAML, restart and let it complete all remaining tasks successfully, verify neither persistence file exists in .codeharness/ -->

10. **Given** a workflow run that completes with loop termination (max-iterations or circuit-breaker), **When** the operator lists `.codeharness/` after the run, **Then** both persistence files are preserved (loop termination is NOT treated as clean success).
    <!-- verification: configure a workflow with a gate that exceeds max iterations, let it terminate, verify both persistence files still exist -->

11. **Given** the codebase after implementation, **When** `npm run build` is executed, **Then** it exits with code 0.
    <!-- verification: npm run build exits 0 -->

12. **Given** the full test suite, **When** `npx vitest run` is executed, **Then** zero failures — no regressions.
    <!-- verification: npx vitest run exits 0 -->

13. **Given** the workflow-runner.ts, workflow-persistence.ts, and workflow-story-machine.ts files, **When** their line counts are checked, **Then** each is <= 300 lines (per NFR18).
    <!-- verification: wc -l src/lib/workflow-runner.ts <= 300, wc -l src/lib/workflow-persistence.ts <= 300, wc -l src/lib/workflow-story-machine.ts <= 300 -->

## Tasks / Subtasks

### T1: Add `clearAllPersistence()` to `workflow-persistence.ts` (AC: #1, #2, #6)

- New function `clearAllPersistence(projectDir?: string): { snapshotCleared: boolean; checkpointCleared: boolean }` that calls `clearSnapshot()` and `clearCheckpointLog()` sequentially, returning which files were actually deleted.
- Also deletes stale `.tmp` file if present.
- Returns an object indicating what was cleared (for logging by the caller).
- Each sub-operation is independent — if one fails, the other still runs.
- Estimated: ~20 lines added to workflow-persistence.ts.

### T2: Add `cleanStaleTmpFiles()` to `workflow-persistence.ts` (AC: #7)

- New function `cleanStaleTmpFiles(projectDir?: string): void` — deletes `.codeharness/workflow-snapshot.json.tmp` if it exists.
- Called at the start of `runWorkflowActor()` (before snapshot load) and by `clearAllPersistence()`.
- Best-effort, swallows errors.
- Estimated: ~10 lines.

### T3: Replace separate clear calls in `workflow-runner.ts` with `clearAllPersistence()` (AC: #1, #2, #8, #9, #10)

- In the success branch of `runWorkflowActor()`, replace the two separate `clearSnapshot()` / `clearCheckpointLog()` calls with a single `clearAllPersistence(projectDir)` call.
- Log the result: `info('workflow-runner: Persistence cleared — snapshot: yes, checkpoints: yes')` (using the returned object).
- In the error/halt/interrupt branch, add a log: `info('workflow-runner: Persistence preserved for resume — snapshot and checkpoint log kept on disk')`.
- Verify that loop termination (`max-iterations`, `circuit-breaker`) takes the preserve path, not the clear path.
- Estimated: net ~5 lines changed (replace 6 lines with ~8 lines).

### T4: Clear stale persistence on re-entry after completion (AC: #5)

- At the top of `runWorkflowActor()`, where it checks `state.phase === 'completed'` and returns early, add a call to `clearAllPersistence(projectDir)` before returning.
- This handles the edge case where a crash between individual clear calls left partial state.
- Estimated: ~3 lines.

### T5: Call `cleanStaleTmpFiles()` at run startup (AC: #7)

- Near the top of `runWorkflowActor()`, after determining `projectDir`, call `cleanStaleTmpFiles(projectDir)`.
- This ensures stale `.tmp` files from crashed writes are cleaned before the run starts.
- Estimated: ~2 lines.

### T6: Handle orphaned checkpoint log on fresh start (AC: #6)

- In `runWorkflowActor()`, when no snapshot exists (fresh start) but a checkpoint log DOES exist on disk, clear the orphaned checkpoint log and log a warning.
- Rationale: a checkpoint log without a corresponding snapshot is an inconsistent state (the snapshot clear succeeded in a previous run but the checkpoint clear failed). The checkpoint log entries are useless without the context of a failed/interrupted run.
- Add after the snapshot load check: if `savedSnapshot === null`, call `clearCheckpointLog(projectDir)` and log: `warn('workflow-runner: Clearing orphaned checkpoint log — no snapshot present')`.
- Estimated: ~5 lines.

### T7: Write unit tests for `clearAllPersistence()` (AC: #11, #12)

- Test: both files exist → both deleted, returns `{ snapshotCleared: true, checkpointCleared: true }`
- Test: only snapshot exists → snapshot deleted, returns `{ snapshotCleared: true, checkpointCleared: false }`
- Test: neither file exists → no-op, returns `{ snapshotCleared: false, checkpointCleared: false }`
- Test: `.tmp` file cleaned up alongside main files
- Test: one clear fails (file permissions) → the other still runs
- Add to `workflow-persistence.test.ts`.

### T8: Write unit tests for cleanup in runner (AC: #11, #12)

- Test: successful run → `clearAllPersistence` called, cleanup log message emitted
- Test: failed run → `clearAllPersistence` NOT called, preserve log message emitted
- Test: interrupted run → `clearAllPersistence` NOT called
- Test: loop terminated (max-iterations) → `clearAllPersistence` NOT called
- Test: re-entry after 'completed' → `clearAllPersistence` called before early return
- Test: orphaned checkpoint log (no snapshot) → checkpoint cleared on startup
- Test: stale `.tmp` file cleaned at startup
- Add to `workflow-runner.test.ts`.

### T9: Verify build, lint, and file size constraints (AC: #11, #12, #13)

- `npm run build` exits 0
- `npx vitest run` — all tests pass, zero regressions
- `wc -l src/lib/workflow-runner.ts` <= 300 lines
- `wc -l src/lib/workflow-persistence.ts` <= 300 lines
- `wc -l src/lib/workflow-story-machine.ts` <= 300 lines

## Dev Notes

### What this story changes vs. 26-1 and 26-3

Stories 26-1 and 26-3 implemented the individual `clearSnapshot()` and `clearCheckpointLog()` functions and wired them into the success branch. This story:

1. Consolidates them into `clearAllPersistence()` for atomic-ish cleanup
2. Adds CLI feedback (log messages on clear and preserve)
3. Handles edge cases: re-entry after completion, orphaned checkpoints, stale `.tmp` files
4. Adds tests specifically for cleanup behavior

### Cleanup semantics by run outcome

| Run outcome | CLI log | Snapshot | Checkpoint log | `.tmp` file |
|------------|---------|----------|---------------|-------------|
| Success (zero errors, no loop termination) | "Persistence cleared" | Deleted | Deleted | Deleted |
| Error/halt (dispatch failure, rate limit) | "Persistence preserved for resume" | Kept | Kept | Cleaned at startup |
| Interrupted (SIGINT/SIGTERM) | "Persistence preserved for resume" | Kept | Kept | Cleaned at startup |
| Loop termination (max-iterations, circuit-breaker) | "Persistence preserved for resume" | Kept | Kept | Cleaned at startup |
| Re-entry after 'completed' | Cleared silently | Deleted (stale) | Deleted (stale) | Deleted |

### Orphaned checkpoint log scenario

This is the specific edge case motivating T6:

1. Run A fails after completing 3 tasks → snapshot + checkpoint log written
2. Run B resumes, completes successfully → success branch fires
3. `clearSnapshot()` succeeds → snapshot gone
4. `clearCheckpointLog()` throws (file locked, permissions, disk full) → checkpoint log remains
5. Run C starts → no snapshot on disk, but checkpoint log exists with entries from run A/B
6. Without T6: engine sees no snapshot, starts fresh, but the orphaned checkpoint log is loaded on a future config-mismatch resume and may cause incorrect skips
7. With T6: engine detects the inconsistency (checkpoints without snapshot), clears the orphan, logs a warning

### File size budget

Current sizes → estimated after changes:
- `workflow-persistence.ts`: 244 lines → ~275 lines (+30 for `clearAllPersistence` and `cleanStaleTmpFiles`)
- `workflow-runner.ts`: 207 lines → ~220 lines (+13 for startup cleanup, re-entry cleanup, log messages)
- `workflow-story-machine.ts`: 233 lines → unchanged (this story does not modify the story machine)

All within the 300-line NFR18 limit.

### What NOT to change

- Do NOT modify `clearSnapshot()` or `clearCheckpointLog()` — they remain as individual low-level functions. `clearAllPersistence()` is the higher-level orchestrator.
- Do NOT add cleanup to the story machine — cleanup is the runner's responsibility.
- Do NOT delete the `.codeharness/` directory itself — other files may live there (contracts, workflow-state.yaml).

### References

- [Source: _bmad-output/planning-artifacts/architecture-xstate-engine.md#AD3: Persistence]
- [Source: _bmad-output/implementation-artifacts/26-1-xstate-snapshot-persistence.md]
- [Source: _bmad-output/implementation-artifacts/26-3-semantic-checkpoint-log.md]
- [Source: src/lib/workflow-persistence.ts] (extended with clearAllPersistence, cleanStaleTmpFiles)
- [Source: src/lib/workflow-runner.ts] (cleanup wiring, log messages, startup cleanup)

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/26-4-clear-persistence-on-completion-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/26-4-clear-persistence-on-completion.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

</story-spec>
