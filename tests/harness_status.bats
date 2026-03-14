#!/usr/bin/env bats
# Tests for Story 8.1: Harness Status Command

load test_helper

STATUS_SH="$BATS_TEST_DIRNAME/../ralph/harness_status.sh"

setup() {
    setup_test_dir
    mkdir -p "$TEST_DIR/.claude" "$TEST_DIR/ralph"

    # State file
    cat > "$TEST_DIR/.claude/codeharness.local.md" << 'EOF'
---
harness_version: "0.1.0"
initialized: true
enforcement:
  frontend: true
  database: true
  api: true
  observability: false
stack: "Node.js"
session_flags:
  tests_passed: true
  coverage_met: false
---
EOF

    # Progress file
    cat > "$TEST_DIR/ralph/progress.json" << 'EOF'
{
    "tasks": [
        {"id": "1.1", "title": "Login Page", "status": "complete", "iterations": 2},
        {"id": "1.2", "title": "Registration", "status": "in_progress", "iterations": 1},
        {"id": "2.1", "title": "Dashboard", "status": "pending"}
    ]
}
EOF

    # Status file from ralph loop
    cat > "$TEST_DIR/ralph/status.json" << 'EOF'
{
    "version": "0.1.0",
    "loop_count": 5,
    "status": "running",
    "calls_made_this_hour": 10,
    "max_calls_per_hour": 100
}
EOF
}

teardown() {
    teardown_test_dir
}

# ─── Script basics ─────────────────────────────────────────────────────────

@test "harness_status.sh exists" {
    [[ -f "$STATUS_SH" ]]
}

@test "harness_status.sh is valid bash" {
    bash -n "$STATUS_SH"
}

@test "harness_status.sh --help exits 0" {
    run bash "$STATUS_SH" --help
    [[ $status -eq 0 ]]
}

# ─── Health line ───────────────────────────────────────────────────────────

@test "shows harness version" {
    run bash "$STATUS_SH" --project-dir "$TEST_DIR"
    [[ "$output" == *"0.1.0"* ]]
}

@test "shows stack type" {
    run bash "$STATUS_SH" --project-dir "$TEST_DIR"
    [[ "$output" == *"Node.js"* ]]
}

# ─── Enforcement config ───────────────────────────────────────────────────

@test "shows enforcement config" {
    run bash "$STATUS_SH" --project-dir "$TEST_DIR"
    [[ "$output" == *"frontend"* ]]
    [[ "$output" == *"database"* ]]
}

@test "shows ON/OFF for each enforcement" {
    run bash "$STATUS_SH" --project-dir "$TEST_DIR"
    [[ "$output" == *"ON"* ]]
    [[ "$output" == *"OFF"* ]]
}

# ─── Sprint progress ──────────────────────────────────────────────────────

@test "shows per-story progress" {
    run bash "$STATUS_SH" --project-dir "$TEST_DIR"
    [[ "$output" == *"Login Page"* ]]
    [[ "$output" == *"Registration"* ]]
    [[ "$output" == *"Dashboard"* ]]
}

@test "shows PASS for completed stories" {
    run bash "$STATUS_SH" --project-dir "$TEST_DIR"
    [[ "$output" == *"PASS"* ]]
}

@test "shows task counts" {
    run bash "$STATUS_SH" --project-dir "$TEST_DIR"
    [[ "$output" == *"1"*"3"* ]]  # 1 of 3 complete
}

# ─── Next action hint ─────────────────────────────────────────────────────

@test "shows next action hint" {
    run bash "$STATUS_SH" --project-dir "$TEST_DIR"
    [[ "$output" == *"→"* ]]
}

# ─── Not initialized ──────────────────────────────────────────────────────

@test "shows not initialized when no state file" {
    rm -f "$TEST_DIR/.claude/codeharness.local.md"
    run bash "$STATUS_SH" --project-dir "$TEST_DIR"
    [[ $status -ne 0 ]]
    [[ "$output" == *"not initialized"* || "$output" == *"harness-init"* ]]
}

# ─── Lines under 100 chars (UX-DR14) ─────────────────────────────────────

@test "no output line exceeds 100 characters" {
    run bash "$STATUS_SH" --project-dir "$TEST_DIR"
    while IFS= read -r line; do
        # Strip ANSI color codes for length check
        local clean
        clean=$(echo "$line" | sed 's/\x1b\[[0-9;]*m//g')
        [[ ${#clean} -le 100 ]]
    done <<< "$output"
}

# ─── Command file ─────────────────────────────────────────────────────────

@test "harness-status.md command exists" {
    [[ -f "$BATS_TEST_DIRNAME/../commands/harness-status.md" ]]
}
