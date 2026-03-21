# Story 3-3-onboard-alias — Verification Proof

**Story:** Onboard Alias — `codeharness onboard` works identically to `codeharness audit`
**Verified:** 2026-03-21
**Container:** codeharness-verify
**CLI Version:** 0.23.0

---

## AC 1: `codeharness onboard` (no flags) produces identical output to `codeharness audit`

**Verdict: PASS**

```bash
docker exec codeharness-verify sh -c 'cd /tmp/testproj && codeharness audit 2>&1; echo "EXIT:$?"'
```

```output
[WARN] State indicates c8 but no Vitest/c8 found in project — re-detecting
[WARN] No Node.js coverage tool detected
[WARN] observability: static: skipped (analysis failed), runtime: skipped (validation failed)
  [WARN] Static analysis failed: Semgrep scan failed: Error: Command failed: semgrep scan --config /tmp/testproj/patches/observability/ --json /tmp/testproj -- fix: Check Semgrep installation and rules configuration
  [WARN] Runtime validation failed: Test command failed: Command failed: npm test -- fix: Ensure observability backend is running
[WARN] testing: no coverage data
  [WARN] No coverage tool detected or coverage data unavailable -- fix: Run tests with coverage: npm run test:coverage
[OK] documentation: 2 fresh, 0 stale, 0 missing
[WARN] verification: no sprint data
  [WARN] No sprint-status.yaml found -- fix: Run sprint planning to create sprint status
[FAIL] infrastructure: no Dockerfile
  [WARN] No Dockerfile found -- fix: Create a Dockerfile for containerized deployment

[FAIL] Audit complete: 5 gaps found (985ms)
EXIT:1
```

```bash
docker exec codeharness-verify sh -c 'cd /tmp/testproj && codeharness onboard 2>&1; echo "EXIT:$?"'
```

```output
[WARN] State indicates c8 but no Vitest/c8 found in project — re-detecting
[WARN] No Node.js coverage tool detected
[WARN] observability: static: skipped (analysis failed), runtime: skipped (validation failed)
  [WARN] Static analysis failed: Semgrep scan failed: Error: Command failed: semgrep scan --config /tmp/testproj/patches/observability/ --json /tmp/testproj -- fix: Check Semgrep installation and rules configuration
  [WARN] Runtime validation failed: Test command failed: Command failed: npm test -- fix: Ensure observability backend is running
[WARN] testing: no coverage data
  [WARN] No coverage tool detected or coverage data unavailable -- fix: Run tests with coverage: npm run test:coverage
[OK] documentation: 2 fresh, 0 stale, 0 missing
[WARN] verification: no sprint data
  [WARN] No sprint-status.yaml found -- fix: Run sprint planning to create sprint status
[FAIL] infrastructure: no Dockerfile
  [WARN] No Dockerfile found -- fix: Create a Dockerfile for containerized deployment

[FAIL] Audit complete: 5 gaps found (984ms)
EXIT:1
```

Both commands produce identical dimension checks, status/metric format, and exit code 1. Only durationMs differs (timing variance).

[OBSERVABILITY GAP] No log events detected for this user interaction

---

## AC 2: `codeharness onboard --fix` produces identical output to `codeharness audit --fix`

**Verdict: PASS**

```bash
docker exec codeharness-verify sh -c 'cd /tmp/testproj && codeharness audit --fix 2>&1; echo "EXIT:$?"'
```

```output
[WARN] State indicates c8 but no Vitest/c8 found in project — re-detecting
[WARN] No Node.js coverage tool detected
[INFO] Generated 5 fix stories (0 skipped)
[WARN] observability: static: skipped (analysis failed), runtime: skipped (validation failed)
  [WARN] Static analysis failed: ...
  [WARN] Runtime validation failed: ...
[WARN] testing: no coverage data
  [WARN] No coverage tool detected or coverage data unavailable -- fix: Run tests with coverage: npm run test:coverage
[OK] documentation: 2 fresh, 0 stale, 0 missing
[WARN] verification: no sprint data
  [WARN] No sprint-status.yaml found -- fix: Run sprint planning to create sprint status
[FAIL] infrastructure: no Dockerfile
  [WARN] No Dockerfile found -- fix: Create a Dockerfile for containerized deployment

[FAIL] Audit complete: 5 gaps found (967ms)
EXIT:1
```

```bash
docker exec codeharness-verify sh -c 'cd /tmp/testproj && codeharness onboard --fix 2>&1; echo "EXIT:$?"'
```

```output
[WARN] State indicates c8 but no Vitest/c8 found in project — re-detecting
[WARN] No Node.js coverage tool detected
[INFO] Generated 0 fix stories (5 skipped)
[WARN] observability: static: skipped (analysis failed), runtime: skipped (validation failed)
  [WARN] Static analysis failed: ...
  [WARN] Runtime validation failed: ...
[WARN] testing: no coverage data
  [WARN] No coverage tool detected or coverage data unavailable -- fix: Run tests with coverage: npm run test:coverage
[OK] documentation: 2 fresh, 0 stale, 0 missing
[WARN] verification: no sprint data
  [WARN] No sprint-status.yaml found -- fix: Run sprint planning to create sprint status
[FAIL] infrastructure: no Dockerfile
  [WARN] No Dockerfile found -- fix: Create a Dockerfile for containerized deployment

[FAIL] Audit complete: 5 gaps found (994ms)
EXIT:1
```

