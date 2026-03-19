#!/usr/bin/env bats
# Tests for ralph/drivers/claude-code.sh

load test_helper

setup() {
    setup_test_dir
    # Source driver (need the globals it expects)
    declare -a CLAUDE_CMD_ARGS=()
    declare -a LIVE_CMD_ARGS=()
    declare -a VALID_TOOL_PATTERNS=()
    export CLAUDE_OUTPUT_FORMAT="stream-json"
    export CLAUDE_ALLOWED_TOOLS=""
    export CLAUDE_USE_CONTINUE="false"
    source "$RALPH_DIR/drivers/claude-code.sh"

    # Create a test prompt
    create_test_prompt "$TEST_DIR/.ralph/PROMPT.md"
}

teardown() {
    teardown_test_dir
}

@test "driver_name returns claude-code" {
    local name
    name=$(driver_name)
    [[ "$name" == "claude-code" ]]
}

@test "driver_display_name returns Claude Code" {
    local name
    name=$(driver_display_name)
    [[ "$name" == "Claude Code" ]]
}

@test "driver_cli_binary returns claude" {
    local bin
    bin=$(driver_cli_binary)
    [[ "$bin" == "claude" ]]
}

@test "driver_min_version returns valid semver" {
    local ver
    ver=$(driver_min_version)
    [[ "$ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

@test "driver_valid_tools populates VALID_TOOL_PATTERNS" {
    driver_valid_tools
    [[ ${#VALID_TOOL_PATTERNS[@]} -gt 0 ]]
    # Should include basic tools
    local found=false
    for t in "${VALID_TOOL_PATTERNS[@]}"; do
        if [[ "$t" == "Write" ]]; then
            found=true
            break
        fi
    done
    [[ "$found" == "true" ]]
}

@test "driver_build_command creates command array" {
    driver_build_command "$TEST_DIR/.ralph/PROMPT.md" "Loop #1." "" ""
    [[ ${#CLAUDE_CMD_ARGS[@]} -gt 0 ]]
    [[ "${CLAUDE_CMD_ARGS[0]}" == "claude" ]]
}

@test "driver_build_command includes --plugin-dir when provided" {
    driver_build_command "$TEST_DIR/.ralph/PROMPT.md" "" "" "/path/to/plugin"
    local found=false
    for arg in "${CLAUDE_CMD_ARGS[@]}"; do
        if [[ "$arg" == "--plugin-dir" ]]; then
            found=true
            break
        fi
    done
    [[ "$found" == "true" ]]
}

@test "driver_build_command includes --output-format stream-json" {
    driver_build_command "$TEST_DIR/.ralph/PROMPT.md" "" "" ""
    local found_format=false
    local found_value=false
    local prev_arg=""
    for arg in "${CLAUDE_CMD_ARGS[@]}"; do
        if [[ "$arg" == "--output-format" ]]; then
            found_format=true
        fi
        if [[ "$prev_arg" == "--output-format" && "$arg" == "stream-json" ]]; then
            found_value=true
        fi
        prev_arg="$arg"
    done
    [[ "$found_format" == "true" ]]
    [[ "$found_value" == "true" ]]
}

@test "driver_build_command does NOT include --output-format json" {
    driver_build_command "$TEST_DIR/.ralph/PROMPT.md" "" "" ""
    local prev_arg=""
    for arg in "${CLAUDE_CMD_ARGS[@]}"; do
        if [[ "$prev_arg" == "--output-format" && "$arg" == "json" ]]; then
            echo "FAIL: found --output-format json in args"
            return 1
        fi
        prev_arg="$arg"
    done
}

@test "driver_build_command includes --verbose flag" {
    driver_build_command "$TEST_DIR/.ralph/PROMPT.md" "" "" ""
    local found=false
    for arg in "${CLAUDE_CMD_ARGS[@]}"; do
        if [[ "$arg" == "--verbose" ]]; then
            found=true
            break
        fi
    done
    [[ "$found" == "true" ]]
}

@test "driver_build_command includes --include-partial-messages flag" {
    driver_build_command "$TEST_DIR/.ralph/PROMPT.md" "" "" ""
    local found=false
    for arg in "${CLAUDE_CMD_ARGS[@]}"; do
        if [[ "$arg" == "--include-partial-messages" ]]; then
            found=true
            break
        fi
    done
    [[ "$found" == "true" ]]
}

@test "driver_prepare_live_command does not exist (removed)" {
    run type -t driver_prepare_live_command
    [[ "$status" -ne 0 ]] || [[ "$output" != "function" ]]
}

@test "driver_build_command includes --append-system-prompt with context" {
    driver_build_command "$TEST_DIR/.ralph/PROMPT.md" "Loop #5. Current task: US-001." "" ""
    local found=false
    for arg in "${CLAUDE_CMD_ARGS[@]}"; do
        if [[ "$arg" == "--append-system-prompt" ]]; then
            found=true
            break
        fi
    done
    [[ "$found" == "true" ]]
}

@test "driver_build_command fails for missing prompt file" {
    run driver_build_command "$TEST_DIR/nonexistent.md" "" "" ""
    [[ $status -ne 0 ]]
}

@test "driver_build_command includes prompt content via -p" {
    driver_build_command "$TEST_DIR/.ralph/PROMPT.md" "" "" ""
    local found=false
    for arg in "${CLAUDE_CMD_ARGS[@]}"; do
        if [[ "$arg" == "-p" ]]; then
            found=true
            break
        fi
    done
    [[ "$found" == "true" ]]
}

@test "driver_build_command includes --allowedTools when set" {
    export CLAUDE_ALLOWED_TOOLS="Write,Read,Edit"
    driver_build_command "$TEST_DIR/.ralph/PROMPT.md" "" "" ""
    local found=false
    for arg in "${CLAUDE_CMD_ARGS[@]}"; do
        if [[ "$arg" == "--allowedTools" ]]; then
            found=true
            break
        fi
    done
    [[ "$found" == "true" ]]
}

@test "driver_build_command does not include --resume when CLAUDE_USE_CONTINUE is false" {
    export CLAUDE_USE_CONTINUE="false"
    driver_build_command "$TEST_DIR/.ralph/PROMPT.md" "" "some-session-id" ""
    local found=false
    for arg in "${CLAUDE_CMD_ARGS[@]}"; do
        if [[ "$arg" == "--resume" ]]; then
            found=true
            break
        fi
    done
    [[ "$found" == "false" ]]
}

@test "driver_supports_sessions returns success" {
    driver_supports_sessions
}

@test "driver_supports_live_output returns success" {
    driver_supports_live_output
}

@test "driver_stream_filter returns valid jq filter" {
    local filter
    filter=$(driver_stream_filter)
    [[ -n "$filter" ]]
    # Verify it's valid jq by parsing null through it
    echo 'null' | jq "$filter" > /dev/null 2>&1
}

# ─── NDJSON Result Extraction Tests ─────────────────────────────────────────

@test "NDJSON: extract result line from stream output" {
    local ndjson_file="$TEST_DIR/ndjson_output.log"
    cat > "$ndjson_file" << 'NDJSON'
{"type":"stream_event","event":{"type":"message_start"}}
{"type":"stream_event","event":{"type":"content_block_start","content_block":{"type":"tool_use","name":"Read"}}}
{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}}
{"type":"stream_event","event":{"type":"content_block_stop"}}
{"type":"stream_event","event":{"type":"message_stop"}}
{"type":"result","session_id":"abc-123","cost_usd":0.05,"result":"All tasks completed successfully."}
NDJSON

    # Method 1: tail -1 (result is always last line)
    local result_line
    result_line=$(tail -1 "$ndjson_file")
    echo "$result_line" | jq -e '.type == "result"'

    # Method 2: grep for result type defensively
    local result_grep
    result_grep=$(grep '"type"' "$ndjson_file" | grep '"result"' | tail -1)
    echo "$result_grep" | jq -e '.session_id == "abc-123"'
    echo "$result_grep" | jq -e '.cost_usd == 0.05'
}

@test "NDJSON: handle output with no result line (timeout)" {
    local ndjson_file="$TEST_DIR/ndjson_timeout.log"
    cat > "$ndjson_file" << 'NDJSON'
{"type":"stream_event","event":{"type":"message_start"}}
{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Working..."}}}
NDJSON

    # grep for result should return nothing (exit 1)
    run grep '"type"' "$ndjson_file"
    # There are lines with "type" but none with "result" at the top level
    local result_grep
    result_grep=$(grep '"type"' "$ndjson_file" | grep '"result"' | tail -1 || true)
    [[ -z "$result_grep" ]]
}

@test "NDJSON: error detection greps do not false-positive on stream events" {
    local ndjson_file="$TEST_DIR/ndjson_clean.log"
    cat > "$ndjson_file" << 'NDJSON'
{"type":"stream_event","event":{"type":"content_block_start","content_block":{"type":"tool_use","name":"Read"}}}
{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Reading error handling code"}}}
{"type":"stream_event","event":{"type":"content_block_stop"}}
{"type":"result","session_id":"def-456","cost_usd":0.03,"result":"Done"}
NDJSON

    # API limit detection should NOT trigger
    run grep -qi "5.*hour.*limit\|limit.*reached.*try.*back\|usage.*limit.*reached" "$ndjson_file"
    [[ "$status" -ne 0 ]]

    # Transient error detection should NOT trigger (uses -E with word boundaries)
    run grep -qiE 'Internal server error|api_error|overloaded|(^|[^0-9.])529([^0-9]|$)|(^|[^0-9.])503([^0-9]|$)' "$ndjson_file"
    [[ "$status" -ne 0 ]]

    # Error line detection should NOT trigger (lines start with {, not Error:)
    local has_errors="false"
    if grep -v '"[^"]*error[^"]*":' "$ndjson_file" 2>/dev/null | \
       grep -qE '(^Error:|^ERROR:|^error:|\]: error|Error occurred|failed with error|[Ee]xception|Fatal|FATAL)'; then
        has_errors="true"
    fi
    [[ "$has_errors" == "false" ]]
}

@test "NDJSON: error detection greps DO catch real API errors in stream" {
    local ndjson_file="$TEST_DIR/ndjson_api_error.log"
    cat > "$ndjson_file" << 'NDJSON'
{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Working..."}}}
Internal server error
NDJSON

    # Transient error detection SHOULD trigger
    run grep -qiE 'Internal server error|api_error|overloaded|(^|[^0-9.])529([^0-9]|$)|(^|[^0-9.])503([^0-9]|$)' "$ndjson_file"
    [[ "$status" -eq 0 ]]
}

@test "NDJSON: transient error detection does NOT false-positive on cost values" {
    local ndjson_file="$TEST_DIR/ndjson_cost.log"
    cat > "$ndjson_file" << 'NDJSON'
{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Working..."}}}
{"type":"result","session_id":"xyz-789","cost_usd":0.503,"result":"Done"}
NDJSON

    # Should NOT trigger — 0.503 is a cost, not HTTP 503
    run grep -qiE 'Internal server error|api_error|overloaded|(^|[^0-9.])529([^0-9]|$)|(^|[^0-9.])503([^0-9]|$)' "$ndjson_file"
    [[ "$status" -ne 0 ]]
}

@test "NDJSON: transient error detection catches bare 503 status code" {
    local ndjson_file="$TEST_DIR/ndjson_503.log"
    cat > "$ndjson_file" << 'NDJSON'
{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Working..."}}}
503 Service Unavailable
NDJSON

    # SHOULD trigger — bare 503 is a real HTTP error
    run grep -qiE 'Internal server error|api_error|overloaded|(^|[^0-9.])529([^0-9]|$)|(^|[^0-9.])503([^0-9]|$)' "$ndjson_file"
    [[ "$status" -eq 0 ]]
}

@test "NDJSON: error detection catches API limit messages" {
    local ndjson_file="$TEST_DIR/ndjson_limit.log"
    cat > "$ndjson_file" << 'NDJSON'
{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}}
You have reached the 5 per hour limit for this model
NDJSON

    run grep -qi "5.*hour.*limit\|limit.*reached.*try.*back\|usage.*limit.*reached" "$ndjson_file"
    [[ "$status" -eq 0 ]]
}

@test "NDJSON: stream filter extracts text deltas" {
    local filter
    filter=$(driver_stream_filter)

    local event='{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello world"}}}'
    local result
    result=$(echo "$event" | jq -r "$filter")
    [[ "$result" == "Hello world" ]]
}

@test "NDJSON: stream filter extracts tool use starts" {
    local filter
    filter=$(driver_stream_filter)

    local event='{"type":"stream_event","event":{"type":"content_block_start","content_block":{"type":"tool_use","name":"Bash"}}}'
    local result
    result=$(echo "$event" | jq -r "$filter")
    [[ "$result" == *"Bash"* ]]
}

@test "NDJSON: stream filter ignores result events" {
    local filter
    filter=$(driver_stream_filter)

    local event='{"type":"result","session_id":"abc","cost_usd":0.01,"result":"done"}'
    local result
    result=$(echo "$event" | jq -r "$filter")
    [[ -z "$result" ]]
}
