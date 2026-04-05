import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from 'node:child_process';
import {
  isGhAvailable,
  ghIssueCreate,
  ghIssueSearch,
  findExistingGhIssue,
  getRepoFromRemote,
  parseRepoFromUrl,
  ensureLabels,
  GitHubError,
} from '../github.js';

const mockExecFileSync = vi.mocked(execFileSync);

beforeEach(() => {
  vi.restoreAllMocks();
});

// ─── GitHubError ────────────────────────────────────────────────────────────

describe('GitHubError', () => {
  it('includes command and original message', () => {
    const err = new GitHubError('gh issue create', 'auth required');
    expect(err.message).toBe('GitHub CLI failed: auth required. Command: gh issue create');
    expect(err.name).toBe('GitHubError');
    expect(err.command).toBe('gh issue create');
    expect(err.originalMessage).toBe('auth required');
  });

  it('is an instance of Error', () => {
    const err = new GitHubError('gh', 'fail');
    expect(err).toBeInstanceOf(Error);
  });
});

// ─── isGhAvailable ──────────────────────────────────────────────────────────

describe('isGhAvailable', () => {
  it('returns true when which gh succeeds', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('/usr/local/bin/gh'));
    expect(isGhAvailable()).toBe(true);
    expect(mockExecFileSync).toHaveBeenCalledWith('which', ['gh'], expect.objectContaining({ stdio: 'pipe' }));
  });

  it('returns false when which gh fails', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not found');
    });
    expect(isGhAvailable()).toBe(false);
  });
});

// ─── ghIssueCreate ──────────────────────────────────────────────────────────

describe('ghIssueCreate', () => {
  it('creates issue and returns parsed JSON result', () => {
    const result = { number: 42, url: 'https://github.com/owner/repo/issues/42' };
    mockExecFileSync.mockReturnValue(Buffer.from(JSON.stringify(result)));

    const created = ghIssueCreate('owner/repo', 'Test title', 'Test body', ['bug', 'retro']);
    expect(created).toEqual(result);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'gh',
      ['issue', 'create', '--repo', 'owner/repo', '--title', 'Test title', '--body', 'Test body', '--label', 'bug', '--label', 'retro', '--json', 'number,url'],
      expect.objectContaining({ stdio: 'pipe', timeout: 30_000 }),
    );
  });

  it('passes no --label args when labels array is empty', () => {
    const result = { number: 1, url: 'https://github.com/o/r/issues/1' };
    mockExecFileSync.mockReturnValue(Buffer.from(JSON.stringify(result)));

    ghIssueCreate('o/r', 'title', 'body', []);
    const args = mockExecFileSync.mock.calls[0][1] as string[];
    expect(args).not.toContain('--label');
  });

  it('throws GitHubError on failure', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('auth failed');
    });
    expect(() => ghIssueCreate('o/r', 't', 'b', [])).toThrow(GitHubError);
    try {
      ghIssueCreate('o/r', 't', 'b', []);
    } catch (err) {
      const ghErr = err as GitHubError;
      expect(ghErr.originalMessage).toBe('auth failed');
    }
  });

  it('wraps non-Error throws in GitHubError', () => {
    mockExecFileSync.mockImplementation(() => {
      throw 'string error';  
    });
    expect(() => ghIssueCreate('o/r', 't', 'b', [])).toThrow(GitHubError);
  });
});

// ─── ghIssueSearch ──────────────────────────────────────────────────────────

describe('ghIssueSearch', () => {
  it('returns parsed JSON array of issues', () => {
    const issues = [{ number: 1, title: 'Test', body: 'body', url: 'https://github.com/o/r/issues/1' }];
    mockExecFileSync.mockReturnValue(Buffer.from(JSON.stringify(issues)));

    const result = ghIssueSearch('o/r', 'gap:retro');
    expect(result).toEqual(issues);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'gh',
      ['issue', 'list', '--repo', 'o/r', '--search', 'gap:retro', '--state', 'all', '--json', 'number,title,body,url,labels'],
      expect.objectContaining({ stdio: 'pipe' }),
    );
  });

  it('returns empty array for empty output', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    expect(ghIssueSearch('o/r', 'query')).toEqual([]);
  });

  it('throws GitHubError on failure', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('network error');
    });
    expect(() => ghIssueSearch('o/r', 'q')).toThrow(GitHubError);
  });

  it('wraps non-Error throws in GitHubError', () => {
    mockExecFileSync.mockImplementation(() => {
      throw 'string error';  
    });
    expect(() => ghIssueSearch('o/r', 'q')).toThrow(GitHubError);
  });
});

