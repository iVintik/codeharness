#!/usr/bin/env bats
# Tests for ralph/bridge.sh - BMAD→Ralph Task Bridge
# Story 6.2: Converts BMAD stories to Ralph execution tasks with verification requirements

load test_helper

BRIDGE_SH="$BATS_TEST_DIRNAME/../ralph/bridge.sh"

setup() {
    setup_test_dir
    mkdir -p "$TEST_DIR/_bmad-output/planning-artifacts"
    mkdir -p "$TEST_DIR/ralph"
}

teardown() {
    teardown_test_dir
}

# Helper: create a minimal BMAD epics file
create_test_epics() {
    cat > "$TEST_DIR/_bmad-output/planning-artifacts/epics.md" << 'EPICS'
# Test Project - Epic Breakdown

## Epic 1: User Authentication

Build the auth system.

### Story 1.1: Login Page

As a user,
I want to log in with email and password,
So that I can access my account.

**Acceptance Criteria:**

**Given** a registered user visits the login page
**When** they enter valid credentials
**Then** they are redirected to the dashboard
**And** a session token is stored

### Story 1.2: Registration

As a user,
I want to create an account,
So that I can start using the app.

**Acceptance Criteria:**

**Given** a visitor clicks "Sign Up"
**When** they fill in the registration form
**Then** an account is created
**And** a verification email is sent

## Epic 2: Dashboard

Build the main dashboard.

### Story 2.1: Dashboard Layout

As a user,
I want to see my dashboard,
So that I can view my data at a glance.

**Acceptance Criteria:**

**Given** a logged-in user navigates to /dashboard
**When** the page loads
**Then** widgets display current data
**And** the layout is responsive
EPICS
}

# Helper: create a sprint status file
create_test_sprint_status() {
    cat > "$TEST_DIR/_bmad-output/planning-artifacts/sprint-status.yaml" << 'STATUS'
generated: 2026-03-14
project: Test Project
tracking_system: file-system

development_status:
  epic-1: in-progress
  1-1-login-page: done
  1-2-registration: ready-for-dev
  epic-1-retrospective: optional
  epic-2: backlog
  2-1-dashboard-layout: backlog
STATUS
}

# ─── Script existence ──────────────────────────────────────────────────────

@test "bridge.sh exists" {
    [[ -f "$BRIDGE_SH" ]]
}

@test "bridge.sh is valid bash" {
    bash -n "$BRIDGE_SH"
}

# ─── Basic execution ──────────────────────────────────────────────────────

@test "bridge.sh --help exits 0" {
    run bash "$BRIDGE_SH" --help
    [[ $status -eq 0 ]]
    [[ "$output" == *"bridge"* ]]
}

@test "bridge.sh fails without epics file" {
    run bash "$BRIDGE_SH" --epics "$TEST_DIR/nonexistent.md" --output "$TEST_DIR/ralph/progress.json"
    [[ $status -ne 0 ]]
    [[ "$output" == *"not found"* ]]
}

# ─── Story parsing ────────────────────────────────────────────────────────

@test "bridge.sh parses stories from epics file" {
    create_test_epics
    run bash "$BRIDGE_SH" \
        --epics "$TEST_DIR/_bmad-output/planning-artifacts/epics.md" \
        --output "$TEST_DIR/ralph/progress.json"
    [[ $status -eq 0 ]]
    [[ -f "$TEST_DIR/ralph/progress.json" ]]
}

@test "bridge.sh generates valid JSON" {
    create_test_epics
    bash "$BRIDGE_SH" \
        --epics "$TEST_DIR/_bmad-output/planning-artifacts/epics.md" \
        --output "$TEST_DIR/ralph/progress.json"
    jq '.' "$TEST_DIR/ralph/progress.json" > /dev/null
}

@test "bridge.sh extracts correct number of tasks" {
    create_test_epics
    bash "$BRIDGE_SH" \
        --epics "$TEST_DIR/_bmad-output/planning-artifacts/epics.md" \
        --output "$TEST_DIR/ralph/progress.json"
    local count
    count=$(jq '.tasks | length' "$TEST_DIR/ralph/progress.json")
    [[ "$count" == "3" ]]
}

@test "bridge.sh includes story IDs" {
    create_test_epics
    bash "$BRIDGE_SH" \
        --epics "$TEST_DIR/_bmad-output/planning-artifacts/epics.md" \
        --output "$TEST_DIR/ralph/progress.json"
    local first_id
    first_id=$(jq -r '.tasks[0].id' "$TEST_DIR/ralph/progress.json")
    [[ "$first_id" == "1.1" ]]
}

