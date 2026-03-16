# Story 4.2: Hook Architecture & Enforcement

Status: ready-for-dev

## Story

As a developer,
I want mechanical enforcement hooks that make skipping verification architecturally impossible,
So that the agent cannot commit code without passing quality gates.

## Acceptance Criteria

1. **Given** a Claude Code session starts, **When** the `session-start.sh` SessionStart hook fires, **Then** all session flags are reset to `false` via `codeharness state set`, **And** Docker stack health is checked (if observability ON) via `codeharness status --check-docker`, **And** agent-browser availability is checked, **And** beads readiness is checked (`bd ready` returns tasks), **And** hook outputs JSON: `{"message": "Harness health: OK\n  Docker: running\n  Beads: N tasks ready\n  Session flags: reset"}`, **And** hook completes within 500ms (NFR1).

2. **Given** an agent attempts a git commit via the Bash tool, **When** the `pre-commit-gate.sh` PreToolUse hook fires, **Then** hook reads session flags from state file via `get_state()` bash function, **And** if `tests_passed`, `coverage_met`, or `verification_run` is `false`, commit is blocked, **And** block response includes which flags failed and remediation: `{"decision": "block", "reason": "Quality gates not met.\n\n  tests_passed: false\n  coverage_met: true\n\n-> Run tests before committing."}`, **And** if all flags are `true`, commit is allowed: `{"decision": "allow"}`, **And** hook exits 0 for allow, 2 for block (never exit 1), **And** hook completes within 500ms (NFR1).

3. **Given** an agent writes code via the Write or Edit tool, **When** the `post-write-check.sh` PostToolUse hook fires, **Then** hook injects a verification prompt: `{"message": "New code written. Verify OTLP instrumentation is present.\n-> Check that new endpoints emit traces and structured logs."}`, **And** the prompt is specific and actionable, not a generic reminder, **And** hook completes within 500ms (NFR1).

4. **Given** an agent runs tests, **When** the `post-test-verify.sh` PostToolUse hook fires, **Then** hook prompts the agent to query logs: `{"message": "Tests complete. Query VictoriaLogs for errors:\n-> curl 'localhost:9428/select/logsql/query?query=level:error'"}`, **And** hook can create beads issues via `bd create` if problems are detected.

5. **Given** the state file is missing when a hook fires, **When** the hook tries to read state, **Then** hook fails open: `{"decision": "allow"}` with exit 0, **And** `[WARN]` is written to stderr.

6. **Given** a hook failure occurs (script error), **When** the error is caught, **Then** clear error message is produced, not a silent block (NFR18), **And** hook always outputs valid JSON regardless of internal errors.

7. **Given** the plugin hook registration, **When** `hooks.json` is configured, **Then** all 4 hooks are registered with correct event types (SessionStart, PreToolUse, PostToolUse), **And** hooks coexist with other Claude Code plugins without conflicts (NFR9), **And** hooks work with Claude Code plugin system as of March 2026 (NFR10).

## Tasks / Subtasks

