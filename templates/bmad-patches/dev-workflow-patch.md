<!-- CODEHARNESS-PATCH-START:dev-workflow-enforcement -->

## Harness Enforcement (codeharness)

During implementation, the agent MUST:

### Observability
- Query VictoriaLogs after running the application to check for errors
- Verify OTLP instrumentation is active in new code paths
- Use `curl localhost:9428/select/logsql/query?query=level:error` to check for runtime errors

### Documentation
- Create or update per-subsystem AGENTS.md for any new modules (max 100 lines)
- Update exec-plan at `docs/exec-plans/active/{story-id}.md` with progress
- Ensure inline code documentation for new public APIs

### Testing
- Write tests AFTER implementation, BEFORE verification
- Achieve 100% project-wide test coverage
- All tests must pass before proceeding to verification

### Verification
- Run `/harness-verify` to produce proof document
- Do NOT mark story complete without passing verification

<!-- CODEHARNESS-PATCH-END:dev-workflow-enforcement -->
