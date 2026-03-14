# ralph/

Vendored autonomous execution loop. Spawns fresh Claude Code instances per iteration with verification gates, circuit breaker protection, and crash recovery.

## Key Files

| File | Purpose |
|------|---------|
| ralph.sh | Core loop — iteration, termination, rate limiting |
| bridge.sh | BMAD→Ralph task bridge — converts epics to progress.json |
| verify_gates.sh | Per-story verification gate checks (4 gates) |
| drivers/claude-code.sh | Claude Code instance lifecycle and command building |
| lib/date_utils.sh | Cross-platform date/timestamp utilities |
| lib/timeout_utils.sh | Cross-platform timeout command detection |
| lib/circuit_breaker.sh | Stagnation detection (CLOSED→HALF_OPEN→OPEN) |

## Dependencies

- `jq`: JSON processing for progress/status files
- `gtimeout`/`timeout`: Per-iteration timeout protection
- `git`: Progress detection via commit diff

## Conventions

- All scripts use `set -e` and are POSIX-compatible bash
- Driver pattern: `drivers/{name}.sh` implements the driver interface
- State files: `status.json` (loop state), `progress.json` (task tracking)
- Logs written to `logs/ralph.log`
- Scripts guard main execution with `[[ "${BASH_SOURCE[0]}" == "${0}" ]]`

## Testing

```bash
bats tests/          # All tests
bats tests/ralph_core.bats  # Core loop functions
bats tests/bridge.bats      # Bridge script
bats tests/verify_gates.bats # Verification gates
```
