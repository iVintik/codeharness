import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from 'node:child_process';
import {
  bdCommand,
  createIssue,
  getReady,
  closeIssue,
  updateIssue,
  listIssues,
  isBeadsInitialized,
  initBeads,
  detectBeadsHooks,
  configureHookCoexistence,
  buildGapId,
  findExistingByGapId,
  appendGapId,
  createOrFindIssue,
  isBeadsCLIInstalled,
  BeadsError,
  BeadsNotInstalledError,
} from '../beads.js';
import type { BeadsIssue } from '../beads.js';

const mockExecFileSync = vi.mocked(execFileSync);

let testDir: string;

beforeEach(() => {
  vi.restoreAllMocks();
  testDir = mkdtempSync(join(tmpdir(), 'ch-beads-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('BeadsError', () => {
  it('includes command and original message in error message', () => {
    const err = new BeadsError('bd create "test" --json', 'command not found');
    expect(err.message).toBe('Beads failed: command not found. Command: bd create "test" --json');
    expect(err.name).toBe('BeadsError');
    expect(err.command).toBe('bd create "test" --json');
    expect(err.originalMessage).toBe('command not found');
  });

  it('is an instance of Error', () => {
    const err = new BeadsError('bd init', 'failed');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('BeadsNotInstalledError', () => {
  it('has correct name and message', () => {
    const err = new BeadsNotInstalledError();
    expect(err.name).toBe('BeadsNotInstalledError');
    expect(err.message).toBe('beads CLI (bd) is not installed');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('isBeadsCLIInstalled', () => {
  it('returns true when which bd succeeds', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('/usr/local/bin/bd'));
    expect(isBeadsCLIInstalled()).toBe(true);
    expect(mockExecFileSync).toHaveBeenCalledWith('which', ['bd'], expect.objectContaining({ stdio: 'pipe' }));
  });

  it('returns false when which bd throws', () => {
    mockExecFileSync.mockImplementation(() => { throw new Error('not found'); });
    expect(isBeadsCLIInstalled()).toBe(false);
  });
});

describe('bdCommand', () => {
  it('runs bd with given args and parses JSON output', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('{"id":"1","title":"test"}'));
    const result = bdCommand(['create', 'test', '--json']);
    expect(mockExecFileSync).toHaveBeenCalledWith('bd', ['create', 'test', '--json'], {
      stdio: 'pipe',
      timeout: 30_000,
    });
    expect(result).toEqual({ id: '1', title: 'test' });
  });

  it('returns undefined for empty output', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    const result = bdCommand(['close', '1', '--json']);
    expect(result).toBeUndefined();
  });

  it('returns undefined for whitespace-only output', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('   \n  '));
    const result = bdCommand(['close', '1', '--json']);
    expect(result).toBeUndefined();
  });

  it('wraps errors with BeadsError including command context', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('command not found: bd');
    });
    expect(() => bdCommand(['ready', '--json'])).toThrow(BeadsError);
    try {
      bdCommand(['ready', '--json']);
    } catch (err) {
      const beadsErr = err as BeadsError;
      expect(beadsErr.message).toBe('Beads failed: command not found: bd. Command: bd ready --json');
      expect(beadsErr.command).toBe('bd ready --json');
    }
  });

  it('wraps non-Error throws with BeadsError', () => {
    mockExecFileSync.mockImplementation(() => {
      throw 'string error';
    });
    expect(() => bdCommand(['list', '--json'])).toThrow(BeadsError);
    try {
      bdCommand(['list', '--json']);
    } catch (err) {
      expect((err as BeadsError).originalMessage).toBe('string error');
    }
  });

  it('throws BeadsError on invalid JSON output with raw text in message', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('not json'));
    expect(() => bdCommand(['list', '--json'])).toThrow(BeadsError);
    try {
      bdCommand(['list', '--json']);
    } catch (err) {
      const beadsErr = err as BeadsError;
      expect(beadsErr.message).toContain('Invalid JSON output from bd: not json');
      expect(beadsErr.command).toBe('bd list --json');
    }
  });
});

