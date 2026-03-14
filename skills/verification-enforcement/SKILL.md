---
description: Enforces that the agent verifies features, writes tests, and achieves 100% coverage before marking stories complete. Triggers when the agent attempts to commit code or mark a story done.
---

# Verification Enforcement

## Testing Requirements

Before committing code:

1. **Write tests after implementation** — tests must cover all new code
2. **Achieve 100% project-wide coverage** — not per-file, project-wide
3. **All tests must pass** — zero failures allowed

### Coverage Tools by Stack

- **Node.js:** `npx c8 npm test` or configure c8/istanbul in package.json
- **Python:** `pytest --cov=src tests/ --cov-report=term-missing`
- **Go:** `go test -coverprofile=coverage.out ./...`
- **Rust:** `cargo tarpaulin`

### Coverage Check

Run coverage and verify 100%:
```bash
# Node.js example
npx c8 --check-coverage --lines 100 --branches 100 --functions 100 npm test
```

If coverage < 100%, identify uncovered files and line numbers. Write tests for uncovered code — including existing uncovered code in the same files you modified.

## Verification Requirements

Before marking a story complete:

1. Showboat proof document must exist at `verification/{story-id}-proof.md`
2. `showboat verify` must pass (evidence is reproducible)
3. All tests must pass
4. Coverage must be 100%

## Commit Blocking

The pre-commit-gate hook blocks commits when:
- Tests haven't passed (`session_flags.tests_passed: false`)
- Coverage isn't met (`session_flags.coverage_met: false`)

After tests pass and coverage is met, update the state file:
```yaml
session_flags:
  tests_passed: true
  coverage_met: true
```
