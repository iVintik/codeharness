#!/usr/bin/env bash
# doc_gardener.sh — Documentation freshness scanner
# Finds: missing AGENTS.md, stale AGENTS.md, stale exec-plans.
# Used by the doc-gardener subagent and during retrospectives.
#
# Usage: ralph/doc_gardener.sh --project-dir DIR [--json]

set -e

PROJECT_DIR=""
JSON_OUTPUT=false
GENERATE_REPORT=false
COMPLEXITY_THRESHOLD=3  # Minimum source files to require AGENTS.md

show_help() {
    cat << 'HELPEOF'
Doc-Gardener Scanner — find stale and missing documentation

Usage:
    ralph/doc_gardener.sh --project-dir DIR [--json]

Checks:
    1. Modules with 3+ source files but no AGENTS.md
    2. AGENTS.md files older than corresponding source code changes
    3. Exec-plans in active/ for already-completed stories

Options:
    --project-dir DIR   Project root directory
    --json              Output findings as JSON (default: human-readable)
    --report            Generate quality-score.md and tech-debt-tracker.md
    --threshold N       Min source files to require AGENTS.md (default: 3)
    -h, --help          Show this help message
HELPEOF
}

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        --project-dir)
            PROJECT_DIR="$2"
            shift 2
            ;;
        --json)
            JSON_OUTPUT=true
            shift
            ;;
        --report)
            GENERATE_REPORT=true
            shift
            ;;
        --threshold)
            COMPLEXITY_THRESHOLD="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

if [[ -z "$PROJECT_DIR" ]]; then
    echo "Error: --project-dir is required" >&2
    exit 1
fi

if [[ ! -d "$PROJECT_DIR" ]]; then
    echo "Error: project directory not found: $PROJECT_DIR" >&2
    exit 1
fi

# ─── Findings collection ─────────────────────────────────────────────────

FINDINGS_JSON="[]"

add_finding() {
    local type="$1"
    local path="$2"
    local message="$3"

    FINDINGS_JSON=$(echo "$FINDINGS_JSON" | jq \
        --arg type "$type" \
        --arg path "$path" \
        --arg message "$message" \
        '. += [{"type": $type, "path": $path, "message": $message}]')
}

# ─── Check 1: Missing AGENTS.md for modules above complexity threshold ────

check_missing_agents_md() {
    # Find directories with source files but no AGENTS.md
    # Exclude hidden dirs, node_modules, _bmad, .ralph, docs, tests
    while IFS= read -r dir; do
        [[ -z "$dir" ]] && continue

        # Count source files (common extensions)
        local src_count
        src_count=$(find "$dir" -maxdepth 1 \( -name "*.js" -o -name "*.ts" -o -name "*.py" -o -name "*.sh" -o -name "*.go" -o -name "*.rs" -o -name "*.java" -o -name "*.rb" \) 2>/dev/null | wc -l | tr -d ' ')

        if [[ $src_count -ge $COMPLEXITY_THRESHOLD ]]; then
            if [[ ! -f "$dir/AGENTS.md" ]]; then
                local rel_path="${dir#$PROJECT_DIR/}"
                add_finding "missing_agents_md" "$rel_path" "Module $rel_path has $src_count source files but no AGENTS.md"
            fi
        fi
    done < <(find "$PROJECT_DIR" -type d \
        -not -path "$PROJECT_DIR/.*" \
        -not -path "*/node_modules/*" \
        -not -path "*/_bmad/*" \
        -not -path "*/.ralph/*" \
        -not -path "*/docs/*" \
        -not -path "*/tests/*" \
        -not -path "$PROJECT_DIR" \
        2>/dev/null)
}

# ─── Check 2: Stale AGENTS.md (code changed after docs) ──────────────────

