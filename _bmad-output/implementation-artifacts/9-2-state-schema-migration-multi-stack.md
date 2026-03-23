# Story 9-2: State schema migration for multi-stack

## Status: verifying

## Story

As a developer upgrading codeharness,
I want my existing state file to auto-migrate to the new multi-stack format,
So that I don't have to re-initialize.

## Acceptance Criteria

- [x] AC1: Given an old state file with `stack: 'nodejs'` and no `stacks` field, when `readState()` is called, then `state.stacks` is `['nodejs']` and `state.stack` is `'nodejs'` <!-- verification: cli-verifiable -->
- [x] AC2: Given a new state file with `stacks: ['nodejs', 'rust']`, when `readState()` is called, then `state.stacks` is `['nodejs', 'rust']` and `state.stack` is `'nodejs'` <!-- verification: cli-verifiable -->
- [x] AC3: Given a state file with neither `stack` nor `stacks`, when `readState()` is called, then `state.stacks` is `[]` and `state.stack` is `null` <!-- verification: cli-verifiable -->
- [x] AC4: Given state is written via `writeState()` with `stacks: ['nodejs', 'rust']`, when the file is inspected, then it contains both `stacks` array AND `stack: nodejs` for backward compat <!-- verification: cli-verifiable -->
- [x] AC5: Given `getDefaultState()` is called with a stack argument, then the returned state has both `stack` and `stacks` fields populated consistently <!-- verification: cli-verifiable -->
- [x] AC6: Given a corrupted state file triggers `recoverCorruptedState()`, then the recovered state has both `stack` and `stacks` fields populated from `detectStack()` and `detectStacks()` <!-- verification: cli-verifiable -->
- [x] AC7: Given `isValidState()` validates state, then it accepts both old-format (only `stack`, no `stacks`) and new-format (both `stack` and `stacks`) state files <!-- verification: cli-verifiable -->
- [x] AC8: Given the full test suite runs after all changes, then all existing single-stack tests pass with zero regressions <!-- verification: cli-verifiable -->

## Technical Notes

### HarnessState Interface Changes

File: `src/lib/state.ts` — `HarnessState` interface (L7-60).

Add a new `stacks` field after the existing `stack` field:

```ts
import { detectStack, detectStacks, type StackName } from './stack-detect.js';

export interface HarnessState {
  harness_version: string;
  initialized: boolean;
  stack: string | null;          // kept for backward compat — always stacks[0] ?? null
  stacks: StackName[];           // NEW — all detected stacks
  app_type?: 'server' | 'cli' | 'web' | 'agent' | 'generic';
  // ... rest unchanged
}
```

The existing import `import { detectStack } from './stack-detect.js'` (L5) must be expanded to include `detectStacks` and `StackName`.

### Migration Logic — `migrateState()` Function

A new private function that normalizes state from any format (old, new, or empty) into the canonical new format:

```ts
function migrateState(state: HarnessState): HarnessState {
  const raw = state as Record<string, unknown>;

  // New format: stacks array already present
  if (Array.isArray(raw.stacks) && raw.stacks.length > 0) {
    state.stacks = raw.stacks as StackName[];
    state.stack = state.stacks[0] ?? null;
    return state;
  }

  // Old format: has stack string but no stacks array
  if (typeof raw.stack === 'string' && raw.stack) {
    state.stacks = [raw.stack as StackName];
    return state;
  }

  // Neither present
  state.stacks = [];
  state.stack = null;
  return state;
}
```

Apply `migrateState()` in both `readState()` (L130-135) and `readStateWithBody()` (L157-165) after successful YAML parse and `isValidState()` check.

### writeState() Dual-Write

Before YAML serialization, ensure `stack` is always synced from `stacks[0]`:

```ts
// In writeState(), before stringify:
if (state.stacks && state.stacks.length > 0) {
  state.stack = state.stacks[0];
}
```

This ensures old codeharness versions reading the file still see a valid `stack` field.

### getDefaultState() Update

```ts
export function getDefaultState(stack?: string | null): HarnessState {
  return {
    // ... existing fields ...
    stack: stack ?? null,
    stacks: stack ? [stack as StackName] : [],
    // ... rest unchanged ...
  };
}
```

### isValidState() Update

The current validator (L172-183) checks `s.stack !== null && typeof s.stack !== 'string'`. It must also accept state without `stacks` (old format) and state with `stacks` (new format):

- If `stacks` is present, it must be an array
- If `stacks` is absent, that's valid (old format — migration will add it)

### recoverCorruptedState() Update

Currently uses `detectStack(dir)` (L187) which returns root-only stack. Update to also call `detectStacks(dir)` and populate `stacks` from all detected stacks:

```ts
function recoverCorruptedState(dir: string): HarnessState {
  warn('State file corrupted — recreating from detected config');
  const stack = detectStack(dir);
  const allStacks = detectStacks(dir);
  const state = getDefaultState(stack);
  // Dedupe: detectStacks may return same stack from multiple dirs
  const uniqueStackNames = [...new Set(allStacks.map(s => s.stack))];
  state.stacks = uniqueStackNames;
  writeState(state, dir);
  return state;
}
```

### InitResult Type Update

