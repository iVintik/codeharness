# Verification Proof: 26-2-snapshot-resume-config-hash-validation

*2026-04-07T10:35:17Z by Showboat 0.6.1*
<!-- showboat-id: 9466c686-645a-4417-a5ea-218751d022e4 -->

## Story: Snapshot resume with config hash validation

Retry run — fixing HIGH issue from review: isRestorableXStateSnapshot guard was too weak.

Acceptance Criteria:
1. Resume on matching config — CLI shows 'Resuming from snapshot', completed tasks not re-executed
2. Discard snapshot on config change — CLI shows 'config changed' and 'starting fresh'
3. Fresh start when no snapshot exists — no resume message, run starts normally
4. Graceful handling of corrupt snapshot — warning logged, process does not crash
5. Snapshot updated after resumed task completion — savedAt timestamp newer after resume
6. Snapshot cleaned up after successful resumed completion — file removed on success
7. Snapshot preserved after error on resumed run — file remains with valid JSON
8. Multi-interrupt resume chain — neither completed task re-executed on third run
9. Build succeeds — npm run build exits 0
10. All tests pass — npx vitest run exits 0

## Changes made in this retry:
- Strengthened isRestorableXStateSnapshot() to require all three XState v5 fields: status (known value), value (non-null), and context (object)
- Added XSTATE_SNAPSHOT_STATUSES constant with valid XState v5 status values
- Added 4 new unit tests: rejects { value: 'x' } alone, rejects { status, context } without value, rejects unknown status string, confirms well-formed snapshot is accepted

```bash
npx vitest run src/lib/__tests__/workflow-runner.test.ts 2>&1 | tail -10
```

```output

[1m[46m RUN [49m[22m [36mv4.1.0 [39m[90m/Users/ivintik/dev/personal/codeharness/src[39m


[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m77 passed[39m[22m[90m (77)[39m
[2m   Start at [22m 14:35:33
[2m   Duration [22m 385ms[2m (transform 215ms, setup 0ms, import 271ms, tests 36ms, environment 0ms)[22m

```

```bash
npm run build 2>&1 | tail -5
```

```output
ESM dist/chunk-SGI72IOQ.js             110.24 KB
ESM ⚡️ Build success in 32ms
DTS Build start
DTS ⚡️ Build success in 906ms
DTS dist/modules/observability/index.d.ts 15.70 KB
```

```bash
npx vitest run 2>&1 | tail -5
```

```output
[2m Test Files [22m [1m[32m198 passed[39m[22m[90m (198)[39m
[2m      Tests [22m [1m[32m5253 passed[39m[22m[90m (5253)[39m
[2m   Start at [22m 14:35:40
[2m   Duration [22m 10.17s[2m (transform 5.22s, setup 0ms, import 15.10s, tests 35.05s, environment 20ms)[22m

```

```bash
grep -n 'XSTATE_SNAPSHOT_STATUSES\|isRestorableXStateSnapshot\|active.*done.*error.*stopped' /Users/ivintik/dev/personal/codeharness/src/lib/workflow-runner.ts | head -15
```

```output
18:const XSTATE_SNAPSHOT_STATUSES = new Set(['active', 'done', 'error', 'stopped']);
29:function isRestorableXStateSnapshot(snapshot: unknown): snapshot is Record<string, unknown> {
36:    XSTATE_SNAPSHOT_STATUSES.has(candidate.status) &&
165:      if (isRestorableXStateSnapshot(savedSnapshot.snapshot)) {
```

```bash
npx vitest run src/lib/__tests__/workflow-runner.test.ts 2>&1 | grep -E 'Test Files|Tests ' | head -3
```

```output
[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m77 passed[39m[22m[90m (77)[39m
```

```bash
npm run build 2>&1 | grep -E 'Build success|error' | head -5
```

```output
ESM ⚡️ Build success in 6ms
ESM ⚡️ Build success in 31ms
DTS ⚡️ Build success in 811ms
```

```bash
npx vitest run 2>&1 | grep -E 'Test Files|Tests ' | head -3
```

```output
[2m Test Files [22m [1m[32m198 passed[39m[22m[90m (198)[39m
[2m      Tests [22m [1m[32m5253 passed[39m[22m[90m (5253)[39m
```

```bash
grep -n 'XSTATE_SNAPSHOT_STATUSES\|isRestorableXStateSnapshot' /Users/ivintik/dev/personal/codeharness/src/lib/workflow-runner.ts | head -10
```

