<story-spec>

# Story 26-2: Snapshot resume with config hash validation

Status: review

## Story

As a workflow operator,
I want the engine to automatically resume from a saved snapshot when the workflow config has not changed,
So that crash recovery is instant and I do not re-run tasks that already completed.

## Context

**Epic 26: Persistence & Resume** — this is story 2 of 4. Story 26-1 (XState snapshot persistence) is complete: `saveSnapshot()`, `loadSnapshot()`, `clearSnapshot()`, `computeConfigHash()` all exist and work. Snapshots are saved after every state transition via a subscribe callback in `workflow-runner.ts`. Atomic writes prevent corruption.

**What exists and is usable:**

- `workflow-persistence.ts` (186 lines): `saveSnapshot()` writes XState `getPersistedSnapshot()` to `.codeharness/workflow-snapshot.json` atomically. `loadSnapshot()` returns `XStateWorkflowSnapshot | null` with corrupt/invalid handling. `computeConfigHash()` produces a deterministic SHA-256 of `config.workflow`. `clearSnapshot()` deletes the file.
- `workflow-runner.ts` (180 lines): `runWorkflowActor()` composition root. Creates `runMachine` actor with `createActor(runMachine, { input: runInput })`. Subscribes to state transitions to save snapshots. Clears snapshot on successful completion. Does NOT currently call `loadSnapshot()` or attempt resume — always starts fresh.
- `workflow-run-machine.ts`: `runMachine` with typed `RunMachineContext`/`RunOutput`, for_each epic iteration, INTERRUPT handling, 4 final states.
- `workflow-state.ts`: Legacy `readWorkflowState()`/`writeWorkflowState()` — still the active mechanism for tracking phase and task completions.
- `workflow-types.ts` (282 lines): All shared types including `RunMachineContext`, `EngineConfig`, `EngineResult`.

**What this story builds:**

Wire the resume path into `runWorkflowActor()`:
1. On startup, call `loadSnapshot()` to check for a saved snapshot
2. Compare the saved `configHash` against the current config's hash
3. If hashes match: pass the snapshot to `createActor(runMachine, { input, snapshot })` for instant resume
4. If hashes do not match: discard the snapshot, log a warning, start fresh
5. If no snapshot exists: start fresh (current behavior)
6. Log clear messages so the operator can see whether the run resumed or started fresh

**What this story does NOT build (deferred to later stories):**
- Semantic checkpoint log fallback (story 26-3) — on hash mismatch, we start fresh, not fast-forward
- Clear persistence on completion refinements (story 26-4) — current cleanup from 26-1 is sufficient

**Key architectural decisions (from architecture-xstate-engine.md):**
- AD3: Resume flow step 1 — load snapshot → check config hash → if match: `createActor(machine, { snapshot })` → instant resume
- AD3: Resume flow step 2 — if mismatch or no snapshot: compile fresh machine (checkpoint log fallback is story 26-3)
- AD3: Config hash comparison invalidates stale snapshots when workflow YAML changes

## Acceptance Criteria

1. **Given** a workflow run that was interrupted (Ctrl+C / SIGINT) after completing at least two tasks, **When** the operator starts a new run with the same workflow config (`codeharness run`), **Then** the CLI logs a message containing "Resuming from snapshot" and the run continues from where it left off — the previously completed tasks are NOT re-executed.
   <!-- verification: interrupt a run after 2+ tasks, restart, check CLI output for "Resuming from snapshot", verify previously completed tasks are not dispatched again -->

2. **Given** a saved snapshot from a previous interrupted run, **When** the operator modifies the workflow YAML (e.g., adds a new task, changes a gate's max_retries, or changes a task's model), and starts a new run, **Then** the CLI logs a message containing "config changed" and "starting fresh", and the run begins from the first task — the stale snapshot is NOT used.
   <!-- verification: interrupt a run, edit workflow YAML, restart, check CLI output for "config changed" message, verify run starts from beginning -->

