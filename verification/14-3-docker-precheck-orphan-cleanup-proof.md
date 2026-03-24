# Verification Proof: 14-3-docker-precheck-orphan-cleanup

**Story:** Docker Pre-check and Orphan Cleanup
**Tier:** unit-testable
**Date:** 2026-03-25

## AC 1: Docker not running exits with FAIL message

```bash
npx vitest run --reporter=verbose src/commands/__tests__/run.test.ts 2>&1 | grep "fails when Docker is not available"
```
```output
✓ commands/__tests__/run.test.ts > run command > action handler > fails when Docker is not available (AC#1, AC#2) 1ms
```

## AC 2: No agent spawned when Docker unavailable

```bash
npx vitest run --reporter=verbose src/commands/__tests__/run.test.ts 2>&1 | grep "fails when Docker is not available"
```
```output
✓ commands/__tests__/run.test.ts > run command > action handler > fails when Docker is not available (AC#1, AC#2) 1ms
```

Test asserts `process.exitCode === 1` and early return before agent spawn. Same test covers AC#1 and AC#2.

## AC 3: Leftover verify containers removed with INFO log

```bash
npx vitest run --reporter=verbose src/commands/__tests__/run.test.ts 2>&1 | grep "logs info when orphaned"
```
```output
✓ commands/__tests__/run.test.ts > run command > action handler > logs info when orphaned containers are cleaned up (AC#3) 55ms
```

```bash
npx vitest run --reporter=verbose src/modules/infra/__tests__/container-cleanup.test.ts 2>&1 | grep "verify containers"
```
```output
✓ modules/infra/__tests__/container-cleanup.test.ts > cleanupContainers > removes stale verify containers (AC#3, AC#4) 0ms
```

## AC 4: Shared and collector containers also cleaned

```bash
grep "STALE_PATTERNS" src/modules/infra/container-cleanup.ts
```
```output
const STALE_PATTERNS = ['codeharness-shared-', 'codeharness-collector-', 'codeharness-verify-'];
```

```bash
npx vitest run --reporter=verbose src/modules/infra/__tests__/container-cleanup.test.ts 2>&1 | grep "stale\|shared\|collector\|verify"
```
```output
✓ modules/infra/__tests__/container-cleanup.test.ts > cleanupContainers > removes stale verify containers (AC#3, AC#4) 0ms
```

All three patterns in STALE_PATTERNS array; pre-existing tests verify shared/collector; new test verifies verify pattern.

## AC 5: No orphans, silent pass, continues normally

```bash
npx vitest run --reporter=verbose src/commands/__tests__/run.test.ts 2>&1 | grep "continues normally when Docker"
```
```output
✓ commands/__tests__/run.test.ts > run command > action handler > continues normally when Docker available and no orphans (AC#5) 54ms
```

## AC 6: Cleanup failure warns but continues

```bash
npx vitest run --reporter=verbose src/commands/__tests__/run.test.ts 2>&1 | grep "warns but continues"
```
```output
✓ commands/__tests__/run.test.ts > run command > action handler > warns but continues when cleanup fails (AC#6) 55ms
```

## AC 7: npm run build succeeds

```bash
npm run build 2>&1 | tail -3
```
```output
DTS Build start
DTS ⚡️ Build success in 1124ms
DTS dist/modules/observability/index.d.ts 15.52 KB
```

## AC 8: All tests pass

```bash
npm run test:unit 2>&1 | grep -E "Test Files|Tests"
```
```output
Test Files  139 passed (139)
Tests       3672 passed (3672)
```

## AC 9: No modified file exceeds 300 lines

```bash
wc -l src/commands/run.ts src/modules/infra/container-cleanup.ts src/lib/docker/cleanup.ts src/lib/docker/__tests__/cleanup.test.ts src/modules/infra/__tests__/container-cleanup.test.ts
```
```output
     300 src/commands/run.ts
      83 src/modules/infra/container-cleanup.ts
      26 src/lib/docker/cleanup.ts
      50 src/lib/docker/__tests__/cleanup.test.ts
     173 src/modules/infra/__tests__/container-cleanup.test.ts
     632 total
```

All source files ≤ 300 lines. run.ts at exactly 300.

## Summary

| AC | Verdict |
|----|---------|
| 1  | PASS    |
| 2  | PASS    |
| 3  | PASS    |
| 4  | PASS    |
| 5  | PASS    |
| 6  | PASS    |
| 7  | PASS    |
| 8  | PASS    |
| 9  | PASS    |

**Result:** 9/9 PASS, 0 FAIL, 0 ESCALATE
