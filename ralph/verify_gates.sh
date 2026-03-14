#!/usr/bin/env bash
# verify_gates.sh — Verification gates for the Ralph loop
# Checks that a story has: Showboat proof, tests passing, coverage met, verification run.
# Called by ralph.sh after each iteration to decide: mark done or iterate again.
#
# Usage:
#   ralph/verify_gates.sh --story-id ID --project-dir DIR --progress PATH
#
# Exit codes:
#   0 = all gates pass, story marked complete
#   1 = gates failed, story needs more work (iteration incremented)
#   2 = error (missing files, unknown story)

set -e

# Portable in-place sed (macOS uses -i '', Linux uses -i)
sed_i() {
    if sed --version 2>/dev/null | grep -q GNU; then
        sed -i "$@"
    else
        sed -i '' "$@"
    fi
}

# ─── Arguments ────────────────────────────────────────────────────────────

STORY_ID=""
PROJECT_DIR=""
PROGRESS_FILE=""

show_help() {
    cat << 'HELPEOF'
Verification Gates — check if a story is truly done

Usage:
    ralph/verify_gates.sh --story-id ID --project-dir DIR --progress PATH

Gates checked:
    1. Showboat proof document exists for the story
    2. Tests have passed (session_flags.tests_passed)
    3. Coverage at 100% (session_flags.coverage_met)
    4. Verification has been run (session_flags.verification_run)

On pass: story marked complete in progress.json, session flags reset
On fail: iteration count incremented, failures listed

Options:
    -h, --help    Show this help message
HELPEOF
}

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        --story-id)
            STORY_ID="$2"
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
            exit 2
            ;;
    esac
done

# ─── Validation ───────────────────────────────────────────────────────────

if [[ -z "$STORY_ID" || -z "$PROJECT_DIR" || -z "$PROGRESS_FILE" ]]; then
    echo "[FAIL] Missing required arguments: --story-id, --project-dir, --progress" >&2
    exit 2
fi

STATE_FILE="$PROJECT_DIR/.claude/codeharness.local.md"

if [[ ! -f "$STATE_FILE" ]]; then
    echo "[FAIL] Harness state file not found: $STATE_FILE — harness not initialized" >&2
    exit 2
fi

if [[ ! -f "$PROGRESS_FILE" ]]; then
    echo "[FAIL] Progress file not found: $PROGRESS_FILE" >&2
    exit 2
fi

# Check that the story exists in progress
STORY_EXISTS=$(jq -r --arg id "$STORY_ID" '.tasks[] | select(.id == $id) | .id' "$PROGRESS_FILE" 2>/dev/null)
if [[ -z "$STORY_EXISTS" || "$STORY_EXISTS" == "null" ]]; then
    echo "[FAIL] Story $STORY_ID not found in $PROGRESS_FILE" >&2
    exit 2
fi

# ─── Read proof path from progress ────────────────────────────────────────

PROOF_PATH=$(jq -r --arg id "$STORY_ID" \
    '.tasks[] | select(.id == $id) | .verification.proof_path // ""' \
    "$PROGRESS_FILE" 2>/dev/null)

if [[ -z "$PROOF_PATH" ]]; then
    PROOF_PATH="verification/${STORY_ID}-proof.md"
fi

# ─── Gate Checks ──────────────────────────────────────────────────────────

FAILURES=""
GATES_PASSED=0
GATES_TOTAL=4

# Gate 1: Showboat proof exists
if [[ -f "$PROJECT_DIR/$PROOF_PATH" ]]; then
    GATES_PASSED=$((GATES_PASSED + 1))
else
    FAILURES="${FAILURES}\n  - Showboat proof not found: $PROOF_PATH"
fi

# Gate 2: Tests passed
TESTS_PASSED=$(grep -o 'tests_passed: *[a-z]*' "$STATE_FILE" 2>/dev/null | head -1 | awk '{print $2}')
if [[ "$TESTS_PASSED" == "true" ]]; then
    GATES_PASSED=$((GATES_PASSED + 1))
else
    FAILURES="${FAILURES}\n  - Tests not passed (tests_passed: ${TESTS_PASSED:-unknown})"
fi

# Gate 3: Coverage met
COVERAGE_MET=$(grep -o 'coverage_met: *[a-z]*' "$STATE_FILE" 2>/dev/null | head -1 | awk '{print $2}')
if [[ "$COVERAGE_MET" == "true" ]]; then
    GATES_PASSED=$((GATES_PASSED + 1))
