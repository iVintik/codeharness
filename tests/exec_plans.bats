#!/usr/bin/env bats
# Tests for Story 7.2: Exec-Plan Lifecycle
# Verifies exec-plan generation, content, and active→completed lifecycle

load test_helper

EXEC_PLANS_SH="$BATS_TEST_DIRNAME/../ralph/exec_plans.sh"

setup() {
    setup_test_dir
    mkdir -p "$TEST_DIR/docs/exec-plans/active" "$TEST_DIR/docs/exec-plans/completed"
    mkdir -p "$TEST_DIR/ralph" "$TEST_DIR/verification"

    # Create progress file with tasks
    cat > "$TEST_DIR/ralph/progress.json" << 'EOF'
{
    "generated_at": "2026-03-14T12:00:00Z",
    "source": "test",
    "tasks": [
        {
            "id": "1.1",
            "title": "Login Page",
            "epic": "Epic 1: User Authentication",
            "description": "As a user, I want to log in with email and password, So that I can access my account.",
            "status": "pending",
            "acceptance_criteria": [
                "Given a registered user visits the login page When they enter valid credentials Then they are redirected to the dashboard",
                "And a session token is stored"
            ],
            "verification": {
                "proof_path": "verification/1.1-proof.md"
            }
        },
        {
            "id": "1.2",
            "title": "Registration",
            "epic": "Epic 1: User Authentication",
            "description": "As a user, I want to create an account.",
            "status": "complete",
            "acceptance_criteria": ["Given a visitor clicks Sign Up When they fill the form Then an account is created"],
            "verification": {
                "proof_path": "verification/1.2-proof.md"
            }
        }
    ]
}
EOF
}

teardown() {
    teardown_test_dir
}

# ─── Script existence ──────────────────────────────────────────────────────

@test "exec_plans.sh exists" {
    [[ -f "$EXEC_PLANS_SH" ]]
}

@test "exec_plans.sh is valid bash" {
    bash -n "$EXEC_PLANS_SH"
}

@test "exec_plans.sh --help exits 0" {
    run bash "$EXEC_PLANS_SH" --help
    [[ $status -eq 0 ]]
}

# ─── Generate exec-plans ─────────────────────────────────────────────────

@test "generate creates exec-plan files in active/" {
    bash "$EXEC_PLANS_SH" generate \
        --progress "$TEST_DIR/ralph/progress.json" \
        --output-dir "$TEST_DIR/docs/exec-plans"
    [[ -f "$TEST_DIR/docs/exec-plans/active/1.1.md" ]]
}

@test "generate creates one file per story" {
    bash "$EXEC_PLANS_SH" generate \
        --progress "$TEST_DIR/ralph/progress.json" \
        --output-dir "$TEST_DIR/docs/exec-plans"
    local count
    count=$(ls "$TEST_DIR/docs/exec-plans/active/"*.md 2>/dev/null | wc -l | tr -d ' ')
    # Only pending stories get active exec-plans (1.1 is pending, 1.2 is complete)
    [[ "$count" == "1" ]]
}

@test "generate puts completed stories in completed/" {
    bash "$EXEC_PLANS_SH" generate \
        --progress "$TEST_DIR/ralph/progress.json" \
        --output-dir "$TEST_DIR/docs/exec-plans"
    [[ -f "$TEST_DIR/docs/exec-plans/completed/1.2.md" ]]
}

@test "generate exec-plan contains story summary" {
    bash "$EXEC_PLANS_SH" generate \
        --progress "$TEST_DIR/ralph/progress.json" \
        --output-dir "$TEST_DIR/docs/exec-plans"
    grep -q "Login Page" "$TEST_DIR/docs/exec-plans/active/1.1.md"
}

@test "generate exec-plan contains acceptance criteria" {
    bash "$EXEC_PLANS_SH" generate \
        --progress "$TEST_DIR/ralph/progress.json" \
        --output-dir "$TEST_DIR/docs/exec-plans"
    grep -q "Acceptance Criteria" "$TEST_DIR/docs/exec-plans/active/1.1.md"
}

@test "generate exec-plan contains progress log section" {
    bash "$EXEC_PLANS_SH" generate \
        --progress "$TEST_DIR/ralph/progress.json" \
        --output-dir "$TEST_DIR/docs/exec-plans"
    grep -q "Progress Log" "$TEST_DIR/docs/exec-plans/active/1.1.md"
}

