#!/bin/bash
# codeharness: PostToolUse hook for Write and Edit tools
# Prompts agent to verify OTLP instrumentation after code changes.
# Must complete within 500ms (NFR1).
# Canonical pattern: valid JSON output always, fail open on errors.

# Error trap: fail open on script errors
trap 'exit 0' ERR

STATE_FILE=".claude/codeharness.local.md"

# If harness not initialized, skip (fail open)
if [ ! -f "$STATE_FILE" ]; then
  echo "[WARN] State file not found — skipping post-write check" >&2
  exit 0
fi

# Read hook input to check what file was written
HOOK_INPUT=$(cat)
FILE_PATH=$(echo "$HOOK_INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//' || true)

# Only prompt for source code files, not config/docs
case "$FILE_PATH" in
  *.ts|*.js|*.tsx|*.jsx|*.py|*.go|*.rs)
    ;;
  *)
    # Non-source file, skip
    exit 0
    ;;
esac

# Python-specific: check for bare exception swallowing
# grep -P with lookahead isn't portable; instead use awk to detect
# "except Exception:" followed by a line containing only "pass" or "..."
BARE_EXCEPT_WARNING=""
if [[ "$FILE_PATH" == *.py ]]; then
  BARE_EXCEPT_MATCHES=$(awk '/except[[:space:]]+Exception[[:space:]]*:/{found=NR; next} found && NR==found+1 && /^[[:space:]]*(pass|\.\.\.)([[:space:]]*#.*)?$/{print found": except Exception swallowed"; found=0; next} {found=0}' "$FILE_PATH" 2>/dev/null || true)
  if [ -n "$BARE_EXCEPT_MATCHES" ]; then
    BARE_EXCEPT_WARNING="\\n[WARN] Bare 'except Exception: pass/...' detected in $FILE_PATH\\n       Handle the error or add a # IGNORE: comment"
  fi
fi

# Build message
MSG="New code written. Verify OTLP instrumentation is present.\\n-> Check that new endpoints emit traces and structured logs."
if [ -n "$BARE_EXCEPT_WARNING" ]; then
  MSG="${MSG}${BARE_EXCEPT_WARNING}"
fi

echo "{\"message\": \"${MSG}\"}"
