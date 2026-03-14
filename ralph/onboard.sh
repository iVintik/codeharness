#!/usr/bin/env bash
# onboard.sh — Brownfield Onboarding Scanner
# Scans existing projects for harness compliance gaps and generates onboarding plans.
#
# Usage:
#   ralph/onboard.sh scan --project-dir DIR [--json]
#   ralph/onboard.sh coverage --project-dir DIR
#   ralph/onboard.sh audit --project-dir DIR
#   ralph/onboard.sh epic --project-dir DIR --output PATH

set -e

ACTION=""
PROJECT_DIR=""
JSON_OUTPUT=false
OUTPUT_FILE=""

show_help() {
    cat << 'HELPEOF'
Brownfield Onboarding — scan project and generate compliance plan

Commands:
    scan        Scan project structure, modules, dependencies, docs
    coverage    Analyze test coverage gaps per module
    audit       Audit documentation quality and freshness
    epic        Generate onboarding epic with stories

Options:
    --project-dir DIR   Project root directory
    --json              JSON output (scan command)
    --output PATH       Output file (epic command)
    -h, --help          Show this help message
HELPEOF
}

if [[ $# -gt 0 && "$1" != -* ]]; then
    ACTION="$1"
    shift
fi

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)  show_help; exit 0 ;;
        --project-dir) PROJECT_DIR="$2"; shift 2 ;;
        --json) JSON_OUTPUT=true; shift ;;
        --output) OUTPUT_FILE="$2"; shift 2 ;;
        *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
done

if [[ -z "$PROJECT_DIR" ]]; then
    echo "Error: --project-dir is required" >&2
    exit 1
fi

SRC_EXTENSIONS="-name *.js -o -name *.ts -o -name *.py -o -name *.sh -o -name *.go -o -name *.rs -o -name *.java -o -name *.rb"

# ─── Helpers ──────────────────────────────────────────────────────────────

find_modules() {
    find "$PROJECT_DIR" -type d \
        -not -path "$PROJECT_DIR/.*" \
        -not -path "*/node_modules/*" \
        -not -path "*/_bmad/*" \
        -not -path "*/.ralph/*" \
        -not -path "*/docs/*" \
        -not -path "*/tests/*" \
        -not -path "*/test/*" \
        -not -path "$PROJECT_DIR" \
        2>/dev/null
}

count_src_files() {
    local dir="$1"
    find "$dir" -maxdepth 1 \( -name "*.js" -o -name "*.ts" -o -name "*.py" -o -name "*.sh" -o -name "*.go" -o -name "*.rs" -o -name "*.java" -o -name "*.rb" \) 2>/dev/null | wc -l | tr -d ' '
}

# ─── Scan ─────────────────────────────────────────────────────────────────

