#!/usr/bin/env bats
# Integration tests for Ralph sprint-status.yaml integration (Story 5.1 & 5.2)
# Tests: check_sprint_complete(), get_task_counts(), retry tracking, progress, termination

RALPH_SH="$BATS_TEST_DIRNAME/../../ralph/ralph.sh"

setup() {
    export TMPDIR="${BATS_TEST_TMPDIR:-/tmp}"
    TEST_DIR=$(mktemp -d)
    export TEST_DIR

    # Source ralph.sh functions. The script guards main() execution behind
    # [[ "${BASH_SOURCE[0]}" == "${0}" ]], so sourcing only loads functions.
    source "$RALPH_SH"

    SPRINT_STATUS_FILE=""
    PROGRESS_FILE=""
    STORY_RETRY_FILE="$TEST_DIR/.story_retries"
    FLAGGED_STORIES_FILE="$TEST_DIR/.flagged_stories"
    loop_count=0
    loop_start_time=$(date +%s)
}

teardown() {
    rm -rf "$TEST_DIR"
}

# Helper: create a sprint-status.yaml with given content
create_sprint_status() {
    local file="$TEST_DIR/sprint-status.yaml"
    cat > "$file" << EOF
$1
EOF
    SPRINT_STATUS_FILE="$file"
}

# ─── check_sprint_complete tests ──────────────────────────────────────────

@test "check_sprint_complete returns 0 when all stories are done" {
    create_sprint_status "development_status:
  epic-1: done
  1-1-first-story: done
  1-2-second-story: done
  epic-1-retrospective: done"
    check_sprint_complete
}

@test "check_sprint_complete returns 1 when stories still in progress" {
    create_sprint_status "development_status:
  epic-1: in-progress
  1-1-first-story: done
  1-2-second-story: in-progress
  1-3-third-story: backlog"
    run check_sprint_complete
    [ "$status" -eq 1 ]
}

@test "check_sprint_complete returns 1 with ready-for-dev stories" {
    create_sprint_status "development_status:
  epic-5: in-progress
  5-1-ralph-loop: ready-for-dev
  5-2-verification: backlog"
    run check_sprint_complete
    [ "$status" -eq 1 ]
}

@test "check_sprint_complete returns 1 when file does not exist" {
    SPRINT_STATUS_FILE="$TEST_DIR/nonexistent.yaml"
    run check_sprint_complete
    [ "$status" -eq 1 ]
}

@test "check_sprint_complete ignores epic keys" {
    create_sprint_status "development_status:
  epic-1: in-progress
  1-1-only-story: done
  epic-1-retrospective: optional"
    check_sprint_complete
}

@test "check_sprint_complete returns 1 with no stories" {
    create_sprint_status "development_status:
  epic-1: in-progress
  epic-1-retrospective: optional"
    run check_sprint_complete
    [ "$status" -eq 1 ]
}

# ─── get_task_counts tests ────────────────────────────────────────────────

@test "get_task_counts returns correct total and completed" {
    create_sprint_status "development_status:
  epic-1: done
  1-1-first: done
  1-2-second: done
  epic-2: in-progress
  2-1-third: in-progress
  2-2-fourth: backlog"
    run get_task_counts
    [ "$status" -eq 0 ]
    [ "$output" = "4 2" ]
}

@test "get_task_counts returns 0 0 when file missing" {
    SPRINT_STATUS_FILE="$TEST_DIR/nonexistent.yaml"
    run get_task_counts
    [ "$status" -eq 0 ]
    [ "$output" = "0 0" ]
}

@test "get_task_counts ignores epic and retrospective entries" {
    create_sprint_status "development_status:
  epic-1: done
  1-1-story: done
  epic-1-retrospective: done"
    run get_task_counts
    [ "$status" -eq 0 ]
    [ "$output" = "1 1" ]
}

@test "get_task_counts handles all statuses" {
    create_sprint_status "development_status:
  1-1-done: done
  1-2-progress: in-progress
  1-3-backlog: backlog
  1-4-review: review
  1-5-ready: ready-for-dev"
    run get_task_counts
    [ "$status" -eq 0 ]
    [ "$output" = "5 1" ]
}

# ─── all_tasks_complete (wrapper) tests ───────────────────────────────────

@test "all_tasks_complete delegates to check_sprint_complete" {
    create_sprint_status "development_status:
  1-1-only: done"
    all_tasks_complete
}

# ─── Retry tracking tests (Story 5.2) ────────────────────────────────────

@test "get_story_retry_count returns 0 for untracked story" {
    run get_story_retry_count "5-1-some-story"
    [ "$status" -eq 0 ]
    [ "$output" = "0" ]
}

@test "increment_story_retry increments from 0 to 1" {
    run increment_story_retry "5-1-some-story"
    [ "$status" -eq 0 ]
    [ "$output" = "1" ]
}

@test "increment_story_retry increments correctly across calls" {
    increment_story_retry "5-1-test-story" > /dev/null
    increment_story_retry "5-1-test-story" > /dev/null
    run increment_story_retry "5-1-test-story"
    [ "$status" -eq 0 ]
    [ "$output" = "3" ]
}

@test "get_story_retry_count reads persisted count" {
    increment_story_retry "5-2-verify" > /dev/null
    increment_story_retry "5-2-verify" > /dev/null
    run get_story_retry_count "5-2-verify"
    [ "$status" -eq 0 ]
    [ "$output" = "2" ]
}

