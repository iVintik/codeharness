#!/usr/bin/env bats
# Tests for Story 0.2: Ralph Progress Display
# Tests poll_sprint_state_progress(), print_progress_summary() icons/cost,
# print_sprint_summary(), and startup noise suppression.

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
    STORY_RETRY_FILE="$TEST_DIR/ralph/.story_retries"
    FLAGGED_STORIES_FILE="$TEST_DIR/ralph/.flagged_stories"
    SPRINT_STATUS_FILE="$TEST_DIR/sprint-status.yaml"
    mkdir -p "$TEST_DIR/ralph/logs" "$TEST_DIR/.ralph"

    loop_start_time=$(date +%s)
    loop_count=1
}

teardown() {
    teardown_test_dir
}

# ── poll_sprint_state_progress() tests (AC #1) ──

@test "poll_sprint_state_progress prints update when story changes" {
    cat > "$TEST_DIR/sprint-state.json" << 'EOF'
{
  "run": {
    "active": true,
    "currentStory": "1-1-widget-api",
    "currentPhase": "implement",
    "lastAction": "Writing widget module",
    "acProgress": ""
  }
}
EOF
    cd "$TEST_DIR"
    reset_poll_state
    local output
    output=$(poll_sprint_state_progress 2>&1)
    [[ "$output" == *"Story 1-1-widget-api: implement (Writing widget module)"* ]]
}

@test "poll_sprint_state_progress detects phase change" {
    cat > "$TEST_DIR/sprint-state.json" << 'EOF'
{
  "run": {
    "currentStory": "1-1-widget-api",
    "currentPhase": "implement",
    "lastAction": "coding",
    "acProgress": ""
  }
}
EOF
    cd "$TEST_DIR"
    reset_poll_state

    # First call sets the state
    poll_sprint_state_progress 2>/dev/null

    # Change phase
    cat > "$TEST_DIR/sprint-state.json" << 'EOF'
{
  "run": {
    "currentStory": "1-1-widget-api",
    "currentPhase": "verify",
    "lastAction": "Running tests",
    "acProgress": "1/5"
  }
}
EOF
    local output
    output=$(poll_sprint_state_progress 2>&1)
    [[ "$output" == *"Story 1-1-widget-api: verify (Running tests)"* ]]
}

@test "poll_sprint_state_progress detects AC progress change" {
    cat > "$TEST_DIR/sprint-state.json" << 'EOF'
{
  "run": {
    "currentStory": "1-1-widget-api",
    "currentPhase": "verify",
    "lastAction": "AC check",
    "acProgress": "2/5"
  }
}
EOF
    cd "$TEST_DIR"
    # Set previous state to same story/phase but different AC
    PREV_STORY="1-1-widget-api"
    PREV_PHASE="verify"
    PREV_LAST_ACTION="AC check"
    PREV_AC_PROGRESS="1/5"

    local output
    output=$(poll_sprint_state_progress 2>&1)
    [[ "$output" == *"Story 1-1-widget-api: verify (AC 2/5)"* ]]
}

@test "poll_sprint_state_progress is silent when nothing changes" {
    cat > "$TEST_DIR/sprint-state.json" << 'EOF'
{
  "run": {
    "currentStory": "1-1-widget-api",
    "currentPhase": "implement",
    "lastAction": "coding",
    "acProgress": ""
  }
}
EOF
    cd "$TEST_DIR"
    PREV_STORY="1-1-widget-api"
    PREV_PHASE="implement"
    PREV_LAST_ACTION="coding"
    PREV_AC_PROGRESS=""

    local output
    output=$(poll_sprint_state_progress 2>&1)
    [[ -z "$output" ]]
}

@test "poll_sprint_state_progress handles missing sprint-state.json gracefully" {
    cd "$TEST_DIR"
    reset_poll_state
    # No sprint-state.json exists
    local output
    output=$(poll_sprint_state_progress 2>&1)
    [[ -z "$output" ]]
}

@test "poll_sprint_state_progress handles empty run fields" {
    cat > "$TEST_DIR/sprint-state.json" << 'EOF'
{
  "run": {}
}
EOF
    cd "$TEST_DIR"
    reset_poll_state
    local output
    output=$(poll_sprint_state_progress 2>&1)
    [[ -z "$output" ]]
}

@test "reset_poll_state clears tracking variables" {
    PREV_STORY="some-story"
    PREV_PHASE="verify"
    PREV_AC_PROGRESS="3/5"
    PREV_LAST_ACTION="action"

    reset_poll_state

    [[ -z "$PREV_STORY" ]]
    [[ -z "$PREV_PHASE" ]]
    [[ -z "$PREV_AC_PROGRESS" ]]
    [[ -z "$PREV_LAST_ACTION" ]]
}

# ── print_progress_summary() icon tests (AC #2) ──

@test "print_progress_summary shows ✓ for completed stories" {
    cat > "$SPRINT_STATUS_FILE" << 'EOF'
development_status:
  1-1-first: done
  1-2-second: in-progress
EOF
    local output
    output=$(print_progress_summary 2>&1)
    [[ "$output" == *"✓ 1-1-first"* ]]
}