File: `src/modules/infra/types.ts` — The `InitResult` interface has `stack: string | null`. Add `stacks: string[]` alongside it. Keep `stack` as `stacks[0] ?? null` for existing consumers.

### Breaking Change Risk

None. All additions are backward-compatible:
- `stacks` is a new field; old state files auto-migrate on read
- `stack` is preserved for all existing consumers
- `isValidState()` accepts both old and new formats

## Files to Change

- `src/lib/state.ts` — Add `stacks: StackName[]` to `HarnessState`, add `migrateState()` function, update `readState()` and `readStateWithBody()` to call migration, update `writeState()` to dual-write, update `getDefaultState()` to populate `stacks`, update `isValidState()` to accept old and new formats, update `recoverCorruptedState()` to use `detectStacks()`, expand import from `./stack-detect.js`
- `src/modules/infra/types.ts` — Add `stacks: string[]` to `InitResult`, keep `stack` as compat alias
- `src/lib/__tests__/state.test.ts` — Add migration tests (old→new, new format, neither-field, dual-write, getDefaultState stacks, isValidState both formats, recovery with stacks, round-trip)

## Tasks/Subtasks

- [x] Task 1: Expand import in `state.ts` to include `detectStacks` and `StackName` from `./stack-detect.js`
- [x] Task 2: Add `stacks: StackName[]` field to `HarnessState` interface (after `stack`)
- [x] Task 3: Implement `migrateState()` private function that normalizes old/new/empty formats
- [x] Task 4: Apply `migrateState()` in `readState()` after YAML parse and validation
- [x] Task 5: Apply `migrateState()` in `readStateWithBody()` after YAML parse and validation
- [x] Task 6: Update `writeState()` to sync `stack` from `stacks[0]` before serialization
- [x] Task 7: Update `getDefaultState()` to include `stacks` field
- [x] Task 8: Update `isValidState()` to accept old-format state (no `stacks`) as valid
- [x] Task 9: Update `recoverCorruptedState()` to populate `stacks` from `detectStacks()`
- [x] Task 10: Add `stacks: string[]` to `InitResult` in `src/modules/infra/types.ts`
- [x] Task 11: Add test — old format migration (`stack: 'nodejs'`, no `stacks`) produces `stacks: ['nodejs']`
- [x] Task 12: Add test — new format read (`stacks: ['nodejs', 'rust']`) produces `stack: 'nodejs'`
- [x] Task 13: Add test — neither field present produces `stacks: []`, `stack: null`
- [x] Task 14: Add test — `writeState()` dual-write: both `stacks` and `stack` appear in YAML output
- [x] Task 15: Add test — `getDefaultState()` returns consistent `stack` and `stacks`
- [x] Task 16: Add test — `isValidState()` accepts both old-format and new-format state objects
- [x] Task 17: Add test — round-trip: write multi-stack → read → verify both fields intact
- [x] Task 18: Run full test suite — verify zero regressions

## Dev Agent Record

### Implementation Plan
- Added `stacks: StackName[]` to `HarnessState` interface with backward-compatible migration
- `migrateState()` normalizes three formats: old (stack only), new (stacks array), and empty (neither)
- `writeState()` dual-writes both `stack` and `stacks` for backward compat with older codeharness versions
- `recoverCorruptedState()` now uses `detectStacks()` to populate multi-stack data
- `InitResult` type updated with `stacks: string[]` and all construction sites updated
- Updated test files that construct `HarnessState` literals to include `stacks` field

### Completion Notes
- All 18 tasks completed. 19 new tests added to state.test.ts (58 total, up from 39).
- Full test suite: 114 files, 3098 tests, 0 failures.
- Also updated `retro-import.test.ts` (19 occurrences) and `stack.test.ts` (18 occurrences) to include `stacks` field in mock state objects.
- Updated `init-project.ts` to populate `stacks` from `detectStacks()` during init and rerun paths.

## File List

- `src/lib/state.ts` — Added `stacks: StackName[]` to interface, `migrateState()` function, updated `readState`, `readStateWithBody`, `writeState`, `getDefaultState`, `isValidState`, `recoverCorruptedState`
- `src/modules/infra/types.ts` — Added `stacks: string[]` to `InitResult`
- `src/modules/infra/init-project.ts` — Added `detectStacks` import, populated `stacks` in init and rerun paths
- `src/lib/__tests__/state.test.ts` — Added 19 migration tests in "Multi-stack state migration" describe block
- `src/commands/__tests__/retro-import.test.ts` — Added `stacks: ['nodejs']` to 19 mock state objects
- `src/commands/__tests__/stack.test.ts` — Added `stacks` field to 18 mock state objects, imported `StackName` type

## Change Log

- 2026-03-23: Implemented state schema migration for multi-stack support (story 9-2). Added `stacks: StackName[]` field, migration logic, dual-write backward compat, and 19 new tests. Zero regressions across 3098 tests.
- 2026-03-23: Code review fixes — (1) init-project.ts now persists multi-stacks to state file, (2) writeState no longer mutates input state object, (3) isValidState rejects stacks arrays with non-string elements, (4) recoverCorruptedState explicitly syncs stack from stacks[0]. Added 2 new tests (3100 total). Coverage 97.03%, all files above 80%.
