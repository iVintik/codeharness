# ralph/

Vendored autonomous execution loop. Spawns fresh Claude Code instances per iteration with verification gates, circuit breaker protection, and crash recovery. Each iteration runs `/harness-run` which owns story lifecycle, verification, and session retrospective.

## Key Files

| File | Purpose |
|------|---------|
| ralph.sh | Core loop — iteration, retry tracking, progress reporting, termination |
| bridge.sh | BMAD→Ralph task bridge — converts epics to progress.json (legacy) |
| verify_gates.sh | Per-story verification gate checks (4 gates) |
| drivers/claude-code.sh | Claude Code instance lifecycle, allowed tools, command building |
| harness_status.sh | Sprint status display via CLI |
| lib/date_utils.sh | Cross-platform date/timestamp utilities |
| lib/timeout_utils.sh | Cross-platform timeout command detection |
| lib/circuit_breaker.sh | Stagnation detection (CLOSED→HALF_OPEN→OPEN) |

## Dependencies

- `jq`: JSON processing for status files
- `gtimeout`/`timeout`: Per-iteration timeout protection
- `git`: Progress detection via commit diff

## Conventions

- All scripts use `set -e` and are POSIX-compatible bash
- Driver pattern: `drivers/{name}.sh` implements the driver interface
- Primary task source: `_bmad-output/implementation-artifacts/sprint-status.yaml`
- State files: `status.json` (loop state), `.story_retries` (per-story retry counts), `.flagged_stories` (exceeded retry limit)
- Logs written to `logs/ralph.log` and `logs/claude_output_*.log`
- Scripts guard main execution with `[[ "${BASH_SOURCE[0]}" == "${0}" ]]`

## Post-Iteration Output

After each iteration, Ralph prints:
- Completed stories with titles and proof file paths
- Progress summary with next story in queue
- Session issues (from `.session-issues.md` written by subagents)
- Session retro highlights (action items from `session-retro-{date}.md`)

## Testing

```bash
bats tests/          # All tests
bats tests/ralph_core.bats  # Core loop functions
bats tests/bridge.bats      # Bridge script
bats tests/verify_gates.bats # Verification gates
```
