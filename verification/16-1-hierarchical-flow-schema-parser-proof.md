# Verification Proof: 16-1 Hierarchical Flow Schema & Parser

Story: `_bmad-output/implementation-artifacts/16-1-hierarchical-flow-schema-parser.md`
Verified: 2026-04-03
Tier: test-provable
Method: local CLI checks (build, test, lint, coverage, file inspection)

## Pre-flight Checks

| Check | Result | Detail |
|-------|--------|--------|
| Build (`npm run build`) | PASS | tsup compiled successfully, no errors |
| Tests (`npx vitest run`) | PASS (4691/4692) | 1 pre-existing failure in `stats.test.ts` (unrelated to story) |
| Lint (`npm run lint`) | WARN | 1 error + 52 warnings — all pre-existing, none in story files |
| Coverage (`hierarchical-flow.ts`) | 100% Stmts, 100% Branch, 100% Funcs, 100% Lines | Full coverage on new file |

## Acceptance Criteria Verification

## AC 1: `execution` object in schema with correct properties and defaults
<!-- verification: test-provable -->

**Result: PASS** <!-- /showboat exec -->

- **File existence:** `src/schemas/workflow.schema.json` exists (5004 bytes)
- **Schema evidence:** Schema defines `execution` object with properties `max_parallel` (integer, default 1), `isolation` (enum worktree|none, default none), `merge_strategy` (enum rebase|merge-commit, default merge-commit), `epic_strategy` (enum parallel|sequential, default sequential), `story_strategy` (enum sequential|parallel, default sequential)
- **Test evidence:** 5 tests pass:
  - `accepts a valid execution section with all properties`
  - `accepts execution with partial properties (defaults apply)`
  - `accepts empty execution object`
  - `rejects invalid isolation value`
  - `rejects invalid epic_strategy value`
  - `applies default execution values when execution section absent`

## AC 2: `story_flow` array accepts same format as `flow`
<!-- verification: test-provable -->

**Result: PASS** <!-- /showboat exec -->

- **Schema evidence:** `story_flow` uses `$ref: #/definitions/flowArray` — same definition as `flow`
- **Test evidence:** 2 tests pass:
  - `accepts story_flow with task ref strings`
  - `accepts story_flow with loop blocks`

## AC 3: `epic_flow` array accepts task ref strings including built-ins
<!-- verification: test-provable -->

**Result: PASS** <!-- /showboat exec -->

- **Schema evidence:** `epic_flow` uses `$ref: #/definitions/flowArray`
- **Test evidence:** 2 tests pass:
  - `accepts epic_flow with task ref strings`
  - `accepts epic_flow with loop blocks`
  - `accepts epic_flow with built-in merge and validate (AC #8)` (also relevant)

## AC 4: Backward compatibility — workflow with only `flow:` parses identically
<!-- verification: test-provable -->

**Result: PASS** <!-- /showboat exec -->

- **Schema evidence:** `required` changed from `["tasks", "flow"]` to `["tasks"]`
- **Test evidence:** 1 test passes:
  - `parses existing workflow with only flow: identically to before`

## AC 5: `resolveHierarchicalFlow` normalizes flat flow to storyFlow
<!-- verification: test-provable -->

**Result: PASS** <!-- /showboat exec -->

- **File existence:** `src/lib/hierarchical-flow.ts` exists (6156 bytes)
- **Exports:** `export function resolveHierarchicalFlow`, `export interface ExecutionConfig`, `export interface HierarchicalFlow`, `export const BUILTIN_EPIC_FLOW_TASKS`, `export const EXECUTION_DEFAULTS`
- **Test evidence:** 6 tests pass:
  - `normalizes flow to storyFlow when no story_flow present (AC #5)`
  - `uses story_flow directly when present (AC #5)`
  - `applies default execution config when absent (AC #5)`
  - `merges partial execution config with defaults`
  - `resolves epic_flow when present`
  - `normalizes flow with loop blocks correctly`

## AC 6: `workflow-parser.ts` delegates to hierarchical-flow and exposes structure
<!-- verification: test-provable -->

**Result: PASS** <!-- /showboat exec -->

- **Code evidence:** `workflow-parser.ts` imports `resolveHierarchicalFlow`, `HierarchicalFlowError`, and type `HierarchicalFlow`. `ResolvedWorkflow` interface includes `execution`, `storyFlow`, `epicFlow` fields.
- **Test evidence:** 1 test passes:
  - `parses workflow with execution + story_flow + epic_flow`

## AC 7: story_flow with dangling task reference is rejected
<!-- verification: test-provable -->

**Result: PASS** <!-- /showboat exec -->

- **Test evidence:** 2 tests pass:
  - `rejects story_flow referencing undefined task`
  - `rejects story_flow loop block referencing undefined task`

## AC 8: epic_flow with non-built-in undefined task is rejected
<!-- verification: test-provable -->

**Result: PASS** <!-- /showboat exec -->

- **Test evidence:** 3 tests pass:
  - `rejects epic_flow referencing undefined non-built-in task`
  - `rejects epic_flow loop block referencing undefined non-built-in task`
  - `accepts epic_flow with built-in merge and validate (AC #8)`

## AC 9: Coexistence of `flow:` and `story_flow:` is rejected
<!-- verification: test-provable -->

**Result: PASS** <!-- /showboat exec -->

- **Test evidence:** 2 tests pass:
  - `rejects coexistence of flow and story_flow (AC #9)` (resolveHierarchicalFlow level)
  - `rejects workflow with both flow: and story_flow:` (parseWorkflow integration level)

## AC 10: `agent: null` accepted in task definition
<!-- verification: test-provable -->

**Result: PASS** <!-- /showboat exec -->

- **Schema evidence:** `agent` field uses `oneOf: [{ type: "string" }, { type: "null" }]`
- **Test evidence:** 2 tests pass:
  - `accepts agent: null in task definition` (schema level)
  - `parses task with agent: null` (integration level)

## AC 11: `scope: per-epic` accepted in task definition
<!-- verification: test-provable -->

**Result: PASS** <!-- /showboat exec -->

- **Schema evidence:** `scope` enum is `["per-story", "per-run", "per-epic"]`
- **Test evidence:** 2 tests pass:
  - `accepts scope: per-epic in task definition` (schema level)
  - `parses task with scope: per-epic` (integration level)

## Test Summary

- **hierarchical-flow.test.ts:** 43/43 passed
- **Total suite:** 4691/4692 passed (1 pre-existing failure in stats.test.ts, unrelated)
- **Coverage on hierarchical-flow.ts:** 100% statements, 100% branches, 100% functions, 100% lines

## Files Changed

| File | Status |
|------|--------|
| `src/schemas/workflow.schema.json` | Modified |
| `src/lib/hierarchical-flow.ts` | New |
| `src/lib/workflow-parser.ts` | Modified |
| `src/commands/run.ts` | Modified |
| `src/lib/__tests__/hierarchical-flow.test.ts` | New |
| `src/lib/__tests__/driver-health-check.test.ts` | Modified |
| `src/lib/__tests__/workflow-engine.test.ts` | Modified |
| `src/lib/__tests__/schema-validate.test.ts` | Modified |

## Final Result

**ALL_PASS (11/11 ACs)**
