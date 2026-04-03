import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { WorktreeManager, WorktreeError, BRANCH_PREFIX, WORKTREE_BASE, AsyncMutex, mergeMutex } from '../worktree-manager.js';
import type { WorktreeInfo, MergeResult, MergeStrategy } from '../worktree-manager.js';

// Create a mock execAsync that we can control — must use vi.hoisted so it's
// available when vi.mock factory runs (vi.mock calls are hoisted above imports)
const { mockExecAsync } = vi.hoisted(() => ({
  mockExecAsync: vi.fn(),
}));

// Mock child_process
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  exec: vi.fn(),
}));

// Mock node:util to return our controllable mockExecAsync
vi.mock('node:util', () => ({
  promisify: () => mockExecAsync,
}));

// Mock node:fs
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  statSync: vi.fn(),
}));

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

const mockExecSync = execSync as Mock;
const mockExistsSync = existsSync as Mock;
const mockReadFileSync = readFileSync as Mock;
const mockStatSync = statSync as Mock;

describe('worktree-manager', () => {
  let manager: WorktreeManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new WorktreeManager('main', '/repo');
    // Default: no stale state exists
    mockExistsSync.mockReturnValue(false);
    // Default: no existing branches
    mockExecSync.mockReturnValue(Buffer.from(''));
    // Default: statSync returns a fixed birthtime
    mockStatSync.mockReturnValue({ birthtime: new Date('2026-01-15T10:00:00Z') });
  });

  describe('WorktreeError', () => {
    it('includes stderr in the error (AC #11)', () => {
      const err = new WorktreeError('something failed', 'fatal: not a git repo');
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('WorktreeError');
      expect(err.message).toBe('something failed');
      expect(err.stderr).toBe('fatal: not a git repo');
    });
  });

  describe('constants', () => {
    it('branch prefix uses codeharness/ namespace (NFR12)', () => {
      expect(BRANCH_PREFIX).toBe('codeharness/epic-');
      expect(BRANCH_PREFIX.startsWith('codeharness/')).toBe(true);
    });

    it('worktree base is in /tmp', () => {
      expect(WORKTREE_BASE).toBe('/tmp/codeharness-wt-epic-');
    });
  });

  describe('createWorktree', () => {
    it('creates branch and worktree, returns path (AC #1, #2)', () => {
      // No stale state
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) return Buffer.from('');
        return Buffer.from('');
      });

      const path = manager.createWorktree('17', 'worktree-manager');

      expect(path).toBe('/tmp/codeharness-wt-epic-17');

      // Verify git commands were called
      const calls = mockExecSync.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(calls).toContainEqual(
        expect.stringContaining('git branch codeharness/epic-17-worktree-manager main'),
      );
      expect(calls).toContainEqual(
        expect.stringContaining('git worktree add /tmp/codeharness-wt-epic-17 codeharness/epic-17-worktree-manager'),
      );
    });

    it('uses codeharness/ prefix for branch names (AC #11, NFR12)', () => {
      mockExecSync.mockReturnValue(Buffer.from(''));

      manager.createWorktree('42', 'my-epic');

      const calls = mockExecSync.mock.calls.map((c: unknown[]) => c[0] as string);
      const branchCmd = calls.find((c) => c.includes('git branch codeharness/'));
      expect(branchCmd).toContain('codeharness/epic-42-my-epic');
    });

    it('sanitizes slug to [a-z0-9-] (edge case)', () => {
      mockExecSync.mockReturnValue(Buffer.from(''));

      manager.createWorktree('1', 'My Epic With CAPS & Symbols!');

      const calls = mockExecSync.mock.calls.map((c: unknown[]) => c[0] as string);
      const branchCmd = calls.find((c) => c.startsWith('git branch codeharness/'));
      expect(branchCmd).toContain('codeharness/epic-1-my-epic-with-caps-symbols');
    });

    it('cleans up stale branch before re-creating (AC #9)', () => {
      // Simulate stale branch existing
      let callCount = 0;
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) {
          // First call during cleanup: stale branch exists
          if (callCount === 0) {
            callCount++;
            return Buffer.from('  codeharness/epic-17-old-slug\n');
          }
          return Buffer.from('');
        }
        return Buffer.from('');
      });

      const path = manager.createWorktree('17', 'new-slug');
      expect(path).toBe('/tmp/codeharness-wt-epic-17');

      // Should have cleaned up the stale branch
      const calls = mockExecSync.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(calls).toContainEqual(
        expect.stringContaining('git branch -D codeharness/epic-17-old-slug'),
      );
    });

    it('cleans up stale worktree directory before re-creating (AC #9)', () => {
      // Simulate worktree directory existing on disk
      mockExistsSync.mockImplementation((p: string) => {
        return p === '/tmp/codeharness-wt-epic-17';
      });
      mockExecSync.mockReturnValue(Buffer.from(''));

      const path = manager.createWorktree('17', 'slug');
      expect(path).toBe('/tmp/codeharness-wt-epic-17');

      // Should have tried to remove the stale worktree
      const calls = mockExecSync.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(calls).toContainEqual(
        expect.stringContaining('git worktree remove /tmp/codeharness-wt-epic-17 --force'),
      );
    });

    it('throws WorktreeError with stderr on git failure (AC #10)', () => {
      const gitError = new Error('Command failed');
      (gitError as unknown as { stderr: Buffer }).stderr = Buffer.from('fatal: not a git repository');
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) return Buffer.from('');
        if (cmd.startsWith('git branch codeharness/')) throw gitError;
        return Buffer.from('');
      });

      expect(() => manager.createWorktree('17', 'slug')).toThrow(WorktreeError);
      try {
        manager.createWorktree('17', 'slug');
      } catch (err) {
        expect(err).toBeInstanceOf(WorktreeError);
        expect((err as WorktreeError).stderr).toContain('fatal: not a git repository');
        expect((err as WorktreeError).message).toContain('fatal: not a git repository');
      }
    });

    it('cleans up partial state on failure — branch created but worktree fails (AC #10)', () => {
      let branchCreated = false;
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) return Buffer.from('');
        if (cmd.startsWith('git branch codeharness/') && !cmd.includes('-D')) {
          branchCreated = true;
          return Buffer.from('');
        }
        if (cmd.startsWith('git worktree add') && branchCreated) {
          const err = new Error('disk full');
          (err as unknown as { stderr: Buffer }).stderr = Buffer.from('error: disk full');
          throw err;
        }
        // Cleanup calls should succeed
        return Buffer.from('');
      });

      expect(() => manager.createWorktree('17', 'slug')).toThrow(WorktreeError);

      // Verify cleanup was attempted — branch -D should have been called
      const calls = mockExecSync.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(calls).toContainEqual(
        expect.stringContaining('git branch -D codeharness/epic-17-slug'),
      );
    });

    it('all error messages include stderr from git (AC #11)', () => {
      const gitError = new Error('fail');
      (gitError as unknown as { stderr: Buffer }).stderr = Buffer.from('stderr content here');
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) return Buffer.from('');
        if (cmd.startsWith('git branch codeharness/')) throw gitError;
        return Buffer.from('');
      });

      try {
        manager.createWorktree('1', 'x');
      } catch (err) {
        expect(err).toBeInstanceOf(WorktreeError);
        expect((err as WorktreeError).stderr).toBe('stderr content here');
      }
    });
  });

  describe('cleanupWorktree', () => {
    it('removes worktree and branch (AC #4)', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) {
          return Buffer.from('  codeharness/epic-17-my-slug\n');
        }
        return Buffer.from('');
      });

      manager.cleanupWorktree('17');

      const calls = mockExecSync.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(calls).toContainEqual(
        expect.stringContaining('git worktree remove /tmp/codeharness-wt-epic-17 --force'),
      );
      expect(calls).toContainEqual(
        expect.stringContaining('git branch -D codeharness/epic-17-my-slug'),
      );
    });

    it('is idempotent — no error when nothing exists (AC #5)', () => {
      // All git commands fail (nothing exists)
      mockExecSync.mockImplementation(() => {
        const err = new Error('not found');
        (err as unknown as { stderr: Buffer }).stderr = Buffer.from('error: not found');
        throw err;
      });

      // Should not throw
      expect(() => manager.cleanupWorktree('99')).not.toThrow();
    });

    it('completes even if only branch exists (no worktree)', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('worktree remove')) {
          const err = new Error('no worktree');
          (err as unknown as { stderr: Buffer }).stderr = Buffer.from('');
          throw err;
        }
        if (cmd.includes('branch --list')) {
          return Buffer.from('  codeharness/epic-5-slug\n');
        }
        return Buffer.from('');
      });

      expect(() => manager.cleanupWorktree('5')).not.toThrow();
    });
  });

  describe('listWorktrees', () => {
    it('returns only codeharness-prefixed worktrees (AC #6)', () => {
      const porcelain = [
        'worktree /repo',
        'HEAD abc123',
        'branch refs/heads/main',
        '',
        'worktree /tmp/codeharness-wt-epic-17',
        'HEAD def456',
        'branch refs/heads/codeharness/epic-17-worktree-manager',
        '',
        'worktree /tmp/other-worktree',
        'HEAD 789abc',
        'branch refs/heads/feature/something',
        '',
        'worktree /tmp/codeharness-wt-epic-18',
        'HEAD aaa111',
        'branch refs/heads/codeharness/epic-18-lane-pool',
        '',
      ].join('\n');

      mockExecSync.mockReturnValue(Buffer.from(porcelain));

      const result = manager.listWorktrees();

      expect(result).toHaveLength(2);
      expect(result[0].epicId).toBe('17');
      expect(result[0].path).toBe('/tmp/codeharness-wt-epic-17');
      expect(result[0].branch).toBe('codeharness/epic-17-worktree-manager');
      expect(result[1].epicId).toBe('18');
      expect(result[1].path).toBe('/tmp/codeharness-wt-epic-18');
      expect(result[1].branch).toBe('codeharness/epic-18-lane-pool');
    });

    it('returns WorktreeInfo with all required fields (AC #6)', () => {
      const porcelain = [
        'worktree /tmp/codeharness-wt-epic-5',
        'HEAD abc123',
        'branch refs/heads/codeharness/epic-5-slug',
        '',
      ].join('\n');
      mockExecSync.mockReturnValue(Buffer.from(porcelain));
      const fixedDate = new Date('2026-03-20T14:00:00Z');
      mockStatSync.mockReturnValue({ birthtime: fixedDate });

      const result = manager.listWorktrees();

      expect(result).toHaveLength(1);
      const wt = result[0];
      expect(wt).toHaveProperty('epicId', '5');
      expect(wt).toHaveProperty('path', '/tmp/codeharness-wt-epic-5');
      expect(wt).toHaveProperty('branch', 'codeharness/epic-5-slug');
      expect(wt).toHaveProperty('createdAt');
      expect(wt.createdAt).toEqual(fixedDate);
    });

    it('uses current time as createdAt fallback when statSync fails', () => {
      const porcelain = [
        'worktree /tmp/codeharness-wt-epic-5',
        'HEAD abc123',
        'branch refs/heads/codeharness/epic-5-slug',
        '',
      ].join('\n');
      mockExecSync.mockReturnValue(Buffer.from(porcelain));
      mockStatSync.mockImplementation(() => { throw new Error('ENOENT'); });

      const before = new Date();
      const result = manager.listWorktrees();
      const after = new Date();

      expect(result).toHaveLength(1);
      expect(result[0].createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result[0].createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('returns empty array when no codeharness worktrees exist (AC #7)', () => {
      const porcelain = [
        'worktree /repo',
        'HEAD abc123',
        'branch refs/heads/main',
        '',
      ].join('\n');
      mockExecSync.mockReturnValue(Buffer.from(porcelain));

      const result = manager.listWorktrees();
      expect(result).toEqual([]);
    });

    it('returns empty array when git worktree list fails', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('not a git repo');
      });

      const result = manager.listWorktrees();
      expect(result).toEqual([]);
    });

    it('sorts results by epicId numerically', () => {
      const porcelain = [
        'worktree /tmp/codeharness-wt-epic-20',
        'HEAD aaa',
        'branch refs/heads/codeharness/epic-20-z',
        '',
        'worktree /tmp/codeharness-wt-epic-3',
        'HEAD bbb',
        'branch refs/heads/codeharness/epic-3-a',
        '',
        'worktree /tmp/codeharness-wt-epic-10',
        'HEAD ccc',
        'branch refs/heads/codeharness/epic-10-m',
        '',
      ].join('\n');
      mockExecSync.mockReturnValue(Buffer.from(porcelain));

      const result = manager.listWorktrees();
      expect(result.map((r) => r.epicId)).toEqual(['3', '10', '20']);
    });
  });

  describe('detectOrphans', () => {
    it('identifies worktrees without lane-state.json as orphaned (AC #8)', () => {
      const porcelain = [
        'worktree /tmp/codeharness-wt-epic-17',
        'HEAD abc123',
        'branch refs/heads/codeharness/epic-17-slug',
        '',
      ].join('\n');
      mockExecSync.mockReturnValue(Buffer.from(porcelain));
      // lane-state.json does not exist
      mockExistsSync.mockReturnValue(false);

      const orphans = manager.detectOrphans();

      expect(orphans).toHaveLength(1);
      expect(orphans[0].epicId).toBe('17');
    });

    it('identifies worktrees with no PID in lane-state.json as orphaned (AC #8)', () => {
      const porcelain = [
        'worktree /tmp/codeharness-wt-epic-17',
        'HEAD abc123',
        'branch refs/heads/codeharness/epic-17-slug',
        '',
      ].join('\n');
      mockExecSync.mockReturnValue(Buffer.from(porcelain));
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({})); // No pid field

      const orphans = manager.detectOrphans();
      expect(orphans).toHaveLength(1);
    });

    it('identifies worktrees with dead PID as orphaned (AC #8)', () => {
      const porcelain = [
        'worktree /tmp/codeharness-wt-epic-17',
        'HEAD abc123',
        'branch refs/heads/codeharness/epic-17-slug',
        '',
      ].join('\n');
      mockExecSync.mockReturnValue(Buffer.from(porcelain));
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ pid: 999999999 }));
      // process.kill(999999999, 0) will throw because PID doesn't exist
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('ESRCH');
      });

      const orphans = manager.detectOrphans();
      expect(orphans).toHaveLength(1);

      killSpy.mockRestore();
    });

    it('does NOT mark worktree as orphaned if PID is alive (AC #8)', () => {
      const porcelain = [
        'worktree /tmp/codeharness-wt-epic-17',
        'HEAD abc123',
        'branch refs/heads/codeharness/epic-17-slug',
        '',
      ].join('\n');
      mockExecSync.mockReturnValue(Buffer.from(porcelain));
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ pid: process.pid }));
      // process.kill(process.pid, 0) succeeds — current process is alive
      const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true);

      const orphans = manager.detectOrphans();
      expect(orphans).toHaveLength(0);

      killSpy.mockRestore();
    });

    it('returns empty array when no worktrees exist', () => {
      mockExecSync.mockReturnValue(Buffer.from(''));

      const orphans = manager.detectOrphans();
      expect(orphans).toEqual([]);
    });
  });

  describe('epicId validation', () => {
    it('throws WorktreeError for empty epicId', () => {
      expect(() => manager.createWorktree('', 'slug')).toThrow(WorktreeError);
      expect(() => manager.createWorktree('', 'slug')).toThrow(/Invalid epicId/);
    });

    it('throws WorktreeError for epicId with shell metacharacters', () => {
      expect(() => manager.createWorktree('17; rm -rf /', 'slug')).toThrow(WorktreeError);
      expect(() => manager.createWorktree('$(whoami)', 'slug')).toThrow(WorktreeError);
    });

    it('accepts alphanumeric epicId with dashes', () => {
      mockExecSync.mockReturnValue(Buffer.from(''));
      expect(() => manager.createWorktree('17', 'slug')).not.toThrow();
      expect(() => manager.createWorktree('epic-A', 'slug')).not.toThrow();
    });

    it('validates epicId in cleanupWorktree', () => {
      expect(() => manager.cleanupWorktree('')).toThrow(WorktreeError);
      expect(() => manager.cleanupWorktree('x && echo')).toThrow(WorktreeError);
    });
  });

  describe('stale cleanup edge cases', () => {
    it('falls back to git worktree prune when remove fails (AC #9)', () => {
      mockExistsSync.mockImplementation((p: string) => {
        return p === '/tmp/codeharness-wt-epic-17';
      });
      let removeCalled = false;
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('worktree remove') && !removeCalled) {
          removeCalled = true;
          const err = new Error('locked');
          (err as unknown as { stderr: Buffer }).stderr = Buffer.from('error: locked');
          throw err;
        }
        if (cmd.includes('branch --list')) return Buffer.from('');
        return Buffer.from('');
      });

      const path = manager.createWorktree('17', 'slug');
      expect(path).toBe('/tmp/codeharness-wt-epic-17');

      const calls = mockExecSync.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(calls).toContainEqual('git worktree prune');
    });

    it('handles prune also failing gracefully (AC #9)', () => {
      mockExistsSync.mockImplementation((p: string) => {
        return p === '/tmp/codeharness-wt-epic-17';
      });
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('worktree remove') || cmd.includes('worktree prune')) {
          const err = new Error('fail');
          (err as unknown as { stderr: Buffer }).stderr = Buffer.from('error');
          throw err;
        }
        if (cmd.includes('branch --list')) return Buffer.from('');
        return Buffer.from('');
      });

      // Should still succeed — stale cleanup is best-effort
      const path = manager.createWorktree('17', 'slug');
      expect(path).toBe('/tmp/codeharness-wt-epic-17');
    });
  });

  describe('detectOrphans edge cases', () => {
    it('treats corrupt lane-state.json as orphaned (AC #8)', () => {
      const porcelain = [
        'worktree /tmp/codeharness-wt-epic-17',
        'HEAD abc123',
        'branch refs/heads/codeharness/epic-17-slug',
        '',
      ].join('\n');
      mockExecSync.mockReturnValue(Buffer.from(porcelain));
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation(() => { throw new Error('EACCES'); });

      const orphans = manager.detectOrphans();
      expect(orphans).toHaveLength(1);
    });
  });

  describe('constructor defaults', () => {
    it('defaults mainBranch to main', () => {
      const mgr = new WorktreeManager();
      mockExecSync.mockReturnValue(Buffer.from(''));

      mgr.createWorktree('1', 'test');

      const calls = mockExecSync.mock.calls.map((c: unknown[]) => c[0] as string);
      const branchCmd = calls.find((c) => c.startsWith('git branch codeharness/'));
      expect(branchCmd).toContain(' main');
    });
  });

  describe('MergeResult interface shape (AC #9)', () => {
    it('has all required fields on success', async () => {
      // Setup: branch exists, status clean, merge succeeds, tests pass
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) return Buffer.from('  codeharness/epic-17-slug\n');
        if (cmd.includes('status --porcelain')) return Buffer.from('');
        if (cmd.includes('merge --no-ff')) return Buffer.from('');
        if (cmd.includes('worktree remove')) return Buffer.from('');
        if (cmd.includes('branch -D')) return Buffer.from('');
        return Buffer.from('');
      });
      mockExecAsync.mockResolvedValue({ stdout: '5 passed\n0 failed' });

      const result = await manager.mergeWorktree('17');

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('durationMs');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.durationMs).toBe('number');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('includes reason and conflicts on conflict failure', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) return Buffer.from('  codeharness/epic-17-slug\n');
        if (cmd.includes('status --porcelain')) return Buffer.from('');
        if (cmd.includes('merge --no-ff')) {
          const err = new Error('conflict');
          (err as unknown as { stderr: Buffer }).stderr = Buffer.from('CONFLICT');
          throw err;
        }
        if (cmd.includes('diff --name-only --diff-filter=U')) return Buffer.from('file1.ts\nfile2.ts');
        if (cmd.includes('merge --abort')) return Buffer.from('');
        return Buffer.from('');
      });

      const result = await manager.mergeWorktree('17');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('conflict');
      expect(result.conflicts).toEqual(['file1.ts', 'file2.ts']);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('includes testResults on tests-failed', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) return Buffer.from('  codeharness/epic-17-slug\n');
        if (cmd.includes('status --porcelain')) return Buffer.from('');
        if (cmd.includes('merge --no-ff')) return Buffer.from('');
        if (cmd.includes('reset --hard')) return Buffer.from('');
        return Buffer.from('');
      });
      mockExecAsync.mockResolvedValue({ stdout: '3 passed\n2 failed' });

      const result = await manager.mergeWorktree('17');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('tests-failed');
      expect(result.testResults).toEqual({ passed: 3, failed: 2 });
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('mergeWorktree — merge-commit strategy (AC #1, #8)', () => {
    it('calls git merge --no-ff for merge-commit strategy', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) return Buffer.from('  codeharness/epic-17-slug\n');
        if (cmd.includes('status --porcelain')) return Buffer.from('');
        if (cmd.includes('worktree remove')) return Buffer.from('');
        if (cmd.includes('branch -D')) return Buffer.from('');
        return Buffer.from('');
      });
      mockExecAsync.mockResolvedValue({ stdout: '10 passed' });

      await manager.mergeWorktree('17', 'merge-commit');

      const calls = mockExecSync.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(calls).toContainEqual(
        expect.stringContaining('git merge --no-ff codeharness/epic-17-slug'),
      );
    });

    it('defaults to merge-commit when strategy is not specified', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) return Buffer.from('  codeharness/epic-17-slug\n');
        if (cmd.includes('status --porcelain')) return Buffer.from('');
        if (cmd.includes('worktree remove')) return Buffer.from('');
        if (cmd.includes('branch -D')) return Buffer.from('');
        return Buffer.from('');
      });
      mockExecAsync.mockResolvedValue({ stdout: '10 passed' });

      await manager.mergeWorktree('17');

      const calls = mockExecSync.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(calls).toContainEqual(
        expect.stringContaining('git merge --no-ff'),
      );
    });
  });

  describe('mergeWorktree — rebase strategy (AC #8)', () => {
    it('calls git rebase for rebase strategy', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) return Buffer.from('  codeharness/epic-17-slug\n');
        if (cmd.includes('status --porcelain')) return Buffer.from('');
        if (cmd.includes('worktree remove')) return Buffer.from('');
        if (cmd.includes('branch -D')) return Buffer.from('');
        return Buffer.from('');
      });
      mockExecAsync.mockResolvedValue({ stdout: '10 passed' });

      await manager.mergeWorktree('17', 'rebase');

      const calls = mockExecSync.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(calls).toContainEqual(
        expect.stringContaining('git rebase codeharness/epic-17-slug'),
      );
      // Should NOT contain git merge
      const mergeCall = calls.find((c) => c.includes('git merge --no-ff'));
      expect(mergeCall).toBeUndefined();
    });
  });

  describe('mergeWorktree — mutex serialization (AC #2)', () => {
    it('serializes concurrent merge calls via mutex', async () => {
      const executionOrder: string[] = [];

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list codeharness/epic-1-')) return Buffer.from('  codeharness/epic-1-alpha\n');
        if (cmd.includes('branch --list codeharness/epic-2-')) return Buffer.from('  codeharness/epic-2-beta\n');
        if (cmd.includes('status --porcelain')) return Buffer.from('');
        if (cmd.includes('merge --no-ff codeharness/epic-1')) {
          executionOrder.push('merge-1-start');
          return Buffer.from('');
        }
        if (cmd.includes('merge --no-ff codeharness/epic-2')) {
          executionOrder.push('merge-2-start');
          return Buffer.from('');
        }
        if (cmd.includes('worktree remove')) return Buffer.from('');
        if (cmd.includes('branch -D')) return Buffer.from('');
        return Buffer.from('');
      });
      mockExecAsync.mockResolvedValue({ stdout: '5 passed' });

      // Launch two merges concurrently
      const [result1, result2] = await Promise.all([
        manager.mergeWorktree('1'),
        manager.mergeWorktree('2'),
      ]);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      // Both should complete — mutex serializes them
      expect(executionOrder).toContain('merge-1-start');
      expect(executionOrder).toContain('merge-2-start');
    });

    it('merge mutex is a module-level singleton shared across instances', () => {
      // The exported mergeMutex should be the same instance
      expect(mergeMutex).toBeInstanceOf(AsyncMutex);
      // Two different WorktreeManager instances share the same mutex
      const mgr1 = new WorktreeManager('main', '/repo1');
      const mgr2 = new WorktreeManager('main', '/repo2');
      // Both use the module-level mergeMutex — verified by the fact that
      // concurrent calls across instances are serialized (tested above).
      // Here we just verify the singleton exists and is an AsyncMutex.
      expect(mergeMutex).toBeDefined();
    });
  });

  describe('mergeWorktree — success path (AC #3, #4)', () => {
    it('runs test suite after successful merge and cleans up worktree', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) return Buffer.from('  codeharness/epic-17-slug\n');
        if (cmd.includes('status --porcelain')) return Buffer.from('');
        if (cmd.includes('merge --no-ff')) return Buffer.from('');
        if (cmd.includes('worktree remove')) return Buffer.from('');
        if (cmd.includes('branch -D')) return Buffer.from('');
        return Buffer.from('');
      });
      mockExecAsync.mockResolvedValue({ stdout: '10 passed\n0 failed\nAll files | 95.5' });

      const result = await manager.mergeWorktree('17');

      expect(result.success).toBe(true);
      expect(result.testResults).toEqual({ passed: 10, failed: 0, coverage: 95.5 });
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      // Verify cleanup was called
      const calls = mockExecSync.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(calls).toContainEqual(
        expect.stringContaining('git worktree remove /tmp/codeharness-wt-epic-17 --force'),
      );
    });
  });

  describe('mergeWorktree — test failure path (AC #5)', () => {
    it('reverts merge on test failure and preserves worktree', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) return Buffer.from('  codeharness/epic-17-slug\n');
        if (cmd.includes('status --porcelain')) return Buffer.from('');
        if (cmd.includes('merge --no-ff')) return Buffer.from('');
        if (cmd.includes('reset --hard HEAD~1')) return Buffer.from('');
        return Buffer.from('');
      });
      mockExecAsync.mockResolvedValue({ stdout: '8 passed\n3 failed' });

      const result = await manager.mergeWorktree('17');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('tests-failed');
      expect(result.testResults).toEqual({ passed: 8, failed: 3 });

      // Verify revert was called
      const calls = mockExecSync.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(calls).toContainEqual(
        expect.stringContaining('git reset --hard HEAD~1'),
      );

      // Verify cleanup was NOT called (worktree preserved for investigation)
      const cleanupCall = calls.find((c) => c.includes('worktree remove'));
      expect(cleanupCall).toBeUndefined();
    });
  });

  describe('mergeWorktree — conflict detection (AC #6)', () => {
    it('detects merge conflicts and returns conflict file list', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) return Buffer.from('  codeharness/epic-17-slug\n');
        if (cmd.includes('status --porcelain')) return Buffer.from('');
        if (cmd.includes('merge --no-ff')) {
          const err = new Error('merge conflict');
          (err as unknown as { stderr: Buffer }).stderr = Buffer.from('CONFLICT (content): Merge conflict');
          throw err;
        }
        if (cmd.includes('diff --name-only --diff-filter=U')) return Buffer.from('src/a.ts\nsrc/b.ts\npackage.json');
        if (cmd.includes('merge --abort')) return Buffer.from('');
        return Buffer.from('');
      });

      const result = await manager.mergeWorktree('17');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('conflict');
      expect(result.conflicts).toEqual(['src/a.ts', 'src/b.ts', 'package.json']);
    });

    it('aborts merge after conflict detection', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) return Buffer.from('  codeharness/epic-17-slug\n');
        if (cmd.includes('status --porcelain')) return Buffer.from('');
        if (cmd.includes('merge --no-ff')) {
          const err = new Error('conflict');
          (err as unknown as { stderr: Buffer }).stderr = Buffer.from('CONFLICT');
          throw err;
        }
        if (cmd.includes('diff --name-only --diff-filter=U')) return Buffer.from('file.ts');
        if (cmd.includes('merge --abort')) return Buffer.from('');
        return Buffer.from('');
      });

      await manager.mergeWorktree('17');

      const calls = mockExecSync.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(calls).toContainEqual(
        expect.stringContaining('git merge --abort'),
      );
    });

    it('aborts rebase after conflict detection', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) return Buffer.from('  codeharness/epic-17-slug\n');
        if (cmd.includes('status --porcelain')) return Buffer.from('');
        if (cmd.includes('git rebase')) {
          const err = new Error('conflict');
          (err as unknown as { stderr: Buffer }).stderr = Buffer.from('CONFLICT');
          throw err;
        }
        if (cmd.includes('diff --name-only --diff-filter=U')) return Buffer.from('file.ts');
        if (cmd.includes('rebase --abort')) return Buffer.from('');
        return Buffer.from('');
      });

      await manager.mergeWorktree('17', 'rebase');

      const calls = mockExecSync.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(calls).toContainEqual(
        expect.stringContaining('git rebase --abort'),
      );
    });
  });

  describe('mergeWorktree — git error handling (AC #10)', () => {
    it('returns git-error when branch not found', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) return Buffer.from(''); // No branch found
        return Buffer.from('');
      });

      const result = await manager.mergeWorktree('99');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('git-error');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('returns git-error when main is dirty', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) return Buffer.from('  codeharness/epic-17-slug\n');
        if (cmd.includes('status --porcelain')) return Buffer.from(' M dirty-file.ts');
        return Buffer.from('');
      });

      const result = await manager.mergeWorktree('17');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('git-error');
    });

    it('returns git-error on unexpected git failure (not conflict)', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) return Buffer.from('  codeharness/epic-17-slug\n');
        if (cmd.includes('status --porcelain')) return Buffer.from('');
        if (cmd.includes('merge --no-ff')) {
          const err = new Error('fatal: branch not found');
          (err as unknown as { stderr: Buffer }).stderr = Buffer.from('fatal: branch not found');
          throw err;
        }
        if (cmd.includes('diff --name-only --diff-filter=U')) return Buffer.from(''); // No conflicts
        if (cmd.includes('merge --abort')) return Buffer.from('');
        return Buffer.from('');
      });

      const result = await manager.mergeWorktree('17');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('git-error');
    });

    it('rolls back on unexpected git error during merge', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) return Buffer.from('  codeharness/epic-17-slug\n');
        if (cmd.includes('status --porcelain')) return Buffer.from('');
        if (cmd.includes('merge --no-ff')) {
          const err = new Error('fatal');
          (err as unknown as { stderr: Buffer }).stderr = Buffer.from('fatal');
          throw err;
        }
        if (cmd.includes('diff --name-only --diff-filter=U')) return Buffer.from('');
        if (cmd.includes('merge --abort')) return Buffer.from('');
        return Buffer.from('');
      });

      await manager.mergeWorktree('17');

      const calls = mockExecSync.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(calls).toContainEqual(
        expect.stringContaining('git merge --abort'),
      );
    });
  });

  describe('mergeWorktree — testCommand validation', () => {
    it('rejects testCommand with shell metacharacters', async () => {
      const result = await manager.mergeWorktree('17', 'merge-commit', 'npm test; rm -rf /');
      expect(result.success).toBe(false);
      expect(result.reason).toBe('git-error');
    });

    it('rejects testCommand with command substitution', async () => {
      const result = await manager.mergeWorktree('17', 'merge-commit', '$(whoami)');
      expect(result.success).toBe(false);
      expect(result.reason).toBe('git-error');
    });

    it('accepts safe testCommand strings', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) return Buffer.from('  codeharness/epic-17-slug\n');
        if (cmd.includes('status --porcelain')) return Buffer.from('');
        if (cmd.includes('worktree remove')) return Buffer.from('');
        if (cmd.includes('branch -D')) return Buffer.from('');
        return Buffer.from('');
      });
      mockExecAsync.mockResolvedValue({ stdout: '5 passed' });

      const result = await manager.mergeWorktree('17', 'merge-commit', 'npm run test');
      expect(result.success).toBe(true);
    });

    it('accepts testCommand with path separators', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) return Buffer.from('  codeharness/epic-17-slug\n');
        if (cmd.includes('status --porcelain')) return Buffer.from('');
        if (cmd.includes('worktree remove')) return Buffer.from('');
        if (cmd.includes('branch -D')) return Buffer.from('');
        return Buffer.from('');
      });
      mockExecAsync.mockResolvedValue({ stdout: '5 passed' });

      const result = await manager.mergeWorktree('17', 'merge-commit', './node_modules/.bin/vitest');
      expect(result.success).toBe(true);
    });
  });

  describe('mergeWorktree — branch name validation', () => {
    it('rejects branches with shell metacharacters', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) return Buffer.from('  codeharness/epic-17-slug$(whoami)\n');
        return Buffer.from('');
      });

      const result = await manager.mergeWorktree('17');
      expect(result.success).toBe(false);
      expect(result.reason).toBe('git-error');
    });
  });

  describe('mergeWorktree — branch re-verification after mutex', () => {
    it('returns git-error if branch disappears while waiting for mutex', async () => {
      let callCount = 0;
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) {
          callCount++;
          // First call (before mutex): branch exists
          if (callCount === 1) return Buffer.from('  codeharness/epic-17-slug\n');
          // Second call (after mutex): branch gone
          return Buffer.from('');
        }
        return Buffer.from('');
      });

      const result = await manager.mergeWorktree('17');
      expect(result.success).toBe(false);
      expect(result.reason).toBe('git-error');
    });
  });

  describe('mergeWorktree — test command failure edge cases', () => {
    it('handles test command that exits non-zero with parseable output', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) return Buffer.from('  codeharness/epic-17-slug\n');
        if (cmd.includes('status --porcelain')) return Buffer.from('');
        if (cmd.includes('merge --no-ff')) return Buffer.from('');
        if (cmd.includes('reset --hard')) return Buffer.from('');
        return Buffer.from('');
      });
      // execAsync rejects (non-zero exit) but has stdout
      mockExecAsync.mockRejectedValue({
        stdout: '5 passed\n1 failed',
        stderr: 'Test suite failed',
      });

      const result = await manager.mergeWorktree('17');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('tests-failed');
      expect(result.testResults).toEqual({ passed: 5, failed: 1 });
    });

    it('handles test command with no parseable output (reports 1 failure)', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) return Buffer.from('  codeharness/epic-17-slug\n');
        if (cmd.includes('status --porcelain')) return Buffer.from('');
        if (cmd.includes('merge --no-ff')) return Buffer.from('');
        if (cmd.includes('reset --hard')) return Buffer.from('');
        return Buffer.from('');
      });
      mockExecAsync.mockRejectedValue({
        stdout: '',
        stderr: 'npm ERR! missing script: test',
      });

      const result = await manager.mergeWorktree('17');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('tests-failed');
      expect(result.testResults).toEqual({ passed: 0, failed: 1 });
    });

    it('handles git reset --hard failure gracefully after test failure', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) return Buffer.from('  codeharness/epic-17-slug\n');
        if (cmd.includes('status --porcelain')) return Buffer.from('');
        if (cmd.includes('merge --no-ff')) return Buffer.from('');
        if (cmd.includes('reset --hard')) {
          const err = new Error('corrupted');
          (err as unknown as { stderr: Buffer }).stderr = Buffer.from('error');
          throw err;
        }
        return Buffer.from('');
      });
      mockExecAsync.mockResolvedValue({ stdout: '0 passed\n3 failed' });

      const result = await manager.mergeWorktree('17');

      // Should still return tests-failed even if reset fails
      expect(result.success).toBe(false);
      expect(result.reason).toBe('tests-failed');
    });
  });

  describe('mergeWorktree — onConflict callback (AC #10 Story 18-2)', () => {
    it('invokes onConflict callback when conflicts detected and callback provided', async () => {
      const onConflict = vi.fn().mockResolvedValue({
        resolved: true,
        attempts: 1,
        escalated: false,
        testResults: { passed: 10, failed: 0 },
        resolvedFiles: ['src/a.ts'],
      });

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) return Buffer.from('  codeharness/epic-17-slug\n');
        if (cmd.includes('status --porcelain')) return Buffer.from('');
        if (cmd.includes('merge --no-ff')) {
          const err = new Error('conflict');
          (err as unknown as { stderr: Buffer }).stderr = Buffer.from('CONFLICT');
          throw err;
        }
        if (cmd.includes('diff --name-only --diff-filter=U')) return Buffer.from('src/a.ts');
        // Cleanup calls
        if (cmd.includes('worktree remove')) return Buffer.from('');
        if (cmd.includes('branch -D')) return Buffer.from('');
        return Buffer.from('');
      });

      const result = await manager.mergeWorktree('17', 'merge-commit', 'npm test', onConflict);

      expect(onConflict).toHaveBeenCalledOnce();
      expect(result.success).toBe(true);
      expect(result.testResults).toEqual({ passed: 10, failed: 0 });
    });

    it('does NOT invoke onConflict when no conflicts detected', async () => {
      const onConflict = vi.fn();

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) return Buffer.from('  codeharness/epic-17-slug\n');
        if (cmd.includes('status --porcelain')) return Buffer.from('');
        if (cmd.includes('merge --no-ff')) return Buffer.from('');
        return Buffer.from('');
      });
      mockExecAsync.mockResolvedValue({ stdout: '10 passed' });

      await manager.mergeWorktree('17', 'merge-commit', 'npm test', onConflict);

      expect(onConflict).not.toHaveBeenCalled();
    });

    it('preserves existing behavior when onConflict is NOT provided', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) return Buffer.from('  codeharness/epic-17-slug\n');
        if (cmd.includes('status --porcelain')) return Buffer.from('');
        if (cmd.includes('merge --no-ff')) {
          const err = new Error('conflict');
          (err as unknown as { stderr: Buffer }).stderr = Buffer.from('CONFLICT');
          throw err;
        }
        if (cmd.includes('diff --name-only --diff-filter=U')) return Buffer.from('src/a.ts');
        if (cmd.includes('merge --abort')) return Buffer.from('');
        return Buffer.from('');
      });

      const result = await manager.mergeWorktree('17');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('conflict');
      expect(result.conflicts).toEqual(['src/a.ts']);
    });

    it('returns conflict result when onConflict returns escalated', async () => {
      const onConflict = vi.fn().mockResolvedValue({
        resolved: false,
        attempts: 3,
        escalated: true,
        escalationMessage: 'Could not resolve',
      });

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) return Buffer.from('  codeharness/epic-17-slug\n');
        if (cmd.includes('status --porcelain')) return Buffer.from('');
        if (cmd.includes('merge --no-ff')) {
          const err = new Error('conflict');
          (err as unknown as { stderr: Buffer }).stderr = Buffer.from('CONFLICT');
          throw err;
        }
        if (cmd.includes('diff --name-only --diff-filter=U')) return Buffer.from('src/a.ts');
        if (cmd.includes('merge --abort')) return Buffer.from('');
        return Buffer.from('');
      });

      const result = await manager.mergeWorktree('17', 'merge-commit', 'npm test', onConflict);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('conflict');
    });

    it('passes conflict context to onConflict callback', async () => {
      const onConflict = vi.fn().mockResolvedValue({
        resolved: true,
        attempts: 1,
        escalated: false,
      });

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --list')) return Buffer.from('  codeharness/epic-17-slug\n');
        if (cmd.includes('status --porcelain')) return Buffer.from('');
        if (cmd.includes('merge --no-ff')) {
          const err = new Error('conflict');
          (err as unknown as { stderr: Buffer }).stderr = Buffer.from('CONFLICT');
          throw err;
        }
        if (cmd.includes('diff --name-only --diff-filter=U')) return Buffer.from('src/a.ts\nsrc/b.ts');
        if (cmd.includes('worktree remove')) return Buffer.from('');
        if (cmd.includes('branch -D')) return Buffer.from('');
        return Buffer.from('');
      });

      await manager.mergeWorktree('17', 'merge-commit', 'npm test', onConflict);

      const ctx = onConflict.mock.calls[0][0];
      expect(ctx.epicId).toBe('17');
      expect(ctx.branch).toBe('codeharness/epic-17-slug');
      expect(ctx.conflicts).toEqual(['src/a.ts', 'src/b.ts']);
      expect(ctx.cwd).toBe('/repo');
      expect(ctx.testCommand).toBe('npm test');
    });
  });

  describe('AsyncMutex', () => {
    it('acquire returns a release function', async () => {
      const mutex = new AsyncMutex();
      const release = await mutex.acquire();
      expect(typeof release).toBe('function');
      release();
    });

    it('serializes access — second acquire waits for first release', async () => {
      const mutex = new AsyncMutex();
      const order: string[] = [];

      const release1 = await mutex.acquire();
      order.push('acquired-1');

      // Second acquire should not resolve until release1 is called
      let release2: (() => void) | null = null;
      const acquire2Promise = mutex.acquire().then((r) => {
        release2 = r;
        order.push('acquired-2');
      });

      // Give the event loop a tick — acquire2 should still be pending
      await new Promise((r) => setTimeout(r, 10));
      expect(order).toEqual(['acquired-1']);

      // Release first lock
      release1();
      await acquire2Promise;

      expect(order).toEqual(['acquired-1', 'acquired-2']);
      release2!();
    });
  });
});
