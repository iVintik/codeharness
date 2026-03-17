#!/usr/bin/env bash
# PreToolUse hook: warns when iteration time is running low.
# Only active during the Ralph Loop session that set the deadline.
# Reads deadline from ralph/.iteration_deadline (epoch timestamp).
# Warns at 10 min remaining, urgently at 5 min remaining.

set -euo pipefail

PROJECT_ROOT="${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/..}"
PROJECT_ROOT="${PROJECT_ROOT:-$(dirname "$(dirname "$0")")}"
RALPH_STATE="${PROJECT_ROOT}/.claude/ralph-loop.local.md"
DEADLINE_FILE="${PROJECT_ROOT}/ralph/.iteration_deadline"

# Must have an active Ralph loop state file
if [[ ! -f "$RALPH_STATE" ]]; then
    exit 0
fi

# Session isolation: only fire in the session that started the Ralph loop
HOOK_INPUT=$(cat)
STATE_SESSION=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$RALPH_STATE" | grep '^session_id:' | sed 's/session_id: *//' || true)
HOOK_SESSION=$(echo "$HOOK_INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_id',''))" 2>/dev/null || true)

if [[ -z "$STATE_SESSION" ]] || [[ "$STATE_SESSION" != "$HOOK_SESSION" ]]; then
    exit 0
fi

if [[ ! -f "$DEADLINE_FILE" ]]; then
    exit 0
fi

deadline=$(cat "$DEADLINE_FILE" 2>/dev/null)
now=$(date +%s)
remaining=$(( deadline - now ))

if [[ $remaining -le 0 ]]; then
    echo "⚠️ TIMEOUT EXCEEDED — Stop current work immediately. Run Step 7 (summary) and Step 8 (session retrospective) NOW."
elif [[ $remaining -le 300 ]]; then
    minutes=$(( remaining / 60 ))
    echo "⚠️ URGENT: Only ${minutes}m remaining. Stop story work. Run Step 7 → Step 8 (retro) NOW before the session is killed."
elif [[ $remaining -le 600 ]]; then
    minutes=$(( remaining / 60 ))
    echo "⏰ ${minutes}m remaining. Do NOT start new story work. Wrap up current work and proceed to Step 7 → Step 8 (retro)."
fi

exit 0
