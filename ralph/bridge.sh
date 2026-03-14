#!/usr/bin/env bash
# bridge.sh — BMAD→Ralph Task Bridge
# Converts BMAD epics/stories to Ralph execution tasks with verification requirements.
# Produces ralph/progress.json consumed by ralph.sh loop.
#
# Usage:
#   ralph/bridge.sh --epics PATH --output PATH [--sprint-status PATH]
#   ralph/bridge.sh --tasks PATH --output PATH   (standalone mode)

set -e

# ─── CLI Arguments ────────────────────────────────────────────────────────

EPICS_FILE=""
SPRINT_STATUS_FILE=""
TASKS_FILE=""
OUTPUT_FILE=""

show_help() {
    cat << 'HELPEOF'
BMAD→Ralph Task Bridge — converts stories to execution tasks

Usage:
    ralph/bridge.sh --epics PATH --output PATH [OPTIONS]
    ralph/bridge.sh --tasks PATH --output PATH   (standalone mode)

BMAD Mode:
    --epics PATH            Path to BMAD epics.md file
    --sprint-status PATH    Path to sprint-status.yaml (optional, maps story states)
    --output PATH           Output path for progress.json

Standalone Mode:
    --tasks PATH            Path to markdown checklist or plain text task list
    --output PATH           Output path for progress.json

Options:
    -h, --help              Show this help message

The bridge parses BMAD stories and produces ralph/progress.json with:
  - Story ID, title, epic, description, acceptance criteria
  - Verification requirements (proof path, observability)
  - Task status mapped from sprint status (or default: pending)
HELPEOF
}

# ─── Parse Arguments ──────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        --epics)
            EPICS_FILE="$2"
            shift 2
            ;;
        --sprint-status)
            SPRINT_STATUS_FILE="$2"
            shift 2
            ;;
        --tasks)
            TASKS_FILE="$2"
            shift 2
            ;;
        --output)
            OUTPUT_FILE="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1" >&2
            show_help
            exit 1
            ;;
    esac
done

# ─── Validation ───────────────────────────────────────────────────────────

if [[ -z "$OUTPUT_FILE" ]]; then
    echo "Error: --output is required" >&2
    exit 1
fi

if [[ -z "$EPICS_FILE" && -z "$TASKS_FILE" ]]; then
    echo "Error: either --epics or --tasks is required" >&2
    exit 1
fi

if [[ -n "$EPICS_FILE" && ! -f "$EPICS_FILE" ]]; then
    echo "Error: epics file not found: $EPICS_FILE" >&2
    exit 1
fi

if [[ -n "$TASKS_FILE" && ! -f "$TASKS_FILE" ]]; then
    echo "Error: tasks file not found: $TASKS_FILE" >&2
    exit 1
fi

# ─── Sprint Status Parsing ────────────────────────────────────────────────

# Parse sprint status YAML into an associative array
# Maps story slug (e.g., "1-1-login-page") to status
declare -A SPRINT_STATUSES

parse_sprint_status() {
    local file="$1"
    if [[ ! -f "$file" ]]; then
        return
    fi

    local in_dev_status=false
    while IFS= read -r line; do
        # Detect development_status section
        if [[ "$line" =~ ^development_status: ]]; then
            in_dev_status=true
            continue
        fi

        # Exit section on non-indented line
        if [[ "$in_dev_status" == "true" && -n "$line" && ! "$line" =~ ^[[:space:]] ]]; then
            in_dev_status=false
            continue
        fi

        if [[ "$in_dev_status" == "true" ]]; then
            # Parse "  key: value" lines
            local key value
            key=$(echo "$line" | sed 's/^[[:space:]]*//' | cut -d: -f1 | sed 's/[[:space:]]*$//')
            value=$(echo "$line" | cut -d: -f2- | sed 's/^[[:space:]]*//')

            if [[ -n "$key" && -n "$value" ]]; then
                # Extract story number from slug: "1-1-login-page" -> "1.1"
                if [[ "$key" =~ ^([0-9]+)-([0-9]+) ]]; then
                    local story_id="${BASH_REMATCH[1]}.${BASH_REMATCH[2]}"
                    SPRINT_STATUSES["$story_id"]="$value"
                fi
            fi
        fi
    done < "$file"
}

