#!/usr/bin/env bash
# codeharness Ralph Loop — Vendored from snarktank/ralph
# Autonomous execution loop that spawns fresh Claude Code instances per iteration
# with verification gates, crash recovery, rate limiting, and circuit breaker protection.
#
# Usage: ralph/ralph.sh --plugin-dir ./codeharness [OPTIONS]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/date_utils.sh"
source "$SCRIPT_DIR/lib/timeout_utils.sh"
source "$SCRIPT_DIR/lib/circuit_breaker.sh"

# ─── Configuration ───────────────────────────────────────────────────────────

VERSION="0.1.0"

# Plugin directory (required — set via --plugin-dir)
PLUGIN_DIR=""

# Harness state directory (derived from project root)
HARNESS_STATE_DIR=""

# Progress file (managed by bridge.sh, read by loop)
PROGRESS_FILE=""

# Prompt file for each iteration
PROMPT_FILE=""

# Logging
LOG_DIR=""

# Loop limits
MAX_ITERATIONS=${MAX_ITERATIONS:-50}
LOOP_TIMEOUT_SECONDS=${LOOP_TIMEOUT_SECONDS:-14400}  # 4 hours default
ITERATION_TIMEOUT_MINUTES=${ITERATION_TIMEOUT_MINUTES:-15}

# Rate limiting
MAX_CALLS_PER_HOUR=${MAX_CALLS_PER_HOUR:-100}
RATE_LIMIT_SLEEP=3600  # 1 hour

# Driver
PLATFORM_DRIVER="${PLATFORM_DRIVER:-claude-code}"
CLAUDE_OUTPUT_FORMAT="${CLAUDE_OUTPUT_FORMAT:-json}"
CLAUDE_ALLOWED_TOOLS="${CLAUDE_ALLOWED_TOOLS:-}"
CLAUDE_USE_CONTINUE="${CLAUDE_USE_CONTINUE:-false}"  # Fresh context per iteration by default

# Live output
LIVE_OUTPUT=false

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# ─── Internal state ─────────────────────────────────────────────────────────

CALL_COUNT_FILE=""
TIMESTAMP_FILE=""
STATUS_FILE=""
LIVE_LOG_FILE=""

# Global arrays for driver command building
declare -a CLAUDE_CMD_ARGS=()
declare -a LIVE_CMD_ARGS=()
declare -a VALID_TOOL_PATTERNS=()

loop_count=0
loop_start_time=""

# ─── Logging ─────────────────────────────────────────────────────────────────

log_status() {
    local level=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local color=""

    case $level in
        "INFO")    color=$BLUE ;;
        "WARN")    color=$YELLOW ;;
        "ERROR")   color=$RED ;;
        "SUCCESS") color=$GREEN ;;
        "LOOP")    color=$PURPLE ;;
    esac

    echo -e "${color}[$timestamp] [$level] $message${NC}" >&2
    if [[ -n "$LOG_DIR" ]]; then
        echo "[$timestamp] [$level] $message" >> "$LOG_DIR/ralph.log"
    fi
}

# ─── Rate Limiting ───────────────────────────────────────────────────────────

init_call_tracking() {
    local current_hour=$(date +%Y%m%d%H)
    local last_reset_hour=""

    if [[ -f "$TIMESTAMP_FILE" ]]; then
        last_reset_hour=$(cat "$TIMESTAMP_FILE")
    fi

    if [[ "$current_hour" != "$last_reset_hour" ]]; then
        echo "0" > "$CALL_COUNT_FILE"
        echo "$current_hour" > "$TIMESTAMP_FILE"
    fi
}

can_make_call() {
    local calls_made=0
    if [[ -f "$CALL_COUNT_FILE" ]]; then
        calls_made=$(cat "$CALL_COUNT_FILE")
    fi

    if [[ $calls_made -ge $MAX_CALLS_PER_HOUR ]]; then
        return 1
    else
        return 0
    fi
}