3. **Given** a saved snapshot from a previous interrupted run, **When** the operator starts a new run with the same workflow config, **Then** the `.codeharness/workflow-snapshot.json` file's `configHash` field matches the hash that the engine computes for the current config — confirming the match check passed.
   <!-- verification: read workflow-snapshot.json before restart, note configHash; after resume starts, the same configHash is still present (not overwritten with a different value) -->

4. **Given** NO saved snapshot exists (first run or after a successful completion that cleaned up), **When** the operator starts a new run, **Then** the CLI does NOT log any resume-related messages and the run starts from the first task normally.
   <!-- verification: delete .codeharness/workflow-snapshot.json if present, start run, verify no "Resuming" or "snapshot" messages in output, run starts from first task -->

5. **Given** a corrupt snapshot file (e.g., truncated to 50 bytes), **When** the operator starts a new run, **Then** the CLI logs a warning containing "corrupt" or "invalid", does NOT crash, and starts the run fresh from the beginning.
   <!-- verification: truncate workflow-snapshot.json to 50 bytes, start run, check for warning in output, verify run starts fresh without error -->

6. **Given** a workflow run that resumes from a snapshot, **When** the resumed run completes one more task, **Then** the snapshot file is updated — the `savedAt` timestamp is newer than the original snapshot's timestamp.
   <!-- verification: note savedAt before resume, let one task complete, read savedAt again — it is more recent -->

7. **Given** a workflow run that resumes from a snapshot and then completes all remaining tasks successfully with zero errors, **When** the run finishes, **Then** the `.codeharness/workflow-snapshot.json` file is deleted — same cleanup behavior as a non-resumed run.
   <!-- verification: after successful resumed run, ls .codeharness/workflow-snapshot.json returns "No such file" -->

8. **Given** a workflow run that resumes from a snapshot and then encounters an error (e.g., rate limit, max retries), **When** the run halts, **Then** the snapshot file is preserved on disk for a future resume attempt.
   <!-- verification: after halted resumed run, cat .codeharness/workflow-snapshot.json returns valid JSON -->

9. **Given** two consecutive interrupts and restarts with the same config (interrupt → resume → interrupt → resume), **When** the operator starts the third run, **Then** the engine resumes from the latest snapshot (reflecting progress from the second run), not from the original first-run snapshot.
   <!-- verification: interrupt after task 1, resume and let task 2 complete then interrupt, resume again — task 1 and task 2 are NOT re-executed, run continues from task 3 -->

10. **Given** the codebase after implementation, **When** `npm run build` is executed, **Then** it exits with code 0.
    <!-- verification: npm run build exits 0 -->

11. **Given** the full test suite, **When** `npx vitest run` is executed, **Then** zero failures — no regressions.
    <!-- verification: npx vitest run exits 0 -->

12. **Given** the workflow-runner.ts file and workflow-persistence.ts file, **When** their line counts are checked, **Then** each is <= 300 lines (per NFR18).
    <!-- verification: wc -l src/lib/workflow-runner.ts <= 300, wc -l src/lib/workflow-persistence.ts <= 300 -->

## Tasks / Subtasks

### T1: Add `loadSnapshot` import and resume logic to `runWorkflowActor()` (AC: #1, #3, #4)

- Import `loadSnapshot` from `workflow-persistence.ts` in `workflow-runner.ts`
- After computing `configHash` (already done), call `loadSnapshot(projectDir)`
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

### T3: Handle corrupt snapshot gracefully (AC: #5)

- `loadSnapshot()` already returns `null` and logs warnings for corrupt files (implemented in 26-1)
- Verify this path integrates correctly: when `loadSnapshot()` returns null, the runner starts fresh
- No new code needed in `loadSnapshot()` — just ensure the runner treats null as "no snapshot"

### T4: Ensure resumed runs still save updated snapshots (AC: #6)

- The existing subscribe callback saves snapshots after every state transition — verify this works for resumed actors too
- XState actors created with `{ snapshot }` emit state transitions like normal actors
- No new code expected — just test coverage

