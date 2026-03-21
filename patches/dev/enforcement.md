## WHY

Dev agents repeatedly shipped code without reading module conventions (AGENTS.md),
skipped observability checks, and produced features that could not be verified
from outside the source tree. This patch enforces architecture awareness,
observability validation, documentation hygiene, test coverage gates, and
black-box thinking — all operational failures observed in prior sprints.
(FR33, FR34, NFR20)

## Codeharness Development Enforcement

### Architecture Awareness

Before writing code, read the relevant `AGENTS.md` file for the module being changed. Understand:
- Build commands and test runners
- Module boundaries and conventions
- What NOT to do (common pitfalls documented from prior incidents)

### Observability

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

### Black-Box Thinking

Write code that can be verified from the outside. Ask yourself:
- Can a user exercise this feature from the CLI alone?
- Is the behavior documented in README.md?
- Would a verifier with NO source access be able to tell if this works?

If the answer is "no", the feature has a testability gap — fix the CLI/docs, not the verification process.

### Dockerfile Maintenance

If this story adds a new runtime dependency, check whether the Dockerfile needs updating:
- New system package required at runtime (e.g., `libssl`, `ffmpeg`) — add to `apt-get install` line
- New binary expected on PATH — add install step to Dockerfile
- New Python package needed — add to `pip install` or `requirements.txt` COPY
- Verify the updated Dockerfile still passes `validateDockerfile()` with zero gaps
