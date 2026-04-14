#!/usr/bin/env bash
#
# SessionStart version-lock hook.
#
# Ensures the globally installed `codeharness` CLI matches the version baked
# into this plugin's plugin.json. The plugin is the source of truth for which
# CLI version its skills + commands are compatible with. On mismatch we run
# `npm install -g codeharness@<version>` once per session.
#
# Opt-out: set CODEHARNESS_NO_AUTO_INSTALL=1 in the environment and this hook
# will skip the upgrade check entirely (still logs the current state so users
# see what's installed).
#
# Behavior contract:
# - Silent when versions already match (no output, exit 0).
# - Logs to stderr + stdout when upgrading so the user sees what happened.
# - Never blocks the session — any failure is a warning, exit 0.
# - All input is quoted; never evaluates strings from the registry.

set -uo pipefail

# --- Locate plugin.json --------------------------------------------------
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
if [[ -z "$PLUGIN_ROOT" ]]; then
  # Fallback: derive from this script's own location (hooks/ → plugin root)
  PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

PLUGIN_JSON="$PLUGIN_ROOT/.claude-plugin/plugin.json"
if [[ ! -f "$PLUGIN_JSON" ]]; then
  # No manifest, nothing to lock against — exit cleanly.
  exit 0
fi

# --- Parse required version ---------------------------------------------
# Minimal extractor — avoids depending on jq being installed. Matches the
# first `"version": "..."` field in the manifest, which is the plugin version.
REQUIRED_VERSION="$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$PLUGIN_JSON" \
  | head -n1 \
  | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"

if [[ -z "$REQUIRED_VERSION" ]]; then
  # Couldn't parse — don't guess, skip silently.
  exit 0
fi

# --- Opt-out --------------------------------------------------------------
if [[ "${CODEHARNESS_NO_AUTO_INSTALL:-}" == "1" ]]; then
  CURRENT_VERSION="$(codeharness --version 2>/dev/null || echo 'not installed')"
  echo "[codeharness] auto-install disabled (CODEHARNESS_NO_AUTO_INSTALL=1). plugin=$REQUIRED_VERSION installed=$CURRENT_VERSION" >&2
  exit 0
fi

# --- Check installed version ---------------------------------------------
if ! command -v codeharness >/dev/null 2>&1; then
  CURRENT_VERSION=""
else
  # The CLI prints bare version (e.g. "0.44.2"). Take only the first word
  # to be defensive against future banner output.
  CURRENT_VERSION="$(codeharness --version 2>/dev/null | awk 'NR==1 {print $1}')"
fi

if [[ "$CURRENT_VERSION" == "$REQUIRED_VERSION" ]]; then
  # Versions match — silent no-op.
  exit 0
fi

# --- Upgrade --------------------------------------------------------------
if [[ -z "$CURRENT_VERSION" ]]; then
  echo "[codeharness] installing CLI v$REQUIRED_VERSION..." >&2
else
  echo "[codeharness] upgrading CLI $CURRENT_VERSION → $REQUIRED_VERSION..." >&2
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[codeharness] npm not found — skipping auto-install. Install Node.js ≥22 manually." >&2
  exit 0
fi

# Install with explicit version pin — no floating tags, fully deterministic.
# Redirect stdout to stderr so it stays out of any JSON-parsing parent shell.
if npm install -g "codeharness@${REQUIRED_VERSION}" >&2; then
  echo "[codeharness] CLI pinned to v$REQUIRED_VERSION." >&2
else
  echo "[codeharness] WARNING: npm install failed. Run manually: npm install -g codeharness@$REQUIRED_VERSION" >&2
fi

exit 0