- [ ] Task 1: Fix `hooks.json` to register all 4 hooks with correct event types (AC: #7)
  - [ ] 1.1: Current `hooks.json` only registers `PostToolUse` for `Bash` tool (post-test-verify.sh). Add `SessionStart` event for `session-start.sh`, `PreToolUse` for `Bash` tool with `pre-commit-gate.sh`, and `PostToolUse` for `Write` and `Edit` tools with `post-write-check.sh`. Keep existing `PostToolUse` for `Bash` tool with `post-test-verify.sh`.
  - [ ] 1.2: Verify hooks.json matches the Claude Code plugin system hook registration format as of March 2026. Events: `SessionStart`, `PreToolUse` (can filter on tool name), `PostToolUse` (can filter on tool name). Each hook entry: `{ "type": "command", "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/<script>.sh" }`.
  - [ ] 1.3: Validate that multiple hooks can be registered for the same event type (PostToolUse needs both post-write-check and post-test-verify, each for different tool matchers).

- [ ] Task 2: Rewrite `session-start.sh` to use CLI for state resets and health checks (AC: #1, #5, #6)
  - [ ] 2.1: Replace inline `sed` flag resets with `codeharness state set session_flags.tests_passed false`, `codeharness state set session_flags.coverage_met false`, `codeharness state set session_flags.verification_run false`, `codeharness state set session_flags.logs_queried false`. Architecture rule: hooks never write state directly — CLI owns all state mutations.
  - [ ] 2.2: Replace inline Docker/curl health checks with `codeharness status --check-docker` (uses existing `src/commands/status.ts` infrastructure). If observability is OFF, skip this check.
  - [ ] 2.3: Add agent-browser availability check: `command -v agent-browser >/dev/null 2>&1` — report as part of health status.
  - [ ] 2.4: Add beads readiness check: `bd ready --json 2>/dev/null | head -c 1` — report task count or "beads not initialized".
  - [ ] 2.5: Compose health status message in JSON format. Include Docker status (running/stopped/n-a), beads status (N tasks ready / not initialized), session flags (reset), and overall health (OK/WARN).
  - [ ] 2.6: Add error trap at top of script: `trap 'echo "{\"message\": \"[WARN] session-start hook failed: $BASH_COMMAND\"}"; exit 0' ERR` — ensures valid JSON output on any script error. Fail open.
  - [ ] 2.7: Verify total execution completes within 500ms. If `codeharness state set` calls are too slow (4 sequential invocations), batch them: `codeharness state set session_flags.tests_passed false session_flags.coverage_met false session_flags.verification_run false session_flags.logs_queried false` — or add a `codeharness state reset-session` subcommand that resets all session flags in a single write.

- [ ] Task 3: Rewrite `pre-commit-gate.sh` to use canonical hook patterns (AC: #2, #5, #6)
  - [ ] 3.1: Add `get_state()` bash function at top of script (canonical pattern from architecture.md): `get_state() { local key="$1"; sed -n '/^---$/,/^---$/p' "$STATE_FILE" | grep "^  ${key}:" | sed "s/^  ${key}: *//" ; }`
  - [ ] 3.2: Check all three quality gate flags: `tests_passed`, `coverage_met`, `verification_run`. Current script only checks `tests_passed` and `coverage_met` — missing `verification_run`.
  - [ ] 3.3: Fix exit codes: current script uses `exit 1` for blocks. Change to `exit 2` for intentional blocks (architecture rule: exit 1 = script failure, exit 2 = intentional block). Keep `exit 0` for allow.
  - [ ] 3.4: Fix JSON output format: current script uses `{"message": ...}` for blocks. Change to `{"decision": "block", "reason": "..."}` for PreToolUse hooks. Use `{"decision": "allow"}` for allow.
  - [ ] 3.5: Add error trap: `trap 'echo "{\"decision\": \"allow\"}"; exit 0' ERR` — fail open on script errors.
  - [ ] 3.6: Add stderr warning when state file missing: `echo "[WARN] State file not found — allowing commit" >&2`
  - [ ] 3.7: Add `set +e` after `set -euo pipefail` — hooks should not exit on first error. Use explicit error checks instead. The `set -e` currently causes the script to crash on grep failures (when a flag is not found), which would produce no JSON output.

- [ ] Task 4: Fix `post-write-check.sh` to match canonical patterns (AC: #3, #5, #6)
  - [ ] 4.1: Add error trap for valid JSON output on script errors: `trap 'exit 0' ERR`
  - [ ] 4.2: Add fail-open behavior when state file is missing: write `[WARN]` to stderr, exit 0 silently.
  - [ ] 4.3: Verify hook input parsing handles the tool input structure correctly. PostToolUse hooks receive tool output, not tool input — confirm the hook reads the correct field for file path.
  - [ ] 4.4: Remove `set -euo pipefail` and replace with explicit error handling. `set -e` causes the script to exit before producing JSON output if any command fails (e.g., grep not finding a match).

- [ ] Task 5: Fix `post-test-verify.sh` to add beads issue creation capability (AC: #4, #5, #6)
  - [ ] 5.1: Add beads issue creation when problems are detected: after prompting log query, check if `bd` is available and create an issue if test output indicates failures. Pattern: `bd create "Test failures detected in session $(date +%Y-%m-%d)" --type bug 2>/dev/null || true`.
  - [ ] 5.2: Ensure error trap is present for valid JSON output on failures.
  - [ ] 5.3: Verify the hook correctly detects test commands. Current pattern covers npm test, pytest, jest, vitest, cargo test, go test, bats. Confirm this is sufficient.

- [ ] Task 6: Add `state reset-session` subcommand to CLI (AC: #1)
  - [ ] 6.1: Add `codeharness state reset-session` subcommand in `src/commands/state.ts` that resets all `session_flags.*` to `false` in a single state file write. This avoids 4 sequential `state set` calls from session-start.sh (performance: single read-modify-write vs. 4).
  - [ ] 6.2: Support `--json` flag for machine-readable output.
  - [ ] 6.3: Write unit test in `src/commands/__tests__/state.test.ts` — verify all four flags reset to false, state file body preserved, JSON output correct.

- [ ] Task 7: Add `status --check-docker` flag to CLI if not already present (AC: #1)
  - [ ] 7.1: Check if `src/commands/status.ts` already supports `--check-docker`. If not, add a `--check-docker` option that runs Docker health check and exits with 0 (healthy) or 1 (unhealthy). Output JSON when `--json` is passed.
  - [ ] 7.2: The status command should check: Docker daemon running (`docker info`), harness compose file exists, stack containers healthy (curl VictoriaLogs /health endpoint).
  - [ ] 7.3: Write unit test for the new flag.

- [ ] Task 8: Create BATS integration tests for all hook scripts (AC: #1-#7)
  - [ ] 8.1: Create `test/integration/hooks.bats` (or equivalent Vitest-based shell test) that tests each hook script with controlled inputs.
  - [ ] 8.2: Test `session-start.sh`: creates state file with flags true → run hook → verify flags reset to false, verify JSON output includes health status.
  - [ ] 8.3: Test `pre-commit-gate.sh`: test with all flags true (expect allow), test with flags false (expect block with exit 2), test with missing state file (expect allow with exit 0).
  - [ ] 8.4: Test `post-write-check.sh`: test with source file path (expect prompt), test with non-source file (expect silent exit), test with missing state file (expect silent exit).
  - [ ] 8.5: Test `post-test-verify.sh`: test with test command (expect log query prompt when observability ON), test with non-test command (expect silent exit).
  - [ ] 8.6: Test error trap behavior: simulate script error → verify valid JSON output (not empty, not partial).
  - [ ] 8.7: Test timing: verify each hook completes within 500ms (NFR1). Use `time` command or BATS timing helper.

- [ ] Task 9: Create unit tests for new CLI subcommands (AC: #1)
  - [ ] 9.1: Create or extend `src/commands/__tests__/state.test.ts` with tests for `reset-session` subcommand.
  - [ ] 9.2: Create or extend `src/commands/__tests__/status.test.ts` with tests for `--check-docker` flag.
  - [ ] 9.3: All new CLI code must have 100% coverage.

- [ ] Task 10: Build and verify (AC: #1-#7)
  - [ ] 10.1: Run `npm run build` — verify tsup compiles successfully with new/modified files.
  - [ ] 10.2: Run `npm run test:unit` — all tests pass including new state and status tests.
  - [ ] 10.3: Run `npm run test:coverage` — verify 100% coverage for all new code in `src/`.
  - [ ] 10.4: Manual test: start a Claude Code session with the plugin → verify session-start.sh fires, resets flags, reports health.
  - [ ] 10.5: Manual test: attempt git commit with flags false → verify pre-commit-gate.sh blocks with exit 2 and correct JSON.
  - [ ] 10.6: Manual test: attempt git commit with all flags true → verify pre-commit-gate.sh allows with exit 0.
  - [ ] 10.7: Manual test: write a .ts file → verify post-write-check.sh prompts OTLP check.
  - [ ] 10.8: Manual test: run `npm test` → verify post-test-verify.sh prompts log query.
  - [ ] 10.9: Verify all hooks complete within 500ms.

## Dev Notes

### This Story Is the Second in Epic 4

Story 4.1 (Verification Pipeline & Showboat Integration) established the verification orchestration. This story adds the mechanical enforcement layer — hooks that fire automatically during agent execution and block actions when quality gates are not met. The hooks reference state flags that Story 4.1's verification pipeline sets (`verification_run`).

### What Already Exists

**Hook scripts (hooks/ directory):**
- `hooks/hooks.json` — Currently only registers `PostToolUse` for `Bash` tool. Missing: SessionStart, PreToolUse, PostToolUse for Write/Edit.
- `hooks/session-start.sh` — Exists but uses inline `sed` to reset flags (violates architecture: hooks must not write state directly) and inline Docker/curl checks. Needs rewrite to use CLI commands.
- `hooks/pre-commit-gate.sh` — Exists but has three bugs: (1) uses `exit 1` instead of `exit 2` for blocks, (2) outputs `{"message": ...}` instead of `{"decision": "block", ...}` for PreToolUse hooks, (3) missing `verification_run` flag check.
- `hooks/post-write-check.sh` — Exists but uses `set -euo pipefail` which can cause silent failures (no JSON output). Needs error trap.
- `hooks/post-test-verify.sh` — Exists and follows patterns better than the others. Needs beads issue creation capability (FR31).
- `hooks/AGENTS.txt` — Hook documentation file.

**CLI infrastructure:**
- `src/commands/state.ts` — Full `state show`, `state get`, `state set` subcommands. Supports `--json` flag. Used by hooks via `codeharness state set <key> <value>`.
- `src/commands/status.ts` — Status command exists but may not support `--check-docker` flag. Check before implementing.
- `src/lib/state.ts` — State file read/write with nested value support. Session flags at `session_flags.tests_passed`, `session_flags.coverage_met`, `session_flags.verification_run`, `session_flags.logs_queried`.
- `src/lib/output.ts` — `ok()`, `fail()`, `warn()`, `info()`, `jsonOutput()` utilities.
- `src/lib/docker.ts` — Docker lifecycle management functions.
- `src/lib/beads.ts` — Beads CLI wrapper: `createIssue()`, `getReady()`, etc.

### Architecture Decisions That Apply

- **Decision 1 (CLI <-> Plugin Boundary):** Hooks are thin bridges — they read state from CLI, send signals to agent. Hooks call CLI for state updates (`codeharness state set`), never write state directly. If it mutates state -> CLI. If it guides the agent -> plugin/hooks.
- **Decision 2 (State Management):** Session flag lifecycle: (1) session-start.sh resets all flags, (2) agent runs tests -> CLI sets tests_passed, (3) agent checks coverage -> CLI sets coverage_met, (4) agent runs verification -> CLI sets verification_run, (5) pre-commit-gate reads flags, blocks if any false.
- **Hook Script Patterns (from architecture.md):** Exit 0 = allow/success, exit 2 = intentional block, never exit 1. Always output valid JSON. Fail open if state file missing. Errors to stderr, decisions to stdout.

### Critical Bugs in Current Hooks

1. **`pre-commit-gate.sh` uses exit 1:** Architecture says exit 1 = script failure, exit 2 = intentional block. Claude Code may interpret exit 1 as a hook crash rather than a deliberate block.
2. **`pre-commit-gate.sh` outputs `{"message": ...}` for blocks:** PreToolUse hooks should output `{"decision": "block", "reason": "..."}`. The `{"message": ...}` format is for PostToolUse hooks (prompt injection).
3. **`pre-commit-gate.sh` missing `verification_run` check:** Only checks `tests_passed` and `coverage_met`. Story 4.1 verification pipeline sets `verification_run` — the gate must check all three.
4. **`session-start.sh` writes state directly via sed:** Violates the architecture rule that hooks never write state. Must use `codeharness state set` or a new `codeharness state reset-session` command.
5. **`hooks.json` only registers one hook:** All four hooks exist as scripts but only `post-test-verify.sh` is registered. The other three hooks are dead code.
6. **All hooks use `set -euo pipefail`:** This causes scripts to exit immediately on any command failure, potentially producing no JSON output. Hooks must always produce valid JSON, even on errors.

### Performance Consideration: Session Flag Reset

The session-start.sh hook must reset 4 session flags and complete within 500ms (NFR1). Four sequential `codeharness state set` calls would each: parse CLI args, read state file (YAML parse), modify value, write state file (YAML serialize). That's 4 full read-parse-modify-serialize cycles.

Better approach: add `codeharness state reset-session` that does a single read-modify-write for all 4 flags. This keeps the hook well within 500ms.

### What NOT To Do

- **Do NOT implement coverage gate logic** — that's Story 4.3.
- **Do NOT implement doc freshness checks** — that's Story 4.4.
- **Do NOT add new session flags** — use the existing four: `tests_passed`, `coverage_met`, `verification_run`, `logs_queried`.
- **Do NOT mock the CLI in hooks** — hooks call the real CLI. Integration tests verify the full chain.
- **Do NOT use `console.log` directly** in CLI code — use output utilities from `src/lib/output.ts`.
- **Do NOT add `any` types** — strict TypeScript.
- **Do NOT use `set -euo pipefail` in hooks** — use explicit error handling with error traps that produce valid JSON.

### Scope Boundaries

**IN SCOPE (this story):**
- Rewrite all 4 hook scripts to follow canonical patterns (exit codes, JSON format, error traps, fail-open)
- Fix `hooks.json` to register all 4 hooks with correct event types
- Add `codeharness state reset-session` subcommand for batch flag reset
- Add `status --check-docker` flag if not already present
- BATS or Vitest-based integration tests for all hook scripts
- Unit tests for new CLI subcommands

**OUT OF SCOPE (later stories):**
- Coverage gate logic (`src/lib/coverage.ts`) — Story 4.3
- Doc freshness enforcement — Story 4.4
- Ralph integration — Epic 5
- Verification pipeline (already done in Story 4.1)

### Dependencies

- **Depends on:** Story 4.1 (verification pipeline sets `verification_run` flag) — DONE. Story 1.2 (core libraries — state.ts) — DONE. Story 2.2 (Docker lifecycle — docker.ts) — DONE. Story 3.1 (beads CLI wrapper — beads.ts) — DONE.
- **Depended on by:** Story 4.3 (coverage gates interact with pre-commit-gate hook), Story 5.1 (Ralph sessions trigger session-start hook).

### Carried Action Items from Epic 3 Retrospective

- **A1:** Add integration test that runs `codeharness init` as subprocess — consider addressing in Task 8 if scope allows, otherwise carry to dedicated tech-debt story.
- **A3:** Improve branch coverage to 95%+ — new CLI code in this story must have 100% coverage. Address existing gaps if time permits.

### New npm Dependencies

None. Uses Node.js built-ins and existing project dependencies.

### Files Modified

| File | Change |
|------|--------|
| `hooks/hooks.json` | Register all 4 hooks with correct event types |
| `hooks/session-start.sh` | Rewrite to use CLI commands, add error trap |
| `hooks/pre-commit-gate.sh` | Fix exit codes, JSON format, add verification_run check, error trap |
| `hooks/post-write-check.sh` | Fix error handling, remove set -euo pipefail |
| `hooks/post-test-verify.sh` | Add beads issue creation, verify error handling |
| `src/commands/state.ts` | Add `reset-session` subcommand |
| `src/commands/status.ts` | Add `--check-docker` flag (if not present) |

### New Files Created

| File | Purpose |
|------|---------|
| `test/integration/hooks.bats` (or `src/commands/__tests__/state-reset.test.ts`) | Integration tests for hook scripts |
| `src/commands/__tests__/state.test.ts` (extend) | Unit tests for reset-session subcommand |
| `src/commands/__tests__/status.test.ts` (extend) | Unit tests for --check-docker flag |

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 4, Story 4.2]
- [Source: _bmad-output/planning-artifacts/architecture.md — Hook Script Patterns, Decision 1 (CLI <-> Plugin Boundary), Decision 2 (State Management)]
- [Source: _bmad-output/planning-artifacts/prd.md — FR26-FR31 (Enforcement & Hooks), NFR1, NFR9, NFR10, NFR18]
- [Source: hooks/hooks.json — Current (incomplete) hook registration]
- [Source: hooks/session-start.sh — Current implementation with inline sed]
- [Source: hooks/pre-commit-gate.sh — Current implementation with exit 1 bug]
- [Source: src/commands/state.ts — Existing state management CLI]
- [Source: src/lib/state.ts — State file read/write with session_flags]
- [Source: _bmad-output/implementation-artifacts/epic-3-retrospective.md — Carried action items A1, A3]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/4-2-hook-architecture-enforcement.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100% of all new code in src/)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (hooks/ — all hook scripts; src/commands — state.ts, status.ts)
- [ ] Exec-plan created in `docs/exec-plans/active/4-2-hook-architecture-enforcement.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for hook scripts (BATS or shell-based)
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
