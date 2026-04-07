# Verification Proof: 26-4-clear-persistence-on-completion

*2026-04-06T19:44:23Z by Showboat 0.6.1*
<!-- showboat-id: d61796ff-7227-4e58-bbec-e0d0c3b8e1ff -->

## Story: 26-4 Clear persistence on completion

Acceptance Criteria:
1. CLI output contains 'cleared'/'cleanup' and 'persistence'/'snapshot' on success
2. Both files deleted on success (clearAllPersistence called)
3. Files preserved on error/halt
4. Files preserved on interrupt
5. Stale files cleaned on re-entry after 'completed' phase
6. Orphaned checkpoint log cleared when no snapshot present
7. Stale .tmp file cleaned at startup
8. CLI output contains 'preserved'/'kept' and 'resume' on halt/error
9. Cleanup applies to resumed runs too
10. Loop termination (max-iterations/circuit-breaker) takes preserve path
11. Build exits 0 (pre-confirmed)
12. Tests pass (pre-confirmed: 5221 passing, 0 failures)
13. File sizes <= 300 lines (pre-confirmed: runner=214, persistence=297, story-machine=232)

```bash
grep -n 'Persistence cleared\|Persistence preserved\|clearAllPersistence\|cleanStaleTmpFiles' /Users/ivintik/dev/personal/codeharness/src/lib/workflow-runner.ts
```

```output
10:import { saveSnapshot, loadSnapshot, clearSnapshot, clearCheckpointLog, computeConfigHash, loadCheckpointLog, clearAllPersistence, cleanStaleTmpFiles } from './workflow-persistence.js';
95:  cleanStaleTmpFiles(projectDir);
98:    clearAllPersistence(projectDir);
202:    const cleared = clearAllPersistence(projectDir);
203:    info(`workflow-runner: Persistence cleared — snapshot: ${cleared.snapshotCleared ? 'yes' : 'no'}, checkpoints: ${cleared.checkpointCleared ? 'yes' : 'no'}`);
205:    info('workflow-runner: Persistence preserved for resume — snapshot and checkpoint log kept on disk');
```

```bash
grep -n 'AC #1\|AC #2\|Persistence cleared.*yes\|clearAllPersistence.*called' /Users/ivintik/dev/personal/codeharness/src/lib/__tests__/workflow-runner.test.ts | head -20
```

```output
649:  it('executes flow steps sequentially in order (AC #2)', async () => {
761:  it('handles DispatchError and records in result (AC #13)', async () => {
787:  it('halts on RATE_LIMIT dispatch errors (AC #13)', async () => {
902:  it('records error checkpoint in state on dispatch failure (AC #13)', async () => {
1154:  it('skips completed sequential per-story task (AC #1)', async () => {
1219:  it('resumes mid-story: 3 of 5 done, dispatches only remaining 2 (AC #2)', async () => {
1478:  it('logs "Resuming from snapshot" when saved configHash matches current hash (AC #1)', async () => {
1498:  it('logs "config changed" and "starting fresh" when configHash mismatches (AC #2)', async () => {
1521:  it('calls clearSnapshot when configHash mismatches (AC #2)', async () => {
1594:  it('warning includes abbreviated hashes of both saved and current configHash (AC #2)', async () => {
1685:  it('successful completion: clearAllPersistence called (not individual clear functions)', async () => {
1706:  it('successful run: clearAllPersistence called and "Persistence cleared" info logged (AC #1, #2)', async () => {
1718:      expect.stringMatching(/Persistence cleared.*snapshot.*yes.*checkpoints.*yes/i),
1722:  it('failed run: clearAllPersistence NOT called, "preserved" info logged (AC #8)', async () => {
1740:  it('interrupted run: clearAllPersistence NOT called, "preserved" info logged (AC #4)', async () => {
1757:  it('loop terminated (max-iterations): clearAllPersistence NOT called, "preserved" info logged (AC #10)', async () => {
1785:  it('re-entry after completed phase: clearAllPersistence called before early return (AC #5)', async () => {
```

```bash
grep -n 'AC #3\|AC #4\|AC #5\|AC #6\|AC #7\|AC #8\|AC #9\|AC #10' /Users/ivintik/dev/personal/codeharness/src/lib/__tests__/workflow-runner.test.ts | head -30
```

