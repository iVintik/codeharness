/**
 * Worktree Manager.
 *
 * Handles git worktree lifecycle for parallel epic execution:
 * create, cleanup, list, and orphan detection. Each epic gets
 * its own git worktree on a dedicated branch under the
 * `codeharness/` namespace.
 *
 * @see Story 17-1: Worktree Manager
 * @see Story 18-2: Merge Agent for Conflict Resolution (onConflict callback)
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { ConflictResolutionResult } from './merge-agent.js';
import { validateMerge } from './cross-worktree-validator.js';

/**
 * Partial conflict context that mergeWorktree can fill from its own state.
 * The onConflict callback receives this and enriches it with driver/descriptions
 * before calling the merge agent.
 */
export interface MergeConflictInfo {
  readonly epicId: string;
  readonly branch: string;
  readonly conflicts: string[];
  readonly cwd: string;
  readonly testCommand: string;
}

// --- Constants ---

/** Branch prefix for all codeharness worktree branches. */
export const BRANCH_PREFIX = 'codeharness/epic-';

/** Base path for worktree directories in /tmp. */
export const WORKTREE_BASE = '/tmp/codeharness-wt-epic-';

// --- Interfaces ---

/**
 * Information about a codeharness worktree.
 */
export interface WorktreeInfo {
  /** Epic identifier extracted from the branch name. */
  readonly epicId: string;
  /** Absolute path to the worktree directory. */
  readonly path: string;
  /** Full branch name (e.g., `codeharness/epic-17-worktree-manager`). */
  readonly branch: string;
  /** Timestamp when the worktree was created. */
  readonly createdAt: Date;
}

// --- Error Class ---

/**
 * Error thrown by worktree operations. Includes stderr from git commands.
 */
export class WorktreeError extends Error {
  /** Raw stderr output from the failed git command. */
  readonly stderr: string;

  constructor(message: string, stderr: string) {
    super(message);
    this.name = 'WorktreeError';
    this.stderr = stderr;
  }
}

// --- Merge Types ---

/**
 * Strategy used when merging an epic branch into main.
 */
export type MergeStrategy = 'rebase' | 'merge-commit';

/**
 * Result of a merge operation.
 */
export interface MergeResult {
  /** Whether the merge and post-merge validation succeeded. */
  success: boolean;
  /** Reason for failure, if any. */
  reason?: 'conflict' | 'tests-failed' | 'git-error';
  /** List of conflicting file paths, when reason is 'conflict'. */
  conflicts?: string[];
  /** Test suite results from post-merge validation. */
  testResults?: { passed: number; failed: number; coverage: number | null };
  /** Total wall-clock duration of the merge operation in milliseconds. */
  durationMs: number;
}

// --- Async Mutex ---

/**
 * Simple async mutex for serializing merge operations.
 * No external dependencies — uses a promise-based wait queue.
 */
export class AsyncMutex {
  private locked = false;
  private waitQueue: Array<() => void> = [];

  async acquire(): Promise<() => void> {
    while (this.locked) {
      await new Promise<void>((resolve) => this.waitQueue.push(resolve));
    }
    this.locked = true;
    return () => {
      this.locked = false;
      const next = this.waitQueue.shift();
      if (next) next();
    };
  }
}

/** Module-level singleton merge mutex shared across all WorktreeManager instances. */
export const mergeMutex = new AsyncMutex();

/**
 * Callback invoked when merge conflicts are detected.
 * Receives partial conflict info (what mergeWorktree knows), returns resolution result.
 * The caller enriches this with driver and descriptions before calling the merge agent.
 */
export type OnConflictCallback = (info: MergeConflictInfo) => Promise<ConflictResolutionResult>;

// --- WorktreeManager Class ---

/**
 * Manages git worktrees for parallel epic execution.
 *
 * Creates isolated working directories (worktrees) for each epic,
 * each on its own branch under the `codeharness/` namespace.
 */
export class WorktreeManager {
  private readonly mainBranch: string;
  private readonly cwd: string;

  /**
   * @param mainBranch  The main branch to base new worktree branches on (default: `'main'`).
   * @param cwd  The git repository root directory (default: `process.cwd()`).
   */
  constructor(mainBranch: string = 'main', cwd?: string) {
    this.mainBranch = mainBranch;
    this.cwd = cwd ?? process.cwd();
  }

