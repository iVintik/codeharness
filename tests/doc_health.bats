#!/usr/bin/env bats
# Tests for Story 4.4: Documentation Health & Freshness Enforcement
# Tests the `codeharness doc-health` CLI command
#
# Uses tsx to run the TypeScript source directly.

load test_helper

PROJECT_ROOT="$BATS_TEST_DIRNAME/.."

setup() {
    export ORIGINAL_DIR="$PWD"
    cd "$PROJECT_ROOT"
}

teardown() {
    cd "$ORIGINAL_DIR"
}

run_doc_health() {
    npx tsx src/index.ts doc-health "$@"
}

# ─── Command existence and help ──────────────────────────────────────────

@test "codeharness doc-health --help exits 0" {
    run run_doc_health --help
    [[ $status -eq 0 ]]
    [[ "$output" == *"doc-health"* ]]
}

@test "codeharness doc-health --help shows --json option" {
    run run_doc_health --help
    [[ "$output" == *"--json"* ]]
}

@test "codeharness doc-health --help shows --story option" {
    run run_doc_health --help
    [[ "$output" == *"--story"* ]]
}

@test "codeharness doc-health --help shows --fix option" {
    run run_doc_health --help
    [[ "$output" == *"--fix"* ]]
}

# ─── Run against the project itself ─────────────────────────────────────

@test "doc-health scans this project's AGENTS.md" {
    run run_doc_health
    # Should produce output mentioning AGENTS.md
    [[ "$output" == *"AGENTS.md"* ]]
}

@test "doc-health --json returns parseable JSON" {
    run run_doc_health --json
    local json_line
    json_line=$(echo "$output" | grep '{' | tail -1)
    echo "$json_line" | node -e "
      const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      if (typeof data.status !== 'string') process.exit(1);
      if (!Array.isArray(data.documents)) process.exit(1);
    "
}

@test "doc-health --json has required fields" {
    run run_doc_health --json
    local json_line
    json_line=$(echo "$output" | grep '{' | tail -1)
    local check
    check=$(echo "$json_line" | node -e "
      const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      const required = ['status','documents','summary','scanDurationMs'];
      const missing = required.filter(k => !(k in d));
      if (missing.length > 0) { console.log('missing:' + missing.join(',')); process.exit(1); }
      console.log('ok');
    ")
    [[ "$check" == "ok" ]]
}

@test "doc-health --json summary has correct fields" {
    run run_doc_health --json
    local json_line
    json_line=$(echo "$output" | grep '{' | tail -1)
    local check
    check=$(echo "$json_line" | node -e "
      const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      const s = d.summary;
      if (typeof s.fresh !== 'number') process.exit(1);
      if (typeof s.stale !== 'number') process.exit(1);
      if (typeof s.missing !== 'number') process.exit(1);
      if (typeof s.total !== 'number') process.exit(1);
      console.log('ok');
    ")
    [[ "$check" == "ok" ]]
}

# ─── Story flag ──────────────────────────────────────────────────────────

@test "doc-health --story scans targeted modules" {
    run run_doc_health --story test-story
    # Should not crash, should produce output
    [[ "$output" == *"Doc health"* || "$output" == *"AGENTS"* || "$output" == *"Story"* ]]
}

@test "doc-health --json --story includes scan results" {
    run run_doc_health --json --story test-story
    local json_line
    json_line=$(echo "$output" | grep '{' | tail -1)
    local check
    check=$(echo "$json_line" | node -e "
      const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      if (!('documents' in d)) process.exit(1);
      if (!('summary' in d)) process.exit(1);
      console.log('ok');
    ")
    [[ "$check" == "ok" ]]
}
