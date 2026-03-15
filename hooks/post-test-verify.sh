#!/bin/bash
# codeharness: PostToolUse hook for Bash tool
# After test runs, prompts agent to query VictoriaLogs for errors.
# Must complete within 500ms (NFR1).
# Canonical pattern: valid JSON output always, fail open on errors.

# Error trap: fail open on script errors
trap 'exit 0' ERR

STATE_FILE=".claude/codeharness.local.md"

# Fail open: if harness not initialized, allow silently
if [ ! -f "$STATE_FILE" ]; then
  echo "[WARN] State file not found — skipping post-test check" >&2
  exit 0
fi

# Read hook input to check what command was run
HOOK_INPUT=$(cat)
# Extract command value; if extraction fails, allow silently (fail open)
COMMAND=$(echo "$HOOK_INPUT" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' 2>/dev/null | head -1 | sed 's/.*"command"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//' || true)

if [ -z "$COMMAND" ]; then
  # Could not parse command from hook input — fail open
  exit 0
fi

# Only act on test commands
case "$COMMAND" in
  *"npm test"*|*"npm run test"*|*"pytest"*|*"jest"*|*"vitest"*|*"cargo test"*|*"go test"*|*"bats "*)
    ;;
  *)
    # Not a test command, allow silently
    exit 0
    ;;
esac

# Create beads issue if bd is available and test output suggests failures
if command -v bd >/dev/null 2>&1; then
  # Check if hook input contains failure indicators
  TEST_OUTPUT=$(echo "$HOOK_INPUT" | grep -o '"output"[[:space:]]*:[[:space:]]*"[^"]*"' 2>/dev/null | head -1 || true)
  if echo "$TEST_OUTPUT" | grep -qiE '(fail|error|FAIL|ERROR)' 2>/dev/null; then
    GAP_ID="[gap:test-failure:$(date +%Y-%m-%d)]"
    # Dedup check: skip if issue with this gap-id already exists (fail open on slow bd list)
    # Timeout ensures hook stays within 500ms NFR — if bd list is slow, skip dedup and create
    if timeout 0.3 bd list --json 2>/dev/null | grep -qF "$GAP_ID" 2>/dev/null; then
      : # Issue already exists, skip creation
    else
      bd create "Test failures detected in session $(date +%Y-%m-%d)" --type bug --description "$GAP_ID" 2>/dev/null || true
    fi
  fi
fi

# Observability is ON — prompt agent to query logs
HARNESS_CLI="${CLAUDE_PLUGIN_ROOT}/bin/codeharness"
echo "{\"message\": \"Tests complete. Query VictoriaLogs for errors:\\n-> curl 'http://localhost:9428/select/logsql/query?query=level:error&start=5m'\\n-> Then run: ${HARNESS_CLI} state set session_flags.logs_queried true\"}"
exit 0
