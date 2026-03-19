## WHY

Review agents approved stories without verifying proof documents existed or
checking that evidence was black-box (not source-grep). Stories passed review
with fabricated output and missing coverage data. This patch enforces proof
existence, black-box evidence quality, and coverage delta reporting as hard
gates before a story can leave review.
(FR33, FR34, NFR20)

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
