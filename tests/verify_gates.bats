#!/usr/bin/env bats
# Tests for ralph/verify_gates.sh - Verification Gates in Loop
# Story 6.3: Enforces that stories aren't marked done without proper verification

load test_helper

VERIFY_SH="$BATS_TEST_DIRNAME/../ralph/verify_gates.sh"

setup() {
    setup_test_dir
    mkdir -p "$TEST_DIR/ralph" "$TEST_DIR/verification" "$TEST_DIR/.claude"

    # Create state file
    cat > "$TEST_DIR/.claude/codeharness.local.md" << 'EOF'
---
harness_version: "0.1.0"
initialized: true
enforcement:
  frontend: true
  database: true
  api: true
  observability: true
session_flags:
  tests_passed: false
  coverage_met: false
  verification_run: false
  logs_queried: false
---
EOF

    # Create progress file
    cat > "$TEST_DIR/ralph/progress.json" << 'EOF'
{
    "generated_at": "2026-03-14T12:00:00Z",
    "source": "test",
    "tasks": [
        {"id": "1.1", "title": "Login Page", "status": "in_progress",
         "verification": {"proof_path": "verification/1.1-proof.md"}},
        {"id": "1.2", "title": "Registration", "status": "pending",
         "verification": {"proof_path": "verification/1.2-proof.md"}}
    ]
}
EOF
}

teardown() {
    teardown_test_dir
}

# ─── Script existence ──────────────────────────────────────────────────────

@test "verify_gates.sh exists" {
    [[ -f "$VERIFY_SH" ]]
}

@test "verify_gates.sh is valid bash" {
    bash -n "$VERIFY_SH"
}

@test "verify_gates.sh --help exits 0" {
    run bash "$VERIFY_SH" --help
    [[ $status -eq 0 ]]
}

# ─── Gate checks ──────────────────────────────────────────────────────────

@test "verify_gates fails when no Showboat proof exists" {
    run bash "$VERIFY_SH" \
        --story-id "1.1" \
        --project-dir "$TEST_DIR" \
        --progress "$TEST_DIR/ralph/progress.json"
    [[ $status -ne 0 ]]
    [[ "$output" == *"proof"* ]]
}

@test "verify_gates fails when tests not passed" {
    # Create proof doc
    cat > "$TEST_DIR/verification/1.1-proof.md" << 'EOF'
---
story_id: "1.1"
result: pass
---
# Proof
EOF
    run bash "$VERIFY_SH" \
        --story-id "1.1" \
        --project-dir "$TEST_DIR" \
        --progress "$TEST_DIR/ralph/progress.json"
    [[ $status -ne 0 ]]
    [[ "$output" == *"tests"* ]]
}

@test "verify_gates fails when coverage not met" {
    # Create proof doc
    cat > "$TEST_DIR/verification/1.1-proof.md" << 'EOF'
---
story_id: "1.1"
result: pass
---
# Proof
EOF
    # Set tests_passed but not coverage
    sed -i '' 's/tests_passed: false/tests_passed: true/' "$TEST_DIR/.claude/codeharness.local.md"

    run bash "$VERIFY_SH" \
        --story-id "1.1" \
        --project-dir "$TEST_DIR" \
        --progress "$TEST_DIR/ralph/progress.json"
    [[ $status -ne 0 ]]
    [[ "$output" == *"coverage"* ]]
}

@test "verify_gates passes when all gates satisfied" {
    # Create proof doc
    cat > "$TEST_DIR/verification/1.1-proof.md" << 'EOF'
---
story_id: "1.1"
result: pass
---
# Proof
EOF
    # Set all flags to true
    sed -i '' 's/tests_passed: false/tests_passed: true/' "$TEST_DIR/.claude/codeharness.local.md"
    sed -i '' 's/coverage_met: false/coverage_met: true/' "$TEST_DIR/.claude/codeharness.local.md"
    sed -i '' 's/verification_run: false/verification_run: true/' "$TEST_DIR/.claude/codeharness.local.md"

    run bash "$VERIFY_SH" \
        --story-id "1.1" \
        --project-dir "$TEST_DIR" \
        --progress "$TEST_DIR/ralph/progress.json"
    [[ $status -eq 0 ]]
}

# ─── Story marking ───────────────────────────────────────────────────────

@test "verify_gates marks story complete on pass" {
    cat > "$TEST_DIR/verification/1.1-proof.md" << 'EOF'
---
story_id: "1.1"
result: pass
---
# Proof
EOF
    sed -i '' 's/tests_passed: false/tests_passed: true/' "$TEST_DIR/.claude/codeharness.local.md"
    sed -i '' 's/coverage_met: false/coverage_met: true/' "$TEST_DIR/.claude/codeharness.local.md"
    sed -i '' 's/verification_run: false/verification_run: true/' "$TEST_DIR/.claude/codeharness.local.md"

    bash "$VERIFY_SH" \
        --story-id "1.1" \
        --project-dir "$TEST_DIR" \
        --progress "$TEST_DIR/ralph/progress.json"

    local task_status
    task_status=$(jq -r '.tasks[] | select(.id == "1.1") | .status' "$TEST_DIR/ralph/progress.json")
    [[ "$task_status" == "complete" ]]
}

