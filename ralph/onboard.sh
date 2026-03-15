#!/usr/bin/env bash
# onboard.sh — Brownfield Onboarding Scanner (delegates to TypeScript CLI)
#
# DEPRECATED: This script is a thin wrapper around `codeharness onboard`.
# The TypeScript CLI provides comprehensive scanning including:
# - Per-file coverage analysis (not just file existence)
# - Verification gap detection (stories without proof documents)
# - Observability gap detection (OTLP config, Docker stack)
# - Sprint-status.yaml integration
# - Beads issue deduplication
#
# Usage:
#   ralph/onboard.sh scan --project-dir DIR [--json]
#   ralph/onboard.sh coverage --project-dir DIR
#   ralph/onboard.sh audit --project-dir DIR
#   ralph/onboard.sh epic --project-dir DIR --output PATH

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLI="$PROJECT_ROOT/dist/index.js"

# Ensure CLI is built
if [[ ! -f "$CLI" ]]; then
    echo "[WARN] CLI not built — running npm run build" >&2
    (cd "$PROJECT_ROOT" && npm run build) >&2
fi

ACTION=""
PROJECT_DIR=""
JSON_OUTPUT=false
OUTPUT_FILE=""

if [[ $# -gt 0 && "$1" != -* ]]; then
    ACTION="$1"
    shift
fi

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help) echo "Usage: onboard.sh {scan|coverage|audit|epic} --project-dir DIR"; exit 0 ;;
        --project-dir) PROJECT_DIR="$2"; shift 2 ;;
        --json) JSON_OUTPUT=true; shift ;;
        --output) OUTPUT_FILE="$2"; shift 2 ;;
        *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
done

if [[ -z "$PROJECT_DIR" ]]; then
    echo "Error: --project-dir is required" >&2
    exit 1
fi

# Delegate to TypeScript CLI
cd "$PROJECT_DIR"

case "$ACTION" in
    scan)
        if [[ "$JSON_OUTPUT" == "true" ]]; then
            node "$CLI" onboard scan --json
        else
            node "$CLI" onboard scan
        fi
        ;;
    coverage)
        node "$CLI" onboard coverage
        ;;
    audit)
        node "$CLI" onboard audit
        ;;
    epic)
        node "$CLI" onboard epic --auto-approve
        ;;
    "")
        echo "Error: specify command: scan, coverage, audit, epic" >&2
        exit 1
        ;;
    *)
        echo "Unknown command: $ACTION" >&2
        exit 1
        ;;
esac
