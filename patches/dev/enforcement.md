## WHY

Dev agents repeatedly shipped code without reading module conventions (AGENTS.md),
skipped observability checks, and produced features that could not be verified
from outside the source tree. This patch enforces architecture awareness,
observability validation, documentation hygiene, test coverage gates, and
verification tier awareness — all operational failures observed in prior sprints.
(FR33, FR34, NFR20)

## Codeharness Development Enforcement

### Architecture Awareness

Before writing code, read the relevant `AGENTS.md` file for the module being changed. Understand:
- Build commands and test runners
- Module boundaries and conventions
- What NOT to do (common pitfalls documented from prior incidents)

### Observability

Run `semgrep scan --config patches/observability/ --config patches/error-handling/` before committing and fix any gaps.

After running tests, verify telemetry is flowing:
- Query VictoriaLogs to confirm log events from test runs
- If observability is configured, traces should be visible for CLI operations

### Documentation

- Update `AGENTS.md` for all changed modules
- Keep exec-plan current with implementation state

### Testing

- All tests pass before moving to review
- Coverage gate: 100% of new/changed code
- Run `npm test` / `pytest` and verify no regressions

### Verification Tier Awareness

Write code that can be verified at the appropriate tier. The four verification tiers determine what evidence is needed to prove an AC works:

- **`test-provable`** — Code must be testable via `npm test` / `npm run build`. Ensure functions have test coverage, outputs are greppable, and build artifacts are inspectable. No running app required.
- **`runtime-provable`** — Code must be exercisable via CLI or local server. Ensure the binary/CLI produces verifiable stdout, exit codes, or HTTP responses without needing Docker.
- **`environment-provable`** — Code must work in a Docker verification environment. Ensure the Dockerfile is current, services start correctly, and `docker exec` can exercise the feature. Observability queries should return expected log/trace events.
- **`escalate`** — Reserved for ACs that genuinely cannot be automated (physical hardware, paid external APIs). This is rare — exhaust all automated approaches first.

Ask yourself:
- What tier is this story tagged with?
- Does my implementation produce the evidence that tier requires?
- If `test-provable`: are my functions testable and my outputs greppable?
- If `runtime-provable`: can I run the CLI/server and verify output locally?
- If `environment-provable`: does `docker exec` work? Are logs flowing to the observability stack?

If the answer is "no", the feature has a testability gap — fix the code to be verifiable at the appropriate tier.

### Dockerfile Maintenance

If this story adds a new runtime dependency, check whether the Dockerfile needs updating:
- New system package required at runtime (e.g., `libssl`, `ffmpeg`) — add to `apt-get install` line
- New binary expected on PATH — add install step to Dockerfile
- New Python package needed — add to `pip install` or `requirements.txt` COPY
- Verify the updated Dockerfile still passes `validateDockerfile()` with zero gaps
