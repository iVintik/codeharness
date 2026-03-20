#!/usr/bin/env bash
# circuit_breaker.sh - Prevents runaway token consumption by detecting stagnation
# Vendored from snarktank/ralph, adapted for codeharness
# Based on Michael Nygard's "Release It!" pattern

source "$(dirname "${BASH_SOURCE[0]}")/date_utils.sh"

CB_STATE_CLOSED="CLOSED"
CB_STATE_HALF_OPEN="HALF_OPEN"
CB_STATE_OPEN="OPEN"

# Use HARNESS_STATE_DIR if set, otherwise default
HARNESS_STATE_DIR="${HARNESS_STATE_DIR:-.}"
CB_STATE_FILE="${HARNESS_STATE_DIR}/.circuit_breaker_state"
CB_HISTORY_FILE="${HARNESS_STATE_DIR}/.circuit_breaker_history"

CB_NO_PROGRESS_THRESHOLD=${CB_NO_PROGRESS_THRESHOLD:-3}
CB_SAME_ERROR_THRESHOLD=${CB_SAME_ERROR_THRESHOLD:-5}
CB_PERMISSION_DENIAL_THRESHOLD=${CB_PERMISSION_DENIAL_THRESHOLD:-2}
CB_COOLDOWN_MINUTES=${CB_COOLDOWN_MINUTES:-30}
CB_AUTO_RESET=${CB_AUTO_RESET:-false}

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

init_circuit_breaker() {
    if [[ -f "$CB_STATE_FILE" ]]; then
        if ! jq -e type "$CB_STATE_FILE" > /dev/null 2>&1; then
            rm -f "$CB_STATE_FILE"
        fi
    fi

    if [[ ! -f "$CB_STATE_FILE" ]]; then
        jq -n \
            --arg state "$CB_STATE_CLOSED" \
            --arg last_change "$(get_iso_timestamp)" \
            '{
                state: $state,
                last_change: $last_change,
                consecutive_no_progress: 0,
                consecutive_same_error: 0,
                consecutive_permission_denials: 0,
                last_progress_loop: 0,
                total_opens: 0,
                reason: ""
            }' > "$CB_STATE_FILE"
    fi

    if [[ -f "$CB_HISTORY_FILE" ]]; then
        if ! jq '.' "$CB_HISTORY_FILE" > /dev/null 2>&1; then
            rm -f "$CB_HISTORY_FILE"
        fi
    fi

    if [[ ! -f "$CB_HISTORY_FILE" ]]; then
        echo '[]' > "$CB_HISTORY_FILE"
    fi
}

get_circuit_state() {
    if [[ ! -f "$CB_STATE_FILE" ]]; then
        echo "$CB_STATE_CLOSED"
        return
    fi
    jq -r '.state' "$CB_STATE_FILE" 2>/dev/null || echo "$CB_STATE_CLOSED"
}

can_execute() {
    local state=$(get_circuit_state)
    if [[ "$state" == "$CB_STATE_OPEN" ]]; then
        return 1
    else
        return 0
    fi
}

