# commands/

Slash commands registered as Claude Code plugin commands. Each `.md` file defines one user-invocable command.

## Key Files

| File | Purpose |
|------|---------|
| harness-init.md | `/harness-init` — detect stack, install deps, configure harness |
| harness-run.md | `/harness-run` — start autonomous Ralph loop execution |
| harness-teardown.md | `/harness-teardown` — cleanly remove harness artifacts |
| harness-verify.md | `/harness-verify` — trigger verification for current story |

## Conventions

- Each command is a markdown file with YAML frontmatter (`description:`)
- Commands contain step-by-step instructions for the agent to execute
- Output follows UX format: `[OK]`/`[FAIL]` status lines, `→` action hints
- Commands reference scripts in `ralph/` for actual execution logic
