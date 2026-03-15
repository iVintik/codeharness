#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
IMAGE_NAME="codeharness-harness-test"
PROOF_DIR="$PROJECT_ROOT/docs/exec-plans/active"
TIMEOUT="${1:-300}"  # default 5 minutes, override with first arg

# --- Load .env if present ---
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  source "$PROJECT_ROOT/.env"
  set +a
fi

# --- Pre-flight ---
if [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
  echo "[FAIL] CLAUDE_CODE_OAUTH_TOKEN is not set. Export it or add to .env."
  exit 1
fi

echo "=== Building test image ==="
docker build \
  -f "$SCRIPT_DIR/Dockerfile.harness-test" \
  -t "$IMAGE_NAME" \
  "$PROJECT_ROOT"

echo ""
echo "=== Running /harness-run in Docker ==="
echo "    Image: $IMAGE_NAME"
echo "    Timeout: ${TIMEOUT}s"
echo "    Fixture: tests/docker/fixtures/sprint-status-test.yaml"
echo ""

# Run the full sprint loop and capture output
OUTPUT=$(timeout "$TIMEOUT" docker run --rm \
  -e CLAUDE_CODE_OAUTH_TOKEN="$CLAUDE_CODE_OAUTH_TOKEN" \
  "$IMAGE_NAME" \
  "Run /harness-run — execute the full sprint loop. Do NOT ask questions, proceed autonomously." \
  2>&1) || true

echo "$OUTPUT"

# --- Generate proof document ---
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
STORY_KEY="${STORY_KEY:-harness-run-test}"
PROOF_FILE="$PROOF_DIR/${STORY_KEY}.proof.md"

cat > "$PROOF_FILE" << PROOF_EOF
# Showboat Proof: ${STORY_KEY}

## Test Environment

- **Type:** Docker container (isolated, disposable)
- **Image:** $IMAGE_NAME
- **Timestamp:** $TIMESTAMP
- **Timeout:** ${TIMEOUT}s
- **Fixture:** tests/docker/fixtures/sprint-status-test.yaml

## Raw Output

\`\`\`
$OUTPUT
\`\`\`

## Verification

| AC | Evidence | Result |
|----|----------|--------|
| AC1: Reads sprint-status.yaml | Check Step 1 output | |
| AC2: Invokes correct workflows | Check Step 3 output | |
| AC3: Auto-advances stories | Check Step 4 output | |
| AC4: Epic completion | Check Step 5 output | |
| AC5: Retry logic | Check if triggered | |
| AC6: Summary printed | Check Step 7 output | |

_Fill in Result column after reviewing output._
PROOF_EOF

echo ""
echo "=== Proof document written to ==="
echo "    $PROOF_FILE"
echo ""
echo "Review the output above, fill in the Result column in the proof doc."
