# Story 11-3: State Reconciliation on Session Start

## Status: backlog

## Story

As a developer,
I want state consistency verified at the start of every session,
So that desyncs from crashes or manual edits are caught immediately.

## Acceptance Criteria

- [ ] AC1: Given `sprint-state.json` and `sprint-status.yaml` are out of sync, when harness-run Step 1 pre-flight runs `reconcileState()`, then `sprint-state.json` is authoritative and `sprint-status.yaml` is regenerated <!-- verification: cli-verifiable -->

## Technical Notes

**Decision 1 (Unified State)** and **Decision 11 (Process Enforcement)** -- state reconciliation is one of five embedded gates in harness-run Step 1 pre-flight.

Create `reconcileState()` function that runs at the very start of `harness-run`:

1. Read `sprint-state.json` (the authority)
2. If it has no `version` field, trigger migration from story 11-1
3. Regenerate `sprint-status.yaml` from `sprint-state.json` (overwrites any manual edits to YAML)
4. Check for orphaned state files (`.story_retries`, `.flagged_stories`) and merge them if found
5. Validate internal consistency: every story in `stories` should belong to an epic in `epics`
6. Log any corrections made: `[INFO] Reconciled: regenerated sprint-status.yaml`, `[INFO] Reconciled: merged .story_retries into sprint-state.json`

This runs as part of Step 1 pre-flight in `src/commands/run.ts`, alongside Docker pre-check (story 14-3) and orphan cleanup.

The function should be idempotent -- running it on an already-consistent state is a no-op.

## Files to Change

- `src/modules/sprint/state.ts` — Add `reconcileState()` function that validates and regenerates derived views
- `src/commands/run.ts` — Call `reconcileState()` in Step 1 pre-flight, before story selection
- `src/modules/sprint/__tests__/reconciliation.test.ts` — Test: out-of-sync YAML gets regenerated, orphaned files get merged, consistent state is no-op
