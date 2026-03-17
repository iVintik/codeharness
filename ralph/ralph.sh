#!/usr/bin/env bash
# codeharness Ralph Loop — Vendored from snarktank/ralph
# Autonomous execution loop that spawns fresh Claude Code instances per iteration
# with verification gates, crash recovery, rate limiting, and circuit breaker protection.
#
# Usage: ralph/ralph.sh --plugin-dir ./codeharness [OPTIONS]

set -e

# DEBUG: catch unexpected exits from set -e
trap 'echo "[$(date "+%Y-%m-%d %H:%M:%S")] [FATAL] ralph.sh died at line $LINENO (exit code: $?)" >> "${LOG_DIR:-ralph/logs}/ralph_crash.log" 2>/dev/null' ERR

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

# Progress file (legacy — kept for backwards compat, optional)
PROGRESS_FILE=""

# Sprint status file (primary task source — read by /harness-run skill)
SPRINT_STATUS_FILE=""

# Prompt file for each iteration
PROMPT_FILE=""

# Logging
LOG_DIR=""

# Loop limits
MAX_ITERATIONS=${MAX_ITERATIONS:-50}
MAX_STORY_RETRIES=${MAX_STORY_RETRIES:-3}
LOOP_TIMEOUT_SECONDS=${LOOP_TIMEOUT_SECONDS:-14400}  # 4 hours default
ITERATION_TIMEOUT_MINUTES=${ITERATION_TIMEOUT_MINUTES:-30}

# Rate limiting
MAX_CALLS_PER_HOUR=${MAX_CALLS_PER_HOUR:-100}
RATE_LIMIT_SLEEP=3600  # 1 hour

# Driver
PLATFORM_DRIVER="${PLATFORM_DRIVER:-claude-code}"
CLAUDE_OUTPUT_FORMAT="${CLAUDE_OUTPUT_FORMAT:-json}"
CLAUDE_ALLOWED_TOOLS="${CLAUDE_ALLOWED_TOOLS:-}"
CLAUDE_USE_CONTINUE="${CLAUDE_USE_CONTINUE:-false}"  # Fresh context per iteration by default

# Reset retry state on start
RESET_RETRIES=false

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
STORY_RETRY_FILE=""
FLAGGED_STORIES_FILE=""

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

    # codeharness: Include sprint-status story counts in status JSON
    local stories_total=0
    local stories_completed=0
    if [[ -n "$SPRINT_STATUS_FILE" && -f "$SPRINT_STATUS_FILE" ]]; then
        local sprint_counts
        sprint_counts=$(get_task_counts)
        stories_total=${sprint_counts%% *}
        stories_completed=${sprint_counts##* }
    fi

    local stories_remaining=$((stories_total - stories_completed))
    local elapsed_seconds=0
    if [[ -n "$loop_start_time" ]]; then
        elapsed_seconds=$(( $(date +%s) - loop_start_time ))
    fi

    # Build flagged stories JSON array
    local flagged_json="[]"
    if [[ -n "$FLAGGED_STORIES_FILE" && -f "$FLAGGED_STORIES_FILE" ]]; then
        flagged_json=$(jq -R -s 'split("\n") | map(select(length > 0))' < "$FLAGGED_STORIES_FILE")
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
        --argjson stories_total "$stories_total" \
        --argjson stories_completed "$stories_completed" \
        --argjson stories_remaining "$stories_remaining" \
        --argjson elapsed_seconds "$elapsed_seconds" \
        --argjson flagged_stories "$flagged_json" \
        '{
            timestamp: $timestamp,
            version: $version,
            loop_count: $loop_count,
            calls_made_this_hour: $calls_made,
            max_calls_per_hour: $max_calls,
            max_iterations: $max_iterations,
            last_action: $last_action,
            status: $status,
            exit_reason: $exit_reason,
            stories_total: $stories_total,
            stories_completed: $stories_completed,
            stories_remaining: $stories_remaining,
            elapsed_seconds: $elapsed_seconds,
            flagged_stories: $flagged_stories
        }' > "$STATUS_FILE"
}

# codeharness: Task picking is handled by /harness-run skill inside each Claude session.
# Ralph just spawns sessions and checks sprint-status.yaml for completion.
get_current_task() {
    # No-op — task picking is done by the /harness-run skill, not Ralph.
    echo ""
    return 0
}