@test "bridge.sh includes story titles" {
    create_test_epics
    bash "$BRIDGE_SH" \
        --epics "$TEST_DIR/_bmad-output/planning-artifacts/epics.md" \
        --output "$TEST_DIR/ralph/progress.json"
    local first_title
    first_title=$(jq -r '.tasks[0].title' "$TEST_DIR/ralph/progress.json")
    [[ "$first_title" == "Login Page" ]]
}

@test "bridge.sh includes epic info per task" {
    create_test_epics
    bash "$BRIDGE_SH" \
        --epics "$TEST_DIR/_bmad-output/planning-artifacts/epics.md" \
        --output "$TEST_DIR/ralph/progress.json"
    local epic
    epic=$(jq -r '.tasks[0].epic' "$TEST_DIR/ralph/progress.json")
    [[ "$epic" == "Epic 1: User Authentication" ]]
}

@test "bridge.sh includes acceptance criteria" {
    create_test_epics
    bash "$BRIDGE_SH" \
        --epics "$TEST_DIR/_bmad-output/planning-artifacts/epics.md" \
        --output "$TEST_DIR/ralph/progress.json"
    local ac_count
    ac_count=$(jq '.tasks[0].acceptance_criteria | length' "$TEST_DIR/ralph/progress.json")
    [[ $ac_count -gt 0 ]]
}

@test "bridge.sh includes user story description" {
    create_test_epics
    bash "$BRIDGE_SH" \
        --epics "$TEST_DIR/_bmad-output/planning-artifacts/epics.md" \
        --output "$TEST_DIR/ralph/progress.json"
    local desc
    desc=$(jq -r '.tasks[0].description' "$TEST_DIR/ralph/progress.json")
    [[ "$desc" == *"log in"* ]]
}

# ─── Task ordering ────────────────────────────────────────────────────────

@test "bridge.sh orders tasks by story sequence" {
    create_test_epics
    bash "$BRIDGE_SH" \
        --epics "$TEST_DIR/_bmad-output/planning-artifacts/epics.md" \
        --output "$TEST_DIR/ralph/progress.json"
    local ids
    ids=$(jq -r '.tasks[].id' "$TEST_DIR/ralph/progress.json" | tr '\n' ',')
    [[ "$ids" == "1.1,1.2,2.1," ]]
}

# ─── Verification requirements ─────────────────────────────────────────────

@test "bridge.sh adds verification requirements per task" {
    create_test_epics
    bash "$BRIDGE_SH" \
        --epics "$TEST_DIR/_bmad-output/planning-artifacts/epics.md" \
        --output "$TEST_DIR/ralph/progress.json"
    local has_verification
    has_verification=$(jq '.tasks[0] | has("verification")' "$TEST_DIR/ralph/progress.json")
    [[ "$has_verification" == "true" ]]
}

@test "bridge.sh includes Showboat proof expectations" {
    create_test_epics
    bash "$BRIDGE_SH" \
        --epics "$TEST_DIR/_bmad-output/planning-artifacts/epics.md" \
        --output "$TEST_DIR/ralph/progress.json"
    local proof_path
    proof_path=$(jq -r '.tasks[0].verification.proof_path' "$TEST_DIR/ralph/progress.json")
    [[ "$proof_path" == *"1.1"* ]]
    [[ "$proof_path" == *"proof"* ]]
}

@test "bridge.sh includes observability setup requirements" {
    create_test_epics
    bash "$BRIDGE_SH" \
        --epics "$TEST_DIR/_bmad-output/planning-artifacts/epics.md" \
        --output "$TEST_DIR/ralph/progress.json"
    local has_observability
    has_observability=$(jq '.tasks[0].verification | has("observability")' "$TEST_DIR/ralph/progress.json")
    [[ "$has_observability" == "true" ]]
}

# ─── Default status ───────────────────────────────────────────────────────

@test "bridge.sh sets all tasks to pending by default" {
    create_test_epics
    bash "$BRIDGE_SH" \
        --epics "$TEST_DIR/_bmad-output/planning-artifacts/epics.md" \
        --output "$TEST_DIR/ralph/progress.json"
    local pending_count
    pending_count=$(jq '[.tasks[] | select(.status == "pending")] | length' "$TEST_DIR/ralph/progress.json")
    local total
    total=$(jq '.tasks | length' "$TEST_DIR/ralph/progress.json")
    [[ "$pending_count" == "$total" ]]
}

