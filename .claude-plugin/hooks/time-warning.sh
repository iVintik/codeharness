#!/usr/bin/env bash
# PreToolUse hook: warns when iteration time is running low.
# Reads deadline from ralph/.iteration_deadline (epoch timestamp).
# Warns at 10 min remaining, urgently at 5 min remaining.

DEADLINE_FILE="ralph/.iteration_deadline"

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
