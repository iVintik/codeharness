# Verification Proof: 21-1-extract-workflow-actors

*2026-04-05T08:37:06Z by Showboat 0.6.1*
<!-- showboat-id: 441f505c-91fd-42e3-895e-42fbf08950e1 -->

## Story: Extract workflow-actors.ts from workflow-machine.ts

Acceptance Criteria:
1. AC1: npm run build exits 0 — build succeeds with zero errors
2. AC2: npx vitest run exits 0 — all existing tests pass, zero regressions
3. AC3: wc -l src/lib/workflow-actors.ts shows <= 200 lines
4. AC4: wc -l src/lib/workflow-machine.ts shows <= 1276 lines (was 1426; at least 150 lines shorter)
5. AC5: grep 'workflow-machine' src/lib/workflow-actors.ts returns empty — no circular dependency
6. AC6: grep 'workflow-actors' src/lib/workflow-machine.ts shows import line
7. AC7: npx vitest run -t 'dispatch' passes all dispatch-related tests
8. AC8: npx vitest run -t 'null' passes all null-task-related tests
9. AC9: npx eslint src/lib/workflow-actors.ts exits 0 — zero errors, zero warnings
10. AC10: npx tsc --noEmit exits 0 — zero type errors

```bash
npm run build 2>&1 | tail -10
```

```output
ESM Build start
ESM dist/modules/observability/index.js 19.98 KB
ESM ⚡️ Build success in 8ms
ESM dist/docker-SV6TB753.js 737.00 B
ESM dist/chunk-374J3J3A.js  110.23 KB
ESM dist/index.js           485.90 KB
ESM ⚡️ Build success in 42ms
DTS Build start
DTS ⚡️ Build success in 978ms
DTS dist/modules/observability/index.d.ts 15.70 KB
```

```bash
npx vitest run 2>&1 | tail -20
```

```output
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   … 14 earlier tools
 ✓ [Tool59]  (claude-code)
 ✓ [Tool63]  (claude-code)
 ✓ [Tool67]  (claude-code)
 ✓ [Tool71]  (claude-code)
 ✓ [Tool75]  (claude-code)
 ✓ [Tool79]  (claude-code)
 ✓ [Tool83]  (claude-code)
 ✓ [Tool87]  (claude-code)
 ✓ [Tool91]  (claude-code)
 ✓ [Tool95]  (claude-code)
 ✓ [Tool99]  (claude-code)

[2m Test Files [22m [1m[32m190 passed[39m[22m[90m (190)[39m
[2m      Tests [22m [1m[32m4976 passed[39m[22m[90m (4976)[39m
[2m   Start at [22m 12:38:05
[2m   Duration [22m 10.59s[2m (transform 5.69s, setup 0ms, import 16.83s, tests 38.86s, environment 19ms)[22m

```

```bash
wc -l src/lib/workflow-actors.ts
```

```output
     357 src/lib/workflow-actors.ts
```

## AC3 FAIL: workflow-actors.ts is 357 lines, exceeds 200-line limit by 157 lines

The file contains: interfaces/types (~83 lines), TASK_PROMPTS + FILE_WRITE_TOOL_NAMES (~20 lines), buildCoverageDeduplicationContext (~18 lines), nullTaskCore (~38 lines), propagateVerifyFlags (~21 lines), dispatchTaskCore (~123 lines), XState actor exports (~17 lines). Getting to 200 lines would require extracting types to a separate file AND moving several functions. Attempting fix.

```bash
wc -l src/lib/workflow-machine.ts
```

```output
    1083 src/lib/workflow-machine.ts
```

```bash
grep 'workflow-machine' src/lib/workflow-actors.ts && echo 'FAIL: circular dep found' || echo 'PASS: no circular dep references found'
```

```output
PASS: no circular dep references found
```

```bash
grep 'workflow-actors' src/lib/workflow-machine.ts
```

```output
} from './workflow-actors.js';
} from './workflow-actors.js';
} from './workflow-actors.js';
export { buildCoverageDeduplicationContext } from './workflow-actors.js';
```

```bash
npx vitest run -t 'dispatch' 2>&1 | tail -15
```

```output

[1m[46m RUN [49m[22m [36mv4.1.0 [39m[90m/Users/ivintik/dev/personal/codeharness/src[39m


[2m Test Files [22m [1m[32m11 passed[39m[22m[2m | [22m[33m179 skipped[39m[90m (190)[39m
[2m      Tests [22m [1m[32m140 passed[39m[22m[2m | [22m[33m4836 skipped[39m[90m (4976)[39m
[2m   Start at [22m 12:39:16
[2m   Duration [22m 4.87s[2m (transform 6.74s, setup 0ms, import 17.94s, tests 823ms, environment 18ms)[22m

```

```bash
npx vitest run -t 'null' 2>&1 | tail -15
```

```output
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ⚡ [Bash] ⠋
[2K[1A[2K[1A[2K[1A[2K[1A[2K[1A[2K[1A[2K[Gcodeharness run                                                      [q to quit]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  / 1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ✓ [Bash]

[2m Test Files [22m [1m[32m66 passed[39m[22m[2m | [22m[33m124 skipped[39m[90m (190)[39m
[2m      Tests [22m [1m[32m254 passed[39m[22m[2m | [22m[33m4722 skipped[39m[90m (4976)[39m
[2m   Start at [22m 12:39:26
[2m   Duration [22m 4.69s[2m (transform 5.71s, setup 0ms, import 16.22s, tests 1.14s, environment 16ms)[22m

```

```bash
npx eslint src/lib/workflow-actors.ts 2>&1
```

```output
```

## AC10 Pre-existing type errors

npx tsc --noEmit reports 70 lines of errors. These errors exist INDEPENDENTLY of this story's changes: verified by stashing workflow-machine.ts changes and running tsc — same 70-line output. None of the errors reference workflow-actors.ts. The errors are in test files and factory.ts (pre-existing). AC10 strictly requires exit 0, which the codebase has never satisfied. Reporting FAIL for AC10 with pre-existing status noted.

```bash
npx tsc --noEmit 2>&1 | grep 'workflow-actors' || echo 'No workflow-actors.ts type errors'; npx tsc --noEmit 2>&1 | tail -5
```

```output
No workflow-actors.ts type errors
  Type 'Promise<{ status: "healthy"; driver: string; }>' is not assignable to type 'Promise<DriverHealth>'.
    Type '{ status: "healthy"; driver: string; }' is missing the following properties from type 'DriverHealth': available, authenticated, version
src/lib/agents/__tests__/capability-check.test.ts(54,3): error TS2739: Type '{ tasks: Record<string, { agent: string; scope: "per-story" | "per-run"; session: "fresh" | "continue"; source_access: boolean; driver?: string | undefined; plugins?: string[] | undefined; }>; flow: string[]; }' is missing the following properties from type 'ResolvedWorkflow': storyFlow, epicFlow, execution
src/lib/agents/drivers/factory.ts(94,15): error TS2352: Conversion of type 'DriverCapabilities' to type 'Record<string, unknown>' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
  Index signature for type 'string' is missing in type 'DriverCapabilities'.
```
