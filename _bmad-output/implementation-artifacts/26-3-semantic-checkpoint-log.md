<story-spec>

# Story 26-3: Semantic checkpoint log for config-change resilient resume

Status: done

## Story

As a workflow operator,
I want an append-only checkpoint log that records each completed task semantically,
So that when I change my workflow YAML between runs, the engine can skip already-completed work instead of re-running everything from scratch.

## Context

**Epic 26: Persistence & Resume** — this is story 3 of 4. Stories 26-1 (XState snapshot persistence) and 26-2 (snapshot resume with config hash validation) are complete.

**What exists and is usable:**

- `workflow-persistence.ts` (187 lines): `saveSnapshot()`, `loadSnapshot()`, `clearSnapshot()`, `computeConfigHash()` — all working. Atomic writes via write-tmp-then-rename. Corrupt file detection. Config hash comparison for snapshot invalidation.
- `workflow-runner.ts` (195 lines): `runWorkflowActor()` composition root. On startup, loads snapshot via `loadSnapshot()`, compares config hash. If match → resumes from XState snapshot. If mismatch → logs warning, clears snapshot, starts fresh. Subscribes to state transitions and saves snapshots after every change. Clears snapshot on successful completion, preserves on halt/error/interrupt.
- `workflow-run-machine.ts`: `runMachine` — for_each epic iteration, INTERRUPT handling, 4 final states.
- `workflow-story-machine.ts`: `storyMachine` — child of epic machine, iterates through story flow steps.
- `workflow-types.ts` (282 lines): All shared types including `RunMachineContext`, `EngineConfig`, `EngineResult`, `WorkItem`.

**What this story builds:**

The second persistence layer (AD3 from architecture doc). When the XState snapshot is invalidated by a config change, the engine currently starts completely fresh — re-running every task. This story adds a semantic checkpoint log that survives config changes:

1. After each task completes, append a checkpoint entry to `.codeharness/workflow-checkpoints.jsonl` (one JSON object per line)
2. Each entry records the work item key, task name, and completion timestamp — enough to identify "this task was already done for this story"
3. On resume with a config mismatch (snapshot discarded), the engine reads the checkpoint log and builds a set of completed (storyKey, taskName) pairs
4. Guards in the story machine check this set before dispatching a task — if already completed, skip it
5. On successful run completion (zero errors), delete the checkpoint log alongside the snapshot

**What this story does NOT build (deferred to later stories):**
- Clear persistence refinements (story 26-4) — current cleanup logic is sufficient
- Partial gate resume (checkpoint log records gate pass/fail but does not restore gate iteration state)
- Checkpoint log compaction or rotation

**Key architectural decisions (from architecture-xstate-engine.md):**
- AD3: Dual-layer persistence — XState snapshot (fast resume) + semantic checkpoint log (config-change resilient)
- AD3: Resume flow step 2 — if mismatch or no snapshot: compile fresh machine → scan checkpoint log → skip completed tasks via guards
- AD3: Checkpoint log is the durable safety net; XState snapshot is the fast path
- Checkpoint format: append-only JSONL at `.codeharness/workflow-checkpoints.jsonl`

## Acceptance Criteria

1. **Given** a workflow run that completes at least two tasks successfully, **When** the operator inspects the `.codeharness/` directory during or after the run, **Then** a file named `workflow-checkpoints.jsonl` exists and contains one line per completed task, each line being valid JSON with at least `storyKey`, `taskName`, and `completedAt` fields.
   <!-- verification: start a run, let 2+ tasks complete, then cat .codeharness/workflow-checkpoints.jsonl — each line parses as JSON, each has storyKey/taskName/completedAt -->

2. **Given** a workflow run that was interrupted after completing tasks for two different stories, **When** the operator modifies the workflow YAML (e.g., adds a new task to the story flow) and starts a new run, **Then** the CLI logs a message containing "checkpoint" and "skipping" (or "skip"), and the previously completed tasks are NOT re-dispatched — the run proceeds only with tasks that were not yet done.
   <!-- verification: interrupt after tasks for 2 stories complete, edit workflow YAML, restart, check CLI output for skip message, verify completed tasks are not re-run by checking that no new contracts are created for those story+task combos -->

3. **Given** a workflow run that was interrupted after completing the "create-story" and "implement" tasks for story X, **When** the operator changes the workflow YAML and restarts, **Then** the run skips "create-story" and "implement" for story X but still runs the remaining tasks (e.g., quality gate, document) for story X.
   <!-- verification: interrupt after create-story+implement for one story, edit YAML, restart, verify those two tasks are skipped but subsequent tasks run — check CLI output and contracts directory -->

