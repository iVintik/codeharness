#!/bin/bash
# codeharness: PreToolUse hook for Bash tool
# Blocks git commit if quality gates haven't passed.
# Must complete within 500ms (NFR1).

set -euo pipefail

# Read the hook input from stdin
HOOK_INPUT=$(cat)

# Only intercept git commit commands
COMMAND=$(echo "$HOOK_INPUT" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"command"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//')

# Check if this is a git commit command
case "$COMMAND" in
  *"git commit"*|*"git -c"*"commit"*)
    ;;
  *)
    # Not a commit command, allow it
    exit 0
    ;;
esac

STATE_FILE=".claude/codeharness.local.md"

# If harness not initialized, allow
if [ ! -f "$STATE_FILE" ]; then
  exit 0
fi

BLOCKED=""

# Check if tests passed
if grep -q 'tests_passed: false' "$STATE_FILE" 2>/dev/null; then
  BLOCKED="${BLOCKED}\n- Tests not run or failing"
fi

# Check if coverage met
if grep -q 'coverage_met: false' "$STATE_FILE" 2>/dev/null; then
  BLOCKED="${BLOCKED}\n- Test coverage not at 100%"
fi

if [ -n "$BLOCKED" ]; then
  echo "{\"message\": \"[BLOCKED] Commit blocked — quality gates not passed.${BLOCKED}\n\n→ Run tests and achieve 100% coverage before committing\"}"
  exit 1
fi

exit 0
