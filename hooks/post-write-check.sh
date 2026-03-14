#!/bin/bash
# codeharness: PostToolUse hook for Write tool
# Prompts agent to verify OTLP instrumentation after code changes.
# Must complete within 500ms (NFR1).

set -euo pipefail

STATE_FILE=".claude/codeharness.local.md"

# If harness not initialized or observability disabled, skip
if [ ! -f "$STATE_FILE" ]; then
  exit 0
fi

if ! grep -q 'observability: true' "$STATE_FILE" 2>/dev/null; then
  exit 0
fi

# Read hook input to check what file was written
HOOK_INPUT=$(cat)
FILE_PATH=$(echo "$HOOK_INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//')

# Only prompt for source code files, not config/docs
case "$FILE_PATH" in
  *.ts|*.js|*.tsx|*.jsx|*.py|*.go|*.rs)
    echo '{"message": "Verify OTLP instrumentation in new code. Check that logging uses structured format and traces are propagated."}'
    ;;
  *)
    # Non-source file, skip
    exit 0
    ;;
esac
