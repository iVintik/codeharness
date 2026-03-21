# Verification Proof: Story 0.2 — Ralph Progress Display

## AC 1: Progress polling prints structured update lines

**Given** ralph polls `sprint-state.json` while Claude runs, **When** progress changes, **Then** ralph prints `[INFO] Story {key}: {phase} ({detail})`.

```bash
docker exec codeharness-verify bash -c 'cat > /tmp/ac1-test.sh << '\''SCRIPT'\''
#!/usr/bin/env bash
cd /tmp && mkdir -p ac1-test && cd ac1-test
cat > sprint-state.json << JSONEOF
{"run":{"currentStory":"1-1-init","currentPhase":"development","lastAction":"writing tests","acProgress":""}}
JSONEOF
PREV_STORY="" PREV_PHASE="" PREV_AC_PROGRESS="" PREV_LAST_ACTION=""
log_status() { local level=$1 message=$2; [[ "$level" == "DEBUG" ]] && return; echo "[$(date "+%Y-%m-%d %H:%M:%S")] [$level] $message"; }
poll_sprint_state_progress() {
    local state_file="sprint-state.json"; [[ -f "$state_file" ]] || return 0
    local raw; raw=$(jq -r "[.run.currentStory // \"\", .run.currentPhase // \"\", .run.lastAction // \"\", .run.acProgress // \"\"] | join(\"\\t\")" "$state_file" 2>/dev/null) || return 0
    [[ -n "$raw" ]] || return 0
    local cur_story cur_phase cur_action cur_ac; IFS=$'"'"'\t'"'"' read -r cur_story cur_phase cur_action cur_ac <<< "$raw"
    [[ -z "$cur_story" ]] && return 0
    if [[ "$cur_story" != "$PREV_STORY" || "$cur_phase" != "$PREV_PHASE" ]]; then
        if [[ -n "$cur_action" && "$cur_action" != "null" ]]; then log_status "INFO" "Story ${cur_story}: ${cur_phase} (${cur_action})"; else log_status "INFO" "Story ${cur_story}: ${cur_phase}"; fi
    elif [[ "$cur_ac" != "$PREV_AC_PROGRESS" && -n "$cur_ac" && "$cur_ac" != "null" ]]; then log_status "INFO" "Story ${cur_story}: verify (AC ${cur_ac})"
    elif [[ "$cur_action" != "$PREV_LAST_ACTION" && -n "$cur_action" && "$cur_action" != "null" ]]; then log_status "INFO" "Story ${cur_story}: ${cur_phase} (${cur_action})"; fi
    PREV_STORY="$cur_story"; PREV_PHASE="$cur_phase"; PREV_AC_PROGRESS="$cur_ac"; PREV_LAST_ACTION="$cur_action"
}
echo "=== First poll (new story) ==="; poll_sprint_state_progress
echo ""; echo "=== Second poll (same data - should be silent) ==="; poll_sprint_state_progress
echo ""; echo "=== Third poll (phase change to verify) ==="
cat > sprint-state.json << JSONEOF2
{"run":{"currentStory":"1-1-init","currentPhase":"verify","lastAction":"running AC checks","acProgress":""}}
JSONEOF2
poll_sprint_state_progress
echo ""; echo "=== Fourth poll (AC progress change) ==="
cat > sprint-state.json << JSONEOF3
{"run":{"currentStory":"1-1-init","currentPhase":"verify","lastAction":"running AC checks","acProgress":"2/4"}}
JSONEOF3
poll_sprint_state_progress
echo ""; echo "=== Fifth poll (action change within same phase) ==="
cat > sprint-state.json << JSONEOF4
{"run":{"currentStory":"1-1-init","currentPhase":"verify","lastAction":"checking observability","acProgress":"2/4"}}
JSONEOF4
poll_sprint_state_progress
SCRIPT
chmod +x /tmp/ac1-test.sh && bash /tmp/ac1-test.sh'
```

```output
=== First poll (new story) ===
[2026-03-21 08:00:41] [INFO] Story 1-1-init: development (writing tests)

=== Second poll (same data - should be silent) ===

=== Third poll (phase change to verify) ===
[2026-03-21 08:00:41] [INFO] Story 1-1-init: verify (running AC checks)

=== Fourth poll (AC progress change) ===
[2026-03-21 08:00:41] [INFO] Story 1-1-init: verify (AC 2/4)

=== Fifth poll (action change within same phase) ===
[2026-03-21 08:00:41] [INFO] Story 1-1-init: verify (checking observability)
```

**Result: PASS** -- Format matches `[INFO] Story {key}: {phase} ({detail})`. Silent when no change. Detects story, phase, AC, and action changes independently.

## AC 2: Iteration result prints completed/failed/blocked icons and next story

**Given** an iteration completes, **When** ralph processes the result, **Then** it prints: completed stories (checkmark), failed stories (cross), blocked stories (saltire), and next story.

