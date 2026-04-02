# Verification Proof: Story 2-5 Validate Command

Story: `_bmad-output/implementation-artifacts/2-5-validate-command.md`
Verified: 2026-04-02
Tier: test-provable

## Build & Test Summary

- **Build**: PASS (`npm run build` — tsup, 0 errors)
- **Unit Tests**: PASS (27/27 tests pass across validate-schema.test.ts + validate.test.ts; 3633/3633 total)
- **Linter**: PASS (eslint — 0 errors, 0 warnings)
- **Coverage**: validate.ts 100% lines, validate-schema.ts 100% lines (75% branch)

## Acceptance Criteria Verification

### AC #1: Valid workflow reports OK, exits 0
- **Status**: PASS
- **Evidence**: Test `exits 0 and prints [OK] for valid workflow (AC #1)` passes
- **Test**: `validate-schema.test.ts > validate schema CLI > exits 0 and prints [OK] for valid workflow (AC #1)`

### AC #2: Invalid workflow reports errors with file path and violation details, exits 1
- **Status**: PASS
- **Evidence**: Test `exits 1 and prints [FAIL] with error details for invalid workflow (AC #2)` passes
- **Test**: `validate-schema.test.ts > validate schema CLI > exits 1 and prints [FAIL] with error details for invalid workflow (AC #2)`

### AC #3: Dangling task reference caught and reported
- **Status**: PASS
- **Evidence**: Test `catches dangling task references (AC #3)` and `exits 1 and reports dangling reference (AC #3)` both pass
- **Tests**: `validate-schema.test.ts > runSchemaValidation > catches dangling task references (AC #3)`, `validate schema CLI > exits 1 and reports dangling reference (AC #3)`

### AC #4: Missing workflows directory exits 1 with informative message
- **Status**: PASS
- **Evidence**: Test `exits 1 with "No workflow files found" when dir missing (AC #4)` passes
- **Tests**: `validate-schema.test.ts > runSchemaValidation > returns fail when .codeharness/workflows/ directory does not exist (AC #4)`, `validate schema CLI > exits 1 with "No workflow files found" when dir missing (AC #4)`

### AC #5: JSON output has correct shape
- **Status**: PASS
- **Evidence**: Test `--json outputs correct shape (AC #5)` passes; mixed valid/invalid handled
- **Tests**: `validate-schema.test.ts > validate schema CLI > --json outputs correct shape (AC #5)`, `runSchemaValidation > handles mixed valid and invalid files (AC #5)`

### AC #6: Command structure preserves backward compat
- **Status**: PASS
- **Evidence**: Tests confirm `validate` defaults to schema validation, `validate self` runs self-validation, `validate schema` runs schema validation
- **Tests**: `validate schema CLI > default "validate" (no subcommand) runs schema validation (AC #6)`, `validate schema CLI > default "validate" with no workflows reports fail (AC #6)`
- **Files**: `validate.ts` (parent), `validate-schema.ts` (schema subcommand), `validate-self.ts` (self subcommand)

### AC #7: Reuses parseWorkflow() — no duplicated validation logic
- **Status**: PASS
- **Evidence**: `validate-schema.ts` imports and calls `parseWorkflow()` from `../lib/workflow-parser.js` (line 10, 87). No direct Ajv usage or validateWorkflowSchema calls found in the file.
- **File**: `src/commands/validate-schema.ts`

### AC #8: Unit tests pass with full coverage
- **Status**: PASS
- **Evidence**: 16 tests in validate-schema.test.ts + 11 tests in validate.test.ts = 27 total, all passing. Covers: valid OK, invalid errors, dangling refs, missing dir, JSON shape, exit codes, no regressions.
- **Tests**: 27/27 passed

## Files Verified

| File | Exists | Purpose |
|------|--------|---------|
| `src/commands/validate.ts` | Yes | Parent command with subcommands |
| `src/commands/validate-schema.ts` | Yes | Schema validation command + runSchemaValidation() |
| `src/commands/validate-self.ts` | Yes | Extracted self-validation logic |
| `src/commands/__tests__/validate-schema.test.ts` | Yes | 16 tests for schema validation |
| `src/commands/__tests__/validate.test.ts` | Yes | 11 tests for self-validation subcommand |

## Result

**ALL_PASS (8/8 ACs)**
