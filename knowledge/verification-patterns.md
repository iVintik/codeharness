---
description: How to verify different types of acceptance criteria — UI, API, Database, Log. Patterns for Docker-based blind verification using verification guides.
---

# Verification Patterns

Verification is done via Docker-based blind verification using verification guides.

## UI Verification (agent-browser)

Use agent-browser to interact with the UI like a real user.

### Steps
1. Navigate to the feature URL
2. Use accessibility-tree refs to find elements (not CSS selectors)
3. Interact: click, fill, wait for state changes
4. Capture annotated screenshots
5. Diff before/after states if needed

### Fallback (NFR15)
If agent-browser is unavailable:
```
[WARN] agent-browser unavailable, UI verification skipped
```
Note the skip in the proof document. Do NOT fabricate UI evidence.

## API Verification (curl)

Use real HTTP calls to verify API behavior.

### Steps
1. Make the API call with curl
2. Check BOTH status code AND response body
3. Verify side effects (database state, events emitted)

### What to Check
- Status code matches expected (201 for create, 200 for get, etc.)
- Response body contains expected fields
- Side effects happened (check DB, check logs)

## Database Verification (DB MCP)

Use DB MCP for read-only queries to confirm state.

### Steps
1. Query the database for expected state
2. Confirm rows exist, values match
3. Supports PostgreSQL, MySQL, SQLite (NFR11)

## Log/Trace Verification (VictoriaLogs)

Query VictoriaLogs to confirm runtime behavior.

### Steps
1. Query for expected log entries
2. Confirm trace IDs, event names, or error absence

### Example
```bash
# Check for expected log entry
curl 'localhost:9428/select/logsql/query?query=_msg:*item created*&start=5m'
# Expected: at least 1 log entry with item creation event

# Confirm no errors
curl 'localhost:9428/select/logsql/query?query=level:error&start=5m'
# Expected: 0 results
```
