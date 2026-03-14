---
description: Scan an existing project and generate an onboarding plan to bring it to full harness compliance.
---

# Harness Onboard

Scan an existing project for harness compliance gaps and generate an executable onboarding plan.

## Step 1: Run Codebase Scan

```bash
bash ralph/onboard.sh scan --project-dir .
```

Review the scan results: modules, source files, test coverage, documentation status.

## Step 2: Coverage Gap Analysis

```bash
bash ralph/onboard.sh coverage --project-dir .
```

Identifies modules without tests and estimates effort.

## Step 3: Documentation Audit

```bash
bash ralph/onboard.sh audit --project-dir .
```

Checks README, ARCHITECTURE.md, per-module AGENTS.md, and freshness.

## Step 4: Generate Onboarding Epic

```bash
bash ralph/onboard.sh epic --project-dir . --output ralph/onboarding-epic.md
```

Creates a BMAD-compatible epic with stories for reaching compliance.

## Step 5: Present Plan for Review

Show the user the generated epic and ask for approval:
- Total stories and estimated scope
- Module-by-module breakdown
- User can approve, reorder, or remove stories

Only proceed to execution after explicit user approval.

## Step 6: Execute (after approval)

Convert the approved epic to Ralph tasks and run:
```bash
bash ralph/bridge.sh --epics ralph/onboarding-epic.md --output ralph/progress.json
bash ralph/ralph.sh --plugin-dir . --progress ralph/progress.json
```
