/**
 * Review module orchestrator — invokes BMAD code-review workflow via child_process.
 * Returns Result<ReviewResult>, never throws.
 */

import { execFileSync } from 'node:child_process';
import { ok, fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type { ReviewResult } from './types.js';

/** Default timeout: 25 minutes */
const DEFAULT_TIMEOUT_MS = 1_500_000;

/** Max lines of output to keep */
const MAX_OUTPUT_LINES = 200;

/**
 * Truncate output to the last N lines.
 */
function truncateOutput(output: string, maxLines: number): string {
  const lines = output.split('\n');
  if (lines.length <= maxLines) {
    return output;
  }
  return lines.slice(-maxLines).join('\n');
}

/**
 * Determine if an error is a timeout error from child_process.
 * The `killed` flag is set by Node.js when it kills the process due to timeout.
 * We also accept SIGTERM as a timeout indicator since execFileSync uses it
 * as the default kill signal when the timeout expires.
 */
function isTimeoutError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as Record<string, unknown>;
  // `killed` is the most reliable indicator — Node.js sets it when it
  // terminates the child due to timeout. SIGTERM alone could come from
  // other sources but is still treated as timeout for child_process calls
  // since Node.js uses SIGTERM as the default timeout kill signal.
  return e['killed'] === true || e['signal'] === 'SIGTERM';
}

/**
 * Parse review output to determine approval status and extract comments.
 * Looks for rejection/change-request signals in the output.
 */
function parseReviewOutput(output: string): { approved: boolean; comments: string[] } {
  const comments: string[] = [];
  const lower = output.toLowerCase();

  // Look for explicit rejection signals
  const rejected =
    lower.includes('changes requested') ||
    lower.includes('changes required') ||
    lower.includes('not approved') ||
    lower.includes('review: reject') ||
    lower.includes('status: rejected') ||
    lower.includes('needs changes') ||
    lower.includes('request changes');

  // Extract comment lines (lines starting with - or * that look like findings)
  const lines = output.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      (trimmed.startsWith('- ') || trimmed.startsWith('* ')) &&
      trimmed.length > 10
    ) {
      comments.push(trimmed);
    }
  }

  // Rejection signals take priority over approval signals.
  // If no signals at all, default to approved (no findings = pass).
  const isApproved = !rejected;

  return { approved: isApproved, comments };
}

/**
 * Invoke the BMAD code-review workflow for a given story key.
 * Uses child_process.execFileSync with a configurable timeout.
 * Returns Result<ReviewResult> — never throws.
 */
export function invokeBmadCodeReview(
  key: string,
  opts?: { timeoutMs?: number },
): Result<ReviewResult> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startTime = Date.now();

  try {
    const stdout = execFileSync(
      'claude',
      [
        '--print',
        `Run the BMAD code-review workflow for story at _bmad-output/implementation-artifacts/${key}.md — review all changes, check quality, and provide findings.`,
      ],
      {
        timeout: timeoutMs,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 50 * 1024 * 1024,
      },
    );

    const duration = Date.now() - startTime;
    const output = truncateOutput(stdout, MAX_OUTPUT_LINES);
    const { approved, comments } = parseReviewOutput(output);

    return ok({
      key,
      approved,
      comments,
      duration,
      output,
    });
  } catch (err: unknown) {
    const duration = Date.now() - startTime;

    if (isTimeoutError(err)) {
      const errObj = err as Record<string, unknown>;
      const stderr = typeof errObj['stderr'] === 'string' ? errObj['stderr'] : '';
      const stdout = typeof errObj['stdout'] === 'string' ? errObj['stdout'] : '';
      const combinedOutput = truncateOutput(
        (stdout + '\n' + stderr).trim(),
        MAX_OUTPUT_LINES,
      );

      return fail(
        `timeout: review workflow exceeded ${Math.round(timeoutMs / 1000)}s for story ${key} (ran ${Math.round(duration / 1000)}s)`,
        {
          key,
          approved: false,
          comments: [],
          duration,
          output: combinedOutput,
        },
      );
    }

    const errObj = err as Record<string, unknown>;
    const exitCode = typeof errObj['status'] === 'number' ? errObj['status'] : null;
    const stderr = typeof errObj['stderr'] === 'string' ? errObj['stderr'] : '';
    const stdout = typeof errObj['stdout'] === 'string' ? errObj['stdout'] : '';
    const msg = err instanceof Error ? err.message : String(err);
    const combinedOutput = truncateOutput(
      (stdout + '\n' + stderr).trim(),
      MAX_OUTPUT_LINES,
    );

    const errorMsg = exitCode !== null
      ? `review workflow failed with exit code ${exitCode} for story ${key}: ${msg}`
      : `review workflow failed for story ${key}: ${msg}`;

    return fail(errorMsg, {
      key,
      approved: false,
      comments: [],
      duration,
      output: combinedOutput,
    });
  }
}
