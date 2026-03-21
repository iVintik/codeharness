# Proof: 3-3 Onboard Alias

## Acceptance Criteria Verification

### AC #1: `codeharness onboard` produces identical output to `codeharness audit`
- **Verified:** Both commands call `executeAudit({ isJson, isFix })` from the same shared handler (`audit-action.ts`). Code path is identical.
- **Test:** `onboard.test.ts` — "delegates to audit logic when run with no flags"

### AC #2: `codeharness onboard --fix` produces identical output to `codeharness audit --fix`
- **Verified:** `--fix` flag is mirrored and passed to `executeAudit()`.
- **Test:** `onboard.test.ts` — "delegates to audit --fix logic"

### AC #3: `codeharness onboard --json` produces identical JSON to `codeharness audit --json`
- **Verified:** `--json` flag is mirrored and passed to `executeAudit()`.
- **Test:** `onboard.test.ts` — "produces same JSON output as audit --json"

### AC #4: `codeharness onboard --fix --json` produces identical output
- **Verified:** Both flags passed through to shared handler.
- **Test:** `onboard.test.ts` — "produces same JSON output as audit --fix --json"

### AC #5: Harness not initialized error matches audit behavior
- **Verified:** Same `executeAudit()` handler produces identical error.
- **Test:** `onboard.test.ts` — "exits with fail when harness not initialized", "exits with JSON fail when not initialized with --json"

### AC #6: `codeharness onboard scan` prints deprecation warning then runs audit
- **Verified:** `scan` subcommand calls `warn()` with deprecation message then calls `executeAudit()`.
- **Test:** `onboard.test.ts` — "prints deprecation warning and runs audit", "prints deprecation warning even with precondition failure"

### AC #7: Old `registerOnboardCommand` replaced, no duplicate registration
- **Verified:** Old 478-line implementation fully replaced with 40-line alias. `src/index.ts` registers both `audit` and `onboard` without duplicates.

### AC #8: `codeharness --help` shows both commands
- **Verified:** Both `registerAuditCommand` and `registerOnboardCommand` are called in `src/index.ts`. Onboard description is "Alias for audit -- check all compliance dimensions".
- **Test:** `onboard.test.ts` — "--help shows both audit and onboard commands", "onboard description is 'Alias for audit'"

## Coverage

- `audit-action.ts`: 100% statements, 100% lines, 100% functions
- `audit.ts`: 100% all metrics
- `onboard.ts`: 100% all metrics
- Full test suite: 108 files, 2781 tests, 0 failures