wait_for_reset() {
    local calls_made=$(cat "$CALL_COUNT_FILE" 2>/dev/null || echo "0")
    log_status "WARN" "Rate limit reached ($calls_made/$MAX_CALLS_PER_HOUR). Waiting for reset..."

    local current_minute=$(date +%M)
    local current_second=$(date +%S)
    local wait_time=$(((60 - current_minute - 1) * 60 + (60 - current_second)))

    log_status "INFO" "Sleeping for $wait_time seconds until next hour..."
    sleep "$wait_time"

    echo "0" > "$CALL_COUNT_FILE"
    echo "$(date +%Y%m%d%H)" > "$TIMESTAMP_FILE"
    log_status "SUCCESS" "Rate limit reset."
}

# ─── Progress Tracking ───────────────────────────────────────────────────────

update_status() {
    local loop_count=$1
    local calls_made=$2
    local last_action=$3
    local status=$4
    local exit_reason=${5:-""}

    if [[ -z "$STATUS_FILE" ]]; then
        return
    fi

    jq -n \
        --arg timestamp "$(get_iso_timestamp)" \
        --argjson loop_count "$loop_count" \
        --argjson calls_made "$calls_made" \
        --argjson max_calls "$MAX_CALLS_PER_HOUR" \
        --argjson max_iterations "$MAX_ITERATIONS" \
        --arg last_action "$last_action" \
        --arg status "$status" \
        --arg exit_reason "$exit_reason" \
        --arg version "$VERSION" \
        '{
            timestamp: $timestamp,
            version: $version,
            loop_count: $loop_count,
            calls_made_this_hour: $calls_made,
            max_calls_per_hour: $max_calls,
            max_iterations: $max_iterations,
            last_action: $last_action,
            status: $status,
            exit_reason: $exit_reason
        }' > "$STATUS_FILE"
}

# Read current task from progress file
get_current_task() {
    if [[ ! -f "$PROGRESS_FILE" ]]; then
        echo ""
        return 1
    fi

    # Find first incomplete task
    local task
    task=$(jq -r '.tasks[] | select(.status == "pending" or .status == "in_progress") | .id' "$PROGRESS_FILE" 2>/dev/null | head -1)

    if [[ -z "$task" || "$task" == "null" ]]; then
        echo ""
        return 1
    fi

    echo "$task"
}

# Mark a task as complete in progress file
mark_task_complete() {
    local task_id=$1

    if [[ ! -f "$PROGRESS_FILE" ]]; then
        return 1
    fi

    local updated
    updated=$(jq --arg id "$task_id" \
        '(.tasks[] | select(.id == $id)).status = "complete"' \
        "$PROGRESS_FILE" 2>/dev/null)

    if [[ -n "$updated" ]]; then
        echo "$updated" > "$PROGRESS_FILE"
    fi
}

# Check if all tasks are complete
all_tasks_complete() {
    if [[ ! -f "$PROGRESS_FILE" ]]; then
        return 1
    fi

    local pending
    pending=$(jq '[.tasks[] | select(.status != "complete")] | length' "$PROGRESS_FILE" 2>/dev/null)

    [[ "$pending" == "0" ]]
}

# Get task counts for reporting
get_task_counts() {
    if [[ ! -f "$PROGRESS_FILE" ]]; then
        echo "0 0"
        return
    fi

    local total completed
    total=$(jq '.tasks | length' "$PROGRESS_FILE" 2>/dev/null || echo "0")
    completed=$(jq '[.tasks[] | select(.status == "complete")] | length' "$PROGRESS_FILE" 2>/dev/null || echo "0")

    echo "$total $completed"
}

# ─── Driver Management ──────────────────────────────────────────────────────

