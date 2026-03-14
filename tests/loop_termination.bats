#!/usr/bin/env bats
# Tests for Story 6.4: Loop Termination & Progress
# Verifies termination behavior and progress reporting

load test_helper

RALPH_SH="$BATS_TEST_DIRNAME/../ralph/ralph.sh"

setup() {
    setup_test_dir
    export HARNESS_STATE_DIR="$TEST_DIR"

    # Source ralph.sh functions
    source "$RALPH_SH"

    # Initialize state paths
    LOG_DIR="$TEST_DIR/ralph/logs"
    STATUS_FILE="$TEST_DIR/ralph/status.json"
    LIVE_LOG_FILE="$TEST_DIR/ralph/live.log"
    CALL_COUNT_FILE="$TEST_DIR/ralph/.call_count"
    TIMESTAMP_FILE="$TEST_DIR/ralph/.last_reset"
    PROGRESS_FILE="$TEST_DIR/ralph/progress.json"
    PROMPT_FILE="$TEST_DIR/.ralph/PROMPT.md"
    mkdir -p "$TEST_DIR/ralph/logs" "$TEST_DIR/.ralph"

    echo "0" > "$CALL_COUNT_FILE"
}

teardown() {
    teardown_test_dir
}

# ─── Task completion detection ────────────────────────────────────────────

@test "all_tasks_complete detects when all tasks are done" {
    cat > "$PROGRESS_FILE" << 'EOF'
{"tasks": [
    {"id": "1.1", "status": "complete"},
    {"id": "1.2", "status": "complete"}
]}
EOF
    all_tasks_complete
}

@test "all_tasks_complete returns false with pending tasks" {
    cat > "$PROGRESS_FILE" << 'EOF'
{"tasks": [
    {"id": "1.1", "status": "complete"},
    {"id": "1.2", "status": "pending"}
]}
EOF
    ! all_tasks_complete
}

@test "all_tasks_complete returns false with in_progress tasks" {
    cat > "$PROGRESS_FILE" << 'EOF'
{"tasks": [
    {"id": "1.1", "status": "complete"},
    {"id": "1.2", "status": "in_progress"}
]}
EOF
    ! all_tasks_complete
}

# ─── Status file tracks termination ──────────────────────────────────────

@test "update_status records exit reason" {
    update_status 10 5 "all_complete" "completed" "all_tasks_done"
    local exit_reason
    exit_reason=$(jq -r '.exit_reason' "$STATUS_FILE")
    [[ "$exit_reason" == "all_tasks_done" ]]
}

@test "update_status records max_iterations exit" {
    update_status 50 100 "max_iterations" "stopped" "max_iterations_reached"
    local status
    status=$(jq -r '.status' "$STATUS_FILE")
    [[ "$status" == "stopped" ]]
    local reason
    reason=$(jq -r '.exit_reason' "$STATUS_FILE")
    [[ "$reason" == "max_iterations_reached" ]]
}

@test "update_status records timeout exit" {
    update_status 25 50 "timeout" "stopped" "loop_timeout"
    local reason
    reason=$(jq -r '.exit_reason' "$STATUS_FILE")
    [[ "$reason" == "loop_timeout" ]]
}

@test "update_status records circuit breaker halt" {
    update_status 15 30 "circuit_breaker" "halted" "stagnation_detected"
    local status
    status=$(jq -r '.status' "$STATUS_FILE")
    [[ "$status" == "halted" ]]
}

@test "update_status records cancellation" {
    update_status 8 20 "interrupted" "stopped" "user_cancelled"
    local reason
    reason=$(jq -r '.exit_reason' "$STATUS_FILE")
    [[ "$reason" == "user_cancelled" ]]
}

# ─── Progress tracking ───────────────────────────────────────────────────

@test "get_task_counts shows completed vs total" {
    cat > "$PROGRESS_FILE" << 'EOF'
{"tasks": [
    {"id": "1.1", "status": "complete"},
    {"id": "1.2", "status": "complete"},
    {"id": "2.1", "status": "pending"}
]}
EOF
    local counts
    counts=$(get_task_counts)
    [[ "$counts" == "3 2" ]]
}

@test "get_current_task returns next pending task" {
    cat > "$PROGRESS_FILE" << 'EOF'
{"tasks": [
    {"id": "1.1", "status": "complete"},
    {"id": "1.2", "status": "pending"},
    {"id": "2.1", "status": "pending"}
]}
EOF
    local task
    task=$(get_current_task)
    [[ "$task" == "1.2" ]]
}

@test "get_current_task returns in_progress before pending" {
    cat > "$PROGRESS_FILE" << 'EOF'
{"tasks": [
    {"id": "1.1", "status": "complete"},
    {"id": "1.2", "status": "in_progress"},
    {"id": "2.1", "status": "pending"}
]}
EOF
    local task
    task=$(get_current_task)
    [[ "$task" == "1.2" ]]
}

# ─── Status readable via harness-status ──────────────────────────────────

@test "status.json is valid JSON after update" {
    update_status 5 10 "executing" "running"
    jq '.' "$STATUS_FILE" > /dev/null
}

@test "status.json contains loop count and max_iterations" {
    MAX_ITERATIONS=50
    update_status 10 20 "running" "running"
    local max
    max=$(jq -r '.max_iterations' "$STATUS_FILE")
    [[ "$max" == "50" ]]
}

@test "status.json contains version for harness-status display" {
    update_status 1 0 "starting" "running"
    local version
    version=$(jq -r '.version' "$STATUS_FILE")
    [[ "$version" == "$VERSION" ]]
}

@test "status.json contains timestamp" {
    update_status 1 0 "starting" "running"
    local ts
    ts=$(jq -r '.timestamp' "$STATUS_FILE")
    [[ "$ts" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T ]]
}

# ─── Cleanup handler preserves state ─────────────────────────────────────

@test "cleanup function writes status" {
    loop_count=7
    echo "15" > "$CALL_COUNT_FILE"

    # Call cleanup directly (it calls exit, so we run in subshell)
    run bash -c "
        source '$RALPH_SH'
        STATUS_FILE='$STATUS_FILE'
        CALL_COUNT_FILE='$CALL_COUNT_FILE'
        LOG_DIR='$TEST_DIR/ralph/logs'
        loop_count=7
        cleanup
    "

    [[ -f "$STATUS_FILE" ]]
    local status
    status=$(jq -r '.status' "$STATUS_FILE")
    [[ "$status" == "stopped" ]]
}

# ─── Show help includes all termination options ──────────────────────────

@test "help shows max-iterations option" {
    run show_help
    [[ "$output" == *"--max-iterations"* ]]
}

@test "help shows timeout option" {
    run show_help
    [[ "$output" == *"--timeout"* ]]
}

@test "help shows reset-circuit option" {
    run show_help
    [[ "$output" == *"--reset-circuit"* ]]
}