```output
441:  it('returns stories only when issues.yaml does not exist (AC #6)', () => {
456:  it('loads both stories and issues when issues.yaml exists (AC #5)', () => {
673:  it('dispatches per-story task once per story (AC #3)', async () => {
695:  it('dispatches per-run task exactly once with sentinel key (AC #7)', async () => {
717:  it('writes state after each task completion (AC #4)', async () => {
1178:  it('does NOT skip per-story task when no checkpoint exists (AC #5)', async () => {
1194:  it('skips completed per-run task (AC #3)', async () => {
1255:  it('skips all per-story tasks and proceeds to per-run verify (AC #3)', async () => {
1284:  it('phase: completed returns early with tasksCompleted: 0 (AC #6)', async () => {
1390:  it('loop block resumes from current iteration, skipping completed tasks (AC #4)', async () => {
1435:  it('fresh start (no state) executes everything — no skips (AC #5)', async () => {
1464:  it('starts fresh and does NOT log resume message when no snapshot exists (AC #4)', async () => {
1539:  it('does NOT call clearSnapshot when hashes match (AC #3)', async () => {
1569:  it('starts fresh without crashing when loadSnapshot returns null (corrupt file) (AC #5)', async () => {
1722:  it('failed run: clearAllPersistence NOT called, "preserved" info logged (AC #8)', async () => {
1740:  it('interrupted run: clearAllPersistence NOT called, "preserved" info logged (AC #4)', async () => {
1757:  it('loop terminated (max-iterations): clearAllPersistence NOT called, "preserved" info logged (AC #10)', async () => {
1785:  it('re-entry after completed phase: clearAllPersistence called before early return (AC #5)', async () => {
1795:  it('orphaned checkpoint log (no snapshot): clearCheckpointLog called with warning (AC #6 T6)', async () => {
1827:  it('cleanStaleTmpFiles called at run startup on every invocation (AC #7)', async () => {
1837:  it('cleanStaleTmpFiles called even on completed early-return path (AC #7)', async () => {
```

```bash
grep -n 'success\|errors.length === 0\|loopTerminated\|interrupted' /Users/ivintik/dev/personal/codeharness/src/lib/workflow-runner.ts | tail -20
```

```output
99:    return { success: true, tasksCompleted: 0, storiesProcessed: 0, errors: [], durationMs: 0 };
112:    return { success: false, tasksCompleted: 0, storiesProcessed: 0, errors, durationMs: Date.now() - startMs };
188:  if (state.phase !== 'interrupted' && errors.length === 0 && state.phase !== 'max-iterations' && state.phase !== 'circuit-breaker') {
195:  // Always persist the terminal state (interrupted, failed, completed, …)
198:  const loopTerminated = state.phase === 'max-iterations' || state.phase === 'circuit-breaker';
199:  const success = errors.length === 0 && !loopTerminated && state.phase !== 'interrupted';
200:  // Clear all persistence on clean success — preserve on halt/error/interrupt for resume.
201:  if (success) {
208:    success,
```

```bash
grep -n 'clearAllPersistence\|cleanStaleTmpFiles\|SNAPSHOT_FILE\|CHECKPOINT_FILE' /Users/ivintik/dev/personal/codeharness/src/lib/workflow-persistence.ts | head -30
```

```output
36:const SNAPSHOT_FILE = 'workflow-snapshot.json';
38:const CHECKPOINT_FILE = 'workflow-checkpoints.jsonl';
86:  const snapshotPath = join(stateDir, SNAPSHOT_FILE);
113:  const snapshotPath = join(stateDir, SNAPSHOT_FILE);
167:  const snapshotPath = join(baseDir, STATE_DIR, SNAPSHOT_FILE);
187:  const checkpointPath = join(stateDir, CHECKPOINT_FILE);
198:  const checkpointPath = join(baseDir, STATE_DIR, CHECKPOINT_FILE);
225:  const checkpointPath = join(baseDir, STATE_DIR, CHECKPOINT_FILE);
237: * Called at run startup (before snapshot load) and inside clearAllPersistence.
240:export function cleanStaleTmpFiles(projectDir?: string): void {
242:  const tmpPath = join(baseDir, STATE_DIR, `${SNAPSHOT_FILE}.tmp`);
259:export function clearAllPersistence(projectDir?: string): { snapshotCleared: boolean; checkpointCleared: boolean } {
260:  cleanStaleTmpFiles(projectDir);
266:    const snapshotPath = join(baseDir, STATE_DIR, SNAPSHOT_FILE);
275:    const checkpointPath = join(baseDir, STATE_DIR, CHECKPOINT_FILE);
```

