## Codeharness Review Gates

### Verification Proof

- Proof document exists at `verification/<story-key>-proof.md`
- Proof passes `codeharness verify --story <id>` (parser checks for FAIL/ESCALATE verdicts)
- Every AC has functional evidence — reading docs alone is not evidence
- No fabricated output — all evidence must be from actual command execution

### Proof Quality Checks

The proof must pass black-box enforcement:
- Commands run via `docker exec` (not direct host access)
- Less than 50% of evidence commands are `grep` against `src/`
- Each AC section has at least one `docker exec`, `docker ps/logs`, or observability query
- `[FAIL]` verdicts outside code blocks cause the proof to fail
- `[ESCALATE]` is acceptable only when all automated approaches are exhausted

### Code Quality

- Coverage delta reported (before vs after)
- No coverage regression in changed files
- AGENTS.md is current for all changed modules
