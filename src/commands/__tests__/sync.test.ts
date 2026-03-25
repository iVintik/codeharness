import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerSyncCommand } from '../sync.js';
import type { SyncResult } from '../../lib/sync/index.js';

// Mock beads module
vi.mock('../../lib/beads.js', () => ({
  listIssues: vi.fn(() => []),
  updateIssue: vi.fn(),
  closeIssue: vi.fn(),
  isBeadsCLIInstalled: vi.fn(() => true),
}));

// Mock beads-sync module
vi.mock('../../lib/sync/index.js', () => ({
  syncAll: vi.fn(() => []),
  syncStoryFileToBeads: vi.fn(() => ({
    storyKey: 'test-story',
    beadsId: '1',
    previousStatus: 'in-progress',
    newStatus: 'done',
    synced: true,
  })),
  syncBeadsToStoryFile: vi.fn(() => ({
    storyKey: 'test-story',
    beadsId: '1',
    previousStatus: 'in-progress',
    newStatus: 'done',
    synced: true,
  })),
}));

import { listIssues, isBeadsCLIInstalled } from '../../lib/beads.js';
import { syncAll, syncStoryFileToBeads, syncBeadsToStoryFile } from '../../lib/sync/index.js';

const mockListIssues = vi.mocked(listIssues);
const mockSyncAll = vi.mocked(syncAll);
const mockSyncStoryFileToBeads = vi.mocked(syncStoryFileToBeads);
const mockSyncBeadsToStoryFile = vi.mocked(syncBeadsToStoryFile);
const mockIsBeadsCLIInstalled = vi.mocked(isBeadsCLIInstalled);

