#!/usr/bin/env bash
# Test helper for codeharness bats tests
# Sets up isolated test environment per test

# Portable in-place sed (macOS uses -i '', Linux uses -i)
sed_i() {
    if sed --version 2>/dev/null | grep -q GNU; then
        sed -i "$@"
    else
        sed -i '' "$@"
    fi
}

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RALPH_DIR="$PROJECT_ROOT/ralph"

# Create a temporary directory for each test
setup_test_dir() {
    TEST_DIR="$(mktemp -d)"
    export TEST_DIR
    cd "$TEST_DIR"

    # Initialize a git repo for tests that need it
    git init -q
    git config user.email "test@test.com"
    git config user.name "Test"
    echo "init" > init.txt
    git add -A && git commit -q -m "init"
}

teardown_test_dir() {
    if [[ -n "$TEST_DIR" && -d "$TEST_DIR" ]]; then
        rm -rf "$TEST_DIR"
    fi
}

# Create a minimal progress.json for testing
create_test_progress() {
    local file="${1:-$TEST_DIR/ralph/progress.json}"
    mkdir -p "$(dirname "$file")"
    cat > "$file" << 'EOF'
{
    "tasks": [
        {"id": "US-001", "title": "First story", "status": "pending"},
        {"id": "US-002", "title": "Second story", "status": "pending"}
    ]
}
EOF
}

# Create a minimal prompt file for testing
create_test_prompt() {
    local file="${1:-$TEST_DIR/.ralph/PROMPT.md}"
    mkdir -p "$(dirname "$file")"
    cat > "$file" << 'EOF'
# Test Prompt
Implement the next incomplete story.
EOF
}

# Create .claude directory with state file
create_test_state() {
    mkdir -p "$TEST_DIR/.claude"
    cat > "$TEST_DIR/.claude/codeharness.local.md" << 'EOF'
---
harness_version: "0.1.0"
initialized: true
---
EOF
}
