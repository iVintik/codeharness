#!/usr/bin/env bats
# Tests for codeharness vendored Ralph loop (Story 6.1)
# Verifies: script structure, CLI parsing, driver loading,
# progress tracking, circuit breaker, rate limiting, crash recovery

RALPH_SH="$BATS_TEST_DIRNAME/../ralph/ralph.sh"
DRIVER_SH="$BATS_TEST_DIRNAME/../ralph/drivers/claude-code.sh"

setup() {
    export TMPDIR="${BATS_TEST_TMPDIR:-/tmp}"
    TEST_DIR=$(mktemp -d)
    export TEST_DIR

    # Create minimal project structure
    mkdir -p "$TEST_DIR/.claude"
    mkdir -p "$TEST_DIR/ralph/logs"
    mkdir -p "$TEST_DIR/ralph/drivers"

    # Create fake prompt file
    echo "Test prompt" > "$TEST_DIR/.ralph_prompt.md"

    # Create minimal progress file
    cat > "$TEST_DIR/ralph/progress.json" << 'EOF'
{
    "tasks": [
        {"id": "US-001", "title": "Test story", "status": "pending"},
        {"id": "US-002", "title": "Second story", "status": "pending"}
    ]
}
EOF
}

teardown() {
    rm -rf "$TEST_DIR"
}

# ─── Script existence and structure ──────────────────────────────────────────

@test "ralph.sh exists" {
    [ -f "$RALPH_SH" ]
}

@test "ralph.sh is valid bash" {
    bash -n "$RALPH_SH"
}

@test "claude-code.sh driver exists" {
    [ -f "$DRIVER_SH" ]
}

@test "claude-code.sh driver is valid bash" {
    bash -n "$DRIVER_SH"
}

@test "lib/date_utils.sh exists and is valid" {
    local lib="$BATS_TEST_DIRNAME/../ralph/lib/date_utils.sh"
    [ -f "$lib" ]
    bash -n "$lib"
}

@test "lib/timeout_utils.sh exists and is valid" {
    local lib="$BATS_TEST_DIRNAME/../ralph/lib/timeout_utils.sh"
    [ -f "$lib" ]
    bash -n "$lib"
}

@test "lib/circuit_breaker.sh exists and is valid" {
    local lib="$BATS_TEST_DIRNAME/../ralph/lib/circuit_breaker.sh"
    [ -f "$lib" ]
    bash -n "$lib"
}

# ─── CLI parsing ─────────────────────────────────────────────────────────────

@test "ralph.sh --help exits 0" {
    run bash "$RALPH_SH" --help
    [ "$status" -eq 0 ]
    [[ "$output" == *"--plugin-dir"* ]]
}

@test "ralph.sh --help shows required options" {
    run bash "$RALPH_SH" --help
    [[ "$output" == *"--max-iterations"* ]]
    [[ "$output" == *"--timeout"* ]]
    [[ "$output" == *"--iteration-timeout"* ]]
    [[ "$output" == *"--calls"* ]]
    [[ "$output" == *"--live"* ]]
    [[ "$output" == *"--reset-circuit"* ]]
}

@test "ralph.sh fails without --plugin-dir" {
    run bash "$RALPH_SH"
    [ "$status" -ne 0 ]
    [[ "$output" == *"--plugin-dir"* ]]
}

@test "ralph.sh rejects unknown options" {
    run bash "$RALPH_SH" --bogus-flag
    [ "$status" -ne 0 ]
    [[ "$output" == *"Unknown option"* ]]
}

# ─── Driver functions ────────────────────────────────────────────────────────

@test "driver_name returns claude-code" {
    source "$DRIVER_SH"
    run driver_name
    [ "$output" = "claude-code" ]
}

@test "driver_display_name returns Claude Code" {
    source "$DRIVER_SH"
    run driver_display_name
    [ "$output" = "Claude Code" ]
}

@test "driver_cli_binary returns claude" {
    source "$DRIVER_SH"
    run driver_cli_binary
    [ "$output" = "claude" ]
}