  /**
   * Create a worktree for a parallel epic.
   *
   * Creates a branch `codeharness/epic-{epicId}-{slug}` from the main branch HEAD,
   * then creates a git worktree at `/tmp/codeharness-wt-epic-{epicId}`.
   *
   * If a stale branch or worktree exists from a previous crashed run,
   * it is cleaned up before re-creating (idempotent recovery).
   *
   * @param epicId  The epic identifier (numeric or string).
   * @param slug  A human-readable slug for the branch name (sanitized to `[a-z0-9-]`).
   * @returns The absolute path to the created worktree directory.
   * @throws {WorktreeError} If the git command fails.
   */
  createWorktree(epicId: string, slug: string): string {
    this.validateEpicId(epicId);
    const sanitizedSlug = this.sanitizeSlug(slug);
    const branchName = `${BRANCH_PREFIX}${epicId}-${sanitizedSlug}`;
    const worktreePath = `${WORKTREE_BASE}${epicId}`;

    // Clean up stale state from previous crashed runs (AC #9)
    this.cleanupStale(epicId, branchName, worktreePath);

    let branchCreated = false;
    try {
      // Create branch from main branch HEAD
      this.execGit(`git branch ${branchName} ${this.mainBranch}`);
      branchCreated = true;

      // Create worktree
      this.execGit(`git worktree add ${worktreePath} ${branchName}`);

      return worktreePath;
    } catch (err: unknown) {
      // Clean up partial state on failure (AC #10)
      this.cleanupPartial(branchCreated, branchName, worktreePath);

      // execGit always wraps errors as WorktreeError; re-throw directly
      if (err instanceof WorktreeError) {
        throw err;
      }

      // Defensive: handle unexpected non-WorktreeError (should not happen)
      const message = err instanceof Error ? err.message : String(err);
      throw new WorktreeError(
        `Failed to create worktree for epic ${epicId}: ${message}`,
        '',
      );
    }
  }

  /**
   * Remove a worktree and its branch for an epic.
   *
   * Idempotent: completes without error if the worktree or branch
   * does not exist (AC #5).
   *
   * @param epicId  The epic identifier.
   */
  cleanupWorktree(epicId: string): void {
    this.validateEpicId(epicId);
    const worktreePath = `${WORKTREE_BASE}${epicId}`;

    // Remove worktree (ignore errors if it doesn't exist)
    try {
      this.execGit(`git worktree remove ${worktreePath} --force`);
    } catch { // IGNORE: idempotent cleanup — worktree may not exist per AC #5
    }

    // Find and delete the branch matching this epicId
    const branch = this.findBranchForEpic(epicId);
    if (branch) {
      try {
        this.execGit(`git branch -D ${branch}`);
      } catch { // IGNORE: idempotent cleanup — branch may not exist per AC #5
      }
    }
  }

  /**
   * List all codeharness worktrees.
   *
   * @returns An array of `WorktreeInfo` objects sorted by epicId.
   *          Returns an empty array when no codeharness worktrees exist.
   */
  listWorktrees(): WorktreeInfo[] {
    let output: string;
    try {
      output = this.execGit('git worktree list --porcelain');
    } catch { // IGNORE: non-git-repo or corrupt state returns empty list safely
      return [];
    }

    const entries = this.parsePorcelainOutput(output);
    return entries
      .filter((e) => e.branch.startsWith(`refs/heads/${BRANCH_PREFIX}`))
      .map((e) => {
        const branchName = e.branch.replace('refs/heads/', '');
        const epicId = this.extractEpicId(branchName);
        return {
          epicId,
          path: e.path,
          branch: branchName,
          createdAt: this.getWorktreeCreatedAt(e.path),
        };
      })
      .sort((a, b) => a.epicId.localeCompare(b.epicId, undefined, { numeric: true }));
  }

  /**
   * Detect orphaned worktrees from previous crashed runs.
   *
   * A worktree is considered orphaned if its directory exists on disk
   * but has no `.codeharness/lane-state.json` file or the file has
   * no active PID.
   *
   * @returns An array of orphaned `WorktreeInfo` entries.
   */
  detectOrphans(): WorktreeInfo[] {
    const worktrees = this.listWorktrees();
    return worktrees.filter((wt) => this.isOrphaned(wt));
  }

