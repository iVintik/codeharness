---
stepsCompleted: [1, 2]
lastStep: 2
status: complete
completedAt: '2026-03-17'
inputDocuments:
  - prd-overhaul.md
  - product-brief-codeharness-arch-overhaul-2026-03-17.md
  - ux-design-specification.md (v1, reworked)
workflowType: 'ux-design'
note: 'Full CLI UX spec — reworked for architecture overhaul with status visibility, failure detail, live mode'
---

# CLI UX Specification — codeharness (v2)

**Date:** 2026-03-17
**Revision:** Architecture overhaul — reworked for visibility, responsiveness, and clear failure reporting

## Overview

codeharness is a CLI tool. No GUI, no web interface, no visual design. The UX is the developer experience in the terminal: command output, error messages, progress reporting, hook feedback, and proof document structure.

**Core UX principle:** One screen, full picture. Progressive detail. Failures are specific and actionable.

**Target user:** Developer who runs codeharness and checks back later. Needs to understand what happened in 10 seconds, drill into failures in 2 minutes, and never spelunk through log files.

## Command Surface

```
codeharness <command> [options]

Commands:
  init        Initialize harness in current project
  run         Start autonomous execution loop
  verify      Run verification pipeline for a story
  status      Show project state, run progress, and action items
  bridge      Import BMAD stories into beads
  onboard     Scan existing project and generate onboarding plan
  teardown    Remove harness artifacts (preserves project code)
  state       Read/write harness state flags
  retry       Manage story retry state

Options:
  --json      Machine-readable JSON output (all commands)
  --verbose   Verbose output for debugging
  --help      Show help
  --version   Show version
```

### Command-Specific Options

```
codeharness init [--no-observability] [--no-frontend] [--no-database] [--no-api]
                 [--opensearch-url <url>]
                 [--otel-endpoint <url>]
                 [--logs-url <url>] [--metrics-url <url>] [--traces-url <url>]
codeharness run  [--live] [--stop] [--max-iterations <n>] [--timeout <seconds>]
codeharness verify --story <story-id>
codeharness status [--story <id>] [--check-docker]
codeharness bridge --epics <path> [--dry-run]
codeharness onboard [scan|coverage|audit|epic] [--project-dir <path>]
codeharness teardown [--keep-docker] [--keep-beads]
codeharness state [get <key>|set <key> <value>|reset]
codeharness retry [--status] [--reset] [--reset --story <id>] [--json]
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

### Symbols for Live/Status Views

```
✓  completed successfully
✗  failed
◆  in progress
○  pending
✕  blocked/exhausted
```

## Command UX: `codeharness status`

### Default Output (One Screen)

```
codeharness v0.18.1 | nodejs | enforcement: front:OFF db:OFF api:OFF obs:ON

── Project State ──────────────────────────────────────────────
Sprint: 17/65 done (26%) | 5/16 epics complete
Current epic: Epic 3 — BMAD Integration (2/4 stories done)
Modules: infra:OK verify:OK sprint:OK dev:OK review:OK

── Active Run ─────────────────────────────────────────────────
Status: running (iteration 7, 2h14m elapsed)
Current: 3-3-bmad-parser-story-bridge → verifying (AC 4/7)
Last action: docker exec codeharness-verify codeharness bridge --dry-run
Budget: $23.40 spent | 47 stories remaining

── This Run ───────────────────────────────────────────────────
Completed:  4 stories (3-1, 3-2, 4-1, 4-2)
Failed:     1 story
  └ 2-3: AC 4 — status --check-docker exit 1 (attempt 3/10)
Blocked:    2 stories
  └ 0-1: retry-exhausted (10/10)
  └ 13-3: retry-exhausted (10/10)
Skipped:    3 stories (retry-exhausted)
In progress: 1 story (3-3)

── Action Items (this run) ────────────────────────────────────
NEW: 2-3 needs fix: status checks project-level containers, not shared
CARRIED: A56 status --check-docker wrong containers (3 sessions)
```

### No Active Run

```
codeharness v0.18.1 | nodejs | enforcement: front:OFF db:OFF api:OFF obs:ON

