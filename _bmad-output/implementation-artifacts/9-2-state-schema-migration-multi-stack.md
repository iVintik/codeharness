# Story 9-2: State schema migration for multi-stack

## Status: backlog

## Story

As a developer upgrading codeharness,
I want my existing state file to auto-migrate to the new multi-stack format,
So that I don't have to re-initialize.

## Acceptance Criteria

- [ ] AC1: Given an old state file with `stack: 'nodejs'`, when `readState()` is called, then `state.stacks` is `['nodejs']` and `state.stack` is `'nodejs'` <!-- verification: cli-verifiable -->
- [ ] AC2: Given a new state file with `stacks: ['nodejs', 'rust']`, when `readState()` is called, then `state.stacks` is `['nodejs', 'rust']` and `state.stack` is `'nodejs'` <!-- verification: cli-verifiable -->
- [ ] AC3: Given a state file with neither `stack` nor `stacks`, when `readState()` is called, then `state.stacks` is `[]` and `state.stack` is `null` <!-- verification: cli-verifiable -->
- [ ] AC4: Given state is written via `writeState()`, when the file is inspected, then it contains both `stacks: ['nodejs', 'rust']` AND `stack: 'nodejs'` for backward compat <!-- verification: cli-verifiable -->

## Technical Notes

### Changes to `src/lib/state.ts`

The `HarnessState` interface (L7-41) needs:

1. **New field:** `stacks: string[]` — the canonical multi-stack field.
2. **Keep field:** `stack: string | null` — deprecated, kept for backward compat. Always equals `stacks[0] ?? null`.

### Migration logic in `readState()`

In the existing `readState()` function, add migration after parsing the YAML frontmatter:

```
if state has `stacks` array → use it, set `stack = stacks[0] ?? null`
else if state has `stack` string → convert: `stacks = [stack]`, keep `stack` as-is
else → `stacks = []`, `stack = null`
```

### Write logic in `writeState()`

Always write both fields:
- `stacks: ['nodejs', 'rust']`
- `stack: 'nodejs'` (= `stacks[0] ?? null`)

This ensures old versions of codeharness reading the state file still see a valid `stack` field.

### Update `getDefaultState()`

Accept `stacks: string[]` parameter instead of `stack: string | null`. Set both `stacks` and `stack` (compat) on the default state object.

### Update `src/modules/infra/types.ts`

The `InitResult` interface (L65, L77) has `stack: string | null`. Add `stacks: string[]` alongside it. Keep `stack` as `stacks[0] ?? null` for any consumers that read it.

### Test file

Create/update `src/lib/__tests__/state.test.ts`:
- Old format migration: `{ stack: 'nodejs' }` → `stacks: ['nodejs']`
- New format read: `{ stacks: ['nodejs', 'rust'] }` → both fields correct
- Empty state: neither field → `stacks: []`, `stack: null`
- Write round-trip: write multi-stack, read back, verify both fields present

## Files to Change

- `src/lib/state.ts` — Add `stacks: string[]` to `HarnessState` (L7-41), add migration logic in `readState()`, update `writeState()` to always write both fields, update `getDefaultState()`
- `src/modules/infra/types.ts` — Add `stacks: string[]` to `InitResult` (L65, L77), keep `stack` as compat alias
- `src/lib/__tests__/state.test.ts` — Add migration tests (old format, new format, empty, round-trip)
