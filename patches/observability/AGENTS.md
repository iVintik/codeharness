# patches/observability/ — Semgrep Rules for Observability Gap Detection

Standalone Semgrep YAML rules for static analysis of observability gaps. Each `.yaml` file is a complete Semgrep config — no build step, no TypeScript. Deleting a rule file removes that check.

## Rules

| File | Purpose | Severity |
|------|---------|----------|
| catch-without-logging.yaml | Detects catch blocks without error/warn logging | WARNING |
| function-no-debug-log.yaml | Detects functions without debug/info logging | INFO |
| error-path-no-log.yaml | Detects error paths (throw/return err) without preceding log | WARNING |

## Test Fixtures

| File | Purpose |
|------|---------|
| catch-without-logging.ts | Test cases for catch-without-logging rule (annotated with `// ruleid:` / `// ok:`) |
| function-no-debug-log.ts | Test cases for function-no-debug-log rule |
| error-path-no-log.ts | Test cases for error-path-no-log rule |

## Testing

Run `semgrep --test patches/observability/` to execute all test fixtures against their rules.

## Customization

Edit YAML rules to add custom logger patterns (e.g., `logger.error(...)` for winston). Rules use `pattern-not` / `pattern-not-inside` to detect absence of logging.
