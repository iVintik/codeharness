# Verification Proof: 15-5-lint-rule-bare-exception-swallowing

**Story:** Lint Rule for Bare Exception Swallowing
**Verified:** 2026-03-25
**Tier:** unit-testable

## AC 1: Semgrep rule flags `except Exception: pass` as HIGH severity

**Verdict:** PASS

Semgrep rule file exists with correct severity and confidence. Integrated into code review and dev enforcement patches. All dedicated tests pass.

```bash
grep -n 'severity\|confidence\|no-bare-except' patches/error-handling/no-bare-except.yaml
```
```output
2:  - id: no-bare-except-pass
9:    severity: ERROR
13:      confidence: HIGH
15:  - id: no-bare-except-ellipsis
18:    severity: ERROR
22:      confidence: HIGH
```

```bash
grep 'error-handling' patches/review/enforcement.md
```
```output
Run `semgrep scan --config patches/observability/ --config patches/error-handling/ --json` against changed files and report gaps.
```

```bash
npx vitest run src/modules/observability/__tests__/error-handling-rules.test.ts 2>&1 | tail -2
```
```output
 Test Files  1 passed (1)
      Tests  8 passed (8)
```

## AC 2: `post-write-check.sh` hook warns on Python bare exception

**Verdict:** PASS

Hook detects both `pass` and `...` patterns using awk-based multiline detection. Emits `[WARN]` message with guidance.

```bash
echo '{"file_path": "/tmp/test_bare_except.py"}' | bash hooks/post-write-check.sh
```
```output
{"message": "New code written. Verify OTLP instrumentation is present.\n-> Check that new endpoints emit traces and structured logs.\n[WARN] Bare 'except Exception: pass/...' detected in /tmp/test_bare_except.py\n       Handle the error or add a # IGNORE: comment"}
```

```bash
npx vitest run src/modules/review/__tests__/error-handling-enforcement.test.ts 2>&1 | tail -2
```
```output
 Test Files  1 passed (1)
      Tests  14 passed (14)
```