describe('sync command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.exitCode = undefined;
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    process.exitCode = undefined;
  });

  function createProgram(): Command {
    const program = new Command();
    program.exitOverride();
    program.option('--json', 'JSON output');
    registerSyncCommand(program);
    return program;
  }

  it('runs bidirectional sync on all stories by default', async () => {
    const results: SyncResult[] = [
      { storyKey: 'story-1', beadsId: '1', previousStatus: 'in-progress', newStatus: 'done', synced: true },
      { storyKey: 'story-2', beadsId: '2', previousStatus: 'done', newStatus: 'done', synced: false },
    ];
    mockSyncAll.mockReturnValue(results);

    const program = createProgram();
    await program.parseAsync(['node', 'test', 'sync']);

    expect(mockSyncAll).toHaveBeenCalledWith('bidirectional', expect.any(Object));
    const calls = consoleSpy.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls).toContainEqual(expect.stringContaining('[OK] story-1: in-progress -> done'));
    expect(calls).toContainEqual(expect.stringContaining('[INFO] story-2: already in sync'));
    expect(calls).toContainEqual(expect.stringContaining('[OK] Sync: 1 stories synced'));
    expect(process.exitCode).toBe(0);
  });

  it('syncs single story with --story flag', async () => {
    mockListIssues.mockReturnValue([{
      id: '1',
      title: 'Test Story',
      status: 'open',
      type: 'story',
      priority: 1,
      description: '_bmad-output/implementation-artifacts/test-story.md',
    }]);

    const program = createProgram();
    await program.parseAsync(['node', 'test', 'sync', '--story', 'test-story']);

    expect(mockSyncBeadsToStoryFile).toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });

  it('uses files-to-beads direction with --story when specified', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'test', 'sync', '--story', 'test-story', '--direction', 'files-to-beads']);

    expect(mockSyncStoryFileToBeads).toHaveBeenCalledWith('test-story', expect.any(Object));
    expect(process.exitCode).toBe(0);
  });

  it('syncs with --direction beads-to-files', async () => {
    mockSyncAll.mockReturnValue([]);
    const program = createProgram();
    await program.parseAsync(['node', 'test', 'sync', '--direction', 'beads-to-files']);

    expect(mockSyncAll).toHaveBeenCalledWith('beads-to-files', expect.any(Object));
    expect(process.exitCode).toBe(0);
  });

  it('fails with invalid direction', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'test', 'sync', '--direction', 'invalid']);

    const calls = consoleSpy.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls).toContainEqual(expect.stringContaining('[FAIL] Invalid direction'));
    expect(process.exitCode).toBe(2);
  });

  it('outputs JSON with --json flag', async () => {
    const results: SyncResult[] = [
      { storyKey: 'story-1', beadsId: '1', previousStatus: 'in-progress', newStatus: 'done', synced: true },
      { storyKey: 'story-2', beadsId: '2', previousStatus: 'done', newStatus: 'done', synced: false },
      { storyKey: 'story-3', beadsId: '3', previousStatus: '', newStatus: '', synced: false, error: 'file not found' },
    ];
    mockSyncAll.mockReturnValue(results);

    const program = createProgram();
    await program.parseAsync(['node', 'test', '--json', 'sync']);

    const jsonCalls = consoleSpy.mock.calls.filter((c: unknown[]) => {
      try {
        const parsed = JSON.parse(c[0] as string) as Record<string, unknown>;
        return 'synced' in parsed && 'already_in_sync' in parsed;
      } catch {
        return false;
      }
    });

    expect(jsonCalls).toHaveLength(1);
    const result = JSON.parse(jsonCalls[0][0] as string) as Record<string, unknown>;
    expect(result.status).toBe('ok');
    expect(result.synced).toBe(1);
    expect(result.already_in_sync).toBe(1);
    expect(result.errors).toBe(1);
    expect(Array.isArray(result.results)).toBe(true);
  });

  it('handles sync errors gracefully', async () => {
    mockSyncAll.mockImplementation(() => { throw new Error('bd not available'); });

    const program = createProgram();
    await program.parseAsync(['node', 'test', 'sync']);

    const calls = consoleSpy.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls).toContainEqual(expect.stringContaining('[FAIL] Sync failed'));
    expect(process.exitCode).toBe(1);
  });

  it('reports fail status in JSON when all results have errors', async () => {
    const results: SyncResult[] = [
      { storyKey: 'story-1', beadsId: '1', previousStatus: '', newStatus: '', synced: false, error: 'file not found' },
    ];
    mockSyncAll.mockReturnValue(results);

    const program = createProgram();
    await program.parseAsync(['node', 'test', '--json', 'sync']);

    const jsonCalls = consoleSpy.mock.calls.filter((c: unknown[]) => {
      try {
        const parsed = JSON.parse(c[0] as string) as Record<string, unknown>;
        return 'synced' in parsed;
      } catch {
        return false;
      }
    });

    const result = JSON.parse(jsonCalls[0][0] as string) as Record<string, unknown>;
    expect(result.status).toBe('fail');
  });

  it('prints error results with storyKey or beadsId fallback', async () => {
    const results: SyncResult[] = [
      { storyKey: '', beadsId: 'BEAD-99', previousStatus: '', newStatus: '', synced: false, error: 'no path' },
    ];
    mockSyncAll.mockReturnValue(results);

    const program = createProgram();
    await program.parseAsync(['node', 'test', 'sync']);

    const calls = consoleSpy.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls).toContainEqual(expect.stringContaining('[FAIL] BEAD-99: no path'));
  });

  it('fails when --story specified but no matching beads issue found', async () => {
    mockListIssues.mockReturnValue([]);

    const program = createProgram();
    await program.parseAsync(['node', 'test', 'sync', '--story', 'nonexistent']);

    const calls = consoleSpy.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls).toContainEqual(expect.stringContaining('[FAIL] No beads issue found'));
    expect(process.exitCode).toBe(1);
  });

  it('prints info and skips when beads CLI is not installed (AC2)', async () => {
    mockIsBeadsCLIInstalled.mockReturnValue(false);

    const program = createProgram();
    await program.parseAsync(['node', 'test', 'sync']);

    const calls = consoleSpy.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls).toContainEqual(expect.stringContaining('[INFO] beads CLI not installed -- skipping'));
    expect(process.exitCode).toBe(0);
    expect(mockSyncAll).not.toHaveBeenCalled();
  });
});
