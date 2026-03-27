## WHY

Stories were marked "done" with no proof artifact, or with proofs that only
grepped source code instead of exercising the feature at the appropriate
verification tier. This patch mandates tier-appropriate proof documents,
verification tags per AC, and test coverage targets — preventing regressions
from being hidden behind inadequate evidence.
(FR33, FR36, NFR20)

## Verification Requirements

Every story must produce a **proof document** with evidence appropriate to its verification tier.

### Proof Standard

- Proof document at `verification/<story-key>-proof.md`
- Each AC gets a `## AC N:` section with tier-appropriate evidence and captured output
- `[FAIL]` = AC failed with evidence showing what went wrong
- `[ESCALATE]` = AC genuinely cannot be automated (last resort — try everything first)

**Tier-dependent evidence rules:**

- **`test-provable`** — Evidence comes from build + test output + grep/read of code or artifacts. Run `npm test` or `npm run build`, capture results. Source-level assertions are the primary verification method. No running app or Docker required.
- **`runtime-provable`** — Evidence comes from running the actual binary/server and interacting with it. Start the process, make requests or run commands, capture stdout/stderr/exit codes. No Docker stack required.
- **`environment-provable`** — Evidence comes from `docker exec` commands and observability queries. Full Docker verification environment required. Each AC section needs at least one `docker exec`, `docker ps/logs`, or observability query. Evidence must come from running the installed CLI/tool in Docker, not from grepping source.
- **`escalate`** — Human judgment required. Document why automation is not possible. `[ESCALATE]` verdict is expected.

### Verification Tags

For each AC, append a tag indicating its verification tier:
- `<!-- verification: test-provable -->` — Can be verified by building and running tests. Evidence: build output, test results, grep/read of code. No running app needed.
- `<!-- verification: runtime-provable -->` — Requires running the actual binary/CLI/server. Evidence: process output, HTTP responses, exit codes. No Docker stack needed.
- `<!-- verification: environment-provable -->` — Requires full Docker environment with observability. Evidence: `docker exec` commands, VictoriaLogs queries, multi-service interaction.
- `<!-- verification: escalate -->` — Cannot be automated. Requires human judgment, physical hardware, or paid external services.

**Decision criteria:**
1. Can you prove it with `npm test` or `npm run build` alone? → `test-provable`
2. Do you need to run the actual binary/server locally? → `runtime-provable`
3. Do you need Docker, external services, or observability? → `environment-provable`
4. Have you exhausted all automated approaches? → `escalate`

**Do not over-tag.** Most stories are `test-provable` or `runtime-provable`. Only use `environment-provable` when Docker infrastructure is genuinely needed. Only use `escalate` as a last resort.

### Observability Evidence

After each `docker exec` command (applicable to `environment-provable` stories), query the observability backend for log events from the last 30 seconds.
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
