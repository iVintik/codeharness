#!/usr/bin/env bash
# exec_plans.sh — Exec-Plan Lifecycle Management
# Generates per-story exec-plan files and moves them from active→completed.
#
# Usage:
#   ralph/exec_plans.sh generate --progress PATH --output-dir DIR
#   ralph/exec_plans.sh complete --story-id ID --output-dir DIR --proof-path PATH

set -e

# ─── CLI ──────────────────────────────────────────────────────────────────

ACTION=""
PROGRESS_FILE=""
OUTPUT_DIR=""
STORY_ID=""
PROOF_PATH=""

show_help() {
    cat << 'HELPEOF'
Exec-Plan Lifecycle — track stories from active to completed

Usage:
    ralph/exec_plans.sh generate --progress PATH --output-dir DIR
    ralph/exec_plans.sh complete --story-id ID --output-dir DIR --proof-path PATH

Commands:
    generate    Create exec-plan files from progress.json
                Pending/in_progress → active/, complete → completed/
    complete    Move an exec-plan from active/ to completed/
                Appends verification summary and Showboat proof link

Options:
    --progress PATH     Path to ralph/progress.json
    --output-dir DIR    Base directory for exec-plans (contains active/ and completed/)
    --story-id ID       Story ID to complete (e.g., "1.1")
    --proof-path PATH   Relative path to Showboat proof document
    -h, --help          Show this help message
HELPEOF
}

# Parse action first
if [[ $# -gt 0 && "$1" != -* ]]; then
    ACTION="$1"
    shift
fi

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        --progress)
            PROGRESS_FILE="$2"
            shift 2
            ;;
        --output-dir)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --story-id)
            STORY_ID="$2"
            shift 2
            ;;
        --proof-path)
            PROOF_PATH="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

# ─── Generate exec-plan for a single task ─────────────────────────────────

generate_exec_plan_from_index() {
    local progress_file="$1"
    local index="$2"
    local target_dir="$3"

    local id title epic description status proof_path
    id=$(jq -r ".tasks[$index].id" "$progress_file")
    title=$(jq -r ".tasks[$index].title" "$progress_file")
    epic=$(jq -r ".tasks[$index].epic // \"Unknown\"" "$progress_file")
    description=$(jq -r ".tasks[$index].description // \"\"" "$progress_file")
    status=$(jq -r ".tasks[$index].status // \"pending\"" "$progress_file")
    proof_path=$(jq -r ".tasks[$index].verification.proof_path // \"\"" "$progress_file")

    local file="$target_dir/$id.md"

    # Don't overwrite existing exec-plans (idempotency)
    if [[ -f "$file" ]]; then
        return 0
    fi

    # Build acceptance criteria list
    local ac_list=""
    local ac_count
    ac_count=$(jq ".tasks[$index].acceptance_criteria | length" "$progress_file")
    local j
    for ((j=0; j<ac_count; j++)); do
        local ac
        ac=$(jq -r ".tasks[$index].acceptance_criteria[$j]" "$progress_file")
        ac_list="${ac_list}- ${ac}
"
    done

    {
        echo "# Story $id: $title"
        echo ""
        echo "**Epic:** $epic"
        echo "**Status:** $status"
        echo ""
        echo "## Description"
        echo ""
        echo "$description"
        echo ""
        echo "## Acceptance Criteria"
        echo ""
        if [[ -n "$ac_list" ]]; then
            echo "$ac_list"
        else
            echo "_No acceptance criteria defined._"
            echo ""
        fi
        echo "## Progress Log"
        echo ""
        echo "_No entries yet._"
        echo ""
        echo "## Verification Status"
        echo ""
        echo "- **Proof document:** ${proof_path:-N/A}"
        echo "- **Verified:** No"
        echo "- **Iterations:** 0"
    } > "$file"
}

# ─── Generate command ─────────────────────────────────────────────────────

do_generate() {
    if [[ -z "$PROGRESS_FILE" ]]; then
        echo "Error: --progress is required" >&2
        exit 1
    fi
    if [[ ! -f "$PROGRESS_FILE" ]]; then
        echo "Error: progress file not found: $PROGRESS_FILE" >&2
        exit 1
    fi
    if [[ -z "$OUTPUT_DIR" ]]; then
        echo "Error: --output-dir is required" >&2
        exit 1
    fi

    mkdir -p "$OUTPUT_DIR/active" "$OUTPUT_DIR/completed"

    local task_count
    task_count=$(jq '.tasks | length' "$PROGRESS_FILE")

    for ((i=0; i<task_count; i++)); do
        local status
        status=$(jq -r ".tasks[$i].status" "$PROGRESS_FILE")

        if [[ "$status" == "complete" ]]; then
            generate_exec_plan_from_index "$PROGRESS_FILE" "$i" "$OUTPUT_DIR/completed"
        else
            generate_exec_plan_from_index "$PROGRESS_FILE" "$i" "$OUTPUT_DIR/active"
        fi
    done

    local active_count completed_count
    active_count=$(find "$OUTPUT_DIR/active" -maxdepth 1 -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
    completed_count=$(find "$OUTPUT_DIR/completed" -maxdepth 1 -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
    echo "[OK] Exec-plans: $active_count active, $completed_count completed"
}

# ─── Complete command ─────────────────────────────────────────────────────

do_complete() {
    if [[ -z "$STORY_ID" ]]; then
        echo "Error: --story-id is required" >&2
        exit 1
    fi
    if [[ -z "$OUTPUT_DIR" ]]; then
        echo "Error: --output-dir is required" >&2
        exit 1
    fi

    local active_file="$OUTPUT_DIR/active/$STORY_ID.md"
    local completed_file="$OUTPUT_DIR/completed/$STORY_ID.md"

    if [[ ! -f "$active_file" ]]; then
        echo "Error: exec-plan not found: $active_file" >&2
        exit 1
    fi

    mkdir -p "$OUTPUT_DIR/completed"

    # Append verification summary
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    cat >> "$active_file" << COMPLETION

---

## Verified

- **Completed at:** $timestamp
- **Showboat proof:** [${PROOF_PATH}](${PROOF_PATH})
- **Result:** All verification gates passed
COMPLETION

    # Update status in the file
    sed -i '' "s/\*\*Status:\*\* .*/\*\*Status:\*\* complete/" "$active_file" 2>/dev/null || \
    sed -i "s/\*\*Status:\*\* .*/\*\*Status:\*\* complete/" "$active_file" 2>/dev/null || true

    sed -i '' "s/\*\*Verified:\*\* No/\*\*Verified:\*\* Yes/" "$active_file" 2>/dev/null || \
    sed -i "s/\*\*Verified:\*\* No/\*\*Verified:\*\* Yes/" "$active_file" 2>/dev/null || true

    # Move to completed
    mv "$active_file" "$completed_file"
    echo "[OK] Exec-plan $STORY_ID moved to completed/"
}

# ─── Main ─────────────────────────────────────────────────────────────────

case "$ACTION" in
    generate)
        do_generate
        ;;
    complete)
        do_complete
        ;;
    "")
        echo "Error: specify a command: generate or complete" >&2
        show_help
        exit 1
        ;;
    *)
        echo "Unknown command: $ACTION" >&2
        exit 1
        ;;
esac
