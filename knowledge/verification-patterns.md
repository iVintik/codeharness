---
description: How to verify different types of acceptance criteria — UI, API, Database, Log. Includes the four-tier verification system and patterns for the verifier subagent and agent-browser usage.
---

# Verification Patterns

## Verification Tier Guide

Every acceptance criterion is assigned a **verification tier** that determines what evidence is needed to prove it works. The four tiers are:

### `test-provable`

**What it means:** The AC can be verified by building the project, running automated tests, and reading/grepping output or source artifacts.

**Evidence required:** Build output + test results + grep/read of generated files or code.

**No running app. No Docker.**

**Examples:**
- "Given a parser function, when called with valid input, then it returns the expected structure" — run unit tests
- "Given the config schema, when validated, then all required fields are present" — grep config, run tests
- "Given a new TypeScript type, when compiled, then no type errors" — `npm run build` succeeds

**Decision criteria:** Can you prove this AC by running `npm test` or `npm run build` and examining output? If yes, it is `test-provable`.

---

### `runtime-provable`

**What it means:** The AC requires running the actual binary, CLI, or server and interacting with it to verify behavior.

**Evidence required:** Build + run binary/server + interact + check output. No Docker stack needed.

**Examples:**
- "Given the CLI is invoked with `--help`, then it prints usage information" — run the CLI, check stdout
- "Given a POST to `/api/items`, then the response is 201 with the created item" — start server, make HTTP call
- "Given the tool processes a file, then it exits with code 0 and produces output" — run tool, check exit code and output

**Decision criteria:** Do you need to actually run the program (not just tests) to verify? But it works locally without Docker? Then it is `runtime-provable`.

---

### `environment-provable`

**What it means:** The AC requires a full Docker verification environment with `docker exec`, observability queries, or multi-service interaction.

**Evidence required:** `docker exec` commands, observability backend queries (VictoriaLogs, VictoriaMetrics), multi-container orchestration.

**Examples:**
- "Given the service is deployed, when a request is made, then logs appear in VictoriaLogs" — need Docker + observability stack
- "Given the worker connects to Redis, when a job is enqueued, then it is processed" — need Docker Compose with Redis
- "Given the full stack is running, when the user completes a workflow, then all services record traces" — full environment verification

**Decision criteria:** Do you need Docker, external services, or observability infrastructure to verify? Then it is `environment-provable`.

---

### `escalate`

**What it means:** The AC genuinely cannot be verified by automated means. Requires human judgment, physical hardware, or paid third-party services not available in the test environment.

**Evidence required:** Human review. Mark as escalated with justification.

**Examples:**
- "Given the email is sent, then it renders correctly in Outlook" — requires real email client
- "Given the payment is processed, then the charge appears on the credit card" — requires real payment gateway
- "Given the hardware sensor is connected, then readings are accurate" — requires physical device

**Decision criteria:** Have you exhausted all automated approaches? Is there genuinely no way to verify this without a human or external paid service? Only then use `escalate`. This tier is rare.

---

## UI Verification (agent-browser)

Typically `runtime-provable` or `environment-provable` depending on whether the UI requires a Docker stack.

Use agent-browser to interact with the UI like a real user.

### Steps
1. Navigate to the feature URL
2. Use accessibility-tree refs to find elements (not CSS selectors)
3. Interact: click, fill, wait for state changes
4. Capture annotated screenshots via `showboat image`
5. Diff before/after states if needed

### Example
```bash
# Navigate and screenshot
showboat exec "agent-browser navigate http://localhost:3000/feature"
showboat image "Initial state" --annotate

# Interact
showboat exec "agent-browser click 'Submit Button'"
showboat exec "agent-browser wait 'Success Message'"
showboat image "After submission" --annotate
```

### Fallback (NFR15)
If agent-browser is unavailable:
```
[WARN] agent-browser unavailable, UI verification skipped
```
Note the skip in the proof document. Do NOT fabricate UI evidence.

## API Verification (curl)

Typically `runtime-provable` (local server) or `environment-provable` (Docker-hosted service).

Use real HTTP calls to verify API behavior.

### Steps
1. Make the API call with curl
2. Check BOTH status code AND response body
3. Verify side effects (database state, events emitted)

### Example
```bash
# Make API call and capture full response
showboat exec "curl -s -w '\nHTTP_STATUS:%{http_code}' -X POST http://localhost:3000/api/items -H 'Content-Type: application/json' -d '{\"name\":\"test\"}'"

# Expected: HTTP_STATUS:201, body contains created item with ID
```

### What to Check
- Status code matches expected (201 for create, 200 for get, etc.)
- Response body contains expected fields
- Side effects happened (check DB, check logs)

## Database Verification (DB MCP)

Typically `environment-provable` — requires a running database instance.

Use DB MCP for read-only queries to confirm state.

### Steps
1. Query the database for expected state
2. Confirm rows exist, values match
3. Supports PostgreSQL, MySQL, SQLite (NFR11)

### Example
```bash
# Via DB MCP tool
showboat exec "SELECT id, name, status FROM items WHERE name = 'test'"
# Expected: 1 row with status = 'active'
```

## Log/Trace Verification (VictoriaLogs)

Typically `environment-provable` — requires the observability stack running in Docker.

Query VictoriaLogs to confirm runtime behavior.

### Steps
1. Query for expected log entries
2. Confirm trace IDs, event names, or error absence

### Example
```bash
# Check for expected log entry
showboat exec "curl 'localhost:9428/select/logsql/query?query=_msg:*item created*&start=5m'"
# Expected: at least 1 log entry with item creation event

# Confirm no errors
showboat exec "curl 'localhost:9428/select/logsql/query?query=level:error&start=5m'"
# Expected: 0 results
```