load_platform_driver() {
    local driver_file="$SCRIPT_DIR/drivers/${PLATFORM_DRIVER}.sh"
    if [[ ! -f "$driver_file" ]]; then
        log_status "ERROR" "Platform driver not found: $driver_file"
        exit 1
    fi

    # shellcheck source=/dev/null
    source "$driver_file"

    driver_valid_tools
    log_status "INFO" "Platform driver: $(driver_display_name) ($(driver_cli_binary))"
}

# ─── Execution ───────────────────────────────────────────────────────────────

execute_iteration() {
    local iteration=$1
    local task_id=$2
    local timestamp=$(date '+%Y-%m-%d_%H-%M-%S')
    local output_file="$LOG_DIR/claude_output_${timestamp}.log"
    local calls_made=$(cat "$CALL_COUNT_FILE" 2>/dev/null || echo "0")
    calls_made=$((calls_made + 1))

    # Capture git HEAD SHA at iteration start for progress detection
    local loop_start_sha=""
    if command -v git &>/dev/null && git rev-parse --git-dir &>/dev/null 2>&1; then
        loop_start_sha=$(git rev-parse HEAD 2>/dev/null || echo "")
    fi

    log_status "LOOP" "Iteration $iteration — Task: ${task_id:-'(reading from prompt)'}"
    local timeout_seconds=$((ITERATION_TIMEOUT_MINUTES * 60))

    # Build loop context
    local loop_context="Loop #${iteration}."
    if [[ -n "$task_id" ]]; then
        loop_context+=" Current task: $task_id."
    fi

    # Build the command via driver
    local session_id=""  # Fresh context per iteration
    if ! driver_build_command "$PROMPT_FILE" "$loop_context" "$session_id" "$PLUGIN_DIR"; then
        log_status "ERROR" "Failed to build CLI command"
        return 1
    fi

    log_status "INFO" "Starting $(driver_display_name) (timeout: ${ITERATION_TIMEOUT_MINUTES}m)..."

    # Execute with timeout
    local exit_code=0

    if [[ "$LIVE_OUTPUT" == "true" ]]; then
        # Live streaming mode
        echo -e "\n=== Iteration #$iteration — $(date '+%Y-%m-%d %H:%M:%S') ===" > "$LIVE_LOG_FILE"
        echo -e "${PURPLE}━━━━━━━━━━━━━ $(driver_display_name) Output ━━━━━━━━━━━━━${NC}"

        set -o pipefail
        portable_timeout ${timeout_seconds}s "${CLAUDE_CMD_ARGS[@]}" \
            < /dev/null 2>&1 | tee "$output_file" | tee "$LIVE_LOG_FILE"
        exit_code=${PIPESTATUS[0]}
        set +o pipefail

        echo -e "${PURPLE}━━━━━━━━━━━━━ End of Output ━━━━━━━━━━━━━━━━━━━${NC}"
    else
        # Background mode with progress monitoring
        portable_timeout ${timeout_seconds}s "${CLAUDE_CMD_ARGS[@]}" \
            < /dev/null > "$output_file" 2>&1 &

        local claude_pid=$!
        local progress_counter=0

        while kill -0 $claude_pid 2>/dev/null; do
            progress_counter=$((progress_counter + 1))
            if [[ -f "$output_file" && -s "$output_file" ]]; then
                cp "$output_file" "$LIVE_LOG_FILE" 2>/dev/null
            fi
            sleep 10
        done

        wait $claude_pid
        exit_code=$?
    fi

    if [[ $exit_code -eq 0 ]]; then
        echo "$calls_made" > "$CALL_COUNT_FILE"
        log_status "SUCCESS" "$(driver_display_name) iteration completed successfully"

        # Detect progress: check for file changes (committed or uncommitted)
        local files_changed=0
        if command -v git &>/dev/null && git rev-parse --git-dir &>/dev/null 2>&1; then
            local current_sha=$(git rev-parse HEAD 2>/dev/null || echo "")

            if [[ -n "$loop_start_sha" && -n "$current_sha" && "$loop_start_sha" != "$current_sha" ]]; then
                files_changed=$(
                    {
                        git diff --name-only "$loop_start_sha" "$current_sha" 2>/dev/null
                        git diff --name-only HEAD 2>/dev/null
                        git diff --name-only --cached 2>/dev/null
                    } | sort -u | wc -l
                )
            else
                files_changed=$(
                    {
                        git diff --name-only 2>/dev/null
                        git diff --name-only --cached 2>/dev/null
                    } | sort -u | wc -l
                )
            fi
        fi

        local has_errors="false"
        if grep -v '"[^"]*error[^"]*":' "$output_file" 2>/dev/null | \
           grep -qE '(^Error:|^ERROR:|^error:|\]: error|Error occurred|failed with error|[Ee]xception|Fatal|FATAL)'; then
            has_errors="true"
            log_status "WARN" "Errors detected in output"
        fi

        local output_length=$(wc -c < "$output_file" 2>/dev/null || echo 0)

        # Record in circuit breaker
        record_loop_result "$iteration" "$files_changed" "$has_errors" "$output_length"
        local circuit_result=$?

        if [[ $circuit_result -ne 0 ]]; then
            log_status "WARN" "Circuit breaker opened — halting execution"
            return 3
        fi

        return 0
    elif [[ $exit_code -eq 124 ]]; then
        log_status "WARN" "Iteration timed out after ${ITERATION_TIMEOUT_MINUTES}m"
        return 1
    else
        # Check for API limit
        if grep -qi "5.*hour.*limit\|limit.*reached.*try.*back\|usage.*limit.*reached" "$output_file" 2>/dev/null; then
            log_status "ERROR" "Claude API usage limit reached"
            return 2
        else
            log_status "ERROR" "$(driver_display_name) execution failed (exit code: $exit_code)"
            return 1
        fi
    fi
}

