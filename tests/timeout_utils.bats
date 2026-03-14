#!/usr/bin/env bats
# Tests for ralph/lib/timeout_utils.sh

load test_helper

setup() {
    setup_test_dir
    source "$RALPH_DIR/lib/timeout_utils.sh"
    reset_timeout_detection
}

teardown() {
    teardown_test_dir
}

@test "detect_timeout_command finds a timeout command" {
    local result
    result=$(detect_timeout_command)
    # On macOS should find gtimeout or timeout, on Linux should find timeout
    [[ -n "$result" ]]
}

@test "has_timeout_command returns true when available" {
    has_timeout_command
}

@test "portable_timeout runs command successfully" {
    local result
    result=$(portable_timeout 5s echo "hello")
    [[ "$result" == "hello" ]]
}

@test "portable_timeout returns error without duration" {
    run portable_timeout
    [[ $status -ne 0 ]]
}

@test "portable_timeout returns error without command" {
    run portable_timeout 5s
    [[ $status -ne 0 ]]
}

@test "portable_timeout kills long-running command" {
    run portable_timeout 1s sleep 60
    # Should timeout with exit code 124
    [[ $status -eq 124 ]]
}

@test "detect_timeout_command caches result" {
    local first second
    first=$(detect_timeout_command)
    second=$(detect_timeout_command)
    [[ "$first" == "$second" ]]
}

@test "reset_timeout_detection clears cache" {
    detect_timeout_command > /dev/null
    reset_timeout_detection
    [[ -z "$_TIMEOUT_CMD" ]]
}