# codeharness: Check if all stories in sprint-status.yaml are done.
# Reads development_status entries matching N-N-slug pattern (story keys).
# Returns 0 (true) if ALL story entries have status "done", 1 otherwise.
check_sprint_complete() {
    if [[ ! -f "$SPRINT_STATUS_FILE" ]]; then
        return 1
    fi

    local total=0
    local done_count=0

    while IFS=: read -r key value; do
        # Trim whitespace
        key=$(echo "$key" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        value=$(echo "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

        # Skip comments and empty lines
        [[ -z "$key" || "$key" == \#* ]] && continue

        # Match story keys: N-N-slug (e.g. 5-1-ralph-loop-integration)
        if [[ "$key" =~ ^[0-9]+-[0-9]+- ]]; then
            total=$((total + 1))
            if [[ "$value" == "done" ]]; then
                done_count=$((done_count + 1))
            fi
        fi
    done < "$SPRINT_STATUS_FILE"

    if [[ $total -eq 0 ]]; then
        return 1
    fi

    [[ $done_count -eq $total ]]
}

# codeharness: Replaces all_tasks_complete() with sprint-status.yaml check.
all_tasks_complete() {
    check_sprint_complete
}

# codeharness: Get story counts from sprint-status.yaml.
# Returns "total completed" (space-separated).
get_task_counts() {
    if [[ ! -f "$SPRINT_STATUS_FILE" ]]; then
        echo "0 0"
        return
    fi

    local total=0
    local completed=0

    while IFS=: read -r key value; do
        key=$(echo "$key" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        value=$(echo "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

        [[ -z "$key" || "$key" == \#* ]] && continue

        if [[ "$key" =~ ^[0-9]+-[0-9]+- ]]; then
            total=$((total + 1))
            if [[ "$value" == "done" ]]; then
                completed=$((completed + 1))
            fi
        fi
    done < "$SPRINT_STATUS_FILE"

    echo "$total $completed"
}

# ─── Retry Tracking ─────────────────────────────────────────────────────────

# Increment retry count for a story. Returns the new count.
increment_story_retry() {
    local story_key=$1

    if [[ -z "$STORY_RETRY_FILE" ]]; then
        echo "0"
        return
    fi

    local count=0
    local temp_file="${STORY_RETRY_FILE}.tmp"

    # Read current count if file exists
    if [[ -f "$STORY_RETRY_FILE" ]]; then
        local line
        while IFS=' ' read -r key val; do
            if [[ "$key" == "$story_key" ]]; then
                count=$((val + 0))
            fi
        done < "$STORY_RETRY_FILE"
    fi

    count=$((count + 1))

    # Rewrite the file with updated count (atomic via temp file + mv)
    # Clean up stale temp file from any previous crash
    rm -f "$temp_file" 2>/dev/null

    if [[ -f "$STORY_RETRY_FILE" ]]; then
        local found=false
        while IFS=' ' read -r key val; do
            if [[ "$key" == "$story_key" ]]; then
                echo "$key $count" >> "$temp_file"
                found=true
            else
                echo "$key $val" >> "$temp_file"
            fi
        done < "$STORY_RETRY_FILE"
        if [[ "$found" == "false" ]]; then
            echo "$story_key $count" >> "$temp_file"
        fi
        mv "$temp_file" "$STORY_RETRY_FILE"
    else
        echo "$story_key $count" > "$STORY_RETRY_FILE"
    fi

    echo "$count"
}

# Get current retry count for a story (0 if not tracked).
get_story_retry_count() {
    local story_key=$1

    if [[ -z "$STORY_RETRY_FILE" || ! -f "$STORY_RETRY_FILE" ]]; then
        echo "0"
        return
    fi

    while IFS=' ' read -r key val; do
        if [[ "$key" == "$story_key" ]]; then
            echo "$((val + 0))"
            return
        fi
    done < "$STORY_RETRY_FILE"

    echo "0"
}

# Check if a story is flagged (exceeded retry limit).
is_story_flagged() {
    local story_key=$1

    if [[ -z "$FLAGGED_STORIES_FILE" || ! -f "$FLAGGED_STORIES_FILE" ]]; then
        return 1
    fi

    grep -qx "$story_key" "$FLAGGED_STORIES_FILE" 2>/dev/null
}

# Flag a story that exceeded retry limit.
flag_story() {
    local story_key=$1

    if [[ -z "$FLAGGED_STORIES_FILE" ]]; then
        return
    fi

    if ! is_story_flagged "$story_key"; then
        echo "$story_key" >> "$FLAGGED_STORIES_FILE"
    fi
}

# Get list of flagged stories (newline-separated).
get_flagged_stories() {
    if [[ -z "$FLAGGED_STORIES_FILE" || ! -f "$FLAGGED_STORIES_FILE" ]]; then
        echo ""
        return
    fi
    cat "$FLAGGED_STORIES_FILE"
}

# Snapshot sprint-status.yaml story statuses as "key:status" lines.
snapshot_story_statuses() {
    if [[ ! -f "$SPRINT_STATUS_FILE" ]]; then
        echo ""
        return
    fi

    while IFS=: read -r key value; do
        key=$(echo "$key" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        value=$(echo "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        [[ -z "$key" || "$key" == \#* ]] && continue
        if [[ "$key" =~ ^[0-9]+-[0-9]+- ]]; then
            echo "$key:$value"
        fi
    done < "$SPRINT_STATUS_FILE"
}

# Compare before/after snapshots to detect story changes.
# Sets CHANGED_STORIES (newly done) and UNCHANGED_STORIES (not done).
detect_story_changes() {
    local before_snapshot=$1
    local after_snapshot=$2

    CHANGED_STORIES=""
    UNCHANGED_STORIES=""

    # Parse after snapshot
    while IFS=: read -r key status; do
        [[ -z "$key" ]] && continue
        local before_status=""
        # Find the same key in before snapshot
        while IFS=: read -r bkey bstatus; do
            if [[ "$bkey" == "$key" ]]; then
                before_status="$bstatus"
                break
            fi
        done <<< "$before_snapshot"

        if [[ "$status" == "done" && "$before_status" != "done" ]]; then
            CHANGED_STORIES="${CHANGED_STORIES}${key}
"
        elif [[ "$status" != "done" ]]; then
            UNCHANGED_STORIES="${UNCHANGED_STORIES}${key}
"
        fi
    done <<< "$after_snapshot"
}

# ─── Progress Summary ───────────────────────────────────────────────────────

print_progress_summary() {
    local counts
    counts=$(get_task_counts)
    local total=${counts%% *}
    local completed=${counts##* }
    local remaining=$((total - completed))
    local elapsed=$(( $(date +%s) - loop_start_time ))
    local elapsed_fmt

    if [[ $elapsed -ge 3600 ]]; then
        elapsed_fmt="$((elapsed / 3600))h$((elapsed % 3600 / 60))m"
    elif [[ $elapsed -ge 60 ]]; then
        elapsed_fmt="$((elapsed / 60))m$((elapsed % 60))s"
    else
        elapsed_fmt="${elapsed}s"
    fi

    log_status "INFO" "Progress: ${completed}/${total} done, ${remaining} remaining (iterations: ${loop_count}, elapsed: ${elapsed_fmt})"

    # Show the next story in line (first non-done, non-flagged)
    if [[ -f "$SPRINT_STATUS_FILE" ]]; then
        local next_story=""
        while IFS=: read -r key value; do
            key=$(echo "$key" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
            value=$(echo "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
            [[ -z "$key" || "$key" == \#* ]] && continue
            if [[ "$key" =~ ^[0-9]+-[0-9]+- && "$value" != "done" ]]; then
                if ! is_story_flagged "$key"; then
                    next_story="$key ($value)"
                    break
                fi
            fi
        done < "$SPRINT_STATUS_FILE"
        if [[ -n "$next_story" ]]; then
            log_status "INFO" "Next up: ${next_story}"
        fi
    fi
}

# ─── Iteration Insights ──────────────────────────────────────────────────────

print_iteration_insights() {
    local project_root
    project_root="$(pwd)"
    local issues_file="$project_root/_bmad-output/implementation-artifacts/.session-issues.md"
    local today
    today=$(date +%Y-%m-%d)
    local retro_file="$project_root/_bmad-output/implementation-artifacts/session-retro-${today}.md"

    # Show session issues (last 20 lines — most recent subagent)
    if [[ -f "$issues_file" ]]; then
        local issue_count
        issue_count=$(grep -c '^### ' "$issues_file" 2>/dev/null || echo "0")
        if [[ $issue_count -gt 0 ]]; then
            echo ""
            log_status "INFO" "━━━ Session Issues ($issue_count entries) ━━━"
            # Print the last subagent's issues block
            awk '/^### /{block=""} {block=block $0 "\n"} END{printf "%s", block}' "$issues_file" | head -15
            echo ""
        fi
    fi

    # Show retro summary if generated
    if [[ -f "$retro_file" ]]; then
        log_status "INFO" "━━━ Session Retro ━━━"
        # Print action items section if present, otherwise first 10 lines
        if grep -q '## Action items\|## Action Items' "$retro_file" 2>/dev/null; then
            sed -n '/^## Action [Ii]tems/,/^## /p' "$retro_file" | head -20
        else
            head -10 "$retro_file"
        fi
        echo ""
    fi
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

    # Auto-populate CLAUDE_ALLOWED_TOOLS from driver's valid tool patterns
    # so Ralph runs autonomously without permission prompts
    if [[ -z "$CLAUDE_ALLOWED_TOOLS" && ${#VALID_TOOL_PATTERNS[@]} -gt 0 ]]; then
        CLAUDE_ALLOWED_TOOLS=$(IFS=','; echo "${VALID_TOOL_PATTERNS[*]}")
    fi

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

    # Build loop context — pass time budget so the session can prioritize retro
    local start_time
    start_time=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local loop_context="Loop #${iteration}. Time budget: ${ITERATION_TIMEOUT_MINUTES} minutes (started: ${start_time}). Reserve the last 5 minutes for Step 8 (session retrospective) — do not start new story work if less than 10 minutes remain."
    if [[ -n "$task_id" ]]; then
        loop_context+=" Current task: $task_id."
    fi

    # Build the command via driver
    local session_id=""  # Fresh context per iteration
    if ! driver_build_command "$PROMPT_FILE" "$loop_context" "$session_id" "$PLUGIN_DIR"; then
        log_status "ERROR" "Failed to build CLI command"
        return 1
    fi

    # Write deadline file for time-warning hook
    local deadline=$(( $(date +%s) + timeout_seconds ))
    echo "$deadline" > "ralph/.iteration_deadline"

    # DEBUG: log the command being run
    log_status "DEBUG" "Command: ${CLAUDE_CMD_ARGS[*]}"
    log_status "DEBUG" "Output file: $output_file"
    log_status "DEBUG" "LIVE_OUTPUT=$LIVE_OUTPUT, timeout=${timeout_seconds}s"

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

        log_status "DEBUG" "Background PID: $claude_pid"

        while kill -0 $claude_pid 2>/dev/null; do
            progress_counter=$((progress_counter + 1))
            if [[ -f "$output_file" && -s "$output_file" ]]; then
                cp "$output_file" "$LIVE_LOG_FILE" 2>/dev/null
            fi
            sleep 10
        done

        # Protect wait from set -e — capture exit code without crashing
        set +e
        wait $claude_pid
        exit_code=$?
        set -e
        log_status "DEBUG" "Claude exited with code: $exit_code, output size: $(wc -c < "$output_file" 2>/dev/null || echo 0) bytes"

        # If output is empty and exit code is non-zero, log diagnostic info
        if [[ ! -s "$output_file" && $exit_code -ne 0 ]]; then
            log_status "ERROR" "Claude produced no output and exited with code $exit_code"
            log_status "DEBUG" "Checking if claude binary is responsive..."
            if claude --version > /dev/null 2>&1; then
                log_status "DEBUG" "claude binary OK: $(claude --version 2>&1)"
            else
                log_status "ERROR" "claude binary not responding"
            fi
        fi
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

    # Print progress summary on interruption
    if [[ -n "$loop_start_time" && -n "$SPRINT_STATUS_FILE" ]]; then
        local counts
        counts=$(get_task_counts)
        local total=${counts%% *}
        local completed=${counts##* }
        local elapsed=$(( $(date +%s) - loop_start_time ))
        local elapsed_min=$(( elapsed / 60 ))

        log_status "INFO" "  Iterations: $loop_count"
        log_status "INFO" "  Stories completed: $completed/$total"
        log_status "INFO" "  Elapsed: ${elapsed_min}m"
    fi

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
    --max-story-retries NUM   Max retries per story before flagging (default: 3)
    --timeout SECONDS         Total loop timeout in seconds (default: 14400 = 4h)
    --iteration-timeout MIN   Per-iteration timeout in minutes (default: 30)
    --calls NUM               Max API calls per hour (default: 100)
    --prompt FILE             Prompt file for each iteration
    --progress FILE           Progress file (tasks JSON)
    --live                    Show live output streaming
    --reset                   Clear retry counters, flagged stories, and circuit breaker before starting
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
    STORY_RETRY_FILE="${project_root}/ralph/.story_retries"
    FLAGGED_STORIES_FILE="${project_root}/ralph/.flagged_stories"

    # Use progress file from argument or default (legacy, optional)
    PROGRESS_FILE="${PROGRESS_FILE:-${project_root}/ralph/progress.json}"

    # codeharness: Sprint status file is the primary task source
    SPRINT_STATUS_FILE="${project_root}/_bmad-output/implementation-artifacts/sprint-status.yaml"

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

    # Crash recovery: detect if resuming from a previous run
    if [[ -f "$STATUS_FILE" ]]; then
        local prev_status
        prev_status=$(jq -r '.status // ""' "$STATUS_FILE" 2>/dev/null || echo "")
        if [[ -n "$prev_status" && "$prev_status" != "completed" ]]; then
            log_status "INFO" "Resuming from last completed story"
        fi
    fi

    # Reset retry state if --reset flag was passed
    if [[ "$RESET_RETRIES" == "true" ]]; then
        if [[ -f "$STORY_RETRY_FILE" ]]; then
            rm -f "$STORY_RETRY_FILE"
            log_status "INFO" "Cleared story retry counters"
        fi
        if [[ -f "$FLAGGED_STORIES_FILE" ]]; then
            rm -f "$FLAGGED_STORIES_FILE"
            log_status "INFO" "Cleared flagged stories"
        fi
        reset_circuit_breaker "Reset via --reset flag"
        log_status "INFO" "Circuit breaker reset to CLOSED"
    fi

    # .story_retries and .flagged_stories are file-based — they persist automatically

    log_status "SUCCESS" "Ralph loop starting"
    log_status "INFO" "Plugin: $PLUGIN_DIR"
    log_status "INFO" "Max iterations: $MAX_ITERATIONS | Timeout: $((LOOP_TIMEOUT_SECONDS / 3600))h"
    log_status "INFO" "Prompt: $PROMPT_FILE"
    log_status "INFO" "Sprint status: $SPRINT_STATUS_FILE"
    log_status "INFO" "Max story retries: $MAX_STORY_RETRIES"

    # Record loop start time for timeout
    loop_start_time=$(date +%s)

    local consecutive_failures=0
    local max_consecutive_failures=3

    while true; do
        loop_count=$((loop_count + 1))

        # ── Check loop limits ──

        if [[ $loop_count -gt $MAX_ITERATIONS ]]; then
            update_status "$loop_count" "$(cat "$CALL_COUNT_FILE" 2>/dev/null || echo "0")" "max_iterations" "stopped" "max_iterations_reached"

            local counts
            counts=$(get_task_counts)
            local total=${counts%% *}
            local completed=${counts##* }
            log_status "INFO" "Max iterations ($MAX_ITERATIONS) reached. ${completed}/${total} stories complete."
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
            local cb_no_progress=0
            if [[ -f "$CB_STATE_FILE" ]]; then
                cb_no_progress=$(jq -r '.consecutive_no_progress // 0' "$CB_STATE_FILE" 2>/dev/null || echo "0")
            fi
            log_status "WARN" "Circuit breaker: no progress in ${cb_no_progress} iterations"
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
            local counts
            counts=$(get_task_counts)
            local total=${counts%% *}

            update_status "$loop_count" "$(cat "$CALL_COUNT_FILE" 2>/dev/null || echo "0")" "all_complete" "completed" "all_tasks_done"
            log_status "SUCCESS" "All stories complete. ${total} stories verified in ${loop_count} iterations."
            break
        fi

        # ── Get current task ──

        local current_task
        current_task=$(get_current_task)

        log_status "LOOP" "=== Iteration #$loop_count ==="
        update_status "$loop_count" "$(cat "$CALL_COUNT_FILE" 2>/dev/null || echo "0")" "executing" "running"

        # ── Snapshot story statuses before iteration ──
        local before_snapshot
        before_snapshot=$(snapshot_story_statuses)

        # ── Execute ──

        execute_iteration "$loop_count" "$current_task"
        local exec_result=$?

        case $exec_result in
            0)
                consecutive_failures=0
                update_status "$loop_count" "$(cat "$CALL_COUNT_FILE" 2>/dev/null || echo "0")" "completed" "success"

                # ── Retry tracking: compare sprint-status before/after ──
                local after_snapshot
                after_snapshot=$(snapshot_story_statuses)
                detect_story_changes "$before_snapshot" "$after_snapshot"

                # Only increment retry for the FIRST non-done, non-flagged story
                # (the one harness-run would have picked up). Other stories were
                # never attempted — don't penalise them for not progressing.
                if [[ -n "$UNCHANGED_STORIES" ]]; then
                    while IFS= read -r skey; do
                        [[ -z "$skey" ]] && continue
                        if is_story_flagged "$skey"; then
                            continue
                        fi
                        local retry_count
                        retry_count=$(increment_story_retry "$skey")
                        if [[ $retry_count -gt $MAX_STORY_RETRIES ]]; then
                            log_status "WARN" "Story ${skey} exceeded retry limit (${retry_count}) — flagging and moving on"
                            flag_story "$skey"
                        else
                            log_status "WARN" "Story ${skey} — retry ${retry_count}/${MAX_STORY_RETRIES}"
                        fi
                        break  # only retry the first actionable story
                    done <<< "$UNCHANGED_STORIES"
                fi

                if [[ -n "$CHANGED_STORIES" ]]; then
                    while IFS= read -r skey; do
                        [[ -z "$skey" ]] && continue
                        # Extract story title from story file if available
                        local story_file="$project_root/_bmad-output/implementation-artifacts/${skey}.md"
                        local story_title=""
                        if [[ -f "$story_file" ]]; then
                            story_title=$(grep -m1 '^# \|^## Story' "$story_file" 2>/dev/null | sed 's/^#* *//' | head -c 60)
                        fi
                        local proof_file="$project_root/verification/${skey}-proof.md"
                        local proof_info=""
                        if [[ -f "$proof_file" ]]; then
                            proof_info=" [proof: verification/${skey}-proof.md]"
                        fi
                        if [[ -n "$story_title" ]]; then
                            log_status "SUCCESS" "Story ${skey}: DONE — ${story_title}${proof_info}"
                        else
                            log_status "SUCCESS" "Story ${skey}: DONE${proof_info}"
                        fi
                    done <<< "$CHANGED_STORIES"
                fi

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

        # Print progress summary after every iteration
        print_progress_summary

        # ── Show session issues and retro highlights ──
        print_iteration_insights

        log_status "LOOP" "=== End Iteration #$loop_count ==="
    done

    # Final summary — reads from sprint-status.yaml
    local counts
    counts=$(get_task_counts)
    local total=${counts%% *}
    local completed=${counts##* }

    local elapsed_total=$(( $(date +%s) - loop_start_time ))
    local elapsed_min=$(( elapsed_total / 60 ))

    log_status "SUCCESS" "Ralph loop finished"
    log_status "INFO" "  Iterations: $loop_count"
    log_status "INFO" "  Stories completed: $completed/$total"
    log_status "INFO" "  Elapsed: ${elapsed_min}m"
    log_status "INFO" "  API calls: $(cat "$CALL_COUNT_FILE" 2>/dev/null || echo "0")"

    if [[ $completed -eq $total && $total -gt 0 ]]; then
        log_status "SUCCESS" "All stories complete. $total stories verified in $loop_count iterations."
    fi

    # Write final summary to status file
    update_status "$loop_count" "$(cat "$CALL_COUNT_FILE" 2>/dev/null || echo "0")" "final_summary" \
        "$(if [[ $completed -eq $total && $total -gt 0 ]]; then echo "completed"; else echo "stopped"; fi)" \
        "completed:$completed/$total"

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
        --max-story-retries)
            MAX_STORY_RETRIES="$2"
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
        --reset)
            RESET_RETRIES=true
            shift
            ;;
        --reset-circuit)
            # Derive state paths so circuit breaker uses the correct directory
            HARNESS_STATE_DIR="$(pwd)/.claude"
            export HARNESS_STATE_DIR
            init_circuit_breaker
            reset_circuit_breaker "Manual reset via CLI"
            echo "Circuit breaker reset to CLOSED"
            exit 0
            ;;
        --status)
            _status_file="$(pwd)/ralph/status.json"
            if [[ -f "$_status_file" ]]; then
                jq . "$_status_file" 2>/dev/null || cat "$_status_file"
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
