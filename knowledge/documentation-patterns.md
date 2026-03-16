# Documentation Patterns — AGENTS.md Format

When creating or updating per-subsystem AGENTS.md files, follow this format exactly.

## Purpose

Each module or subsystem directory should have an AGENTS.md that gives future agents minimal, local context. This replaces reading every file — the agent reads AGENTS.md first to understand what's here and how to work with it.

## Format

```markdown
# {Module Name}

{One-sentence purpose. What does this module do and why does it exist?}

## Key Files

| File | Purpose |
|------|---------|
| file.sh | Brief description |

## Dependencies

- {dependency}: {why it's needed}

## Conventions

- {Convention 1}
- {Convention 2}

## Testing

{How to run tests for this module. Command and location of test files.}
```

## Rules

1. **Max 100 lines** (NFR24). If you need more, put details in `docs/` and link to them.
2. **No implementation details** — just enough to orient an agent. Code comments handle the rest.
3. **Key exports/functions** — list the main entry points, not every function.
4. **Update when you change the module** — stale AGENTS.md is worse than none.
5. **One AGENTS.md per directory** that contains source files. Don't create them for empty directories.

## When to Create

Create an AGENTS.md when:
- You create a new module directory with source files
- A directory has 3+ source files and no AGENTS.md
- The pre-commit hook flags a missing AGENTS.md for a changed module

## When to Update

Update an AGENTS.md when:
- You add, remove, or rename key files in the module
- You change the module's public interface or dependencies
- The doc-freshness check flags it as stale

## Example

```markdown
# ralph/

Vendored autonomous execution loop. Spawns fresh Claude Code instances per iteration with verification gates, circuit breaker protection, and crash recovery.

## Key Files

| File | Purpose |
|------|---------|
| ralph.sh | Core loop — iteration, termination, rate limiting |
| bridge.sh | BMAD→Ralph task bridge — converts stories to tasks |
| verify_gates.sh | Per-story verification gate checks |
| drivers/claude-code.sh | Claude Code instance lifecycle driver |

## Dependencies

- `jq`: JSON processing for progress/status files
- `gtimeout`/`timeout`: Per-iteration timeout protection
- `git`: Progress detection via commit diff

## Conventions

- All scripts are POSIX-compatible bash with `set -e`
- Driver pattern: `ralph/drivers/{name}.sh` implements driver interface
- State files: `ralph/status.json`, `_bmad-output/implementation-artifacts/sprint-status.yaml`
- Tests: `tests/*.bats` (bats-core framework)

## Testing

```bash
bats tests/
```
```