describe('createIssue', () => {
  it('calls bd create with title and --json flag', () => {
    const issue = { id: '1', title: 'Test issue', status: 'open', type: 'task', priority: 2 };
    mockExecFileSync.mockReturnValue(Buffer.from(JSON.stringify(issue)));

    const result = createIssue('Test issue');
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bd',
      ['create', 'Test issue', '--json'],
      expect.objectContaining({ stdio: 'pipe' }),
    );
    expect(result).toEqual(issue);
  });

  it('passes --type option when provided', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('{"id":"1","title":"Bug","status":"open","type":"bug","priority":1}'));

    createIssue('Bug', { type: 'bug' });
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bd',
      ['create', 'Bug', '--json', '--type', 'bug'],
      expect.any(Object),
    );
  });

  it('passes --priority option when provided', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('{"id":"1","title":"Urgent","status":"open","type":"task","priority":1}'));

    createIssue('Urgent', { priority: 1 });
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bd',
      ['create', 'Urgent', '--json', '--priority', '1'],
      expect.any(Object),
    );
  });

  it('passes --description option when provided', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('{"id":"1","title":"Task","status":"open","type":"task","priority":2}'));

    createIssue('Task', { description: 'Details here' });
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bd',
      ['create', 'Task', '--json', '--description', 'Details here'],
      expect.any(Object),
    );
  });

  it('passes --dep options when deps provided', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('{"id":"3","title":"Dep task","status":"open","type":"task","priority":2}'));

    createIssue('Dep task', { deps: ['1', '2'] });
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bd',
      ['create', 'Dep task', '--json', '--dep', '1', '--dep', '2'],
      expect.any(Object),
    );
  });

  it('does not pass --dep when deps is empty array', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('{"id":"1","title":"No deps","status":"open","type":"task","priority":2}'));

    createIssue('No deps', { deps: [] });
    const args = mockExecFileSync.mock.calls[0][1] as string[];
    expect(args).not.toContain('--dep');
  });

  it('passes all options together', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('{"id":"1","title":"Full","status":"open","type":"bug","priority":1}'));

    createIssue('Full', { type: 'bug', priority: 1, description: 'desc', deps: ['0'] });
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bd',
      ['create', 'Full', '--json', '--type', 'bug', '--priority', '1', '--description', 'desc', '--dep', '0'],
      expect.any(Object),
    );
  });
});

describe('getReady', () => {
  it('calls bd ready --json and returns parsed array', () => {
    const issues = [
      { id: '1', title: 'Task 1', status: 'ready', type: 'task', priority: 1 },
      { id: '2', title: 'Task 2', status: 'ready', type: 'task', priority: 2 },
    ];
    mockExecFileSync.mockReturnValue(Buffer.from(JSON.stringify(issues)));

    const result = getReady();
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bd',
      ['ready', '--json'],
      expect.any(Object),
    );
    expect(result).toEqual(issues);
    expect(result).toHaveLength(2);
  });

  it('wraps errors from bd ready', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('bd not available');
    });
    expect(() => getReady()).toThrow(BeadsError);
  });
});

describe('closeIssue', () => {
  it('calls bd close with id and --json', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));

    closeIssue('42');
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bd',
      ['close', '42', '--json'],
      expect.any(Object),
    );
  });

  it('wraps errors from bd close', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('issue not found');
    });
    expect(() => closeIssue('999')).toThrow(BeadsError);
  });
});

describe('updateIssue', () => {
  it('calls bd update with id, --json, and --status', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));

    updateIssue('5', { status: 'in-progress' });
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bd',
      ['update', '5', '--json', '--status', 'in-progress'],
      expect.any(Object),
    );
  });

  it('passes --priority when provided', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));

    updateIssue('5', { priority: 1 });
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bd',
      ['update', '5', '--json', '--priority', '1'],
      expect.any(Object),
    );
  });

  it('passes both --status and --priority when provided', () => {
    mockExecFileSync.mockClear();
    mockExecFileSync.mockReturnValue(Buffer.from(''));

    updateIssue('5', { status: 'done', priority: 3 });
    const args = mockExecFileSync.mock.calls[0][1] as string[];
    expect(args).toContain('--status');
    expect(args).toContain('done');
    expect(args).toContain('--priority');
    expect(args).toContain('3');
  });

  it('wraps errors from bd update', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('update failed');
    });
    expect(() => updateIssue('5', { status: 'done' })).toThrow(BeadsError);
  });
});