── Project State ──────────────────────────────────────────────
Sprint: 17/65 done (26%) | 5/16 epics complete
Last run: 2h14m ago (4 completed, 1 failed, 2 blocked)
Modules: infra:OK verify:OK sprint:OK dev:OK review:OK

── Last Run Summary ───────────────────────────────────────────
Duration: 2h14m | Cost: $23.40 | Iterations: 7
Completed:  4 stories (3-1, 3-2, 4-1, 4-2)
Failed:     1 story
  └ 2-3: AC 4 — status --check-docker exit 1 (attempt 3/10)
Blocked:    2 stories (retry-exhausted)
Skipped:    3 stories

── Action Items ───────────────────────────────────────────────
[1] FIX 2-3: status checks project-level containers, not shared stack
[2] CARRIED A56: status --check-docker wrong containers (3 sessions)

→ Run: codeharness status --story 2-3 for details
→ Run: codeharness run to resume
```

### Story Drill-Down: `codeharness status --story <id>`

```
Story: 2-3-observability-querying-agent-visibility-into-runtime
Status: failed (attempt 3/10)
Epic: 2 — Observability Stack
Last attempt: 2026-03-18T03:42:15Z

── AC Results ─────────────────────────────────────────────────
AC 1: [PASS] VictoriaLogs query returns structured logs
AC 2: [PASS] VictoriaMetrics query returns metrics
AC 3: [PASS] Agent queries logs during dev workflow
AC 4: [FAIL] Status command reports stack health correctly
  Command:  docker exec codeharness-verify codeharness status --check-docker
  Expected: exit 0 with "running" for all services
  Actual:   exit 1
  Output:   [FAIL] VictoriaMetrics stack: not running
  Reason:   Checks project-level container names (codeharness-victoria-logs-1)
            but shared stack uses (codeharness-shared-victoria-logs-1)
  Suggest:  Fix container name matching in src/commands/status.ts
AC 5: [PASS] Query endpoints accessible from verification container
AC 6: [ESCALATE] Observability data persists across sessions
AC 7: [PASS] OTLP instrumentation auto-configured

── History ────────────────────────────────────────────────────
Attempt 1: verify failed (AC 4, same error)
Attempt 2: dev fix applied → verify failed (AC 4, same error)
Attempt 3: dev fix applied → verify failed (AC 4, same error)

Proof: verification/2-3-proof.md (5/7 pass, 1 fail, 1 escalate)
```

## Command UX: `codeharness run`

### Default (Background with Status File)

```
$ codeharness run
[INFO] Starting autonomous execution — 6 ready, 1 in progress, 42 verifying
[INFO] Observability: shared stack running (VictoriaMetrics)
[INFO] Verification container: ready

Running in background. Check progress:
  → codeharness status          (one-screen summary)
  → codeharness run --live      (streaming output)
  → codeharness run --stop      (graceful stop after current story)
```

### Live Mode: `codeharness run --live`

Rolling status that updates in place:

```
$ codeharness run --live

codeharness run | iteration 3 | 47m elapsed | $12.30 spent
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Story: 3-2-bmad-installation-workflow-patching
Phase: verify → AC 8/12 (docker exec ... codeharness init --json)

Done: 3-1 ✓  4-1 ✓  4-2 ✓
This: 3-2 ◆ verifying (8/12 ACs)
Next: 3-3 (verifying, no proof yet)

Blocked: 0-1 ✕ (10/10)  13-3 ✕ (10/10)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Story Completes

```
[OK] Story 3-2: DONE — 12/12 ACs verified
  └ Proof: verification/3-2-proof.md
  └ Duration: 18m | Cost: $4.20
[INFO] Sprint: 18/65 done (28%) — moving to 3-3
```

### Story Returned to Dev