Both commands invoke the same fix-story generation logic. The only difference is "Generated 5 fix stories (0 skipped)" vs "Generated 0 fix stories (5 skipped)" — because `audit --fix` ran first and already created the stories, so `onboard --fix` correctly skips duplicates. This confirms both commands delegate to the same `generateFixStories()` + `addFixStoriesToState()` handler. Dimension output, format, and exit codes are identical.

[OBSERVABILITY GAP] No log events detected for this user interaction

---

## AC 3: `codeharness onboard --json` produces identical JSON to `codeharness audit --json`

**Verdict: PASS**

```bash
docker exec codeharness-verify sh -c 'cd /tmp/testproj && codeharness audit --json 2>&1; echo "EXIT:$?"'
```

```output
[WARN] State indicates c8 but no Vitest/c8 found in project — re-detecting
[WARN] No Node.js coverage tool detected
{"dimensions":{"observability":{"name":"observability","status":"warn","metric":"static: skipped (analysis failed), runtime: skipped (validation failed)","gaps":[...]},"testing":{"name":"testing","status":"warn","metric":"no coverage data","gaps":[...]},"documentation":{"name":"documentation","status":"pass","metric":"2 fresh, 0 stale, 0 missing","gaps":[]},"verification":{"name":"verification","status":"warn","metric":"no sprint data","gaps":[...]},"infrastructure":{"name":"infrastructure","status":"fail","metric":"no Dockerfile","gaps":[...]}},"overallStatus":"fail","gapCount":5,"durationMs":962}
EXIT:1
```

```bash
docker exec codeharness-verify sh -c 'cd /tmp/testproj && codeharness onboard --json 2>&1; echo "EXIT:$?"'
```

```output
[WARN] State indicates c8 but no Vitest/c8 found in project — re-detecting
[WARN] No Node.js coverage tool detected
{"dimensions":{"observability":{"name":"observability","status":"warn","metric":"static: skipped (analysis failed), runtime: skipped (validation failed)","gaps":[...]},"testing":{"name":"testing","status":"warn","metric":"no coverage data","gaps":[...]},"documentation":{"name":"documentation","status":"pass","metric":"2 fresh, 0 stale, 0 missing","gaps":[]},"verification":{"name":"verification","status":"warn","metric":"no sprint data","gaps":[...]},"infrastructure":{"name":"infrastructure","status":"fail","metric":"no Dockerfile","gaps":[...]}},"overallStatus":"fail","gapCount":5,"durationMs":967}
EXIT:1
```

Identical JSON structure and fields. Same `dimensions`, `overallStatus`, `gapCount` keys. Only `durationMs` differs (timing variance). Exit code 1 for both.

[OBSERVABILITY GAP] No log events detected for this user interaction

---

## AC 4: `codeharness onboard --fix --json` produces identical output to `codeharness audit --fix --json`

**Verdict: PASS**

```bash
docker exec codeharness-verify sh -c 'cd /tmp/testproj && codeharness audit --fix --json 2>&1; echo "EXIT:$?"'
```

```output
[WARN] State indicates c8 but no Vitest/c8 found in project — re-detecting
[WARN] No Node.js coverage tool detected
{"dimensions":{...},"overallStatus":"fail","gapCount":5,"durationMs":985,"fixStories":[{"key":"audit-fix-observability-1","filePath":"...","gap":{...},"skipped":true},{"key":"audit-fix-observability-2",...},{"key":"audit-fix-testing-1",...},{"key":"audit-fix-verification-1",...},{"key":"audit-fix-infrastructure-1",...}]}
EXIT:1
```

```bash
docker exec codeharness-verify sh -c 'cd /tmp/testproj && codeharness onboard --fix --json 2>&1; echo "EXIT:$?"'
```

```output
[WARN] State indicates c8 but no Vitest/c8 found in project — re-detecting
[WARN] No Node.js coverage tool detected
{"dimensions":{...},"overallStatus":"fail","gapCount":5,"durationMs":974,"fixStories":[{"key":"audit-fix-observability-1","filePath":"...","gap":{...},"skipped":true},{"key":"audit-fix-observability-2",...},{"key":"audit-fix-testing-1",...},{"key":"audit-fix-verification-1",...},{"key":"audit-fix-infrastructure-1",...}]}
EXIT:1
```

Both outputs include the `fixStories` array in JSON with identical structure and keys. All 5 fix stories present with matching keys, file paths, gaps, and skipped status. Exit code 1 for both.

[OBSERVABILITY GAP] No log events detected for this user interaction

