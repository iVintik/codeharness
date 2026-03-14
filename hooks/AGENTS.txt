# hooks/

Claude Code plugin hooks that mechanically enforce harness requirements. Hooks fire automatically on tool use events — the agent cannot skip them.

## Key Files

| File | Purpose |
|------|---------|
| hooks.json | Hook registration manifest (event→script mapping) |
| session-start.sh | SessionStart — verify observability stack health |
| pre-commit-gate.sh | PreToolUse(Bash) — block commits without quality gates |
| post-write-check.sh | PostToolUse(Write) — prompt OTLP instrumentation check |
| post-test-verify.sh | PostToolUse(Bash) — prompt VictoriaLogs query after tests |

## Dependencies

- `.claude/codeharness.local.md`: State file with session flags

## Conventions

- Each hook must complete within 500ms (NFR1)
- Hooks read from stdin (JSON hook input) and write JSON to stdout
- Exit 0 = allow, Exit 1 = block (with message)
- Use `[BLOCKED]` prefix for blocking messages, `[OK]` for pass
- All hooks are idempotent — safe to fire multiple times