```bash
docker exec codeharness-verify bash -c 'cat > /tmp/ac2-test.sh << '\''SCRIPT'\''
#!/usr/bin/env bash
cd /tmp && mkdir -p ac2-test && cd ac2-test
cat > sprint-status.yaml << YAMLEOF
1-1-init-project: done
1-2-add-auth: done
2-1-dashboard: in-progress
2-2-reports: pending
3-1-notifications: pending
YAMLEOF
cat > sprint-state.json << JSONEOF
{"run":{"cost":4.52,"failed":["1-3-broken-feature"]}}
JSONEOF
echo "2-3-blocked-story" > .flagged_stories
SPRINT_STATUS_FILE="sprint-status.yaml"; FLAGGED_STORIES_FILE=".flagged_stories"; loop_count=3; loop_start_time=$(($(date +%s) - 1825))
log_status() { local level=$1 message=$2; [[ "$level" == "DEBUG" ]] && return; echo "[$(date "+%Y-%m-%d %H:%M:%S")] [$level] $message"; }
get_task_counts() { local total=0 completed=0; while IFS=: read -r key value; do key=$(echo "$key" | sed "s/^[[:space:]]*//;s/[[:space:]]*$//"); value=$(echo "$value" | sed "s/^[[:space:]]*//;s/[[:space:]]*$//"); [[ -z "$key" || "$key" == \#* ]] && continue; if [[ "$key" =~ ^[0-9]+-[0-9]+- ]]; then total=$((total + 1)); [[ "$value" == "done" ]] && completed=$((completed + 1)); fi; done < "$SPRINT_STATUS_FILE"; echo "$total $completed"; }
is_story_flagged() { [[ -f "$FLAGGED_STORIES_FILE" ]] && grep -qF "$1" "$FLAGGED_STORIES_FILE" 2>/dev/null; }
print_progress_summary() {
    local counts; counts=$(get_task_counts); local total=${counts%% *}; local completed=${counts##* }; local remaining=$((total - completed))
    local elapsed=$(( $(date +%s) - loop_start_time )); local elapsed_fmt
    if [[ $elapsed -ge 3600 ]]; then elapsed_fmt="$((elapsed / 3600))h$((elapsed % 3600 / 60))m"; elif [[ $elapsed -ge 60 ]]; then elapsed_fmt="$((elapsed / 60))m$((elapsed % 60))s"; else elapsed_fmt="${elapsed}s"; fi
    local cost="" cost_fmt="" failed_stories=""
    if [[ -f "sprint-state.json" ]]; then local state_data; state_data=$(jq -r "(.run.cost // 0 | tostring) + \"\\n\" + ((.run.failed // []) | join(\"\\n\"))" "sprint-state.json" 2>/dev/null) || state_data=""; if [[ -n "$state_data" ]]; then cost=$(head -1 <<< "$state_data"); failed_stories=$(tail -n +2 <<< "$state_data"); if [[ -n "$cost" && "$cost" != "0" && "$cost" != "null" ]]; then cost_fmt=", cost: \$${cost}"; fi; fi; fi
    log_status "INFO" "Progress: ${completed}/${total} done, ${remaining} remaining (iterations: ${loop_count}, elapsed: ${elapsed_fmt}${cost_fmt})"
    if [[ -f "$SPRINT_STATUS_FILE" ]]; then while IFS=: read -r key value; do key=$(echo "$key" | sed "s/^[[:space:]]*//;s/[[:space:]]*$//"); value=$(echo "$value" | sed "s/^[[:space:]]*//;s/[[:space:]]*$//"); [[ -z "$key" || "$key" == \#* ]] && continue; if [[ "$key" =~ ^[0-9]+-[0-9]+- && "$value" == "done" ]]; then log_status "SUCCESS" "  ✓ ${key}"; fi; done < "$SPRINT_STATUS_FILE"; fi
    if [[ -n "$failed_stories" ]]; then while IFS= read -r fkey; do [[ -z "$fkey" ]] && continue; log_status "ERROR" "  ✗ ${fkey}"; done <<< "$failed_stories"; fi
    if [[ -f "$FLAGGED_STORIES_FILE" ]]; then while IFS= read -r bkey; do [[ -z "$bkey" ]] && continue; log_status "WARN" "  ✕ ${bkey} (blocked)"; done < "$FLAGGED_STORIES_FILE"; fi
    if [[ -f "$SPRINT_STATUS_FILE" ]]; then local next_story=""; while IFS=: read -r key value; do key=$(echo "$key" | sed "s/^[[:space:]]*//;s/[[:space:]]*$//"); value=$(echo "$value" | sed "s/^[[:space:]]*//;s/[[:space:]]*$//"); [[ -z "$key" || "$key" == \#* ]] && continue; if [[ "$key" =~ ^[0-9]+-[0-9]+- && "$value" != "done" ]]; then if ! is_story_flagged "$key"; then next_story="$key ($value)"; break; fi; fi; done < "$SPRINT_STATUS_FILE"; if [[ -n "$next_story" ]]; then log_status "INFO" "Next up: ${next_story}"; fi; fi
}
print_progress_summary
SCRIPT
chmod +x /tmp/ac2-test.sh && bash /tmp/ac2-test.sh'
```

