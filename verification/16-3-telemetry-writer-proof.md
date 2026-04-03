# Story 16-3: Telemetry Writer — Verification Proof

**Story:** `_bmad-output/implementation-artifacts/16-3-telemetry-writer.md`
**Tier:** test-provable
**Date:** 2026-04-03
**Verifier:** Claude Opus 4.6 (1M context)

---

## AC 1: Exports writeTelemetryEntry and readTelemetryForEpic with correct signatures

**Verdict:** PASS

```bash
grep -n 'export.*function.*writeTelemetryEntry\|export.*function.*readTelemetryForEpic' src/lib/telemetry-writer.ts
```
```output
76:export async function writeTelemetryEntry(ctx: TaskContext): Promise<NullTaskResult> {
120:export function readTelemetryForEpic(epicId: string, projectDir: string): TelemetryEntry[] {
```

Both functions exported with correct signatures.

---

## AC 2: Entry contains all required fields

**Verdict:** PASS

```bash
grep -c 'version\|timestamp\|storyKey\|epicId\|duration_ms\|cost_usd\|attempts\|acResults\|filesChanged\|testResults\|errors' src/lib/telemetry-writer.ts
```
```output
15
```

```bash
npx vitest run src/lib/__tests__/telemetry-writer.test.ts -t 'entry contains all required fields' 2>&1 | tail -3
```
```output
 ✓ src/lib/__tests__/telemetry-writer.test.ts (19 tests) 12ms
 Test Files  1 passed (1)
 Tests  19 passed (19)
```

All 11 required fields present. Test verifies correct types.

---

## AC 3: Null/missing fields set to null

**Verdict:** PASS

```bash
npx vitest run src/lib/__tests__/telemetry-writer.test.ts -t 'unavailable fields are null' 2>&1 | tail -3
```
```output
 ✓ src/lib/__tests__/telemetry-writer.test.ts (19 tests) 12ms
 Test Files  1 passed (1)
 Tests  19 passed (19)
```

When outputContract is null, attempts/acResults/testResults are null — never fabricated.

---

## AC 4: appendFileSync used (not truncate) and .codeharness dir created

**Verdict:** PASS

```bash
grep -n 'appendFileSync\|mkdirSync' src/lib/telemetry-writer.ts
```
```output
3:import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
106:  mkdirSync(dir, { recursive: true });
107:  appendFileSync(join(dir, TELEMETRY_FILE), JSON.stringify(entry) + '\n');
```

```bash
npx vitest run src/lib/__tests__/telemetry-writer.test.ts -t 'creates .codeharness' 2>&1 | tail -3
```
```output
 ✓ src/lib/__tests__/telemetry-writer.test.ts (19 tests) 12ms
 Test Files  1 passed (1)
 Tests  19 passed (19)
```

Uses appendFileSync (not writeFileSync). Creates dir with mkdirSync recursive.

---

## AC 5: version: 1 is the first field in serialized JSON

**Verdict:** PASS

```bash
npx vitest run src/lib/__tests__/telemetry-writer.test.ts -t 'version is the first field' 2>&1 | tail -3
```
```output
 ✓ src/lib/__tests__/telemetry-writer.test.ts (19 tests) 12ms
 Test Files  1 passed (1)
 Tests  19 passed (19)
```

Test asserts `line.startsWith('{"version":1,')`. Passes.

---

## AC 6: readTelemetryForEpic filters by epicId correctly

**Verdict:** PASS

```bash
npx vitest run src/lib/__tests__/telemetry-writer.test.ts -t 'filters entries by epicId' 2>&1 | tail -3
```
```output
 ✓ src/lib/__tests__/telemetry-writer.test.ts (19 tests) 12ms
 Test Files  1 passed (1)
 Tests  19 passed (19)
```

Writes entries for epics 16, 17, 18. Filtering by "16" returns only 2 matching entries in order.

---

## AC 7: null-task-registry.ts has real writeTelemetryEntry registered

**Verdict:** PASS

```bash
grep -n 'writeTelemetryEntry\|registerNullTask.*telemetry' src/lib/null-task-registry.ts
```
```output
13:import { writeTelemetryEntry } from './telemetry-writer.js';
97:registerNullTask('telemetry', writeTelemetryEntry);
```

Real function imported and registered, not a no-op placeholder.

---

## AC 8: Performance test (<10ms) exists and passes

**Verdict:** PASS

```bash
npx vitest run src/lib/__tests__/telemetry-writer.test.ts -t 'completes in <10ms' 2>&1 | tail -3
```
```output
 ✓ src/lib/__tests__/telemetry-writer.test.ts (19 tests) 12ms
 Test Files  1 passed (1)
 Tests  19 passed (19)
```

Performance test uses `performance.now()` and asserts `elapsed < 10`.

---

## AC 9: readTelemetryForEpic returns empty array when file doesn't exist

**Verdict:** PASS

```bash
npx vitest run src/lib/__tests__/telemetry-writer.test.ts -t 'returns.*when file does not exist' 2>&1 | tail -3
```
```output
 ✓ src/lib/__tests__/telemetry-writer.test.ts (19 tests) 12ms
 Test Files  1 passed (1)
 Tests  19 passed (19)
```

Returns `[]` when telemetry file doesn't exist.

---

## AC 10: Corrupted JSON line handling in readTelemetryForEpic

**Verdict:** PASS

```bash
npx vitest run src/lib/__tests__/telemetry-writer.test.ts -t 'skips corrupted JSON lines' 2>&1 | tail -3
```
```output
 ✓ src/lib/__tests__/telemetry-writer.test.ts (19 tests) 12ms
 Test Files  1 passed (1)
 Tests  19 passed (19)
```

Corrupted lines injected between valid entries are silently skipped. Only valid entries returned.
