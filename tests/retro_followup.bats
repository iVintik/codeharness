#!/usr/bin/env bats
# Tests for Story 8.6: Retro Follow-up Story Generation

load test_helper

RETRO_SH="$BATS_TEST_DIRNAME/../ralph/retro.sh"

setup() {
    setup_test_dir
    mkdir -p "$TEST_DIR/.claude" "$TEST_DIR/ralph" "$TEST_DIR/docs/quality"

    cat > "$TEST_DIR/.claude/codeharness.local.md" << 'EOF'
---
harness_version: "0.1.0"
initialized: true
---
EOF

    # Progress with incomplete stories and high iteration counts
    cat > "$TEST_DIR/ralph/progress.json" << 'EOF'
{
    "tasks": [
        {"id": "1.1", "title": "Login", "status": "complete", "iterations": 5},
        {"id": "1.2", "title": "Register", "status": "pending", "iterations": 0},
        {"id": "2.1", "title": "Dashboard", "status": "complete", "iterations": 1}
    ]
}
EOF

    # Verification log with failures
    cat > "$TEST_DIR/ralph/verification-log.json" << 'EOF'
{
    "events": [
        {"story_id": "1.1", "result": "fail", "gates_passed": 1, "gates_total": 4, "timestamp": "2026-03-14T10:00:00Z"},
        {"story_id": "1.1", "result": "fail", "gates_passed": 2, "gates_total": 4, "timestamp": "2026-03-14T10:30:00Z"},
        {"story_id": "1.1", "result": "fail", "gates_passed": 3, "gates_total": 4, "timestamp": "2026-03-14T11:00:00Z"},
        {"story_id": "1.1", "result": "pass", "gates_passed": 4, "gates_total": 4, "timestamp": "2026-03-14T12:00:00Z"},
        {"story_id": "2.1", "result": "pass", "gates_passed": 4, "gates_total": 4, "timestamp": "2026-03-14T13:00:00Z"}
    ]
}
EOF
}

teardown() {
    teardown_test_dir
}

@test "retro --followup generates follow-up file" {
    bash "$RETRO_SH" --project-dir "$TEST_DIR" --followup
    [[ -f "$TEST_DIR/docs/quality/retro-followup.md" ]]
}

@test "follow-up file lists incomplete stories as carry-forward" {
    bash "$RETRO_SH" --project-dir "$TEST_DIR" --followup
    grep -q "1.2" "$TEST_DIR/docs/quality/retro-followup.md"
    grep -q "carry" "$TEST_DIR/docs/quality/retro-followup.md" || \
    grep -q "incomplete" "$TEST_DIR/docs/quality/retro-followup.md" || \
    grep -q "pending" "$TEST_DIR/docs/quality/retro-followup.md"
}

@test "follow-up flags high-iteration stories" {
    bash "$RETRO_SH" --project-dir "$TEST_DIR" --followup
    # Story 1.1 had 5 iterations — should be flagged
    grep -q "1.1" "$TEST_DIR/docs/quality/retro-followup.md"
}

@test "follow-up includes action type per item" {
    bash "$RETRO_SH" --project-dir "$TEST_DIR" --followup
    grep -q "story\|patch\|enforcement\|carry" "$TEST_DIR/docs/quality/retro-followup.md"
}

@test "follow-up has review instructions" {
    bash "$RETRO_SH" --project-dir "$TEST_DIR" --followup
    grep -qi "review\|approve" "$TEST_DIR/docs/quality/retro-followup.md"
}
