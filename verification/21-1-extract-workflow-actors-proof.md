# Verification Proof: 21-1-extract-workflow-actors

*2026-04-05T12:12:55Z by Showboat 0.6.1*
<!-- showboat-id: f6c31dfb-a6ed-4d94-be12-800cebe3e96f -->

**Tier:** test-provable

## Story: Extract workflow-actors.ts from workflow-machine.ts (21-1)

Acceptance Criteria:
1. npm run build exits 0 with zero errors
2. npx vitest run passes with 4976+ tests, zero failures
3. src/lib/workflow-actors.ts contains <=200 lines
4. src/lib/workflow-machine.ts contains <=1276 lines (at least 150 fewer than original 1426)
5. grep -c 'workflow-machine' src/lib/workflow-actors.ts outputs 0 (no circular dependency)
6. src/lib/workflow-machine.ts has at least one import from ./workflow-actors.js
7. npx vitest run -t 'dispatch' passes with 11+ files, 140+ tests
8. npx vitest run -t 'null' passes with 66+ files, 254+ tests
9. npx eslint src/lib/workflow-actors.ts exits 0 with zero errors and warnings
10. npx tsc --noEmit produces no errors referencing workflow-actors.ts

```bash
cd /Users/ivintik/dev/personal/codeharness && npm run build 2>&1 | sed 's/in [0-9]*ms/in Xms/g' | grep -E '(Build success|error|Error)'
```

```output
ESM ⚡️ Build success in Xms
ESM ⚡️ Build success in Xms
DTS ⚡️ Build success in Xms
```

## AC 1: npm run build exits 0 with zero errors — PASS
Build completes with 3x 'Build success' lines, zero errors in stdout/stderr.

```bash
npm run test:unit 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E 'Test Files|Tests ' | head -2
```

```output
 Test Files  190 passed (190)
      Tests  4983 passed (4983)
```

## AC 2: Full test suite passes with 4976+ tests — PASS
190 test files passed, 4983 tests passed, zero failures.

```bash
wc -l /Users/ivintik/dev/personal/codeharness/src/lib/workflow-actors.ts | awk '{print $1}'
```

```output
197
```

## AC 3: workflow-actors.ts contains <=200 lines — PASS
197 lines, within the <=200 line budget.

```bash
wc -l /Users/ivintik/dev/personal/codeharness/src/lib/workflow-machine.ts | awk '{print $1}'
```

```output
1107
```

## AC 4: workflow-machine.ts contains <=1276 lines — PASS
1107 lines, 319 fewer than original 1426 (well under <=1276 limit).

```bash
grep -c 'workflow-machine' /Users/ivintik/dev/personal/codeharness/src/lib/workflow-actors.ts || true
```

```output
0
```

## AC 5: No circular dependency — PASS
grep finds 0 references to 'workflow-machine' in workflow-actors.ts. Architecture boundary AD6 enforced.

```bash
grep 'workflow-actors' /Users/ivintik/dev/personal/codeharness/src/lib/workflow-machine.ts
```

```output
} from './workflow-actors.js';
export { buildCoverageDeduplicationContext } from './workflow-actors.js';
```

## AC 6: workflow-machine.ts imports from ./workflow-actors.js — PASS
2 lines reference './workflow-actors.js': one import and one re-export.

```bash
npx vitest run -t 'dispatch' 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E 'Test Files|Tests ' | head -2
```

```output
 Test Files  11 passed | 179 skipped (190)
      Tests  140 passed | 4843 skipped (4983)
```

## AC 7: dispatch tests pass with 11+ files, 140+ tests — PASS
11 test files passed, 140 tests passed. Extracted dispatchTaskCore works identically.

```bash
npx vitest run -t 'null' 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E 'Test Files|Tests ' | head -2
```

```output
 Test Files  66 passed | 124 skipped (190)
      Tests  254 passed | 4729 skipped (4983)
```

## AC 8: null-task tests pass with 66+ files, 254+ tests — PASS
66 test files passed, 254 tests passed. Extracted nullTaskCore works identically.

```bash
npx eslint src/lib/workflow-actors.ts && echo 'eslint: PASS'
```

```output
eslint: PASS
```

## AC 9: eslint exits 0 with zero errors/warnings — PASS
npx eslint src/lib/workflow-actors.ts exits 0 with empty output.

```bash
npx tsc --noEmit 2>&1 | grep 'workflow-actors' | wc -l | tr -d ' '
```

```output
0
```

## AC 10: tsc --noEmit produces no errors referencing workflow-actors.ts — PASS
Zero TypeScript errors reference workflow-actors.ts. New file introduces no new type errors.

```bash
npm run test:unit 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E 'Test Files|Tests ' | head -2
```

```output
 Test Files  190 passed (190)
      Tests  4983 passed (4983)
```

## Verdict: PASS

- Total ACs: 10
- Verified: 10
- Failed: 0
- Tests: 190 files, 4983 tests passing
- Showboat verify: reproducible
