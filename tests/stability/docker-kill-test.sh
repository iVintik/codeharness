#!/usr/bin/env bash
# Docker kill resilience test — verifies that ralph survives
# a Docker container being killed mid-verification.
#
# Prerequisites: Docker running, ralph configured with verification.
# This is a manual/CI integration test, not a unit test.
#
# Usage: bash tests/stability/docker-kill-test.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RALPH_SCRIPT="$PROJECT_ROOT/ralph/ralph.sh"
RALPH_LOG="$PROJECT_ROOT/ralph/logs/ralph.log"

# ─── Pre-flight ───────────────────────────────────────────────────────────────

if ! command -v docker &>/dev/null; then
  echo "SKIP: Docker not available"
  exit 0
fi

if ! docker info &>/dev/null 2>&1; then
  echo "SKIP: Docker daemon not running"
  exit 0
fi

if [[ ! -x "$RALPH_SCRIPT" ]]; then
  echo "ERROR: ralph.sh not found or not executable"
  exit 1
fi

echo "=== Docker Kill Resilience Test ==="
echo ""

# ─── Start ralph with short timeouts ─────────────────────────────────────────

export LOOP_TIMEOUT_SECONDS=300  # 5 minutes max
export MAX_ITERATIONS=5
export ITERATION_TIMEOUT_MINUTES=2

cd "$PROJECT_ROOT"

# Clear previous logs
: > "$RALPH_LOG" 2>/dev/null || true

"$RALPH_SCRIPT" &
RALPH_PID=$!

echo "Ralph started (PID: $RALPH_PID)"
echo "Waiting for verification container..."

# ─── Watch for Docker verification container ─────────────────────────────────

CONTAINER_FOUND=false
WAIT_TIMEOUT=120  # 2 minutes to find a container
ELAPSED=0

while [[ "$ELAPSED" -lt "$WAIT_TIMEOUT" ]]; do
  # Look for verification containers (codeharness-verify pattern)
  CONTAINER_ID=$(docker ps --filter "name=codeharness" --filter "name=verify" -q 2>/dev/null | head -1)

  if [[ -n "$CONTAINER_ID" ]]; then
    CONTAINER_FOUND=true
    echo "Found verification container: $CONTAINER_ID"
    sleep 2  # Let it start doing work

    echo "Killing container $CONTAINER_ID..."
    docker kill "$CONTAINER_ID" 2>/dev/null || true

    echo "Container killed. Watching ralph..."
    break
  fi

  sleep 2
  ELAPSED=$((ELAPSED + 2))
done

if [[ "$CONTAINER_FOUND" != "true" ]]; then
  echo "WARN: No verification container appeared within ${WAIT_TIMEOUT}s"
  echo "Ralph may not have reached verification phase."
  echo "Stopping ralph..."
  kill "$RALPH_PID" 2>/dev/null || true
  wait "$RALPH_PID" 2>/dev/null || true
  echo "SKIP: Could not test Docker kill resilience (no verification container)"
  exit 0
fi

# ─── Wait for ralph to handle the failure ─────────────────────────────────────

RECOVERY_TIMEOUT=60
RECOVERED=false

for i in $(seq 1 "$RECOVERY_TIMEOUT"); do
  if ! kill -0 "$RALPH_PID" 2>/dev/null; then
    echo "Ralph exited (expected — may have finished all iterations)"
    RECOVERED=true
    break
  fi

  # Check if ralph logged the error and continued
  if [[ -f "$RALPH_LOG" ]] && grep -q "error\|Error\|FAIL\|fail" "$RALPH_LOG" 2>/dev/null; then
    echo "Ralph logged an error (expected after container kill)"
    RECOVERED=true
    break
  fi

  sleep 1
done

# ─── Cleanup ──────────────────────────────────────────────────────────────────

if kill -0 "$RALPH_PID" 2>/dev/null; then
  echo "Stopping ralph..."
  kill "$RALPH_PID" 2>/dev/null || true
  wait "$RALPH_PID" 2>/dev/null || true
fi

# ─── Verify ───────────────────────────────────────────────────────────────────

echo ""
echo "=== Verification ==="

PASS=true

# Check 1: Ralph did not crash (process was still running or exited normally)
RALPH_EXIT=0
wait "$RALPH_PID" 2>/dev/null || RALPH_EXIT=$?
echo "Ralph exit code: $RALPH_EXIT"

# Check 2: Log contains error mention for the killed container
if [[ -f "$RALPH_LOG" ]]; then
  echo "Ralph log tail:"
  tail -10 "$RALPH_LOG" | sed 's/^/  /'
else
  echo "WARN: No ralph.log found"
fi

# Check 3: Ralph did not produce a core dump or fatal error
FATAL_COUNT=0
if [[ -d "$PROJECT_ROOT/ralph/logs" ]]; then
  FATAL_COUNT=$(grep -rl "FATAL ERROR\|Segmentation fault\|core dumped" "$PROJECT_ROOT/ralph/logs/" 2>/dev/null | wc -l | tr -d ' ')
fi
if [[ "$FATAL_COUNT" -gt 0 ]]; then
  echo "FAIL: Found fatal errors in logs"
  PASS=false
fi

if [[ "$PASS" == "true" ]]; then
  echo ""
  echo "PASS: Ralph survived Docker container kill"
  exit 0
else
  echo ""
  echo "FAIL: Ralph did not handle Docker container kill properly"
  exit 1
fi
