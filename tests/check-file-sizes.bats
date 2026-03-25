#!/usr/bin/env bats
# Tests for Story 15-1: CI File Size Gate
# Validates scripts/check-file-sizes.sh behavior with temp directories

load test_helper

PROJECT_ROOT="$BATS_TEST_DIRNAME/.."
SCRIPT="$PROJECT_ROOT/scripts/check-file-sizes.sh"

setup() {
  TEST_DIR="$(mktemp -d)"
  export TEST_DIR
  # Create the minimal directory structure the script expects
  mkdir -p "$TEST_DIR/src/commands"
  mkdir -p "$TEST_DIR/src/lib/__tests__"
}

teardown() {
  if [[ -n "$TEST_DIR" && -d "$TEST_DIR" ]]; then
    rm -rf "$TEST_DIR"
  fi
}

# Helper: create a .ts file with N lines
create_ts_file() {
  local path="$1"
  local lines="$2"
  mkdir -p "$(dirname "$path")"
  for ((i = 1; i <= lines; i++)); do
    echo "// line $i"
  done > "$path"
}

# ── Basic behavior ──────────────────────────────────────────────────────────

@test "check-file-sizes.sh exits 0 with no violations" {
  create_ts_file "$TEST_DIR/src/lib/small.ts" 100
  run env SRC_DIR="$TEST_DIR/src" bash "$SCRIPT"
  [[ $status -eq 0 ]]
  [[ "$output" == *"OK: No file size violations found"* ]]
}

@test "check-file-sizes.sh reports NFR1 violation for file >300 lines" {
  create_ts_file "$TEST_DIR/src/lib/big.ts" 350
  run env SRC_DIR="$TEST_DIR/src" FILE_SIZE_ENFORCEMENT=warn bash "$SCRIPT"
  [[ $status -eq 0 ]]
  [[ "$output" == *"NFR1 violations"* ]]
  [[ "$output" == *"big.ts"* ]]
  [[ "$output" == *"350 lines"* ]]
}

@test "check-file-sizes.sh does NOT flag files at exactly 300 lines" {
  create_ts_file "$TEST_DIR/src/lib/exact.ts" 300
  run env SRC_DIR="$TEST_DIR/src" bash "$SCRIPT"
  [[ $status -eq 0 ]]
  [[ "$output" == *"OK: No file size violations found"* ]]
}

@test "check-file-sizes.sh excludes __tests__ directories from NFR1" {
  create_ts_file "$TEST_DIR/src/lib/__tests__/big-test.ts" 500
  run env SRC_DIR="$TEST_DIR/src" bash "$SCRIPT"
  [[ $status -eq 0 ]]
  [[ "$output" == *"OK: No file size violations found"* ]]
}

# ── NFR5: Command file size ─────────────────────────────────────────────────

@test "check-file-sizes.sh reports NFR5 violation for command file >100 lines" {
  create_ts_file "$TEST_DIR/src/commands/big-cmd.ts" 150
  run env SRC_DIR="$TEST_DIR/src" FILE_SIZE_ENFORCEMENT=warn bash "$SCRIPT"
  [[ $status -eq 0 ]]
  [[ "$output" == *"NFR5 violations"* ]]
  [[ "$output" == *"big-cmd.ts"* ]]
  [[ "$output" == *"150 lines"* ]]
}

@test "check-file-sizes.sh does NOT flag command files at exactly 100 lines" {
  create_ts_file "$TEST_DIR/src/commands/ok-cmd.ts" 100
  run env SRC_DIR="$TEST_DIR/src" bash "$SCRIPT"
  [[ $status -eq 0 ]]
  [[ "$output" == *"OK: No file size violations found"* ]]
}

# ── Enforcement modes ───────────────────────────────────────────────────────

@test "FILE_SIZE_ENFORCEMENT=warn exits 0 even with violations" {
  create_ts_file "$TEST_DIR/src/lib/big.ts" 400
  run env SRC_DIR="$TEST_DIR/src" FILE_SIZE_ENFORCEMENT=warn bash "$SCRIPT"
  [[ $status -eq 0 ]]
  [[ "$output" == *"WARN"* ]]
}

@test "FILE_SIZE_ENFORCEMENT=fail exits 1 with violations" {
  create_ts_file "$TEST_DIR/src/lib/big.ts" 400
  run env SRC_DIR="$TEST_DIR/src" FILE_SIZE_ENFORCEMENT=fail bash "$SCRIPT"
  [[ $status -eq 1 ]]
  [[ "$output" == *"FAIL"* ]]
}