```output
18:const XSTATE_SNAPSHOT_STATUSES = new Set(['active', 'done', 'error', 'stopped']);
29:function isRestorableXStateSnapshot(snapshot: unknown): snapshot is Record<string, unknown> {
36:    XSTATE_SNAPSHOT_STATUSES.has(candidate.status) &&
165:      if (isRestorableXStateSnapshot(savedSnapshot.snapshot)) {
```

```bash
grep -n 'Resuming from snapshot\|config changed\|starting fresh\|Snapshot payload is invalid' /Users/ivintik/dev/personal/codeharness/src/lib/workflow-runner.ts
```

```output
166:        info('workflow-runner: Resuming from snapshot — config hash matches');
169:        warn('workflow-runner: Snapshot payload is invalid for restore — starting fresh');
172:      warn(`workflow-runner: Snapshot config changed (saved: ${savedSnapshot.configHash.slice(0, 8)}, current: ${configHash.slice(0, 8)}) — starting fresh`);
```

```bash
npx vitest run src/lib/__tests__/workflow-runner.test.ts --reporter=verbose 2>&1 | grep -E 'snapshot resume .story 26-2|rejects snapshot|accepts well-formed' | head -15
```

```output
 [32m✓[39m lib/__tests__/workflow-runner.test.ts[2m > [22msnapshot resume (story 26-2)[2m > [22mstarts fresh and does NOT log resume message when no snapshot exists (AC #4)[32m 0[2mms[22m[39m
 [32m✓[39m lib/__tests__/workflow-runner.test.ts[2m > [22msnapshot resume (story 26-2)[2m > [22mlogs "Resuming from snapshot" when saved configHash matches current hash (AC #1)[32m 1[2mms[22m[39m
 [32m✓[39m lib/__tests__/workflow-runner.test.ts[2m > [22msnapshot resume (story 26-2)[2m > [22mlogs "config changed" and "starting fresh" when configHash mismatches (AC #2)[32m 0[2mms[22m[39m
 [32m✓[39m lib/__tests__/workflow-runner.test.ts[2m > [22msnapshot resume (story 26-2)[2m > [22mcalls clearSnapshot when configHash mismatches (AC #2)[32m 0[2mms[22m[39m
 [32m✓[39m lib/__tests__/workflow-runner.test.ts[2m > [22msnapshot resume (story 26-2)[2m > [22mdoes NOT call clearSnapshot when hashes match (AC #3)[32m 0[2mms[22m[39m
 [32m✓[39m lib/__tests__/workflow-runner.test.ts[2m > [22msnapshot resume (story 26-2)[2m > [22mstarts fresh without crashing when loadSnapshot returns null (corrupt file) (AC #5)[32m 0[2mms[22m[39m
 [32m✓[39m lib/__tests__/workflow-runner.test.ts[2m > [22msnapshot resume (story 26-2)[2m > [22mwarns and starts fresh when matching-hash snapshot payload is not restorable[32m 0[2mms[22m[39m
 [32m✓[39m lib/__tests__/workflow-runner.test.ts[2m > [22msnapshot resume (story 26-2)[2m > [22mloadSnapshot is always called on every run[32m 0[2mms[22m[39m
 [32m✓[39m lib/__tests__/workflow-runner.test.ts[2m > [22msnapshot resume (story 26-2)[2m > [22mrejects snapshot with only value key (no status/context) — guard is not just value-check[32m 0[2mms[22m[39m
 [32m✓[39m lib/__tests__/workflow-runner.test.ts[2m > [22msnapshot resume (story 26-2)[2m > [22mrejects snapshot with status+context but no value key[32m 0[2mms[22m[39m
 [32m✓[39m lib/__tests__/workflow-runner.test.ts[2m > [22msnapshot resume (story 26-2)[2m > [22mrejects snapshot with unknown status string[32m 0[2mms[22m[39m
 [32m✓[39m lib/__tests__/workflow-runner.test.ts[2m > [22msnapshot resume (story 26-2)[2m > [22maccepts well-formed XState v5 snapshot with status, value, and context[32m 0[2mms[22m[39m
 [32m✓[39m lib/__tests__/workflow-runner.test.ts[2m > [22msnapshot resume (story 26-2)[2m > [22mwarning includes abbreviated hashes of both saved and current configHash (AC #2)[32m 0[2mms[22m[39m
```
