#!/bin/bash
# codeharness: SessionStart hook
# Verify harness health and reset session flags.
# Must complete within 500ms (NFR1).
# Canonical pattern: valid JSON output always, fail open on errors.

# Error trap: always produce valid JSON, fail open
trap 'echo "{\"message\": \"[WARN] session-start hook failed: $BASH_COMMAND\"}"; exit 0' ERR

STATE_FILE=".claude/codeharness.local.md"

# Prefer globally installed CLI, fall back to plugin-local wrapper
if command -v codeharness >/dev/null 2>&1; then
  HARNESS_CLI="codeharness"
  CLI_SOURCE="global"
elif [ -x "${CLAUDE_PLUGIN_ROOT}/bin/codeharness" ]; then
  HARNESS_CLI="${CLAUDE_PLUGIN_ROOT}/bin/codeharness"
  CLI_SOURCE="plugin-local"
else
  HARNESS_CLI=""
  CLI_SOURCE="missing"
fi

# Check if harness is initialized
if [ ! -f "$STATE_FILE" ]; then
  echo '{"message": "[INFO] codeharness not initialized. Run /harness-init to set up."}'
  exit 0
fi

# Reset all session flags via CLI (single read-modify-write)
RESET_STATUS="reset"
if [ -n "$HARNESS_CLI" ]; then
  "$HARNESS_CLI" state reset-session --json >/dev/null 2>&1 || RESET_STATUS="failed"
else
  RESET_STATUS="failed"
fi

# Check Docker health (always — observability is mandatory)
DOCKER_STATUS="n/a"
if [ -n "$HARNESS_CLI" ]; then
  if "$HARNESS_CLI" status --check-docker --json >/dev/null 2>&1; then
    DOCKER_STATUS="running"
  else
    DOCKER_STATUS="stopped"
  fi
elif command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    DOCKER_STATUS="running"
  else
    DOCKER_STATUS="stopped"
  fi
else
  DOCKER_STATUS="not-installed"
fi

# Check agent-browser availability
BROWSER_STATUS="not-found"
if command -v agent-browser >/dev/null 2>&1; then
  BROWSER_STATUS="available"
fi

# Check beads readiness
BEADS_STATUS="not initialized"
if command -v bd >/dev/null 2>&1; then
  BEADS_READY=$(bd ready --json 2>/dev/null | head -c 200 || true)
  if [ -n "$BEADS_READY" ]; then
    TASK_COUNT=$(echo "$BEADS_READY" | grep -o '"id"' 2>/dev/null | wc -l | tr -d ' ')
    BEADS_STATUS="${TASK_COUNT} tasks ready"
  fi
fi

# Determine overall health
HEALTH="OK"
if [ "$DOCKER_STATUS" = "stopped" ] || [ "$RESET_STATUS" = "failed" ]; then
  HEALTH="WARN"
fi
if [ "$CLI_SOURCE" = "missing" ]; then
  HEALTH="WARN"
fi

# Build CLI status message
CLI_MSG="$CLI_SOURCE"
if [ "$CLI_SOURCE" = "missing" ]; then
  CLI_MSG="NOT FOUND — run: npm install -g codeharness"
fi

# Output health status JSON
echo "{\"message\": \"Harness health: ${HEALTH}\\n  CLI: ${CLI_MSG}\\n  Docker: ${DOCKER_STATUS}\\n  Beads: ${BEADS_STATUS}\\n  Browser: ${BROWSER_STATUS}\\n  Session flags: ${RESET_STATUS}\"}"
exit 0
