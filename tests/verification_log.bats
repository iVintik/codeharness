#!/usr/bin/env bats
# Tests for Story 8.2: Verification Log

load test_helper

VERIFY_GATES_SH="$BATS_TEST_DIRNAME/../ralph/verify_gates.sh"
STATUS_SH="$BATS_TEST_DIRNAME/../ralph/harness_status.sh"

setup() {
    setup_test_dir
    mkdir -p "$TEST_DIR/.claude" "$TEST_DIR/ralph" "$TEST_DIR/verification"

    cat > "$TEST_DIR/.claude/codeharness.local.md" << 'EOF'
---
harness_version: "0.1.0"
initialized: true
session_flags:
  tests_passed: false
  coverage_met: false
  verification_run: false
---
EOF

    cat > "$TEST_DIR/ralph/progress.json" << 'EOF'
{
    "tasks": [
        {"id": "1.1", "title": "Login", "status": "in_progress",
         "verification": {"proof_path": "verification/1.1-proof.md"}}
    ]
}
EOF
}

teardown() {
    teardown_test_dir
}

# ─── Log creation ──────────────────────────────────────────────────────────

@test "verification log is created on first gate check" {
    bash "$VERIFY_GATES_SH" \
        --story-id "1.1" \
        --project-dir "$TEST_DIR" \
        --progress "$TEST_DIR/ralph/progress.json" 2>/dev/null || true

    [[ -f "$TEST_DIR/ralph/verification-log.json" ]]
}

@test "verification log contains event with story ID" {
    bash "$VERIFY_GATES_SH" \
        --story-id "1.1" \
        --project-dir "$TEST_DIR" \
        --progress "$TEST_DIR/ralph/progress.json" 2>/dev/null || true

    jq '.' "$TEST_DIR/ralph/verification-log.json" > /dev/null
    local story_id
    story_id=$(jq -r '.events[0].story_id' "$TEST_DIR/ralph/verification-log.json")
    [[ "$story_id" == "1.1" ]]
}

@test "verification log contains timestamp" {
    bash "$VERIFY_GATES_SH" \
        --story-id "1.1" \
        --project-dir "$TEST_DIR" \
        --progress "$TEST_DIR/ralph/progress.json" 2>/dev/null || true

    local ts
    ts=$(jq -r '.events[0].timestamp' "$TEST_DIR/ralph/verification-log.json")
    [[ "$ts" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T ]]
}

@test "verification log contains result (pass/fail)" {
    bash "$VERIFY_GATES_SH" \
        --story-id "1.1" \
        --project-dir "$TEST_DIR" \
        --progress "$TEST_DIR/ralph/progress.json" 2>/dev/null || true

    local result
    result=$(jq -r '.events[0].result' "$TEST_DIR/ralph/verification-log.json")
    [[ "$result" == "fail" ]]
}

@test "verification log contains gates_passed count" {
    bash "$VERIFY_GATES_SH" \
        --story-id "1.1" \
        --project-dir "$TEST_DIR" \
        --progress "$TEST_DIR/ralph/progress.json" 2>/dev/null || true

    local gates
    gates=$(jq -r '.events[0].gates_passed' "$TEST_DIR/ralph/verification-log.json")
    [[ "$gates" =~ ^[0-9]+$ ]]
}

# ─── Log persistence across checks ────────────────────────────────────────

@test "verification log appends multiple events" {
    bash "$VERIFY_GATES_SH" \
        --story-id "1.1" \
        --project-dir "$TEST_DIR" \
        --progress "$TEST_DIR/ralph/progress.json" 2>/dev/null || true

    bash "$VERIFY_GATES_SH" \
        --story-id "1.1" \
        --project-dir "$TEST_DIR" \
        --progress "$TEST_DIR/ralph/progress.json" 2>/dev/null || true

    local count
    count=$(jq '.events | length' "$TEST_DIR/ralph/verification-log.json")
    [[ "$count" == "2" ]]
}

@test "verification log records pass when gates succeed" {
    cat > "$TEST_DIR/verification/1.1-proof.md" << 'EOF'
---
story_id: "1.1"
result: pass
---
EOF
    sed_i 's/tests_passed: false/tests_passed: true/' "$TEST_DIR/.claude/codeharness.local.md"
    sed_i 's/coverage_met: false/coverage_met: true/' "$TEST_DIR/.claude/codeharness.local.md"
    sed_i 's/verification_run: false/verification_run: true/' "$TEST_DIR/.claude/codeharness.local.md"

    bash "$VERIFY_GATES_SH" \
        --story-id "1.1" \
        --project-dir "$TEST_DIR" \
        --progress "$TEST_DIR/ralph/progress.json" 2>/dev/null || true

    local result
    result=$(jq -r '.events[-1].result' "$TEST_DIR/ralph/verification-log.json")
    [[ "$result" == "pass" ]]
}

# ─── Status integration ───────────────────────────────────────────────────

@test "harness_status shows verification summary when log exists" {
    # Create verification log
    cat > "$TEST_DIR/ralph/verification-log.json" << 'EOF'
{
    "events": [
        {"story_id": "1.1", "result": "fail", "gates_passed": 1, "gates_total": 4, "timestamp": "2026-03-14T12:00:00Z"},
        {"story_id": "1.1", "result": "pass", "gates_passed": 4, "gates_total": 4, "timestamp": "2026-03-14T12:05:00Z"}
    ]
}
EOF
    cat > "$TEST_DIR/ralph/progress.json" << 'EOF'
{"tasks": [{"id": "1.1", "title": "Login", "status": "complete"}]}
EOF

    run bash "$STATUS_SH" --project-dir "$TEST_DIR"
    [[ "$output" == *"Verification"* || "$output" == *"verified"* || "$output" == *"1"*"1"* ]]
}