### T5: Verify cleanup and preservation behavior on resumed runs (AC: #7, #8)

- The existing completion logic clears snapshot on success and preserves on error/halt
- Verify this works identically for resumed runs as for fresh runs
- No new code expected — just test coverage

### T6: Verify multi-resume chains work (AC: #9)

- Each resume creates an actor from the latest snapshot
- Each state transition overwrites the snapshot with current state
- Second resume picks up from the latest snapshot, not the original
- No new code expected — the save-on-transition and load-on-start logic handles this

### T7: Write unit tests (AC: #10, #11)

- Test: `runWorkflowActor()` with matching snapshot → actor created with snapshot option
- Test: `runWorkflowActor()` with mismatched configHash → snapshot discarded, fresh start
- Test: `runWorkflowActor()` with no snapshot → fresh start, no resume log
- Test: `runWorkflowActor()` with corrupt snapshot (loadSnapshot returns null) → fresh start
- Test: resumed actor still saves snapshots on state transitions
- Test: resumed actor clears snapshot on successful completion
- Test: resumed actor preserves snapshot on error/halt
- Mock `loadSnapshot`, `saveSnapshot`, `clearSnapshot`, `computeConfigHash` in tests
- Extend existing `workflow-runner.test.ts` with resume-specific describe block

### T8: Verify build, lint, and file size (AC: #10, #11, #12)

- `npm run build` exits 0
- `npx vitest run` — all tests pass, zero regressions
- `wc -l src/lib/workflow-runner.ts` <= 300 lines
- `wc -l src/lib/workflow-persistence.ts` <= 300 lines

## Dev Notes

### XState v5 `createActor` with snapshot

XState v5's `createActor(machine, { snapshot })` restores the actor to the exact state captured by `getPersistedSnapshot()`. The snapshot includes:
- The current state value (nested state path)
- All context values
- Child actor states (for compound/parallel machines)
- History states

The `input` option is still required alongside `snapshot` — XState uses input for the machine's initial context setup, then overlays the snapshot's state. If the machine structure has changed (different states, guards, etc.), XState will throw or behave unpredictably — hence the config hash check.

Key: `createActor(machine, { input, snapshot })` — both are passed. The snapshot takes precedence for state restoration, but input provides the typed context structure.

### Minimal code changes expected

The core change is ~15 lines in `runWorkflowActor()`:
1. Call `loadSnapshot(projectDir)` (~1 line)
2. Compare hashes (~3 lines)
3. Branch on match/mismatch/null (~10 lines)
4. Pass snapshot to `createActor` if resuming (~1 line)

Everything else (save, clear, corrupt handling) was built in 26-1.

### What to watch for

- **State/input compatibility**: The `input` passed to `createActor` on resume should match what was used in the original run. If work items changed between runs (new stories added to sprint), the snapshot's state may reference indices that are out of bounds. The config hash check catches workflow YAML changes, but sprint-status changes are NOT captured by config hash. This is acceptable for now — story 26-3's checkpoint log will handle this case.
- **Subscribe callback on resumed actors**: Verify that `actor.subscribe()` fires for resumed actors. XState should emit the restored state as the first snapshot, which will trigger a save. This is harmless (saves the same state back) but should not cause errors.
- **Phase state on resume**: The legacy `readWorkflowState()` still runs before resume. On a previous interrupt, the phase was set to `interrupted` or `failed`. The runner currently checks `phase === 'completed'` for early return. Ensure that `interrupted`/`failed` phases do not block resume — the XState snapshot should take precedence.

### Relationship to existing persistence

After this story:
- `workflow-persistence.ts` — unchanged from 26-1
- `workflow-runner.ts` — now calls `loadSnapshot()` on startup, uses result to decide fresh vs resume
- `workflow-state.ts` — unchanged, still used for legacy phase tracking
- Both YAML state and JSON snapshot coexist. The YAML tracks high-level phase, the JSON snapshot tracks exact XState machine state.

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
