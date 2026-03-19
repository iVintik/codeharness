# Verification Proof: Story 1.1 — Semgrep Rules for Observability

**Story:** 1.1 — Semgrep Rules for Observability
**Verified:** 2026-03-19
**Verifier:** Claude Opus 4.6 (black-box)
**Method:** Docker container CLI execution — no source code access

---

## AC 1: Catch block without logging detected

**Given** `patches/observability/catch-without-logging.yaml` exists, **When** Semgrep runs against code with a catch block missing `console.error`/`logger.error`, **Then** it reports a warning with file, line, and description.

```bash
docker exec codeharness-verify bash -c 'cat > /tmp/test/ac1-bad.ts << "TSEOF"
function doWork() {
  try {
    riskyOperation();
  } catch (e) {
    // no logging at all
    return null;
  }
}
TSEOF
semgrep --config /usr/local/lib/node_modules/codeharness/patches/observability/catch-without-logging.yaml /tmp/test/ac1-bad.ts'
```

```output
┌────────────────┐
│ 1 Code Finding │
└────────────────┘

    /tmp/test/ac1-bad.ts
    ❯❱ usr.local.lib.node_modules.codeharness.patches.observability.catch-without-logging
          ❰❰ Blocking ❱❱
          Catch block without error logging — observability gap

            2┆ try {
            3┆   riskyOperation();
            4┆ } catch (e) {
            5┆   // no logging at all
            6┆   return null;
            7┆ }

Ran 1 rule on 1 file: 1 finding.
```

- Reports file: `/tmp/test/ac1-bad.ts`
- Reports lines: 2-7
- Reports description: "Catch block without error logging — observability gap"
- Severity is WARNING (rule config confirmed via `cat`)

**Verdict:** PASS

---

## AC 2: Function without debug logging detected

**Given** `patches/observability/function-no-debug-log.yaml` exists, **When** Semgrep runs against a function with no debug-level logging, **Then** it reports an info-level gap.

```bash
docker exec codeharness-verify bash -c 'cat > /tmp/test/ac2-bad.ts << "TSEOF"
function processData(input: string) {
  const result = input.trim();
  return result;
}
TSEOF
semgrep --config /usr/local/lib/node_modules/codeharness/patches/observability/function-no-debug-log.yaml /tmp/test/ac2-bad.ts'
```

```output
┌────────────────┐
│ 1 Code Finding │
└────────────────┘

    /tmp/test/ac2-bad.ts
     ❱ usr.local.lib.node_modules.codeharness.patches.observability.function-no-debug-log
          ❰❰ Blocking ❱❱
          Function without debug/info logging — observability gap

            1┆ function processData(input: string) {
            2┆   const result = input.trim();
            3┆   return result;
            4┆ }

Ran 1 rule on 1 file: 1 finding.
```

- Reports file: `/tmp/test/ac2-bad.ts`
- Reports lines: 1-4
- Reports description: "Function without debug/info logging — observability gap"
- Severity is INFO (rule config confirmed via `cat`)

**Verdict:** PASS

---

## AC 3: Error path without logging detected

**Given** `patches/observability/error-path-no-log.yaml` exists, **When** Semgrep runs against an error path without logging, **Then** it reports a warning.

```bash
docker exec codeharness-verify bash -c 'cat > /tmp/test/ac3-bad.ts << "TSEOF"
function validate(input: string) {
  if (!input) {
    throw new Error("input required");
  }
  return input;
}
TSEOF
semgrep --config /usr/local/lib/node_modules/codeharness/patches/observability/error-path-no-log.yaml /tmp/test/ac3-bad.ts'
```

```output
┌────────────────┐
│ 1 Code Finding │
└────────────────┘

    /tmp/test/ac3-bad.ts
    ❯❱ usr.local.lib.node_modules.codeharness.patches.observability.error-path-no-log
          ❰❰ Blocking ❱❱
          Error path without logging — observability gap

            3┆ throw new Error("input required");

Ran 1 rule on 1 file: 1 finding.
```

- Reports file: `/tmp/test/ac3-bad.ts`
- Reports line: 3
- Reports description: "Error path without logging — observability gap"
- Severity is WARNING (rule config confirmed via `cat`)

**Verdict:** PASS

---

## AC 4: Custom logging patterns (winston/logger) detected

**Given** a project using `winston` instead of `console`, **When** the user edits the YAML rules to add `logger.error(...)` patterns, **Then** Semgrep detects the custom logging patterns.

The rules already include `logger.error(...)` and `logger.warn(...)` patterns out of the box. Test: a catch block using `logger.error()` should NOT be flagged.

```bash
docker exec codeharness-verify bash -c 'cat > /tmp/test/ac4-good.ts << "TSEOF"
function doWork() {
  try {
    riskyOperation();
  } catch (e) {
    logger.error("operation failed", e);
    return null;
  }
}
TSEOF
semgrep --config /usr/local/lib/node_modules/codeharness/patches/observability/catch-without-logging.yaml /tmp/test/ac4-good.ts'
```

```output
┌──────────────┐
│ Scan Summary │
└──────────────┘
Ran 1 rule on 1 file: 0 findings.
```

- `logger.error()` in catch block is recognized as valid logging
- Rule does NOT flag it — custom pattern detection works
- The YAML rule includes `logger.error(...)` and `logger.warn(...)` patterns natively

**Verdict:** PASS

---

## AC 5: Deleting a rule skips that check — no rebuild required

**Given** rules are YAML files in `patches/observability/`, **When** a rule is deleted (excluded from config), **Then** that check is skipped — no rebuild required.

```bash
# Run with all 3 rules
docker exec codeharness-verify semgrep \
  --config /usr/local/lib/node_modules/codeharness/patches/observability/catch-without-logging.yaml \
  --config /usr/local/lib/node_modules/codeharness/patches/observability/function-no-debug-log.yaml \
  --config /usr/local/lib/node_modules/codeharness/patches/observability/error-path-no-log.yaml \
  /tmp/test/ac1-bad.ts /tmp/test/ac2-bad.ts /tmp/test/ac3-bad.ts
```

```output
Ran 3 rules on 3 files: 5 findings.
```

```bash
# Run with only 2 rules (catch-without-logging excluded)
docker exec codeharness-verify semgrep \
  --config /usr/local/lib/node_modules/codeharness/patches/observability/function-no-debug-log.yaml \
  --config /usr/local/lib/node_modules/codeharness/patches/observability/error-path-no-log.yaml \
  /tmp/test/ac1-bad.ts /tmp/test/ac2-bad.ts /tmp/test/ac3-bad.ts
```

```output
Ran 2 rules on 3 files: 4 findings.
```

- With 3 rules: 5 findings, 3 rules run (includes catch-without-logging finding on ac1-bad.ts)
- With 2 rules: 4 findings, 2 rules run (catch-without-logging finding gone)
- No rebuild, no recompilation — just exclude the YAML file and the check is skipped
- No errors from excluding a rule

**Verdict:** PASS

---

## Summary

| AC | Description | Verdict |
|----|-------------|---------|
| 1 | Catch without logging detected | PASS |
| 2 | Function without debug log detected | PASS |
| 3 | Error path without logging detected | PASS |
| 4 | Custom logger patterns recognized | PASS |
| 5 | Deleting rule skips check | PASS |

**Overall: ALL 5 ACs PASS**
