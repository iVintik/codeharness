---
description: Initialize the codeharness harness in the current project — detect stack, configure enforcement, install dependencies, set up hooks.
---

# Harness Init

Initialize codeharness in the current project. The CLI does the heavy lifting — your job is to run it and handle BMAD patches.

## Step 1: Run the CLI

Always invoke the CLI via `npx --yes codeharness@latest …` so the plugin and the
binary can never drift out of sync. `npx` pulls the latest published version
from npm on first call and caches it — subsequent runs in the same shell are
instant. Never call a plain `codeharness` shell alias.

```bash
npx --yes codeharness@latest init --json
```

The CLI handles:
- Stack detection
- Dependency installation (with smart fallbacks — do NOT install deps manually)
- Docker/observability stack check
- State file creation
- Documentation scaffold
- Workflow template generation

Parse the JSON output to understand what happened. The output includes `status`, `stack`, `stacks`, `dependencies`, `docker`, `otlp`, `documentation`, and `workflow` fields.

If the state file already exists (re-init), the CLI handles preservation of enforcement config and verification_log automatically.

### What if the user wants specific options?

- `--no-observability` — skip OTLP instrumentation
- `--observability-backend none` — disable observability entirely
- `--otel-endpoint <url>` — use remote OTLP endpoint
- `--force` — overwrite existing workflow file
- `--frontend --no-database --api` — set enforcement flags

Pass user preferences as CLI flags.

## Step 2: BMAD Installation & Patches

The CLI does NOT handle BMAD installation or patch application. This is your responsibility.

### Check for existing BMAD

1. If `_bmad/` directory exists → preserve it, apply patches
2. If NO `_bmad/` → run `npx bmad-method install --yes --directory . --modules bmm --tools none`

Use `--tools none` for OpenCode and other non-BMAD-native agent runtimes. codeharness exposes the runnable instructions through repo-local `AGENTS.md`, `commands/`, and `skills/` instead of relying on BMAD to generate IDE-specific command wrappers.

### Apply Harness Patches

Read each patch template from the codeharness plugin's `templates/bmad-patches/` directory. Check if the patch marker already exists in the target file before applying.

Each patch is wrapped with markers:
```
<!-- CODEHARNESS-PATCH-START:{patch_name} -->
{patch content}
<!-- CODEHARNESS-PATCH-END:{patch_name} -->
```

If markers already exist, skip that patch. Patches are idempotent.

## Step 3: Report

Read the version from `npx --yes codeharness@latest --version` for the report
header. Output:

```
Harness Init — codeharness v{version}

[OK] Stack detected: {stack} ({indicator})
[OK] Docker: {running|missing}
[OK] Dependencies: {summary from CLI output}
[OK] BMAD: {installed|existing|standalone}
[OK] Documentation scaffold: {status — created, agents_md, claude_md, docs_scaffold details}
[OK] Enforcement: frontend:{ON|OFF} database:{ON|OFF} api:{ON|OFF} observability:ON
[OK] Config: .claude/codeharness.local.md

Next steps:
  → Run /bmad-bmm-document-project (BMAD tech-writer) to populate docs/ and write README.md
  → Run /codeharness:harness-run to start autonomous execution
```

The `/bmad-bmm-document-project` recommendation is REQUIRED — docs/index.md is only a
placeholder until the tech-writer workflow scans the real codebase. Skipping
this step leaves `_(To be generated)_` markers throughout docs/. If the JSON
output's `next_steps` array contains entries, render each one as a bullet
under "Next steps:" in addition to the `/codeharness:harness-run` line.

## Critical Rules

1. **Do NOT run manual dependency checks via bash** — the CLI handles all deps
2. **Do NOT edit the state file manually** — the CLI manages `.claude/codeharness.local.md`
3. **Do NOT check Docker, Showboat, Semgrep, BATS individually** — the CLI checks them all in batch
4. **Do NOT install tools into the project's .venv** — the CLI uses system-level installers
5. **Do NOT generate compose files** — the CLI manages the shared observability stack
6. **Do NOT hardcode version numbers** — read from `npx --yes codeharness@latest --version`
7. **Do NOT call `codeharness` as a bare command** — always use `npx --yes codeharness@latest …` so the plugin and CLI stay in lockstep
