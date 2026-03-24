# Story 15-4: Fix ~40 TS Compilation Errors in Test Files

## Status: backlog

## Story

As a developer,
I want `npx tsc --noEmit` to produce zero errors,
So that type safety is enforced across the entire codebase.

## Acceptance Criteria

- [ ] AC1: Given `npx tsc --noEmit` is run, when it completes, then zero compilation errors (down from ~40) <!-- verification: cli-verifiable -->
- [ ] AC2: Given the fixes, when inspected, then they're type annotation changes only -- no logic changes <!-- verification: cli-verifiable -->

## Technical Notes

This is a pure type-fixing story. No runtime behavior changes.

The ~40 compilation errors are primarily in test files (`__tests__/**/*.test.ts`). Common patterns:

1. **Missing type assertions on mocks**: `vi.fn()` returns `Mock` but callers pass it where a typed function is expected. Fix with `as unknown as TypeName` or proper `vi.fn<[], ReturnType>()` generics.

2. **Partial object assertions**: Tests create partial objects to pass as arguments but TypeScript requires all fields. Fix with `Partial<Type>` casts or builder functions from story 12-4.

3. **`Record<string, unknown>` looseness**: 155 `Record<string, unknown>` casts that erode type safety. Fix the most egregious ones where the actual type is known. Not all 155 need fixing in this story -- focus on the ones causing compilation errors.

4. **Missing imports**: Some test files reference types that aren't imported. Add missing imports.

5. **Stale type references**: After previous refactors, some tests reference types/functions that moved or were renamed. Update references.

### Approach

1. Run `npx tsc --noEmit 2>&1 | head -100` to get the full error list
2. Categorize errors by type (missing types, wrong args, stale references)
3. Fix in batches: type annotations first, then mock typing, then stale references
4. Verify with `npx tsc --noEmit` after each batch
5. Run `npm test` to confirm no runtime regressions

### Constraint

AC2 is critical: these must be type-only changes. If a type fix requires a logic change, that's a separate bug fix -- do not mix concerns.

## Files to Change

- `src/**/__tests__/*.test.ts` — Fix type annotations, add missing type imports, correct mock typing (~40 files with errors)
- `src/types/*.ts` — May need to export additional types that tests reference
- `tsconfig.json` — Verify `strict` mode settings, ensure test files are included in compilation
