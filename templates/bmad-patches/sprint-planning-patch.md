<!-- CODEHARNESS-PATCH-START:sprint-planning-harness -->

## Harness Pre-Sprint Checklist (codeharness)

Before starting the sprint, verify:

### Planning Docs
- [ ] PRD is current and reflects latest decisions
- [ ] Architecture doc is current (ARCHITECTURE.md)
- [ ] Epics and stories are fully defined with Given/When/Then ACs

### Test Infrastructure
- [ ] Coverage tool configured for the stack (c8/istanbul, coverage.py)
- [ ] Baseline coverage recorded in `.claude/codeharness.local.md`
- [ ] Test runner configured and working

### Harness Infrastructure
- [ ] Harness initialized (`/harness-init` completed)
- [ ] Docker stack healthy (VictoriaMetrics responding)
- [ ] OTLP instrumentation installed
- [ ] Hooks registered and active

<!-- CODEHARNESS-PATCH-END:sprint-planning-harness -->
