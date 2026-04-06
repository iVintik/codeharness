<story-spec>

# Story 26-1: XState snapshot persistence via `getPersistedSnapshot()`

Status: ready-for-dev

## Story

As a workflow operator,
I want the engine to save a full XState snapshot after every task completion and on interrupt,
So that if the process crashes or is interrupted, I can resume from exactly where it stopped without re-running completed tasks.

## Context

**Epic 26: Persistence & Resume** — this is story 1 of 4. Epic 25 (XState Machine Hierarchy) is complete: `gateMachine`, `storyMachine`, `epicMachine`, `runMachine` all exist as real XState machines with `setup()` + `createMachine()`.

**What exists and is usable:**

- `workflow-run-machine.ts` (200 lines): `runMachine` with typed `RunContext`/`RunOutput`, `runEpicActor`, for_each epic iteration, INTERRUPT handling, 4 final states (`allDone`, `halted`, `interrupted`).
- `workflow-epic-machine.ts`: `epicMachine` with `EpicOutput` — child of run machine.
- `workflow-story-machine.ts`: `storyMachine` with `StoryFlowOutput` — child of epic machine.
- `workflow-gate-machine.ts`: `gateMachine` with `GateOutput` — child of story/epic machines.
- `workflow-persistence.ts` (138 lines): Current basic persistence — saves `WorkflowSnapshot` (workflowState, errors, tasksCompleted, storiesProcessed) as JSON. Does NOT use XState's `getPersistedSnapshot()`. No config hash. No checkpoint log.
- `workflow-runner.ts` (163 lines): `runWorkflowActor()` composition root. Currently uses `readWorkflowState()`/`writeWorkflowState()` from `workflow-state.ts` for persistence — does NOT use `workflow-persistence.ts` snapshot mechanism.
- `workflow-types.ts` (282 lines): All shared types including `RunContext`, `EngineConfig`, `EngineResult`, `WorkflowState`.
- `workflow-state.ts`: Legacy YAML-based `readWorkflowState()`/`writeWorkflowState()` — still the active persistence mechanism in `workflow-runner.ts`.

**What this story builds:**

Replace the current basic persistence with real XState snapshot persistence:
1. Save XState `getPersistedSnapshot()` output after every task completion via inspect callback
2. Save snapshot on INTERRUPT event before actor stops
3. Store config hash alongside snapshot for invalidation on config changes
4. Atomic writes (write to temp file, rename) to prevent corruption
5. Clear snapshot on successful workflow completion
6. Wire the inspect callback into `runWorkflowActor()` so snapshots are saved automatically

**What this story does NOT build (deferred to later stories):**
- Resume from snapshot (`createActor(machine, { snapshot })`) — that's story 26-2
- Semantic checkpoint log — that's story 26-3
- Clear persistence on completion + error preservation — that's story 26-4

**Key architectural decisions (from architecture-xstate-engine.md):**
- AD3: Primary persistence via `getPersistedSnapshot()`. Exact machine state restore. Invalidated by config hash mismatch.
- AD3: Storage at `.codeharness/workflow-snapshot.json`. JSON format. Atomic write.
- AD3: Save frequency — every task completion + interrupt + error. Via inspect callback on state transitions.
- NFR2: All state writes atomic.

## Acceptance Criteria

1. **Given** a workflow run that completes at least one task successfully, **When** the user inspects the `.codeharness/` directory via `ls .codeharness/`, **Then** a file named `workflow-snapshot.json` is present.
   <!-- verification: docker exec / ls .codeharness/ | grep workflow-snapshot.json -->

2. **Given** a workflow run where three tasks complete in sequence, **When** the user reads `.codeharness/workflow-snapshot.json` after the run, **Then** the JSON file contains a top-level `snapshot` field (the XState persisted snapshot), a `configHash` field (a non-empty string), and a `savedAt` field (an ISO 8601 timestamp).
   <!-- verification: docker exec / cat .codeharness/workflow-snapshot.json | jq '.snapshot, .configHash, .savedAt' — all non-null -->

3. **Given** a workflow run that is interrupted (user sends SIGINT or presses q), **When** the user reads `.codeharness/workflow-snapshot.json`, **Then** the file exists and contains a valid snapshot saved before the actor stopped — the `savedAt` timestamp is within 5 seconds of the interrupt time.
   <!-- verification: interrupt workflow via signal, then cat .codeharness/workflow-snapshot.json | jq '.savedAt' — timestamp present and recent -->

