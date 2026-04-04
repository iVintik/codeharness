# codeharness

Makes autonomous coding agents produce software that actually works — not software that passes tests.

codeharness is an **npm CLI** + **Claude Code plugin** that packages verification-driven development as an installable tool: black-box verification via Docker, agent-first observability via VictoriaMetrics, and mechanical enforcement via hooks that make skipping verification architecturally impossible.

## What it does

1. **Verifies features work** — not just that tests pass. Black-box verification runs the built CLI inside a Docker container with no source code access. If the feature doesn't work from a user's perspective, verification fails.
2. **Fixes what it finds** — verification failures with code bugs automatically return to development with specific findings. The dev agent gets told exactly what's broken and why.
3. **Runs sprints autonomously** — reads your sprint plan, picks the highest-priority story, implements it, checks it (tests + lint), verifies it (agent evaluation), and moves to the next one. Cross-epic prioritization, retry management, and session handoff built in.
4. **Makes agents see runtime** — ephemeral VictoriaMetrics stack (logs, metrics, traces) that agents query programmatically during development. No guessing at what the code does at runtime.

## Installation

Two components — install both:

```bash
# CLI (npm package)
npm install -g codeharness

# Claude Code plugin (slash commands, hooks, skills)
claude plugin install github:iVintik/codeharness
```

## Quick Start

```bash
# Initialize in your project
codeharness init

# Start autonomous sprint execution (inside Claude Code)
/harness-run
```

## How it works

### As a CLI (`codeharness`)

The CLI handles all mechanical work — stack detection, Docker management, verification, coverage, retry state.

| Command | Purpose |
|---------|---------|
| `codeharness init` | Detect stack, install dependencies, start observability, scaffold docs |
| `codeharness run` | Execute the autonomous coding loop (Ralph) |
| `codeharness verify --story <key>` | Run verification pipeline for a story |
| `codeharness status` | Show harness health, sprint progress, Docker stack |
| `codeharness coverage` | Run tests with coverage and evaluate against targets |
| `codeharness onboard epic` | Scan codebase for gaps, generate onboarding stories |
| `codeharness retry --status` | Show retry counts and flagged stories |
| `codeharness retry --reset` | Clear retry state for re-verification |
| `codeharness verify-env build` | Build Docker image for black-box verification |
| `codeharness stack start` | Start the shared observability stack |
| `codeharness teardown` | Remove harness from project |

All commands support `--json` for machine-readable output.

### As a Claude Code plugin (`/harness-*`)

The plugin provides slash commands that orchestrate the CLI within Claude Code sessions:

| Command | Purpose |
|---------|---------|
| `/harness-run` | Autonomous sprint execution — picks stories by priority, runs create → implement → check → verify loop |
| `/harness-init` | Interactive project initialization |
| `/harness-status` | Quick overview of sprint progress and harness health |
| `/harness-onboard` | Scan project and generate onboarding plan |
| `/harness-verify` | Verify a story with real-world evidence |

### BMAD Method integration

codeharness integrates with [BMAD Method](https://github.com/bmadcode/BMAD-METHOD) for structured sprint planning:

| Phase | Commands |
|-------|----------|
| Analysis | `/create-brief`, `/brainstorm-project`, `/market-research` |
| Planning | `/create-prd`, `/create-ux` |
| Solutioning | `/create-architecture`, `/create-epics-stories` |
| Implementation | `/sprint-planning`, `/create-story`, then `/harness-run` |

## Verification architecture

```
┌─────────────────────────────────────────┐
│  Claude Code Session                     │
│  /harness-run picks next story           │
│  → create-story → implement → check → verify │
└────────────────────┬────────────────────┘
                     │ verify
                     ▼
┌─────────────────────────────────────────┐
│  Docker Container (no source code)       │
│  - codeharness CLI installed from tarball│
│  - claude CLI for nested verification    │
│  - curl/jq for observability queries     │
│  Exercises CLI as a real user would      │
└────────────────────┬────────────────────┘
                     │ queries
                     ▼
┌─────────────────────────────────────────┐
│  Observability Stack (VictoriaMetrics)   │
│  - VictoriaLogs  :9428 (LogQL)          │
│  - VictoriaMetrics :8428 (PromQL)       │
│  - OTEL Collector :4318                  │
└─────────────────────────────────────────┘
```

When verification finds code bugs → story returns to dev with findings → dev fixes → re-verify. This loop runs up to 10 times per story. Infrastructure failures (timeouts, Docker errors) retry 3 times then skip.

## Requirements

- Node.js >= 18
- Docker (for observability and verification)
- Claude Code (for plugin features)

## License

MIT
