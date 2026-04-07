<story-spec>

# Story 26-2: Snapshot resume with config hash validation

Status: ready-for-dev

## Story

As a workflow operator,
I want the engine to automatically resume from a saved snapshot when the workflow config has not changed,
So that crash recovery is instant and I do not re-run tasks that already completed.

## Context

**Epic 26: Persistence & Resume** — this is story 2 of 4. Story 26-1 (XState snapshot persistence) is complete: snapshots are saved after every state transition, on interrupt, and cleared on successful completion. The snapshot file at `.codeharness/workflow-snapshot.json` contains the full XState persisted state, a `configHash`, and a `savedAt` timestamp. Corrupt files are handled gracefully.

**What exists (from 26-1):**

- Snapshot persistence: `saveSnapshot()`, `loadSnapshot()`, `clearSnapshot()`, `computeConfigHash()` all working in `workflow-persistence.ts`
- Snapshots saved automatically via subscribe callback in `workflow-runner.ts` after every state transition
- Atomic writes prevent corruption (temp file + rename)
- Snapshot cleared on successful completion, preserved on error/halt/interrupt
- Corrupt/invalid snapshot detection with warning logs

**What this story builds:**

Wire the resume path into the workflow runner:
1. On startup, check for a saved snapshot
2. Compare the saved config hash against the current config's hash
3. If hashes match: resume from snapshot (skip already-completed tasks)
4. If hashes don't match: discard snapshot, log warning, start fresh
5. If no snapshot: start fresh (current behavior)
6. Log clear messages so the operator can see whether the run resumed or started fresh

**What this story does NOT build (deferred):**
- Semantic checkpoint log fallback (story 26-3) — on hash mismatch, we start fresh, not fast-forward
- Clear persistence on completion refinements (story 26-4)

**Architecture reference:**
- AD3 Resume flow step 1: load snapshot → check config hash → if match: instant resume
- AD3 Resume flow step 2: if mismatch or no snapshot: start fresh

## Acceptance Criteria