// ─── findExistingGhIssue ────────────────────────────────────────────────────

describe('findExistingGhIssue', () => {
  it('returns issue when gap-id found in body', () => {
    const issues = [
      { number: 5, title: 'Test', body: 'some text\n<!-- gap-id: [gap:retro:epic-9-item-A1] -->', url: 'u' },
    ];
    mockExecFileSync.mockReturnValue(Buffer.from(JSON.stringify(issues)));

    const result = findExistingGhIssue('o/r', '[gap:retro:epic-9-item-A1]');
    expect(result).toBeDefined();
    expect(result!.number).toBe(5);
  });

  it('returns undefined when no match in body', () => {
    const issues = [
      { number: 5, title: 'Test', body: 'no gap id here', url: 'u' },
    ];
    mockExecFileSync.mockReturnValue(Buffer.from(JSON.stringify(issues)));

    const result = findExistingGhIssue('o/r', '[gap:retro:epic-9-item-A1]');
    expect(result).toBeUndefined();
  });

  it('returns undefined when issue body is null', () => {
    const issues = [
      { number: 5, title: 'Test', body: null as unknown as string, url: 'u' },
    ];
    mockExecFileSync.mockReturnValue(Buffer.from(JSON.stringify(issues)));

    const result = findExistingGhIssue('o/r', '[gap:retro:epic-9-item-A1]');
    expect(result).toBeUndefined();
  });

  it('returns undefined on search failure (does not throw)', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('network');
    });
    const result = findExistingGhIssue('o/r', 'gap-id');
    expect(result).toBeUndefined();
  });
});

// ─── getRepoFromRemote ──────────────────────────────────────────────────────

describe('getRepoFromRemote', () => {
  it('parses HTTPS URL with .git suffix', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('https://github.com/owner/repo.git\n'));
    expect(getRepoFromRemote()).toBe('owner/repo');
  });

  it('parses HTTPS URL without .git suffix', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('https://github.com/owner/repo\n'));
    expect(getRepoFromRemote()).toBe('owner/repo');
  });

  it('parses SSH URL with .git suffix', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('git@github.com:owner/repo.git\n'));
    expect(getRepoFromRemote()).toBe('owner/repo');
  });

  it('parses SSH URL without .git suffix', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('git@github.com:owner/repo\n'));
    expect(getRepoFromRemote()).toBe('owner/repo');
  });

  it('returns undefined on failure', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('no remote');
    });
    expect(getRepoFromRemote()).toBeUndefined();
  });
});

// ─── parseRepoFromUrl ───────────────────────────────────────────────────────

describe('parseRepoFromUrl', () => {
  it('handles HTTPS with .git', () => {
    expect(parseRepoFromUrl('https://github.com/iVintik/codeharness.git')).toBe('iVintik/codeharness');
  });

  it('handles HTTPS without .git', () => {
    expect(parseRepoFromUrl('https://github.com/iVintik/codeharness')).toBe('iVintik/codeharness');
  });

  it('handles SSH with .git', () => {
    expect(parseRepoFromUrl('git@github.com:iVintik/codeharness.git')).toBe('iVintik/codeharness');
  });

  it('handles SSH without .git', () => {
    expect(parseRepoFromUrl('git@github.com:iVintik/codeharness')).toBe('iVintik/codeharness');
  });

  it('returns undefined for unrecognized URL format', () => {
    expect(parseRepoFromUrl('not-a-url')).toBeUndefined();
  });
});

// ─── ensureLabels ───────────────────────────────────────────────────────────

describe('ensureLabels', () => {
  it('calls gh label create for each label', () => {
    mockExecFileSync.mockClear();
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    ensureLabels('o/r', ['bug', 'retro-finding']);

    expect(mockExecFileSync).toHaveBeenCalledTimes(2);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'gh',
      ['label', 'create', 'bug', '--repo', 'o/r'],
      expect.objectContaining({ stdio: 'pipe' }),
    );
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'gh',
      ['label', 'create', 'retro-finding', '--repo', 'o/r'],
      expect.objectContaining({ stdio: 'pipe' }),
    );
  });

  it('ignores errors (label may already exist)', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('already exists');
    });
    // Should not throw
    expect(() => ensureLabels('o/r', ['existing-label'])).not.toThrow();
  });

  it('handles empty labels array', () => {
    mockExecFileSync.mockClear();
    ensureLabels('o/r', []);
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });
});
