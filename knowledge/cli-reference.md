# Codeharness CLI Reference

Quick reference for all codeharness commands. Do NOT run `--help` to discover these — use this reference.

## Core Workflow Commands

### `codeharness init`
Initialize harness in a project. Detects stack, sets up observability, installs deps.
```
codeharness init                              # Default: victoria backend
codeharness init --observability-backend elk   # Use ELK stack
codeharness init --no-observability            # Skip OTLP
codeharness init --otel-endpoint https://...   # Remote endpoint (no local Docker)
```

### `codeharness run`
Start autonomous sprint execution via Ralph loop.
```
codeharness run                    # Default: 50 iterations, 30m/iteration, 12h total
codeharness run --reset            # Clear retries, flagged stories, circuit breaker
codeharness run --quiet            # No terminal UI (background mode)
codeharness run --timeout 7200     # 2 hour total timeout
codeharness run --iteration-timeout 45  # 45 min per iteration
```

### `codeharness verify --story <key>`
Validate a story's proof document against acceptance criteria.
```
codeharness verify --story 3-1-some-feature
```

### `codeharness coverage`
Run tests with coverage and evaluate against targets (default: 90% overall, 80% per-file).
```
codeharness coverage                        # Run tests + evaluate
codeharness coverage --check-only           # Read last report without running
codeharness coverage --min-file 80          # Set per-file floor
codeharness coverage --story 3-1-feature    # Associate delta with story
```

## Status & Monitoring

### `codeharness status`
Show harness health, sprint progress, verification state.
```
codeharness status                  # Full status display
codeharness status --check-docker   # Check Docker/observability stack
codeharness status --story 3-1-x    # Drill down into one story
codeharness status --check          # Health check with exit code (CI gate)
```

### `codeharness stats`
Analyze token consumption and cost from ralph session logs.
```
codeharness stats           # Print cost report
codeharness stats --save    # Save to _bmad-output/implementation-artifacts/cost-report.md
codeharness stats --json    # Machine-readable output
```

### `codeharness progress`
Update live run progress (used by harness-run orchestrator).
```
codeharness progress --story 3-1-x --phase dev --action "Implementing task 2"
codeharness progress --ac-progress "4/12"
codeharness progress --clear
```

## Infrastructure

### `codeharness stack`
Manage the shared observability stack (VictoriaMetrics, VictoriaLogs, OTel Collector).
```
codeharness stack start     # Start Docker compose stack
codeharness stack stop      # Stop stack
codeharness stack status    # Check running containers
```

### `codeharness verify-env`
Manage Docker verification environment.
```
codeharness verify-env build                    # Build verification Docker image
codeharness verify-env prepare --story 3-1-x    # Create clean temp workspace
codeharness verify-env check                    # Validate environment
codeharness verify-env cleanup --story 3-1-x    # Remove temp workspace + container
```

## Quality & Compliance

### `codeharness audit`
Check all compliance dimensions (observability, testing, docs, verification, infrastructure).
```
codeharness audit           # Full compliance report
codeharness audit --fix     # Generate fix stories for gaps
codeharness audit --json    # Machine-readable output
```

### `codeharness observability-gate`
Check observability coverage against targets (used as commit gate).
```
codeharness observability-gate
```

## Data Management

### `codeharness sync`
Synchronize beads issue statuses with story files.
```
codeharness sync --story 3-1-x --direction files-to-beads
```

### `codeharness retry`
Manage retry state for stories.
```
codeharness retry --story 3-1-x --reset    # Reset retry counter
codeharness retry --list                    # Show all retry states
```

### `codeharness validate-state`
Validate sprint-state.json consistency.
```
codeharness validate-state
```

## Key Files

| File | Purpose |
|------|---------|
| `sprint-state.json` | Sprint runtime state (stories, retries, progress) |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | Human-readable sprint view (derived) |
| `.claude/codeharness.local.md` | Project config (stack, OTLP, coverage targets) |
| `ralph/logs/` | Session logs for stats analysis |
| `verification/{story}-proof.md` | Showboat proof documents |
