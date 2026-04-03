# Verification Proof: Story 8-1 Issue Tracker Module & CLI

**Story:** 8-1-issue-tracker-module-cli
**Date:** 2026-04-03
**Tier:** runtime-provable

---

## AC 1: First issue creation — PASS

**Evidence:**

```bash
codeharness issue create "Fix Docker timeout" --priority high --source retro-sprint-1
```
```output
[OK] Created issue-001: Fix Docker timeout [high]
```

```bash
cat .codeharness/issues.yaml
```
```output
issues:
  - id: issue-001
    title: Fix Docker timeout
    source: retro-sprint-1
    priority: high
    status: backlog
    created_at: 2026-04-03T02:05:50.417Z
```

File created with issues array, auto-generated id issue-001, title, source, priority, and status backlog.

---

## AC 2: Append second issue — PASS

**Evidence:**

```bash
codeharness issue create "Another bug" --priority medium
```
```output
[OK] Created issue-002: Another bug [medium]
```

```bash
cat .codeharness/issues.yaml
```
```output
issues:
  - id: issue-001
    title: Fix Docker timeout
    source: retro-sprint-1
    priority: high
    status: backlog
    created_at: 2026-04-03T02:05:50.417Z
  - id: issue-002
    title: Another bug
    source: manual
    priority: medium
    status: backlog
    created_at: 2026-04-03T02:06:17.924Z
```

New issue appended with next sequential id issue-002. Existing issue-001 unchanged.

---

## AC 3: List issues table and JSON — PASS

**Evidence:**

```bash
codeharness issue list
```
```output
issue-001  Fix Docker timeout  [high]  backlog  (retro-sprint-1)
issue-002  Another bug  [medium]  backlog  (manual)
```

```bash
codeharness issue list --json
```
```output
{"issues":[{"id":"issue-001","title":"Fix Docker timeout","source":"retro-sprint-1","priority":"high","status":"backlog","created_at":"2026-04-03T02:05:50.417Z"},{"id":"issue-002","title":"Another bug","source":"manual","priority":"medium","status":"backlog","created_at":"2026-04-03T02:06:17.924Z"}]}
```

All issues displayed with id, title, priority, status, source. JSON flag outputs valid JSON array format.

---

## AC 4: Close issue updates status to done — PASS

**Evidence:**

```bash
codeharness issue close issue-001
```
```output
[OK] Closed issue-001: Fix Docker timeout
```

```bash
cat .codeharness/issues.yaml
```
```output
issues:
  - id: issue-001
    title: Fix Docker timeout
    source: retro-sprint-1
    priority: high
    status: done
    created_at: 2026-04-03T02:05:50.417Z
  - id: issue-002
    title: Another bug
    source: manual
    priority: medium
    status: backlog
    created_at: 2026-04-03T02:06:17.924Z
```

Status updated from backlog to done. File written back correctly.

---

## AC 5: Valid status values — PASS

**Evidence:**

```bash
grep -n "VALID_STATUSES" src/lib/issue-tracker.ts
```
```output
33:export const VALID_STATUSES: ReadonlySet<string> = new Set([
```

```bash
npm run test:unit -- --reporter=verbose 2>&1 | grep "VALID_STATUSES"
```
```output
 ✓ lib/__tests__/issue-tracker.test.ts > constants > VALID_STATUSES contains all expected values
```

Test confirms VALID_STATUSES contains: backlog, ready, in-progress, review, verifying, done, failed, blocked.

---

## AC 6: Default source is manual — PASS

**Evidence:**

```bash
npm run test:unit -- --reporter=verbose 2>&1 | grep "defaults"
```
```output
 ✓ lib/__tests__/issue-tracker.test.ts > createIssue > sets defaults: source=manual, priority=medium, status=backlog
```

Runtime evidence: issue-002 created without --source shows source: manual in YAML output (see AC 2).

---

## AC 7: Default priority is medium — PASS

**Evidence:**

