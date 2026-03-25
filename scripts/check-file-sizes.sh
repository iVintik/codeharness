#!/usr/bin/env bash
# File size gate — enforces NFR1 (no src .ts/.tsx file >300 lines excluding tests)
# and NFR5 (no command file >100 lines excluding tests).
#
# Environment variables:
#   FILE_SIZE_ENFORCEMENT  — "warn" (default) exits 0 with annotations;
#                            "fail" exits 1 on violations.
#   SRC_DIR                — override source directory (default: src)

set -euo pipefail

FILE_SIZE_ENFORCEMENT="${FILE_SIZE_ENFORCEMENT:-warn}"
SRC_DIR="${SRC_DIR:-src}"

# Sanitize: treat empty SRC_DIR as default
if [ -z "$SRC_DIR" ]; then
  SRC_DIR="src"
fi

# Strip trailing slash to avoid double-slash in paths
SRC_DIR="${SRC_DIR%/}"

violations_found=0
nfr1_count=0
nfr5_count=0

# ── NFR1: Source files ≤300 lines ───────────────────────────────────────────
nfr1_violations=$(find "$SRC_DIR" \( -name '*.ts' -o -name '*.tsx' \) -not -path '*__tests__*' -exec awk 'END{if(NR>300) print FILENAME": "NR" lines"}' {} \;)

if [ -n "$nfr1_violations" ]; then
  violations_found=1
  nfr1_count=$(echo "$nfr1_violations" | wc -l | tr -d ' ')
  echo "NFR1 violations — ${nfr1_count} source file(s) exceeding 300 lines:"
  while IFS= read -r line; do
    echo "  $line"
    # GitHub Actions annotation
    file="${line%%:*}"
    echo "::error file=${file}::${line}"
  done <<< "$nfr1_violations"
  echo ""
fi

# ── NFR5: Command files ≤100 lines ─────────────────────────────────────────
nfr5_violations=$(find "$SRC_DIR/commands" \( -name '*.ts' -o -name '*.tsx' \) -not -path '*__tests__*' -exec awk 'END{if(NR>100) print FILENAME": "NR" lines"}' {} \; 2>/dev/null || true)

if [ -n "$nfr5_violations" ]; then
  violations_found=1
  nfr5_count=$(echo "$nfr5_violations" | wc -l | tr -d ' ')
  echo "NFR5 violations — ${nfr5_count} command file(s) exceeding 100 lines:"
  while IFS= read -r line; do
    echo "  $line"
    file="${line%%:*}"
    echo "::error file=${file}::${line}"
  done <<< "$nfr5_violations"
  echo ""
fi

# ── Result ──────────────────────────────────────────────────────────────────
if [ "$violations_found" -eq 1 ]; then
  if [ "$FILE_SIZE_ENFORCEMENT" = "fail" ]; then
    echo "FAIL: File size violations detected (enforcement=fail) — NFR1: ${nfr1_count}, NFR5: ${nfr5_count}"
    exit 1
  else
    echo "WARN: File size violations detected (enforcement=warn) — NFR1: ${nfr1_count}, NFR5: ${nfr5_count} — not blocking CI"
    exit 0
  fi
else
  echo "OK: No file size violations found"
  exit 0
fi
