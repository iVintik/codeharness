<!-- CODEHARNESS-PATCH-START:code-review-harness -->

## Harness Review Checklist (codeharness)

In addition to standard code review, verify:

### Documentation
- [ ] AGENTS.md files are fresh for all changed modules
- [ ] Exec-plan updated with story progress
- [ ] Inline documentation present for new public APIs

### Testing
- [ ] Tests exist for all new code
- [ ] Project-wide test coverage is 100%
- [ ] No skipped or disabled tests
- [ ] Test coverage report is present

### Verification
- [ ] Showboat proof document exists at `verification/{story-id}-proof.md`
- [ ] Proof document covers all acceptance criteria
- [ ] `showboat verify` passes

<!-- CODEHARNESS-PATCH-END:code-review-harness -->