do_scan() {
    local modules_json="[]"

    while IFS= read -r dir; do
        [[ -z "$dir" ]] && continue
        local src_count
        src_count=$(count_src_files "$dir")
        [[ $src_count -eq 0 ]] && continue

        local rel="${dir#$PROJECT_DIR/}"
        local has_agents="false"
        [[ -f "$dir/AGENTS.md" ]] && has_agents="true"

        modules_json=$(echo "$modules_json" | jq \
            --arg path "$rel" \
            --argjson src_count "$src_count" \
            --arg has_agents "$has_agents" \
            '. += [{"path": $path, "src_files": $src_count, "has_agents_md": ($has_agents == "true")}]')
    done < <(find_modules)

    # Check key docs
    local has_readme="false"
    local has_architecture="false"
    [[ -f "$PROJECT_DIR/README.md" ]] && has_readme="true"
    [[ -f "$PROJECT_DIR/ARCHITECTURE.md" ]] && has_architecture="true"

    # Count test files
    local test_count
    test_count=$(find "$PROJECT_DIR" \( -name "*.test.*" -o -name "*.spec.*" -o -name "test_*" -o -name "*_test.*" \) \
        -not -path "*/node_modules/*" 2>/dev/null | wc -l | tr -d ' ')

    local total_src
    total_src=$(find "$PROJECT_DIR" \( -name "*.js" -o -name "*.ts" -o -name "*.py" -o -name "*.sh" -o -name "*.go" \) \
        -not -path "*/node_modules/*" -not -path "*/.ralph/*" -not -path "*/_bmad/*" \
        -not -path "*/tests/*" -not -path "*/test/*" 2>/dev/null | wc -l | tr -d ' ')

    if [[ "$JSON_OUTPUT" == "true" ]]; then
        jq -n \
            --argjson modules "$modules_json" \
            --arg has_readme "$has_readme" \
            --arg has_architecture "$has_architecture" \
            --argjson test_files "$test_count" \
            --argjson total_src "$total_src" \
            '{
                modules: $modules,
                has_readme: ($has_readme == "true"),
                has_architecture: ($has_architecture == "true"),
                test_files: $test_files,
                total_source_files: $total_src
            }'
    else
        local module_count
        module_count=$(echo "$modules_json" | jq '. | length')
        local missing_agents
        missing_agents=$(echo "$modules_json" | jq '[.[] | select(.has_agents_md == false)] | length')

        echo "Codebase Scan"
        echo ""
        echo "  Source files: $total_src"
        echo "  Test files: $test_count"
        echo "  Modules: $module_count"
        echo ""
        echo "  Documentation:"
        echo "    README.md: $(if [[ "$has_readme" == "true" ]]; then echo "present"; else echo "MISSING"; fi)"
        echo "    ARCHITECTURE.md: $(if [[ "$has_architecture" == "true" ]]; then echo "present"; else echo "MISSING"; fi)"
        echo "    AGENTS.md coverage: $((module_count - missing_agents))/$module_count modules"
        echo ""
        echo "  Modules:"
        echo "$modules_json" | jq -r '.[] | "    \(.path): \(.src_files) files \(if .has_agents_md then "" else "(no AGENTS.md)" end)"'
    fi
}

# ─── Coverage ─────────────────────────────────────────────────────────────

do_coverage() {
    echo "Coverage Gap Analysis"
    echo ""

    local total_src=0
    local tested_modules=0
    local untested_modules=0

    while IFS= read -r dir; do
        [[ -z "$dir" ]] && continue
        local src_count
        src_count=$(count_src_files "$dir")
        [[ $src_count -eq 0 ]] && continue

        local rel="${dir#$PROJECT_DIR/}"
        total_src=$((total_src + src_count))

        # Check if tests exist for this module
        local module_name
        module_name=$(basename "$dir")
        local has_tests="false"

        # Look for test files matching module name
        if find "$PROJECT_DIR" \( -name "*${module_name}*test*" -o -name "*${module_name}*spec*" -o -name "test_${module_name}*" \) \
            -not -path "*/node_modules/*" 2>/dev/null | grep -q .; then
            has_tests="true"
            tested_modules=$((tested_modules + 1))
        else
            untested_modules=$((untested_modules + 1))
        fi

        if [[ "$has_tests" == "false" ]]; then
            echo "  [WARN] $rel: $src_count files, no tests found"
        else
            echo "  [OK] $rel: $src_count files, tests exist"
        fi
    done < <(find_modules)

    echo ""
    local total_modules=$((tested_modules + untested_modules))
    if [[ $total_modules -gt 0 ]]; then
        echo "  Coverage: $tested_modules/$total_modules modules have tests"
    fi
    echo "  → Target: 100% module coverage"
}

# ─── Audit ────────────────────────────────────────────────────────────────

do_audit() {
    echo "Documentation Audit"
    echo ""

    # README
    if [[ -f "$PROJECT_DIR/README.md" ]]; then
        echo "  [OK] README.md exists"
    else
        echo "  [WARN] README.md missing"
    fi

    # ARCHITECTURE.md
    if [[ -f "$PROJECT_DIR/ARCHITECTURE.md" ]]; then
        echo "  [OK] ARCHITECTURE.md exists"
    else
        echo "  [WARN] ARCHITECTURE.md missing"
    fi

    # AGENTS.md per module
    local total_modules=0
    local with_agents=0

    while IFS= read -r dir; do
        [[ -z "$dir" ]] && continue
        local src_count
        src_count=$(count_src_files "$dir")
        [[ $src_count -lt 3 ]] && continue

        total_modules=$((total_modules + 1))
        local rel="${dir#$PROJECT_DIR/}"

        if [[ -f "$dir/AGENTS.md" ]]; then
            with_agents=$((with_agents + 1))
            echo "  [OK] $rel/AGENTS.md"
        else
            echo "  [WARN] $rel: missing AGENTS.md ($src_count files)"
        fi
    done < <(find_modules)

    echo ""
    echo "  AGENTS.md: $with_agents/$total_modules modules"
}

