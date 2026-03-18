#!/usr/bin/env bats
# Tests for Story 3.1: timeout-report CLI command

load test_helper

CODEHARNESS="$PROJECT_ROOT/dist/index.js"

setup() {
    setup_test_dir
    mkdir -p "$TEST_DIR/ralph/logs"

    # Create a fake output log
    echo "line 1" > "$TEST_DIR/ralph/logs/output.log"
    echo "line 2" >> "$TEST_DIR/ralph/logs/output.log"

    # Create a fake state snapshot
    echo '{"stories":{}}' > "$TEST_DIR/ralph/.state-snapshot.json"

    # Create current sprint-state.json
    echo '{"stories":{}}' > "$TEST_DIR/sprint-state.json"
}

teardown() {
    teardown_test_dir
}

@test "timeout-report command exists and accepts required options" {
    run node "$CODEHARNESS" timeout-report --help
    [ "$status" -eq 0 ]
    [[ "$output" == *"--story"* ]]
    [[ "$output" == *"--iteration"* ]]
    [[ "$output" == *"--duration"* ]]
    [[ "$output" == *"--output-file"* ]]
}

@test "timeout-report creates report file with non-zero content" {
    cd "$TEST_DIR"
    run node "$CODEHARNESS" timeout-report \
        --story "3-1-test" \
        --iteration 1 \
        --duration 30 \
        --output-file "$TEST_DIR/ralph/logs/output.log" \
        --state-snapshot "$TEST_DIR/ralph/.state-snapshot.json"
    [ "$status" -eq 0 ]

    # Report file should exist with non-zero content
    local report_file="$TEST_DIR/ralph/logs/timeout-report-1-3-1-test.md"
    [ -s "$report_file" ]
}
