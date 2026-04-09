# Exec Plan: Story 21-5

## Scope

- Move hierarchical-flow ownership back into `src/lib/workflow-parser.ts`
- Keep the parser public API stable for downstream imports
- Narrow `src/lib/workflow-execution.ts` to validation-only helpers
- Update direct consumers and docs that still pointed at the old ownership split

## Planned Changes

1. Inline `ExecutionConfig`, `HierarchicalFlow`, `BUILTIN_EPIC_FLOW_TASKS`, `EXECUTION_DEFAULTS`, `resolveExecutionConfig`, and `resolveHierarchicalFlow` into `src/lib/workflow-parser.ts`
2. Repoint `src/lib/workflow-epic-machine.ts` to consume `BUILTIN_EPIC_FLOW_TASKS` from `src/lib/workflow-parser.ts`
3. Update parser tests and `src/lib/AGENTS.md` to reflect the restored module boundary
4. Verify parser-focused tests, boundary tests, lint, typecheck filtering, and build

## Risks

- Type/export drift between `workflow-parser.ts` and `workflow-types.ts`
- Hidden consumers depending on `workflow-execution.ts` as the public source of parser-owned symbols
- Regressions in parser tests if the hierarchical-flow API surface changed during the refactor

## Verification

- `npx vitest run src/lib/__tests__/workflow-parser.test.ts -t 'hierarchical|parseWorkflow|resolveWorkflow'`
- `npx vitest run -t 'boundar'`
- `npx eslint src/lib/workflow-parser.ts src/lib/workflow-execution.ts src/lib/workflow-epic-machine.ts src/lib/__tests__/workflow-parser.test.ts`
- `npx tsc --noEmit`
- `npm run build`