```bash
npm run test:unit -- --reporter=verbose 2>&1 | grep "default.*priority\|defaults"
```
```output
 ✓ lib/__tests__/issue-tracker.test.ts > createIssue > sets defaults: source=manual, priority=medium, status=backlog
 ✓ commands/__tests__/issue.test.ts > issue create > uses default priority and source
```

Runtime evidence: issue-002 created without --priority shows priority: medium (see AC 2).

---

## AC 8: Close non-existent issue returns error — PASS

**Evidence:**

```bash
codeharness issue close issue-999; echo "EXIT: $?"
```
```output
[FAIL] Issue 'issue-999' not found
EXIT: 1
```

```bash
npm run test:unit -- --reporter=verbose 2>&1 | grep "non-existent\|bad id"
```
```output
 ✓ lib/__tests__/issue-tracker.test.ts > closeIssue > throws for non-existent id
 ✓ commands/__tests__/issue.test.ts > issue close > with bad id returns error
```

Error message printed, exit code 1.

---

## AC 9: List with no issues.yaml — PASS

**Evidence:**

```bash
cd /tmp/empty-dir && codeharness issue list; echo "EXIT: $?"
```
```output
[INFO] No issues found
EXIT: 0
```

Prints "No issues found" and exits with code 0.

---

## AC 10: Build and tests pass — PASS

**Evidence:**

```bash
npm run build 2>&1 | tail -4
```
```output
ESM dist/index.js           334.45 KB
ESM ⚡️ Build success in 26ms
DTS Build start
DTS ⚡️ Build success in 770ms
```

```bash
npm run test:unit 2>&1 | tail -4
```
```output
 Test Files  161 passed (161)
      Tests  4159 passed (4159)
   Start at  06:05:25
   Duration  8.60s
```

Build: zero errors. Tests: 4159 passed, 0 failed.

---

## AC 11: Unit tests at 80+ percent coverage — PASS

**Evidence:**

```bash
npm run test:coverage 2>&1 | grep -E "issue"
```
```output
  issue.ts         |   86.84 |       70 |     100 |   86.84
  issue-tracker.ts |     100 |    96.15 |     100 |     100
```

issue-tracker.ts: 100% statements, 96.15% branches, 100% functions, 100% lines.
issue.ts (command): 86.84% statements, 70% branches, 100% functions, 86.84% lines.
Both exceed 80% coverage target.

27 tests total across issue-tracker.test.ts (19) and issue.test.ts (8) covering creation, listing, closing, defaults, error handling, file I/O, id generation.

---

## AC 12: YAML format matches workflow-engine loadWorkItems — PASS

**Evidence:**

```bash
npm run test:unit -- --reporter=verbose 2>&1 | grep "workflow-engine\|loadWorkItems"
```
```output
 ✓ lib/__tests__/issue-tracker.test.ts > workflow-engine compatibility > created YAML round-trips through yaml parse matching loadWorkItems expectations
 ✓ lib/__tests__/workflow-engine.test.ts > loadWorkItems > loads both stories and issues when issues.yaml exists (AC #5)
```

Round-trip test confirms: top-level issues key, array of objects with id, title, source, priority, status fields matching loadWorkItems expectations.

---

## Summary

| AC | Description | Tier | Result |
|----|-------------|------|--------|
| 1 | First issue creation | runtime-provable | PASS |
| 2 | Append second issue | runtime-provable | PASS |
| 3 | List issues table + JSON | runtime-provable | PASS |
| 4 | Close issue | runtime-provable | PASS |
| 5 | Valid status values | test-provable | PASS |
| 6 | Default source manual | test-provable | PASS |
| 7 | Default priority medium | test-provable | PASS |
| 8 | Close non-existent error | test-provable | PASS |
| 9 | List with no file | runtime-provable | PASS |
| 10 | Build + tests pass | test-provable | PASS |
| 11 | 80%+ coverage | test-provable | PASS |
| 12 | YAML format compatibility | test-provable | PASS |

**Final Result: ALL_PASS (12/12 ACs)**
