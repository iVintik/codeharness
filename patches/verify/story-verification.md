## WHY

Stories were marked "done" with no proof artifact, or with proofs that only
grepped source code instead of exercising the feature. This patch mandates
proof documents with real evidence, and test coverage targets — preventing
regressions from being hidden behind inadequate evidence.
(FR33, FR36, NFR20)

## Verification Requirements

Every story must produce a **proof document** with real evidence from Docker-based blind verification.

### Proof Standard

- Proof document at `verification/<story-key>-proof.md`
- Each AC gets a `## AC N:` section with evidence and captured output
- `[FAIL]` = AC failed with evidence showing what went wrong
- `[ESCALATE]` = AC genuinely cannot be automated (last resort — try everything first)

### Observability Evidence

After each `docker exec` command, query the observability backend for log events from the last 30 seconds.
Use the configured VictoriaLogs endpoint (default: `http://localhost:9428`):

```bash
curl 'http://localhost:9428/select/logsql/query?query=_stream_id:*&start=-30s&limit=100'
```

- If log entries are returned, note the count in the AC section as runtime observability evidence.
- If **zero events** are returned, include `[OBSERVABILITY GAP]` in the AC section:
  `[OBSERVABILITY GAP] No log events detected for this user interaction`
- Every AC should produce at least one log entry when exercised. Gaps indicate silent code paths.
- If the observability backend is **not reachable** (connection refused, timeout), report
  "observability check skipped — backend not reachable" as a warning and do NOT fail the verification.
  The functional verification result stands on its own.

This ensures proof documents include both functional evidence (`docker exec` output) and
observability evidence (log query results or `[OBSERVABILITY GAP]` tags) for each AC.

The VictoriaLogs query pattern matches `verify-prompt.ts` Step 3.5 — see that template for
the full observability check instructions used by the automated verifier agent.

### Testing Requirements

- Unit tests for all new/changed code
- Coverage target: 100% of new/changed lines
- No skipped tests without justification
