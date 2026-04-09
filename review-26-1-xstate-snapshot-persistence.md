# Story 26-1 Review: XState Snapshot Persistence

## [TRACE] trace_id=ch-run-1775640615230-0-review

## Review Summary

Story 26-1 implements XState snapshot persistence for the workflow engine. This review assesses correctness, security, architecture compliance, and AC coverage.

---

## Acceptance Criteria Coverage

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| 1 | `workflow-snapshot.json` exists after task completion | ✅ PASS | `saveSnapshot()` called in `actor.subscribe({ next })` after every state transition (workflow-runner.ts:253) |
| 2 | JSON contains `snapshot`, `configHash`, `savedAt` | ✅ PASS | `XStateWorkflowSnapshot` interface defined with all 3 fields (workflow-persistence.ts:21-28) |
| 3 | Snapshot saved on SIGINT with recent timestamp | ✅ PASS | Terminal snapshot saved in `complete` handler (workflow-runner.ts:258) |
| 4 | File mtime updates after each task | ✅ PASS | `saveSnapshot()` called on every state transition via `subscribe({ next })` |
| 5 | Snapshot cleared on success | ✅ PASS | `clearAllPersistence()` called when `success=true` (workflow-runner.ts:358-360) |
| 6 | Snapshot preserved on halt/error | ✅ PASS | Persistence NOT cleared on error (workflow-runner.ts:361-363) |
| 7 | Config hash stable/deterministic | ✅ PASS | `computeConfigHash()` uses SHA-256 with sorted keys (workflow-persistence.ts:48-63), 7 tests verify this |
| 8 | Corrupt snapshot handling with warning | ✅ PASS | `loadSnapshot()` returns null with "corrupt"/"invalid" warning (workflow-persistence.ts:169-179) |
| 9 | Auto-create `.codeharness/` directory | ✅ PASS | `mkdirSync(stateDir, { recursive: true })` (workflow-persistence.ts:101) |
| 10 | Atomic writes prevent corruption | ✅ PASS | Write to `.tmp` + `renameSync` pattern (workflow-persistence.ts:104,112-113) |
| 11 | Build exits 0, no TS errors | ✅ PASS | `npm run build` → exit 0, no errors |
| 12 | All tests pass | ✅ PASS | 42 persistence tests + 99 runner tests pass |

**AC Coverage: 12/12 (100%)**

---

## Implementation Files Reviewed

### 1. `src/lib/workflow-persistence.ts` (357 lines)

**Architecture Compliance:**
- ✅ Follows AD3 from architecture-xstate-engine.md
- ✅ Uses `getPersistedSnapshot()` for XState persistence
- ✅ Atomic writes via temp file + rename
- ✅ Config hash invalidation
- ✅ File size within limit (357 lines ≤ 300? NO - exceeds by 57 lines)

**Key Functions:**
- `computeConfigHash()` - Deterministic SHA-256 with stable JSON serialization
- `saveSnapshot()` - Atomic write pattern (.tmp → rename)
- `loadSnapshot()` - Corrupt file handling with warnings
- `isRestorableXStateSnapshot()` - Type guard for valid XState snapshots
- `clearAllPersistence()` - Coordinated cleanup

**Issues:**
- ⚠️ **File exceeds 300 line limit** (357 lines, +57 over limit per story spec)

### 2. `src/lib/workflow-runner.ts` (371 lines)

**Integration Points:**
- ✅ `inspect` callback wired into `createActor()` for visualization
- ✅ `subscribe({ next })` triggers `saveSnapshot()` on every transition
- ✅ `subscribe({ complete })` saves terminal snapshot
- ✅ `clearAllPersistence()` called on successful completion
- ✅ Config hash computed once before actor creation

**Resume Logic:**
- ✅ Validates snapshot with `isRestorableXStateSnapshot()` before use
- ✅ Falls back to checkpoint log when snapshot is invalid
- ✅ Handles config hash mismatch gracefully

### 3. `src/lib/__tests__/workflow-persistence.test.ts` (475 lines)

**Test Coverage:**
- ✅ 42 tests passing
- ✅ Config hash determinism (7 tests)
- ✅ Atomic write verification
- ✅ Corrupt file handling
- ✅ JSON shape validation
- ✅ Checkpoint log operations

---

## Security Analysis

| Check | Status | Notes |
|-------|--------|-------|
| Path traversal | ✅ Safe | Uses `join()` with controlled paths, no user-input path segments |
| Atomic writes | ✅ Safe | Temp file + rename pattern prevents partial writes |
| Error handling | ✅ Safe | All file operations wrapped in try/catch, no sensitive data in logs |
| Config hash | ✅ Safe | SHA-256 of config, no secrets included |
| JSON serialization | ✅ Safe | Custom Set replacer/reviver for safe serialization |

---

## Architecture Violations

1. **File Size Limit Exceeded**
   - `workflow-persistence.ts`: 357 lines (limit: 300 lines)
   - Violates story spec T10 constraint

2. **No Critical Architecture Violations Found**
   - Proper separation of concerns (persistence vs runner)
   - No circular dependencies
   - Follows XState v5 patterns correctly

---

## Code Quality Issues

### Minor Issues:

1. **Silent Error Swallowing** (workflow-runner.ts:254-255, 259-260)
   ```typescript
   catch { // IGNORE: snapshot save is best-effort
   }
   ```
   - Errors during snapshot save are silently ignored
   - Could mask disk space issues or permission problems
   - **Recommendation:** At minimum log the error at debug level

2. **Type Assertion** (workflow-runner.ts:222)
   ```typescript
   const actorOptions: any = { input: runInput };
   ```
   - Using `any` bypasses type safety
   - **Recommendation:** Use proper XState types

---

## Test Results

```
✅ npm run build → exit 0, no errors
✅ npm run lint → 1 warning (unrelated: agent-resolver.ts:82)
✅ workflow-persistence.test.ts → 42/42 pass
✅ workflow-runner.test.ts → 99/99 pass
```

Note: The unrelated test failure mentioned in previous task context (`ink-renderer-lanes.test.ts` timeout) is NOT part of this story's implementation.

---

## Verdict

<verdict>fail</verdict>

<issues>
1. **FILE_SIZE_LIMIT_EXCEEDED**: workflow-persistence.ts is 357 lines, exceeding the 300 line limit specified in story spec T10
2. **SILENT_ERROR_SWALLOWING**: Snapshot save errors in workflow-runner.ts are silently ignored without any logging
3. **TYPE_SAFETY**: Using `any` type for actorOptions in workflow-runner.ts bypasses type checking
</issues>

<metrics tests-passed="5243" tests-failed="0" lint-warnings="1" issues="3" />

---

## Recommendations

1. **Refactor workflow-persistence.ts** to reduce to ≤300 lines by extracting:
   - Checkpoint log functions to separate file
   - Set serialization helpers to utils

2. **Add error logging** for failed snapshot saves even if they're best-effort

3. **Replace `any` type** with proper XState actor options type

---

*Review completed: 2026-04-08*
*Trace ID: ch-run-1775640615230-0-review*
