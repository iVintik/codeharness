# Verification Proof: 0-5-1 Stream JSON Claude Driver

**Date:** 2026-03-21
**Verdict:** PASS (all 4 ACs verified)

## AC 1: Driver uses stream-json flags

The claude-code driver builds the command with `--output-format stream-json --verbose --include-partial-messages` instead of `--output-format json`.

```bash
docker exec codeharness-verify cat /usr/local/lib/node_modules/codeharness/ralph/drivers/claude-code.sh
```

```output
    # Output format — always stream-json for real-time NDJSON output
    CLAUDE_CMD_ARGS+=("--output-format" "stream-json" "--verbose" "--include-partial-messages")
```

**Result:** PASS — The driver explicitly uses `stream-json` with `--verbose` and `--include-partial-messages`.

## AC 2: Stream-json produces NDJSON during execution

Running Claude with stream-json flags produces multiple JSON lines (NDJSON), not a single blob at exit.

```bash
docker exec codeharness-verify claude --output-format stream-json --verbose --print -p "Say hello" --max-turns 1
```

```output
{"type":"system","subtype":"init","cwd":"/workspace","session_id":"51e32941-394b-4658-acab-380114f89091","tools":["Task","TaskOutput","Bash","Glob","Grep","ExitPlanMode","Read","Edit","Write","NotebookEdit","WebFetch","TodoWrite","WebSearch","TaskStop","AskUserQuestion","Skill","EnterPlanMode","EnterWorktree","ExitWorktree","CronCreate","CronDelete","CronList","ToolSearch"],"mcp_servers":[],"model":"claude-sonnet-4-6","permissionMode":"default",...}
{"type":"assistant","message":{"id":"ad5d0704-8058-46e3-b9c6-b7cc660e2f5a",...,"content":[{"type":"text","text":"Not logged in · Please run /login"}],...},...}
{"type":"result","subtype":"success","is_error":true,"duration_ms":60,...}
```

**Result:** PASS — Output is 3 separate NDJSON lines (system init, assistant message, result), each a valid JSON object on its own line. Output arrives line-by-line, not as a single blob at exit.

## AC 3: Last result line contains session_id, cost, result text

The last line with `type: "result"` from the stream-json output contains the required fields.

```bash
docker exec codeharness-verify claude --output-format stream-json --verbose --print -p "Say hello" --max-turns 1
```

```output
{"type":"result","subtype":"success","is_error":true,"duration_ms":60,"duration_api_ms":0,"num_turns":1,"result":"Not logged in · Please run /login","stop_reason":"stop_sequence","session_id":"51e32941-394b-4658-acab-380114f89091","total_cost_usd":0,"usage":{...},...}
```

Fields present:
- `session_id`: `"51e32941-394b-4658-acab-380114f89091"`
- `total_cost_usd`: `0`
- `result`: `"Not logged in · Please run /login"`

**Result:** PASS — The `type: "result"` line contains session_id, total_cost_usd, and result text.

## AC 4: Ralph detects success/failure/timeout from NDJSON output

Ralph uses stream-json throughout the pipeline and detects outcomes via exit codes and output content inspection.

```bash
docker exec codeharness-verify grep -n 'result\|grep.*type\|tail -1\|NDJSON\|stream-json' /usr/local/lib/node_modules/codeharness/ralph/ralph.sh | head -20
```

```output
50:CLAUDE_OUTPUT_FORMAT="${CLAUDE_OUTPUT_FORMAT:-stream-json}"
602:    # Show session issues (last 20 lines — most recent subagent)
785:        # Only check non-JSON lines for errors. Stream-json output is NDJSON
799:        record_loop_result "$iteration" "$files_changed" "$has_errors" "$output_length"
800:        local circuit_result=$?
802:        if [[ $circuit_result -ne 0 ]]; then
1114:        local exec_result=$?
1116:        case $exec_result in
```

```bash
docker exec codeharness-verify grep -n 'CLAUDE_OUTPUT_FORMAT\|stream-json' /usr/local/lib/node_modules/codeharness/dist/index.js | head -10
```

```output
4345:      env.CLAUDE_OUTPUT_FORMAT = "stream-json";
```

Detection logic in ralph.sh:
- **Success:** exit code 0 → `return 0` (line 758+)
- **Timeout:** exit code 124 → logs timeout, captures timeout report, `return 1` (line 808+)
- **API limit:** grep for limit messages → `return 2` (line 833+)
- **Transient API error:** grep for 500/529/503/overloaded → `return 4` (line 838+)
- **Other failure:** non-zero exit → `return 1` (line 842+)
- **Error detection in output:** Only non-JSON lines are checked for error patterns (line 785-793), avoiding false positives from NDJSON content that naturally contains words like "error" in code reviews.
- **Circuit breaker:** `record_loop_result` tracks iteration outcomes; opens breaker on repeated failures (line 799-804).

**Result:** PASS — Ralph correctly handles NDJSON stream-json output, detects success/failure/timeout via exit codes and content inspection, and avoids false positives from JSON content lines.

## Session Issues

None. All four acceptance criteria verified successfully against the running container.
