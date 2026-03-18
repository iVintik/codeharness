/**
 * Dev module orchestrator — invokes BMAD dev-story workflow via child_process.
 * Returns Result<DevResult>, never throws.
 */

import { execFileSync, execSync } from 'node:child_process';
import { ok, fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type { DevResult } from './types.js';

/** Default timeout: 25 minutes */
const DEFAULT_TIMEOUT_MS = 1_500_000;

/** Max lines of output to keep */
const MAX_OUTPUT_LINES = 200;

/** Git command timeout in milliseconds */
const GIT_TIMEOUT_MS = 5000;

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
 * Capture list of changed files via git diff --name-only.
 * Returns empty array on failure.
 */
function captureFilesChanged(): string[] {
  try {
    const unstaged = execSync('git diff --name-only', {
      timeout: GIT_TIMEOUT_MS,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const staged = execSync('git diff --cached --name-only', {
      timeout: GIT_TIMEOUT_MS,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const untracked = execSync('git ls-files --others --exclude-standard', {
      timeout: GIT_TIMEOUT_MS,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const allFiles = new Set<string>();
    for (const block of [unstaged, staged, untracked]) {
      if (block) {
        for (const f of block.split('\n')) {
          if (f.trim()) allFiles.add(f.trim());
        }
      }
    }
    return [...allFiles];
  } catch {
    return [];
  }
}

/**
 * Count test files in a list of changed file paths.
 */
function countTestFiles(files: string[]): number {
  return files.filter(
    (f) => f.includes('.test.') || f.includes('.spec.') || f.includes('__tests__'),
  ).length;
}

/**
 * Determine if an error is a timeout error from child_process.
 */
function isTimeoutError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as Record<string, unknown>;
  return e['killed'] === true || e['signal'] === 'SIGTERM';
}

/**
 * Invoke the BMAD dev-story workflow for a given story key.
 * Uses child_process.execFileSync with a configurable timeout.
 * Returns Result<DevResult> — never throws.
 */
export function invokeBmadDevStory(
  key: string,
  opts?: { timeoutMs?: number },
): Result<DevResult> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startTime = Date.now();

  try {
    const stdout = execFileSync(
      'claude',
      [
        '--print',
        `Run /bmad-dev-story for the story at _bmad-output/implementation-artifacts/${key}.md — implement all tasks, write tests, and mark the story done.`,
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
    const filesChanged = captureFilesChanged();
    const testsAdded = countTestFiles(filesChanged);

    return ok({
      key,
      filesChanged,
      testsAdded,
      duration,
      output,
    });
  } catch (err: unknown) {
    const duration = Date.now() - startTime;

    if (isTimeoutError(err)) {
      const filesChanged = captureFilesChanged();
      const testsAdded = countTestFiles(filesChanged);
      const errObj = err as Record<string, unknown>;
      const stderr = typeof errObj['stderr'] === 'string' ? errObj['stderr'] : '';
      const stdout = typeof errObj['stdout'] === 'string' ? errObj['stdout'] : '';
      const combinedOutput = truncateOutput(
        (stdout + '\n' + stderr).trim(),
        MAX_OUTPUT_LINES,
      );

      return fail(
        `timeout: dev workflow exceeded ${Math.round(timeoutMs / 1000)}s for story ${key} (ran ${Math.round(duration / 1000)}s)`,
        {
          key,
          filesChanged,
          testsAdded,
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
    const filesChanged = captureFilesChanged();
    const testsAdded = countTestFiles(filesChanged);

    const errorMsg = exitCode !== null
      ? `dev workflow failed with exit code ${exitCode} for story ${key}: ${msg}`
      : `dev workflow failed for story ${key}: ${msg}`;

    return fail(errorMsg, {
      key,
      filesChanged,
      testsAdded,
      duration,
      output: combinedOutput,
    });
  }
}
