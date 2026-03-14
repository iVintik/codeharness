---
description: Show harness health, sprint progress, and verification state at a glance.
---

# Harness Status

Show the current state of the harness — health, enforcement config, sprint progress, and next action.

## Step 1: Run Status Script

Execute the status script:

```bash
bash ralph/harness_status.sh --project-dir .
```

The output follows the `git status` model:
1. **Health line** — version, stack, Docker status
2. **Enforcement config** — which components are enforced (frontend, database, api, observability)
3. **Sprint progress** — per-story `[PASS]`/`[    ]` with titles
4. **Next action** — current story or suggestion to run `/harness-run`

## Step 2: Additional Details (if requested)

If the user wants more detail:
- **Loop status**: `cat ralph/status.json | jq .`
- **Verification log**: Check `ralph/progress.json` for iteration counts
- **Doc health**: Run `ralph/doc_gardener.sh --project-dir . --report`
- **Coverage**: Check `.claude/codeharness.local.md` session flags