4. **Given** a workflow run where the first task completes and then a second task is dispatched, **When** the user reads `.codeharness/workflow-snapshot.json` after the first task completes (before second finishes), **Then** the snapshot reflects the state after the first task — the file is updated after each task completion, not just at the end.
   <!-- verification: monitor file modification time during run; mtime updates after each task dispatch completes -->

5. **Given** a workflow run that completes successfully with zero errors, **When** the user checks `.codeharness/workflow-snapshot.json` after the run finishes, **Then** the file does NOT exist — it was cleaned up on successful completion.
   <!-- verification: after successful run, ls .codeharness/workflow-snapshot.json returns "No such file" -->

6. **Given** a workflow run that halts due to errors (e.g., all retries exhausted, rate limit), **When** the user checks `.codeharness/workflow-snapshot.json`, **Then** the file EXISTS and is preserved — it was NOT cleaned up because the run did not complete successfully.
   <!-- verification: after halted run, cat .codeharness/workflow-snapshot.json returns valid JSON -->

7. **Given** a saved `workflow-snapshot.json` file, **When** the user reads its content, **Then** the `configHash` field is a deterministic hash string — running the same workflow config always produces the same hash value, and changing any task definition or workflow step produces a different hash.
   <!-- verification: run workflow twice with same config, compare configHash values — they match. Change a task model, run again — configHash differs. -->

8. **Given** a workflow snapshot file that was partially written (simulated by truncating the file to 50 bytes), **When** the engine attempts to load it on the next run, **Then** the engine logs a warning message containing "corrupt" or "invalid" and treats it as if no snapshot exists — the run starts fresh without crashing.
   <!-- verification: truncate .codeharness/workflow-snapshot.json to 50 bytes, start run, check logs for warning -->

9. **Given** the project directory has no `.codeharness/` directory, **When** a workflow run starts and the first task completes, **Then** the `.codeharness/` directory is created automatically and the snapshot file is written — no error about missing directory.
   <!-- verification: rm -rf .codeharness/, start workflow, ls .codeharness/workflow-snapshot.json — file exists -->

10. **Given** a workflow run in progress, **When** a power failure is simulated by killing the process with SIGKILL during a task, **Then** on the next run the snapshot file is either valid JSON (from the last successful atomic write) or absent — it is never a partially-written corrupt file that crashes the engine.
    <!-- verification: kill -9 during task, then start new run — engine starts without crash, logs indicate fresh start or loaded snapshot -->

11. **Given** the codebase after implementation, **When** `npm run build` is executed, **Then** it exits with code 0.
    <!-- verification: npm run build exits 0 -->

12. **Given** the full test suite, **When** `npx vitest run` is executed, **Then** zero failures — no regressions.
    <!-- verification: npx vitest run exits 0 -->

13. **Given** the workflow-persistence.ts file, **When** its line count is checked, **Then** it is ≤ 300 lines (per NFR18).
    <!-- verification: wc -l src/lib/workflow-persistence.ts ≤ 300 -->

## Tasks / Subtasks

### T1: Add config hash computation (AC: #7)

- Create `computeConfigHash(config: EngineConfig): string` in `workflow-persistence.ts`
- Hash the resolved workflow definition (tasks + storyFlow + epicFlow + execution settings) deterministically
- Use Node.js `crypto.createHash('sha256')` on `JSON.stringify(config.workflow)` with sorted keys
- The hash must be stable: same config → same hash across runs
- Export for use in runner and tests

### T2: Upgrade snapshot format with XState persisted state (AC: #2)

- Redefine `WorkflowSnapshot` interface:
  ```typescript
  interface XStateWorkflowSnapshot {
    snapshot: unknown;      // XState getPersistedSnapshot() output
    configHash: string;     // from T1
    savedAt: string;        // ISO timestamp
    workflowState: WorkflowState;  // semantic state for backward compat
  }
  ```
- Update `saveSnapshot()` to accept the XState snapshot object + config hash
- Update `loadSnapshot()` to validate the new shape
- Update `isValidSnapshot()` to check for `snapshot`, `configHash`, `savedAt` fields

### T3: Implement atomic write for snapshot save (AC: #10, NFR2)

- Modify `saveSnapshot()` to write atomically:
  1. Write to `.codeharness/workflow-snapshot.json.tmp`
  2. `fs.renameSync()` to `.codeharness/workflow-snapshot.json`
- `renameSync` is atomic on POSIX systems — no partial writes visible
- Handle the `.tmp` file cleanup on load (delete stale `.tmp` if found)

### T4: Add corrupt snapshot handling (AC: #8)

