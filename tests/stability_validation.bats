#!/usr/bin/env bats
# Integration tests for Story 3.4: validate-state CLI command
# Tests state validation against fixture files.

load test_helper

CODEHARNESS="$PROJECT_ROOT/dist/index.js"
FIXTURE_DIR="$PROJECT_ROOT/tests/fixtures/stability-test-project"

setup() {
    setup_test_dir

    # Copy fixture files into the test directory
    cp "$FIXTURE_DIR/sprint-state.json" "$TEST_DIR/sprint-state.json"
    cp "$FIXTURE_DIR/sprint-status.yaml" "$TEST_DIR/sprint-status.yaml"
}

teardown() {
    teardown_test_dir
}

@test "validate-state command exists and accepts options" {
    run node "$CODEHARNESS" validate-state --help
    [ "$status" -eq 0 ]
    [[ "$output" == *"--state"* ]]
    [[ "$output" == *"--sprint-status"* ]]
}

@test "validate-state validates known-good fixture state file" {
    cd "$TEST_DIR"
    run node "$CODEHARNESS" validate-state
    [ "$status" -eq 0 ]
    [[ "$output" == *"[OK]"* ]]
    [[ "$output" == *"Valid: 5"* ]]
    [[ "$output" == *"Invalid: 0"* ]]
}

@test "validate-state detects known-bad fixture state file" {
    cd "$TEST_DIR"
    cp "$FIXTURE_DIR/sprint-state-bad.json" "$TEST_DIR/sprint-state.json"
    run node "$CODEHARNESS" validate-state
    [ "$status" -eq 1 ]
    [[ "$output" == *"[FAIL]"* ]]
}

@test "validate-state --json outputs valid JSON on good state" {
    cd "$TEST_DIR"
    run node "$CODEHARNESS" --json validate-state
    [ "$status" -eq 0 ]

    # Verify it's valid JSON
    echo "$output" | jq '.' > /dev/null 2>&1
    [ $? -eq 0 ]

    # Check fields
    local status_val
    status_val=$(echo "$output" | jq -r '.status')
    [ "$status_val" = "ok" ]
}

@test "validate-state --json outputs valid JSON on bad state" {
    cd "$TEST_DIR"
    cp "$FIXTURE_DIR/sprint-state-bad.json" "$TEST_DIR/sprint-state.json"
    run node "$CODEHARNESS" --json validate-state
    [ "$status" -eq 1 ]

    echo "$output" | jq '.' > /dev/null 2>&1
    [ $? -eq 0 ]

    local status_val
    status_val=$(echo "$output" | jq -r '.status')
    [ "$status_val" = "fail" ]
}

@test "validate-state accepts custom file paths" {
    cd "$TEST_DIR"
    cp "$TEST_DIR/sprint-state.json" "$TEST_DIR/custom-state.json"
    cp "$TEST_DIR/sprint-status.yaml" "$TEST_DIR/custom-status.yaml"

    run node "$CODEHARNESS" validate-state \
        --state custom-state.json \
        --sprint-status custom-status.yaml
    [ "$status" -eq 0 ]
    [[ "$output" == *"[OK]"* ]]
}

@test "validate-state fails gracefully when state file is missing" {
    cd "$TEST_DIR"
    rm -f "$TEST_DIR/sprint-state.json"
    run node "$CODEHARNESS" validate-state
    [ "$status" -eq 1 ]
    [[ "$output" == *"State file not found"* ]]
}

@test "validate-state fails gracefully when sprint-status file is missing" {
    cd "$TEST_DIR"
    rm -f "$TEST_DIR/sprint-status.yaml"
    run node "$CODEHARNESS" validate-state
    [ "$status" -eq 1 ]
    [[ "$output" == *"Sprint status file not found"* ]]
}
