<!-- CODEHARNESS-PATCH-START:retro-harness -->

## Harness Analysis (codeharness)

The retrospective MUST analyze the following in addition to standard retro topics:

### Verification Effectiveness
- Pass rates per story (how many stories verified on first attempt?)
- Common failure patterns (what types of verification fail most?)
- Iteration counts per story (how many implement→verify→fix loops?)
- Average iterations vs target (<3)

### Documentation Health
- Stale doc count (AGENTS.md files not updated since code changed)
- Quality grades per module (A/B/C/D/F)
- Doc-gardener findings summary
- Documentation debt trends (improving or degrading?)

### Test Quality
- Coverage trends per story (baseline → final, deltas)
- Tests that caught real bugs vs tests that never failed
- Flaky test detection (tests that pass/fail inconsistently)
- Test suite execution time trends

### Follow-up Items
Convert each finding into an actionable item:
- Code/test issues → new story for next sprint
- Process improvements → BMAD workflow patch
- Verification gaps → enforcement config update

<!-- CODEHARNESS-PATCH-END:retro-harness -->