```
[WARN] Story 3-3: verification found 2 failing ACs → returning to dev
  └ AC 3: bridge --dry-run output missing epic headers
  └ AC 7: bridge creates duplicate beads issues
  └ Attempt 2/10 — dev will fix and re-verify
```

### Story Failed

```
[FAIL] Story 2-3: verification failed at AC 4 (attempt 3/10)
  └ docker exec codeharness-verify codeharness status --check-docker → exit 1
  └ Output: "[FAIL] VictoriaMetrics stack: not running"
  └ Returning to dev for fix (attempt 4)
[INFO] Moving to next story: 3-3-bmad-parser-story-bridge
```

### Timeout

```
[WARN] Story 5-2: verification timed out after 30m (attempt 2/10)
  └ Partial proof saved: verification/5-2-proof.md (3/7 ACs before timeout)
  └ Git changes captured: 2 files modified
  └ Moving to next story
```

## Command UX: `codeharness init`

### Successful Init

```
$ codeharness init

── Stack Detection ────────────────────────────────────────────
[OK] Stack: Node.js (package.json)
[OK] App type: CLI

── Dependencies ───────────────────────────────────────────────
[OK] Docker: running
[OK] Showboat: installed (v0.6.1)
[OK] agent-browser: installed (v1.2.0)
[OK] OTLP: Node.js packages installed

── Observability ──────────────────────────────────────────────
[OK] Shared stack: already running at ~/.codeharness/stack/
     └ VictoriaLogs :9428  VictoriaMetrics :8428  OTel :4318

── BMAD ───────────────────────────────────────────────────────
[OK] BMAD: installed (v6.2.0)
[OK] Patches: 5 applied (story, dev, review, retro, sprint)

── Project Setup ──────────────────────────────────────────────
[OK] State: .claude/codeharness.local.md created
[OK] Docs: AGENTS.md + docs/ scaffold created
[OK] Enforcement: front:OFF db:OFF api:OFF obs:ON

Ready. Run: codeharness run
```

### Init with OpenSearch

```
$ codeharness init --opensearch-url https://search.example.com

── Observability ──────────────────────────────────────────────
[OK] OpenSearch: connected (https://search.example.com)
     └ Logs: ✓  Metrics: ✓  Traces: ✓
[INFO] No local Docker stack needed — using remote OpenSearch
```

### Init Failure (Actionable)

```
$ codeharness init

── Dependencies ───────────────────────────────────────────────
[OK] Docker: running
[FAIL] Showboat: not found
       → Install: pip install showboat
       → Or: uv tool install showboat
[OK] OTLP: Node.js packages installed

── Observability ──────────────────────────────────────────────
[WARN] Port 9428 already in use
       → Shared stack may be running from another project
       → Check: docker compose -p codeharness-shared ps
       → Or use remote: codeharness init --opensearch-url <url>
```

## Command UX: `codeharness verify --story <id>`

### During Verification (Streaming)

```
$ codeharness verify --story 3-2

[INFO] Story: 3-2-bmad-installation-workflow-patching (12 ACs)
[INFO] Preparing verification container...
[OK] Container: codeharness-verify ready
[OK] Clean workspace: /tmp/codeharness-verify-3-2/

Verifying ACs:
  AC  1: ✓ BMAD installs via npx bmad-method install
  AC  2: ✓ _bmad/ directory created with correct structure
  AC  3: ✓ BMAD version detected from module.yaml
  AC  4: ◆ Running... (docker exec codeharness-verify codeharness init)
```

### Verification Complete

```
  AC 12: ✓ Re-run detects existing install and verifies patches

[OK] Story 3-2: 12/12 ACs verified
[OK] Proof: verification/3-2-proof.md
[OK] Sprint status: 3-2 → done

Duration: 14m | Cost: $3.80
```

### Verification Failed

```
  AC  4: ✗ FAIL — status --check-docker exit 1
         Output: "[FAIL] VictoriaMetrics stack: not running"
  AC  5: ✓ Query endpoints accessible
  ...
  AC 12: ✓ Re-run verifies patches

[FAIL] Story 2-3: 5/7 ACs verified, 1 failed, 1 escalated
[INFO] Proof: verification/2-3-proof.md (partial)
[INFO] Story returned to in-progress for dev fix

→ Run: codeharness status --story 2-3 for failure details
```