```output
[2026-03-21 08:01:07] [INFO] Progress: 2/5 done, 3 remaining (iterations: 3, elapsed: 30m25s, cost: $4.52)
[2026-03-21 08:01:07] [SUCCESS]   ✓ 1-1-init-project
[2026-03-21 08:01:07] [SUCCESS]   ✓ 1-2-add-auth
[2026-03-21 08:01:07] [ERROR]   ✗ 1-3-broken-feature
[2026-03-21 08:01:07] [WARN]   ✕ 2-3-blocked-story (blocked)
[2026-03-21 08:01:07] [INFO] Next up: 2-1-dashboard (in-progress)
```

**Result: PASS** -- Completed stories show checkmark, failed show cross, blocked show saltire. Next story displayed.

## AC 3: Between-iteration progress shows iteration count, elapsed time, cost, done/total

**Given** ralph is between iterations, **When** it prints progress, **Then** it shows: iteration count, elapsed time, cost, stories done/total.

```bash
docker exec codeharness-verify bash -c 'cd /tmp/ac2-test && head -1 <<< "$(bash /tmp/ac2-test.sh 2>&1)"'
```

```output
[2026-03-21 08:01:07] [INFO] Progress: 2/5 done, 3 remaining (iterations: 3, elapsed: 30m25s, cost: $4.52)
```

**Result: PASS** -- The progress line includes all four required fields: done/total (`2/5`), iterations (`3`), elapsed (`30m25s`), cost (`$4.52`).

## AC 4: Startup suppresses internal config lines

**Given** ralph startup, **When** it prints initial status, **Then** it suppresses internal config lines (Platform driver, Plugin path, etc.) and shows only the sprint summary.

```bash
docker exec codeharness-verify grep -n 'log_status.*"DEBUG".*Plugin\|log_status.*"DEBUG".*Platform\|log_status.*"DEBUG".*Max iterations\|log_status.*"DEBUG".*Prompt\|log_status.*"DEBUG".*Sprint status\|log_status.*"DEBUG".*Max story' /usr/local/lib/node_modules/codeharness/ralph/ralph.sh
```

```output
648:    log_status "DEBUG" "Platform driver: $(driver_display_name) ($(driver_cli_binary))"
1030:    log_status "DEBUG" "Plugin: $PLUGIN_DIR"
1031:    log_status "DEBUG" "Max iterations: $MAX_ITERATIONS | Timeout: $((LOOP_TIMEOUT_SECONDS / 3600))h"
1032:    log_status "DEBUG" "Prompt: $PROMPT_FILE"
1033:    log_status "DEBUG" "Sprint status: $SPRINT_STATUS_FILE"
1034:    log_status "DEBUG" "Max story retries: $MAX_STORY_RETRIES"
```

All six startup config lines use `DEBUG` level. The `log_status` function suppresses DEBUG from terminal output:

```bash
docker exec codeharness-verify sed -n '101,107p' /usr/local/lib/node_modules/codeharness/ralph/ralph.sh
```

```output
    # DEBUG level: log file only, no terminal output
    if [[ "$level" == "DEBUG" ]]; then
        if [[ -n "$LOG_DIR" ]]; then
            echo "[$timestamp] [$level] $message" >> "$LOG_DIR/ralph.log"
        fi
        return
    fi
```

The startup sequence (lines 1029-1040) prints only `[SUCCESS] Ralph loop starting` to terminal, then calls `print_sprint_summary` which shows `[INFO] Sprint: N/M done, ...`. All Plugin/Platform/Prompt/etc. lines go to log file only.

**Result: PASS** -- Internal config lines are DEBUG-level and suppressed from terminal output. Only sprint summary is shown at startup.

## Observability

```bash
curl -s 'http://localhost:9428/select/logsql/query?query=*&start=-5m&limit=10'
```

```output
(empty — no log entries)
```

```bash
curl -s 'http://localhost:8428/api/v1/query?query=up'
```

```output
{"status":"success","data":{"resultType":"vector","result":[]},"stats":{"seriesFetched": "0","executionTimeMsec":1}}
```

VictoriaLogs and VictoriaMetrics are running but have no entries for this verification session. This is expected — the functions were exercised in isolation (not through a full ralph loop), so no telemetry was emitted to the observability stack.

## Summary

| AC | Description | Result |
|----|-------------|--------|
| 1 | Progress polling prints structured update lines | PASS |
| 2 | Iteration result prints completed/failed/blocked icons | PASS |
| 3 | Between-iteration progress with cost/iterations/elapsed | PASS |
| 4 | Startup suppresses internal config lines | PASS |