describe('listIssues', () => {
  it('calls bd list --json and returns parsed array', () => {
    const issues = [
      { id: '1', title: 'Issue A', status: 'open', type: 'task', priority: 2 },
    ];
    mockExecFileSync.mockReturnValue(Buffer.from(JSON.stringify(issues)));

    const result = listIssues();
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bd',
      ['list', '--json'],
      expect.any(Object),
    );
    expect(result).toEqual(issues);
  });

  it('wraps errors from bd list', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('list failed');
    });
    expect(() => listIssues()).toThrow(BeadsError);
  });
});

describe('isBeadsInitialized', () => {
  it('returns true when .beads/ directory exists', () => {
    mkdirSync(join(testDir, '.beads'), { recursive: true });
    expect(isBeadsInitialized(testDir)).toBe(true);
  });

  it('returns false when .beads/ directory does not exist', () => {
    expect(isBeadsInitialized(testDir)).toBe(false);
  });
});

describe('initBeads', () => {
  it('runs bd init when .beads/ does not exist', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    initBeads(testDir);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bd',
      ['init'],
      expect.objectContaining({ cwd: testDir, stdio: 'pipe' }),
    );
  });

  it('skips bd init when .beads/ already exists', () => {
    mkdirSync(join(testDir, '.beads'), { recursive: true });
    mockExecFileSync.mockClear();
    initBeads(testDir);
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it('throws BeadsError when bd init fails', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('bd init failed');
    });
    expect(() => initBeads(testDir)).toThrow(BeadsError);
    try {
      initBeads(testDir);
    } catch (err) {
      const beadsErr = err as BeadsError;
      expect(beadsErr.command).toBe('bd init');
      expect(beadsErr.originalMessage).toBe('bd init failed');
    }
  });
});