check_stale_agents_md() {
    while IFS= read -r agents_file; do
        [[ -z "$agents_file" ]] && continue

        local dir
        dir=$(dirname "$agents_file")
        local rel_dir="${dir#$PROJECT_DIR/}"

        # Get AGENTS.md last commit time
        local agents_commit_time
        agents_commit_time=$(git -C "$PROJECT_DIR" log -1 --format="%ct" -- "$agents_file" 2>/dev/null || echo "0")

        # Get latest source file commit time in the same directory
        local latest_src_time="0"
        while IFS= read -r src_file; do
            [[ -z "$src_file" ]] && continue
            local src_time
            src_time=$(git -C "$PROJECT_DIR" log -1 --format="%ct" -- "$src_file" 2>/dev/null || echo "0")
            if [[ $src_time -gt $latest_src_time ]]; then
                latest_src_time=$src_time
            fi
        done < <(find "$dir" -maxdepth 1 \( -name "*.js" -o -name "*.ts" -o -name "*.py" -o -name "*.sh" -o -name "*.go" -o -name "*.rs" -o -name "*.java" -o -name "*.rb" \) -not -name "AGENTS.md" 2>/dev/null)

        if [[ $latest_src_time -gt $agents_commit_time && $agents_commit_time -gt 0 ]]; then
            add_finding "stale_agents_md" "$rel_dir" "AGENTS.md in $rel_dir is stale — source code changed after docs"
        fi
    done < <(find "$PROJECT_DIR" -name "AGENTS.md" \
        -not -path "*/node_modules/*" \
        -not -path "*/_bmad/*" \
        -not -path "*/.ralph/*" \
        2>/dev/null)
}

# ─── Check 3: Stale exec-plans (completed stories still in active/) ──────