@test "driver_min_version returns a semver string" {
    source "$DRIVER_SH"
    run driver_min_version
    [[ "$output" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

@test "driver_valid_tools populates VALID_TOOL_PATTERNS" {
    source "$DRIVER_SH"
    driver_valid_tools
    [ ${#VALID_TOOL_PATTERNS[@]} -gt 0 ]
    [[ " ${VALID_TOOL_PATTERNS[*]} " == *" Write "* ]]
    [[ " ${VALID_TOOL_PATTERNS[*]} " == *" Read "* ]]
    [[ " ${VALID_TOOL_PATTERNS[*]} " == *" Bash "* ]]
}

@test "driver_build_command fails with missing prompt file" {
    source "$DRIVER_SH"
    CLAUDE_OUTPUT_FORMAT="json"
    CLAUDE_ALLOWED_TOOLS=""
    CLAUDE_USE_CONTINUE="false"
    run driver_build_command "/nonexistent/file.md" "" ""
    [ "$status" -ne 0 ]
    [[ "$output" == *"Prompt file not found"* ]]
}

@test "driver_build_command populates CLAUDE_CMD_ARGS with prompt" {
    source "$DRIVER_SH"
    local prompt_file="$TEST_DIR/.ralph_prompt.md"
    CLAUDE_OUTPUT_FORMAT="json"
    CLAUDE_ALLOWED_TOOLS=""
    CLAUDE_USE_CONTINUE="false"

    driver_build_command "$prompt_file" "" ""
    [ ${#CLAUDE_CMD_ARGS[@]} -gt 0 ]
    [ "${CLAUDE_CMD_ARGS[0]}" = "claude" ]
    [[ " ${CLAUDE_CMD_ARGS[*]} " == *"--output-format"* ]]
}

@test "driver_build_command includes --plugin-dir when specified" {
    source "$DRIVER_SH"
    local prompt_file="$TEST_DIR/.ralph_prompt.md"
    CLAUDE_OUTPUT_FORMAT="json"
    CLAUDE_ALLOWED_TOOLS=""
    CLAUDE_USE_CONTINUE="false"

    driver_build_command "$prompt_file" "" "" "/path/to/plugin"
    [[ " ${CLAUDE_CMD_ARGS[*]} " == *"--plugin-dir"* ]]
    [[ " ${CLAUDE_CMD_ARGS[*]} " == *"/path/to/plugin"* ]]
}

@test "driver_build_command includes allowed tools" {
    source "$DRIVER_SH"
    local prompt_file="$TEST_DIR/.ralph_prompt.md"
    CLAUDE_OUTPUT_FORMAT="json"
    CLAUDE_ALLOWED_TOOLS="Write,Read,Edit"
    CLAUDE_USE_CONTINUE="false"

    driver_build_command "$prompt_file" "" ""
    [[ " ${CLAUDE_CMD_ARGS[*]} " == *"--allowedTools"* ]]
    [[ " ${CLAUDE_CMD_ARGS[*]} " == *"Write"* ]]
    [[ " ${CLAUDE_CMD_ARGS[*]} " == *"Read"* ]]
    [[ " ${CLAUDE_CMD_ARGS[*]} " == *"Edit"* ]]
}

@test "driver_build_command includes loop context as system prompt" {
    source "$DRIVER_SH"
    local prompt_file="$TEST_DIR/.ralph_prompt.md"
    CLAUDE_OUTPUT_FORMAT="json"
    CLAUDE_ALLOWED_TOOLS=""
    CLAUDE_USE_CONTINUE="false"

    driver_build_command "$prompt_file" "Loop #5. Current task: US-001." ""
    [[ " ${CLAUDE_CMD_ARGS[*]} " == *"--append-system-prompt"* ]]
    [[ " ${CLAUDE_CMD_ARGS[*]} " == *"Loop #5"* ]]
}

# ─── Progress tracking ──────────────────────────────────────────────────────

@test "get_current_task reads first pending task" {
    source "$RALPH_SH"
    PROGRESS_FILE="$TEST_DIR/ralph/progress.json"

    run get_current_task
    [ "$status" -eq 0 ]
    [ "$output" = "US-001" ]
}

@test "get_current_task returns empty when no progress file" {
    source "$RALPH_SH"
    PROGRESS_FILE="$TEST_DIR/nonexistent.json"

    run get_current_task
    [ "$status" -ne 0 ]
    [ -z "$output" ]
}

@test "mark_task_complete updates task status" {
    source "$RALPH_SH"
    PROGRESS_FILE="$TEST_DIR/ralph/progress.json"

    mark_task_complete "US-001"
    local status_val=$(jq -r '.tasks[0].status' "$PROGRESS_FILE")
    [ "$status_val" = "complete" ]

    # Second task still pending
    local status_val2=$(jq -r '.tasks[1].status' "$PROGRESS_FILE")
    [ "$status_val2" = "pending" ]
}

@test "all_tasks_complete returns false when tasks remain" {
    source "$RALPH_SH"
    PROGRESS_FILE="$TEST_DIR/ralph/progress.json"

    run all_tasks_complete
    [ "$status" -ne 0 ]
}

@test "all_tasks_complete returns true when all done" {
    source "$RALPH_SH"
    PROGRESS_FILE="$TEST_DIR/ralph/progress.json"

    # Mark both tasks complete
    mark_task_complete "US-001"
    mark_task_complete "US-002"

    run all_tasks_complete
    [ "$status" -eq 0 ]
}

@test "get_task_counts returns total and completed" {
    source "$RALPH_SH"
    PROGRESS_FILE="$TEST_DIR/ralph/progress.json"

    run get_task_counts
    [ "$output" = "2 0" ]

    mark_task_complete "US-001"
    run get_task_counts
    [ "$output" = "2 1" ]
}

# ─── Circuit breaker integration ────────────────────────────────────────────

@test "circuit breaker initializes in CLOSED state" {
    source "$RALPH_SH"
    export HARNESS_STATE_DIR="$TEST_DIR"
    CB_STATE_FILE="$TEST_DIR/.circuit_breaker_state"
    CB_HISTORY_FILE="$TEST_DIR/.circuit_breaker_history"

    init_circuit_breaker
    [ -f "$CB_STATE_FILE" ]

    local state=$(jq -r '.state' "$CB_STATE_FILE")
    [ "$state" = "CLOSED" ]
}

@test "circuit breaker opens after no-progress threshold" {
    source "$RALPH_SH"
    export HARNESS_STATE_DIR="$TEST_DIR"
    CB_STATE_FILE="$TEST_DIR/.circuit_breaker_state"
    CB_HISTORY_FILE="$TEST_DIR/.circuit_breaker_history"
    CB_NO_PROGRESS_THRESHOLD=3

    init_circuit_breaker

    # Record 3 loops with no progress
    record_loop_result 1 0 "false" 100 || true
    record_loop_result 2 0 "false" 100 || true
    record_loop_result 3 0 "false" 100 || true

    local state=$(jq -r '.state' "$CB_STATE_FILE")
    [ "$state" = "OPEN" ]
}

@test "circuit breaker resets to CLOSED" {
    source "$RALPH_SH"
    export HARNESS_STATE_DIR="$TEST_DIR"
    CB_STATE_FILE="$TEST_DIR/.circuit_breaker_state"
    CB_HISTORY_FILE="$TEST_DIR/.circuit_breaker_history"

    init_circuit_breaker
    reset_circuit_breaker "test reset"

    local state=$(jq -r '.state' "$CB_STATE_FILE")
    [ "$state" = "CLOSED" ]
}

# ─── Rate limiting ───────────────────────────────────────────────────────────

@test "can_make_call returns true when under limit" {
    source "$RALPH_SH"
    CALL_COUNT_FILE="$TEST_DIR/.call_count"
    TIMESTAMP_FILE="$TEST_DIR/.last_reset"
    MAX_CALLS_PER_HOUR=100

    echo "5" > "$CALL_COUNT_FILE"

    run can_make_call
    [ "$status" -eq 0 ]
}

@test "can_make_call returns false when at limit" {
    source "$RALPH_SH"
    CALL_COUNT_FILE="$TEST_DIR/.call_count"
    MAX_CALLS_PER_HOUR=10

    echo "10" > "$CALL_COUNT_FILE"

    run can_make_call
    [ "$status" -ne 0 ]
}

# ─── Date utilities ──────────────────────────────────────────────────────────

@test "get_iso_timestamp returns ISO format" {
    source "$BATS_TEST_DIRNAME/../ralph/lib/date_utils.sh"
    local ts=$(get_iso_timestamp)
    [[ "$ts" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T ]]
}

@test "get_epoch_seconds returns integer" {
    source "$BATS_TEST_DIRNAME/../ralph/lib/date_utils.sh"
    local epoch=$(get_epoch_seconds)
    [[ "$epoch" =~ ^[0-9]+$ ]]
}

# ─── Status file ─────────────────────────────────────────────────────────────

@test "update_status creates valid JSON" {
    source "$RALPH_SH"
    STATUS_FILE="$TEST_DIR/status.json"
    MAX_CALLS_PER_HOUR=100
    MAX_ITERATIONS=50

    update_status 5 10 "executing" "running"
    [ -f "$STATUS_FILE" ]

    # Validate JSON
    jq . "$STATUS_FILE" > /dev/null
    local loop=$(jq -r '.loop_count' "$STATUS_FILE")
    [ "$loop" -eq 5 ]
    local status=$(jq -r '.status' "$STATUS_FILE")
    [ "$status" = "running" ]
}

@test "update_status includes version" {
    source "$RALPH_SH"
    STATUS_FILE="$TEST_DIR/status.json"
    MAX_CALLS_PER_HOUR=100
    MAX_ITERATIONS=50

    update_status 1 0 "starting" "running"
    local version=$(jq -r '.version' "$STATUS_FILE")
    [ "$version" = "0.1.0" ]
}

# ─── Logging ─────────────────────────────────────────────────────────────────

@test "log_status writes to log file" {
    source "$RALPH_SH"
    LOG_DIR="$TEST_DIR/logs"
    mkdir -p "$LOG_DIR"

    log_status "INFO" "Test message"
    grep -q "Test message" "$LOG_DIR/ralph.log"
}

@test "log_status writes to stderr not stdout" {
    source "$RALPH_SH"
    LOG_DIR="$TEST_DIR/logs"
    mkdir -p "$LOG_DIR"

    local stdout_output
    stdout_output=$(log_status "INFO" "Test message" 2>/dev/null)
    [ -z "$stdout_output" ]
}