@test "generate exec-plan contains verification status section" {
    bash "$EXEC_PLANS_SH" generate \
        --progress "$TEST_DIR/ralph/progress.json" \
        --output-dir "$TEST_DIR/docs/exec-plans"
    grep -q "Verification" "$TEST_DIR/docs/exec-plans/active/1.1.md"
}

@test "generate exec-plan contains epic reference" {
    bash "$EXEC_PLANS_SH" generate \
        --progress "$TEST_DIR/ralph/progress.json" \
        --output-dir "$TEST_DIR/docs/exec-plans"
    grep -q "Epic 1" "$TEST_DIR/docs/exec-plans/active/1.1.md"
}

@test "generate exec-plan contains story description" {
    bash "$EXEC_PLANS_SH" generate \
        --progress "$TEST_DIR/ralph/progress.json" \
        --output-dir "$TEST_DIR/docs/exec-plans"
    grep -q "log in" "$TEST_DIR/docs/exec-plans/active/1.1.md"
}

# ─── Complete (move active→completed) ─────────────────────────────────────

@test "complete moves exec-plan from active to completed" {
    # First generate
    bash "$EXEC_PLANS_SH" generate \
        --progress "$TEST_DIR/ralph/progress.json" \
        --output-dir "$TEST_DIR/docs/exec-plans"
    [[ -f "$TEST_DIR/docs/exec-plans/active/1.1.md" ]]

    # Then complete
    bash "$EXEC_PLANS_SH" complete \
        --story-id "1.1" \
        --output-dir "$TEST_DIR/docs/exec-plans" \
        --proof-path "verification/1.1-proof.md"
    [[ ! -f "$TEST_DIR/docs/exec-plans/active/1.1.md" ]]
    [[ -f "$TEST_DIR/docs/exec-plans/completed/1.1.md" ]]
}

@test "complete appends verification summary" {
    bash "$EXEC_PLANS_SH" generate \
        --progress "$TEST_DIR/ralph/progress.json" \
        --output-dir "$TEST_DIR/docs/exec-plans"
    bash "$EXEC_PLANS_SH" complete \
        --story-id "1.1" \
        --output-dir "$TEST_DIR/docs/exec-plans" \
        --proof-path "verification/1.1-proof.md"
    grep -q "Verified" "$TEST_DIR/docs/exec-plans/completed/1.1.md"
}

@test "complete appends Showboat proof link" {
    bash "$EXEC_PLANS_SH" generate \
        --progress "$TEST_DIR/ralph/progress.json" \
        --output-dir "$TEST_DIR/docs/exec-plans"
    bash "$EXEC_PLANS_SH" complete \
        --story-id "1.1" \
        --output-dir "$TEST_DIR/docs/exec-plans" \
        --proof-path "verification/1.1-proof.md"
    grep -q "verification/1.1-proof.md" "$TEST_DIR/docs/exec-plans/completed/1.1.md"
}

@test "complete fails gracefully for missing exec-plan" {
    run bash "$EXEC_PLANS_SH" complete \
        --story-id "99.99" \
        --output-dir "$TEST_DIR/docs/exec-plans" \
        --proof-path "verification/99.99-proof.md"
    [[ $status -ne 0 ]]
}

# ─── Idempotency ──────────────────────────────────────────────────────────

@test "generate is idempotent — running twice preserves content" {
    bash "$EXEC_PLANS_SH" generate \
        --progress "$TEST_DIR/ralph/progress.json" \
        --output-dir "$TEST_DIR/docs/exec-plans"
    local first_content
    first_content=$(cat "$TEST_DIR/docs/exec-plans/active/1.1.md")

    bash "$EXEC_PLANS_SH" generate \
        --progress "$TEST_DIR/ralph/progress.json" \
        --output-dir "$TEST_DIR/docs/exec-plans"
    local second_content
    second_content=$(cat "$TEST_DIR/docs/exec-plans/active/1.1.md")

    [[ "$first_content" == "$second_content" ]]
}

# ─── Error handling ───────────────────────────────────────────────────────

@test "generate fails without progress file" {
    run bash "$EXEC_PLANS_SH" generate \
        --progress "$TEST_DIR/nonexistent.json" \
        --output-dir "$TEST_DIR/docs/exec-plans"
    [[ $status -ne 0 ]]
}

@test "generate fails without output dir" {
    run bash "$EXEC_PLANS_SH" generate \
        --progress "$TEST_DIR/ralph/progress.json"
    [[ $status -ne 0 ]]
}
