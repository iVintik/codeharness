# Verification Proof: Story 11-1 — Workflow Schema Extension

**Story:** 11-1-workflow-schema-extension
**Verified by:** Claude Opus 4.6 (automated CLI verification)
**Date:** 2026-04-03
**Tier:** test-provable

## Build & Test Summary

| Check | Result |
|-------|--------|
| `npm run build` | PASS — zero errors, build success |
| `npm run test:unit` | PASS — 4338 passed across 164 files, 0 failures |
| `eslint` | PASS — 0 errors, 3 warnings (2 unused vars in workflow-engine.ts, 1 config skip for JSON) |
| Coverage (workflow-parser.ts) | 94.26% statements, 81.44% branches, 100% functions, 94.06% lines |

## Acceptance Criteria Verification

### AC #1: Schema updated with driver, model, plugins fields

**Result: PASS**

Evidence from `src/schemas/workflow.schema.json` (lines 88-100):
- `driver`: `{ "type": "string" }` — optional, no default
- `model`: `{ "type": "string" }` — optional, no default
- `plugins`: `{ "type": "array", "items": { "type": "string" } }` — optional
- None of the three fields appear in the `required` array (only `agent` is required)

### AC #2: Existing workflows without new fields validate successfully

**Result: PASS**

Test evidence: `workflow-parser.test.ts` test "minimal workflow without new fields parses successfully — backward compat (AC #2)" — PASSED.

Resolved tasks have `driver`, `model`, `plugins` as `undefined` when not present in source YAML — confirmed by `validateAndResolve()` logic which only sets these fields when `task.X !== undefined` (lines 126-134 of workflow-parser.ts).

### AC #3: Workflow with driver/model/plugins parses correctly

**Result: PASS**

Test evidence from `workflow-parser.test.ts`:
- "task with driver: codex parses into ResolvedTask.driver === 'codex' (AC #3)" — PASSED
- "task with model: claude-opus-4 parses into ResolvedTask.model (AC #3)" — PASSED
- "task with plugins: [gstack, omo] parses into ResolvedTask.plugins (AC #3)" — PASSED
- "task with all three new fields parses correctly (AC #3)" — PASSED

### AC #4: ResolvedTask interface includes optional driver, model, plugins

**Result: PASS**

Evidence from `src/lib/workflow-parser.ts` (lines 15-27):
```typescript
export interface ResolvedTask {
  agent: string;
  scope: 'per-story' | 'per-run';
  session: 'fresh' | 'continue';
  source_access: boolean;
  prompt_template?: string;
  input_contract?: Record<string, unknown>;
  output_contract?: Record<string, unknown>;
  max_budget_usd?: number;
  driver?: string;
  model?: string;
  plugins?: string[];
}
```

All existing fields (`agent`, `scope`, `session`, `source_access`, etc.) remain unchanged.

Test evidence: "ResolvedTask type exposes optional driver, model, plugins fields (AC #4)" — PASSED.

### AC #5: validateAndResolve() populates new fields from YAML, omits when absent

**Result: PASS**

Evidence from `src/lib/workflow-parser.ts` (lines 126-134):
```typescript
if (task.driver !== undefined) {
  resolved.driver = task.driver as string;
}
if (task.model !== undefined) {
  resolved.model = task.model as string;
}
if (task.plugins !== undefined) {
  resolved.plugins = task.plugins as string[];
}
```

No defaults are set — fields remain `undefined` when absent.

### AC #6: additionalProperties: false does not reject new fields

**Result: PASS**

Evidence: `additionalProperties: false` is on line 102 of `workflow.schema.json`, and the new fields are defined within the `properties` block (lines 88-100), so they are recognized.

Test evidence: "new fields alongside agent pass schema validation — not rejected as additionalProperties (AC #6)" — PASSED.

### AC #7: Build succeeds, tests pass with no regressions

**Result: PASS**

- `npm run build`: zero TypeScript errors
- `npm run test:unit`: 4338 passed, 0 failed across 164 test files
- workflow-parser.test.ts: 60 tests, all passed

### AC #8: Unit tests verify parsing, backward compat, and type rejection

**Result: PASS**

Test evidence from `workflow-parser.test.ts` (Story 11-1 test suite):
- "minimal workflow without new fields parses successfully — backward compat (AC #2)" — PASSED
- "task with driver: codex parses into ResolvedTask.driver === 'codex' (AC #3)" — PASSED
- "task with model: claude-opus-4 parses into ResolvedTask.model (AC #3)" — PASSED
- "task with plugins: [gstack, omo] parses into ResolvedTask.plugins (AC #3)" — PASSED
- "task with all three new fields parses correctly (AC #3)" — PASSED
- "driver: 123 (wrong type) fails schema validation (AC #8)" — PASSED
- "model: true (wrong type) fails schema validation (AC #8)" — PASSED
- "plugins: 'not-array' (wrong type) fails schema validation (AC #8)" — PASSED
- "plugins: [123] (non-string array items) fails schema validation" — PASSED
- "empty plugins array is valid" — PASSED
- "ResolvedTask type exposes optional driver, model, plugins fields (AC #4)" — PASSED
- "deep-merges driver, model, plugins via project patch onto embedded base (Story 11-1)" — PASSED

## Additional Verification: Forward-Compat Cast Removal (Task 5)

**Result: PASS**

- Grep for `(task as` in `workflow-engine.ts`: **zero matches** — all forward-compat casts removed
- `task.driver` used directly at line 293: `const driverName = task.driver ?? 'claude-code';`
- `task.plugins` used directly at line 325: `...(task.plugins ? { plugins: task.plugins } : {})`
- TypeScript compiles without errors after cleanup

## Final Result

**ALL_PASS (8/8 ACs)**