1. **Resume on matching config**
   **Given** a workflow run that was interrupted (Ctrl+C / SIGINT) after completing at least two tasks,
   **When** the operator starts a new run with the same workflow config (`codeharness run`),
   **Then** the CLI output contains the text "Resuming from snapshot" AND the previously completed tasks are NOT re-executed (their names do not appear in the new run's task dispatch log).
   <!-- verify: CLI output inspection (grep for "Resuming from snapshot"), task dispatch log shows only remaining tasks -->

2. **Discard snapshot on config change**
   **Given** a saved snapshot from a previous interrupted run,
   **When** the operator modifies the workflow YAML (e.g., adds a new task, changes a gate's `max_retries`, or changes a task's `model`) and starts a new run,
   **Then** the CLI output contains the text "config changed" AND the text "starting fresh", AND the run begins from the first task.
   <!-- verify: CLI output inspection (grep for "config changed" and "starting fresh"), first task in workflow is dispatched -->

3. **Fresh start when no snapshot exists**
   **Given** no `.codeharness/workflow-snapshot.json` file exists (first run or after successful completion),
   **When** the operator starts a new run,
   **Then** the CLI output does NOT contain "Resuming" or "snapshot" in any resume-related context, AND the run starts from the first task normally.
   <!-- verify: delete workflow-snapshot.json if present, run codeharness run, grep CLI output for "Resuming" — no matches, first task dispatched -->

4. **Graceful handling of corrupt snapshot**
   **Given** the `.codeharness/workflow-snapshot.json` file exists but is corrupt (e.g., truncated to 50 bytes of garbage),
   **When** the operator starts a new run,
   **Then** the CLI output contains a warning with "corrupt" or "invalid", the process does NOT crash, AND the run starts fresh from the beginning.
   <!-- verify: echo "garbage" > .codeharness/workflow-snapshot.json, run codeharness run, check CLI for warning text, confirm run starts from first task without crash -->

5. **Snapshot updated after resumed task completion**
   **Given** a workflow run that resumes from a snapshot,
   **When** the resumed run completes one additional task,
   **Then** the `savedAt` timestamp in `.codeharness/workflow-snapshot.json` is newer than it was before the resumed run started.
   <!-- verify: record savedAt from snapshot file before resume, let one task complete, read savedAt again — it is more recent -->

6. **Snapshot cleaned up after successful resumed completion**
   **Given** a workflow run that resumes from a snapshot and then completes all remaining tasks successfully with zero errors,
   **When** the run finishes,
   **Then** the `.codeharness/workflow-snapshot.json` file no longer exists on disk.
   <!-- verify: after successful resumed run, ls .codeharness/workflow-snapshot.json → "No such file or directory" -->

7. **Snapshot preserved after error on resumed run**
   **Given** a workflow run that resumes from a snapshot and then encounters an error (e.g., rate limit, max retries exhausted),
   **When** the run halts,
   **Then** the `.codeharness/workflow-snapshot.json` file still exists and contains valid JSON.
   <!-- verify: after halted resumed run, cat .codeharness/workflow-snapshot.json → valid JSON output with snapshot, configHash, savedAt fields -->

8. **Multi-interrupt resume chain**
   **Given** a workflow with at least three tasks where the operator interrupts after task 1 completes, resumes and lets task 2 complete then interrupts again,
   **When** the operator starts a third run (same config),
   **Then** the CLI shows "Resuming from snapshot" AND neither task 1 nor task 2 are re-executed — the run continues from task 3.
   <!-- verify: interrupt after task 1, resume + interrupt after task 2, resume again — CLI output shows resume message, task dispatch log shows only task 3 onward -->

9. **Build succeeds**
   **Given** the codebase after implementation,
   **When** `npm run build` is executed,
   **Then** it exits with code 0.
   <!-- verify: npm run build → exit code 0 -->

10. **All tests pass**
    **Given** the full test suite,
    **When** `npx vitest run` is executed,
    **Then** all tests pass with zero failures.
    <!-- verify: npx vitest run → exit code 0, output shows 0 failed -->

## Tasks / Subtasks

### T1: Add snapshot load and resume logic to `runWorkflowActor()` (AC: #1, #3)

- Import `loadSnapshot` from `workflow-persistence.ts` in `workflow-runner.ts`
- After computing `configHash` (already done in 26-1), call `loadSnapshot(projectDir)`
- If a snapshot is returned and `snapshot.configHash === configHash`:
  - Log `info('Resuming from snapshot — config hash matches')`
  - Pass `snapshot.snapshot` to `createActor(runMachine, { input: runInput, snapshot: snapshot.snapshot })`
- If no snapshot: proceed with current fresh-start behavior (no log message)
- XState v5's `createActor` accepts `{ snapshot }` option to restore persisted state

### T2: Add config hash mismatch detection and discard (AC: #2)

- If a snapshot is returned but `snapshot.configHash !== configHash`:
  - Log `warn('workflow-runner: Snapshot config changed (saved: <first8chars>, current: <first8chars>) — starting fresh')`
  - Call `clearSnapshot(projectDir)` to remove the stale file
  - Proceed with fresh actor creation (no snapshot)
- The warning must contain "config changed" and "starting fresh" for verification

### T3: Verify corrupt snapshot handling integrates correctly (AC: #4)

- `loadSnapshot()` already returns `null` and logs warnings for corrupt files (implemented in 26-1)
- Verify this path integrates correctly: when `loadSnapshot()` returns null, the runner starts fresh
- No new code needed in `loadSnapshot()` — just ensure the runner treats null as "no snapshot"

### T4: Verify resumed runs still save updated snapshots (AC: #5)

- The existing subscribe callback saves snapshots after every state transition — verify this works for resumed actors too
- XState actors created with `{ snapshot }` emit state transitions like normal actors
- No new code expected — just test coverage

### T5: Verify cleanup and preservation behavior on resumed runs (AC: #6, #7)

- The existing completion logic clears snapshot on success and preserves on error/halt
- Verify this works identically for resumed runs as for fresh runs
- No new code expected — just test coverage

### T6: Verify multi-resume chains work (AC: #8)

- Each resume creates an actor from the latest snapshot
- Each state transition overwrites the snapshot with current state
- Second resume picks up from the latest snapshot, not the original
- No new code expected — the save-on-transition and load-on-start logic handles this

### T7: Write unit tests (AC: #9, #10)

- Test: `runWorkflowActor()` with matching snapshot → actor created with snapshot option
- Test: `runWorkflowActor()` with mismatched configHash → snapshot discarded, fresh start
- Test: `runWorkflowActor()` with no snapshot → fresh start, no resume log
- Test: `runWorkflowActor()` with corrupt snapshot (loadSnapshot returns null) → fresh start
- Test: resumed actor still saves snapshots on state transitions
- Test: resumed actor clears snapshot on successful completion
- Test: resumed actor preserves snapshot on error/halt
- Mock `loadSnapshot`, `saveSnapshot`, `clearSnapshot`, `computeConfigHash` in tests
- Extend existing `workflow-runner.test.ts` with resume-specific describe block

### T8: Verify build and tests (AC: #9, #10)

- `npm run build` exits 0
- `npx vitest run` — all tests pass, zero regressions

## Dev Notes

### XState v5 `createActor` with snapshot

XState v5's `createActor(machine, { snapshot })` restores the actor to the exact state captured by `getPersistedSnapshot()`. The snapshot includes the current state value (nested state path), all context values, child actor states, and history states.

The `input` option is still required alongside `snapshot` — XState uses input for the machine's initial context setup, then overlays the snapshot's state. If the machine structure has changed (different states, guards, etc.), XState will throw or behave unpredictably — hence the config hash check.

Key: `createActor(machine, { input, snapshot })` — both are passed.

### Minimal code changes expected

The core change is ~15 lines in `runWorkflowActor()`:
1. Call `loadSnapshot(projectDir)` (~1 line)
2. Compare hashes (~3 lines)
3. Branch on match/mismatch/null (~10 lines)
4. Pass snapshot to `createActor` if resuming (~1 line)

Everything else (save, clear, corrupt handling) was built in 26-1.

### What to watch for

- **State/input compatibility**: The `input` passed to `createActor` on resume should match what was used in the original run. If work items changed between runs (new stories added to sprint), the snapshot's state may reference indices that are out of bounds. The config hash check catches workflow YAML changes, but sprint-status changes are NOT captured by config hash. Acceptable for now — story 26-3's checkpoint log handles this.
- **Subscribe callback on resumed actors**: Verify that `actor.subscribe()` fires for resumed actors. XState should emit the restored state as the first snapshot, triggering a save. Harmless but should not cause errors.
- **Phase state on resume**: The legacy `readWorkflowState()` still runs before resume. On a previous interrupt, the phase was set to `interrupted` or `failed`. Ensure that `interrupted`/`failed` phases do not block resume — the XState snapshot should take precedence.

### File boundaries

- `workflow-runner.ts`: all changes go here — load snapshot, compare hash, pass to createActor
- `workflow-persistence.ts`: no changes expected — loadSnapshot/clearSnapshot already exist
- No changes to machine files — machines are unaware of persistence

### What this story does NOT do

- Does not implement semantic checkpoint log (story 26-3)
- Does not handle sprint-status changes between runs (config hash only covers workflow YAML)
- Does not modify `loadSnapshot()` or any persistence functions
- Does not modify any machine files
- Does not remove legacy `workflow-state.ts` persistence

### References

- [Source: _bmad-output/planning-artifacts/architecture-xstate-engine.md#AD3: Persistence — Resume flow]
- [Source: _bmad-output/planning-artifacts/epics-xstate-engine.md#Story 5.2]
- [Source: _bmad-output/implementation-artifacts/26-1-xstate-snapshot-persistence.md]
- [Source: src/lib/workflow-persistence.ts] (loadSnapshot, computeConfigHash — used, not modified)
- [Source: src/lib/workflow-runner.ts] (runWorkflowActor — primary change target)

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/26-2-snapshot-resume-config-hash-validation-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/26-2-snapshot-resume-config-hash-validation.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

</story-spec>