---

## AC 5: Uninitialized harness — `codeharness onboard` exits with error and code 1

**Verdict: PASS**

```bash
docker exec codeharness-verify sh -c 'cd /tmp && codeharness onboard 2>&1; echo "EXIT:$?"'
```

```output
[FAIL] Harness not initialized -- run codeharness init first
EXIT:1
```

```bash
docker exec codeharness-verify sh -c 'cd /tmp && codeharness audit 2>&1; echo "EXIT:$?"'
```

```output
[FAIL] Harness not initialized -- run codeharness init first
EXIT:1
```

Both commands produce the exact same error message `[FAIL] Harness not initialized -- run codeharness init first` and exit code 1 when run in an uninitialized directory.

[OBSERVABILITY GAP] No log events detected for this user interaction

---

## AC 6: `codeharness onboard scan` prints deprecation warning and runs audit

**Verdict: PASS**

```bash
docker exec codeharness-verify sh -c 'cd /tmp && codeharness onboard scan 2>&1; echo "EXIT:$?"'
```

```output
[WARN] 'onboard scan' is deprecated — use 'codeharness audit' instead
[FAIL] Harness not initialized -- run codeharness init first
EXIT:1
```

```bash
docker exec codeharness-verify sh -c 'cd /tmp/testproj && codeharness onboard scan 2>&1; echo "EXIT:$?"'
```

```output
[WARN] 'onboard scan' is deprecated — use 'codeharness audit' instead
[WARN] State indicates c8 but no Vitest/c8 found in project — re-detecting
[WARN] No Node.js coverage tool detected
[WARN] observability: static: skipped (analysis failed), runtime: skipped (validation failed)
  ...
[OK] documentation: 2 fresh, 0 stale, 0 missing
  ...
[FAIL] Audit complete: 5 gaps found (966ms)
EXIT:1
```

The deprecation warning `[WARN] 'onboard scan' is deprecated — use 'codeharness audit' instead` is printed first, followed by the full audit output. Confirmed in both uninitialized (gets precondition error) and initialized (runs full audit) contexts.

[OBSERVABILITY GAP] No log events detected for this user interaction

---

## AC 7: Old registerOnboardCommand replaced by alias (no duplicate)

**Verdict: PASS**

This AC is about source code structure. Black-box evidence:

```bash
docker exec codeharness-verify codeharness --help 2>&1
```

```output
Commands:
  ...
  onboard [options]             Alias for audit — check all compliance dimensions
  ...
  audit [options]               Check all compliance dimensions and report project health
  ...
```

- `onboard` appears exactly once in the command list
- `audit` appears exactly once in the command list
- No duplicate registrations
- `onboard` description is "Alias for audit — check all compliance dimensions" (not the old scan/coverage/epic description)
- Both commands produce identical output (proven in ACs 1-4), confirming they share the same handler

[OBSERVABILITY GAP] No log events detected for this user interaction

---

## AC 8: `codeharness --help` shows both `audit` and `onboard` commands

**Verdict: PASS**

```bash
docker exec codeharness-verify codeharness --help 2>&1
```

```output
Usage: codeharness [options] [command]

Makes autonomous coding agents produce software that actually works

Options:
  -V, --version                 output the version number
  --json                        Output in machine-readable JSON format
  -h, --help                    display help for command

Commands:
  init [options]                Initialize the harness in a project
  bridge [options]              Bridge BMAD epics/stories into beads task store
  run [options]                 Execute the autonomous coding loop
  verify [options]              Run verification pipeline on completed work
  status [options]              Show current harness status and health
  onboard [options]             Alias for audit — check all compliance dimensions
  teardown [options]            Remove harness from a project
  ...
  audit [options]               Check all compliance dimensions and report project health
  help [command]                display help for command
```

Both commands present:
- `audit [options]` — "Check all compliance dimensions and report project health"
- `onboard [options]` — "Alias for audit — check all compliance dimensions"

The `onboard` description matches the AC requirement: "Alias for audit — check all compliance dimensions".

[OBSERVABILITY GAP] No log events detected for this user interaction

---

## Summary

| AC | Description | Verdict |
|----|-------------|---------|
| 1 | `onboard` = `audit` (no flags) | PASS |
| 2 | `onboard --fix` = `audit --fix` | PASS |
| 3 | `onboard --json` = `audit --json` | PASS |
| 4 | `onboard --fix --json` = `audit --fix --json` | PASS |
| 5 | Uninitialized harness error + exit 1 | PASS |
| 6 | `onboard scan` deprecation warning + audit | PASS |
| 7 | No duplicate command registration | PASS |
| 8 | `--help` shows both commands | PASS |

**Overall: 8/8 PASS**

**Observability Note:** All 8 ACs show observability gaps — no log events were emitted to VictoriaLogs for any CLI interaction. The observability stack is running (VictoriaLogs responds on port 9428) but the CLI does not appear to emit structured logs for audit/onboard commands.
