#!/usr/bin/env bash
# timeout_utils.sh - Cross-platform timeout utility functions for codeharness Ralph loop
# Vendored from snarktank/ralph

export _TIMEOUT_CMD=""

detect_timeout_command() {
    if [[ -n "$_TIMEOUT_CMD" ]]; then
        echo "$_TIMEOUT_CMD"
        return 0
    fi

    local os_type
    os_type=$(uname)

    if [[ "$os_type" == "Darwin" ]]; then
        if command -v gtimeout &> /dev/null; then
            _TIMEOUT_CMD="gtimeout"
        elif command -v timeout &> /dev/null; then
            _TIMEOUT_CMD="timeout"
        else
            _TIMEOUT_CMD=""
            return 1
        fi
    else
        if command -v timeout &> /dev/null; then
            _TIMEOUT_CMD="timeout"
        else
            _TIMEOUT_CMD=""
            return 1
        fi
    fi

    echo "$_TIMEOUT_CMD"
    return 0
}

has_timeout_command() {
    local cmd
    cmd=$(detect_timeout_command 2>/dev/null)
    [[ -n "$cmd" ]]
}

portable_timeout() {
    local duration=$1
    shift

    if [[ -z "$duration" ]]; then
        echo "Error: portable_timeout requires a duration argument" >&2
        return 1
    fi

    if [[ $# -eq 0 ]]; then
        echo "Error: portable_timeout requires a command to execute" >&2
        return 1
    fi

    local timeout_cmd
    timeout_cmd=$(detect_timeout_command 2>/dev/null)

    if [[ -z "$timeout_cmd" ]]; then
        echo "Warning: No timeout command available, running without timeout" >&2
        "$@"
        return $?
    fi

    "$timeout_cmd" "$duration" "$@"
}

reset_timeout_detection() {
    _TIMEOUT_CMD=""
}

export -f detect_timeout_command
export -f has_timeout_command
export -f portable_timeout
export -f reset_timeout_detection
