# Verification Proof: 21-3-extract-workflow-machines

**Story:** Extract `workflow-machines.ts` from `workflow-machine.ts`
**Verified by:** In-process structural verification (retry task, post-review fix)
**Date:** 2026-04-05
**Commit context:** Working tree after architecture fix (WorkItem/EngineError moved to workflow-types.ts)

## Context

This story is a pure code extraction — no behavioral changes. All verification is structural:
build passes, tests pass, line budgets met, no circular deps, import boundary respected, re-exports preserve backward compat.

The retry task also fixed the architecture violation found in the initial review: `WorkItem` and `EngineError`
were defined in `workflow-compiler.ts` but imported by `workflow-types.ts`, reversing the intended AD6
dependency direction. They are now defined in `workflow-types.ts` and re-exported from `workflow-compiler.ts`.

## AC 1: `npm run build` exits 0

**Verdict:** PASS

```
$ npm run build
ESM dist/index.js           486.30 KB
ESM ⚡️ Build success in 30ms
DTS ⚡️ Build success in 849ms
```

Exit 0, zero errors.

## AC 2: `npx vitest run` — pass count ≥ 4976

**Verdict:** PASS

```
$ npx vitest run
Test Files  190 passed (190)
      Tests  4977 passed (4977)
```

4977 ≥ 4976. Zero failures.

## AC 3: `wc -l src/lib/workflow-machines.ts` ≤ 500

**Verdict:** PASS

```
$ wc -l src/lib/workflow-machines.ts
399 src/lib/workflow-machines.ts
```

399 ≤ 500.

## AC 4: `wc -l src/lib/workflow-machine.ts` ≤ 350

**Verdict:** PASS

```
$ wc -l src/lib/workflow-machine.ts
240 src/lib/workflow-machine.ts
```

240 ≤ 350. (Was 977 before extraction — 737 lines removed.)

## AC 5: No circular import back to monolith

**Verdict:** PASS

```
$ grep -cE "from.*workflow-machine\b[^s]" src/lib/workflow-machines.ts
0
```

## AC 6: `workflow-machine.ts` imports from `workflow-machines`

**Verdict:** PASS

```
$ grep 'workflow-machines' src/lib/workflow-machine.ts
 * Machines, actors, and orchestration logic live in workflow-machines.ts.
 * @see workflow-machines.ts — XState machine definitions and orchestration actors
import { runMachine } from './workflow-machines.js';
export { executeLoopBlock, dispatchTask } from './workflow-machines.js';
```

## AC 7: `loop` tests pass

**Verdict:** PASS

```
$ npx vitest run -t 'loop'
Test Files  89 passed | 101 skipped (190)
      Tests  508 passed | 4469 skipped (4977)
```

All loop-related tests pass.

## AC 8: `epic` tests pass

**Verdict:** PASS (covered by same vitest run above — all 4977 pass)

## AC 9: `run` tests pass

**Verdict:** PASS (covered by same vitest run above — all 4977 pass)

## AC 10: `npx eslint src/lib/workflow-machines.ts` exits 0

**Verdict:** PASS

```
$ npx eslint src/lib/workflow-machines.ts
[no output]
exit: 0
```

## AC 11: `npx tsc --noEmit` — zero errors referencing `workflow-machines`

**Verdict:** PASS

```
$ npx tsc --noEmit 2>&1 | grep 'workflow-machines'
[no output]
```

## AC 12: No forbidden imports in `workflow-machines.ts`

**Verdict:** PASS

```
$ grep -cE "from.*workflow-machine\b[^s]|agents/drivers|capability-check" src/lib/workflow-machines.ts
0
```

Imports in `workflow-machines.ts`:
- `xstate`, `node:fs`, `node:path`, `output.js`, `agent-dispatch.js`, `agents/stream-parser.js`,
  `agent-resolver.js`, `workflow-parser.js`, `verdict-parser.js`, `circuit-breaker.js`,
  `workflow-state.js`, `workflow-actors.js`, `workflow-types.js`, `workflow-compiler.js`

All allowed per AC12.

## AC 13: Build + tests pass (backward-compat re-exports)

**Verdict:** PASS

`npm run build && npx vitest run` — both exit 0 as shown in AC1 and AC2. Downstream consumers
importing `executeLoopBlock`, `dispatchTask`, `runMachine`, `RunMachineContext` from `workflow-machine.ts`
continue to work via re-exports.

## Architecture Fix (Review Finding 1)

**Finding:** `workflow-types.ts` imported `WorkItem` and `EngineError` from `workflow-compiler.ts`,
reversing the AD6 dependency direction.

**Fix applied:**
- `WorkItem` and `EngineError` interfaces moved to `workflow-types.ts` (now the foundational definition)
- `workflow-compiler.ts` imports them from `workflow-types.ts` and re-exports them for backward compat
- All existing import paths (`from './workflow-compiler.js'`) continue to resolve via re-export

**Verification:**
```
$ npx tsc --noEmit 2>&1 | grep -E 'workflow-types|workflow-compiler|workflow-machines'
[no output]
$ npm run build
Build success
$ npx vitest run
4977 passed
```

## Summary

All 13 acceptance criteria pass. Architecture violation from initial review resolved.
