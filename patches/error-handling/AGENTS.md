# patches/error-handling/ — Semgrep Rules for Error Handling Enforcement

Standalone Semgrep YAML rules for detecting dangerous error-swallowing patterns. Each `.yaml` file is a complete Semgrep config — no build step, no TypeScript. Deleting a rule file removes that check.

## Rules

### Python

| File | Purpose | Severity |
|------|---------|----------|
| no-bare-except.yaml | Detects `except Exception: pass` and `except Exception: ...` (bare error swallowing) | ERROR |

## Test Fixtures

### Python

| File | Purpose |
|------|---------|
| __tests__/no-bare-except.py | Test cases for no-bare-except rules (annotated with `# ruleid:` / `# ok:`) |

## Testing

Run `semgrep --test patches/error-handling/` to execute all test fixtures against their rules.

## Integration

The review enforcement patch (`patches/review/enforcement.md`) and dev enforcement patch (`patches/dev/enforcement.md`) instruct agents to run Semgrep with `--config patches/error-handling/` in addition to `--config patches/observability/`.

The `hooks/post-write-check.sh` hook provides fast grep-based detection of `except Exception: pass` in Python files for immediate feedback during development.
