---
description: Show harness health, sprint progress, and verification state at a glance.
---

# Harness Status

Show the current state of the harness — health, enforcement config, sprint progress, and next action.

## Step 1: Gather Status

Run the CLI status command. The plugin's SessionStart hook ensures the
`codeharness` binary is at the correct version for this plugin release.

```bash
codeharness status
```

The output follows the `git status` model:
1. **Health line** — version, stack, Docker status
2. **Enforcement config** — which components are enforced (frontend, database, api, observability)
3. **Sprint progress** — per-story status counts (done, verified, in-progress, backlog)
4. **Next action** — current story or suggestion to run `/harness-run`

## Step 2: Additional Details (if requested)

If the user wants more detail:
- **Sprint status**: `cat _bmad-output/implementation-artifacts/sprint-status.yaml`
- **Loop status**: `cat ralph/status.json | jq .`
- **Coverage**: Check `.claude/codeharness.local.md` session flags
- **Session issues**: `cat _bmad-output/implementation-artifacts/.session-issues.md`
- **Latest retro**: `ls -t _bmad-output/implementation-artifacts/session-retro-*.md | head -1 | xargs cat`
