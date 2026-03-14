#!/usr/bin/env bats
# Tests for ralph/lib/date_utils.sh

load test_helper

setup() {
    setup_test_dir
    source "$RALPH_DIR/lib/date_utils.sh"
}

teardown() {
    teardown_test_dir
}

@test "get_iso_timestamp returns ISO 8601 format" {
    local result
    result=$(get_iso_timestamp)
    # Should match YYYY-MM-DDTHH:MM:SS pattern
    [[ "$result" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2} ]]
}

@test "get_epoch_seconds returns integer" {
    local result
    result=$(get_epoch_seconds)
    [[ "$result" =~ ^[0-9]+$ ]]
}

@test "get_next_hour_time returns HH:MM:SS format" {
    local result
    result=$(get_next_hour_time)
    [[ "$result" =~ ^[0-9]{2}:[0-9]{2}:[0-9]{2}$ ]]
}

@test "parse_iso_to_epoch returns integer for valid ISO timestamp" {
    local ts
    ts=$(get_iso_timestamp)
    local result
    result=$(parse_iso_to_epoch "$ts")
    [[ "$result" =~ ^[0-9]+$ ]]
}

@test "parse_iso_to_epoch falls back to current epoch for empty input" {
    local result
    result=$(parse_iso_to_epoch "")
    [[ "$result" =~ ^[0-9]+$ ]]
    # Should be close to current time
    local now
    now=$(date +%s)
    local diff=$((now - result))
    [[ $diff -ge -2 && $diff -le 2 ]]
}

@test "parse_iso_to_epoch falls back to current epoch for null input" {
    local result
    result=$(parse_iso_to_epoch "null")
    [[ "$result" =~ ^[0-9]+$ ]]
}
