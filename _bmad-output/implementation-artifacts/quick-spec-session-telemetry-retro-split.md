---
type: quick-spec
status: proposed
date: 2026-04-03
source: run analysis action items 1, 4, and retro optimization
---

# Quick Spec: Session Telemetry + Epic-Level Retro Split

## Problem

Per-session LLM-generated retros cost $6-9 each and run every session (~20 sessions per sprint = $120-180 on retros alone). Most of that cost is the LLM re-reading code and generating prose. The actual data (what happened, what failed, what cost what) is already available from the engine.

## Solution: Telemetry + Retro as Workflow Tasks

Retro is not a special system — it's a workflow task like any other. The workflow YAML `scope` field controls when it runs.

### Workflow YAML

```yaml
tasks:
  implement:
    agent: dev
    scope: per-story
    session: fresh
    source_access: true
  verify:
    agent: evaluator
    scope: per-story
    session: fresh
    source_access: false
  telemetry:
    agent: null              # no LLM — engine writes structured data directly
    scope: per-story         # runs after each story completes
  retro:
    agent: analyst
    scope: per-epic          # runs once when all stories in an epic are done

flow:
  - implement
  - verify
  - loop:
      - retry
      - verify
```

### `agent: null` — Engine-Handled Tasks

When a task has `agent: null`, the workflow engine executes it directly without dispatching to any driver. This is for pure data collection tasks that need zero LLM tokens.

The `telemetry` task writes a structured JSON entry to `.codeharness/telemetry.jsonl` (append-only NDJSON):

```json
{
  "sessionId": "2026-04-03T00:25:00Z",
  "storyKey": "4-3-trace-id-generation-injection",
  "duration_ms": 5700000,
  "cost_usd": 6.42,
  "phases": ["verify"],
  "outcome": "done",
  "attempts": 1,
  "acResults": { "passed": 9, "failed": 0 },
  "filesChanged": ["src/lib/agents/trace.ts"],
  "testResults": { "passed": 31, "failed": 0, "coverage": 89.91 },
  "errors": [],
  "toolUsage": { "Edit": 12, "Read": 45, "Bash": 8, "Write": 3 },
  "codeReviewFindings": [
    { "severity": "HIGH", "story": "4-3", "issue": "generateTraceId accepted NaN" }
  ]
}
```

**Source data:** All from engine state — sprint-state.json, stream events, output contracts. Zero tokens.

### `scope: per-epic` — New Scope Level

The existing scope values are `per-story` and `per-run`. Adding `per-epic`:

- `per-story`: Task runs for each story (implement, verify, telemetry)
- `per-epic`: Task runs once when all stories in an epic reach `done` (retro)
- `per-run`: Task runs once per entire sprint run

The engine detects epic completion by checking: all stories in the epic are `done` AND the retro task hasn't run yet for this epic.

### Retro Task

The `retro` task dispatches to the `analyst` agent with `scope: per-epic`. The agent receives all telemetry entries for that epic's stories as context and produces the retrospective document. One LLM call per epic instead of 5-10 per-session retros.

## Additional Fixes Included

### Fix: verify flag setting (Item 1)

The workflow engine sets `tests_passed` and `coverage_met` flags after the dev task completes, before spawning the evaluator. The evaluator doesn't need to set them. This is based on the dev task's output contract which already contains test results and coverage.

### Fix: redundant coverage runs (Item 4)

Coverage runs during the dev phase only. The verify phase checks proof document quality — no coverage re-run. Coverage result is stored in the output contract so verify can reference it without re-running.

## Impact

- **Cost reduction:** ~$120-180/sprint saved on retro overhead
- **Data quality:** Structured telemetry is more reliable than LLM-generated summaries
- **Retro quality:** Epic retros have MORE data (all sessions) with LESS cost (one LLM call)