# ─── Cleanup ─────────────────────────────────────────────────────────────────

cleanup() {
    log_status "INFO" "Ralph loop interrupted. Cleaning up..."
    update_status "$loop_count" "$(cat "$CALL_COUNT_FILE" 2>/dev/null || echo "0")" "interrupted" "stopped" "user_cancelled"
    exit 0
}

trap cleanup SIGINT SIGTERM

# ─── Help ────────────────────────────────────────────────────────────────────

show_help() {
    cat << 'HELPEOF'
codeharness Ralph Loop — Autonomous execution with verification gates

Usage: ralph/ralph.sh --plugin-dir DIR [OPTIONS]

Required:
    --plugin-dir DIR          Path to codeharness plugin directory

Options:
    -h, --help                Show this help message
    --max-iterations NUM      Maximum loop iterations (default: 50)
    --timeout SECONDS         Total loop timeout in seconds (default: 14400 = 4h)
    --iteration-timeout MIN   Per-iteration timeout in minutes (default: 15)
    --calls NUM               Max API calls per hour (default: 100)
    --prompt FILE             Prompt file for each iteration
    --progress FILE           Progress file (tasks JSON)
    --live                    Show live output streaming
    --reset-circuit           Reset circuit breaker and exit
    --status                  Show current status and exit

The loop:
    1. Reads next task from progress file
    2. Spawns fresh Claude Code instance with --plugin-dir
    3. Agent implements story (harness hooks enforce verification)
    4. Circuit breaker monitors for stagnation
    5. On completion or gate failure, picks next task or iterates
HELPEOF
}

# ─── Main ────────────────────────────────────────────────────────────────────

