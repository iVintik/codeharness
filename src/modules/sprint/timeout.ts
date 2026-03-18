/**
 * Timeout capture — captures diagnostic data when a ralph iteration times out.
 * All functions return Result<T>, never throw.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { ok, fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type { TimeoutCapture, TimeoutReport, TimeoutSummary } from './types.js';

/** Git command timeout in milliseconds */
const GIT_TIMEOUT_MS = 5000;

/** Default max lines to capture from output log */
const DEFAULT_MAX_LINES = 100;

/**
 * Capture git diff summary (staged + unstaged) using --stat format.
 * Uses execSync with a 5-second timeout to prevent hanging.
 */
export function captureGitDiff(): Result<string> {
  try {
    const unstaged = execSync('git diff --stat', {
      timeout: GIT_TIMEOUT_MS,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const staged = execSync('git diff --cached --stat', {
      timeout: GIT_TIMEOUT_MS,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const parts: string[] = [];
    if (unstaged) parts.push('Unstaged:\n' + unstaged);
    if (staged) parts.push('Staged:\n' + staged);

    if (parts.length === 0) {
      return ok('No changes detected');
    }

    return ok(parts.join('\n\n'));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Failed to capture git diff: ${msg}`);
  }
}

/**
 * Compare two sprint-state.json snapshots and return a human-readable delta
 * of changed story statuses.
 */
export function captureStateDelta(
  beforePath: string,
  afterPath: string,
): Result<string> {
  try {
    if (!existsSync(beforePath)) {
      return fail(`State snapshot not found: ${beforePath}`);
    }
    if (!existsSync(afterPath)) {
      return fail(`Current state file not found: ${afterPath}`);
    }

    const beforeRaw = readFileSync(beforePath, 'utf-8');
    const afterRaw = readFileSync(afterPath, 'utf-8');

    const before = JSON.parse(beforeRaw) as { stories?: Record<string, { status?: string }> };
    const after = JSON.parse(afterRaw) as { stories?: Record<string, { status?: string }> };

    const beforeStories = before.stories ?? {};
    const afterStories = after.stories ?? {};

    const allKeys = new Set([...Object.keys(beforeStories), ...Object.keys(afterStories)]);
    const changes: string[] = [];

    for (const key of allKeys) {
      const beforeStatus = beforeStories[key]?.status ?? '(absent)';
      const afterStatus = afterStories[key]?.status ?? '(absent)';
      if (beforeStatus !== afterStatus) {
        changes.push(`${key}: ${beforeStatus} → ${afterStatus}`);
      }
    }

    if (changes.length === 0) {
      return ok('No state changes');
    }

    return ok(changes.join('\n'));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Failed to capture state delta: ${msg}`);
  }
}

/**
 * Read the last N lines from the iteration output log.
 */
export function capturePartialStderr(
  outputFile: string,
  maxLines: number = DEFAULT_MAX_LINES,
): Result<string> {
  try {
    if (!existsSync(outputFile)) {
      return fail(`Output file not found: ${outputFile}`);
    }

    const content = readFileSync(outputFile, 'utf-8');
    const lines = content.split('\n');
    // Drop trailing empty element from files ending with newline
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }
    const lastLines = lines.slice(-maxLines).join('\n');

    return ok(lastLines);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Failed to capture partial stderr: ${msg}`);
  }
}

/**
 * Format a TimeoutCapture as a markdown report string.
 */
function formatReport(capture: TimeoutCapture): string {
  const lines: string[] = [
    `# Timeout Report: Iteration ${capture.iteration}`,
    '',
    `- **Story:** ${capture.storyKey}`,
    `- **Duration:** ${capture.durationMinutes} minutes (timeout)`,
    `- **Timestamp:** ${capture.timestamp}`,
    '',
    '## Git Changes',
    '',
    capture.gitDiff,
    '',
    '## State Delta',
    '',
    capture.stateDelta,
    '',
    '## Partial Output (last 100 lines)',
    '',
    '```',
    capture.partialStderr,
    '```',
    '',
  ];

  return lines.join('\n');
}

/**
 * Orchestrate all captures and write a markdown timeout report.
 * Handles partial failures gracefully — if git is unavailable, stderr is still captured.
 */
export function captureTimeoutReport(opts: {
  storyKey: string;
  iteration: number;
  durationMinutes: number;
  outputFile: string;
  stateSnapshotPath: string;
}): Result<TimeoutReport> {
  try {
    if (opts.iteration < 1 || !Number.isInteger(opts.iteration)) {
      return fail(`Invalid iteration number: ${opts.iteration}`);
    }
    if (opts.durationMinutes < 0) {
      return fail(`Invalid duration: ${opts.durationMinutes}`);
    }

    const timestamp = new Date().toISOString();

    // Capture git diff — graceful degradation
    const gitResult = captureGitDiff();
    const gitDiff = gitResult.success ? gitResult.data : `(unavailable: ${gitResult.error})`;

    // Capture state delta — graceful degradation
    const statePath = join(process.cwd(), 'sprint-state.json');
    const deltaResult = captureStateDelta(opts.stateSnapshotPath, statePath);
    const stateDelta = deltaResult.success ? deltaResult.data : `(unavailable: ${deltaResult.error})`;

    // Capture partial stderr — graceful degradation
    const stderrResult = capturePartialStderr(opts.outputFile);
    const partialStderr = stderrResult.success ? stderrResult.data : `(unavailable: ${stderrResult.error})`;

    const capture: TimeoutCapture = {
      storyKey: opts.storyKey,
      iteration: opts.iteration,
      durationMinutes: opts.durationMinutes,
      gitDiff,
      stateDelta,
      partialStderr,
      timestamp,
    };

    // Write report file — sanitize story key for safe filenames
    const reportDir = join(process.cwd(), 'ralph', 'logs');
    const safeStoryKey = opts.storyKey.replace(/[^a-zA-Z0-9._-]/g, '_');
    const reportFileName = `timeout-report-${opts.iteration}-${safeStoryKey}.md`;
    const reportPath = join(reportDir, reportFileName);

    // Ensure directory exists
    if (!existsSync(reportDir)) {
      mkdirSync(reportDir, { recursive: true });
    }

    const reportContent = formatReport(capture);
    writeFileSync(reportPath, reportContent, 'utf-8');

    return ok({
      filePath: reportPath,
      capture,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Failed to capture timeout report: ${msg}`);
  }
}

/**
 * Find the latest timeout report for a given story key.
 * Scans ralph/logs/ for timeout-report-<N>-<storyKey>.md files,
 * parses the report to extract summary info.
 * Returns null if no timeout report exists.
 */
export function findLatestTimeoutReport(storyKey: string): Result<TimeoutSummary | null> {
  try {
    const reportDir = join(process.cwd(), 'ralph', 'logs');
    if (!existsSync(reportDir)) {
      return ok(null);
    }

    const safeStoryKey = storyKey.replace(/[^a-zA-Z0-9._-]/g, '_');
    const prefix = `timeout-report-`;
    const suffix = `-${safeStoryKey}.md`;

    const files = readdirSync(reportDir, { encoding: 'utf-8' });
    const matches: Array<{ fileName: string; iteration: number }> = [];

    for (const f of files) {
      if (f.startsWith(prefix) && f.endsWith(suffix)) {
        const iterStr = f.slice(prefix.length, f.length - suffix.length);
        const iteration = parseInt(iterStr, 10);
        if (!isNaN(iteration) && iteration > 0) {
          matches.push({ fileName: f, iteration });
        }
      }
    }

    if (matches.length === 0) {
      return ok(null);
    }

    // Pick the highest iteration
    matches.sort((a, b) => b.iteration - a.iteration);
    const latest = matches[0];
    const reportPath = join(reportDir, latest.fileName);

    // Parse the report to extract duration and files changed count
    const content = readFileSync(reportPath, 'utf-8');
    let durationMinutes = 0;
    let filesChanged = 0;

    const durationMatch = content.match(/\*\*Duration:\*\*\s*(\d+)\s*minutes/);
    if (durationMatch) {
      durationMinutes = parseInt(durationMatch[1], 10);
    }

    // Count "file changed" or "files changed" lines in git diff stat
    const filesMatch = content.match(/(\d+)\s+files?\s+changed/g);
    if (filesMatch) {
      for (const m of filesMatch) {
        const numMatch = m.match(/^(\d+)/);
        if (numMatch) {
          filesChanged += parseInt(numMatch[1], 10);
        }
      }
    }

    return ok({
      reportPath,
      iteration: latest.iteration,
      durationMinutes,
      filesChanged,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Failed to find timeout report: ${msg}`);
  }
}