4. **Given** a checkpoint log from a previous run AND a valid XState snapshot with matching config hash, **When** the operator starts a new run without changing the config, **Then** the engine resumes from the XState snapshot (fast path) — the checkpoint log is NOT consulted for skip decisions.
   <!-- verification: interrupt a run (creates both snapshot and checkpoints.jsonl), restart without editing YAML, check CLI output says "Resuming from snapshot" NOT "checkpoint" — snapshot resume is the fast path -->

5. **Given** a checkpoint log from a previous run AND no snapshot file (or a snapshot with mismatched config hash), **When** the operator starts a new run, **Then** the engine reads the checkpoint log, starts a fresh machine, and skips tasks that appear in the log — the log is the fallback when snapshot resume is unavailable.
   <!-- verification: interrupt a run, delete workflow-snapshot.json (keep checkpoints.jsonl), restart, verify skip messages appear and previously completed tasks are not re-dispatched -->

6. **Given** NO checkpoint log file exists (first run or after successful cleanup), **When** the operator starts a run, **Then** no checkpoint-related skip messages appear in CLI output and all tasks run normally.
   <!-- verification: delete workflow-checkpoints.jsonl if present, start run, verify no "skip" or "checkpoint" messages, all tasks dispatch normally -->

7. **Given** a corrupt checkpoint log file (e.g., a line that is not valid JSON, or the file truncated mid-line), **When** the operator starts a new run, **Then** the engine logs a warning about the corrupt entry, skips only the entries that parsed successfully, does NOT crash, and proceeds with the run.
   <!-- verification: write 3 valid JSONL lines then append "CORRUPT{{{", restart, check for warning in CLI output, verify engine does not crash, verify the 3 valid entries are still used for skip decisions -->

8. **Given** a workflow run that resumes via checkpoint log (config changed) and then completes one more task, **When** that task finishes, **Then** the new completion is appended to the existing checkpoint log — the file now has entries from both the original run and the resumed run.
   <!-- verification: interrupt, edit YAML, restart, let one more task complete, cat checkpoints.jsonl — line count is original entries + 1 -->

9. **Given** a workflow run that completes all tasks successfully with zero errors (whether fresh or resumed), **When** the run finishes, **Then** both `.codeharness/workflow-snapshot.json` and `.codeharness/workflow-checkpoints.jsonl` are deleted.
   <!-- verification: after successful run, ls .codeharness/workflow-snapshot.json and ls .codeharness/workflow-checkpoints.jsonl both return "No such file" -->

10. **Given** a workflow run that halts with errors (e.g., rate limit, max retries) after completing some tasks, **When** the run stops, **Then** both the snapshot file and checkpoint log are preserved on disk for a future resume attempt.
    <!-- verification: after halted run, cat .codeharness/workflow-checkpoints.jsonl returns valid JSONL, cat .codeharness/workflow-snapshot.json returns valid JSON -->

11. **Given** the checkpoint log contains an entry for story X / task "implement", **When** a resumed run's story machine reaches the "implement" step for story X, **Then** the guard returns true (task already done) and the machine transitions past that step without invoking the dispatch actor — no driver process is spawned.
    <!-- verification: interrupt after "implement" for story X, edit YAML, restart, verify no dispatch log entry for story X / implement, verify the next task in the flow runs instead -->

12. **Given** the codebase after implementation, **When** `npm run build` is executed, **Then** it exits with code 0.
    <!-- verification: npm run build exits 0 -->

13. **Given** the full test suite, **When** `npx vitest run` is executed, **Then** zero failures — no regressions.
    <!-- verification: npx vitest run exits 0 -->

14. **Given** the workflow-runner.ts, workflow-persistence.ts, and workflow-story-machine.ts files, **When** their line counts are checked, **Then** each is <= 300 lines (per NFR18).
    <!-- verification: wc -l src/lib/workflow-runner.ts <= 300, wc -l src/lib/workflow-persistence.ts <= 300, wc -l src/lib/workflow-story-machine.ts <= 300 -->

## Tasks / Subtasks

### T1: Add checkpoint log types to `workflow-types.ts` (AC: #1)

- Define `CheckpointEntry` interface: `{ storyKey: string; taskName: string; completedAt: string; verdict?: 'pass' | 'fail'; costUsd?: number }`
- Define `CheckpointLog` type alias: `CheckpointEntry[]`
- Keep it dependency-free — types only

### T2: Add checkpoint log persistence functions to `workflow-persistence.ts` (AC: #1, #7, #9, #10)