main() {
    if [[ -z "$PLUGIN_DIR" ]]; then
        log_status "ERROR" "Missing required --plugin-dir argument"
        show_help
        exit 1
    fi

    # Resolve paths
    PLUGIN_DIR="$(cd "$PLUGIN_DIR" 2>/dev/null && pwd)" || {
        log_status "ERROR" "Plugin directory does not exist: $PLUGIN_DIR"
        exit 1
    }

    # Derive state paths from project root (cwd)
    local project_root
    project_root="$(pwd)"

    HARNESS_STATE_DIR="${project_root}/.claude"
    LOG_DIR="${project_root}/ralph/logs"
    STATUS_FILE="${project_root}/ralph/status.json"
    LIVE_LOG_FILE="${project_root}/ralph/live.log"
    CALL_COUNT_FILE="${project_root}/ralph/.call_count"
    TIMESTAMP_FILE="${project_root}/ralph/.last_reset"

    # Use progress file from argument or default
    PROGRESS_FILE="${PROGRESS_FILE:-${project_root}/ralph/progress.json}"

    # Use prompt file from argument or default
    PROMPT_FILE="${PROMPT_FILE:-${project_root}/.ralph/PROMPT.md}"

    # Create directories
    mkdir -p "$LOG_DIR"

    # Check dependencies
    if ! command -v jq &>/dev/null; then
        log_status "ERROR" "Required dependency 'jq' is not installed"
        exit 1
    fi

    # Load platform driver
    load_platform_driver

    # Check CLI binary
    if ! driver_check_available; then
        log_status "ERROR" "$(driver_display_name) CLI not found: $(driver_cli_binary)"
        exit 1
    fi

    # Initialize circuit breaker
    export HARNESS_STATE_DIR
    init_circuit_breaker

    # Initialize rate limiting
    init_call_tracking

    log_status "SUCCESS" "Ralph loop starting"
    log_status "INFO" "Plugin: $PLUGIN_DIR"
    log_status "INFO" "Max iterations: $MAX_ITERATIONS | Timeout: $((LOOP_TIMEOUT_SECONDS / 3600))h"
    log_status "INFO" "Prompt: $PROMPT_FILE"
    log_status "INFO" "Progress: $PROGRESS_FILE"

    # Record loop start time for timeout
    loop_start_time=$(date +%s)

    local consecutive_failures=0
    local max_consecutive_failures=3

    while true; do
        loop_count=$((loop_count + 1))

        # ── Check loop limits ──

        if [[ $loop_count -gt $MAX_ITERATIONS ]]; then
            log_status "WARN" "Max iterations reached ($MAX_ITERATIONS)"
            update_status "$loop_count" "$(cat "$CALL_COUNT_FILE" 2>/dev/null || echo "0")" "max_iterations" "stopped" "max_iterations_reached"

            local counts
            counts=$(get_task_counts)
            local total=${counts%% *}
            local completed=${counts##* }
            log_status "INFO" "Progress: $completed/$total tasks completed"
            break
        fi

        # Check total timeout
        local elapsed=$(( $(date +%s) - loop_start_time ))
        if [[ $elapsed -ge $LOOP_TIMEOUT_SECONDS ]]; then
            log_status "WARN" "Loop timeout reached (${LOOP_TIMEOUT_SECONDS}s)"
            update_status "$loop_count" "$(cat "$CALL_COUNT_FILE" 2>/dev/null || echo "0")" "timeout" "stopped" "loop_timeout"
            break
        fi

        # ── Check circuit breaker ──

        if should_halt_execution; then
            log_status "ERROR" "Circuit breaker open — halting"
            update_status "$loop_count" "$(cat "$CALL_COUNT_FILE" 2>/dev/null || echo "0")" "circuit_breaker" "halted" "stagnation_detected"
            break
        fi

        # ── Check rate limit ──

        if ! can_make_call; then
            wait_for_reset
            continue
        fi

        # ── Check task completion ──

        if all_tasks_complete; then
            log_status "SUCCESS" "All tasks complete!"

            local counts
            counts=$(get_task_counts)
            local total=${counts%% *}

            update_status "$loop_count" "$(cat "$CALL_COUNT_FILE" 2>/dev/null || echo "0")" "all_complete" "completed" "all_tasks_done"
            log_status "SUCCESS" "Completed $total tasks in $loop_count iterations"
            break
        fi

        # ── Get current task ──

        local current_task
        current_task=$(get_current_task)

        log_status "LOOP" "=== Iteration #$loop_count ==="
        update_status "$loop_count" "$(cat "$CALL_COUNT_FILE" 2>/dev/null || echo "0")" "executing" "running"

        # ── Execute ──

        execute_iteration "$loop_count" "$current_task"
        local exec_result=$?

        case $exec_result in
            0)
                consecutive_failures=0
                update_status "$loop_count" "$(cat "$CALL_COUNT_FILE" 2>/dev/null || echo "0")" "completed" "success"
                sleep 5  # Brief pause between iterations
                ;;
            2)
                # API limit — wait or exit
                log_status "WARN" "API usage limit reached. Waiting 60 minutes..."
                update_status "$loop_count" "$(cat "$CALL_COUNT_FILE" 2>/dev/null || echo "0")" "api_limit" "paused"
                sleep 3600
                ;;
            3)
                # Circuit breaker
                log_status "ERROR" "Circuit breaker opened — halting loop"
                update_status "$loop_count" "$(cat "$CALL_COUNT_FILE" 2>/dev/null || echo "0")" "circuit_breaker" "halted"
                break
                ;;
            *)
                # Failure — retry with backoff
                consecutive_failures=$((consecutive_failures + 1))
                if [[ $consecutive_failures -ge $max_consecutive_failures ]]; then
                    log_status "ERROR" "$max_consecutive_failures consecutive failures — halting"
                    update_status "$loop_count" "$(cat "$CALL_COUNT_FILE" 2>/dev/null || echo "0")" "consecutive_failures" "halted"
                    break
                fi

                update_status "$loop_count" "$(cat "$CALL_COUNT_FILE" 2>/dev/null || echo "0")" "failed" "error"
                log_status "WARN" "Iteration failed ($consecutive_failures/$max_consecutive_failures). Waiting 30s..."
                sleep 30
                ;;
        esac

        log_status "LOOP" "=== End Iteration #$loop_count ==="
    done

    # Final summary
    local counts
    counts=$(get_task_counts)
    local total=${counts%% *}
    local completed=${counts##* }

    log_status "SUCCESS" "Ralph loop finished"
    log_status "INFO" "  Iterations: $loop_count"
    log_status "INFO" "  Tasks completed: $completed/$total"
    log_status "INFO" "  API calls: $(cat "$CALL_COUNT_FILE" 2>/dev/null || echo "0")"
}

# ─── CLI Parsing ─────────────────────────────────────────────────────────────

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        --plugin-dir)
            PLUGIN_DIR="$2"
            shift 2
            ;;
        --max-iterations)
            MAX_ITERATIONS="$2"
            shift 2
            ;;
        --timeout)
            LOOP_TIMEOUT_SECONDS="$2"
            shift 2
            ;;
        --iteration-timeout)
            ITERATION_TIMEOUT_MINUTES="$2"
            shift 2
            ;;
        --calls)
            MAX_CALLS_PER_HOUR="$2"
            shift 2
            ;;
        --prompt)
            PROMPT_FILE="$2"
            shift 2
            ;;
        --progress)
            PROGRESS_FILE="$2"
            shift 2
            ;;
        --live)
            LIVE_OUTPUT=true
            shift
            ;;
        --reset-circuit)
            init_circuit_breaker
            reset_circuit_breaker "Manual reset via CLI"
            echo "Circuit breaker reset to CLOSED"
            exit 0
            ;;
        --status)
            if [[ -n "$STATUS_FILE" && -f "$STATUS_FILE" ]]; then
                jq . "$STATUS_FILE" 2>/dev/null || cat "$STATUS_FILE"
            else
                echo "No status file found."
            fi
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

main

fi
