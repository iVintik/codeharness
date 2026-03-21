# Exec Plan: 3-3 Onboard Alias

## Objective

Replace the old `onboard` command (478-line scan/coverage/audit/epic pipeline) with a thin alias that delegates to the audit coordinator (FR16).

## Approach

1. Extract shared audit action handler from `audit.ts` into `audit-action.ts`
2. Refactor `audit.ts` to use the shared handler
3. Rewrite `onboard.ts` as a thin alias (~40 lines) calling `executeAudit()`
4. Add deprecated `scan` subcommand with warning message
5. Remove all old imports (scanner, epic-generator, beads, etc.) from onboard.ts
6. Rewrite tests to verify alias behavior and deprecation warning

## Files Changed

- `src/commands/audit-action.ts` (new) — shared audit action handler
- `src/commands/audit.ts` (modified) — delegates to audit-action
- `src/commands/onboard.ts` (rewritten) — thin alias for audit
- `src/commands/__tests__/onboard.test.ts` (rewritten) — alias behavior tests
- `src/commands/AGENTS.md` (updated) — reflects new architecture

## Key Decisions

- Extracted `executeAudit()` into a separate file rather than exporting from audit.ts to avoid circular dependency risks and keep both command files thin
- Deprecated `scan` subcommand prints warning before delegating to audit (not before precondition check)
- Other legacy subcommands (coverage, audit, epic) silently dropped per story spec
