---
stepsCompleted: [1]
lastStep: 1
status: complete
completedAt: '2026-03-15'
inputDocuments:
  - prd.md (v2)
  - architecture.md (v2)
workflowType: 'ux-design'
note: 'Minimal CLI UX spec — full UX workflow N/A for CLI tool'
---

# CLI UX Specification — codeharness

**Date:** 2026-03-15

## Overview

codeharness is a CLI tool. No GUI, no web interface, no visual design. The UX is the developer experience in the terminal: command output, error messages, progress reporting, hook feedback, and proof document structure.

**Core UX principle:** Trust through proof. Dense, actionable output. No noise.

**Target user:** Senior developer, CLI-native, values clarity over polish. Has been burned by false "done" signals and wants reproducible evidence.

## Command Surface

### Global CLI

```
codeharness <command> [options]

Commands:
  init        Initialize harness in current project
  bridge      Import BMAD stories into beads
  run         Start autonomous execution loop
  verify      Run verification pipeline for a story
  status      Show harness health and sprint progress
  onboard     Scan existing project and generate onboarding plan
  teardown    Remove harness artifacts (preserves project code)
  state       Read/write harness state flags

Options:
  --json      Machine-readable JSON output (all commands)
  --verbose   Verbose output for debugging
  --help      Show help
  --version   Show version
```

### Command-Specific Options

```
codeharness init [--no-observability] [--no-frontend] [--no-database] [--no-api]
codeharness bridge --epics <path> [--dry-run]
codeharness run [--max-iterations <n>] [--timeout <seconds>] [--live]
codeharness verify --story <story-id>
codeharness status [--check] [--check-docker]
codeharness onboard [scan|coverage|audit|epic] [--project-dir <path>] [--min-module-size <n>]
codeharness teardown [--keep-docker] [--keep-beads]
codeharness state [get <key>|set <key> <value>|reset]
```

## Output Patterns

### Status Prefixes

Every line of output uses a prefix:

```
[OK]   Successfully completed action
[FAIL] Action failed — followed by actionable remedy
[WARN] Non-fatal issue — something to be aware of
[INFO] Informational — progress update or context
```

### Init Output Example

```
codeharness init

[INFO] Stack detected: Node.js (package.json)
[INFO] Installing dependencies...
[OK]   Showboat: installed (v0.6.1)
[OK]   agent-browser: installed (v1.2.0)
[OK]   beads: installed (v0.4.0)
[OK]   OTLP: @opentelemetry/auto-instrumentations-node installed
[INFO] Docker: checking...
[OK]   Docker: running
[OK]   VictoriaMetrics stack: started (logs:9428, metrics:8428, traces:14268)
[OK]   BMAD: installed (v6.2), harness patches applied
[OK]   Plugin: installed to .claude-plugin/
[OK]   State file: .claude/codeharness.local.md created
[OK]   Documentation: AGENTS.md + docs/ scaffold created
[OK]   Enforcement: frontend:ON database:ON api:ON observability:ON

Harness initialized. Run: codeharness bridge --epics <path>
```

### Status Output Example

```
codeharness status

Harness: codeharness v1.0.0
Stack: nodejs | Enforcement: front:ON db:ON api:ON obs:ON

Docker:
  victoria-logs:   running (port 9428)
  victoria-metrics: running (port 8428)
  otel-collector:  running (port 4318)

Beads:
  Total issues: 12 (8 story, 3 bug, 1 task)
  Ready: 3 | In progress: 1 | Done: 8

Session flags:
  tests_passed:     true
  coverage_met:     true
  verification_run: false
  logs_queried:     true

Coverage: 94% (target: 100%)
```

### Error Output Pattern

Every error must be **actionable** — tell the user what happened AND what to do:

```
[FAIL] Docker not installed.

Docker is required for the observability stack.
→ Install: https://docs.docker.com/engine/install/
→ Or disable: codeharness init --no-observability
```

```
[FAIL] Beads not installed.

→ Install: pip install beads
→ Or: pipx install beads
```

```
[FAIL] Cannot start harness loop — no tasks found.

→ Import BMAD stories: codeharness bridge --epics <path>
→ Or create manually: bd create "Task title" --type task
```

### JSON Mode

All commands support `--json` for machine consumption:

```json
{
  "status": "ok",
  "stack": "nodejs",
  "enforcement": {
    "frontend": true,
    "database": true,
    "api": true,
    "observability": true
  },
  "docker": {
    "running": true,
    "services": ["victoria-logs", "victoria-metrics", "otel-collector"]
  },
  "beads": {
    "total": 12,
    "ready": 3,
    "in_progress": 1,
    "done": 8
  }
}
```

