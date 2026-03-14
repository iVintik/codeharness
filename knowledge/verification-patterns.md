---
description: How to verify different types of acceptance criteria — UI, API, Database, Log. Patterns for the verifier subagent and agent-browser usage.
---

# Verification Patterns

## UI Verification (agent-browser)

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
