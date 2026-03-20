/**
 * Audit report formatters — human-readable and JSON output.
 *
 * Human format uses UX prefix format: [OK], [FAIL], [WARN].
 * JSON format returns structured AuditResult shape.
 */

import type { AuditResult, DimensionResult } from './types.js';

// ─── Status to prefix mapping ────────────────────────────────────────────────

const STATUS_PREFIX: Record<string, string> = {
  pass: '[OK]',
  fail: '[FAIL]',
  warn: '[WARN]',
};

// ─── Human-readable format (Task 4.1) ───────────────────────────────────────

/**
 * Formats audit result as human-readable output lines.
 *
 * Each dimension: `[OK] dimension: metric` or `[FAIL] dimension: metric`
 * Gaps listed below as: `  [WARN] description -- fix: remedy`
 */
export function formatAuditHuman(result: AuditResult): string[] {
  const lines: string[] = [];

  for (const dimension of Object.values(result.dimensions)) {
    const prefix = STATUS_PREFIX[dimension.status] ?? '[WARN]';
    lines.push(`${prefix} ${dimension.name}: ${dimension.metric}`);

    // List gaps with suggested fixes
    for (const gap of dimension.gaps) {
      lines.push(`  [WARN] ${gap.description} -- fix: ${gap.suggestedFix}`);
    }
  }

  // Summary line
  const overallPrefix = STATUS_PREFIX[result.overallStatus] ?? '[WARN]';
  lines.push('');
  lines.push(
    `${overallPrefix} Audit complete: ${result.gapCount} gap${result.gapCount !== 1 ? 's' : ''} found (${result.durationMs}ms)`,
  );

  return lines;
}

// ─── JSON format (Task 4.2) ─────────────────────────────────────────────────

/**
 * Returns structured JSON matching the AuditResult shape.
 * Used for --json output.
 */
export function formatAuditJson(result: AuditResult): AuditResult {
  return result;
}
