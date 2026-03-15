#!/usr/bin/env bats
# Tests for ralph/ralph.sh core loop functionality
# Tests source ralph.sh functions without running main()

load test_helper

setup() {
    setup_test_dir
    export HARNESS_STATE_DIR="$TEST_DIR"

    # Source ralph.sh without running main (it guards with BASH_SOURCE check)
    source "$RALPH_DIR/ralph.sh"

    # Initialize state paths for testing
    LOG_DIR="$TEST_DIR/ralph/logs"
    STATUS_FILE="$TEST_DIR/ralph/status.json"
    LIVE_LOG_FILE="$TEST_DIR/ralph/live.log"
    CALL_COUNT_FILE="$TEST_DIR/ralph/.call_count"
    TIMESTAMP_FILE="$TEST_DIR/ralph/.last_reset"
    PROGRESS_FILE="$TEST_DIR/ralph/progress.json"
    PROMPT_FILE="$TEST_DIR/.ralph/PROMPT.md"
    mkdir -p "$TEST_DIR/ralph/logs" "$TEST_DIR/.ralph"
}

teardown() {
    teardown_test_dir
}

# ── Progress Tracking (sprint-status.yaml based) ──

@test "get_current_task returns empty (task picking by /harness-run skill)" {
    local task
    task=$(get_current_task)
    [[ -z "$task" ]]
}

@test "all_tasks_complete returns false when stories pending" {
    SPRINT_STATUS_FILE="$TEST_DIR/sprint-status.yaml"
    cat > "$SPRINT_STATUS_FILE" << 'EOF'
development_status:
  epic-1: in-progress
  1-1-first: done
  1-2-second: in-progress
EOF
    ! all_tasks_complete
}

@test "all_tasks_complete returns true when all stories done" {
    SPRINT_STATUS_FILE="$TEST_DIR/sprint-status.yaml"
    cat > "$SPRINT_STATUS_FILE" << 'EOF'
development_status:
  epic-1: done
  1-1-first: done
  1-2-second: done
EOF
    all_tasks_complete
}

@test "get_task_counts returns total and completed from sprint-status" {
    SPRINT_STATUS_FILE="$TEST_DIR/sprint-status.yaml"
    cat > "$SPRINT_STATUS_FILE" << 'EOF'
development_status:
  epic-1: in-progress
  1-1-first: done
  1-2-second: in-progress
EOF
    local counts
    counts=$(get_task_counts)
    [[ "$counts" == "2 1" ]]
}

@test "get_task_counts returns 0 0 without sprint-status file" {
    SPRINT_STATUS_FILE="$TEST_DIR/nonexistent.yaml"
    local counts
    counts=$(get_task_counts)
    [[ "$counts" == "0 0" ]]
}

# ── Rate Limiting ──

@test "init_call_tracking creates call count file" {
    init_call_tracking
    [[ -f "$CALL_COUNT_FILE" ]]
}

@test "can_make_call returns true when under limit" {
    echo "0" > "$CALL_COUNT_FILE"
    can_make_call
}

@test "can_make_call returns false when at limit" {
    echo "$MAX_CALLS_PER_HOUR" > "$CALL_COUNT_FILE"
    ! can_make_call
}

@test "init_call_tracking resets counter on new hour" {
    echo "50" > "$CALL_COUNT_FILE"
    echo "2020010100" > "$TIMESTAMP_FILE"  # Old hour
    init_call_tracking
    local count
    count=$(cat "$CALL_COUNT_FILE")
    [[ "$count" == "0" ]]
}

# ── Status Updates ──

@test "update_status creates valid JSON status file" {
    update_status 1 5 "executing" "running"
    [[ -f "$STATUS_FILE" ]]
    jq '.' "$STATUS_FILE" > /dev/null
}

@test "update_status contains expected fields" {
    update_status 3 10 "completed" "success" "all_done"
    local loop_count
    loop_count=$(jq -r '.loop_count' "$STATUS_FILE")
    [[ "$loop_count" == "3" ]]

    local status
    status=$(jq -r '.status' "$STATUS_FILE")
    [[ "$status" == "success" ]]

    local version
    version=$(jq -r '.version' "$STATUS_FILE")
    [[ "$version" == "$VERSION" ]]
}

# ── CLI Argument Parsing ──

@test "show_help outputs usage information" {
    run show_help
    [[ "$output" == *"--plugin-dir"* ]]
    [[ "$output" == *"--max-iterations"* ]]
}

# ── Driver Loading ──

@test "load_platform_driver loads claude-code driver" {
    PLATFORM_DRIVER="claude-code"
    load_platform_driver 2>/dev/null
    local name
    name=$(driver_name)
    [[ "$name" == "claude-code" ]]
}

@test "load_platform_driver fails for missing driver" {
    PLATFORM_DRIVER="nonexistent"
    run bash -c "source '$RALPH_DIR/ralph.sh' 2>/dev/null; PLATFORM_DRIVER=nonexistent; load_platform_driver" 2>/dev/null
    [[ $status -ne 0 ]]
}