```bash
grep -n 'orphaned\|Clearing orphaned\|clearCheckpointLog.*projectDir' /Users/ivintik/dev/personal/codeharness/src/lib/workflow-runner.ts
```

```output
150:    // No snapshot — check for orphaned checkpoint log (snapshot cleared but checkpoint clear failed).
152:    const orphanedEntries = loadCheckpointLog(projectDir);
153:    if (orphanedEntries.length > 0) {
154:      warn('workflow-runner: Clearing orphaned checkpoint log — no snapshot present');
155:      clearCheckpointLog(projectDir);
```

```bash
wc -l /Users/ivintik/dev/personal/codeharness/src/lib/workflow-runner.ts /Users/ivintik/dev/personal/codeharness/src/lib/workflow-persistence.ts /Users/ivintik/dev/personal/codeharness/src/lib/workflow-story-machine.ts
```

```output
     214 /Users/ivintik/dev/personal/codeharness/src/lib/workflow-runner.ts
     297 /Users/ivintik/dev/personal/codeharness/src/lib/workflow-persistence.ts
     232 /Users/ivintik/dev/personal/codeharness/src/lib/workflow-story-machine.ts
     743 total
```

```bash
grep -c 'describe\|it(' /Users/ivintik/dev/personal/codeharness/src/lib/__tests__/workflow-persistence.test.ts && grep -n 'clearAllPersistence\|cleanStaleTmpFiles' /Users/ivintik/dev/personal/codeharness/src/lib/__tests__/workflow-persistence.test.ts | wc -l
```

```output
51
      14
```

```bash
grep -n 'describe.*clearAllPersistence\|describe.*cleanStaleTmpFiles\|it.*clearAllPersistence\|it.*cleanStaleTmpFiles\|it.*both.*snapshot\|it.*continues.*checkpoint\|it.*also.*tmp\|it.*neither' /Users/ivintik/dev/personal/codeharness/src/lib/__tests__/workflow-persistence.test.ts | head -20
```

```output
332:  describe('cleanStaleTmpFiles', () => {
373:  describe('clearAllPersistence', () => {
374:    it('deletes both snapshot and checkpoint files when both exist', () => {
384:    it('returns snapshotCleared: false, checkpointCleared: false when neither file exists', () => {
393:    it('also cleans the .tmp file when it exists', () => {
403:    it('continues and clears checkpoint even when snapshot unlink throws', () => {
```

## Pre-confirmed Facts (from caller)