@test "verify_gates does not mark other stories complete" {
    cat > "$TEST_DIR/verification/1.1-proof.md" << 'EOF'
---
story_id: "1.1"
result: pass
---
# Proof
EOF
    sed -i '' 's/tests_passed: false/tests_passed: true/' "$TEST_DIR/.claude/codeharness.local.md"
    sed -i '' 's/coverage_met: false/coverage_met: true/' "$TEST_DIR/.claude/codeharness.local.md"
    sed -i '' 's/verification_run: false/verification_run: true/' "$TEST_DIR/.claude/codeharness.local.md"

    bash "$VERIFY_SH" \
        --story-id "1.1" \
        --project-dir "$TEST_DIR" \
        --progress "$TEST_DIR/ralph/progress.json"

    local task_status
    task_status=$(jq -r '.tasks[] | select(.id == "1.2") | .status' "$TEST_DIR/ralph/progress.json")
    [[ "$task_status" == "pending" ]]
}

# ─── Iteration tracking ──────────────────────────────────────────────────

@test "verify_gates increments iteration count on failure" {
    run bash "$VERIFY_SH" \
        --story-id "1.1" \
        --project-dir "$TEST_DIR" \
        --progress "$TEST_DIR/ralph/progress.json"

    local iterations
    iterations=$(jq -r '.tasks[] | select(.id == "1.1") | .iterations // 0' "$TEST_DIR/ralph/progress.json")
    [[ "$iterations" == "1" ]]
}

@test "verify_gates increments iteration count cumulatively" {
    # First failure
    bash "$VERIFY_SH" \
        --story-id "1.1" \
        --project-dir "$TEST_DIR" \
        --progress "$TEST_DIR/ralph/progress.json" || true

    # Second failure
    bash "$VERIFY_SH" \
        --story-id "1.1" \
        --project-dir "$TEST_DIR" \
        --progress "$TEST_DIR/ralph/progress.json" || true

    local iterations
    iterations=$(jq -r '.tasks[] | select(.id == "1.1") | .iterations // 0' "$TEST_DIR/ralph/progress.json")
    [[ "$iterations" == "2" ]]
}

# ─── Verification state tracking ─────────────────────────────────────────

@test "verify_gates resets session flags after story completion" {
    cat > "$TEST_DIR/verification/1.1-proof.md" << 'EOF'
---
story_id: "1.1"
result: pass
---
# Proof
EOF
    sed -i '' 's/tests_passed: false/tests_passed: true/' "$TEST_DIR/.claude/codeharness.local.md"
    sed -i '' 's/coverage_met: false/coverage_met: true/' "$TEST_DIR/.claude/codeharness.local.md"
    sed -i '' 's/verification_run: false/verification_run: true/' "$TEST_DIR/.claude/codeharness.local.md"

    bash "$VERIFY_SH" \
        --story-id "1.1" \
        --project-dir "$TEST_DIR" \
        --progress "$TEST_DIR/ralph/progress.json"

    # Session flags should be reset for the next story
    grep -q 'tests_passed: false' "$TEST_DIR/.claude/codeharness.local.md"
    grep -q 'coverage_met: false' "$TEST_DIR/.claude/codeharness.local.md"
    grep -q 'verification_run: false' "$TEST_DIR/.claude/codeharness.local.md"
}

# ─── Output format ────────────────────────────────────────────────────────

@test "verify_gates outputs JSON result" {
    run bash "$VERIFY_SH" \
        --story-id "1.1" \
        --project-dir "$TEST_DIR" \
        --progress "$TEST_DIR/ralph/progress.json"
    # Output should contain JSON with gate results
    echo "$output" | grep -q "proof_exists\|gates_passed\|BLOCKED\|PASS"
}

@test "verify_gates lists specific failures" {
    run bash "$VERIFY_SH" \
        --story-id "1.1" \
        --project-dir "$TEST_DIR" \
        --progress "$TEST_DIR/ralph/progress.json"
    [[ "$output" == *"proof"* ]]
}

# ─── Edge cases ───────────────────────────────────────────────────────────

@test "verify_gates handles missing state file gracefully" {
    rm -f "$TEST_DIR/.claude/codeharness.local.md"
    run bash "$VERIFY_SH" \
        --story-id "1.1" \
        --project-dir "$TEST_DIR" \
        --progress "$TEST_DIR/ralph/progress.json"
    [[ $status -ne 0 ]]
    [[ "$output" == *"state file"* || "$output" == *"not found"* || "$output" == *"not initialized"* ]]
}

@test "verify_gates handles missing progress file gracefully" {
    rm -f "$TEST_DIR/ralph/progress.json"
    run bash "$VERIFY_SH" \
        --story-id "1.1" \
        --project-dir "$TEST_DIR" \
        --progress "$TEST_DIR/ralph/progress.json"
    [[ $status -ne 0 ]]
}

@test "verify_gates handles unknown story ID" {
    run bash "$VERIFY_SH" \
        --story-id "99.99" \
        --project-dir "$TEST_DIR" \
        --progress "$TEST_DIR/ralph/progress.json"
    [[ $status -ne 0 ]]
    [[ "$output" == *"not found"* ]]
}
