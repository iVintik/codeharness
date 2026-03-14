#!/usr/bin/env bats
# Tests for Stories 8.3 & 8.4: Mandatory Retrospective Trigger & Report

load test_helper

RETRO_SH="$BATS_TEST_DIRNAME/../ralph/retro.sh"

setup() {
    setup_test_dir
    mkdir -p "$TEST_DIR/.claude" "$TEST_DIR/ralph" "$TEST_DIR/docs/quality"

    # State file
    cat > "$TEST_DIR/.claude/codeharness.local.md" << 'EOF'
---
harness_version: "0.1.0"
initialized: true
stack: "Node.js"
---
EOF

    # Progress file with completed sprint
    cat > "$TEST_DIR/ralph/progress.json" << 'EOF'
{
    "tasks": [
        {"id": "1.1", "title": "Login Page", "status": "complete", "iterations": 2},
        {"id": "1.2", "title": "Registration", "status": "complete", "iterations": 1},
        {"id": "2.1", "title": "Dashboard", "status": "complete", "iterations": 3}
    ]
}
EOF

    # Verification log
    cat > "$TEST_DIR/ralph/verification-log.json" << 'EOF'
{
    "events": [
        {"story_id": "1.1", "result": "fail", "gates_passed": 2, "gates_total": 4, "timestamp": "2026-03-14T10:00:00Z"},
        {"story_id": "1.1", "result": "pass", "gates_passed": 4, "gates_total": 4, "timestamp": "2026-03-14T10:30:00Z"},
        {"story_id": "1.2", "result": "pass", "gates_passed": 4, "gates_total": 4, "timestamp": "2026-03-14T11:00:00Z"},
        {"story_id": "2.1", "result": "fail", "gates_passed": 1, "gates_total": 4, "timestamp": "2026-03-14T12:00:00Z"},
        {"story_id": "2.1", "result": "fail", "gates_passed": 3, "gates_total": 4, "timestamp": "2026-03-14T12:30:00Z"},
        {"story_id": "2.1", "result": "pass", "gates_passed": 4, "gates_total": 4, "timestamp": "2026-03-14T13:00:00Z"}
    ]
}
EOF
}

teardown() {
    teardown_test_dir
}

# ─── Script basics ─────────────────────────────────────────────────────────

@test "retro.sh exists" {
    [[ -f "$RETRO_SH" ]]
}

@test "retro.sh is valid bash" {
    bash -n "$RETRO_SH"
}

@test "retro.sh --help exits 0" {
    run bash "$RETRO_SH" --help
    [[ $status -eq 0 ]]
}

# ─── Report generation ────────────────────────────────────────────────────

@test "retro generates report file" {
    bash "$RETRO_SH" --project-dir "$TEST_DIR"
    [[ -f "$TEST_DIR/docs/quality/retro-report.md" ]]
}

@test "retro report has DO NOT EDIT MANUALLY header (NFR27)" {
    bash "$RETRO_SH" --project-dir "$TEST_DIR"
    head -3 "$TEST_DIR/docs/quality/retro-report.md" | grep -qi "DO NOT EDIT MANUALLY"
}

# ─── Sprint summary section ──────────────────────────────────────────────

@test "retro report includes sprint summary" {
    bash "$RETRO_SH" --project-dir "$TEST_DIR"
    grep -q "Sprint Summary" "$TEST_DIR/docs/quality/retro-report.md"
}

@test "retro report shows stories completed count" {
    bash "$RETRO_SH" --project-dir "$TEST_DIR"
    grep -q "3" "$TEST_DIR/docs/quality/retro-report.md"
}

@test "retro report shows total iterations" {
    bash "$RETRO_SH" --project-dir "$TEST_DIR"
    # 2 + 1 + 3 = 6 total iterations
    grep -q "6" "$TEST_DIR/docs/quality/retro-report.md"
}

# ─── Verification effectiveness section ──────────────────────────────────

@test "retro report includes verification effectiveness" {
    bash "$RETRO_SH" --project-dir "$TEST_DIR"
    grep -q "Verification" "$TEST_DIR/docs/quality/retro-report.md"
}

@test "retro report shows pass rate" {
    bash "$RETRO_SH" --project-dir "$TEST_DIR"
    # 3 passes out of 6 events = 50%
    grep -q "50%" "$TEST_DIR/docs/quality/retro-report.md"
}

@test "retro report shows per-story iteration counts" {
    bash "$RETRO_SH" --project-dir "$TEST_DIR"
    grep -q "1.1" "$TEST_DIR/docs/quality/retro-report.md"
    grep -q "2.1" "$TEST_DIR/docs/quality/retro-report.md"
}

# ─── Doc health section ──────────────────────────────────────────────────

@test "retro report includes doc health section" {
    bash "$RETRO_SH" --project-dir "$TEST_DIR"
    grep -q -i "doc\|documentation" "$TEST_DIR/docs/quality/retro-report.md"
}

# ─── Performance (NFR20) ─────────────────────────────────────────────────

@test "retro completes within 30 seconds (NFR20)" {
    local start end elapsed
    start=$(date +%s)
    bash "$RETRO_SH" --project-dir "$TEST_DIR"
    end=$(date +%s)
    elapsed=$((end - start))
    [[ $elapsed -lt 30 ]]
}

# ─── Error handling ───────────────────────────────────────────────────────

@test "retro handles missing verification log" {
    rm -f "$TEST_DIR/ralph/verification-log.json"
    run bash "$RETRO_SH" --project-dir "$TEST_DIR"
    [[ $status -eq 0 ]]
    [[ -f "$TEST_DIR/docs/quality/retro-report.md" ]]
}

@test "retro handles missing progress file" {
    rm -f "$TEST_DIR/ralph/progress.json"
    run bash "$RETRO_SH" --project-dir "$TEST_DIR"
    [[ $status -eq 0 ]]
}