- Build: npm run build exits 0 (AC #11 confirmed)
- Tests: npx vitest run exits 0 — 5221 tests, 0 failures (AC #12 confirmed)
- File sizes: workflow-runner.ts=214, workflow-persistence.ts=297, workflow-story-machine.ts=232 (all <= 300) (AC #13 confirmed)

```bash
grep -n 'circuit.breaker\|circuitBreaker\|circuit_breaker' /Users/ivintik/dev/personal/codeharness/src/lib/workflow-runner.ts
```

```output
188:  if (state.phase !== 'interrupted' && errors.length === 0 && state.phase !== 'max-iterations' && state.phase !== 'circuit-breaker') {
198:  const loopTerminated = state.phase === 'max-iterations' || state.phase === 'circuit-breaker';
```

```bash
grep -n 'resume\|Resuming\|clearAllPersistence' /Users/ivintik/dev/personal/codeharness/src/lib/workflow-runner.ts | head -20
```

```output
10:import { saveSnapshot, loadSnapshot, clearSnapshot, clearCheckpointLog, computeConfigHash, loadCheckpointLog, clearAllPersistence, cleanStaleTmpFiles } from './workflow-persistence.js';
98:    clearAllPersistence(projectDir);
103:    if (!config.onEvent) info(`Resuming from ${state.phase} state — ${errorCount} previous error(s)`);
130:  let resumeSnapshot: unknown = null;
134:      info('workflow-runner: Resuming from snapshot — config hash matches');
135:      resumeSnapshot = savedSnapshot.snapshot;
151:    // These entries are stale and would cause incorrect skips if used on a future config-mismatch resume.
173:    const actor = createActor(runMachine, resumeSnapshot !== null ? { input: runInput, snapshot: resumeSnapshot as any } : { input: runInput });
200:  // Clear all persistence on clean success — preserve on halt/error/interrupt for resume.
202:    const cleared = clearAllPersistence(projectDir);
205:    info('workflow-runner: Persistence preserved for resume — snapshot and checkpoint log kept on disk');
```

## Code Evidence Summary by AC

AC1 (CLI 'cleared' + 'persistence'): workflow-runner.ts:203 — info() call emits 'Persistence cleared — snapshot: yes/no, checkpoints: yes/no'. Test at runner.test.ts:1706-1720 asserts the exact regex /Persistence cleared.*snapshot.*yes.*checkpoints.*yes/i.

AC2 (Both files deleted on success): workflow-runner.ts:202 calls clearAllPersistence(projectDir) on success. clearAllPersistence() at persistence.ts:259-284 unlinkSync()s both workflow-snapshot.json and workflow-checkpoints.jsonl. Test at runner.test.ts:1685-1695 asserts mockClearAllPersistence called with '/project'.

AC3 (Files preserved on error/halt): workflow-runner.ts:199 — success = errors.length === 0 && !loopTerminated && state.phase !== 'interrupted'. On error success=false, else branch at :205 logs 'preserved'. Test at runner.test.ts:1722-1738 asserts clearAllPersistence NOT called and 'Persistence preserved for resume' info logged.

AC4 (Files preserved on interrupt): workflow-runner.ts:199 excludes interrupted phase from success. Test at runner.test.ts:1740-1755 uses AbortController, asserts clearAllPersistence NOT called.

AC5 (Stale files cleaned on re-entry after completed): workflow-runner.ts:97-99 — on phase==='completed' calls clearAllPersistence(projectDir) before returning. Test at runner.test.ts:1785-1793 asserts clearAllPersistence called with '/project'.

AC6 (Orphaned checkpoint log cleared when no snapshot): workflow-runner.ts:149-156 — when loadSnapshot returns null and checkpoint log has entries, calls clearCheckpointLog and warns 'Clearing orphaned checkpoint log'. Test at runner.test.ts:1795-1810.

AC7 (Stale .tmp cleaned at startup): workflow-runner.ts:95 calls cleanStaleTmpFiles(projectDir) before any other work. persistence.ts:240-247 cleanStaleTmpFiles deletes .codeharness/workflow-snapshot.json.tmp if it exists. Tests at runner.test.ts:1827-1842 (two tests: normal path and completed early-return path).

AC8 (CLI 'preserved'/'resume' on halt/error): workflow-runner.ts:205 — info('workflow-runner: Persistence preserved for resume — snapshot and checkpoint log kept on disk'). Tests at runner.test.ts:1735-1736 and 1752-1753 assert exact string.

AC9 (Cleanup applies to resumed runs too): workflow-runner.ts:201-203 success branch is unconditional — the same clearAllPersistence call fires whether or not a resumeSnapshot was loaded. Line 173 shows both fresh and resume paths converge to the same actor run and same success check.

AC10 (Loop termination takes preserve path): workflow-runner.ts:198-199 — loopTerminated = phase==='max-iterations' || phase==='circuit-breaker'. If loopTerminated, success=false, so else branch runs 'preserved'. Test at runner.test.ts:1757-1783 with maxIterations:1.

AC11 (Build exits 0): pre-confirmed by caller.
AC12 (Tests pass): pre-confirmed by caller — 5221 tests, 0 failures.
AC13 (File sizes <= 300): pre-confirmed and independently verified — runner=214, persistence=297, story-machine=232.

## Verdict: PASS

- Total ACs: 13
- Verified: 13
- Failed: 0
- Tests: passing (5221 tests, 0 failures — pre-confirmed)
- Build: exits 0 (pre-confirmed)
- Showboat verify: reproducible

All 13 ACs verified via source code inspection and unit test evidence. The implementation in workflow-runner.ts and workflow-persistence.ts fully satisfies the story requirements.
