#!/usr/bin/env bats
# Tests for ralph/drivers/claude-code.sh

load test_helper

setup() {
    setup_test_dir
    # Source driver (need the globals it expects)
    declare -a CLAUDE_CMD_ARGS=()
    declare -a LIVE_CMD_ARGS=()
    declare -a VALID_TOOL_PATTERNS=()
    export CLAUDE_OUTPUT_FORMAT="json"
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

@test "driver_build_command includes --output-format json" {
    export CLAUDE_OUTPUT_FORMAT="json"
    driver_build_command "$TEST_DIR/.ralph/PROMPT.md" "" "" ""
    local found=false
    for arg in "${CLAUDE_CMD_ARGS[@]}"; do
        if [[ "$arg" == "--output-format" ]]; then
            found=true
            break
        fi
    done
    [[ "$found" == "true" ]]
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