describe('detectBeadsHooks', () => {
  it('returns hasHooks=false when .beads/hooks/ does not exist', () => {
    const result = detectBeadsHooks(testDir);
    expect(result.hasHooks).toBe(false);
    expect(result.hookTypes).toEqual([]);
  });

  it('returns hasHooks=false when .beads/hooks/ is empty', () => {
    mkdirSync(join(testDir, '.beads', 'hooks'), { recursive: true });
    const result = detectBeadsHooks(testDir);
    expect(result.hasHooks).toBe(false);
    expect(result.hookTypes).toEqual([]);
  });

  it('detects hooks in .beads/hooks/', () => {
    const hooksDir = join(testDir, '.beads', 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(join(hooksDir, 'prepare-commit-msg'), '#!/bin/sh\n');
    writeFileSync(join(hooksDir, 'post-checkout'), '#!/bin/sh\n');

    const result = detectBeadsHooks(testDir);
    expect(result.hasHooks).toBe(true);
    expect(result.hookTypes).toContain('prepare-commit-msg');
    expect(result.hookTypes).toContain('post-checkout');
    expect(result.hookTypes).toHaveLength(2);
  });

  it('returns hasHooks=false when readdirSync fails (e.g. permission error)', () => {
    // Create .beads/hooks as a file instead of directory to force readdirSync to fail
    mkdirSync(join(testDir, '.beads'), { recursive: true });
    writeFileSync(join(testDir, '.beads', 'hooks'), 'not a directory');

    const result = detectBeadsHooks(testDir);
    expect(result.hasHooks).toBe(false);
    expect(result.hookTypes).toEqual([]);
  });

  it('ignores dotfiles in .beads/hooks/', () => {
    const hooksDir = join(testDir, '.beads', 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(join(hooksDir, '.gitkeep'), '');

    const result = detectBeadsHooks(testDir);
    expect(result.hasHooks).toBe(false);
    expect(result.hookTypes).toEqual([]);
  });
});

describe('configureHookCoexistence', () => {
  it('does nothing when no beads hooks exist', () => {
    // Should not throw
    configureHookCoexistence(testDir);
  });

  it('does nothing when beads hooks exist but no .git/hooks/', () => {
    const hooksDir = join(testDir, '.beads', 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(join(hooksDir, 'prepare-commit-msg'), '#!/bin/sh\n');

    // Should not throw
    configureHookCoexistence(testDir);
  });

  it('handles case when both beads hooks and git hooks exist', () => {
    const beadsHooksDir = join(testDir, '.beads', 'hooks');
    mkdirSync(beadsHooksDir, { recursive: true });
    writeFileSync(join(beadsHooksDir, 'prepare-commit-msg'), '#!/bin/sh\n');

    const gitHooksDir = join(testDir, '.git', 'hooks');
    mkdirSync(gitHooksDir, { recursive: true });
    writeFileSync(join(gitHooksDir, 'pre-commit'), '#!/bin/sh\n');

    // Should not throw — detection and logging is the priority
    configureHookCoexistence(testDir);
  });
});

// ─── Gap-ID Functions ───────────────────────────────────────────────────────

function makeBeadsIssue(overrides: Partial<BeadsIssue> = {}): BeadsIssue {
  return {
    id: 'BEAD-1',
    title: 'Test Issue',
    status: 'open',
    type: 'task',
    priority: 1,
    ...overrides,
  };
}

describe('buildGapId', () => {
  it('returns formatted gap-id for coverage category', () => {
    expect(buildGapId('coverage', 'src/lib/scanner.ts')).toBe('[gap:coverage:src/lib/scanner.ts]');
  });

  it('returns formatted gap-id for bridge category', () => {
    expect(buildGapId('bridge', '3.2')).toBe('[gap:bridge:3.2]');
  });

  it('returns formatted gap-id for docs category', () => {
    expect(buildGapId('docs', 'ARCHITECTURE.md')).toBe('[gap:docs:ARCHITECTURE.md]');
  });

  it('returns formatted gap-id for test-failure category', () => {
    expect(buildGapId('test-failure', '2026-03-15')).toBe('[gap:test-failure:2026-03-15]');
  });

  it('returns formatted gap-id for verification category', () => {
    expect(buildGapId('verification', '4-1-test')).toBe('[gap:verification:4-1-test]');
  });
});

describe('findExistingByGapId', () => {
  it('finds matching issue by description content', () => {
    const issues = [
      makeBeadsIssue({ id: 'B-1', description: 'some text\n[gap:bridge:1.1]' }),
      makeBeadsIssue({ id: 'B-2', description: 'other\n[gap:bridge:1.2]' }),
    ];
    const result = findExistingByGapId('[gap:bridge:1.1]', issues);
    expect(result).toBeDefined();
    expect(result!.id).toBe('B-1');
  });

  it('returns undefined when no match', () => {
    const issues = [
      makeBeadsIssue({ id: 'B-1', description: '[gap:bridge:1.1]' }),
    ];
    const result = findExistingByGapId('[gap:bridge:2.1]', issues);
    expect(result).toBeUndefined();
  });

  it('ignores done issues', () => {
    const issues = [
      makeBeadsIssue({ id: 'B-1', status: 'done', description: '[gap:bridge:1.1]' }),
    ];
    const result = findExistingByGapId('[gap:bridge:1.1]', issues);
    expect(result).toBeUndefined();
  });

  it('matches open issues', () => {
    const issues = [
      makeBeadsIssue({ id: 'B-1', status: 'open', description: '[gap:bridge:1.1]' }),
    ];
    const result = findExistingByGapId('[gap:bridge:1.1]', issues);
    expect(result).toBeDefined();
  });

  it('matches in-progress issues', () => {
    const issues = [
      makeBeadsIssue({ id: 'B-1', status: 'in-progress', description: '[gap:bridge:1.1]' }),
    ];
    const result = findExistingByGapId('[gap:bridge:1.1]', issues);
    expect(result).toBeDefined();
  });

  it('returns undefined when description is undefined', () => {
    const issues = [
      makeBeadsIssue({ id: 'B-1', description: undefined }),
    ];
    const result = findExistingByGapId('[gap:bridge:1.1]', issues);
    expect(result).toBeUndefined();
  });

  it('returns undefined for empty issues array', () => {
    const result = findExistingByGapId('[gap:bridge:1.1]', []);
    expect(result).toBeUndefined();
  });
});

describe('appendGapId', () => {
  it('returns just the gap-id when description is undefined', () => {
    expect(appendGapId(undefined, '[gap:bridge:1.1]')).toBe('[gap:bridge:1.1]');
  });

  it('returns just the gap-id when description is empty string', () => {
    expect(appendGapId('', '[gap:bridge:1.1]')).toBe('[gap:bridge:1.1]');
  });

  it('appends gap-id to existing description with newline separator', () => {
    expect(appendGapId('some/path.md', '[gap:bridge:1.1]')).toBe('some/path.md\n[gap:bridge:1.1]');
  });

  it('appends gap-id to multi-line description', () => {
    expect(appendGapId('line1\nline2', '[gap:coverage:src/lib]')).toBe('line1\nline2\n[gap:coverage:src/lib]');
  });
});

describe('createOrFindIssue', () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
  });

  it('returns existing issue without creating when gap-id matches', () => {
    const existingIssue = makeBeadsIssue({ id: 'B-EXISTING', description: 'path\n[gap:bridge:1.1]' });
    // listIssues call
    mockExecFileSync.mockReturnValueOnce(Buffer.from(JSON.stringify([existingIssue])));

    const result = createOrFindIssue('Story Title', '[gap:bridge:1.1]');
    expect(result.created).toBe(false);
    expect(result.issue.id).toBe('B-EXISTING');
    // Only listIssues called (1 call), no createIssue
    expect(mockExecFileSync).toHaveBeenCalledTimes(1);
    expect(mockExecFileSync).toHaveBeenCalledWith('bd', ['list', '--json'], expect.any(Object));
  });

  it('creates new issue when no gap-id match', () => {
    const newIssue = makeBeadsIssue({ id: 'B-NEW', description: 'desc\n[gap:bridge:2.1]' });
    // First call: listIssues returns empty
    // Second call: createIssue returns new issue
    mockExecFileSync
      .mockReturnValueOnce(Buffer.from(JSON.stringify([])))
      .mockReturnValueOnce(Buffer.from(JSON.stringify(newIssue)));

    const result = createOrFindIssue('New Story', '[gap:bridge:2.1]', { description: 'desc' });
    expect(result.created).toBe(true);
    expect(result.issue.id).toBe('B-NEW');
    expect(mockExecFileSync).toHaveBeenCalledTimes(2);
  });

  it('appends gap-id to description when creating', () => {
    mockExecFileSync
      .mockReturnValueOnce(Buffer.from(JSON.stringify([])))
      .mockReturnValueOnce(Buffer.from(JSON.stringify(makeBeadsIssue({ id: 'B-1' }))));

    createOrFindIssue('Title', '[gap:bridge:1.1]', { description: 'path/to/file.md' });

    // Second call is createIssue
    const createArgs = mockExecFileSync.mock.calls[1][1] as string[];
    const descIdx = createArgs.indexOf('--description');
    expect(descIdx).toBeGreaterThan(-1);
    expect(createArgs[descIdx + 1]).toBe('path/to/file.md\n[gap:bridge:1.1]');
  });

  it('uses gap-id as description when no description provided', () => {
    mockExecFileSync
      .mockReturnValueOnce(Buffer.from(JSON.stringify([])))
      .mockReturnValueOnce(Buffer.from(JSON.stringify(makeBeadsIssue({ id: 'B-1' }))));

    createOrFindIssue('Title', '[gap:coverage:src/lib]');

    const createArgs = mockExecFileSync.mock.calls[1][1] as string[];
    const descIdx = createArgs.indexOf('--description');
    expect(descIdx).toBeGreaterThan(-1);
    expect(createArgs[descIdx + 1]).toBe('[gap:coverage:src/lib]');
  });

  it('passes through type and priority opts when creating', () => {
    mockExecFileSync
      .mockReturnValueOnce(Buffer.from(JSON.stringify([])))
      .mockReturnValueOnce(Buffer.from(JSON.stringify(makeBeadsIssue({ id: 'B-1' }))));

    createOrFindIssue('Title', '[gap:bridge:1.1]', { type: 'bug', priority: 2 });

    const createArgs = mockExecFileSync.mock.calls[1][1] as string[];
    expect(createArgs).toContain('--type');
    expect(createArgs).toContain('bug');
    expect(createArgs).toContain('--priority');
    expect(createArgs).toContain('2');
  });
});
