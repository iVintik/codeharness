#!/bin/bash
# codeharness: PreToolUse hook for Bash tool
# Blocks git commit if quality gates haven't passed.
# Must complete within 500ms (NFR1).
# Canonical pattern: exit 0 = allow, exit 2 = intentional block, never exit 1.
# Always output valid JSON. Fail open on errors.

# Error trap: fail open on script errors — always produce valid JSON
trap 'echo "{\"decision\": \"allow\"}"; exit 0' ERR

STATE_FILE=".claude/codeharness.local.md"
HARNESS_CLI="${CLAUDE_PLUGIN_ROOT}/bin/codeharness"

# Read the hook input from stdin
HOOK_INPUT=$(cat)

# Only intercept git commit commands
COMMAND=$(echo "$HOOK_INPUT" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"command"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//' || true)

# Check if this is a git commit command
case "$COMMAND" in
  *"git commit"*|*"git -c"*"commit"*)
    ;;
  *)
    # Not a commit command, allow it
    exit 0
    ;;
esac

# If harness not initialized, allow (fail open)
if [ ! -f "$STATE_FILE" ]; then
  echo "[WARN] State file not found — allowing commit" >&2
  echo '{"decision": "allow"}'
  exit 0
fi

# Read state values using get_state helper
get_state() {
  local key="$1"
  local value
  value=$(sed -n '/^---$/,/^---$/p' "$STATE_FILE" | grep "^  ${key}:" | sed "s/^  ${key}: *//" || true)
  # Trim whitespace and quotes
  value=$(echo "$value" | tr -d '"' | tr -d "'" | xargs 2>/dev/null || echo "$value")
  echo "$value"
}

TESTS_PASSED=$(get_state "tests_passed")
COVERAGE_MET=$(get_state "coverage_met")
VERIFICATION_RUN=$(get_state "verification_run")

# Build failure report
FAILURES=""
FAIL_COUNT=0

if [ "$TESTS_PASSED" != "true" ]; then
  FAILURES="${FAILURES}\\n  tests_passed: ${TESTS_PASSED:-false}"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

if [ "$COVERAGE_MET" != "true" ]; then
  FAILURES="${FAILURES}\\n  coverage_met: ${COVERAGE_MET:-false}"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

if [ "$VERIFICATION_RUN" != "true" ]; then
  FAILURES="${FAILURES}\\n  verification_run: ${VERIFICATION_RUN:-false}"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

if [ "$FAIL_COUNT" -gt 0 ]; then
  # Build status line for all flags (show which passed and which failed)
  STATUS_LINE="\\n  tests_passed: ${TESTS_PASSED:-false}\\n  coverage_met: ${COVERAGE_MET:-false}\\n  verification_run: ${VERIFICATION_RUN:-false}"
  echo "{\"decision\": \"block\", \"reason\": \"Quality gates not met.${STATUS_LINE}\\n\\n-> Run tests before committing.\"}"
  exit 2
fi

# Check per-file coverage floor (80% minimum)
if [ -x "$HARNESS_CLI" ]; then
  PER_FILE_RESULT=$("$HARNESS_CLI" coverage --check-only --min-file 80 --json 2>/dev/null || true)
  if [ -n "$PER_FILE_RESULT" ]; then
    VIOLATION_COUNT=$(echo "$PER_FILE_RESULT" | grep -o '"violationCount"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*$' || echo "0")
    if [ "$VIOLATION_COUNT" -gt 0 ]; then
      echo "{\"decision\": \"block\", \"reason\": \"${VIOLATION_COUNT} file(s) below 80% statement coverage.\\n\\n-> Run: codeharness coverage --min-file 80\\n-> Fix uncovered files before committing.\"}"
      exit 2
    fi
  fi
fi

echo '{"decision": "allow"}'
exit 0
