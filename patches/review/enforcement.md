## WHY

Review agents approved stories without verifying proof documents existed or
checking that evidence was real. Stories passed review with fabricated output
and missing coverage data. This patch enforces proof existence, evidence
quality, and coverage delta reporting as hard gates before a story can leave
review.
(FR33, FR34, NFR20)

## Codeharness Review Gates

### Verification Proof

- Proof document exists at `verification/<story-key>-proof.md`
- Proof passes `codeharness verify --story <id>` (parser checks for FAIL/ESCALATE verdicts)
- Every AC has functional evidence — reading docs alone is not evidence
- No fabricated output — all evidence must be from actual command execution

### Proof Quality Checks

- Commands run via `docker exec` (not direct host access)
- Less than 50% of evidence commands are `grep` against `src/`
- Each AC section has at least one `docker exec`, `docker ps/logs`, or observability query
- `[FAIL]` verdicts outside code blocks cause the proof to fail
- `[ESCALATE]` is acceptable only when all automated approaches are exhausted

### Observability

Run `semgrep scan --config patches/observability/ --config patches/error-handling/ --json` against changed files and report gaps.

- For each gap found, list it as a review issue: file path, line number, and description (e.g., "src/lib/docker.ts:42 — catch block without logging")
- Semgrep JSON output fields to extract: `check_id`, `path`, `start.line`, `extra.message`
- If zero observability gaps are found, this check passes silently — do not emit warnings
- If Semgrep is not installed, report "static analysis skipped — install semgrep" as a warning and do NOT fail the review

### Code Quality

- Coverage delta reported (before vs after)
- No coverage regression in changed files
- AGENTS.md is current for all changed modules
