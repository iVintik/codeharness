#!/usr/bin/env bash
# Claude Code driver for codeharness Ralph loop
# Handles instance lifecycle: spawn, monitor, terminate
# Each iteration gets a fresh Claude Code instance with the codeharness plugin

# Driver identification
driver_name() {
    echo "claude-code"
}

driver_display_name() {
    echo "Claude Code"
}

driver_cli_binary() {
    echo "claude"
}

driver_min_version() {
    echo "2.0.76"
}

# Check if the CLI binary is available
driver_check_available() {
    command -v "$(driver_cli_binary)" &>/dev/null
}

# Valid tool patterns for --allowedTools validation
driver_valid_tools() {
    VALID_TOOL_PATTERNS=(
        "Write"
        "Read"
        "Edit"
        "MultiEdit"
        "Glob"
        "Grep"
        "Task"
        "TodoWrite"
        "WebFetch"
        "WebSearch"
        "Bash"
        "Bash(git *)"
        "Bash(npm *)"
        "Bash(bats *)"
        "Bash(python *)"
        "Bash(node *)"
        "NotebookEdit"
    )
}

# Build the CLI command arguments
# Populates global CLAUDE_CMD_ARGS array
# Parameters:
#   $1 - prompt_file: path to the prompt file
#   $2 - loop_context: context string for session continuity
#   $3 - session_id: session ID for resume (empty for new session)
#   $4 - plugin_dir: plugin directory (for --plugin-dir flag)
driver_build_command() {
    local prompt_file=$1
    local loop_context=$2
    local session_id=$3
    local plugin_dir=${4:-""}

    CLAUDE_CMD_ARGS=("$(driver_cli_binary)")

    if [[ ! -f "$prompt_file" ]]; then
        echo "ERROR: Prompt file not found: $prompt_file" >&2
        return 1
    fi

    # Plugin directory
    if [[ -n "$plugin_dir" ]]; then
        CLAUDE_CMD_ARGS+=("--plugin-dir" "$plugin_dir")
    fi

    # Output format
    if [[ "$CLAUDE_OUTPUT_FORMAT" == "json" ]]; then
        CLAUDE_CMD_ARGS+=("--output-format" "json")
    fi

    # Allowed tools
    if [[ -n "$CLAUDE_ALLOWED_TOOLS" ]]; then
        CLAUDE_CMD_ARGS+=("--allowedTools")
        local IFS=','
        read -ra tools_array <<< "$CLAUDE_ALLOWED_TOOLS"
        for tool in "${tools_array[@]}"; do
            tool=$(echo "$tool" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
            if [[ -n "$tool" ]]; then
                CLAUDE_CMD_ARGS+=("$tool")
            fi
        done
    fi

    # Session resume
    if [[ "$CLAUDE_USE_CONTINUE" == "true" && -n "$session_id" ]]; then
        CLAUDE_CMD_ARGS+=("--resume" "$session_id")
    fi

    # Loop context as system prompt
    if [[ -n "$loop_context" ]]; then
        CLAUDE_CMD_ARGS+=("--append-system-prompt" "$loop_context")
    fi

    # Prompt content
    local prompt_content
    prompt_content=$(cat "$prompt_file")
    CLAUDE_CMD_ARGS+=("-p" "$prompt_content")
}

# Whether this driver supports session continuity
driver_supports_sessions() {
    return 0
}

# Claude Code supports stream-json live output
driver_supports_live_output() {
    return 0
}

# Prepare command arguments for live stream-json output
driver_prepare_live_command() {
    LIVE_CMD_ARGS=()
    local skip_next=false

    for arg in "${CLAUDE_CMD_ARGS[@]}"; do
        if [[ "$skip_next" == "true" ]]; then
            LIVE_CMD_ARGS+=("stream-json")
            skip_next=false
        elif [[ "$arg" == "--output-format" ]]; then
            LIVE_CMD_ARGS+=("$arg")
            skip_next=true
        else
            LIVE_CMD_ARGS+=("$arg")
        fi
    done

    if [[ "$skip_next" == "true" ]]; then
        return 1
    fi

    LIVE_CMD_ARGS+=("--verbose" "--include-partial-messages")
}

# Stream filter for raw Claude stream-json events
driver_stream_filter() {
    echo '
        if .type == "stream_event" then
            if .event.type == "content_block_delta" and .event.delta.type == "text_delta" then
                .event.delta.text
            elif .event.type == "content_block_start" and .event.content_block.type == "tool_use" then
                "\n\n⚡ [" + .event.content_block.name + "]\n"
            elif .event.type == "content_block_stop" then
                "\n"
            else
                empty
            end
        else
            empty
        end'
}