- `loadSnapshot()` already handles invalid JSON — extend to handle:
  - Truncated files (JSON.parse fails)
  - Valid JSON but wrong shape (missing `snapshot` or `configHash`)
  - Log a warning with "corrupt" or "invalid" in the message
  - Return `null` (treat as no snapshot)

### T5: Wire inspect callback for automatic snapshot saves (AC: #1, #4)

- In `workflow-runner.ts`, when creating the run machine actor:
  1. Add `inspect` callback to `createActor(runMachine, { input, inspect })`
  2. On `@xstate.snapshot` events that indicate a task completion (state transition after invoke onDone), call `saveSnapshot()` with `actor.getPersistedSnapshot()`
  3. Compute config hash once before actor creation, pass to save function
- The inspect callback fires on every state transition — filter to save only on meaningful transitions (task completions, not intermediate guard evaluations)

### T6: Save snapshot on INTERRUPT before actor stops (AC: #3)

- In `workflow-runner.ts`, modify the SIGINT/INTERRUPT handling:
  1. Before stopping the actor, call `getPersistedSnapshot()` on the actor
  2. Save the snapshot via `saveSnapshot()`
  3. Then stop the actor
- This ensures the last good state is captured on interrupt

### T7: Clear snapshot on successful completion (AC: #5, #6)

- In `workflow-runner.ts`, after `runWorkflowActor()` determines the run completed successfully:
  - Call `clearSnapshot(projectDir)` to delete the snapshot file
- On error/halt/interrupt: do NOT clear — preserve for resume (story 26-2)
- `clearSnapshot()` already exists and works — just wire it into the success path

### T8: Ensure `.codeharness/` directory creation (AC: #9)

- `saveSnapshot()` already calls `mkdirSync(stateDir, { recursive: true })` — verify this works when directory doesn't exist
- Add test coverage for this case

### T9: Write unit tests (AC: #11, #12)

- Test: `computeConfigHash()` — same config → same hash, different config → different hash
- Test: `saveSnapshot()` writes valid JSON with `snapshot`, `configHash`, `savedAt` fields
- Test: `saveSnapshot()` uses atomic write (temp file + rename)
- Test: `loadSnapshot()` returns null for truncated/corrupt files with warning
- Test: `loadSnapshot()` returns null when file doesn't exist
- Test: `loadSnapshot()` returns valid snapshot when file is well-formed
- Test: `clearSnapshot()` deletes the file
- Test: `clearSnapshot()` is a no-op when file doesn't exist
- Test: Integration — actor with inspect callback triggers snapshot save on task completion
- Test: Snapshot not cleared on halted/errored run
- Test: Snapshot cleared on successful run
- Mock `fs` operations for unit tests, use real filesystem for integration tests

### T10: Verify build, lint, and file size (AC: #11, #12, #13)

- `npm run build` exits 0
- `npx vitest run` — all tests pass, zero regressions
- `wc -l src/lib/workflow-persistence.ts` ≤ 300 lines
- `npx eslint src/lib/workflow-persistence.ts` exits 0

## Dev Notes

### XState's `getPersistedSnapshot()` API

XState v5 provides `actor.getPersistedSnapshot()` which returns a serializable representation of the full machine state — including nested child machines, context values, and state paths. This is different from `actor.getSnapshot()` which includes non-serializable references. The persisted snapshot can be passed back to `createActor(machine, { snapshot })` for exact resume (story 26-2 concern).

Key: `getPersistedSnapshot()` is called on the actor instance, not the machine. The runner creates the actor, so the runner is the right place to call this.

### Inspect API for save triggers

XState v5's `inspect` callback receives events like `@xstate.snapshot`, `@xstate.event`, `@xstate.actor`. We want to save on `@xstate.snapshot` events that correspond to task completions (invoke `onDone` transitions). The inspect callback sees ALL state transitions including guard evaluations and intermediate states — we need to filter.

Strategy: save on `@xstate.snapshot` events where the snapshot's state value has changed (not just context). This avoids saving on every minor context update while capturing all meaningful state transitions.

Alternative simpler strategy: save on every `@xstate.snapshot` event with a debounce. Since atomic writes are fast, saving frequently is acceptable.

### Atomic write pattern

```typescript
const tmpPath = snapshotPath + '.tmp';
writeFileSync(tmpPath, JSON.stringify(snapshot, null, 2), 'utf-8');
renameSync(tmpPath, snapshotPath);
```

