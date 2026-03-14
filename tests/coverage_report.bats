#!/usr/bin/env bats
# Tests for Story 8.5: Test Coverage Report

load test_helper

RETRO_SH="$BATS_TEST_DIRNAME/../ralph/retro.sh"

setup() {
    setup_test_dir
    mkdir -p "$TEST_DIR/.claude" "$TEST_DIR/ralph" "$TEST_DIR/docs/quality"

    cat > "$TEST_DIR/.claude/codeharness.local.md" << 'EOF'
---
harness_version: "0.1.0"
initialized: true
coverage:
  baseline: 45
  current: 100
---
EOF

    cat > "$TEST_DIR/ralph/progress.json" << 'EOF'
{
    "tasks": [
        {"id": "1.1", "title": "Login", "status": "complete", "iterations": 1,
         "coverage_delta": {"before": 45, "after": 72}},
        {"id": "1.2", "title": "Register", "status": "complete", "iterations": 1,
         "coverage_delta": {"before": 72, "after": 100}}
    ]
}
EOF

    cat > "$TEST_DIR/ralph/verification-log.json" << 'EOF'
{"events": [
    {"story_id": "1.1", "result": "pass", "gates_passed": 4, "gates_total": 4, "timestamp": "2026-03-14T10:00:00Z"},
    {"story_id": "1.2", "result": "pass", "gates_passed": 4, "gates_total": 4, "timestamp": "2026-03-14T11:00:00Z"}
]}
EOF
}

teardown() {
    teardown_test_dir
}

@test "retro --coverage generates test-coverage.md" {
    bash "$RETRO_SH" --project-dir "$TEST_DIR" --coverage
    [[ -f "$TEST_DIR/docs/quality/test-coverage.md" ]]
}

@test "test-coverage.md has DO NOT EDIT MANUALLY header (NFR27)" {
    bash "$RETRO_SH" --project-dir "$TEST_DIR" --coverage
    head -3 "$TEST_DIR/docs/quality/test-coverage.md" | grep -qi "DO NOT EDIT MANUALLY"
}

@test "test-coverage.md shows baseline coverage" {
    bash "$RETRO_SH" --project-dir "$TEST_DIR" --coverage
    grep -q "45" "$TEST_DIR/docs/quality/test-coverage.md"
}

@test "test-coverage.md shows final coverage" {
    bash "$RETRO_SH" --project-dir "$TEST_DIR" --coverage
    grep -q "100" "$TEST_DIR/docs/quality/test-coverage.md"
}

@test "test-coverage.md shows per-story deltas" {
    bash "$RETRO_SH" --project-dir "$TEST_DIR" --coverage
    grep -q "1.1" "$TEST_DIR/docs/quality/test-coverage.md"
    grep -q "1.2" "$TEST_DIR/docs/quality/test-coverage.md"
}
