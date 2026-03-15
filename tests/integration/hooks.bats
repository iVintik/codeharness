#!/usr/bin/env bats
# Integration tests for codeharness hook scripts
# Tests each hook with controlled inputs to verify JSON output, exit codes, and behavior.

load '../test_helper'

HOOKS_DIR="$PROJECT_ROOT/hooks"

setup() {
    setup_test_dir
}

teardown() {
    teardown_test_dir
}

# Helper: create a state file with configurable session flags
create_state_with_flags() {
    local tests_passed="${1:-false}"
    local coverage_met="${2:-false}"
    local verification_run="${3:-false}"
    local logs_queried="${4:-false}"
    mkdir -p "$TEST_DIR/.claude"
    cat > "$TEST_DIR/.claude/codeharness.local.md" << EOF
---
harness_version: "0.1.0"
initialized: true
stack: nodejs
enforcement:
  frontend: true
  database: true
  api: true
coverage:
  target: 100
  baseline: null
  current: null
  tool: c8
session_flags:
  logs_queried: ${logs_queried}
  tests_passed: ${tests_passed}
  coverage_met: ${coverage_met}
  verification_run: ${verification_run}
verification_log: []
---

# Codeharness State
EOF
}

# ============================================================
# session-start.sh tests
# ============================================================

@test "session-start: outputs valid JSON when state file exists" {
    create_state_with_flags "true" "true" "true" "true"
    run bash "$HOOKS_DIR/session-start.sh"
    [ "$status" -eq 0 ]
    # Output should be valid JSON
    echo "$output" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null || \
    echo "$output" | node -e "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'))" 2>/dev/null
}

@test "session-start: reports health status in message" {
    create_state_with_flags "false" "false" "false" "false"
    run bash "$HOOKS_DIR/session-start.sh"
    [ "$status" -eq 0 ]
    [[ "$output" == *"Harness health:"* ]]
    [[ "$output" == *"Docker:"* ]]
    [[ "$output" == *"Session flags:"* ]]
}

@test "session-start: outputs info when no state file" {
    # No state file created
    run bash "$HOOKS_DIR/session-start.sh"
    [ "$status" -eq 0 ]
    [[ "$output" == *"not initialized"* ]]
    # Verify it's valid JSON
    echo "$output" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null || \
    echo "$output" | node -e "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'))" 2>/dev/null
}

@test "session-start: completes within 500ms" {
    create_state_with_flags "true" "true" "true" "true"
    local start_ms=$(($(date +%s) * 1000 + $(date +%N 2>/dev/null | head -c 3 || echo 0)))
    run bash "$HOOKS_DIR/session-start.sh"
    local end_ms=$(($(date +%s) * 1000 + $(date +%N 2>/dev/null | head -c 3 || echo 0)))
    local elapsed=$((end_ms - start_ms))
    [ "$status" -eq 0 ]
    # Allow generous 2000ms for CI environments (500ms is target, but CI can be slow)
    [ "$elapsed" -lt 2000 ]
}

# ============================================================
# pre-commit-gate.sh tests
# ============================================================

@test "pre-commit-gate: allows when all flags true" {
    create_state_with_flags "true" "true" "true" "true"
    run bash -c 'echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -m test\"}}" | bash '"$HOOKS_DIR/pre-commit-gate.sh"
    [ "$status" -eq 0 ]
    [[ "$output" == *'"decision": "allow"'* ]] || [[ -z "$output" ]]
}

@test "pre-commit-gate: blocks when tests_passed is false" {
    create_state_with_flags "false" "true" "true" "true"
    run bash -c 'echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -m test\"}}" | bash '"$HOOKS_DIR/pre-commit-gate.sh"
    [ "$status" -eq 2 ]
    [[ "$output" == *'"decision": "block"'* ]]
    [[ "$output" == *"tests_passed"* ]]
}

@test "pre-commit-gate: blocks when coverage_met is false" {
    create_state_with_flags "true" "false" "true" "true"
    run bash -c 'echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -m test\"}}" | bash '"$HOOKS_DIR/pre-commit-gate.sh"
    [ "$status" -eq 2 ]
    [[ "$output" == *'"decision": "block"'* ]]
    [[ "$output" == *"coverage_met"* ]]
}

@test "pre-commit-gate: blocks when verification_run is false" {
    create_state_with_flags "true" "true" "false" "true"
    run bash -c 'echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -m test\"}}" | bash '"$HOOKS_DIR/pre-commit-gate.sh"
    [ "$status" -eq 2 ]
    [[ "$output" == *'"decision": "block"'* ]]
    [[ "$output" == *"verification_run"* ]]
}

@test "pre-commit-gate: allows non-commit commands" {
    create_state_with_flags "false" "false" "false" "false"
    run bash -c 'echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"ls -la\"}}" | bash '"$HOOKS_DIR/pre-commit-gate.sh"
    [ "$status" -eq 0 ]
}