  /**
   * Merge an epic branch into the main branch with serialized access.
   *
   * Acquires a module-level mutex so only one merge runs at a time.
   * After a clean merge, runs the test suite. If tests fail, the merge
   * is reverted. On conflict or git error, the main branch is restored.
   *
   * @param epicId  The epic identifier whose branch should be merged.
   * @param strategy  Merge strategy: `'merge-commit'` (default) or `'rebase'`.
   * @param testCommand  Command to run for post-merge validation (default: `'npm test'`).
   * @returns A `MergeResult` describing the outcome.
   */
  async mergeWorktree(
    epicId: string,
    strategy: MergeStrategy = 'merge-commit',
    testCommand: string = 'npm test',
    onConflict?: OnConflictCallback,
  ): Promise<MergeResult> {
    const start = Date.now();

    // Validate testCommand to prevent shell injection — only allow safe characters
    if (!/^[a-zA-Z0-9_./ -]+$/.test(testCommand)) {
      return {
        success: false,
        reason: 'git-error',
        durationMs: Date.now() - start,
      };
    }

    // Find branch for this epicId
    const branch = this.findBranchForEpic(epicId);
    if (!branch) {
      return {
        success: false,
        reason: 'git-error',
        durationMs: Date.now() - start,
      };
    }

    // Validate branch name to prevent command injection via malicious branch names
    if (!/^[a-zA-Z0-9_./-]+$/.test(branch)) {
      return {
        success: false,
        reason: 'git-error',
        durationMs: Date.now() - start,
      };
    }

    const release = await mergeMutex.acquire();
    try {
      // Re-verify branch still exists after acquiring mutex (could be deleted while waiting)
      const branchCheck = this.findBranchForEpic(epicId);
      if (!branchCheck || branchCheck !== branch) {
        return {
          success: false,
          reason: 'git-error',
          durationMs: Date.now() - start,
        };
      }

      // Verify main branch is clean before merge
      const status = this.execGit('git status --porcelain');
      if (status.length > 0) {
        return {
          success: false,
          reason: 'git-error',
          durationMs: Date.now() - start,
        };
      }

      // Attempt merge or rebase
      try {
        if (strategy === 'rebase') {
          this.execGit(`git rebase ${branch}`);
        } else {
          this.execGit(`git merge --no-ff ${branch}`);
        }
      } catch { // IGNORE: merge/rebase failure is expected — detect conflict vs git-error below
        const conflicts = this.detectConflicts();
        if (conflicts.length > 0) {
          // If onConflict callback is provided, invoke the merge agent
          if (onConflict) {
            const result = await onConflict({
              epicId,
              branch,
              conflicts,
              cwd: this.cwd,
              testCommand,
            });
            if (result.resolved) {
              // Agent resolved and committed — cleanup worktree
              this.cleanupWorktree(epicId);
              return {
                success: true,
                testResults: result.testResults,
                durationMs: Date.now() - start,
              };
            }
            // Escalated — abort merge, preserve worktree
            this.abortMerge(strategy);
            return {
              success: false,
              reason: 'conflict',
              conflicts,
              durationMs: Date.now() - start,
            };
          }
          // No callback — existing behavior
          this.abortMerge(strategy);
          return {
            success: false,
            reason: 'conflict',
            conflicts,
            durationMs: Date.now() - start,
          };
        }
        // Not a conflict — unexpected git error
        this.abortMerge(strategy);
        return {
          success: false,
          reason: 'git-error',
          durationMs: Date.now() - start,
        };
      }

      // Run test suite after successful merge via cross-worktree validator
      const validation = await validateMerge({
        testCommand,
        cwd: this.cwd,
        epicId,
        writeTelemetry: true,
      });
      if (!validation.valid) {
        // Revert merge on test failure
        try {
          this.execGit('git reset --hard HEAD~1');
        } catch { // IGNORE: reset failure indicates corrupted git state; still return tests-failed
        }
        return {
          success: false,
          reason: 'tests-failed',
          testResults: validation.testResults,
          durationMs: Date.now() - start,
        };
      }

      // Success — cleanup worktree
      this.cleanupWorktree(epicId);
      return {
        success: true,
        testResults: validation.testResults,
        durationMs: Date.now() - start,
      };
    } finally {
      release();
    }
  }

  // --- Private Helpers ---

  /**
   * Get the creation time of a worktree directory.
   * Falls back to current time if the directory doesn't exist or stat fails.
   */
  private getWorktreeCreatedAt(worktreePath: string): Date {
    try {
      const stats = statSync(worktreePath);
      return stats.birthtime;
    } catch { // IGNORE: stat failure — worktree dir may not be accessible; fall back to now
      return new Date();
    }
  }

  /**
   * Validate epicId contains only safe characters `[a-zA-Z0-9-]`.
   * Prevents command injection via crafted epicId values.
   */
  private validateEpicId(epicId: string): void {
    if (!epicId || !/^[a-zA-Z0-9-]+$/.test(epicId)) {
      throw new WorktreeError(
        `Invalid epicId: "${epicId}" — must be non-empty and contain only [a-zA-Z0-9-]`,
        '',
      );
    }
  }