`renameSync` is atomic on POSIX (ext4, APFS, etc.). On Windows, it's not guaranteed atomic but is still better than direct overwrite. For a CLI tool, POSIX atomicity is sufficient.

### Config hash for invalidation

The config hash ensures that a snapshot from a different workflow configuration isn't used. This is critical: if the user changes their workflow YAML (adds/removes tasks, changes gate config), the snapshot's state paths may not match the new machine structure, causing XState to throw or misbehave.

Hash input: `JSON.stringify(config.workflow)` with keys sorted. This captures tasks, storyFlow, epicFlow, and execution settings. It does NOT include runtime config like `projectDir` or `abortSignal`.

### Relationship to existing persistence

Current state:
- `workflow-state.ts` has `readWorkflowState()`/`writeWorkflowState()` — writes `workflow-state.yaml` (YAML format)
- `workflow-persistence.ts` has `saveSnapshot()`/`loadSnapshot()` — writes `workflow-state.json` (JSON format, basic shape)
- `workflow-runner.ts` uses `workflow-state.ts` only — ignores `workflow-persistence.ts`

After this story:
- `workflow-persistence.ts` upgraded to use XState persisted snapshots with config hash and atomic writes
- `workflow-runner.ts` wires inspect callback to save snapshots automatically
- `workflow-state.ts` remains for backward compat (other consumers may still read workflow-state.yaml)
- Both `workflow-state.yaml` and `workflow-snapshot.json` may coexist during transition

### File boundaries

- `workflow-persistence.ts`: snapshot save/load/clear, config hash computation, atomic write, validation
- `workflow-runner.ts`: inspect callback wiring, interrupt snapshot save, completion cleanup
- No changes to machine files (`run-machine.ts`, `epic-machine.ts`, etc.) — machines are unaware of persistence

### What this story does NOT do

- Does not implement resume from snapshot (story 26-2)
- Does not implement semantic checkpoint log (story 26-3)
- Does not implement `loadSnapshot()` → `createActor(machine, { snapshot })` path
- Does not modify any machine files
- Does not remove `workflow-state.ts` or the YAML persistence — that's a migration concern

### References

- [Source: _bmad-output/planning-artifacts/architecture-xstate-engine.md#AD3: Persistence]
- [Source: _bmad-output/planning-artifacts/epics-xstate-engine.md#Epic 5: Persistence & Resume]
- [Source: _bmad-output/implementation-artifacts/tech-spec-migrate-engine-to-xstate.md#Task 7]
- [Source: src/lib/workflow-persistence.ts] (current implementation to upgrade)
- [Source: src/lib/workflow-runner.ts] (composition root to wire)

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/26-1-xstate-snapshot-persistence-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/26-1-xstate-snapshot-persistence.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-5

### Debug Log References
None — clean implementation with no regressions.

### Completion Notes List
- Implemented `computeConfigHash()` using SHA-256 on stable-key-sorted JSON of `config.workflow`
- New `XStateWorkflowSnapshot` type with `snapshot`, `configHash`, `savedAt` fields
- Atomic write via `.tmp` → `renameSync` pattern in `saveSnapshot()`
- `loadSnapshot()` handles truncated JSON (warns "corrupt"), wrong shape (warns "invalid"), stale `.tmp` cleanup
- `workflow-runner.ts`: subscribe callback saves snapshot after every state transition; `clearSnapshot()` called on success
- 6 test files updated with `clearSnapshot` and `computeConfigHash` in mock definitions
- Snapshot file renamed from `workflow-state.json` → `workflow-snapshot.json` per story spec
- All `// IGNORE:` comments added to catch blocks per codebase convention
- 20 new tests in `workflow-persistence.test.ts`; all 5177 tests pass; zero lint warnings

### File List
- `src/lib/workflow-persistence.ts` — full upgrade (186 lines, ≤ 300 NFR18 ✓)
- `src/lib/workflow-runner.ts` — subscribe-based snapshot saving, clearSnapshot on success (180 lines)
- `src/lib/__tests__/workflow-persistence.test.ts` — rewritten for new API (20 tests)
- `src/lib/__tests__/workflow-actors.test.ts` — mock updated
- `src/lib/__tests__/workflow-machines.test.ts` — mock updated
- `src/lib/__tests__/driver-health-check.test.ts` — mock updated
- `src/lib/__tests__/null-task-engine.test.ts` — mock updated
- `src/lib/__tests__/workflow-runner.test.ts` — mock updated
- `src/lib/__tests__/story-flow-execution.test.ts` — mock updated
- `src/lib/AGENTS.md` — updated exports table

</story-spec>