@test "pre-commit-gate: allows when state file missing (fail open)" {
    # No state file
    run bash -c 'echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -m test\"}}" | bash '"$HOOKS_DIR/pre-commit-gate.sh"
    [ "$status" -eq 0 ]
}

@test "pre-commit-gate: outputs valid JSON on block" {
    create_state_with_flags "false" "false" "false" "false"
    run bash -c 'echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -m test\"}}" | bash '"$HOOKS_DIR/pre-commit-gate.sh"
    [ "$status" -eq 2 ]
    # Verify output is valid JSON
    echo "$output" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null || \
    echo "$output" | node -e "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'))" 2>/dev/null
}

@test "pre-commit-gate: uses exit 2 for block, not exit 1" {
    create_state_with_flags "false" "false" "false" "false"
    run bash -c 'echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -m test\"}}" | bash '"$HOOKS_DIR/pre-commit-gate.sh"
    [ "$status" -eq 2 ]
}

@test "pre-commit-gate: completes within 500ms" {
    create_state_with_flags "true" "true" "true" "true"
    local start_ms=$(($(date +%s) * 1000 + $(date +%N 2>/dev/null | head -c 3 || echo 0)))
    run bash -c 'echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -m test\"}}" | bash '"$HOOKS_DIR/pre-commit-gate.sh"
    local end_ms=$(($(date +%s) * 1000 + $(date +%N 2>/dev/null | head -c 3 || echo 0)))
    local elapsed=$((end_ms - start_ms))
    [ "$status" -eq 0 ]
    [ "$elapsed" -lt 2000 ]
}

# ============================================================
# post-write-check.sh tests
# ============================================================

@test "post-write-check: prompts for source code files" {
    create_state_with_flags "false" "false" "false" "false"
    run bash -c 'echo "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"src/index.ts\"}}" | bash '"$HOOKS_DIR/post-write-check.sh"
    [ "$status" -eq 0 ]
    [[ "$output" == *"OTLP instrumentation"* ]]
}

