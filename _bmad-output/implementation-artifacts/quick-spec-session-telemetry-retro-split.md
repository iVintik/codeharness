---
type: quick-spec
status: proposed
date: 2026-04-03
source: run analysis action items 1, 4, and retro optimization
---

# Quick Spec: Session Telemetry + Epic-Level Retro Split

## Problem

Per-session LLM-generated retros cost $6-9 each and run every session (~20 sessions per sprint = $120-180 on retros alone). Most of that cost is the LLM re-reading code and generating prose. The actual data (what happened, what failed, what cost what) is already available from the engine.

## Solution: Two-Layer Design

### Layer 1: Per-Session Telemetry (zero LLM tokens)

After each session completes, the workflow engine writes a structured JSON entry to `ralph/session-telemetry.jsonl` (append-only NDJSON):

```json
{
  "sessionId": "2026-04-03T00:25:00Z",
  "duration_ms": 5700000,
  "cost_usd": 6.42,
  "stories": [
    {
      "key": "4-3-trace-id-generation-injection",
      "phases": ["verify"],
      "outcome": "done",
      "attempts": 1,
      "acResults": { "passed": 9, "failed": 0 },
      "filesChanged": ["src/lib/agents/trace.ts", "src/lib/agents/trace.test.ts"],
      "testResults": { "passed": 31, "failed": 0, "coverage": 89.91 }
    }
  ],
  "errors": [],
  "retries": { "4-3-trace-id-generation-injection": 0 },
  "toolUsage": { "Edit": 12, "Read": 45, "Bash": 8, "Write": 3 },
  "codeReviewFindings": [
    { "severity": "HIGH", "story": "4-3", "issue": "generateTraceId accepted NaN/Infinity" }
  ]
}
```

**Source data:** All available from existing engine state — sprint-state.json, stream events, output contracts. No LLM needed.

### Layer 2: Epic-Level Retro (LLM, runs once per epic)

When an epic completes, the `/retrospective` workflow reads ALL session telemetry entries for that epic's stories and synthesizes:
- Pattern analysis (which stories had most retries, why)
- Cost analysis (which phases were most expensive)
- Code review finding patterns
- Action items for process improvement

This runs once per epic (not 5-10 times per epic as today).

### Configurable retro level

The workflow YAML gains a `retro_level` setting:
```yaml
# in workflow config or .codeharness settings
retro_level: epic    # Options: session (legacy), epic (default), sprint
```

- `session`: Full LLM retro after every session (legacy, expensive)
- `epic`: Telemetry per session, LLM retro per epic (recommended)
- `sprint`: Telemetry per session, LLM retro at sprint end only

## Additional Fixes Included

### Fix: verify flag setting (Item 1)

The workflow engine sets `tests_passed` and `coverage_met` flags after the dev task completes, before spawning the evaluator. The evaluator doesn't need to set them. This is based on the dev task's output contract which already contains test results and coverage.

### Fix: redundant coverage runs (Item 4)

Coverage runs during the dev phase only. The verify phase checks proof document quality — no coverage re-run. Coverage result is stored in the output contract so verify can reference it without re-running.

## Impact

- **Cost reduction:** ~$120-180/sprint saved on retro overhead
- **Data quality:** Structured telemetry is more reliable than LLM-generated summaries
- **Retro quality:** Epic retros have MORE data (all sessions) with LESS cost (one LLM call)