- `appendCheckpoint(entry: CheckpointEntry, projectDir?: string): void` — append one JSON line to `.codeharness/workflow-checkpoints.jsonl`. Use `appendFileSync` with `\n` terminator. Create `.codeharness/` dir if missing.
- `loadCheckpointLog(projectDir?: string): CheckpointEntry[]` — read file, split by newline, parse each line as JSON. Skip blank lines. For lines that fail `JSON.parse`, log a warning (`corrupt checkpoint entry`) and skip them — do NOT throw. Return array of successfully parsed entries.
- `clearCheckpointLog(projectDir?: string): void` — delete `.codeharness/workflow-checkpoints.jsonl` if it exists. Best-effort, swallow errors.
- Keep atomic: each `appendFileSync` call writes a complete line. No partial writes across lines.
- Estimated: ~60 lines added to workflow-persistence.ts (total stays under 250)

### T3: Append checkpoint entries on task completion in `workflow-runner.ts` (AC: #1, #8)

- After the existing `saveSnapshot()` call in the subscribe callback, determine if the state transition represents a task completion (the run machine context's `tasksCompleted` counter increased)
- On task completion, call `appendCheckpoint({ storyKey, taskName, completedAt: new Date().toISOString() }, projectDir)`
- The storyKey and taskName must come from the machine context — inspect the `actor.getSnapshot().context` to extract the current story/task being processed
- Alternative approach: wire `appendCheckpoint` into the `onEvent` callback if the machine emits a task-done event — check which approach is cleaner and stays within file size limits

### T4: Build completed-tasks set from checkpoint log on config-mismatch resume (AC: #2, #3, #5)

- In `runWorkflowActor()`, when a config mismatch is detected (snapshot discarded), call `loadCheckpointLog(projectDir)`
- Build a `Set<string>` of `"${storyKey}::${taskName}"` from the loaded entries
- Pass this set into the machine input (add `completedTasks: Set<string>` to `RunMachineContext`)
- When no checkpoint log exists or it is empty, pass an empty set
- Log: `info('workflow-runner: Loaded N checkpoint(s) — will skip completed tasks')` when N > 0

### T5: Add skip guard to story machine (AC: #2, #3, #5, #11)

- In `workflow-story-machine.ts`, add a guard `isTaskAlreadyCompleted` that checks if `"${context.storyKey}::${context.currentTaskName}"` exists in `context.completedTasks`
- Wire the guard into the task dispatch state: before invoking the dispatch actor, check the guard. If true → transition to the next step (skip). If false → invoke as normal.
- The `completedTasks` set must flow down from run → epic → story machine context via the existing input functions
- Log: `info('workflow-runner: Skipping ${taskName} for ${storyKey} — checkpoint found')` when a task is skipped

### T6: Clear checkpoint log on successful completion (AC: #9)

- In `runWorkflowActor()`, in the success branch where `clearSnapshot()` is already called, also call `clearCheckpointLog(projectDir)`
- On error/halt/interrupt, do NOT clear the checkpoint log (same preservation semantics as the snapshot)

### T7: Ensure snapshot fast-path takes precedence over checkpoint log (AC: #4)

- The checkpoint log is ONLY consulted when the snapshot is missing or has a config hash mismatch
- When snapshot resume succeeds (config hash match), do NOT load or consult the checkpoint log
- The `completedTasks` set in the machine input should be empty when resuming from snapshot — the XState snapshot already contains the full machine state
- This should happen naturally from T4's logic (only loads checkpoints on mismatch), but verify with a test

### T8: Write unit tests for checkpoint persistence functions (AC: #12, #13)

- Test `appendCheckpoint`: appends valid JSONL, creates dir, handles multiple appends
- Test `loadCheckpointLog`: reads valid entries, skips corrupt lines with warning, returns empty for missing file, handles empty file
- Test `clearCheckpointLog`: deletes file, no-op when file missing
- Add to `workflow-persistence.test.ts` in a new `describe('checkpoint log')` block

### T9: Write unit tests for checkpoint-based skip logic (AC: #12, #13)

- Test: config mismatch + checkpoint log → completed tasks set built and passed to machine
- Test: config mismatch + no checkpoint log → empty completed tasks set
- Test: config match (snapshot resume) → checkpoint log NOT loaded
- Test: story machine guard skips completed task
- Test: story machine guard allows uncompleted task
- Test: multi-resume chain — checkpoints accumulate across runs
- Add resume-with-checkpoints describe block to `workflow-runner.test.ts`
- Add skip guard tests to `workflow-story-machine.test.ts`

### T10: Verify build, lint, and file size constraints (AC: #12, #13, #14)

- `npm run build` exits 0
- `npx vitest run` — all tests pass, zero regressions
- `wc -l src/lib/workflow-runner.ts` <= 300 lines
- `wc -l src/lib/workflow-persistence.ts` <= 300 lines
- `wc -l src/lib/workflow-story-machine.ts` <= 300 lines

## Dev Notes

### Checkpoint log format

Each line in `workflow-checkpoints.jsonl` is a self-contained JSON object:
```jsonl
{"storyKey":"26-3-semantic-checkpoint-log","taskName":"create-story","completedAt":"2026-04-06T18:30:00.000Z"}
{"storyKey":"26-3-semantic-checkpoint-log","taskName":"implement","completedAt":"2026-04-06T18:45:00.000Z"}
{"storyKey":"26-2-snapshot-resume","taskName":"create-story","completedAt":"2026-04-06T18:50:00.000Z"}
```

JSONL (JSON Lines) was chosen because:
- Append-only: each write adds one line, no need to read/parse/rewrite the whole file
- Crash-safe: at worst, a crash truncates the last line — all previous lines are intact
- Simple: `readFileSync().split('\n').map(JSON.parse)` to load

### How checkpoint skip works in the machine hierarchy

The `completedTasks` set flows down through machine inputs:
```
runMachine (context.completedTasks)
  → epicMachine input function reads parent's completedTasks
    → storyMachine input function reads parent's completedTasks
      → isTaskAlreadyCompleted guard checks the set before dispatch
```

The guard is a pure function: `(context) => context.completedTasks.has(`${context.storyKey}::${context.currentTaskName}`)`. No I/O, no side effects — consistent with AD architecture guard rules.

### Relationship between snapshot and checkpoint log

| Scenario | Snapshot | Checkpoint Log | Resume Strategy |
|----------|----------|---------------|-----------------|
| Normal resume (same config) | Valid, hash matches | May exist | **Snapshot** — exact state restore, ignore checkpoints |
| Config changed | Invalid (hash mismatch) | Exists | **Checkpoint** — fresh machine, skip completed tasks |
| Config changed, no log | Invalid | Missing | **Fresh start** — re-run everything |
| First run | Missing | Missing | **Fresh start** — normal behavior |
| Successful completion | Deleted | Deleted | **Fresh start** on next run |
| Error/halt/interrupt | Preserved | Preserved | Both available for next resume |

### Gate checkpoints

When a gate completes (pass or fail), the checkpoint records the gate's verdict. However, this story does NOT restore gate iteration state — if a gate was on iteration 3/5, a checkpoint-based resume starts the gate from iteration 1. Full gate resume requires the XState snapshot (story 26-2). The checkpoint log's purpose is coarser: skip entire tasks/gates that completed successfully, not restore mid-gate state.

### File size budget

Current sizes → estimated after changes:
- `workflow-persistence.ts`: 187 lines → ~250 lines (+60 for checkpoint functions)
- `workflow-runner.ts`: 195 lines → ~220 lines (+25 for checkpoint loading and passing)
- `workflow-story-machine.ts`: check current size, +10-15 lines for guard and skip transition

All well within the 300-line NFR18 limit.

### What to watch for

- **Set serialization through machine inputs**: XState serializes machine input. A `Set<string>` may not survive serialization — consider using a plain object `Record<string, true>` or `string[]` instead, converting to `Set` in the guard for O(1) lookup. Test this.
- **Determining task completion from state transitions**: The subscribe callback fires on every state change. Need a reliable way to detect "a task just completed" vs "machine transitioned internally." Options: compare `tasksCompleted` counter, check for specific state path changes, or use the machine's `onEvent` callback if it emits task-done events.
- **Concurrent appends**: Sequential execution means only one task completes at a time, so concurrent `appendFileSync` calls should not occur. But verify this assumption holds for gate check tasks if they ever run in parallel.

### References

- [Source: _bmad-output/planning-artifacts/architecture-xstate-engine.md#AD3: Persistence — dual-layer, checkpoint log]
- [Source: _bmad-output/planning-artifacts/epics-xstate-engine.md#Story 5.3]
- [Source: _bmad-output/implementation-artifacts/26-1-xstate-snapshot-persistence.md]
- [Source: _bmad-output/implementation-artifacts/26-2-snapshot-resume-config-hash-validation.md]
- [Source: src/lib/workflow-persistence.ts] (extended with checkpoint functions)
- [Source: src/lib/workflow-runner.ts] (extended with checkpoint loading)
- [Source: src/lib/workflow-story-machine.ts] (extended with skip guard)

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/26-3-semantic-checkpoint-log-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/26-3-semantic-checkpoint-log.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

</story-spec>