  /**
   * Sanitize a slug to contain only `[a-z0-9-]`.
   */
  private sanitizeSlug(slug: string): string {
    return slug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Execute a git command and return its stdout.
   * Wraps errors in WorktreeError with captured stderr.
   */
  private execGit(cmd: string): string {
    try {
      const result = execSync(cmd, {
        cwd: this.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30_000,
      });
      return result.toString().trim();
    } catch (err: unknown) {
      const stderr = (err as { stderr?: Buffer })?.stderr?.toString() ?? '';
      throw new WorktreeError(`Git command failed: ${cmd} — ${stderr}`, stderr);
    }
  }

  /**
   * Clean up stale branch and worktree from a previous crash (AC #9).
   */
  private cleanupStale(epicId: string, branchName: string, worktreePath: string): void {
    // Check if worktree path exists on disk
    if (existsSync(worktreePath)) {
      try {
        this.execGit(`git worktree remove ${worktreePath} --force`);
      } catch { // IGNORE: stale worktree removal is best-effort before re-create per AC #9
        try {
          this.execGit('git worktree prune');
        } catch { // IGNORE: prune is best-effort fallback for stale worktree cleanup
        }
      }
    }

    // Check if branch already exists
    const existingBranch = this.findBranchForEpic(epicId);
    if (existingBranch) {
      try {
        this.execGit(`git branch -D ${existingBranch}`);
      } catch { // IGNORE: stale branch deletion is best-effort before re-create per AC #9
      }
    }
  }

  /**
   * Clean up partial state after a failed createWorktree (AC #10).
   */
  private cleanupPartial(branchCreated: boolean, branchName: string, worktreePath: string): void {
    // Try to remove worktree if it was partially created
    try {
      this.execGit(`git worktree remove ${worktreePath} --force`);
    } catch { // IGNORE: partial worktree may not exist during failure cleanup per AC #10
    }

    // Delete branch if it was created
    if (branchCreated) {
      try {
        this.execGit(`git branch -D ${branchName}`);
      } catch { // IGNORE: partial branch may not exist during failure cleanup per AC #10
      }
    }
  }

  /**
   * Find a branch matching `codeharness/epic-{epicId}-*`.
   */
  private findBranchForEpic(epicId: string): string | undefined {
    try {
      const output = this.execGit(`git branch --list ${BRANCH_PREFIX}${epicId}-*`);
      const branches = output
        .split('\n')
        .map((b) => b.trim().replace(/^\*\s*/, ''))
        .filter((b) => b.length > 0);
      return branches[0];
    } catch { // IGNORE: branch listing failure means no branch exists — safe to return undefined
      return undefined;
    }
  }

  /**
   * Parse `git worktree list --porcelain` output into structured entries.
   */
  private parsePorcelainOutput(output: string): Array<{ path: string; branch: string }> {
    if (!output.trim()) return [];

    const blocks = output.split('\n\n').filter((b) => b.trim());
    const entries: Array<{ path: string; branch: string }> = [];

    for (const block of blocks) {
      const lines = block.split('\n');
      let path = '';
      let branch = '';

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          path = line.slice('worktree '.length);
        } else if (line.startsWith('branch ')) {
          branch = line.slice('branch '.length);
        }
      }

      if (path && branch) {
        entries.push({ path, branch });
      }
    }

    return entries;
  }

  /**
   * Extract epicId from a branch name like `codeharness/epic-17-slug`.
   */
  private extractEpicId(branchName: string): string {
    const withoutPrefix = branchName.slice(BRANCH_PREFIX.length);
    const dashIndex = withoutPrefix.indexOf('-');
    if (dashIndex === -1) return withoutPrefix;
    return withoutPrefix.slice(0, dashIndex);
  }

  /**
   * Detect conflicting files after a failed merge/rebase.
   * Uses `git diff --name-only --diff-filter=U` to find unmerged paths.
   */
  private detectConflicts(): string[] {
    try {
      const output = this.execGit('git diff --name-only --diff-filter=U');
      return output
        .split('\n')
        .map((f) => f.trim())
        .filter((f) => f.length > 0);
    } catch { // IGNORE: diff failure means no conflict info available
      return [];
    }
  }

  /**
   * Abort an in-progress merge or rebase to restore main branch state.
   */
  private abortMerge(strategy: MergeStrategy): void {
    try {
      if (strategy === 'rebase') {
        this.execGit('git rebase --abort');
      } else {
        this.execGit('git merge --abort');
      }
    } catch { // IGNORE: abort may fail if merge already resolved; main state is preserved
    }
  }

  /**
   * Check if a worktree is orphaned (no active codeharness process).
   */
  private isOrphaned(wt: WorktreeInfo): boolean {
    const laneStatePath = join(wt.path, '.codeharness', 'lane-state.json');

    if (!existsSync(laneStatePath)) {
      return true;
    }

    try {
      const content = readFileSync(laneStatePath, 'utf-8');
      const state = JSON.parse(content) as { pid?: number };

      if (!state.pid) {
        return true;
      }

      // Check if the PID is still running
      try {
        process.kill(state.pid, 0);
        return false; // Process is alive — not orphaned
      } catch { // IGNORE: ESRCH means process is dead — worktree is orphaned per AC #8
        return true;
      }
    } catch { // IGNORE: unreadable/corrupt lane-state.json means orphaned per AC #8
      return true;
    }
  }
}