record_loop_result() {
    local loop_number=$1
    local files_changed=$2
    local has_errors=$3
    local output_length=$4

    init_circuit_breaker

    local state_data=$(cat "$CB_STATE_FILE")
    local current_state=$(echo "$state_data" | jq -r '.state')
    local consecutive_no_progress=$(echo "$state_data" | jq -r '.consecutive_no_progress' | tr -d '[:space:]')
    local consecutive_same_error=$(echo "$state_data" | jq -r '.consecutive_same_error' | tr -d '[:space:]')
    local last_progress_loop=$(echo "$state_data" | jq -r '.last_progress_loop' | tr -d '[:space:]')

    consecutive_no_progress=$((consecutive_no_progress + 0))
    consecutive_same_error=$((consecutive_same_error + 0))
    last_progress_loop=$((last_progress_loop + 0))

    local has_progress=false

    if [[ $files_changed -gt 0 ]]; then
        has_progress=true
        consecutive_no_progress=0
        last_progress_loop=$loop_number
    else
        consecutive_no_progress=$((consecutive_no_progress + 1))
    fi

    if [[ "$has_errors" == "true" ]]; then
        consecutive_same_error=$((consecutive_same_error + 1))
    else
        consecutive_same_error=0
    fi

    local new_state="$current_state"
    local reason=""

    case $current_state in
        "$CB_STATE_CLOSED")
            if [[ $consecutive_no_progress -ge $CB_NO_PROGRESS_THRESHOLD ]]; then
                new_state="$CB_STATE_OPEN"
                reason="No progress detected in $consecutive_no_progress consecutive loops"
            elif [[ $consecutive_same_error -ge $CB_SAME_ERROR_THRESHOLD ]]; then
                new_state="$CB_STATE_OPEN"
                reason="Same error repeated in $consecutive_same_error consecutive loops"
            elif [[ $consecutive_no_progress -ge 2 ]]; then
                new_state="$CB_STATE_HALF_OPEN"
                reason="Monitoring: $consecutive_no_progress loops without progress"
            fi
            ;;
        "$CB_STATE_HALF_OPEN")
            if [[ "$has_progress" == "true" ]]; then
                new_state="$CB_STATE_CLOSED"
                reason="Progress detected, circuit recovered"
            elif [[ $consecutive_no_progress -ge $CB_NO_PROGRESS_THRESHOLD ]]; then
                new_state="$CB_STATE_OPEN"
                reason="No recovery, opening circuit after $consecutive_no_progress loops"
            fi
            ;;
        "$CB_STATE_OPEN")
            reason="Circuit breaker is open, execution halted"
            ;;
    esac

    local total_opens=$(echo "$state_data" | jq -r '.total_opens' | tr -d '[:space:]')
    total_opens=$((total_opens + 0))
    if [[ "$new_state" == "$CB_STATE_OPEN" && "$current_state" != "$CB_STATE_OPEN" ]]; then
        total_opens=$((total_opens + 1))
    fi

    jq -n \
        --arg state "$new_state" \
        --arg last_change "$(get_iso_timestamp)" \
        --argjson consecutive_no_progress "$consecutive_no_progress" \
        --argjson consecutive_same_error "$consecutive_same_error" \
        --argjson consecutive_permission_denials 0 \
        --argjson last_progress_loop "$last_progress_loop" \
        --argjson total_opens "$total_opens" \
        --arg reason "$reason" \
        --argjson current_loop "$loop_number" \
        '{
            state: $state,
            last_change: $last_change,
            consecutive_no_progress: $consecutive_no_progress,
            consecutive_same_error: $consecutive_same_error,
            consecutive_permission_denials: $consecutive_permission_denials,
            last_progress_loop: $last_progress_loop,
            total_opens: $total_opens,
            reason: $reason,
            current_loop: $current_loop
        }' > "$CB_STATE_FILE"

    if [[ "$new_state" == "$CB_STATE_OPEN" ]]; then
        return 1
    else
        return 0
    fi
}

reset_circuit_breaker() {
    local reason=${1:-"Manual reset"}
    jq -n \
        --arg state "$CB_STATE_CLOSED" \
        --arg last_change "$(get_iso_timestamp)" \
        --arg reason "$reason" \
        '{
            state: $state,
            last_change: $last_change,
            consecutive_no_progress: 0,
            consecutive_same_error: 0,
            consecutive_permission_denials: 0,
            last_progress_loop: 0,
            total_opens: 0,
            reason: $reason
        }' > "$CB_STATE_FILE"
}

should_halt_execution() {
    local state=$(get_circuit_state)
    if [[ "$state" == "$CB_STATE_OPEN" ]]; then
        return 0
    else
        return 1
    fi
}

export -f init_circuit_breaker
export -f get_circuit_state
export -f can_execute
export -f record_loop_result
export -f reset_circuit_breaker
export -f should_halt_execution
