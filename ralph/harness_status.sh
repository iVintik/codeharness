#!/usr/bin/env bash
# harness_status.sh — Show harness health, sprint progress, and verification state
# Follows the `git status` model: health → enforcement → progress → next action
#
# Usage: ralph/harness_status.sh --project-dir DIR

set -e

PROJECT_DIR=""

show_help() {
    cat << 'HELPEOF'
Harness Status — show health, progress, and verification at a glance

Usage:
    ralph/harness_status.sh --project-dir DIR

Output sections:
    1. Health line (version, stack, Docker, Victoria)
    2. Enforcement config (frontend, database, api, observability)
    3. Sprint progress (per-story pass/pending/in-progress)
    4. Next action hint

Options:
    --project-dir DIR   Project root directory
    -h, --help          Show this help message
HELPEOF
}

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        --project-dir)
            PROJECT_DIR="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

if [[ -z "$PROJECT_DIR" ]]; then
    echo "Error: --project-dir is required" >&2
    exit 1
fi

STATE_FILE="$PROJECT_DIR/.claude/codeharness.local.md"
PROGRESS_FILE="$PROJECT_DIR/ralph/progress.json"
LOOP_STATUS_FILE="$PROJECT_DIR/ralph/status.json"

# ─── Check initialized ───────────────────────────────────────────────────

if [[ ! -f "$STATE_FILE" ]]; then
    echo "Harness not initialized."
    echo ""
    echo "  → Run /harness-init to set up the harness"
    exit 1
fi

# ─── Parse state file ────────────────────────────────────────────────────

get_yaml_val() {
    local key="$1"
    grep -o "${key}: *[^ ]*" "$STATE_FILE" 2>/dev/null | head -1 | sed "s/${key}: *//" | tr -d '"'
}

VERSION=$(get_yaml_val "harness_version")
STACK=$(get_yaml_val "stack")

# Enforcement
E_FRONTEND=$(get_yaml_val "frontend")
E_DATABASE=$(get_yaml_val "database")
E_API=$(get_yaml_val "api")
E_OBSERVABILITY=$(get_yaml_val "observability")

on_off() {
    if [[ "$1" == "true" ]]; then echo "ON"; else echo "OFF"; fi
}

# ─── Health line ──────────────────────────────────────────────────────────

echo "Harness Status — codeharness v${VERSION:-0.1.0}"
echo ""

# Stack
echo "  Stack: ${STACK:-unknown}"

# Loop status
if [[ -f "$LOOP_STATUS_FILE" ]]; then
    local_loop=$(jq -r '.loop_count // 0' "$LOOP_STATUS_FILE" 2>/dev/null || echo "0")
    local_status=$(jq -r '.status // "idle"' "$LOOP_STATUS_FILE" 2>/dev/null || echo "idle")
    echo "  Loop: iteration $local_loop ($local_status)"
fi

echo ""

# ─── Enforcement ──────────────────────────────────────────────────────────

echo "  Enforcement:"
printf "    frontend:%-4s database:%-4s api:%-4s observability:%-4s\n" \
    "$(on_off "$E_FRONTEND")" "$(on_off "$E_DATABASE")" \
    "$(on_off "$E_API")" "$(on_off "$E_OBSERVABILITY")"
echo ""

# ─── Sprint progress ─────────────────────────────────────────────────────

if [[ -f "$PROGRESS_FILE" ]]; then
    total=$(jq '.tasks | length' "$PROGRESS_FILE" 2>/dev/null || echo "0")
    completed=$(jq '[.tasks[] | select(.status == "complete")] | length' "$PROGRESS_FILE" 2>/dev/null || echo "0")

    echo "  Sprint: $completed/$total stories"
    echo ""

    # Per-story status
    jq -r '.tasks[] | "\(.status)\t\(.id)\t\(.title)"' "$PROGRESS_FILE" 2>/dev/null | \
    while IFS=$'\t' read -r st id title; do
        case "$st" in
            complete)    marker="[PASS]" ;;
            in_progress) marker="[ >> ]" ;;
            *)           marker="[    ]" ;;
        esac
        # Truncate title to keep under 100 chars
        printf "    %s %s: %s\n" "$marker" "$id" "${title:0:60}"
    done

    echo ""

    # Verification summary
    VLOG="$PROJECT_DIR/ralph/verification-log.json"
    if [[ -f "$VLOG" ]]; then
        v_total=$(jq '.events | length' "$VLOG" 2>/dev/null || echo "0")
        v_pass=$(jq '[.events[] | select(.result == "pass")] | length' "$VLOG" 2>/dev/null || echo "0")
        echo "  Verification: $v_pass passed / $v_total checks"
        echo ""
    fi

    # Next action
    current=$(jq -r '.tasks[] | select(.status == "pending" or .status == "in_progress") | .id' "$PROGRESS_FILE" 2>/dev/null | head -1)
    if [[ -n "$current" && "$current" != "null" ]]; then
        current_title=$(jq -r --arg id "$current" '.tasks[] | select(.id == $id) | .title' "$PROGRESS_FILE" 2>/dev/null)
        echo "  → Current: $current ($current_title)"
    elif [[ "$completed" == "$total" && "$total" != "0" ]]; then
        echo "  → All stories complete!"
    else
        echo "  → Run /harness-run to start execution"
    fi
else
    echo "  No sprint progress file found."
    echo ""
    echo "  → Run /harness-run to start execution"
fi
