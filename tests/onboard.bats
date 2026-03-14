#!/usr/bin/env bats
# Tests for Epic 9: Brownfield Onboarding (Stories 9.1-9.7)

load test_helper

ONBOARD_SH="$BATS_TEST_DIRNAME/../ralph/onboard.sh"

setup() {
    setup_test_dir
    mkdir -p "$TEST_DIR/.claude" "$TEST_DIR/ralph"

    cat > "$TEST_DIR/.claude/codeharness.local.md" << 'EOF'
---
harness_version: "0.1.0"
initialized: true
stack: "Node.js"
---
EOF

    # Create a realistic project structure
    mkdir -p "$TEST_DIR/src/auth" "$TEST_DIR/src/api" "$TEST_DIR/src/utils"
    echo 'function login() {}' > "$TEST_DIR/src/auth/login.js"
    echo 'function logout() {}' > "$TEST_DIR/src/auth/logout.js"
    echo 'function session() {}' > "$TEST_DIR/src/auth/session.js"
    echo 'const router = {};' > "$TEST_DIR/src/api/routes.js"
    echo 'const middleware = {};' > "$TEST_DIR/src/api/middleware.js"
    echo 'const validate = {};' > "$TEST_DIR/src/api/validate.js"
    echo 'function fmt() {}' > "$TEST_DIR/src/utils/format.js"
    echo '# My Project' > "$TEST_DIR/README.md"

    # Test files
    mkdir -p "$TEST_DIR/tests"
    echo 'test("login")' > "$TEST_DIR/tests/auth.test.js"

    git -C "$TEST_DIR" add -A && git -C "$TEST_DIR" commit -q -m "initial project"
}

teardown() {
    teardown_test_dir
}

# ─── Script basics ─────────────────────────────────────────────────────────

@test "onboard.sh exists" {
    [[ -f "$ONBOARD_SH" ]]
}

@test "onboard.sh is valid bash" {
    bash -n "$ONBOARD_SH"
}

@test "onboard.sh --help exits 0" {
    run bash "$ONBOARD_SH" --help
    [[ $status -eq 0 ]]
}

# ─── Story 9.1: Codebase Scan ─────────────────────────────────────────────

@test "scan detects project structure" {
    run bash "$ONBOARD_SH" scan --project-dir "$TEST_DIR"
    [[ $status -eq 0 ]]
    [[ "$output" == *"src/auth"* ]]
    [[ "$output" == *"src/api"* ]]
}

@test "scan counts source files per module" {
    run bash "$ONBOARD_SH" scan --project-dir "$TEST_DIR"
    [[ "$output" == *"3"* ]]  # auth has 3 files
}

@test "scan detects existing test files" {
    run bash "$ONBOARD_SH" scan --project-dir "$TEST_DIR"
    [[ "$output" == *"test"* ]]
}

@test "scan detects README" {
    run bash "$ONBOARD_SH" scan --project-dir "$TEST_DIR"
    [[ "$output" == *"README"* ]]
}

@test "scan detects missing ARCHITECTURE.md" {
    run bash "$ONBOARD_SH" scan --project-dir "$TEST_DIR"
    [[ "$output" == *"ARCHITECTURE"* ]]
}

# ─── Story 9.2: Coverage Gap ──────────────────────────────────────────────

@test "coverage subcommand reports coverage status" {
    run bash "$ONBOARD_SH" coverage --project-dir "$TEST_DIR"
    [[ $status -eq 0 ]]
    [[ "$output" == *"Coverage"* || "$output" == *"coverage"* ]]
}

@test "coverage lists modules needing tests" {
    run bash "$ONBOARD_SH" coverage --project-dir "$TEST_DIR"
    # api/ has no tests
    [[ "$output" == *"api"* ]]
}

# ─── Story 9.3: Documentation Audit ──────────────────────────────────────

@test "audit checks for missing AGENTS.md" {
    run bash "$ONBOARD_SH" audit --project-dir "$TEST_DIR"
    [[ $status -eq 0 ]]
    [[ "$output" == *"AGENTS.md"* ]]
}

@test "audit reports doc freshness" {
    run bash "$ONBOARD_SH" audit --project-dir "$TEST_DIR"
    [[ "$output" == *"README"* ]]
}

# ─── Story 9.5: Onboarding Epic Generation ────────────────────────────────

@test "epic generates onboarding stories" {
    bash "$ONBOARD_SH" epic \
        --project-dir "$TEST_DIR" \
        --output "$TEST_DIR/ralph/onboarding-epic.md"
    [[ -f "$TEST_DIR/ralph/onboarding-epic.md" ]]
}

@test "epic contains stories with Given/When/Then AC" {
    bash "$ONBOARD_SH" epic \
        --project-dir "$TEST_DIR" \
        --output "$TEST_DIR/ralph/onboarding-epic.md"
    grep -qi "given\|when\|then" "$TEST_DIR/ralph/onboarding-epic.md"
}

@test "epic includes coverage stories per module" {
    bash "$ONBOARD_SH" epic \
        --project-dir "$TEST_DIR" \
        --output "$TEST_DIR/ralph/onboarding-epic.md"
    grep -q "coverage\|test" "$TEST_DIR/ralph/onboarding-epic.md"
}

@test "epic includes AGENTS.md stories" {
    bash "$ONBOARD_SH" epic \
        --project-dir "$TEST_DIR" \
        --output "$TEST_DIR/ralph/onboarding-epic.md"
    grep -q "AGENTS.md" "$TEST_DIR/ralph/onboarding-epic.md"
}

# ─── Story 9.6: JSON output for review ────────────────────────────────────

@test "scan --json produces valid JSON" {
    run bash "$ONBOARD_SH" scan --project-dir "$TEST_DIR" --json
    echo "$output" | jq '.' > /dev/null
}

# ─── Command & Agent ──────────────────────────────────────────────────────

@test "harness-onboard.md command exists" {
    [[ -f "$BATS_TEST_DIRNAME/../commands/harness-onboard.md" ]]
}
