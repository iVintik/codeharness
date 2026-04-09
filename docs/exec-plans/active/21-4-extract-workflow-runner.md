# Exec Plan: 21-4 Extract `workflow-runner.ts`

## Summary

Story 21-4 was the extraction milestone that established `src/lib/workflow-runner.ts` as the
workflow composition root. On current `master`, that extraction has been carried further by later
Epic 21 work:

- `src/lib/workflow-runner.ts` remains the canonical entry point.
- `src/lib/workflow-machine.ts` no longer exists because Story 21-5 deleted the compatibility shim.
- Consumers now import `runWorkflowActor` directly from `workflow-runner.ts`.

This retry closes the remaining documentation gap from the earlier 21-4 record so it matches the
current tree instead of the now-superseded intermediate state.

## Current Architecture

- `src/lib/workflow-runner.ts`: composition root and runtime orchestration
- `src/lib/workflow-run-machine.ts`: top-level XState run machine
- `src/lib/workflow-epic-machine.ts`: per-epic execution machine
- `src/lib/workflow-story-machine.ts`: per-story execution machine
- `src/lib/workflow-machines.ts`: legacy loop helper compatibility layer

## Why The Original 21-4 Acceptance Shape Is Superseded

The original story assumed a temporary architecture where:

- `workflow-runner.ts` would be kept under a strict line budget
- `workflow-machine.ts` would remain as a thin backward-compatible re-export shim
- consumers such as `src/commands/run.ts` would continue importing from `workflow-machine.ts`

Those conditions are no longer true on current `master` because later Epic 21 stories completed the
decomposition:

- the shim was intentionally removed
- imports were migrated to canonical modules
- `workflow-runner.ts` absorbed later runtime responsibilities such as persistence and visualization

Reintroducing the deleted shim or forcing the old line-budget constraint back onto the current file
would regress the post-21-5 architecture.

## Retry Outcome

- Created `verification/21-4-extract-workflow-runner-proof.md`
- Added this exec-plan so the story record reflects the current module boundaries
- Left runtime code unchanged because the implementation and NFR3 boundary gate already pass in the
  current tree

## Verification

See `verification/21-4-extract-workflow-runner-proof.md` for build, targeted test, and
architecture evidence captured from the current repo state.
