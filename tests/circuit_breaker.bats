#!/usr/bin/env bats
# Tests for ralph/lib/circuit_breaker.sh

load test_helper

setup() {
    setup_test_dir
    export HARNESS_STATE_DIR="$TEST_DIR"
    source "$RALPH_DIR/lib/circuit_breaker.sh"
}

teardown() {
    teardown_test_dir
}

@test "init_circuit_breaker creates state file" {
    init_circuit_breaker
    [[ -f "$CB_STATE_FILE" ]]
}

@test "init_circuit_breaker creates history file" {
    init_circuit_breaker
    [[ -f "$CB_HISTORY_FILE" ]]
}

@test "initial state is CLOSED" {
    init_circuit_breaker
    local state
    state=$(get_circuit_state)
    [[ "$state" == "CLOSED" ]]
}

@test "can_execute returns true when CLOSED" {
    init_circuit_breaker
    can_execute
}

@test "record_loop_result with progress keeps CLOSED" {
    init_circuit_breaker
    record_loop_result 1 5 "false" 1000
    local state
    state=$(get_circuit_state)
    [[ "$state" == "CLOSED" ]]
}

@test "record_loop_result opens circuit after no-progress threshold" {
    init_circuit_breaker
    # Default threshold is 3
    record_loop_result 1 0 "false" 1000 || true
    record_loop_result 2 0 "false" 1000 || true
    run record_loop_result 3 0 "false" 1000
    [[ $status -ne 0 ]]

    local state
    state=$(get_circuit_state)
    [[ "$state" == "OPEN" ]]
}

@test "record_loop_result transitions to HALF_OPEN after 2 no-progress" {
    init_circuit_breaker
    record_loop_result 1 0 "false" 1000 || true
    record_loop_result 2 0 "false" 1000 || true
    local state
    state=$(get_circuit_state)
    [[ "$state" == "HALF_OPEN" ]]
}

@test "HALF_OPEN recovers to CLOSED on progress" {
    init_circuit_breaker
    record_loop_result 1 0 "false" 1000 || true
    record_loop_result 2 0 "false" 1000 || true
    # Now in HALF_OPEN, make progress
    record_loop_result 3 5 "false" 1000
    local state
    state=$(get_circuit_state)
    [[ "$state" == "CLOSED" ]]
}

@test "should_halt_execution returns true when OPEN" {
    init_circuit_breaker
    # Force OPEN state
    jq -n --arg state "OPEN" '{state: $state}' > "$CB_STATE_FILE"
    should_halt_execution
}

@test "should_halt_execution returns false when CLOSED" {
    init_circuit_breaker
    ! should_halt_execution
}

@test "reset_circuit_breaker resets to CLOSED" {
    init_circuit_breaker
    # Force OPEN
    jq -n --arg state "OPEN" '{state: $state, total_opens: 1}' > "$CB_STATE_FILE"
    reset_circuit_breaker "test reset"
    local state
    state=$(get_circuit_state)
    [[ "$state" == "CLOSED" ]]
}

@test "record_loop_result opens on repeated errors" {
    init_circuit_breaker
    export CB_SAME_ERROR_THRESHOLD=3
    record_loop_result 1 0 "true" 1000 || true
    record_loop_result 2 0 "true" 1000 || true
    run record_loop_result 3 0 "true" 1000
    [[ $status -ne 0 ]]

    local state
    state=$(get_circuit_state)
    [[ "$state" == "OPEN" ]]
}

@test "corrupted state file is recovered" {
    echo "not json" > "$CB_STATE_FILE"
    init_circuit_breaker
    local state
    state=$(get_circuit_state)
    [[ "$state" == "CLOSED" ]]
}
