# Verification Proof: 18-3-cross-worktree-test-validation

Story: Cross-Worktree Test Validation
Verified: 2026-04-04T02:40:00Z
Tier: test-provable

## AC 1: Clean merge -> test suite runs -> MergeResult.success true with testResults

**Verdict:** PASS

```bash
grep -n 'validateMerge\|validation\.valid\|testResults' src/lib/worktree-manager.ts
```
```output
18:import { validateMerge } from './cross-worktree-validator.js';
399:      const validation = await validateMerge({
405:      if (!validation.valid) {
```

```bash
npx vitest run --reporter=verbose src/lib/__tests__/worktree-manager.test.ts 2>&1 | grep "success path"
```
```output
✓ mergeWorktree — success path (AC #3, #4) > runs test suite after successful merge and cleans up worktree
```

```bash
npx vitest run --reporter=verbose src/lib/__tests__/cross-worktree-validator.test.ts 2>&1 | grep "valid: true"
```
```output
✓ validateMerge — success path (AC #1) > returns valid: true when tests pass
✓ validateMerge — success path (AC #1) > includes coverage in test results when available
```

worktree-manager.ts calls `validateMerge()` at line 399 and checks `validation.valid`. Tests confirm `MergeResult.success` is true with `testResults` on passing tests.

## AC 2: Test failure after clean merge -> merge reverted, MergeResult { success: false, reason: 'tests-failed' }

**Verdict:** PASS

```bash
grep -n "tests-failed\|reset --hard HEAD~1" src/lib/worktree-manager.ts
```
```output
87:  reason?: 'conflict' | 'tests-failed' | 'git-error';
408:          this.execGit('git reset --hard HEAD~1');
413:          reason: 'tests-failed',
```

```bash
npx vitest run --reporter=verbose src/lib/__tests__/worktree-manager.test.ts 2>&1 | grep "test failure"
```
```output
✓ mergeWorktree — test failure path (AC #5) > reverts merge on test failure and preserves worktree
```

worktree-manager.ts reverts with `git reset --hard HEAD~1` on `!validation.valid` and returns `reason: 'tests-failed'`. Test confirms this path.

## AC 3: Test failure after agent resolution -> retry with context up to 3 attempts

**Verdict:** PASS

