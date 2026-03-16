# Story 9.3: Mandatory Observability — Remove Opt-Out

Status: ready-for-dev

## Story

As a harness maintainer,
I want observability to be mandatory for every harness project,
So that runtime behavior is always visible and the agent always has access to logs/metrics/traces during development.

## Acceptance Criteria

1. **Given** `codeharness init` is run, **When** init configures the project, **Then** observability is always enabled — no `--no-observability` flag exists, **And** `enforcement.observability` is removed from state (or always `true`).

2. **Given** Docker is not available on the machine, **When** init runs and needs the observability stack, **Then** `[WARN] Docker not available — observability will use remote mode` is printed, **And** init prompts for remote endpoint OR prints instructions for installing Docker, **And** init does NOT fail — it configures the project for remote-when-available.

3. **Given** a project initialized with an older version that had `observability: false`, **When** `codeharness init` is re-run (idempotent), **Then** observability is enabled and configured, **And** `[INFO] Observability upgraded from disabled to enabled` is printed.

4. **Given** hooks previously had `if observability OFF -> skip` logic, **When** any hook runs, **Then** observability checks are always performed (hooks simplified).

## Tasks / Subtasks

- [ ] Task 1: Remove `--no-observability` flag from init command (AC: #1)
  - [ ] 1.1: In `src/commands/init.ts`, remove the `.option('--no-observability', 'Disable observability enforcement')` line from the command definition (line 165).
  - [ ] 1.2: Update the `InitOptions` interface: remove the `observability: boolean` field. All code that reads `options.observability` must be replaced with a hardcoded `true`.
  - [ ] 1.3: In the init action, remove the conditional `if (options.observability)` guard around Docker check (lines 265-284). Docker check should now always run unless remote mode is specified (i.e., keep the `!options.otelEndpoint` check but remove the `options.observability &&` part).
  - [ ] 1.4: Remove the conditional `if (options.observability)` guard around OTLP instrumentation (lines 456-482). OTLP instrumentation should always run.
  - [ ] 1.5: Remove the conditional `if (options.observability)` guard around Docker stack setup (lines 485-610). The entire Docker/remote stack setup block should always execute.
  - [ ] 1.6: Remove the `else` branch (lines 606-609) that prints `info('Observability: disabled, skipping Docker stack')` — this path no longer exists.
  - [ ] 1.7: Update the enforcement summary line (line 616): remove `observability:${fmt(e.observability)}` or hardcode it to `ON`.
  - [ ] 1.8: Update `installAllDependencies()` call: remove `observability: options.observability` from the options object, or always pass `true`.

- [ ] Task 2: Remove `enforcement.observability` from state and related types (AC: #1)
  - [ ] 2.1: In `src/lib/state.ts`, remove `observability: boolean` from the `enforcement` interface within `HarnessState`. Keep `frontend`, `database`, `api`.
  - [ ] 2.2: Update `getDefaultState()`: remove `observability: true` from the default enforcement object.
  - [ ] 2.3: Audit all callers of `state.enforcement.observability` across the codebase and remove those conditional branches. Key files: `src/commands/status.ts`, `src/lib/onboard-checks.ts`, `src/lib/deps.ts`.

- [ ] Task 3: Update Docker check to degrade gracefully without Docker (AC: #2)
  - [ ] 3.1: In `src/commands/init.ts`, change the Docker-not-available path: instead of failing with exit code 1 and suggesting `--no-observability`, print `warn('Docker not available — observability will use remote mode')` and continue.
  - [ ] 3.2: When Docker is unavailable and no remote flags are passed, set state to indicate deferred observability: `state.otlp.mode = 'pending-remote'` or print instructions: `info('Install Docker: https://docs.docker.com/engine/install/')` and `info('Or use remote endpoints: codeharness init --otel-endpoint <url>')`.
  - [ ] 3.3: The init should NOT fail — it should complete successfully with observability in a "not yet active but configured" state, so other features (BMAD, beads, hooks) still get set up.

- [ ] Task 4: Handle legacy state migration (AC: #3)
  - [ ] 4.1: In the idempotent re-run check in `src/commands/init.ts` (lines 193-215), detect if `existingState.enforcement.observability === false`. If so, do NOT return early — continue with full init to upgrade observability.
  - [ ] 4.2: Print `info('Observability upgraded from disabled to enabled')` when upgrading a legacy project.
  - [ ] 4.3: Ensure the re-init path runs the Docker/OTLP setup that the original init skipped.

- [ ] Task 5: Remove observability-off bypass from hooks (AC: #4)
  - [ ] 5.1: In `hooks/session-start.sh` (lines 29-46), remove the `if ... grep -q 'observability: true'` conditional around Docker health check. Docker health check should always run (the check itself already handles non-docker modes gracefully via the `codeharness status --check-docker` fallback).
  - [ ] 5.2: In `hooks/post-write-check.sh` (lines 18-21), remove the `if ! ... grep -q 'observability: true'` early-exit block. The OTLP instrumentation prompt should always fire for source code changes.
  - [ ] 5.3: In `hooks/post-test-verify.sh` (lines 38-42), remove the `if ! ... grep -q 'observability: true'` early-exit block. The VictoriaLogs query prompt should always fire after test runs.

- [ ] Task 6: Update `src/commands/status.ts` to remove observability-off branches (AC: #1, #4)
  - [ ] 6.1: In `handleFullStatus()`, remove the `if (state.enforcement.observability)` conditional (line 89) and the `else` branch that prints `Docker: skipped (observability OFF)` (line 134). Docker status should always be displayed.
  - [ ] 6.2: In `handleFullStatusJson()`, remove the `if (state.enforcement.observability)` conditional (line 190) and the `else` branch that sets `docker = { skipped: true, reason: 'observability OFF' }` (line 232). Docker status should always be present in JSON output.
  - [ ] 6.3: In `handleHealthCheck()`, remove the `if (state.enforcement.observability)` conditional (line 273) and the `else` branch that pushes `{ name: 'docker', status: 'ok', detail: 'skipped (observability OFF)' }` (line 321). Docker health should always be checked.
  - [ ] 6.4: Update the enforcement summary display: remove `obs:${...}` from the format string (line 85) or hardcode to always show `obs:ON`.

- [ ] Task 7: Update `src/lib/deps.ts` to always install observability deps (AC: #1)
  - [ ] 7.1: In `installAllDependencies()`, remove the `if (spec.requiresObservability && !opts.observability)` skip logic (line 124). All deps should always be installed.
  - [ ] 7.2: Simplify the function signature: remove the `observability` field from the options parameter, or always treat it as `true`.

- [ ] Task 8: Update `src/lib/onboard-checks.ts` to remove observability-disabled check (AC: #1)
  - [ ] 8.1: In `findObservabilityGaps()` (line 160), remove the `if (!state.enforcement.observability) return []` early return. Observability gaps should always be detected since observability is always on.

- [ ] Task 9: Update `commands/harness-init.md` knowledge file (AC: #1)
  - [ ] 9.1: Remove all references to `--no-observability` flag from the harness-init knowledge file.
  - [ ] 9.2: Remove language about "skip silently" or "observability disabled" scenarios.
  - [ ] 9.3: Update the enforcement output format to no longer show observability as a toggle.

- [ ] Task 10: Update integration tests and unit tests (AC: #1-#4)
  - [ ] 10.1: In `src/commands/__tests__/init.test.ts`, remove tests for `--no-observability` flag. Add test for init without Docker (graceful degradation). Add test for legacy state migration (`observability: false` -> enabled).
  - [ ] 10.2: In `src/commands/__tests__/status.test.ts`, remove tests for `observability OFF` display branches.
  - [ ] 10.3: In `src/lib/__tests__/onboard-checks.test.ts`, remove tests for `enforcement.observability: false` returning empty gaps.
  - [ ] 10.4: In `src/lib/__tests__/state.test.ts`, update state fixture data to not include `enforcement.observability`.
  - [ ] 10.5: In `src/lib/__tests__/deps.test.ts`, remove tests for skipping observability deps.
  - [ ] 10.6: In `tests/integration/hooks.bats`, update any tests that set `observability: false` and expect hooks to skip.
  - [ ] 10.7: Add new integration tests verifying hooks always perform observability checks regardless of state.

- [ ] Task 11: Build and verify (AC: #1-#4)
  - [ ] 11.1: Run `npm run build` — verify tsup compiles successfully with all changes.
  - [ ] 11.2: Run `npm run test:unit` — verify all unit tests pass.
  - [ ] 11.3: Run `npm run test:coverage` — verify test coverage target is maintained.

## Dev Notes

### Architecture Context

Stories 9.1 and 9.2 established a shared machine-level observability stack and remote backend support. With three modes available (local-shared, remote-direct, remote-routed), there's no longer a valid reason to allow disabling observability entirely. This story removes the opt-out, making observability a fundamental guarantee of the harness.

The key insight: observability is not an optional feature — it's how the agent sees runtime behavior. Without it, the agent is coding blind. Stories 9.1/9.2 removed the "Docker is required per-project" blocker by providing shared and remote alternatives. Now we close the loop by removing the escape hatch.

### Key Files to Modify

| File | Change |
|------|--------|
| `src/commands/init.ts` | Remove `--no-observability` flag, remove `options.observability` conditionals, graceful Docker degradation |
| `src/lib/state.ts` | Remove `observability` from `enforcement` interface |
| `src/commands/status.ts` | Remove `enforcement.observability` conditionals in display/health/JSON |
| `src/lib/deps.ts` | Remove `requiresObservability` skip logic |
| `src/lib/onboard-checks.ts` | Remove `enforcement.observability` early return in `findObservabilityGaps()` |
| `hooks/session-start.sh` | Remove `observability: true` grep guard around Docker check |
| `hooks/post-write-check.sh` | Remove `observability: true` grep guard (always prompt for OTLP) |
| `hooks/post-test-verify.sh` | Remove `observability: true` grep guard (always prompt for log queries) |
| `commands/harness-init.md` | Remove `--no-observability` references, update enforcement docs |

### Existing Code to Leverage

- `src/commands/init.ts` lines 265-284: Docker check section. Currently guarded by `options.observability && !options.otelEndpoint`. Remove the `options.observability` part, keep `!options.otelEndpoint` (remote-direct mode still skips local Docker).
- `src/commands/init.ts` lines 486-510: Remote-direct mode already works without Docker. When Docker is unavailable and no remote flags are given, the new behavior should guide users toward either installing Docker or using `--otel-endpoint`.
- `src/lib/docker.ts`: `isSharedStackRunning()`, `startSharedStack()` — these already handle Docker failures gracefully with error messages. The change is in how init reacts to those failures (degrade instead of abort).
- `src/commands/status.ts`: Three separate functions (`handleFullStatus`, `handleFullStatusJson`, `handleHealthCheck`) each have independent `enforcement.observability` checks that need removal.

### Hook Simplification Details

All three hooks that check `observability: true` use the same pattern:
```bash
if sed -n '/^---$/,/^---$/p' "$STATE_FILE" 2>/dev/null | grep -q 'observability: true'; then
```

Since `enforcement.observability` is being removed from state entirely, these grep checks would silently fail (no match = skip). They must be removed proactively, not left to break silently.

- `session-start.sh`: The Docker health check block should always run. The existing fallback chain (codeharness CLI -> docker CLI -> not-installed) already handles the case where Docker isn't available.
- `post-write-check.sh`: The OTLP instrumentation prompt should always fire for source code changes. The message "Verify OTLP instrumentation is present" is valid regardless of how observability is configured.
- `post-test-verify.sh`: The VictoriaLogs query prompt should always fire. The agent can determine if the endpoint is reachable when it runs the curl.

### Graceful Docker Degradation

The current behavior when Docker is missing:
```
[FAIL] Docker not installed.
[INFO] Docker is required for the observability stack.
[INFO] -> Install: https://docs.docker.com/engine/install/
[INFO] -> Or disable: codeharness init --no-observability
```
Exit code 1, init aborts.

New behavior should be:
```
[WARN] Docker not available — observability will use remote mode
[INFO] -> Install Docker: https://docs.docker.com/engine/install/
[INFO] -> Or use remote endpoints: codeharness init --otel-endpoint <url>
[INFO] Observability: deferred (configure Docker or remote endpoint to activate)
```
Exit code 0, init continues. OTLP env vars are still set (endpoint defaults to localhost:4318), so if Docker becomes available later, a re-run of `codeharness init` will start the stack.

### Backward Compatibility / Migration

Projects with `enforcement.observability: false` in their state file need migration. The idempotent re-run path (lines 193-215 in init.ts) currently returns early if `existingState.initialized` is true. For the migration:

1. Check `existingState.enforcement.observability === false`
2. If false, do NOT return early — fall through to full init
3. Print migration message
4. The full init will set up Docker/OTLP/hooks as if it were a fresh init
5. The state file is overwritten with the new schema (no `observability` in enforcement)

### Scope Clarification

Per the epic's technical notes: "Remove `--no-observability`, `--no-frontend`, `--no-database`, `--no-api` flags entirely OR keep `--no-frontend/database/api` but remove `--no-observability`". This story takes the second approach: **keep** `--no-frontend`, `--no-database`, `--no-api` (those are still valid toggles) and **only remove** `--no-observability`.

## File List

- src/commands/init.ts
- src/lib/state.ts
- src/commands/status.ts
- src/lib/deps.ts
- src/lib/onboard-checks.ts
- hooks/session-start.sh
- hooks/post-write-check.sh
- hooks/post-test-verify.sh
- commands/harness-init.md
- src/commands/__tests__/init.test.ts
- src/commands/__tests__/status.test.ts
- src/lib/__tests__/onboard-checks.test.ts
- src/lib/__tests__/state.test.ts
- src/lib/__tests__/deps.test.ts
- tests/integration/hooks.bats

## Change Log

- 2026-03-15: Story created — ready for dev.
