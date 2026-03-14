#!/usr/bin/env bats
# Tests for Story 7.5: Design-Doc Validation at Epic Completion
# Validates that ARCHITECTURE.md is current when all stories in an epic are verified

load test_helper

VALIDATE_SH="$BATS_TEST_DIRNAME/../ralph/validate_epic_docs.sh"

setup() {
    setup_test_dir
    mkdir -p "$TEST_DIR/ralph"

    # Create ARCHITECTURE.md
    cat > "$TEST_DIR/ARCHITECTURE.md" << 'EOF'
# Architecture

## Decisions
- Use REST API
EOF
    git -C "$TEST_DIR" add -A && git -C "$TEST_DIR" commit -q -m "add architecture doc"

    # Create progress with an epic's stories
    cat > "$TEST_DIR/ralph/progress.json" << 'EOF'
{
    "tasks": [
        {"id": "1.1", "title": "Login", "epic": "Epic 1: Auth", "status": "complete"},
        {"id": "1.2", "title": "Register", "epic": "Epic 1: Auth", "status": "complete"},
        {"id": "2.1", "title": "Dashboard", "epic": "Epic 2: UI", "status": "pending"}
    ]
}
EOF
}

teardown() {
    teardown_test_dir
}

# ─── Script basics ─────────────────────────────────────────────────────────

@test "validate_epic_docs.sh exists" {
    [[ -f "$VALIDATE_SH" ]]
}

@test "validate_epic_docs.sh is valid bash" {
    bash -n "$VALIDATE_SH"
}

@test "validate_epic_docs.sh --help exits 0" {
    run bash "$VALIDATE_SH" --help
    [[ $status -eq 0 ]]
}

# ─── Epic completion detection ─────────────────────────────────────────────

@test "detects when all stories in an epic are complete" {
    run bash "$VALIDATE_SH" \
        --epic "Epic 1: Auth" \
        --project-dir "$TEST_DIR" \
        --progress "$TEST_DIR/ralph/progress.json"
    # Epic 1 has all stories complete — should proceed to validation
    [[ "$output" == *"Epic 1"* ]]
}

@test "rejects epic with incomplete stories" {
    run bash "$VALIDATE_SH" \
        --epic "Epic 2: UI" \
        --project-dir "$TEST_DIR" \
        --progress "$TEST_DIR/ralph/progress.json"
    [[ $status -ne 0 ]]
    [[ "$output" == *"not complete"* || "$output" == *"pending"* ]]
}

# ─── ARCHITECTURE.md validation ────────────────────────────────────────────

@test "passes when ARCHITECTURE.md is current" {
    run bash "$VALIDATE_SH" \
        --epic "Epic 1: Auth" \
        --project-dir "$TEST_DIR" \
        --progress "$TEST_DIR/ralph/progress.json"
    [[ $status -eq 0 ]]
}

@test "fails when ARCHITECTURE.md is missing" {
    rm "$TEST_DIR/ARCHITECTURE.md"
    git -C "$TEST_DIR" add -A && git -C "$TEST_DIR" commit -q -m "remove arch doc"

    run bash "$VALIDATE_SH" \
        --epic "Epic 1: Auth" \
        --project-dir "$TEST_DIR" \
        --progress "$TEST_DIR/ralph/progress.json"
    [[ $status -ne 0 ]]
    [[ "$output" == *"ARCHITECTURE.md"* ]]
}

@test "fails when ARCHITECTURE.md is stale vs epic stories" {
    # Make code changes after ARCHITECTURE.md
    sleep 1
    echo 'new code' > "$TEST_DIR/new_feature.js"
    git -C "$TEST_DIR" add -A && git -C "$TEST_DIR" commit -q -m "add new feature"

    # Mark the new commit as within the epic timeframe by updating progress
    cat > "$TEST_DIR/ralph/progress.json" << 'EOF'
{
    "tasks": [
        {"id": "1.1", "title": "Login", "epic": "Epic 1: Auth", "status": "complete"},
        {"id": "1.2", "title": "New Feature", "epic": "Epic 1: Auth", "status": "complete"}
    ]
}
EOF

    run bash "$VALIDATE_SH" \
        --epic "Epic 1: Auth" \
        --project-dir "$TEST_DIR" \
        --progress "$TEST_DIR/ralph/progress.json"
    [[ $status -ne 0 ]]
    [[ "$output" == *"stale"* || "$output" == *"update"* ]]
}

# ─── Output format ─────────────────────────────────────────────────────────

@test "outputs validation result with epic name" {
    run bash "$VALIDATE_SH" \
        --epic "Epic 1: Auth" \
        --project-dir "$TEST_DIR" \
        --progress "$TEST_DIR/ralph/progress.json"
    [[ "$output" == *"Epic 1"* ]]
}

@test "outputs actionable message on failure" {
    rm "$TEST_DIR/ARCHITECTURE.md"
    git -C "$TEST_DIR" add -A && git -C "$TEST_DIR" commit -q -m "remove"

    run bash "$VALIDATE_SH" \
        --epic "Epic 1: Auth" \
        --project-dir "$TEST_DIR" \
        --progress "$TEST_DIR/ralph/progress.json"
    [[ "$output" == *"→"* || "$output" == *"update"* || "$output" == *"create"* ]]
}

# ─── Error handling ────────────────────────────────────────────────────────

@test "fails without --epic argument" {
    run bash "$VALIDATE_SH" \
        --project-dir "$TEST_DIR" \
        --progress "$TEST_DIR/ralph/progress.json"
    [[ $status -ne 0 ]]
}

@test "fails without --progress argument" {
    run bash "$VALIDATE_SH" \
        --epic "Epic 1: Auth" \
        --project-dir "$TEST_DIR"
    [[ $status -ne 0 ]]
}