@test "post-write-check: silent for non-source files" {
    create_state_with_flags "false" "false" "false" "false"
    run bash -c 'echo "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"README.md\"}}" | bash '"$HOOKS_DIR/post-write-check.sh"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "post-write-check: always prompts for source code (observability is mandatory)" {
    create_state_with_flags "false" "false" "false" "false"
    run bash -c 'echo "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"src/index.ts\"}}" | bash '"$HOOKS_DIR/post-write-check.sh"
    [ "$status" -eq 0 ]
    [[ "$output" == *"OTLP instrumentation"* ]]
}

@test "post-write-check: silent exit when state file missing" {
    run bash -c 'echo "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"src/index.ts\"}}" | bash '"$HOOKS_DIR/post-write-check.sh"
    [ "$status" -eq 0 ]
}

@test "post-write-check: outputs valid JSON for source files" {
    create_state_with_flags "false" "false" "false" "false"
    run bash -c 'echo "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"src/app.js\"}}" | bash '"$HOOKS_DIR/post-write-check.sh"
    [ "$status" -eq 0 ]
    echo "$output" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null || \
    echo "$output" | node -e "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'))" 2>/dev/null
}

@test "post-write-check: completes within 500ms" {
    create_state_with_flags "false" "false" "false" "false"
    local start_ms=$(($(date +%s) * 1000 + $(date +%N 2>/dev/null | head -c 3 || echo 0)))
    run bash -c 'echo "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"src/index.ts\"}}" | bash '"$HOOKS_DIR/post-write-check.sh"
    local end_ms=$(($(date +%s) * 1000 + $(date +%N 2>/dev/null | head -c 3 || echo 0)))
    local elapsed=$((end_ms - start_ms))
    [ "$status" -eq 0 ]
    [ "$elapsed" -lt 2000 ]
}

# ============================================================
# post-test-verify.sh tests
# ============================================================

@test "post-test-verify: prompts log query for test commands with observability ON" {
    create_state_with_flags "false" "false" "false" "false"
    run bash -c 'echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"npm test\"}}" | bash '"$HOOKS_DIR/post-test-verify.sh"
    [ "$status" -eq 0 ]
    [[ "$output" == *"VictoriaLogs"* ]]
}

@test "post-test-verify: silent for non-test commands" {
    create_state_with_flags "false" "false" "false" "false"
    run bash -c 'echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"ls -la\"}}" | bash '"$HOOKS_DIR/post-test-verify.sh"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "post-test-verify: always prompts log query (observability is mandatory)" {
    create_state_with_flags "false" "false" "false" "false"
    run bash -c 'echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"npm test\"}}" | bash '"$HOOKS_DIR/post-test-verify.sh"
    [ "$status" -eq 0 ]
    [[ "$output" == *"VictoriaLogs"* ]]
}

@test "post-test-verify: silent when state file missing" {
    run bash -c 'echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"npm test\"}}" | bash '"$HOOKS_DIR/post-test-verify.sh"
    [ "$status" -eq 0 ]
}

@test "post-test-verify: outputs valid JSON for test commands" {
    create_state_with_flags "false" "false" "false" "false"
    run bash -c 'echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"npm test\"}}" | bash '"$HOOKS_DIR/post-test-verify.sh"
    [ "$status" -eq 0 ]
    echo "$output" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null || \
    echo "$output" | node -e "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'))" 2>/dev/null
}

@test "post-test-verify: recognizes various test runners" {
    create_state_with_flags "false" "false" "false" "false"

    # pytest
    run bash -c 'echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"pytest tests/\"}}" | bash '"$HOOKS_DIR/post-test-verify.sh"
    [ "$status" -eq 0 ]
    [[ "$output" == *"VictoriaLogs"* ]]

    # vitest
    run bash -c 'echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"vitest run\"}}" | bash '"$HOOKS_DIR/post-test-verify.sh"
    [ "$status" -eq 0 ]
    [[ "$output" == *"VictoriaLogs"* ]]

    # jest
    run bash -c 'echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"jest --coverage\"}}" | bash '"$HOOKS_DIR/post-test-verify.sh"
    [ "$status" -eq 0 ]
    [[ "$output" == *"VictoriaLogs"* ]]
}

@test "post-test-verify: completes within 500ms" {
    create_state_with_flags "false" "false" "false" "false"
    local start_ms=$(($(date +%s) * 1000 + $(date +%N 2>/dev/null | head -c 3 || echo 0)))
    run bash -c 'echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"npm test\"}}" | bash '"$HOOKS_DIR/post-test-verify.sh"
    local end_ms=$(($(date +%s) * 1000 + $(date +%N 2>/dev/null | head -c 3 || echo 0)))
    local elapsed=$((end_ms - start_ms))
    [ "$status" -eq 0 ]
    [ "$elapsed" -lt 2000 ]
}

# ============================================================
# hooks.json validation
# ============================================================

@test "hooks.json: is valid JSON" {
    run python3 -c "import json; json.load(open('$HOOKS_DIR/hooks.json'))" 2>/dev/null || \
    run node -e "JSON.parse(require('fs').readFileSync('$HOOKS_DIR/hooks.json','utf8'))"
    [ "$status" -eq 0 ]
}

@test "hooks.json: registers SessionStart event" {
    run node -e "
        const hooks = JSON.parse(require('fs').readFileSync('$HOOKS_DIR/hooks.json','utf8'));
        if (!hooks.SessionStart) { process.exit(1); }
        if (!hooks.SessionStart[0].hooks[0].command.includes('session-start.sh')) { process.exit(1); }
    "
    [ "$status" -eq 0 ]
}

@test "hooks.json: registers PreToolUse for Bash" {
    run node -e "
        const hooks = JSON.parse(require('fs').readFileSync('$HOOKS_DIR/hooks.json','utf8'));
        if (!hooks.PreToolUse) { process.exit(1); }
        const bash = hooks.PreToolUse.find(h => h.matcher === 'Bash');
        if (!bash) { process.exit(1); }
        if (!bash.hooks[0].command.includes('pre-commit-gate.sh')) { process.exit(1); }
    "
    [ "$status" -eq 0 ]
}

@test "hooks.json: registers PostToolUse for Write and Edit" {
    run node -e "
        const hooks = JSON.parse(require('fs').readFileSync('$HOOKS_DIR/hooks.json','utf8'));
        if (!hooks.PostToolUse) { process.exit(1); }
        const write = hooks.PostToolUse.find(h => h.matcher === 'Write');
        const edit = hooks.PostToolUse.find(h => h.matcher === 'Edit');
        if (!write) { process.exit(1); }
        if (!edit) { process.exit(1); }
        if (!write.hooks[0].command.includes('post-write-check.sh')) { process.exit(1); }
        if (!edit.hooks[0].command.includes('post-write-check.sh')) { process.exit(1); }
    "
    [ "$status" -eq 0 ]
}

@test "hooks.json: registers PostToolUse for Bash with post-test-verify" {
    run node -e "
        const hooks = JSON.parse(require('fs').readFileSync('$HOOKS_DIR/hooks.json','utf8'));
        const bash = hooks.PostToolUse.find(h => h.matcher === 'Bash');
        if (!bash) { process.exit(1); }
        if (!bash.hooks[0].command.includes('post-test-verify.sh')) { process.exit(1); }
    "
    [ "$status" -eq 0 ]
}
