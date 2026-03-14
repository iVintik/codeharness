#!/usr/bin/env bats
# Tests for Story 7.6: DB Schema Generation
# Validates docs/generated/db-schema.md generation

load test_helper

DB_SCHEMA_SH="$BATS_TEST_DIRNAME/../ralph/db_schema_gen.sh"

setup() {
    setup_test_dir
    mkdir -p "$TEST_DIR/docs/generated" "$TEST_DIR/.claude"

    # Create state file with database enforcement enabled
    cat > "$TEST_DIR/.claude/codeharness.local.md" << 'EOF'
---
harness_version: "0.1.0"
initialized: true
enforcement:
  database: true
---
EOF

    # Create a mock schema file (simulates DB MCP query output)
    cat > "$TEST_DIR/.claude/db-schema-raw.json" << 'SCHEMA'
{
    "tables": [
        {
            "name": "users",
            "columns": [
                {"name": "id", "type": "INTEGER", "primary_key": true},
                {"name": "email", "type": "VARCHAR(255)", "nullable": false},
                {"name": "created_at", "type": "TIMESTAMP", "nullable": false}
            ]
        },
        {
            "name": "orders",
            "columns": [
                {"name": "id", "type": "INTEGER", "primary_key": true},
                {"name": "user_id", "type": "INTEGER", "nullable": false, "references": "users.id"},
                {"name": "total", "type": "DECIMAL(10,2)", "nullable": false}
            ]
        }
    ]
}
SCHEMA
}

teardown() {
    teardown_test_dir
}

# ─── Script basics ─────────────────────────────────────────────────────────

@test "db_schema_gen.sh exists" {
    [[ -f "$DB_SCHEMA_SH" ]]
}

@test "db_schema_gen.sh is valid bash" {
    bash -n "$DB_SCHEMA_SH"
}

@test "db_schema_gen.sh --help exits 0" {
    run bash "$DB_SCHEMA_SH" --help
    [[ $status -eq 0 ]]
}

# ─── Schema generation from JSON ──────────────────────────────────────────

@test "generates db-schema.md from schema JSON" {
    bash "$DB_SCHEMA_SH" \
        --project-dir "$TEST_DIR" \
        --schema-file "$TEST_DIR/.claude/db-schema-raw.json"
    [[ -f "$TEST_DIR/docs/generated/db-schema.md" ]]
}

@test "db-schema.md has DO NOT EDIT MANUALLY header (NFR27)" {
    bash "$DB_SCHEMA_SH" \
        --project-dir "$TEST_DIR" \
        --schema-file "$TEST_DIR/.claude/db-schema-raw.json"
    head -5 "$TEST_DIR/docs/generated/db-schema.md" | grep -qi "DO NOT EDIT MANUALLY"
}

@test "db-schema.md contains table names" {
    bash "$DB_SCHEMA_SH" \
        --project-dir "$TEST_DIR" \
        --schema-file "$TEST_DIR/.claude/db-schema-raw.json"
    grep -q "users" "$TEST_DIR/docs/generated/db-schema.md"
    grep -q "orders" "$TEST_DIR/docs/generated/db-schema.md"
}

@test "db-schema.md contains column names and types" {
    bash "$DB_SCHEMA_SH" \
        --project-dir "$TEST_DIR" \
        --schema-file "$TEST_DIR/.claude/db-schema-raw.json"
    grep -q "email" "$TEST_DIR/docs/generated/db-schema.md"
    grep -q "VARCHAR" "$TEST_DIR/docs/generated/db-schema.md"
}

@test "db-schema.md contains relationships" {
    bash "$DB_SCHEMA_SH" \
        --project-dir "$TEST_DIR" \
        --schema-file "$TEST_DIR/.claude/db-schema-raw.json"
    grep -q "users.id" "$TEST_DIR/docs/generated/db-schema.md"
}

@test "db-schema.md is refreshable (regenerated on re-run)" {
    bash "$DB_SCHEMA_SH" \
        --project-dir "$TEST_DIR" \
        --schema-file "$TEST_DIR/.claude/db-schema-raw.json"
    local first
    first=$(cat "$TEST_DIR/docs/generated/db-schema.md")

    bash "$DB_SCHEMA_SH" \
        --project-dir "$TEST_DIR" \
        --schema-file "$TEST_DIR/.claude/db-schema-raw.json"
    local second
    second=$(cat "$TEST_DIR/docs/generated/db-schema.md")

    # Content structure should be the same (timestamps may differ)
    grep -q "users" <<< "$second"
    grep -q "orders" <<< "$second"
}

# ─── Error handling ────────────────────────────────────────────────────────

@test "fails when schema file not found" {
    run bash "$DB_SCHEMA_SH" \
        --project-dir "$TEST_DIR" \
        --schema-file "$TEST_DIR/nonexistent.json"
    [[ $status -ne 0 ]]
}

@test "fails without --project-dir" {
    run bash "$DB_SCHEMA_SH" \
        --schema-file "$TEST_DIR/.claude/db-schema-raw.json"
    [[ $status -ne 0 ]]
}