## Hook Interaction Patterns

### PreToolUse: Commit Gate

When agent tries to commit without quality gates:

```json
{
  "decision": "block",
  "reason": "Quality gates not met.\n\n  tests_passed: false\n  coverage_met: false\n\n→ Run tests and check coverage before committing.\n→ Then: codeharness state set tests_passed true"
}
```

**UX principle:** Block message tells the agent exactly what's missing and how to fix it.

### PostToolUse: Verification Prompt

After file writes:

```json
{
  "message": "New code written. Verify OTLP instrumentation is present.\n→ Check that new endpoints emit traces and structured logs.\n→ Query VictoriaLogs: curl 'localhost:9428/select/logsql/query?query=level:error'"
}
```

**UX principle:** Prompts are specific and actionable, not generic reminders.

### SessionStart: Health Check

```json
{
  "message": "Harness health: OK\n  Docker: running\n  Beads: 3 tasks ready\n  Session flags: reset"
}
```

## Proof Document Structure

Showboat proof documents are the primary trust artifact. Their UX matters.

### Naming

`verification/{story-id}-proof.md`

### Structure

```markdown
# Verification Proof: 3.2

## Story: User can reset password via email

## Acceptance Criteria Verification

### AC1: Reset email is sent when user submits valid email

​```showboat exec
curl -s -X POST localhost:3000/api/reset-password \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
​```

Expected: 200 with `{"message": "Reset email sent"}`

### AC2: Reset token exists in database after request

​```showboat exec
curl -s localhost:3000/api/admin/db-query \
  -d '{"query": "SELECT token FROM reset_tokens WHERE email = '\''test@example.com'\''"}'
​```

Expected: One row with non-null token

## Verification Summary

- Total ACs: 5
- Verified: 5
- Failed: 0
- showboat verify: PASS
```

**UX principle:** Every AC has real command output, not descriptions of what should happen. Anyone can re-run `showboat verify` and see the same results.

## Progress Reporting (Ralph Loop)

During autonomous execution:

```
codeharness run

[INFO] Starting autonomous execution — 5 stories ready
[INFO] Iteration 1: Story 3.1 — User registration
  [OK]   Implementation complete
  [OK]   Tests: 12 passed, 0 failed
  [OK]   Coverage: 100%
  [OK]   Verification: 4/4 ACs verified
  [OK]   Proof: verification/3.1-proof.md
  [OK]   Story 3.1: DONE (bd close bd-42)

[INFO] Iteration 2: Story 3.2 — Password reset
  [OK]   Implementation complete
  [WARN] Tests: 8 passed, 1 failed — retrying...
  [OK]   Tests: 9 passed (fix applied)
  [OK]   Coverage: 100%
  [OK]   Verification: 5/5 ACs verified
  [OK]   Proof: verification/3.2-proof.md
  [OK]   Story 3.2: DONE (bd close bd-43)

[INFO] Progress: 2/5 stories complete (iterations: 2, elapsed: 47m)
```

## Beads Integration UX

### Bridge Output

```
codeharness bridge --epics _bmad-output/planning-artifacts/epics.md

[INFO] Parsing BMAD epics...
[OK]   Epic 1: Project Scaffold — 2 stories
[OK]   Epic 2: Core Libraries — 4 stories
[OK]   Epic 3: CLI Commands — 7 stories
[OK]   Epic 4: Plugin & Hooks — 4 stories
[OK]   Epic 5: Brownfield Onboarding — 3 stories

[OK]   Bridge: 20 stories imported into beads

Ready to run: codeharness run
```

### Issue Discovery During Development

When the agent or a hook discovers a problem:

```bash
bd create "API returns 200 but empty body for /admin/activity" \
  --type bug --priority 1 \
  --description "Discovered during Story 3.5 verification" \
  --deps discovered-from:bd-47
```

Shows up in next `codeharness status`:

```
Beads:
  Total issues: 13 (8 story, 4 bug, 1 task)    ← new bug
  Ready: 3 | In progress: 1 | Done: 8
```

## Design Principles Summary

1. **Every output line is actionable** — if something failed, say what to do next
2. **Dense over verbose** — one `[OK]` line per completed step, not paragraphs
3. **JSON mode everywhere** — `--json` on every command for programmatic use
4. **Proof over trust** — Showboat documents with real command output, not status badges
5. **Fail with remedy** — never just say "error", always say "error → fix with X"
6. **Status at a glance** — `codeharness status` shows everything in one screen
