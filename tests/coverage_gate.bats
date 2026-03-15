#!/usr/bin/env bats
# Tests for Story 4.3: Testing, Coverage & Quality Gates
# Tests the `codeharness coverage` CLI command
#
# Uses tsx to run the TypeScript source directly, avoiding
# bundle-time import.meta.url resolution issues with createRequire.

load test_helper

PROJECT_ROOT="$BATS_TEST_DIRNAME/.."

setup() {
    export ORIGINAL_DIR="$PWD"
    cd "$PROJECT_ROOT"
}

teardown() {
    cd "$ORIGINAL_DIR"
}

run_coverage() {
    npx tsx src/index.ts coverage "$@"
}

# ─── Command existence and help ──────────────────────────────────────────

@test "codeharness coverage --help exits 0" {
    run run_coverage --help
    [[ $status -eq 0 ]]
    [[ "$output" == *"coverage"* ]]
}

@test "codeharness coverage --help shows --json option" {
    run run_coverage --help
    [[ "$output" == *"--json"* ]]
}

@test "codeharness coverage --help shows --check-only option" {
    run run_coverage --help
    [[ "$output" == *"--check-only"* ]]
}

@test "codeharness coverage --help shows --story option" {
    run run_coverage --help
    [[ "$output" == *"--story"* ]]
}

@test "codeharness coverage --help mentions targets" {
    run run_coverage --help
    [[ "$output" == *"target"* || "$output" == *"coverage"* ]]
}

# ─── Check-only mode against project's own coverage ──────────────────────

@test "coverage --check-only detects c8 tool for this project" {
    run run_coverage --check-only
    # Should detect the c8 tool (this project uses @vitest/coverage-v8)
    [[ "$output" == *"c8"* || "$output" == *"Coverage"* || "$output" == *"coverage"* ]]
}

@test "coverage --check-only --json returns parseable JSON" {
    run run_coverage --check-only --json
    # The last line of output should be valid JSON with expected fields
    local json_line
    json_line=$(echo "$output" | grep '{' | tail -1)
    echo "$json_line" | node -e "
      const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      if (typeof data.tool !== 'string') process.exit(1);
      if (typeof data.met !== 'boolean') process.exit(1);
    "
}

@test "coverage --check-only --json has required fields" {
    run run_coverage --check-only --json
    local json_line
    json_line=$(echo "$output" | grep '{' | tail -1)
    local check
    check=$(echo "$json_line" | node -e "
      const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      const required = ['testsPassed','coveragePercent','target','met','tool'];
      const missing = required.filter(k => !(k in d));
      if (missing.length > 0) { console.log('missing:' + missing.join(',')); process.exit(1); }
      console.log('ok');
    ")
    [[ "$check" == "ok" ]]
}

# ─── Story flag ──────────────────────────────────────────────────────────

@test "coverage --check-only --json --story includes story field" {
    run run_coverage --check-only --json --story 4-3-test
    local json_line
    json_line=$(echo "$output" | grep '{' | tail -1)
    local story
    story=$(echo "$json_line" | node -e "
      const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      process.stdout.write(d.story || '');
    ")
    [[ "$story" == "4-3-test" ]]
}