@test "print_progress_summary shows ✗ for failed stories from sprint-state.json" {
    cat > "$SPRINT_STATUS_FILE" << 'EOF'
development_status:
  1-1-first: done
  1-2-second: in-progress
EOF
    cat > "$TEST_DIR/sprint-state.json" << 'EOF'
{
  "run": {
    "failed": ["1-2-second"]
  }
}
EOF
    cd "$TEST_DIR"
    local output
    output=$(print_progress_summary 2>&1)
    [[ "$output" == *"✗ 1-2-second"* ]]
}

@test "print_progress_summary shows ✕ for flagged/blocked stories" {
    cat > "$SPRINT_STATUS_FILE" << 'EOF'
development_status:
  1-1-first: done
  1-2-second: in-progress
  1-3-third: backlog
EOF
    echo "1-2-second" > "$FLAGGED_STORIES_FILE"
    local output
    output=$(print_progress_summary 2>&1)
    [[ "$output" == *"✕ 1-2-second (blocked)"* ]]
}

@test "print_progress_summary shows next story" {
    cat > "$SPRINT_STATUS_FILE" << 'EOF'
development_status:
  1-1-first: done
  1-2-second: in-progress
EOF
    local output
    output=$(print_progress_summary 2>&1)
    [[ "$output" == *"Next up: 1-2-second"* ]]
}

# ── print_progress_summary() cost tests (AC #3) ──

@test "print_progress_summary includes cost when available" {
    cat > "$SPRINT_STATUS_FILE" << 'EOF'
development_status:
  1-1-first: done
  1-2-second: in-progress
EOF
    cat > "$TEST_DIR/sprint-state.json" << 'EOF'
{
  "run": {
    "cost": 4.52,
    "failed": []
  }
}
EOF
    cd "$TEST_DIR"
    local output
    output=$(print_progress_summary 2>&1)
    [[ "$output" == *"cost: \$4.52"* ]]
}

@test "print_progress_summary omits cost when zero" {
    cat > "$SPRINT_STATUS_FILE" << 'EOF'
development_status:
  1-1-first: done
EOF
    cat > "$TEST_DIR/sprint-state.json" << 'EOF'
{
  "run": {
    "cost": 0,
    "failed": []
  }
}
EOF
    cd "$TEST_DIR"
    local output
    output=$(print_progress_summary 2>&1)
    [[ "$output" != *"cost:"* ]]
}

@test "print_progress_summary works without sprint-state.json" {
    cat > "$SPRINT_STATUS_FILE" << 'EOF'
development_status:
  1-1-first: done
  1-2-second: in-progress
EOF
    cd "$TEST_DIR"
    local output
    output=$(print_progress_summary 2>&1)
    [[ "$output" == *"Progress: 1/2 done"* ]]
    [[ "$output" != *"cost:"* ]]
}

# ── Startup noise suppression (AC #4) ──

@test "log_status DEBUG writes to log file only, not terminal" {
    local terminal_output
    terminal_output=$(log_status "DEBUG" "secret config line" 2>&1)
    [[ -z "$terminal_output" ]]

    # Verify it went to log file
    [[ -f "$LOG_DIR/ralph.log" ]]
    grep -q "secret config line" "$LOG_DIR/ralph.log"
}

@test "log_status INFO still writes to terminal" {
    local terminal_output
    terminal_output=$(log_status "INFO" "visible line" 2>&1)
    [[ "$terminal_output" == *"visible line"* ]]
}

@test "print_sprint_summary shows compact sprint overview" {
    cat > "$SPRINT_STATUS_FILE" << 'EOF'
development_status:
  epic-1: in-progress
  1-1-first: done
  1-2-second: done
  1-3-third: in-progress
  1-4-fourth: backlog
  1-5-fifth: backlog
EOF
    local output
    output=$(print_sprint_summary 2>&1)
    [[ "$output" == *"Sprint: 2/5 done, 3 remaining"* ]]
    [[ "$output" == *"next: 1-3-third (in-progress)"* ]]
}

@test "print_sprint_summary handles all stories done" {
    cat > "$SPRINT_STATUS_FILE" << 'EOF'
development_status:
  1-1-first: done
  1-2-second: done
EOF
    local output
    output=$(print_sprint_summary 2>&1)
    [[ "$output" == *"Sprint: 2/2 done, 0 remaining"* ]]
    # No "next:" when all done
    [[ "$output" != *"next:"* ]]
}

@test "print_sprint_summary skips flagged stories for next" {
    cat > "$SPRINT_STATUS_FILE" << 'EOF'
development_status:
  1-1-first: done
  1-2-second: in-progress
  1-3-third: backlog
EOF
    echo "1-2-second" > "$FLAGGED_STORIES_FILE"
    local output
    output=$(print_sprint_summary 2>&1)
    [[ "$output" == *"next: 1-3-third"* ]]
}

@test "startup config lines use DEBUG level" {
    # Verify the source code has DEBUG for config lines
    # This is a source-level check
    local ralph_source="$RALPH_DIR/ralph.sh"
    # These lines should be DEBUG, not INFO
    grep -q 'log_status "DEBUG" "Plugin: ' "$ralph_source"
    grep -q 'log_status "DEBUG" "Max iterations: ' "$ralph_source"
    grep -q 'log_status "DEBUG" "Prompt: ' "$ralph_source"
    grep -q 'log_status "DEBUG" "Sprint status: ' "$ralph_source"
    grep -q 'log_status "DEBUG" "Max story retries: ' "$ralph_source"
    grep -q 'log_status "DEBUG" "Platform driver: ' "$ralph_source"
}