# Map BMAD status to Ralph task status
map_status() {
    local bmad_status="$1"
    case "$bmad_status" in
        done)         echo "complete" ;;
        in-progress)  echo "in_progress" ;;
        review)       echo "in_progress" ;;
        ready-for-dev|backlog|"")  echo "pending" ;;
        *)            echo "pending" ;;
    esac
}

# ─── BMAD Epics Parsing ──────────────────────────────────────────────────

parse_epics() {
    local epics_file="$1"
    local output_file="$2"

    # Load sprint status if provided
    if [[ -n "$SPRINT_STATUS_FILE" ]]; then
        parse_sprint_status "$SPRINT_STATUS_FILE"
    fi

    local tasks_json="[]"
    local current_epic=""
    local current_story_id=""
    local current_story_title=""
    local current_description=""
    local current_ac=""
    local in_story=false
    local in_ac=false
    local in_description=false

    # Flush the current story into tasks_json
    flush_story() {
        if [[ -z "$current_story_id" ]]; then
            return
        fi

        # Determine status from sprint status or default to pending
        local status="pending"
        if [[ -n "${SPRINT_STATUSES[$current_story_id]:-}" ]]; then
            status=$(map_status "${SPRINT_STATUSES[$current_story_id]}")
        fi

        # Clean up description
        current_description=$(echo "$current_description" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

        # Build acceptance criteria array from collected lines
        local ac_array="[]"
        if [[ -n "$current_ac" ]]; then
            ac_array=$(echo "$current_ac" | while IFS= read -r ac_line; do
                ac_line=$(echo "$ac_line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
                if [[ -n "$ac_line" ]]; then
                    echo "$ac_line"
                fi
            done | jq -R '[inputs]' 2>/dev/null || echo '[]')
            # Handle case where jq gets no input
            if [[ -z "$ac_array" || "$ac_array" == "null" ]]; then
                ac_array="[]"
            fi
        fi

        # Build task JSON
        local task
        task=$(jq -n \
            --arg id "$current_story_id" \
            --arg title "$current_story_title" \
            --arg epic "$current_epic" \
            --arg description "$current_description" \
            --arg status "$status" \
            --argjson acceptance_criteria "$ac_array" \
            --arg proof_path "verification/${current_story_id}-proof.md" \
            '{
                id: $id,
                title: $title,
                epic: $epic,
                description: $description,
                status: $status,
                acceptance_criteria: $acceptance_criteria,
                verification: {
                    proof_path: $proof_path,
                    observability: {
                        query_logs: true,
                        check_traces: true
                    },
                    showboat: {
                        required: true,
                        template: "templates/showboat-template.md"
                    }
                }
            }')

        tasks_json=$(echo "$tasks_json" | jq --argjson task "$task" '. += [$task]')

        # Reset
        current_story_id=""
        current_story_title=""
        current_description=""
        current_ac=""
        in_story=false
        in_ac=false
        in_description=false
    }

    while IFS= read -r line; do
        # Detect epic headers: ## Epic N: Title
        if [[ "$line" =~ ^##[[:space:]]+Epic[[:space:]]+([0-9]+):[[:space:]]*(.*) ]]; then
            flush_story
            current_epic="Epic ${BASH_REMATCH[1]}: ${BASH_REMATCH[2]}"
            continue
        fi

        # Detect story headers: ### Story N.M: Title
        if [[ "$line" =~ ^###[[:space:]]+Story[[:space:]]+([0-9]+\.[0-9]+):[[:space:]]*(.*) ]]; then
            flush_story
            current_story_id="${BASH_REMATCH[1]}"
            current_story_title="${BASH_REMATCH[2]}"
            in_story=true
            in_description=true
            in_ac=false
            continue
        fi

        # Skip if not in a story
        if [[ "$in_story" != "true" ]]; then
            continue
        fi

        # Detect acceptance criteria section
        if [[ "$line" =~ ^\*\*Acceptance[[:space:]]+Criteria ]]; then
            in_description=false
            in_ac=true
            continue
        fi

        # Collect description (user story lines: As a / I want / So that)
        if [[ "$in_description" == "true" ]]; then
            if [[ "$line" =~ ^(As[[:space:]]a|I[[:space:]]want|So[[:space:]]that) ]]; then
                if [[ -n "$current_description" ]]; then
                    current_description+=" "
                fi
                current_description+="$line"
            fi
            continue
        fi

        # Collect acceptance criteria lines
        if [[ "$in_ac" == "true" ]]; then
            # **Given**, **When**, **Then**, **And** lines
            if [[ "$line" =~ ^\*\*(Given|When|Then|And)\*\*[[:space:]]*(.*) ]]; then
                local keyword="${BASH_REMATCH[1]}"
                local rest="${BASH_REMATCH[2]}"
                current_ac+="${keyword} ${rest}"$'\n'
            fi
            continue
        fi
    done < "$epics_file"

    # Flush last story
    flush_story

    # Build final output
    local generated_at
    generated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    jq -n \
        --arg generated_at "$generated_at" \
        --arg source "$epics_file" \
        --argjson tasks "$tasks_json" \
        '{
            generated_at: $generated_at,
            source: $source,
            tasks: $tasks
        }' > "$output_file"
}

# ─── Standalone Tasks Parsing ─────────────────────────────────────────────

parse_standalone_tasks() {
    local tasks_file="$1"
    local output_file="$2"

    local tasks_json="[]"
    local task_num=0

    while IFS= read -r line; do
        # Skip empty lines
        [[ -z "$line" ]] && continue

        # Parse markdown checklist: - [ ] or - [x]
        if [[ "$line" =~ ^[[:space:]]*-[[:space:]]+\[([[:space:]xX])\][[:space:]]+(.*) ]]; then
            task_num=$((task_num + 1))
            local check="${BASH_REMATCH[1]}"
            local title="${BASH_REMATCH[2]}"
            local status="pending"
            if [[ "$check" == "x" || "$check" == "X" ]]; then
                status="complete"
            fi

            local task
            task=$(jq -n \
                --arg id "T-$(printf '%03d' $task_num)" \
                --arg title "$title" \
                --arg status "$status" \
                '{
                    id: $id,
                    title: $title,
                    epic: "Standalone",
                    description: $title,
                    status: $status,
                    acceptance_criteria: [],
                    verification: {
                        proof_path: ("verification/" + $id + "-proof.md"),
                        observability: { query_logs: true, check_traces: true },
                        showboat: { required: true, template: "templates/showboat-template.md" }
                    }
                }')

            tasks_json=$(echo "$tasks_json" | jq --argjson task "$task" '. += [$task]')
            continue
        fi

        # Plain text: one task per non-empty line
        if [[ ! "$line" =~ ^[[:space:]]*# ]]; then
            task_num=$((task_num + 1))
            local title
            title=$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

            if [[ -n "$title" ]]; then
                local task
                task=$(jq -n \
                    --arg id "T-$(printf '%03d' $task_num)" \
                    --arg title "$title" \
                    --arg status "pending" \
                    '{
                        id: $id,
                        title: $title,
                        epic: "Standalone",
                        description: $title,
                        status: $status,
                        acceptance_criteria: [],
                        verification: {
                            proof_path: ("verification/" + $id + "-proof.md"),
                            observability: { query_logs: true, check_traces: true },
                            showboat: { required: true, template: "templates/showboat-template.md" }
                        }
                    }')

                tasks_json=$(echo "$tasks_json" | jq --argjson task "$task" '. += [$task]')
            fi
        fi
    done < "$tasks_file"

    local generated_at
    generated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    jq -n \
        --arg generated_at "$generated_at" \
        --arg source "$tasks_file" \
        --argjson tasks "$tasks_json" \
        '{
            generated_at: $generated_at,
            source: $source,
            tasks: $tasks
        }' > "$output_file"
}

# ─── Main ─────────────────────────────────────────────────────────────────

mkdir -p "$(dirname "$OUTPUT_FILE")"

if [[ -n "$EPICS_FILE" ]]; then
    parse_epics "$EPICS_FILE" "$OUTPUT_FILE"
elif [[ -n "$TASKS_FILE" ]]; then
    parse_standalone_tasks "$TASKS_FILE" "$OUTPUT_FILE"
fi

echo "[OK] Bridge: $(jq '.tasks | length' "$OUTPUT_FILE") tasks generated → $OUTPUT_FILE"