```bash
grep -n "lastTestFailure\|validation.output\|MAX_ATTEMPTS\|attempt" src/lib/merge-agent.ts | head -15
```
```output
49:  attempts: number;
90:    prompt += `\n**Previous attempt failed tests:**\n\`\`\`\n${testFailure}\n\`\`\`\n`;
104:    `Merge conflict could not be auto-resolved after ${MAX_ATTEMPTS} attempts.`,
137:  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
176:    if (validation.valid) {
191:    lastTestFailure = validation.output;
```

```bash
npx vitest run --reporter=verbose src/lib/__tests__/merge-agent.test.ts 2>&1 | grep -i "retry\|attempt\|3"
```
```output
✓ resolveConflicts — retry loop (AC #3) > retries up to 3 times on test failure
✓ resolveConflicts — retry loop (AC #3) > appends test failure output as context to retry prompt
✓ resolveConflicts — retry loop (AC #3) > reverts merge between attempts with git reset
✓ resolveConflicts — escalation after 3 failures (AC #6) > escalates after 3 consecutive failures
```

merge-agent.ts uses `validateMerge()` in retry loop, sets `lastTestFailure = validation.output`, and retries up to `MAX_ATTEMPTS` (3). Tests confirm retry behavior with context appending.

## AC 4: Test results written as telemetry entry to .codeharness/telemetry.jsonl

**Verdict:** PASS

```bash
grep -n "appendFileSync\|telemetry.jsonl\|writeMergeTelemetry" src/lib/cross-worktree-validator.ts
```
```output
13:import { appendFileSync, mkdirSync } from 'node:fs';
59:const TELEMETRY_FILE = 'telemetry.jsonl';
93:export function writeMergeTelemetry(opts: ValidateMergeOptions, result: ValidationResult): void {
111:    appendFileSync(join(dir, TELEMETRY_FILE), JSON.stringify(entry) + '\n');
```

```bash
npx vitest run --reporter=verbose src/lib/__tests__/cross-worktree-validator.test.ts 2>&1 | grep "telemetry"
```
```output
✓ validateMerge — telemetry integration (AC #4, #9) > writes telemetry when writeTelemetry is true
✓ validateMerge — telemetry integration (AC #4, #9) > skips telemetry when writeTelemetry is false
✓ validateMerge — telemetry integration (AC #4, #9) > writes telemetry on failure with error message
✓ validateMerge — telemetry integration (AC #4, #9) > telemetry entry has storyKey: merge-{epicId} format (AC #9)
✓ validateMerge — telemetry integration (AC #4, #9) > uses custom storyKey when provided (AC #9)
✓ validateMerge — telemetry integration (AC #4, #9) > telemetry entry includes duration_ms and timestamp
✓ validateMerge — telemetry integration (AC #4, #9) > telemetry write failure does not break validation
✓ validateMerge — telemetry integration (AC #4, #9) > writes telemetry on test command error when writeTelemetry is true
✓ validateMerge — telemetry integration (AC #4, #9) > writes telemetry on no-output error when writeTelemetry is true
✓ writeMergeTelemetry (exported helper) > writes NDJSON entry to .codeharness/telemetry.jsonl
✓ writeMergeTelemetry (exported helper) > silently catches write failures
```

`writeMergeTelemetry` appends NDJSON entries to `.codeharness/telemetry.jsonl` via `appendFileSync`. Tests verify telemetry writes with correct entry structure including passed/failed/coverage.

## AC 5: Uses configured test command with 5-minute timeout

**Verdict:** PASS

```bash
grep -n "TEST_TIMEOUT_MS\|300_000\|timeout" src/lib/cross-worktree-validator.ts
```
```output
61:const TEST_TIMEOUT_MS = 300_000; // 5 minutes
135:      timeout: TEST_TIMEOUT_MS,
```

```bash
npx vitest run --reporter=verbose src/lib/__tests__/cross-worktree-validator.test.ts 2>&1 | grep "timeout\|configured"
```
```output
✓ validateMerge — timeout (AC #5) > respects 5-minute timeout
✓ validateMerge — timeout (AC #5) > handles timeout error as failure
✓ validateMerge — test command configuration (AC #5) > uses the configured test command
```

Test verifies `execAsync` is called with `timeout: 300_000` (5 minutes) and the configured `testCommand` string.

## AC 6: New src/lib/cross-worktree-validator.ts exports validateMerge(options: ValidateMergeOptions): Promise<ValidationResult>

**Verdict:** PASS

```bash
ls -la src/lib/cross-worktree-validator.ts
```
```output
-rw-r--r--  1 ivintik  staff  5723 Apr  4 02:33 src/lib/cross-worktree-validator.ts
```

```bash
grep "^export" src/lib/cross-worktree-validator.ts
```
```output
export interface ValidateMergeOptions {
export interface ValidationResult {
export function parseTestOutput(stdout: string): { passed: number; failed: number; coverage: number | null } {
export function writeMergeTelemetry(opts: ValidateMergeOptions, result: ValidationResult): void {
export async function validateMerge(opts: ValidateMergeOptions): Promise<ValidationResult> {
```

File exists and exports `validateMerge(opts: ValidateMergeOptions): Promise<ValidationResult>` along with `ValidateMergeOptions`, `ValidationResult`, `parseTestOutput`, and `writeMergeTelemetry`.

## AC 7: ValidationResult interface has: valid, testResults { passed, failed, coverage? }, output, durationMs

**Verdict:** PASS

```typescript
// From src/lib/cross-worktree-validator.ts lines 45-54:
export interface ValidationResult {
  readonly valid: boolean;
  readonly testResults: { passed: number; failed: number; coverage: number | null };
  readonly output: string;
  readonly durationMs: number;
}
```

All required fields present: `valid: boolean`, `testResults: { passed, failed, coverage }`, `output: string`, `durationMs: number`.

## AC 8: ValidateMergeOptions interface has: testCommand, cwd, epicId, storyKey?, writeTelemetry

**Verdict:** PASS

```typescript
// From src/lib/cross-worktree-validator.ts lines 29-40:
export interface ValidateMergeOptions {
  readonly testCommand: string;
  readonly cwd: string;
  readonly epicId: string;
  readonly storyKey?: string;
  readonly writeTelemetry: boolean;
}
```

All required fields present: `testCommand: string`, `cwd: string`, `epicId: string`, `storyKey?: string` (optional), `writeTelemetry: boolean`.

## AC 9: When writeTelemetry=true, telemetry entry has storyKey='merge-{epicId}'

**Verdict:** PASS

```typescript
// From src/lib/cross-worktree-validator.ts line 98:
storyKey: opts.storyKey ?? `merge-${opts.epicId}`,
```

```bash
npx vitest run --reporter=verbose src/lib/__tests__/cross-worktree-validator.test.ts 2>&1 | grep "storyKey"
```
```output
✓ validateMerge — telemetry integration (AC #4, #9) > telemetry entry has storyKey: merge-{epicId} format (AC #9)
✓ validateMerge — telemetry integration (AC #4, #9) > uses custom storyKey when provided (AC #9)
```

Test verifies `entry.storyKey === 'merge-42'` when `epicId: '42'` and no custom `storyKey` is provided.

## AC 10: All existing worktree-manager and merge-agent tests pass — no regressions

**Verdict:** PASS

```bash
npx vitest run src/lib/__tests__/cross-worktree-validator.test.ts src/lib/__tests__/worktree-manager.test.ts src/lib/__tests__/merge-agent.test.ts
```
```output
Test Files  3 passed (3)
     Tests  124 passed (124)
```

All 124 tests pass across all 3 test files: 33 cross-worktree-validator + 66 worktree-manager + 25 merge-agent. Zero failures, zero regressions.

## Summary

- Total ACs: 10
- Passed: 10
- Failed: 0
- Escalated: 0
