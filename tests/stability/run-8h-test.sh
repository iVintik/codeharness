#!/usr/bin/env bash
# Stability test harness for 8-hour ralph run.
# Invokes ralph/ralph.sh with stability parameters, monitors RSS,
# and produces a validation report at tests/stability/stability-report.md.
#
# Usage: bash tests/stability/run-8h-test.sh [--dry-run]
# Environment variables:
#   LOOP_TIMEOUT_SECONDS  — override loop timeout (default: 28800 = 8h)
#   MAX_ITERATIONS        — override max iterations (default: 500)
#   ITERATION_TIMEOUT_MINUTES — override per-iteration timeout (default: 30)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RALPH_SCRIPT="$PROJECT_ROOT/ralph/ralph.sh"
RSS_LOG="$SCRIPT_DIR/rss-samples.log"
REPORT_FILE="$SCRIPT_DIR/stability-report.md"

# Configuration
LOOP_TIMEOUT_SECONDS="${LOOP_TIMEOUT_SECONDS:-28800}"
MAX_ITERATIONS="${MAX_ITERATIONS:-500}"
ITERATION_TIMEOUT_MINUTES="${ITERATION_TIMEOUT_MINUTES:-30}"
RSS_SAMPLE_INTERVAL=60  # seconds
RSS_LIMIT_KB=102400     # 100MB in KB
LOG_SIZE_LIMIT_BYTES=$((50 * 1024 * 1024))  # 50MB per file
TOTAL_LOG_LIMIT_BYTES=$((2 * 1024 * 1024 * 1024))  # 2GB total

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

# ─── Pre-flight checks ───────────────────────────────────────────────────────

if [[ ! -x "$RALPH_SCRIPT" ]]; then
  echo "ERROR: ralph.sh not found or not executable at $RALPH_SCRIPT"
  exit 1
fi

# ─── RSS monitoring background loop ──────────────────────────────────────────

start_rss_monitor() {
  local pid="$1"
  : > "$RSS_LOG"  # truncate

  while kill -0 "$pid" 2>/dev/null; do
    local rss
    rss=$(ps -o rss= -p "$pid" 2>/dev/null || echo "0")
    rss="${rss// /}"
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $rss" >> "$RSS_LOG"
    sleep "$RSS_SAMPLE_INTERVAL"
  done
}

# ─── Run ralph ────────────────────────────────────────────────────────────────

echo "=== Stability Test ==="
echo "Timeout: ${LOOP_TIMEOUT_SECONDS}s | Max iterations: $MAX_ITERATIONS | Per-iteration: ${ITERATION_TIMEOUT_MINUTES}m"
echo "RSS limit: $((RSS_LIMIT_KB / 1024))MB | Log file limit: $((LOG_SIZE_LIMIT_BYTES / 1024 / 1024))MB"
echo "Report: $REPORT_FILE"
echo ""

START_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
RALPH_EXIT=0

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[DRY RUN] Would run ralph with LOOP_TIMEOUT_SECONDS=$LOOP_TIMEOUT_SECONDS MAX_ITERATIONS=$MAX_ITERATIONS"
  echo "[DRY RUN] Skipping actual run. Generating report from existing data."
else
  export LOOP_TIMEOUT_SECONDS MAX_ITERATIONS ITERATION_TIMEOUT_MINUTES
  cd "$PROJECT_ROOT"

  "$RALPH_SCRIPT" &
  RALPH_PID=$!

  # Start RSS monitor in background
  start_rss_monitor "$RALPH_PID" &
  RSS_MONITOR_PID=$!

  # Wait for ralph to finish
  wait "$RALPH_PID" || RALPH_EXIT=$?

  # Stop RSS monitor
  kill "$RSS_MONITOR_PID" 2>/dev/null || true
  wait "$RSS_MONITOR_PID" 2>/dev/null || true
fi

END_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# ─── Validation ───────────────────────────────────────────────────────────────

ERRORS=()
WARNINGS=()

# Check 1: No FATAL ERROR in logs
FATAL_COUNT=0
if [[ -d "$PROJECT_ROOT/ralph/logs" ]]; then
  FATAL_COUNT=$(grep -rl "FATAL ERROR\|heap out of memory" "$PROJECT_ROOT/ralph/logs/" 2>/dev/null | wc -l | tr -d ' ')
fi
if [[ "$FATAL_COUNT" -gt 0 ]]; then
  ERRORS+=("Found $FATAL_COUNT log files with FATAL ERROR or heap out of memory")
fi

# Check 2: sprint-state.json parseable
STATE_FILE="$PROJECT_ROOT/sprint-state.json"
if [[ -f "$STATE_FILE" ]]; then
  if ! jq '.' "$STATE_FILE" > /dev/null 2>&1; then
    ERRORS+=("sprint-state.json is not valid JSON")
  fi
else
  WARNINGS+=("sprint-state.json not found (may be expected for dry run)")
fi

# Check 3: RSS never exceeded limit
MAX_RSS=0
if [[ -f "$RSS_LOG" ]]; then
  while IFS=' ' read -r _ts rss; do
    rss="${rss// /}"
    if [[ -n "$rss" && "$rss" =~ ^[0-9]+$ && "$rss" -gt "$MAX_RSS" ]]; then
      MAX_RSS="$rss"
    fi
  done < "$RSS_LOG"
