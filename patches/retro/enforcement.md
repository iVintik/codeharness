## WHY

Retrospectives produced vague observations without actionable items, and
verification pipeline issues (hangs, false positives, verify-dev loops) were
not systematically tracked. This patch structures retro analysis around
verification effectiveness, pipeline health, documentation accuracy, test
quality trends, and mandatory concrete action items with owners.
(FR33, FR36, NFR20)

## Codeharness Retrospective Quality Metrics

### Verification Effectiveness

- How many ACs were caught by black-box verification vs slipped through?
- Were there false positives (proof said PASS but feature was broken)?
- Were there false negatives (proof said FAIL but feature actually works)?
- Time spent on verification — is it proportional to value?

### Verification Pipeline Health

- Did the verifier hang on permissions? (check for `--allowedTools` issues)
- Did stories get stuck in verify→dev loops? (check `attempts` counter)
- Were stories incorrectly flagged as `integration-required`?
- Did the verify parser correctly detect `[FAIL]` verdicts?

### Documentation Health

- AGENTS.md accuracy for changed modules
- Exec-plans completeness for active stories
- Stale documentation identified and cleaned up

### Test Quality

- Coverage trend (improving, stable, declining)
- Any flaky tests introduced?
- Integration test coverage for cross-module interactions

### Action Items

Every retro MUST produce concrete action items with:
- Clear description of what to fix
- Why it matters (what fails without this fix)
- Owner and priority
