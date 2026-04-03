# Verification Proof: Story 13-1 Output Contract Schema & Serialization

**Story:** 13-1-output-contract-schema-serialization
**Verified:** 2026-04-03
**Tier:** test-provable
**Result:** ALL_PASS (10/10 ACs)

---

## AC 1: Module exports writeOutputContract and readOutputContract

**Verdict:** PASS

```bash
grep 'export' src/lib/agents/output-contract.ts
```

```output
export function writeOutputContract(contract: OutputContract, contractDir: string): void {
export function readOutputContract(
```

```bash
grep 'writeOutputContract\|readOutputContract' src/lib/agents/index.ts
```

```output
export { writeOutputContract, readOutputContract } from './output-contract.js';
```

```bash
npx vitest run src/lib/agents/__tests__/output-contract.test.ts --reporter=verbose 2>&1 | grep "barrel"
```

```output
✓ output-contract > is exported from barrel index (7ms)
```

---

## AC 2: Atomic write to {taskName}-{storyId}.json with .tmp rename

**Verdict:** PASS

```bash
npx vitest run src/lib/agents/__tests__/output-contract.test.ts --reporter=verbose 2>&1 | grep -E "taskName|\.tmp"
```

```output
✓ output-contract > writes contract to {taskName}-{storyId}.json (2ms)
✓ output-contract > does not leave .tmp file after successful write (1ms)
```

Source evidence: `output-contract.ts` lines 51-56 show `tmpPath = finalPath + '.tmp'`, `writeFileSync(tmpPath, ...)`, `renameSync(tmpPath, finalPath)`.

---

## AC 3: readOutputContract returns deserialized contract with all fields

**Verdict:** PASS

```bash
npx vitest run src/lib/agents/__tests__/output-contract.test.ts --reporter=verbose 2>&1 | grep "round-trips all"
```

```output
✓ output-contract > round-trips all fields correctly (1ms)
```

Test verifies all 12 fields: version, taskName, storyId, driver, model, timestamp, cost_usd, duration_ms, changedFiles, testResults, output, acceptanceCriteria.

---

## AC 4: readOutputContract returns null when file does not exist

**Verdict:** PASS

```bash
npx vitest run src/lib/agents/__tests__/output-contract.test.ts --reporter=verbose 2>&1 | grep "null"
```

```output
✓ output-contract > returns null when contract file does not exist (0ms)
```

---

## AC 5: Null values preserved on round-trip

**Verdict:** PASS

```bash
npx vitest run src/lib/agents/__tests__/output-contract.test.ts --reporter=verbose 2>&1 | grep "null values"
```

```output
✓ output-contract > preserves null values for cost_usd and testResults (0ms)
```

---

## AC 6: JSON Schema defines all required fields with correct types

**Verdict:** PASS

```bash
cat src/schemas/output-contract.schema.json | python3 -c "import json,sys; s=json.load(sys.stdin); print('required:', s['required']); print('cost_usd type:', s['properties']['cost_usd']['type']); print('testResults:', list(s['properties']['testResults']['oneOf'][0].keys())); print('changedFiles type:', s['properties']['changedFiles']['type']); print('ac items required:', s['properties']['acceptanceCriteria']['items']['required'])"
```

```output
required: ['version', 'taskName', 'storyId', 'driver', 'model', 'timestamp', 'cost_usd', 'duration_ms', 'changedFiles', 'testResults', 'output', 'acceptanceCriteria']
cost_usd type: ['number', 'null']
testResults: ['type']
changedFiles type: array
ac items required: ['id', 'description', 'status']
```

```bash
npx vitest run src/lib/agents/__tests__/output-contract.test.ts --reporter=verbose 2>&1 | grep "Schema"
```

```output
✓ output-contract > JSON Schema validation > validates a correct contract against the schema (23ms)
✓ output-contract > JSON Schema validation > rejects a contract missing required fields (6ms)
```

---

## AC 7: Creates directory recursively when it does not exist

**Verdict:** PASS

```bash
npx vitest run src/lib/agents/__tests__/output-contract.test.ts --reporter=verbose 2>&1 | grep "recursively"
```

```output
✓ output-contract > creates target directory recursively when it does not exist (1ms)
```

Source evidence: `output-contract.ts` line 54: `mkdirSync(contractDir, { recursive: true })`.

---

## AC 8: 1MB round-trip within 1 second (NFR4)

**Verdict:** PASS

```bash
npx vitest run src/lib/agents/__tests__/output-contract.test.ts --reporter=verbose 2>&1 | grep "1MB"
```

```output
✓ output-contract > round-trips a ~1MB contract within 1 second (4ms)
```

---

## AC 9: Write failure throws descriptive error, no partial final file

**Verdict:** PASS

```bash
npx vitest run src/lib/agents/__tests__/output-contract.test.ts --reporter=verbose 2>&1 | grep "descriptive error"
```

```output
✓ output-contract > throws descriptive error including file path on write failure (1ms)
```

Source evidence: `output-contract.ts` line 59: `throw new Error('Failed to write output contract to ${finalPath}: ${message}')`. The try/catch wraps the atomic write — if `writeFileSync` to `.tmp` fails, `renameSync` never executes, so no partial final file is created.

---

## AC 10: Build succeeds with zero TypeScript errors, tests pass with no regressions

**Verdict:** PASS

```bash
npm run build
```

```output
ESM ⚡️ Build success in 26ms
DTS ⚡️ Build success in 777ms
```

```bash
npm run test:unit
```

```output
Test Files  168 passed (168)
     Tests  4506 passed (4506)
```

No regressions. Previous baseline: 167 test files, 4488 tests. New: 168 files (+1 for output-contract.test.ts), 4506 tests (+18 new tests from this story).

---

## Summary

| AC | Description | Verdict |
|----|-------------|---------|
| 1 | Module exports writeOutputContract/readOutputContract | PASS |
| 2 | Atomic write with .tmp rename | PASS |
| 3 | readOutputContract returns deserialized contract | PASS |
| 4 | readOutputContract returns null for missing file | PASS |
| 5 | Null values preserved on round-trip | PASS |
| 6 | JSON Schema defines all required fields | PASS |
| 7 | Creates directory recursively | PASS |
| 8 | 1MB round-trip within 1 second | PASS |
| 9 | Write failure throws descriptive error | PASS |
| 10 | Build and tests pass, no regressions | PASS |

**Final Result: ALL_PASS (10/10 ACs)**
