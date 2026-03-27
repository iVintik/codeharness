## WHY

Review agents approved stories without verifying proof documents existed or
checking that evidence matched the story's verification tier. Stories passed review
with fabricated output and missing coverage data. This patch enforces proof
existence, tier-appropriate evidence quality, and coverage delta reporting as hard
gates before a story can leave review.
(FR33, FR34, NFR20)

## Codeharness Review Gates

### Verification Proof

- Proof document exists at `verification/<story-key>-proof.md`
- Proof passes `codeharness verify --story <id>` (parser checks for FAIL/ESCALATE verdicts)
- Every AC has functional evidence — reading docs alone is not evidence
- No fabricated output — all evidence must be from actual command execution

### Proof Quality Checks

The proof must pass tier-appropriate evidence enforcement. The required evidence depends on the story's verification tier:

#### `test-provable` stories
- Evidence comes from build output, test results, and grep/read of code or generated artifacts
- `npm test` / `npm run build` output is the primary evidence
- Source-level assertions (grep against `src/`) are acceptable — this IS the verification method for this tier
- `docker exec` evidence is NOT required
- Each AC section must show actual test output or build results

#### `runtime-provable` stories
- Evidence comes from running the actual binary, CLI, or server
- Process execution output (stdout, stderr, exit codes) is the primary evidence
- HTTP responses from a locally running server are acceptable
- `docker exec` evidence is NOT required
- Each AC section must show actual command execution and output

#### `environment-provable` stories
- Commands run via `docker exec` (not direct host access)
- Less than 50% of evidence commands are `grep` against `src/`
- Each AC section has at least one `docker exec`, `docker ps/logs`, or observability query
- `[FAIL]` verdicts outside code blocks cause the proof to fail
- `[ESCALATE]` is acceptable only when all automated approaches are exhausted

#### `escalate` stories
- Human judgment is required — automated evidence may be partial or absent
- Proof document must explain why automation is not possible
- `[ESCALATE]` verdict is expected and acceptable

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