## Proof Document UX

### Standard Proof (Docker Exec)

```markdown
## AC 1: BMAD installs via npx

​```bash
docker exec codeharness-verify npx bmad-method install --yes --tools claude-code
​```

​```output
Installing BMAD Core agents and tools...
✓ Installed to _bmad/
​```

**Verdict:** PASS
```

### Agent-Browser Proof (Web App)

```markdown
## AC 3: Login page renders and accepts credentials

​```bash
docker exec codeharness-verify agent-browser navigate http://localhost:3000/login
​```

​```output
Navigated to http://localhost:3000/login (200 OK)
Page title: "Login — MyApp"
​```

![Login page](screenshots/ac3-login-before.png)

​```bash
docker exec codeharness-verify agent-browser click "[ref=email-input]"
docker exec codeharness-verify agent-browser type "test@example.com"
docker exec codeharness-verify agent-browser click "[ref=submit-btn]"
​```

​```output
Clicked ref=email-input
Typed "test@example.com"
Clicked ref=submit-btn
Navigation: /login → /dashboard (302)
​```

![After login](screenshots/ac3-login-after.png)

**Verdict:** PASS — redirect to /dashboard confirms authentication
```

### OpenSearch Evidence

```markdown
## AC 5: Runtime logs captured in OpenSearch

​```bash
curl -s 'https://search.example.com/codeharness-logs/_search' \
  -H 'Content-Type: application/json' \
  -d '{"query":{"match":{"service":"codeharness-verify"}},"size":5}'
​```

​```output
{"hits":{"total":{"value":23},"hits":[
  {"_source":{"timestamp":"2026-03-18T03:42:15Z","level":"info","message":"init complete","service":"codeharness-verify"}},
  ...
]}}
​```

**Verdict:** PASS — 23 log entries from verification session
```

## Hook Interaction Patterns

### PreToolUse: Commit Gate (Specific)

```json
{
  "decision": "block",
  "reason": "Cannot commit — 2 quality gates not met:\n\n  ✗ tests_passed: false → Run: npm test\n  ✗ coverage_met: false → Run: npm test -- --coverage\n\nAfter tests pass:\n  → codeharness state set tests_passed true\n  → codeharness state set coverage_met true"
}
```

### PostToolUse: After Test Run

```json
{
  "message": "Tests completed. Next steps:\n  → Query logs: curl 'localhost:9428/select/logsql/query?query=_stream:{service=\"codeharness\"}&limit=5'\n  → Update flag: codeharness state set tests_passed true\n  → Check coverage: npm test -- --coverage"
}
```

### SessionStart: Health Check

```json
{
  "message": "Harness health: OK\n  Docker: running (shared stack)\n  Sprint: 17/65 done\n  Current: 3-3 verifying\n  Session flags: reset"
}
```

## Design Principles

1. **One screen, full picture.** `codeharness status` shows everything — project state, active run, results, action items. No scrolling through multiple files.
2. **Progressive detail.** Status → story drill-down → proof document. Each level adds depth without repeating the previous level.
3. **Failures are specific.** Never "exit code 124". Always: story, AC, command, output, reason, suggested fix.
4. **Live visibility.** `--live` shows what's happening in real time. Background mode writes to a status file that `codeharness status` reads.
5. **Actionable everything.** Every `[FAIL]` has a `→` remedy. Every blocked story has a reason. Every action item has context.
6. **Project-agnostic.** The same UX works for CLI tools, web apps, libraries, plugins. Verification approach changes, output format doesn't.
7. **JSON everywhere.** `--json` on every command for programmatic consumption. Same information, machine-readable.
8. **Dense over verbose.** One `[OK]` line per completed step. Summaries, not paragraphs. The user is a senior developer, not a novice.
