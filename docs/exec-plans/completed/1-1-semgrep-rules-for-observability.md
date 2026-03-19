# Exec Plan: Story 1.1 — Semgrep Rules for Observability

## Objective

Create standalone Semgrep YAML rules that detect observability gaps (missing logging) in TypeScript/JavaScript code via static analysis.

## Approach

- Three rule files in `patches/observability/`, each targeting a specific gap pattern
- Uses Semgrep's `pattern-not` / `pattern-not-inside` operators for absence detection
- Test files co-located with rules for `semgrep --test` validation
- No `src/` code changes — rules-only story

## Rules Implemented

| Rule | Detects | Severity |
|------|---------|----------|
| `catch-without-logging` | Catch blocks without console.error/warn or logger.error/warn | WARNING |
| `function-no-debug-log` | Functions without console.log/debug or logger.debug/info | INFO |
| `error-path-no-log` | throw/return-err without preceding console.error or logger.error | WARNING |

## Key Technical Decisions

1. Semgrep patterns require `try { ... } catch (...)` as the full statement — `catch` alone is not a valid pattern
2. Ellipsis inside blocks must be on separate lines: `{ ... \n console.error(...) \n ... }` not `{ ... console.error(...) ... }`
3. Test files placed both alongside rules (for `semgrep --test`) and in `__tests__/` (per story spec)
4. Rules already include `logger.error`/`logger.warn`/`logger.debug`/`logger.info` patterns — winston/custom loggers work out of the box

## Verification

- `semgrep --test patches/observability/` — 3/3 rules pass
- Each rule has 2+ positive (gap detected) and 2+ negative (gap absent) test cases
- Deleting a rule file causes Semgrep to skip that check without errors
