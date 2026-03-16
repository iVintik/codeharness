# codeharness

## Quick Start

```bash
# Install
npm install -g codeharness

# Initialize the project
codeharness init

# Check project status
codeharness status
```

## Installation

```bash
npm install -g codeharness
```

## Usage

After installation, initialize codeharness in your project directory:

```bash
codeharness init
```

This sets up the harness with stack detection, observability, and documentation scaffolding.

## CLI Reference

```
Usage: codeharness [options] [command]

Makes autonomous coding agents produce software that actually works

Options:
  -V, --version            output the version number
  --json                   Output in machine-readable JSON format
  -h, --help               display help for command

Commands:
  init [options]           Initialize the harness in a project
  bridge [options]         Bridge BMAD epics/stories into beads task store
  run [options]            Execute the autonomous coding loop
  verify [options]         Run verification pipeline on completed work
  status [options]         Show current harness status and health
  onboard [options]        Onboard an existing codebase into the harness
  teardown [options]       Remove harness from a project
  state                    Manage harness state
  sync [options]           Synchronize beads issue statuses with story files and
                           sprint-status.yaml
  coverage [options]       Run tests with coverage and evaluate against targets
  doc-health [options]     Scan documentation for freshness and quality issues
  stack                    Manage the shared observability stack
  query                    Query observability data (logs, metrics, traces)
                           scoped to current project
  retro-import [options]   Import retrospective action items as beads issues
  github-import [options]  Import GitHub issues labeled for sprint planning into
                           beads
  verify-env               Manage verification environment (Docker image + clean
                           workspace)
  help [command]           display help for command
```