else
    FAILURES="${FAILURES}\n  - Test coverage not at 100% (coverage_met: ${COVERAGE_MET:-unknown})"
fi

# Gate 4: Verification run
VERIFICATION_RUN=$(grep -o 'verification_run: *[a-z]*' "$STATE_FILE" 2>/dev/null | head -1 | awk '{print $2}')
if [[ "$VERIFICATION_RUN" == "true" ]]; then
    GATES_PASSED=$((GATES_PASSED + 1))
else
    FAILURES="${FAILURES}\n  - Verification not run (verification_run: ${VERIFICATION_RUN:-unknown})"
fi

# ─── Increment iteration count (always, on check) ─────────────────────────

increment_iteration() {
    local updated
    updated=$(jq --arg id "$STORY_ID" \
        '(.tasks[] | select(.id == $id)).iterations = ((.tasks[] | select(.id == $id)).iterations // 0) + 1' \
        "$PROGRESS_FILE" 2>/dev/null)
    if [[ -n "$updated" ]]; then
        echo "$updated" > "$PROGRESS_FILE"
    fi
}

# ─── Verification log ─────────────────────────────────────────────────────

append_verification_log() {
    local result="$1"
    local log_file="$PROJECT_DIR/ralph/verification-log.json"
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    local event
    event=$(jq -n \
        --arg story_id "$STORY_ID" \
        --arg result "$result" \
        --argjson gates_passed "$GATES_PASSED" \
        --argjson gates_total "$GATES_TOTAL" \
        --arg timestamp "$timestamp" \
        '{story_id: $story_id, result: $result, gates_passed: $gates_passed, gates_total: $gates_total, timestamp: $timestamp}')

    if [[ -f "$log_file" ]]; then
        log_data=$(jq --argjson event "$event" '.events += [$event]' "$log_file" 2>/dev/null)
        if [[ -n "$log_data" ]]; then
            echo "$log_data" > "$log_file"
        fi
    else
        jq -n --argjson event "$event" '{events: [$event]}' > "$log_file"
    fi
}

# ─── Decision ─────────────────────────────────────────────────────────────

if [[ $GATES_PASSED -eq $GATES_TOTAL ]]; then
    # Log pass event
    append_verification_log "pass"

    # All gates pass — mark story complete
    local_updated=$(jq --arg id "$STORY_ID" \
        '(.tasks[] | select(.id == $id)).status = "complete"' \
        "$PROGRESS_FILE" 2>/dev/null)
    if [[ -n "${local_updated}" ]]; then
        echo "${local_updated}" > "$PROGRESS_FILE"
    fi

    # Reset session flags for the next story
    sed_i 's/tests_passed: true/tests_passed: false/' "$STATE_FILE"
    sed_i 's/coverage_met: true/coverage_met: false/' "$STATE_FILE"
    sed_i 's/verification_run: true/verification_run: false/' "$STATE_FILE"
    sed_i 's/logs_queried: true/logs_queried: false/' "$STATE_FILE"

    # Move exec-plan from active to completed (if exec-plans exist)
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    exec_plans_dir="$PROJECT_DIR/docs/exec-plans"
    if [[ -f "$exec_plans_dir/active/$STORY_ID.md" && -f "$SCRIPT_DIR/exec_plans.sh" ]]; then
        "$SCRIPT_DIR/exec_plans.sh" complete \
            --story-id "$STORY_ID" \
            --output-dir "$exec_plans_dir" \
            --proof-path "$PROOF_PATH" 2>/dev/null || true
    fi

    echo "[PASS] Story $STORY_ID — all $GATES_TOTAL verification gates passed"
    echo "  → Story marked complete, session flags reset for next story"
    exit 0
else
    # Log fail event
    append_verification_log "fail"

    # Gates failed — increment iteration, report failures
    increment_iteration

    iterations=$(jq -r --arg id "$STORY_ID" \
        '.tasks[] | select(.id == $id) | .iterations // 0' \
        "$PROGRESS_FILE" 2>/dev/null)

    echo "[BLOCKED] Story $STORY_ID — $GATES_PASSED/$GATES_TOTAL gates passed (iteration $iterations)"
    echo -e "  Failures:$FAILURES"
    echo ""
    echo "  → Agent must fix failures and re-verify before story completion"
    exit 1
fi
