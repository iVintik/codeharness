/**
 * GitHub CLI (`gh`) wrapper for creating issues from retro findings.
 * All external calls wrapped in try/catch, throwing GitHubError on failure.
 * Uses `gh` CLI via execFileSync per architecture Decision 10.
 */

import { execFileSync } from 'node:child_process';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GhIssue {
  number: number;
  title: string;
  body: string;
  url: string;
}

export interface RetroIssueTarget {
  repo: string;
  labels: string[];
}

export class GitHubError extends Error {
  constructor(
    public readonly command: string,
    public readonly originalMessage: string,
  ) {
    super(`GitHub CLI failed: ${originalMessage}. Command: ${command}`);
    this.name = 'GitHubError';
  }
}

// ─── gh CLI availability ────────────────────────────────────────────────────

/**
 * Checks if `gh` CLI is available on the system.
 */
export function isGhAvailable(): boolean {
  try {
    execFileSync('which', ['gh'], { stdio: 'pipe', timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

// ─── Issue creation ─────────────────────────────────────────────────────────

/**
 * Creates a GitHub issue on the given repo.
 * Returns the created issue's number and URL.
 */
export function ghIssueCreate(
  repo: string,
  title: string,
  body: string,
  labels: string[],
): { number: number; url: string } {
  const args = ['issue', 'create', '--repo', repo, '--title', title, '--body', body];
  for (const label of labels) {
    args.push('--label', label);
  }
  args.push('--json', 'number,url');

  const cmdStr = `gh ${args.join(' ')}`;
  try {
    const output = execFileSync('gh', args, {
      stdio: 'pipe',
      timeout: 30_000,
    });
    const result = JSON.parse(output.toString().trim()) as { number: number; url: string };
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new GitHubError(cmdStr, message);
  }
}

// ─── Issue search ───────────────────────────────────────────────────────────

/**
 * Searches for issues on the given repo matching the query string.
 */
export function ghIssueSearch(repo: string, query: string): GhIssue[] {
  const args = ['issue', 'list', '--repo', repo, '--search', query, '--state', 'all', '--json', 'number,title,body,url'];
  const cmdStr = `gh ${args.join(' ')}`;

  try {
    const output = execFileSync('gh', args, {
      stdio: 'pipe',
      timeout: 30_000,
    });
    const text = output.toString().trim();
    if (!text) return [];
    return JSON.parse(text) as GhIssue[];
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new GitHubError(cmdStr, message);
  }
}

// ─── Dedup search ───────────────────────────────────────────────────────────

/**
 * Finds an existing GitHub issue whose body contains the given gap-id string.
 */
export function findExistingGhIssue(repo: string, gapId: string): GhIssue | undefined {
  try {
    const issues = ghIssueSearch(repo, gapId);
    return issues.find(issue => issue.body?.includes(gapId));
  } catch {
    // Search failure should not block — treat as "not found"
    return undefined;
  }
}

// ─── Repo detection ─────────────────────────────────────────────────────────

/**
 * Detects the `owner/repo` from the current git remote origin URL.
 * Supports both HTTPS and SSH URL formats.
 */
export function getRepoFromRemote(): string | undefined {
  try {
    const output = execFileSync('git', ['remote', 'get-url', 'origin'], {
      stdio: 'pipe',
      timeout: 5_000,
    });
    const url = output.toString().trim();
    return parseRepoFromUrl(url);
  } catch {
    return undefined;
  }
}

/**
 * Parses `owner/repo` from a git remote URL.
 * Handles:
 *   - https://github.com/owner/repo.git
 *   - https://github.com/owner/repo
 *   - git@github.com:owner/repo.git
 *   - git@github.com:owner/repo
 */
export function parseRepoFromUrl(url: string): string | undefined {
  // SSH format: git@github.com:owner/repo.git
  const sshMatch = url.match(/git@[^:]+:([^/]+\/[^/]+?)(?:\.git)?$/);
  if (sshMatch) return sshMatch[1];

  // HTTPS format: https://github.com/owner/repo.git
  const httpsMatch = url.match(/https?:\/\/[^/]+\/([^/]+\/[^/]+?)(?:\.git)?$/);
  if (httpsMatch) return httpsMatch[1];

  return undefined;
}

// ─── Label management ───────────────────────────────────────────────────────

/**
 * Ensures the given labels exist on the repo.
 * Ignores failures (label may already exist).
 */
export function ensureLabels(repo: string, labels: string[]): void {
  for (const label of labels) {
    try {
      execFileSync('gh', ['label', 'create', label, '--repo', repo], {
        stdio: 'pipe',
        timeout: 10_000,
      });
    } catch {
      // Label may already exist — ignore
    }
  }
}