@test "FILE_SIZE_ENFORCEMENT=fail exits 0 with no violations" {
  create_ts_file "$TEST_DIR/src/lib/small.ts" 50
  run env SRC_DIR="$TEST_DIR/src" FILE_SIZE_ENFORCEMENT=fail bash "$SCRIPT"
  [[ $status -eq 0 ]]
  [[ "$output" == *"OK: No file size violations found"* ]]
}

@test "default enforcement mode is warn" {
  create_ts_file "$TEST_DIR/src/lib/big.ts" 400
  unset FILE_SIZE_ENFORCEMENT
  run env SRC_DIR="$TEST_DIR/src" bash "$SCRIPT"
  [[ $status -eq 0 ]]
  [[ "$output" == *"WARN"* ]]
}

# ── GitHub Actions annotations ──────────────────────────────────────────────

@test "check-file-sizes.sh emits ::error:: annotations for violations" {
  create_ts_file "$TEST_DIR/src/lib/big.ts" 350
  run env SRC_DIR="$TEST_DIR/src" FILE_SIZE_ENFORCEMENT=warn bash "$SCRIPT"
  [[ "$output" == *"::error file="* ]]
}

# ── Boundary tests (off-by-one) ────────────────────────────────────────────

@test "check-file-sizes.sh flags NFR1 at exactly 301 lines" {
  create_ts_file "$TEST_DIR/src/lib/boundary.ts" 301
  run env SRC_DIR="$TEST_DIR/src" FILE_SIZE_ENFORCEMENT=fail bash "$SCRIPT"
  [[ $status -eq 1 ]]
  [[ "$output" == *"301 lines"* ]]
}

@test "check-file-sizes.sh flags NFR5 at exactly 101 lines" {
  create_ts_file "$TEST_DIR/src/commands/boundary-cmd.ts" 101
  run env SRC_DIR="$TEST_DIR/src" FILE_SIZE_ENFORCEMENT=fail bash "$SCRIPT"
  [[ $status -eq 1 ]]
  [[ "$output" == *"101 lines"* ]]
}

# ── .tsx file support ──────────────────────────────────────────────────────

@test "check-file-sizes.sh detects oversized .tsx files" {
  create_ts_file "$TEST_DIR/src/lib/component.tsx" 350
  run env SRC_DIR="$TEST_DIR/src" FILE_SIZE_ENFORCEMENT=fail bash "$SCRIPT"
  [[ $status -eq 1 ]]
  [[ "$output" == *"component.tsx"* ]]
  [[ "$output" == *"350 lines"* ]]
}

# ── SRC_DIR edge cases ────────────────────────────────────────────────────

@test "check-file-sizes.sh handles trailing slash in SRC_DIR" {
  create_ts_file "$TEST_DIR/src/commands/big-cmd.ts" 150
  run env SRC_DIR="$TEST_DIR/src/" FILE_SIZE_ENFORCEMENT=warn bash "$SCRIPT"
  [[ $status -eq 0 ]]
  [[ "$output" == *"NFR5 violations"* ]]
  # Ensure no double-slash in output
  [[ "$output" != *"//"* ]]
}

# ── Summary counts ─────────────────────────────────────────────────────────

@test "check-file-sizes.sh shows violation counts in summary" {
  create_ts_file "$TEST_DIR/src/lib/big1.ts" 400
  create_ts_file "$TEST_DIR/src/lib/big2.ts" 500
  run env SRC_DIR="$TEST_DIR/src" FILE_SIZE_ENFORCEMENT=warn bash "$SCRIPT"
  [[ $status -eq 0 ]]
  [[ "$output" == *"2 source file(s) exceeding 300 lines"* ]]
}

# ── Combined violations ─────────────────────────────────────────────────────

@test "check-file-sizes.sh reports both NFR1 and NFR5 violations together" {
  create_ts_file "$TEST_DIR/src/lib/big-lib.ts" 400
  create_ts_file "$TEST_DIR/src/commands/big-cmd.ts" 150
  run env SRC_DIR="$TEST_DIR/src" FILE_SIZE_ENFORCEMENT=warn bash "$SCRIPT"
  [[ $status -eq 0 ]]
  [[ "$output" == *"NFR1 violations"* ]]
  [[ "$output" == *"NFR5 violations"* ]]
}

@test "check-file-sizes.sh shows NFR1 and NFR5 counts in fail summary" {
  create_ts_file "$TEST_DIR/src/lib/big-lib.ts" 400
  create_ts_file "$TEST_DIR/src/commands/big-cmd.ts" 150
  run env SRC_DIR="$TEST_DIR/src" FILE_SIZE_ENFORCEMENT=fail bash "$SCRIPT"
  [[ $status -eq 1 ]]
  [[ "$output" == *"NFR1: 1"* ]]
  [[ "$output" == *"NFR5: 1"* ]]
}
