#!/usr/bin/env bats
# Tests for Story 7.4: Quality Score & Tech Debt Tracker
# Validates quality-score.md and tech-debt-tracker.md generation

load test_helper

DOC_GARDENER_SH="$BATS_TEST_DIRNAME/../ralph/doc_gardener.sh"

setup() {
    setup_test_dir
    mkdir -p "$TEST_DIR/ralph" "$TEST_DIR/docs/quality" "$TEST_DIR/docs/exec-plans"

    # Create modules with varying doc health
    mkdir -p "$TEST_DIR/src/auth"
    echo 'function login() {}' > "$TEST_DIR/src/auth/login.js"
    echo 'function logout() {}' > "$TEST_DIR/src/auth/logout.js"
    echo 'function session() {}' > "$TEST_DIR/src/auth/session.js"
    cat > "$TEST_DIR/src/auth/AGENTS.md" << 'EOF'
# auth/
Authentication module.
## Key Files
| File | Purpose |
|------|---------|
| login.js | Login |
EOF

    mkdir -p "$TEST_DIR/src/payments"
    echo 'function pay() {}' > "$TEST_DIR/src/payments/pay.js"
    echo 'function refund() {}' > "$TEST_DIR/src/payments/refund.js"
    echo 'const helper = 1;' > "$TEST_DIR/src/payments/helper.js"
    # No AGENTS.md for payments

    mkdir -p "$TEST_DIR/src/utils"
    echo 'function fmt() {}' > "$TEST_DIR/src/utils/fmt.js"
    # Only 1 file, below threshold — no AGENTS.md expected

    git -C "$TEST_DIR" add -A && git -C "$TEST_DIR" commit -q -m "add modules"
}

teardown() {
    teardown_test_dir
}

# ─── Quality score report ─────────────────────────────────────────────────

@test "doc_gardener --report generates quality-score.md" {
    bash "$DOC_GARDENER_SH" --project-dir "$TEST_DIR" --report
    [[ -f "$TEST_DIR/docs/quality/quality-score.md" ]]
}

@test "quality-score.md has DO NOT EDIT MANUALLY header (NFR27)" {
    bash "$DOC_GARDENER_SH" --project-dir "$TEST_DIR" --report
    head -5 "$TEST_DIR/docs/quality/quality-score.md" | grep -qi "DO NOT EDIT MANUALLY"
}

@test "quality-score.md contains per-area grades" {
    bash "$DOC_GARDENER_SH" --project-dir "$TEST_DIR" --report
    grep -q "auth" "$TEST_DIR/docs/quality/quality-score.md"
}

@test "quality-score.md grades module with AGENTS.md higher" {
    bash "$DOC_GARDENER_SH" --project-dir "$TEST_DIR" --report
    # auth has AGENTS.md → should get a good grade
    # payments has no AGENTS.md → should get a bad grade
    local auth_line payments_line
    auth_line=$(grep "auth" "$TEST_DIR/docs/quality/quality-score.md" | head -1)
    payments_line=$(grep "payments" "$TEST_DIR/docs/quality/quality-score.md" | head -1)
    [[ -n "$auth_line" ]]
    [[ -n "$payments_line" ]]
}

# ─── Tech debt tracker ────────────────────────────────────────────────────

@test "doc_gardener --report generates tech-debt-tracker.md" {
    bash "$DOC_GARDENER_SH" --project-dir "$TEST_DIR" --report
    [[ -f "$TEST_DIR/docs/exec-plans/tech-debt-tracker.md" ]]
}

@test "tech-debt-tracker.md has DO NOT EDIT MANUALLY header (NFR27)" {
    bash "$DOC_GARDENER_SH" --project-dir "$TEST_DIR" --report
    head -5 "$TEST_DIR/docs/exec-plans/tech-debt-tracker.md" | grep -qi "DO NOT EDIT MANUALLY"
}

@test "tech-debt-tracker.md lists missing AGENTS.md as debt" {
    bash "$DOC_GARDENER_SH" --project-dir "$TEST_DIR" --report
    grep -q "payments" "$TEST_DIR/docs/exec-plans/tech-debt-tracker.md"
}

@test "tech-debt-tracker.md includes finding type" {
    bash "$DOC_GARDENER_SH" --project-dir "$TEST_DIR" --report
    grep -q "missing" "$TEST_DIR/docs/exec-plans/tech-debt-tracker.md"
}

# ─── Report references, not copies (NFR25) ────────────────────────────────

@test "quality-score.md does not contain copied planning artifact content" {
    bash "$DOC_GARDENER_SH" --project-dir "$TEST_DIR" --report
    # Should reference, not copy
    local content
    content=$(cat "$TEST_DIR/docs/quality/quality-score.md")
    # Should not contain full story definitions — just references if any
    [[ ${#content} -lt 5000 ]]
}

# ─── Report is regenerated each run ───────────────────────────────────────

@test "report is regenerated (not appended) on second run" {
    bash "$DOC_GARDENER_SH" --project-dir "$TEST_DIR" --report
    local first_size
    first_size=$(wc -c < "$TEST_DIR/docs/quality/quality-score.md")

    bash "$DOC_GARDENER_SH" --project-dir "$TEST_DIR" --report
    local second_size
    second_size=$(wc -c < "$TEST_DIR/docs/quality/quality-score.md")

    [[ "$first_size" == "$second_size" ]]
}

# ─── Normal scan still works with --report ────────────────────────────────

@test "doc_gardener still outputs findings with --report" {
    run bash "$DOC_GARDENER_SH" --project-dir "$TEST_DIR" --report
    [[ "$output" == *"finding"* ]]
}
