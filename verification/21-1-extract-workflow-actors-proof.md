# Verification Proof: 21-1-extract-workflow-actors

*2026-04-05T10:31:21Z by Showboat 0.6.1*
<!-- showboat-id: 20eed39d-5b03-482b-9c19-3a29f46376d9 -->

## Story: Extract workflow-actors.ts from workflow-machine.ts (21-1)

Acceptance Criteria:
1. npm run build exits 0 with zero errors
2. npx vitest run passes with 4976+ tests, zero failures
3. src/lib/workflow-actors.ts contains <=200 lines
4. src/lib/workflow-machine.ts contains <=1276 lines (at least 150 fewer than original 1426)
5. grep -c 'workflow-machine' src/lib/workflow-actors.ts outputs 0 (no circular dependency)
6. src/lib/workflow-machine.ts has at least one import from ./workflow-actors.js
7. npx vitest run -t 'dispatch' passes with 11+ files and 140+ tests
8. npx vitest run -t 'null' passes with 66+ files and 254+ tests
9. npx eslint src/lib/workflow-actors.ts exits 0 with zero errors and warnings
10. npx tsc --noEmit produces no errors referencing workflow-actors.ts

```bash
npm run test:unit 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E 'Test Files|Tests ' | head -2
```

```output
 Test Files  190 passed (190)
      Tests  4976 passed (4976)
```

## AC1: npm run build exits 0

```bash
npm run build 2>&1 | sed 's/in [0-9]*ms/in Xms/g' | grep -E '(Build success|error)'
```

```output
ESM ⚡️ Build success in Xms
ESM ⚡️ Build success in Xms
DTS ⚡️ Build success in Xms
```

AC1 PASS: Build succeeded with zero errors (3x 'Build success' lines).

## AC2: Full test suite passes with 4976+ tests

```bash
npx vitest run 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E 'Test Files|Tests ' | head -2
```

```output
 Test Files  190 passed (190)
      Tests  4976 passed (4976)
```

AC2 PASS: 190 test files passed, 4976 tests passed, zero failures.

## AC3: workflow-actors.ts <= 200 lines

```bash
wc -l src/lib/workflow-actors.ts
```

```output
     199 src/lib/workflow-actors.ts
```

AC3 PASS: workflow-actors.ts has 199 lines, within the <=200 line budget.

## AC4: workflow-machine.ts <= 1276 lines

```bash
wc -l src/lib/workflow-machine.ts
```

```output
    1102 src/lib/workflow-machine.ts
```

AC4 PASS: workflow-machine.ts has 1102 lines, well within <=1276 limit (324 lines fewer than original 1426).

## AC5: No circular dependency (workflow-actors.ts must not import from workflow-machine)

```bash
grep -c 'workflow-machine' src/lib/workflow-actors.ts || true
```

```output
0
```

AC5 PASS: zero references to 'workflow-machine' in workflow-actors.ts — no circular dependency.

## AC6: workflow-machine.ts imports from workflow-actors.js

```bash
grep 'workflow-actors' src/lib/workflow-machine.ts
```

```output
} from './workflow-actors.js';
export { buildCoverageDeduplicationContext } from './workflow-actors.js';
```

AC6 PASS: workflow-machine.ts has 2 import/re-export lines from './workflow-actors.js'.

## AC7: dispatch tests pass (11+ files, 140+ tests)

```bash
npx vitest run -t 'dispatch' 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E 'Test Files|Tests ' | head -2
```

```output
 Test Files  11 passed | 179 skipped (190)
      Tests  140 passed | 4836 skipped (4976)
```

AC7 PASS: 11 test files passed (179 skipped), 140 tests passed — meets 11+ files, 140+ tests requirement.

## AC8: null-task tests pass (66+ files, 254+ tests)

```bash
npx vitest run -t 'null' 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E 'Test Files|Tests ' | head -2
```

```output
 Test Files  66 passed | 124 skipped (190)
      Tests  254 passed | 4722 skipped (4976)
```

AC8 PASS: 66 test files passed (124 skipped), 254 tests passed — meets 66+ files, 254+ tests requirement.

## AC9: eslint on workflow-actors.ts exits 0

```bash
npx eslint src/lib/workflow-actors.ts && echo 'eslint: PASS'
```

```output
eslint: PASS
```

AC9 PASS: eslint exits 0 with zero errors and zero warnings on workflow-actors.ts.

## AC10: tsc --noEmit produces no errors for workflow-actors.ts

```bash
npx tsc --noEmit 2>&1 | grep 'workflow-actors' | wc -l | tr -d ' '
```

```output
0
```