# ─── Epic ─────────────────────────────────────────────────────────────────

do_epic() {
    if [[ -z "$OUTPUT_FILE" ]]; then
        echo "Error: --output is required for epic command" >&2
        exit 1
    fi

    mkdir -p "$(dirname "$OUTPUT_FILE")"

    local story_num=0

    {
        echo "# Onboarding Epic: Bring Project to Harness Compliance"
        echo ""
        echo "Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
        echo ""

        # ARCHITECTURE.md story
        if [[ ! -f "$PROJECT_DIR/ARCHITECTURE.md" ]]; then
            story_num=$((story_num + 1))
            echo "### Story O.${story_num}: Create ARCHITECTURE.md"
            echo ""
            echo "As a developer, I want an ARCHITECTURE.md documenting the project's architecture."
            echo ""
            echo "**Given** no ARCHITECTURE.md exists"
            echo "**When** the agent analyzes the codebase"
            echo "**Then** ARCHITECTURE.md is created with module overview and dependencies"
            echo ""
        fi

        # AGENTS.md stories per module
        while IFS= read -r dir; do
            [[ -z "$dir" ]] && continue
            local src_count
            src_count=$(count_src_files "$dir")
            [[ $src_count -lt 3 ]] && continue

            local rel="${dir#$PROJECT_DIR/}"
            if [[ ! -f "$dir/AGENTS.md" ]]; then
                story_num=$((story_num + 1))
                echo "### Story O.${story_num}: Create $rel/AGENTS.md"
                echo ""
                echo "As an agent, I want AGENTS.md for $rel so I have local context."
                echo ""
                echo "**Given** $rel has $src_count source files and no AGENTS.md"
                echo "**When** the agent reads the module"
                echo "**Then** $rel/AGENTS.md is created with module purpose and key files"
                echo ""
            fi
        done < <(find_modules)

        # Test coverage stories per untested module
        while IFS= read -r dir; do
            [[ -z "$dir" ]] && continue
            local src_count
            src_count=$(count_src_files "$dir")
            [[ $src_count -eq 0 ]] && continue

            local rel="${dir#$PROJECT_DIR/}"
            local module_name
            module_name=$(basename "$dir")

            if ! find "$PROJECT_DIR" \( -name "*${module_name}*test*" -o -name "*${module_name}*spec*" \) \
                -not -path "*/node_modules/*" 2>/dev/null | grep -q .; then
                story_num=$((story_num + 1))
                echo "### Story O.${story_num}: Add test coverage for $rel"
                echo ""
                echo "As a developer, I want tests for $rel to ensure correctness."
                echo ""
                echo "**Given** $rel has $src_count source files with no tests"
                echo "**When** the agent writes tests"
                echo "**Then** $rel has 100% test coverage"
                echo ""
            fi
        done < <(find_modules)

        echo "---"
        echo ""
        echo "**Total stories:** $story_num"
        echo ""
        echo "Review and approve before execution."

    } > "$OUTPUT_FILE"

    echo "[OK] Onboarding epic: $story_num stories → $OUTPUT_FILE"
}

# ─── Main ─────────────────────────────────────────────────────────────────

case "$ACTION" in
    scan)     do_scan ;;
    coverage) do_coverage ;;
    audit)    do_audit ;;
    epic)     do_epic ;;
    "")       echo "Error: specify command: scan, coverage, audit, epic" >&2; show_help; exit 1 ;;
    *)        echo "Unknown command: $ACTION" >&2; exit 1 ;;
esac
