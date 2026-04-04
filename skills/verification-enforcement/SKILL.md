---
name: verification-enforcement
description: Enforces that the agent verifies features, writes tests, and achieves 100% coverage before marking stories complete. Triggers when the agent attempts to commit code or mark a story done.
---

# Verification Enforcement

## Testing Requirements

Before committing code:

1. **Write tests after implementation** — tests must cover all new code
2. **Achieve 90% project-wide statement coverage** — the overall target
3. **Every file must have at least 80% statement coverage** — no file left behind
4. **All tests must pass** — zero failures allowed

### Coverage Gate

Run coverage using the CLI command:
```bash
codeharness coverage --min-file 80
```

This automatically:
- Detects the coverage tool (c8/Vitest for Node.js, coverage.py for Python)
- Runs the test suite with coverage enabled
- Parses coverage reports and evaluates against the 90% overall target
- **Checks every file against the 80% per-file statement coverage floor**
- Updates state flags: `tests_passed` and `coverage_met`
- Reports coverage delta from baseline

Options:
- `--json` — machine-readable output
- `--check-only` — read last coverage report without re-running tests
- `--story <id>` — associate coverage delta with a specific story
- `--min-file <percent>` — minimum per-file statement coverage (default: 80)

**Per-file coverage rule:** No source file may have less than 80% statement coverage. This prevents the pattern where overall coverage stays high while individual files (especially command handlers) go untested. The pre-commit hook enforces this automatically.

If any file is below the floor, write tests for that file before committing — even if it's not code you wrote in this story.

## Verification Requirements

Before marking a story complete:

1. Proof document must exist at `verification/{story-id}-proof.md`
2. Evidence must be reproducible
3. All tests must pass
4. Coverage must be >= 90% overall, >= 80% per file

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
