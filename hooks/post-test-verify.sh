#!/bin/bash
# codeharness: PostToolUse hook for Bash tool
# After test runs, prompts agent to query VictoriaLogs for errors.
# Must complete within 500ms (NFR1).

set -euo pipefail

STATE_FILE=".claude/codeharness.local.md"

# If harness not initialized or observability disabled, skip
if [ ! -f "$STATE_FILE" ]; then
  exit 0
fi

if ! grep -q 'observability: true' "$STATE_FILE" 2>/dev/null; then
  exit 0
fi

# Read hook input to check what command was run
HOOK_INPUT=$(cat)
COMMAND=$(echo "$HOOK_INPUT" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"command"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//')

# Only prompt after test commands
case "$COMMAND" in
  *"npm test"*|*"npm run test"*|*"pytest"*|*"jest"*|*"vitest"*|*"cargo test"*|*"go test"*)
    echo '{"message": "Query VictoriaLogs for errors: curl localhost:9428/select/logsql/query?query=level:error"}'
    ;;
  *)
    exit 0
    ;;
esac
