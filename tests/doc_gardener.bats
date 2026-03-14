#!/usr/bin/env bats
# Tests for Story 7.3: Doc-Gardener Subagent
# Tests the scan script that detects stale/missing documentation

load test_helper

DOC_GARDENER_SH="$BATS_TEST_DIRNAME/../ralph/doc_gardener.sh"

setup() {
    setup_test_dir
    mkdir -p "$TEST_DIR/ralph" "$TEST_DIR/docs/exec-plans/active" "$TEST_DIR/docs/exec-plans/completed"

    # Create a module with source files and AGENTS.md
    mkdir -p "$TEST_DIR/src/auth"
    echo 'function login() {}' > "$TEST_DIR/src/auth/login.js"
    cat > "$TEST_DIR/src/auth/AGENTS.md" << 'EOF'
# auth/

Authentication module.

## Key Files

| File | Purpose |
|------|---------|
| login.js | Login logic |
EOF
    git -C "$TEST_DIR" add -A && git -C "$TEST_DIR" commit -q -m "add auth module"
}

teardown() {
    teardown_test_dir
}

# ─── Script existence ──────────────────────────────────────────────────────

@test "doc_gardener.sh exists" {
    [[ -f "$DOC_GARDENER_SH" ]]
}

@test "doc_gardener.sh is valid bash" {
    bash -n "$DOC_GARDENER_SH"
}

@test "doc_gardener.sh --help exits 0" {
    run bash "$DOC_GARDENER_SH" --help
    [[ $status -eq 0 ]]
}

# ─── Detect missing AGENTS.md ─────────────────────────────────────────────

@test "detects module without AGENTS.md" {
    # Create module without AGENTS.md
    mkdir -p "$TEST_DIR/src/payments"
    echo 'function pay() {}' > "$TEST_DIR/src/payments/pay.js"
    echo 'function refund() {}' > "$TEST_DIR/src/payments/refund.js"
    echo 'const helper = true;' > "$TEST_DIR/src/payments/helper.js"
    git -C "$TEST_DIR" add -A && git -C "$TEST_DIR" commit -q -m "add payments"

    run bash "$DOC_GARDENER_SH" --project-dir "$TEST_DIR"
    [[ "$output" == *"payments"* ]]
    [[ "$output" == *"missing"* || "$output" == *"AGENTS.md"* ]]
}

@test "does not flag module with AGENTS.md" {
    run bash "$DOC_GARDENER_SH" --project-dir "$TEST_DIR"
    # auth/ has AGENTS.md, should not be flagged as missing
    [[ "$output" != *"auth"*"missing"* ]]
}

# ─── Detect stale AGENTS.md ──────────────────────────────────────────────

@test "detects stale AGENTS.md when code changed after docs" {
    # Modify code after AGENTS.md was committed
    sleep 1  # ensure timestamp differs
    echo 'function logout() {}' > "$TEST_DIR/src/auth/logout.js"
    git -C "$TEST_DIR" add -A && git -C "$TEST_DIR" commit -q -m "add logout"

    run bash "$DOC_GARDENER_SH" --project-dir "$TEST_DIR"
    [[ "$output" == *"auth"* ]]
    [[ "$output" == *"stale"* ]]
}

# ─── Detect stale exec-plans ─────────────────────────────────────────────

@test "detects stale exec-plans in active/ for completed stories" {
    # Create a progress file with a completed story
    cat > "$TEST_DIR/ralph/progress.json" << 'EOF'
{"tasks": [{"id": "1.1", "title": "Login", "status": "complete"}]}
EOF
    # But exec-plan is still in active/
    echo "# Story 1.1" > "$TEST_DIR/docs/exec-plans/active/1.1.md"

    run bash "$DOC_GARDENER_SH" --project-dir "$TEST_DIR"
    [[ "$output" == *"1.1"* ]]
    [[ "$output" == *"stale"* || "$output" == *"active"* ]]
}

@test "does not flag active exec-plans for pending stories" {
    cat > "$TEST_DIR/ralph/progress.json" << 'EOF'
{"tasks": [{"id": "2.1", "title": "Dashboard", "status": "pending"}]}
EOF
    echo "# Story 2.1" > "$TEST_DIR/docs/exec-plans/active/2.1.md"

    run bash "$DOC_GARDENER_SH" --project-dir "$TEST_DIR"
    [[ "$output" != *"2.1"*"stale"* ]]
}

# ─── Output format ────────────────────────────────────────────────────────

@test "outputs findings as structured report" {
    mkdir -p "$TEST_DIR/src/payments"
    echo 'function pay() {}' > "$TEST_DIR/src/payments/pay.js"
    echo 'function refund() {}' > "$TEST_DIR/src/payments/refund.js"
    echo 'const x = 1;' > "$TEST_DIR/src/payments/x.js"
    git -C "$TEST_DIR" add -A && git -C "$TEST_DIR" commit -q -m "add payments"

    run bash "$DOC_GARDENER_SH" --project-dir "$TEST_DIR"
    [[ "$output" == *"Doc-Gardener"* ]]
}

@test "outputs finding count" {
    run bash "$DOC_GARDENER_SH" --project-dir "$TEST_DIR"
    [[ "$output" == *"finding"* ]]
}

# ─── JSON output mode ─────────────────────────────────────────────────────

@test "supports --json output" {
    run bash "$DOC_GARDENER_SH" --project-dir "$TEST_DIR" --json
    # Should output valid JSON
    echo "$output" | jq '.' > /dev/null
}

@test "JSON output includes findings array" {
    mkdir -p "$TEST_DIR/src/payments"
    echo 'function pay() {}' > "$TEST_DIR/src/payments/pay.js"
    echo 'function refund() {}' > "$TEST_DIR/src/payments/refund.js"
    echo 'const x = 1;' > "$TEST_DIR/src/payments/x.js"
    git -C "$TEST_DIR" add -A && git -C "$TEST_DIR" commit -q -m "add payments"

    run bash "$DOC_GARDENER_SH" --project-dir "$TEST_DIR" --json
    local count
    count=$(echo "$output" | jq '.findings | length')
    [[ $count -gt 0 ]]
}

# ─── Performance ──────────────────────────────────────────────────────────

@test "scan completes within 60 seconds (NFR23)" {
    local start end elapsed
    start=$(date +%s)
    bash "$DOC_GARDENER_SH" --project-dir "$TEST_DIR" > /dev/null 2>&1
    end=$(date +%s)
    elapsed=$((end - start))
    [[ $elapsed -lt 60 ]]
}

# ─── Agent definition ─────────────────────────────────────────────────────

@test "doc-gardener agent definition exists" {
    [[ -f "$BATS_TEST_DIRNAME/../agents/doc-gardener.md" ]]
}

@test "doc-gardener agent is valid markdown with frontmatter" {
    grep -q "^---" "$BATS_TEST_DIRNAME/../agents/doc-gardener.md"
    grep -q "name:" "$BATS_TEST_DIRNAME/../agents/doc-gardener.md"
    grep -q "description:" "$BATS_TEST_DIRNAME/../agents/doc-gardener.md"
}