# ─── Sprint status integration ────────────────────────────────────────────

@test "bridge.sh maps sprint status when provided" {
    create_test_epics
    create_test_sprint_status
    bash "$BRIDGE_SH" \
        --epics "$TEST_DIR/_bmad-output/planning-artifacts/epics.md" \
        --sprint-status "$TEST_DIR/_bmad-output/planning-artifacts/sprint-status.yaml" \
        --output "$TEST_DIR/ralph/progress.json"
    # Story 1.1 is "done" in sprint status -> "complete"
    local status_1_1
    status_1_1=$(jq -r '.tasks[] | select(.id == "1.1") | .status' "$TEST_DIR/ralph/progress.json")
    [[ "$status_1_1" == "complete" ]]
}

@test "bridge.sh maps ready-for-dev to pending" {
    create_test_epics
    create_test_sprint_status
    bash "$BRIDGE_SH" \
        --epics "$TEST_DIR/_bmad-output/planning-artifacts/epics.md" \
        --sprint-status "$TEST_DIR/_bmad-output/planning-artifacts/sprint-status.yaml" \
        --output "$TEST_DIR/ralph/progress.json"
    local status_1_2
    status_1_2=$(jq -r '.tasks[] | select(.id == "1.2") | .status' "$TEST_DIR/ralph/progress.json")
    [[ "$status_1_2" == "pending" ]]
}

# ─── Progress metadata ────────────────────────────────────────────────────

@test "bridge.sh includes metadata in output" {
    create_test_epics
    bash "$BRIDGE_SH" \
        --epics "$TEST_DIR/_bmad-output/planning-artifacts/epics.md" \
        --output "$TEST_DIR/ralph/progress.json"
    local has_generated
    has_generated=$(jq 'has("generated_at")' "$TEST_DIR/ralph/progress.json")
    [[ "$has_generated" == "true" ]]
}

@test "bridge.sh includes source file path in metadata" {
    create_test_epics
    bash "$BRIDGE_SH" \
        --epics "$TEST_DIR/_bmad-output/planning-artifacts/epics.md" \
        --output "$TEST_DIR/ralph/progress.json"
    local source
    source=$(jq -r '.source' "$TEST_DIR/ralph/progress.json")
    [[ "$source" == *"epics.md"* ]]
}

# ─── Idempotency ──────────────────────────────────────────────────────────

@test "bridge.sh is idempotent - running twice produces same structure" {
    create_test_epics
    bash "$BRIDGE_SH" \
        --epics "$TEST_DIR/_bmad-output/planning-artifacts/epics.md" \
        --output "$TEST_DIR/ralph/progress.json"
    local first_count
    first_count=$(jq '.tasks | length' "$TEST_DIR/ralph/progress.json")

    bash "$BRIDGE_SH" \
        --epics "$TEST_DIR/_bmad-output/planning-artifacts/epics.md" \
        --output "$TEST_DIR/ralph/progress.json"
    local second_count
    second_count=$(jq '.tasks | length' "$TEST_DIR/ralph/progress.json")
    [[ "$first_count" == "$second_count" ]]
}

# ─── Standalone mode ──────────────────────────────────────────────────────

@test "bridge.sh supports standalone task list input" {
    # Markdown checklist format
    cat > "$TEST_DIR/tasks.md" << 'TASKS'
- [ ] Set up database schema
- [ ] Implement REST API endpoints
- [x] Configure CI/CD pipeline
TASKS
    run bash "$BRIDGE_SH" \
        --tasks "$TEST_DIR/tasks.md" \
        --output "$TEST_DIR/ralph/progress.json"
    [[ $status -eq 0 ]]
    [[ -f "$TEST_DIR/ralph/progress.json" ]]

    local count
    count=$(jq '.tasks | length' "$TEST_DIR/ralph/progress.json")
    [[ "$count" == "3" ]]
}

@test "bridge.sh standalone marks completed tasks" {
    cat > "$TEST_DIR/tasks.md" << 'TASKS'
- [ ] Task one
- [x] Task two done
TASKS
    bash "$BRIDGE_SH" \
        --tasks "$TEST_DIR/tasks.md" \
        --output "$TEST_DIR/ralph/progress.json"

    local done_count
    done_count=$(jq '[.tasks[] | select(.status == "complete")] | length' "$TEST_DIR/ralph/progress.json")
    [[ "$done_count" == "1" ]]
}
