import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { WorktreeManager, WorktreeError, BRANCH_PREFIX, WORKTREE_BASE } from '../worktree-manager.js';
import type { WorktreeInfo } from '../worktree-manager.js';

// Mock child_process
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
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
});
