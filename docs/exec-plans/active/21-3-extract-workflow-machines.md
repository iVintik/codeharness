# Exec Plan: 21-3 Extract `workflow-machines.ts`

## Summary

Extracted all XState machine definitions and their coupled orchestration actors from the `workflow-machine.ts`
monolith into a new `workflow-machines.ts` module. This continues the Epic 21 extraction series following
`21-1-extract-workflow-actors` and `21-2-extract-workflow-compiler`.

## Changes Made

### `src/lib/workflow-machines.ts` (new, 399 lines)

All XState machines and their directly-coupled `fromPromise` actors:

- **Loop layer:** `loopIterationActor`, `loopMachine`, `executeLoopBlock`, `dispatchTask`, `collectGuideFiles`, `cleanupGuideFiles`
- **Story layer:** `storyFlowActor`
- **Epic layer:** `epicStepActor`, `epicMachine`
- **Run layer:** `runEpicActor`, `runMachine`

### `src/lib/workflow-machine.ts` (reduced from 977 → 240 lines)

Retained only:
- `HEALTH_CHECK_TIMEOUT_MS` constant
- `loadWorkItems()` function
- `checkDriverHealth()` function
- `runWorkflowActor()` entry point
- Re-exports for backward compatibility

### `src/lib/workflow-types.ts` (updated)

- Added `LoopMachineContext`, `EpicMachineContext`, `RunMachineContext` interfaces (moved from prior draft to hit ≤500 line budget)
- Added `StoryFlowInput`, `StoryFlowOutput` types
- **Retry fix:** Moved `WorkItem` and `EngineError` definitions here (from `workflow-compiler.ts`) to restore correct AD6 dependency direction

### `src/lib/workflow-compiler.ts` (updated)

- **Retry fix:** Removed duplicate `WorkItem` and `EngineError` interface definitions
- Added `import type { WorkItem, EngineError } from './workflow-types.js'`
- Added `export type { WorkItem, EngineError } from './workflow-types.js'` for backward compat

### `src/lib/AGENTS.md` (updated)

- Added `workflow-machines.ts` entry in XState v5 Workflow Engine section
- Updated `workflow-types.ts` entry to reflect new exports
- Updated `workflow-machine.ts` description to reflect post-extraction state

## Design Decisions

- Machines co-located with actors to avoid circular dependency (actors reference machines in `setup({ actors })`)
- Context interfaces moved to `workflow-types.ts` to stay under 500-line budget
- `WorkItem`/`EngineError` must be defined in `workflow-types.ts` (base layer), re-exported from `workflow-compiler.ts` — not the reverse
- No behavior changes — pure extraction/move

## Verification

All 13 ACs verified. See `verification/21-3-extract-workflow-machines-proof.md`.
