# Story 15-4: Fix TS Compilation Errors Across Codebase

## Status: verifying

## Story

As a developer,
I want `npx tsc --noEmit` to produce zero errors,
So that type safety is enforced across the entire codebase.

## Acceptance Criteria

- [x] AC1: Given `npx tsc --noEmit` is run, when it completes, then zero compilation errors (down from 106 across 20 files) <!-- verification: cli-verifiable -->
- [x] AC2: Given the fixes, when inspected via `git diff --stat`, then changes are limited to type annotations, type imports, and type casts -- no logic changes <!-- verification: cli-verifiable -->
- [x] AC3: Given `npm test` is run after all fixes, when it completes, then all existing tests pass with no regressions <!-- verification: cli-verifiable -->
- [x] AC4: Given test files with partial mock objects (TS2352, TS2353), when fixed, then they use `as unknown as TypeName` double-cast or `Partial<Type>` -- not `any` <!-- verification: cli-verifiable -->
- [x] AC5: Given source files with errors (`src/commands/run.ts`, `src/lib/state.ts`, `src/modules/audit/dimensions.ts`, `src/modules/infra/docker-setup.ts`), when fixed, then their fixes are type-only and do not change runtime behavior <!-- verification: cli-verifiable -->

## Technical Notes

This is a pure type-fixing story. No runtime behavior changes.

### Current Error Inventory (as of 2026-03-25)

**106 compilation errors** across **20 files** (16 test files + 4 source files).

#### Error breakdown by code

| Error Code | Count | Description |
|-----------|-------|-------------|
| TS2352 | 18 | Conversion may be a mistake (partial mocks) |
| TS7006 | 16 | Parameter implicitly has 'any' type |
| TS2339 | 16 | Property does not exist on type |
| TS2353 | 15 | Object literal may only specify known properties |
| TS2741 | 12 | Property missing in type but required |
| TS2322 | 9 | Type not assignable |
| TS2556 | 8 | Spread argument must have tuple type |
| TS2345 | 8 | Argument type not assignable |
| TS2561 | 2 | Object literal property not assignable |
| TS2493 | 1 | Tuple element access error |
| TS18048 | 1 | Possibly undefined |

#### Affected test files (16)

- `src/commands/__tests__/bridge.test.ts`
- `src/commands/__tests__/run.test.ts`
- `src/commands/__tests__/stack.test.ts`
- `src/commands/__tests__/status.test.ts`
- `src/commands/__tests__/sync.test.ts`
- `src/commands/__tests__/teardown.test.ts`
- `src/lib/__tests__/deps.test.ts`
- `src/lib/__tests__/scan-cache.test.ts`
- `src/lib/__tests__/stacks/registry.test.ts`
- `src/lib/__tests__/stacks/types.test.ts`
- `src/lib/observability/__tests__/otlp.test.ts`
- `src/modules/audit/__tests__/dimensions.test.ts`
- `src/modules/sprint/__tests__/timeout.test.ts`
- `src/modules/status/__tests__/formatters-docker-check.test.ts`
- `src/modules/verify/__tests__/validation-runner.test.ts`
- `src/modules/verify/__tests__/verify-env.test.ts`

#### Affected source files (4)

- `src/commands/run.ts`
- `src/lib/state.ts`
- `src/modules/audit/dimensions.ts`
- `src/modules/infra/docker-setup.ts`

### Common Fix Patterns

1. **TS2352/TS2353 — Partial mock objects**: Tests create partial objects to pass as arguments but TypeScript requires all fields. Fix with `as unknown as TypeName` double-cast or builder functions from story 12-4. Do NOT use `as any`.

2. **TS7006 — Implicit any on parameters**: Add explicit type annotations to callback parameters in test code (e.g., `.mockImplementation((arg: string) => ...)`).

3. **TS2339 — Property does not exist**: Usually stale references after refactors. Update to current property names or add missing type imports.

4. **TS2741 — Missing required properties**: Mock objects missing fields. Add the missing fields or use `Partial<Type>` with appropriate casting.

5. **TS2322/TS2345 — Type mismatch**: Wrong types passed to functions. Correct the type annotations or add explicit casts.

6. **TS2556 — Spread argument issues**: Spread of non-tuple types. Fix with `as const` or explicit tuple typing.

### Approach

1. Run `npx tsc --noEmit 2>&1` to get the full error list
2. Fix source files first (4 files, likely fewer errors, higher impact)
3. Fix test files by error category: TS2352/TS2353 first (33 errors), then TS7006 (16), then remaining
4. Verify with `npx tsc --noEmit` after each batch
5. Run `npm test` to confirm no runtime regressions

### Constraint

AC2 is critical: these must be type-only changes. If a type fix requires a logic change, that's a separate bug fix -- do not mix concerns.

## Files to Change

- `src/commands/__tests__/bridge.test.ts` — Fix type annotations and mock typing
- `src/commands/__tests__/run.test.ts` — Fix type annotations and mock typing
- `src/commands/__tests__/stack.test.ts` — Fix type annotations and mock typing
- `src/commands/__tests__/status.test.ts` — Fix type annotations and mock typing
- `src/commands/__tests__/sync.test.ts` — Fix type annotations and mock typing
- `src/commands/__tests__/teardown.test.ts` — Fix type annotations and mock typing
- `src/lib/__tests__/deps.test.ts` — Fix type annotations and mock typing
- `src/lib/__tests__/scan-cache.test.ts` — Fix type annotations and mock typing
- `src/lib/__tests__/stacks/registry.test.ts` — Fix type annotations and mock typing
- `src/lib/__tests__/stacks/types.test.ts` — Fix type annotations and mock typing
- `src/lib/observability/__tests__/otlp.test.ts` — Fix type annotations and mock typing
- `src/modules/audit/__tests__/dimensions.test.ts` — Fix type annotations and mock typing
- `src/modules/sprint/__tests__/timeout.test.ts` — Fix type annotations and mock typing
- `src/modules/status/__tests__/formatters-docker-check.test.ts` — Fix type annotations and mock typing
- `src/modules/verify/__tests__/validation-runner.test.ts` — Fix type annotations and mock typing
- `src/modules/verify/__tests__/verify-env.test.ts` — Fix type annotations and mock typing
- `src/commands/run.ts` — Fix type errors (type-only changes)
- `src/lib/state.ts` — Fix type errors (type-only changes)
- `src/modules/audit/dimensions.ts` — Fix type errors (type-only changes)
- `src/modules/infra/docker-setup.ts` — Fix type errors (type-only changes)
- `src/types/*.ts` — May need to export additional types that tests reference
