#!/usr/bin/env bats
# Tests for Story 7.1: Per-Subsystem AGENTS.md Generation
# Validates AGENTS.md format compliance and coverage

PROJECT_ROOT="$BATS_TEST_DIRNAME/.."

# ─── Knowledge file exists ─────────────────────────────────────────────────

@test "knowledge/documentation-patterns.md exists" {
    [[ -f "$PROJECT_ROOT/knowledge/documentation-patterns.md" ]]
}

@test "documentation-patterns.md describes AGENTS.md format" {
    grep -q "AGENTS.md" "$PROJECT_ROOT/knowledge/documentation-patterns.md"
    grep -q "Max 100 lines" "$PROJECT_ROOT/knowledge/documentation-patterns.md"
}

@test "documentation-patterns.md includes example" {
    grep -q "Example" "$PROJECT_ROOT/knowledge/documentation-patterns.md"
}

# ─── AGENTS.md exists for key subsystems ───────────────────────────────────

@test "ralph/AGENTS.md exists" {
    [[ -f "$PROJECT_ROOT/ralph/AGENTS.md" ]]
}

@test "hooks/AGENTS.txt exists" {
    [[ -f "$PROJECT_ROOT/hooks/AGENTS.txt" ]]
}

@test "commands/AGENTS.txt exists" {
    [[ -f "$PROJECT_ROOT/commands/AGENTS.txt" ]]
}

@test "knowledge/AGENTS.txt exists" {
    [[ -f "$PROJECT_ROOT/knowledge/AGENTS.txt" ]]
}

@test "templates/AGENTS.md exists" {
    [[ -f "$PROJECT_ROOT/templates/AGENTS.md" ]]
}

# ─── AGENTS.md format compliance (NFR24: max 100 lines) ───────────────────

@test "ralph/AGENTS.md does not exceed 100 lines" {
    local lines
    lines=$(wc -l < "$PROJECT_ROOT/ralph/AGENTS.md")
    [[ $lines -le 100 ]]
}

@test "hooks/AGENTS.txt does not exceed 100 lines" {
    local lines
    lines=$(wc -l < "$PROJECT_ROOT/hooks/AGENTS.txt")
    [[ $lines -le 100 ]]
}

@test "commands/AGENTS.txt does not exceed 100 lines" {
    local lines
    lines=$(wc -l < "$PROJECT_ROOT/commands/AGENTS.txt")
    [[ $lines -le 100 ]]
}

@test "knowledge/AGENTS.txt does not exceed 100 lines" {
    local lines
    lines=$(wc -l < "$PROJECT_ROOT/knowledge/AGENTS.txt")
    [[ $lines -le 100 ]]
}

@test "templates/AGENTS.md does not exceed 100 lines" {
    local lines
    lines=$(wc -l < "$PROJECT_ROOT/templates/AGENTS.md")
    [[ $lines -le 100 ]]
}

# ─── AGENTS.md content requirements ───────────────────────────────────────

@test "ralph/AGENTS.md has Key Files section" {
    grep -q "Key Files" "$PROJECT_ROOT/ralph/AGENTS.md"
}

@test "ralph/AGENTS.md has Dependencies section" {
    grep -q "Dependencies" "$PROJECT_ROOT/ralph/AGENTS.md"
}

@test "ralph/AGENTS.md has Conventions section" {
    grep -q "Conventions" "$PROJECT_ROOT/ralph/AGENTS.md"
}

@test "ralph/AGENTS.md has Testing section" {
    grep -q "Testing" "$PROJECT_ROOT/ralph/AGENTS.md"
}

@test "hooks/AGENTS.txt has Key Files section" {
    grep -q "Key Files" "$PROJECT_ROOT/hooks/AGENTS.txt"
}

@test "hooks/AGENTS.txt has Conventions section" {
    grep -q "Conventions" "$PROJECT_ROOT/hooks/AGENTS.txt"
}

# ─── AGENTS.md references actual files ────────────────────────────────────

@test "ralph/AGENTS.md references ralph.sh" {
    grep -q "ralph.sh" "$PROJECT_ROOT/ralph/AGENTS.md"
}

@test "ralph/AGENTS.md references bridge.sh" {
    grep -q "bridge.sh" "$PROJECT_ROOT/ralph/AGENTS.md"
}

@test "ralph/AGENTS.md references verify_gates.sh" {
    grep -q "verify_gates.sh" "$PROJECT_ROOT/ralph/AGENTS.md"
}

@test "hooks/AGENTS.txt references hooks.json" {
    grep -q "hooks.json" "$PROJECT_ROOT/hooks/AGENTS.txt"
}
