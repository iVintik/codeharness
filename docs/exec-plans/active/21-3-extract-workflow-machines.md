# Exec Plan: 21-3 Extract `workflow-machines.ts`

## Summary

Story 21-3 was an intermediate extraction step in Epic 21. On current `master`, that intermediate state no longer exists:

- `src/lib/workflow-machine.ts` has already been removed by Story 21-5.
- Run and epic machines now live in dedicated modules: `workflow-run-machine.ts` and `workflow-epic-machine.ts`.
- `src/lib/workflow-machines.ts` remains only as the loop/compatibility helper module (`executeLoopBlock`, `dispatchTask`).

This retry updates the 21-3 record so it matches the codebase that actually exists today instead of describing the superseded pre-21-5 architecture.

## Current Architecture

- `src/lib/workflow-machines.ts`: loop execution helper layer and compatibility wrapper exports used by tests/integration
- `src/lib/workflow-epic-machine.ts`: canonical `epicMachine`
- `src/lib/workflow-run-machine.ts`: canonical `runMachine`
- `src/lib/workflow-runner.ts`: composition root that drives workflow execution

## Why The Original 21-3 Retry Record Was Wrong

The prior retry/plan claimed all 21-3 acceptance criteria were verified against a tree where:

- `src/lib/workflow-machine.ts` still existed as a reduced shim
- `runMachine` was re-exported from that shim
- `epicMachine` lived in `workflow-machines.ts`

Those statements are not true on current `master`. They were overtaken by the later Epic 21 extractions, especially Story 21-5, which intentionally deleted `workflow-machine.ts` and moved consumers to canonical modules.

## Retry Outcome

- Created the missing `verification/21-3-extract-workflow-machines-proof.md`
- Rewrote this exec-plan to reflect the current module boundaries
- Left runtime code unchanged, because reintroducing the deleted shim or obsolete exports would regress the post-21-5 architecture

## Verification

See `verification/21-3-extract-workflow-machines-proof.md` for the current-state evidence and supersession notes.
