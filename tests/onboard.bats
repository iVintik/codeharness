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

# ─── Story 9.1-9.6: Onboard CLI delegation tests ─────────────────────────
# These tests validate onboard.sh argument parsing and error handling.
# Full subcommand behavior (scan, audit, coverage, epic) is tested
# via TypeScript unit tests in the CLI, not via BATS.
# (Replaced 14 broken skip tests in story 7-2.)

@test "onboard.sh requires --project-dir" {
    run bash "$ONBOARD_SH" scan
    [[ $status -ne 0 ]]
    [[ "$output" == *"--project-dir is required"* ]]
}

@test "onboard.sh rejects unknown options" {
    run bash "$ONBOARD_SH" scan --bogus-flag
    [[ $status -ne 0 ]]
    [[ "$output" == *"Unknown option"* ]]
}

@test "onboard.sh requires a subcommand" {
    run bash "$ONBOARD_SH" --project-dir "$TEST_DIR"
    [[ $status -ne 0 ]]
    [[ "$output" == *"specify command"* ]]
}

@test "onboard.sh rejects unknown subcommand" {
    run bash "$ONBOARD_SH" boguscmd --project-dir "$TEST_DIR"
    [[ $status -ne 0 ]]
    [[ "$output" == *"Unknown command"* ]]
}

@test "onboard.sh --help mentions scan, coverage, audit, epic" {
    run bash "$ONBOARD_SH" --help
    [[ $status -eq 0 ]]
    [[ "$output" == *"scan"* ]]
    [[ "$output" == *"coverage"* ]]
    [[ "$output" == *"audit"* ]]
    [[ "$output" == *"epic"* ]]
}

# ─── Command & Agent ──────────────────────────────────────────────────────

@test "harness-onboard.md command exists" {
    [[ -f "$BATS_TEST_DIRNAME/../commands/harness-onboard.md" ]]
}
