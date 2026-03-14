#!/usr/bin/env bash
# validate_epic_docs.sh — Validate architectural docs at epic completion
# Checks that ARCHITECTURE.md exists and is current when all stories in an epic are verified.
#
# Usage: ralph/validate_epic_docs.sh --epic NAME --project-dir DIR --progress PATH

set -e

EPIC_NAME=""
PROJECT_DIR=""
PROGRESS_FILE=""

show_help() {
    cat << 'HELPEOF'
Design-Doc Validation — validate architecture docs at epic completion

Usage:
    ralph/validate_epic_docs.sh --epic NAME --project-dir DIR --progress PATH

Checks:
    1. All stories in the epic are complete
    2. ARCHITECTURE.md exists
    3. ARCHITECTURE.md was updated since the epic's code changes

Options:
    --epic NAME         Epic name to validate (e.g., "Epic 1: Auth")
    --project-dir DIR   Project root directory
    --progress PATH     Path to ralph/progress.json
    -h, --help          Show this help message
HELPEOF
}

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        --epic)
            EPIC_NAME="$2"
            shift 2
            ;;
        --project-dir)
            PROJECT_DIR="$2"
            shift 2
            ;;
        --progress)
            PROGRESS_FILE="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

# ─── Validation ───────────────────────────────────────────────────────────

if [[ -z "$EPIC_NAME" ]]; then
    echo "Error: --epic is required" >&2
    exit 2
fi

if [[ -z "$PROJECT_DIR" ]]; then
    echo "Error: --project-dir is required" >&2
    exit 2
fi

if [[ -z "$PROGRESS_FILE" ]]; then
    echo "Error: --progress is required" >&2
    exit 2
fi

if [[ ! -f "$PROGRESS_FILE" ]]; then
    echo "Error: progress file not found: $PROGRESS_FILE" >&2
    exit 2
fi

# ─── Check 1: All stories in epic are complete ────────────────────────────

total_in_epic=$(jq --arg epic "$EPIC_NAME" \
    '[.tasks[] | select(.epic == $epic)] | length' \
    "$PROGRESS_FILE" 2>/dev/null || echo "0")

if [[ "$total_in_epic" == "0" ]]; then
    echo "[FAIL] No stories found for epic: $EPIC_NAME" >&2
    exit 1
fi

pending_in_epic=$(jq --arg epic "$EPIC_NAME" \
    '[.tasks[] | select(.epic == $epic and .status != "complete")] | length' \
    "$PROGRESS_FILE" 2>/dev/null || echo "0")

if [[ "$pending_in_epic" != "0" ]]; then
    echo "[FAIL] Epic \"$EPIC_NAME\" is not complete — $pending_in_epic stories still pending" >&2
    exit 1
fi

# ─── Check 2: ARCHITECTURE.md exists ─────────────────────────────────────

ARCH_FILE="$PROJECT_DIR/ARCHITECTURE.md"

if [[ ! -f "$ARCH_FILE" ]]; then
    echo "[FAIL] ARCHITECTURE.md not found — epic \"$EPIC_NAME\" cannot be marked complete"
    echo "  → Create ARCHITECTURE.md documenting architectural decisions from this epic"
    exit 1
fi

# ─── Check 3: ARCHITECTURE.md is current ─────────────────────────────────

# Get ARCHITECTURE.md last commit time
arch_commit_time=$(git -C "$PROJECT_DIR" log -1 --format="%ct" -- "$ARCH_FILE" 2>/dev/null || echo "0")

# Get the latest commit time across all tracked files (excluding ARCHITECTURE.md itself)
latest_code_time=$(git -C "$PROJECT_DIR" log -1 --format="%ct" -- . 2>/dev/null || echo "0")

# If code was committed after ARCHITECTURE.md, it may be stale
if [[ $latest_code_time -gt $arch_commit_time && $arch_commit_time -gt 0 ]]; then
    echo "[FAIL] ARCHITECTURE.md is stale — code changed after architecture doc was last updated"
    echo "  Epic: $EPIC_NAME ($total_in_epic stories)"
    echo "  → Update ARCHITECTURE.md to reflect architectural decisions made during this epic"
    exit 1
fi

# ─── All checks pass ─────────────────────────────────────────────────────

echo "[OK] Epic \"$EPIC_NAME\" — architecture docs validated ($total_in_epic stories verified)"
exit 0