check_stale_exec_plans() {
    local progress_file="$PROJECT_DIR/ralph/progress.json"
    local active_dir="$PROJECT_DIR/docs/exec-plans/active"

    if [[ ! -f "$progress_file" || ! -d "$active_dir" ]]; then
        return 0
    fi

    # Find active exec-plans for completed stories
    for plan_file in "$active_dir"/*.md; do
        [[ -f "$plan_file" ]] || continue

        local story_id
        story_id=$(basename "$plan_file" .md)

        local story_status
        story_status=$(jq -r --arg id "$story_id" '.tasks[] | select(.id == $id) | .status // ""' "$progress_file" 2>/dev/null)

        if [[ "$story_status" == "complete" ]]; then
            add_finding "stale_exec_plan" "docs/exec-plans/active/$story_id.md" \
                "Exec-plan for story $story_id is still in active/ but story is complete — should be in completed/"
        fi
    done
}

# ─── Quality scoring ──────────────────────────────────────────────────────

# Collect module info for quality grading
declare -A MODULE_GRADES

grade_modules() {
    while IFS= read -r dir; do
        [[ -z "$dir" ]] && continue

        local src_count
        src_count=$(find "$dir" -maxdepth 1 \( -name "*.js" -o -name "*.ts" -o -name "*.py" -o -name "*.sh" -o -name "*.go" -o -name "*.rs" -o -name "*.java" -o -name "*.rb" \) 2>/dev/null | wc -l | tr -d ' ')

        # Skip directories with no source files
        [[ $src_count -eq 0 ]] && continue

        local rel_path="${dir#$PROJECT_DIR/}"
        local has_agents="false"
        local is_stale="false"

        if [[ -f "$dir/AGENTS.md" ]]; then
            has_agents="true"

            # Check staleness
            local agents_time
            agents_time=$(git -C "$PROJECT_DIR" log -1 --format="%ct" -- "$dir/AGENTS.md" 2>/dev/null || echo "0")
            local latest_src="0"
            while IFS= read -r sf; do
                [[ -z "$sf" ]] && continue
                local st
                st=$(git -C "$PROJECT_DIR" log -1 --format="%ct" -- "$sf" 2>/dev/null || echo "0")
                [[ $st -gt $latest_src ]] && latest_src=$st
            done < <(find "$dir" -maxdepth 1 \( -name "*.js" -o -name "*.ts" -o -name "*.py" -o -name "*.sh" \) -not -name "AGENTS.md" 2>/dev/null)

            if [[ $latest_src -gt $agents_time && $agents_time -gt 0 ]]; then
                is_stale="true"
            fi
        fi

        # Grade: A = has fresh AGENTS.md, B = has stale AGENTS.md, F = missing
        local grade="F"
        if [[ "$has_agents" == "true" && "$is_stale" == "false" ]]; then
            grade="A"
        elif [[ "$has_agents" == "true" && "$is_stale" == "true" ]]; then
            grade="B"
        fi

        MODULE_GRADES["$rel_path"]="$grade"
    done < <(find "$PROJECT_DIR" -type d \
        -not -path "$PROJECT_DIR/.*" \
        -not -path "*/node_modules/*" \
        -not -path "*/_bmad/*" \
        -not -path "*/.ralph/*" \
        -not -path "*/docs/*" \
        -not -path "*/tests/*" \
        -not -path "$PROJECT_DIR" \
        2>/dev/null)
}

generate_quality_report() {
    local output_file="$PROJECT_DIR/docs/quality/quality-score.md"
    mkdir -p "$(dirname "$output_file")"

    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    {
        echo "<!-- DO NOT EDIT MANUALLY — generated by doc-gardener -->"
        echo ""
        echo "# Documentation Quality Score"
        echo ""
        echo "**Generated:** $timestamp"
        echo ""
        echo "## Module Grades"
        echo ""
        echo "| Module | Grade | Status |"
        echo "|--------|-------|--------|"

        # Sort and output grades
        for module in $(echo "${!MODULE_GRADES[@]}" | tr ' ' '\n' | sort); do
            local grade="${MODULE_GRADES[$module]}"
            local status_text
            case "$grade" in
                A) status_text="AGENTS.md present and current" ;;
                B) status_text="AGENTS.md present but stale" ;;
                F) status_text="AGENTS.md missing" ;;
            esac
            echo "| $module | $grade | $status_text |"
        done

        echo ""
        echo "## Grade Legend"
        echo ""
        echo "- **A**: Module has current AGENTS.md"
        echo "- **B**: Module has AGENTS.md but code changed since last update"
        echo "- **F**: Module has no AGENTS.md (3+ source files)"
    } > "$output_file"
}

generate_tech_debt_report() {
    local output_file="$PROJECT_DIR/docs/exec-plans/tech-debt-tracker.md"
    mkdir -p "$(dirname "$output_file")"

    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    {
        echo "<!-- DO NOT EDIT MANUALLY — generated by doc-gardener -->"
        echo ""
        echo "# Documentation Tech Debt"
        echo ""
        echo "**Generated:** $timestamp"
        echo ""

        local debt_count
        debt_count=$(echo "$FINDINGS_JSON" | jq '. | length')

        if [[ $debt_count -eq 0 ]]; then
            echo "No documentation debt items."
        else
            echo "| # | Type | Path | Issue |"
            echo "|---|------|------|-------|"

            local i=1
            echo "$FINDINGS_JSON" | jq -r '.[] | "\(.type)\t\(.path)\t\(.message)"' | while IFS=$'\t' read -r type path message; do
                echo "| $i | $type | $path | $message |"
                i=$((i + 1))
            done
        fi
    } > "$output_file"
}

# ─── Run all checks ──────────────────────────────────────────────────────

check_missing_agents_md
check_stale_agents_md
check_stale_exec_plans

# Generate reports if requested
if [[ "$GENERATE_REPORT" == "true" ]]; then
    grade_modules
    generate_quality_report
    generate_tech_debt_report
fi

# ─── Output ───────────────────────────────────────────────────────────────

finding_count=$(echo "$FINDINGS_JSON" | jq '. | length')

if [[ "$JSON_OUTPUT" == "true" ]]; then
    jq -n \
        --argjson findings "$FINDINGS_JSON" \
        --argjson count "$finding_count" \
        --arg scanned_at "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        '{
            scanned_at: $scanned_at,
            finding_count: $count,
            findings: $findings
        }'
else
    echo "Doc-Gardener Scan"
    echo ""

    if [[ $finding_count -eq 0 ]]; then
        echo "[OK] No documentation issues found"
    else
        echo "$FINDINGS_JSON" | jq -r '.[] | "  [WARN] \(.type): \(.message)"'
    fi

    echo ""
    echo "$finding_count finding(s) total"
fi
