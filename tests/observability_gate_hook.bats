#!/usr/bin/env bats
# Integration tests for observability gate in pre-commit-gate.sh
# Tests Story 2.2: hook blocks/allows based on observability coverage.

load test_helper

HOOKS_DIR="$PROJECT_ROOT/hooks"

setup() {
    setup_test_dir
}

teardown() {
    teardown_test_dir
}

# Helper: create state file with all quality gates passing
create_passing_state() {
    mkdir -p "$TEST_DIR/.claude"
    cat > "$TEST_DIR/.claude/codeharness.local.md" << EOF
---
harness_version: "0.1.0"
initialized: true
stack: nodejs
session_flags:
  tests_passed: true
  coverage_met: true
  verification_run: true
---
EOF
}

# Helper: create sprint-state.json with observability coverage
create_obs_state() {
    local static_pct="${1:-85}"
    local static_target="${2:-80}"
    cat > "$TEST_DIR/sprint-state.json" << EOF
{
  "version": 1,
  "observability": {
    "static": {
      "coveragePercent": ${static_pct},
      "lastScanTimestamp": "2026-03-20T10:00:00.000Z",
      "history": []
    },
    "targets": {
      "staticTarget": ${static_target}
    }
  }
}
EOF
}

# ============================================================
# Hook allows commit when observability passes
# ============================================================

@test "pre-commit-gate: allows when quality gates pass and no HARNESS_CLI" {
    create_passing_state
    # No HARNESS_CLI available — should fail open
    run bash -c 'echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -m test\"}}" | bash '"$HOOKS_DIR/pre-commit-gate.sh"
    [ "$status" -eq 0 ]
    [[ "$output" == *'"decision": "allow"'* ]]
}

# ============================================================
# Hook fails open when CLI not available
# ============================================================

@test "pre-commit-gate: fails open when HARNESS_CLI is not available" {
    create_passing_state
    # Set HARNESS_CLI to non-existent path
    export HARNESS_CLI="/nonexistent/path/codeharness"
    run bash -c 'echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -m test\"}}" | HARNESS_CLI=/nonexistent/path/codeharness bash '"$HOOKS_DIR/pre-commit-gate.sh"
    [ "$status" -eq 0 ]
    [[ "$output" == *'"decision": "allow"'* ]]
}

# ============================================================
# Hook blocks commit when quality gates fail (existing behavior preserved)
# ============================================================

@test "pre-commit-gate: still blocks when tests_passed is false" {
    mkdir -p "$TEST_DIR/.claude"
    cat > "$TEST_DIR/.claude/codeharness.local.md" << EOF
---
harness_version: "0.1.0"
initialized: true
session_flags:
  tests_passed: false
  coverage_met: true
  verification_run: true
---
EOF
    run bash -c 'echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -m test\"}}" | bash '"$HOOKS_DIR/pre-commit-gate.sh"
    [ "$status" -eq 2 ]
    [[ "$output" == *'"decision": "block"'* ]]
}

# ============================================================
# Hook completes within performance budget
# ============================================================

@test "pre-commit-gate: completes within 2s (observability section included)" {
    create_passing_state
    create_obs_state 85 80
    local start_ms=$(($(date +%s) * 1000 + $(date +%N 2>/dev/null | head -c 3 || echo 0)))
    run bash -c 'echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -m test\"}}" | bash '"$HOOKS_DIR/pre-commit-gate.sh"
    local end_ms=$(($(date +%s) * 1000 + $(date +%N 2>/dev/null | head -c 3 || echo 0)))
    local elapsed=$((end_ms - start_ms))
    [ "$status" -eq 0 ]
    [ "$elapsed" -lt 2000 ]
}