fi
if [[ "$MAX_RSS" -gt "$RSS_LIMIT_KB" ]]; then
  ERRORS+=("RSS exceeded limit: ${MAX_RSS}KB > ${RSS_LIMIT_KB}KB ($(( MAX_RSS / 1024 ))MB)")
fi

# Check 4: No individual log > 50MB
LARGE_LOGS=()
if [[ -d "$PROJECT_ROOT/ralph/logs" ]]; then
  while IFS= read -r logfile; do
    local_size=$(stat -f%z "$logfile" 2>/dev/null || stat -c%s "$logfile" 2>/dev/null || echo 0)
    if [[ "$local_size" -gt "$LOG_SIZE_LIMIT_BYTES" ]]; then
      LARGE_LOGS+=("$logfile ($(( local_size / 1024 / 1024 ))MB)")
    fi
  done < <(find "$PROJECT_ROOT/ralph/logs" -name "*.log" -type f 2>/dev/null)
fi
if [[ ${#LARGE_LOGS[@]} -gt 0 ]]; then
  ERRORS+=("${#LARGE_LOGS[@]} log files exceed 50MB: ${LARGE_LOGS[*]}")
fi

# Check 5: Total logs < 2GB
TOTAL_LOG_SIZE=0
if [[ -d "$PROJECT_ROOT/ralph/logs" ]]; then
  while IFS= read -r logfile; do
    local_size=$(stat -f%z "$logfile" 2>/dev/null || stat -c%s "$logfile" 2>/dev/null || echo 0)
    TOTAL_LOG_SIZE=$(( TOTAL_LOG_SIZE + local_size ))
  done < <(find "$PROJECT_ROOT/ralph/logs" -type f 2>/dev/null)
fi
if [[ "$TOTAL_LOG_SIZE" -gt "$TOTAL_LOG_LIMIT_BYTES" ]]; then
  ERRORS+=("Total log size exceeds 2GB: $(( TOTAL_LOG_SIZE / 1024 / 1024 ))MB")
fi

# Check 6: Log files have non-zero size
ZERO_LOGS=0
if [[ -d "$PROJECT_ROOT/ralph/logs" ]]; then
  ZERO_LOGS=$(find "$PROJECT_ROOT/ralph/logs" -name "claude_output_*.log" -empty 2>/dev/null | wc -l | tr -d ' ')
fi
if [[ "$ZERO_LOGS" -gt 0 ]]; then
  ERRORS+=("$ZERO_LOGS empty (0-byte) claude_output_*.log files found")
fi

# ─── Generate Report ──────────────────────────────────────────────────────────

LOG_COUNT=0
if [[ -d "$PROJECT_ROOT/ralph/logs" ]]; then
  LOG_COUNT=$(find "$PROJECT_ROOT/ralph/logs" -name "claude_output_*.log" -type f 2>/dev/null | wc -l | tr -d ' ')
fi

RESULT="PASS"
if [[ ${#ERRORS[@]} -gt 0 ]]; then
  RESULT="FAIL"
fi

cat > "$REPORT_FILE" << EOF
# Stability Test Report

**Result:** $RESULT
**Start:** $START_TIME
**End:** $END_TIME
**Ralph exit code:** $RALPH_EXIT

## Configuration

| Parameter | Value |
|-----------|-------|
| LOOP_TIMEOUT_SECONDS | $LOOP_TIMEOUT_SECONDS |
| MAX_ITERATIONS | $MAX_ITERATIONS |
| ITERATION_TIMEOUT_MINUTES | $ITERATION_TIMEOUT_MINUTES |

## Resource Usage

| Metric | Value | Limit |
|--------|-------|-------|
| Peak RSS | $((MAX_RSS / 1024))MB | $((RSS_LIMIT_KB / 1024))MB |
| Total log size | $((TOTAL_LOG_SIZE / 1024 / 1024))MB | $((TOTAL_LOG_LIMIT_BYTES / 1024 / 1024))MB |
| Log file count | $LOG_COUNT | - |
| Zero-byte logs | $ZERO_LOGS | 0 |
| Fatal errors in logs | $FATAL_COUNT | 0 |

## Validation Checks

EOF

if [[ ${#ERRORS[@]} -eq 0 ]]; then
  echo "All checks passed." >> "$REPORT_FILE"
else
  echo "### Errors" >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"
  for err in "${ERRORS[@]}"; do
    echo "- $err" >> "$REPORT_FILE"
  done
  echo "" >> "$REPORT_FILE"
fi

if [[ ${#WARNINGS[@]} -gt 0 ]]; then
  echo "### Warnings" >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"
  for warn in "${WARNINGS[@]}"; do
    echo "- $warn" >> "$REPORT_FILE"
  done
  echo "" >> "$REPORT_FILE"
fi

echo ""
echo "=== Stability Test Complete ==="
echo "Result: $RESULT"
echo "Report: $REPORT_FILE"

if [[ "$RESULT" == "FAIL" ]]; then
  echo ""
  echo "Errors:"
  for err in "${ERRORS[@]}"; do
    echo "  - $err"
  done
  exit 1
fi

exit 0