@test "increment_story_retry tracks multiple stories independently" {
    increment_story_retry "5-1-first" > /dev/null
    increment_story_retry "5-1-first" > /dev/null
    increment_story_retry "5-2-second" > /dev/null

    run get_story_retry_count "5-1-first"
    [ "$output" = "2" ]

    run get_story_retry_count "5-2-second"
    [ "$output" = "1" ]
}

@test "is_story_flagged returns 1 for unflagged story" {
    run is_story_flagged "5-1-test"
    [ "$status" -eq 1 ]
}

@test "flag_story and is_story_flagged work together" {
    flag_story "5-1-broken"
    is_story_flagged "5-1-broken"
}

@test "flag_story does not duplicate entries" {
    flag_story "5-1-broken"
    flag_story "5-1-broken"
    local count=$(wc -l < "$FLAGGED_STORIES_FILE" | tr -d ' ')
    [ "$count" -eq 1 ]
}

@test ".story_retries persists across simulated restarts" {
    # First "run"
    increment_story_retry "5-1-persist-test" > /dev/null
    increment_story_retry "5-1-persist-test" > /dev/null

    # Simulate restart — re-source the script (STORY_RETRY_FILE already set)
    source "$RALPH_SH"
    STORY_RETRY_FILE="$TEST_DIR/.story_retries"

    run get_story_retry_count "5-1-persist-test"
    [ "$output" = "2" ]

    # Can continue incrementing
    run increment_story_retry "5-1-persist-test"
    [ "$output" = "3" ]
}

# ─── Snapshot and change detection tests ──────────────────────────────────

@test "snapshot_story_statuses captures story keys" {
    create_sprint_status "development_status:
  epic-1: in-progress
  1-1-first: in-progress
  1-2-second: done"
    run snapshot_story_statuses
    [ "$status" -eq 0 ]
    [[ "$output" == *"1-1-first:in-progress"* ]]
    [[ "$output" == *"1-2-second:done"* ]]
    # Should not include epic keys
    [[ "$output" != *"epic-1"* ]]
}

@test "detect_story_changes identifies newly done stories" {
    local before="1-1-first:in-progress
1-2-second:done"
    local after="1-1-first:done
1-2-second:done"

    detect_story_changes "$before" "$after"
    [[ "$CHANGED_STORIES" == *"1-1-first"* ]]
    [ -z "$UNCHANGED_STORIES" ]
}

@test "detect_story_changes identifies unchanged stories" {
    local before="1-1-first:in-progress
1-2-second:in-progress"
    local after="1-1-first:in-progress
1-2-second:in-progress"

    detect_story_changes "$before" "$after"
    [ -z "$CHANGED_STORIES" ]
    [[ "$UNCHANGED_STORIES" == *"1-1-first"* ]]
    [[ "$UNCHANGED_STORIES" == *"1-2-second"* ]]
}

# ─── Progress summary tests ──────────────────────────────────────────────

@test "print_progress_summary outputs correct format" {
    create_sprint_status "development_status:
  1-1-first: done
  1-2-second: in-progress
  1-3-third: backlog"
    loop_count=5
    loop_start_time=$(date +%s)

    run print_progress_summary
    [ "$status" -eq 0 ]
    [[ "$output" == *"Progress: 1/3 stories complete"* ]]
    [[ "$output" == *"iterations: 5"* ]]
    [[ "$output" == *"elapsed:"* ]]
}

# ─── Cleanup handler tests ───────────────────────────────────────────────

@test "cleanup handler produces progress summary" {
    create_sprint_status "development_status:
  1-1-first: done
  1-2-second: in-progress"
    loop_count=3
    loop_start_time=$(date +%s)
    STATUS_FILE="$TEST_DIR/status.json"
    CALL_COUNT_FILE="$TEST_DIR/.call_count"
    echo "5" > "$CALL_COUNT_FILE"

    # Run cleanup in a subshell to catch exit
    run bash -c "
        source '$RALPH_SH'
        SPRINT_STATUS_FILE='$SPRINT_STATUS_FILE'
        STORY_RETRY_FILE='$TEST_DIR/.story_retries'
        FLAGGED_STORIES_FILE='$TEST_DIR/.flagged_stories'
        STATUS_FILE='$TEST_DIR/status.json'
        CALL_COUNT_FILE='$TEST_DIR/.call_count'
        loop_count=3
        loop_start_time=\$(date +%s)
        cleanup
    "
    [ "$status" -eq 0 ]
    [[ "$output" == *"Iterations: 3"* ]]
    [[ "$output" == *"Stories completed: 1/2"* ]]
}

# ─── Script validation ───────────────────────────────────────────────────

@test "ralph.sh is valid bash with sprint-status changes" {
    bash -n "$RALPH_SH"
}

@test "ralph.sh help mentions --progress as optional" {
    run bash "$RALPH_SH" --help
    [ "$status" -eq 0 ]
    [[ "$output" == *"--progress"* ]]
}

@test "ralph.sh help mentions --max-story-retries" {
    run bash "$RALPH_SH" --help
    [ "$status" -eq 0 ]
    [[ "$output" == *"--max-story-retries"* ]]
}
