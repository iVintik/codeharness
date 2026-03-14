#!/bin/bash
# codeharness: SessionStart hook
# Verify harness health and reset session flags.
# Must complete within 500ms (NFR1).

set -euo pipefail

STATE_FILE=".claude/codeharness.local.md"

# Check if harness is initialized
if [ ! -f "$STATE_FILE" ]; then
  echo '{"message": "[INFO] codeharness not initialized. Run /harness-init to set up."}'
  exit 0
fi

# Reset session flags in state file
# Session flags track per-session verification state
if command -v sed >/dev/null 2>&1; then
  sed -i.bak \
    -e 's/logs_queried: true/logs_queried: false/' \
    -e 's/tests_passed: true/tests_passed: false/' \
    -e 's/coverage_met: true/coverage_met: false/' \
    -e 's/verification_run: true/verification_run: false/' \
    "$STATE_FILE" 2>/dev/null && rm -f "${STATE_FILE}.bak"
fi

# Check Docker and VictoriaMetrics health (only if observability enabled)
if grep -q 'observability: true' "$STATE_FILE" 2>/dev/null; then
  if ! docker info >/dev/null 2>&1; then
    echo '{"message": "[FAIL] Docker not running. Observability stack unavailable.\n→ Start Docker Desktop or Docker Engine"}'
    exit 0
  fi

  # Quick health check on VictoriaLogs
  if ! curl -sf --max-time 1 "http://localhost:9428/health" >/dev/null 2>&1; then
    echo '{"message": "[FAIL] VictoriaMetrics stack not responding.\n→ Run: docker compose -f docker-compose.harness.yml up -d"}'
    exit 0
  fi
fi

# Silent if all healthy
exit 0
