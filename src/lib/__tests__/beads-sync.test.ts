import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  resolveStoryFilePath,
  readStoryFileStatus,
  updateStoryFileStatus,
  beadsStatusToStoryStatus,
  storyStatusToBeadsStatus,
  syncBeadsToStoryFile,
  syncStoryFileToBeads,
  syncClose,
  syncAll,
  readSprintStatus,
  updateSprintStatus,
  appendOnboardingEpicToSprint,
} from '../beads-sync.js';
import type { BeadsIssue } from '../beads.js';

// Mock output.ts to suppress warnings during tests
vi.mock('../output.js', () => ({
  ok: vi.fn(),
  fail: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  jsonOutput: vi.fn(),
}));

let testDir: string;

beforeEach(() => {
  vi.restoreAllMocks();
  testDir = mkdtempSync(join(tmpdir(), 'ch-beads-sync-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function makeIssue(overrides: Partial<BeadsIssue> = {}): BeadsIssue {
  return {
    id: '1',
    title: 'Test Story',
    status: 'open',
    type: 'story',
    priority: 1,
    description: '_bmad-output/implementation-artifacts/3-1-test-story.md',
    ...overrides,
  };
}

function createStoryFile(storyKey: string, status: string): string {
  const dir = join(testDir, '_bmad-output', 'implementation-artifacts');
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `${storyKey}.md`);
  writeFileSync(filePath, `# Story 3.1: Test Story\n\nStatus: ${status}\n\n## Story\n\nAs a developer...\n`);
  return filePath;
}

function createSprintStatusFile(content: string): void {
  const dir = join(testDir, '_bmad-output', 'implementation-artifacts');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'sprint-status.yaml'), content);
}

// ─── resolveStoryFilePath ───────────────────────────────────────────────────

describe('resolveStoryFilePath', () => {
  it('extracts path from beads issue description', () => {
    const issue = makeIssue({
      description: '_bmad-output/implementation-artifacts/3-1-beads-installation-cli-wrapper.md',
    });
    expect(resolveStoryFilePath(issue)).toBe(
      '_bmad-output/implementation-artifacts/3-1-beads-installation-cli-wrapper.md',
    );
  });

  it('returns null for empty description', () => {
    const issue = makeIssue({ description: '' });
    expect(resolveStoryFilePath(issue)).toBeNull();
  });

  it('returns null for undefined description', () => {
    const issue = makeIssue({ description: undefined });
    expect(resolveStoryFilePath(issue)).toBeNull();
  });

  it('returns null for description not ending in .md', () => {
    const issue = makeIssue({ description: 'some random text' });
    expect(resolveStoryFilePath(issue)).toBeNull();
  });

  it('trims whitespace from description', () => {
    const issue = makeIssue({
      description: '  _bmad-output/implementation-artifacts/3-1-test.md  ',
    });
    expect(resolveStoryFilePath(issue)).toBe(
      '_bmad-output/implementation-artifacts/3-1-test.md',
    );
  });
});

// ─── readStoryFileStatus ────────────────────────────────────────────────────

describe('readStoryFileStatus', () => {
  it('reads Status line from markdown file', () => {
    const filePath = createStoryFile('3-1-test-story', 'ready-for-dev');
    expect(readStoryFileStatus(filePath)).toBe('ready-for-dev');
  });

  it('returns null for missing file', () => {
    expect(readStoryFileStatus('/nonexistent/file.md')).toBeNull();
  });

  it('returns null for file without Status line', () => {
    const dir = join(testDir, '_bmad-output', 'implementation-artifacts');
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, 'no-status.md');
    writeFileSync(filePath, '# Story\n\nSome content.\n');
    expect(readStoryFileStatus(filePath)).toBeNull();
  });

  it('handles Status line with extra whitespace', () => {
    const dir = join(testDir, '_bmad-output', 'implementation-artifacts');
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, 'spaced.md');
    writeFileSync(filePath, '# Story\n\nStatus:   in-progress  \n');
    expect(readStoryFileStatus(filePath)).toBe('in-progress');
  });
});

// ─── updateStoryFileStatus ──────────────────────────────────────────────────

describe('updateStoryFileStatus', () => {
  it('updates existing Status line', () => {
    const filePath = createStoryFile('3-1-update-test', 'ready-for-dev');
    updateStoryFileStatus(filePath, 'done');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('Status: done');
    expect(content).not.toContain('Status: ready-for-dev');
  });

  it('preserves rest of file content', () => {
    const filePath = createStoryFile('3-1-preserve-test', 'in-progress');
    updateStoryFileStatus(filePath, 'done');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('# Story 3.1: Test Story');
    expect(content).toContain('## Story');
    expect(content).toContain('As a developer...');
  });

  it('inserts Status line if missing', () => {
    const dir = join(testDir, '_bmad-output', 'implementation-artifacts');
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, 'no-status.md');
    writeFileSync(filePath, '# Story 3.1: Test\n\n## Story\n\nContent here.\n');

    updateStoryFileStatus(filePath, 'in-progress');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('Status: in-progress');
    // The Status line should appear after the title
    const lines = content.split('\n');
    const titleIdx = lines.findIndex(l => l.startsWith('# Story'));
    const statusIdx = lines.findIndex(l => l.startsWith('Status:'));
    expect(statusIdx).toBeGreaterThan(titleIdx);
  });

  it('handles file with no title by prepending Status', () => {
    const dir = join(testDir, '_bmad-output', 'implementation-artifacts');
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, 'no-title.md');
    writeFileSync(filePath, 'Just some content\nwithout a title.\n');

    updateStoryFileStatus(filePath, 'done');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('Status: done');
  });
});

// ─── Status Mapping ─────────────────────────────────────────────────────────

describe('status mapping', () => {
  it('maps beads "open" to story "in-progress"', () => {
    expect(beadsStatusToStoryStatus('open')).toBe('in-progress');
  });

  it('maps beads "closed" to story "done"', () => {
    expect(beadsStatusToStoryStatus('closed')).toBe('done');
  });

  it('returns null for unknown beads status', () => {
    expect(beadsStatusToStoryStatus('unknown')).toBeNull();
  });

  it('maps story "backlog" to beads "open"', () => {
    expect(storyStatusToBeadsStatus('backlog')).toBe('open');
  });

  it('maps story "ready-for-dev" to beads "open"', () => {
    expect(storyStatusToBeadsStatus('ready-for-dev')).toBe('open');
  });

  it('maps story "in-progress" to beads "open"', () => {
    expect(storyStatusToBeadsStatus('in-progress')).toBe('open');
  });

  it('maps story "review" to beads "open"', () => {
    expect(storyStatusToBeadsStatus('review')).toBe('open');
  });

  it('maps story "done" to beads "closed"', () => {
    expect(storyStatusToBeadsStatus('done')).toBe('closed');
  });

  it('returns null for unknown story status', () => {
    expect(storyStatusToBeadsStatus('unknown')).toBeNull();
  });
});

// ─── syncBeadsToStoryFile ───────────────────────────────────────────────────

describe('syncBeadsToStoryFile', () => {
  it('updates story file when statuses differ', () => {
    const issue = makeIssue({ id: '1', status: 'closed' });
    createStoryFile('3-1-test-story', 'in-progress');

    const result = syncBeadsToStoryFile('1', { listIssues: () => [issue] }, testDir);

    expect(result.synced).toBe(true);
    expect(result.previousStatus).toBe('in-progress');
    expect(result.newStatus).toBe('done');
    expect(result.storyKey).toBe('3-1-test-story');
  });

  it('skips when already in sync', () => {
    const issue = makeIssue({ id: '1', status: 'open' });
    createStoryFile('3-1-test-story', 'in-progress');

    const result = syncBeadsToStoryFile('1', { listIssues: () => [issue] }, testDir);

    expect(result.synced).toBe(false);
    expect(result.error).toBeUndefined();
    expect(result.previousStatus).toBe('in-progress');
  });

  it('returns error for missing beads issue', () => {
    const result = syncBeadsToStoryFile('999', { listIssues: () => [] }, testDir);
    expect(result.synced).toBe(false);
    expect(result.error).toContain('Beads issue not found');
  });

  it('returns error when story file not found', () => {
    const issue = makeIssue({ id: '1', description: '_bmad-output/implementation-artifacts/nonexistent.md' });
    const result = syncBeadsToStoryFile('1', { listIssues: () => [issue] }, testDir);
    expect(result.synced).toBe(false);
    expect(result.error).toContain('Story file not found');
  });

  it('returns error when description has no valid path', () => {
    const issue = makeIssue({ id: '1', description: 'not a path' });
    const result = syncBeadsToStoryFile('1', { listIssues: () => [issue] }, testDir);
    expect(result.synced).toBe(false);
    expect(result.error).toContain('No story file path');
  });

  it('returns error for unknown beads status', () => {
    const issue = makeIssue({ id: '1', status: 'weird-status' });
    createStoryFile('3-1-test-story', 'in-progress');

    const result = syncBeadsToStoryFile('1', { listIssues: () => [issue] }, testDir);
    expect(result.synced).toBe(false);
    expect(result.error).toContain('Unknown beads status');
  });
});

// ─── syncStoryFileToBeads ───────────────────────────────────────────────────

describe('syncStoryFileToBeads', () => {
  it('updates beads when story status is "done" and beads is "open"', () => {
    const issue = makeIssue({ id: '1', status: 'open' });
    createStoryFile('3-1-test-story', 'done');

    const mockCloseIssue = vi.fn();
    const mockUpdateIssue = vi.fn();

    const result = syncStoryFileToBeads('3-1-test-story', {
      listIssues: () => [issue],
      updateIssue: mockUpdateIssue,
      closeIssue: mockCloseIssue,
    }, testDir);

    expect(result.synced).toBe(true);
    expect(mockCloseIssue).toHaveBeenCalledWith('1');
    expect(mockUpdateIssue).not.toHaveBeenCalled();
  });

  it('updates beads when story status is "in-progress" and beads is "closed"', () => {
    const issue = makeIssue({ id: '1', status: 'closed' });
    createStoryFile('3-1-test-story', 'in-progress');

    const mockCloseIssue = vi.fn();
    const mockUpdateIssue = vi.fn();

    const result = syncStoryFileToBeads('3-1-test-story', {
      listIssues: () => [issue],
      updateIssue: mockUpdateIssue,
      closeIssue: mockCloseIssue,
    }, testDir);

    expect(result.synced).toBe(true);
    expect(result.newStatus).toBe('open');
    expect(mockUpdateIssue).toHaveBeenCalledWith('1', { status: 'open' });
  });

  it('skips when already in sync', () => {
    const issue = makeIssue({ id: '1', status: 'open' });
    createStoryFile('3-1-test-story', 'in-progress');

    const result = syncStoryFileToBeads('3-1-test-story', {
      listIssues: () => [issue],
      updateIssue: vi.fn(),
      closeIssue: vi.fn(),
    }, testDir);

    expect(result.synced).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it('returns error when story file not found', () => {
    const result = syncStoryFileToBeads('nonexistent', {
      listIssues: () => [],
      updateIssue: vi.fn(),
      closeIssue: vi.fn(),
    }, testDir);

    expect(result.synced).toBe(false);
    expect(result.error).toContain('Story file not found');
  });

  it('returns error when no beads issue matches story key', () => {
    createStoryFile('3-1-orphan-story', 'in-progress');

    const result = syncStoryFileToBeads('3-1-orphan-story', {
      listIssues: () => [],
      updateIssue: vi.fn(),
      closeIssue: vi.fn(),
    }, testDir);

    expect(result.synced).toBe(false);
    expect(result.error).toContain('No beads issue found');
  });

  it('returns error for unknown story status', () => {
    const issue = makeIssue({ id: '1', status: 'open' });
    // Create a file with a non-standard status
    const dir = join(testDir, '_bmad-output', 'implementation-artifacts');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '3-1-test-story.md'), '# Story\n\nStatus: weird-status\n');

    const result = syncStoryFileToBeads('3-1-test-story', {
      listIssues: () => [issue],
      updateIssue: vi.fn(),
      closeIssue: vi.fn(),
    }, testDir);

    expect(result.synced).toBe(false);
    expect(result.error).toContain('Unknown story status');
  });
});

// ─── syncClose ──────────────────────────────────────────────────────────────

describe('syncClose', () => {
  it('closes beads issue and updates story file to done', () => {
    const issue = makeIssue({ id: '1', status: 'closed' });
    createStoryFile('3-1-test-story', 'in-progress');

    const mockCloseIssue = vi.fn();

    const result = syncClose('1', {
      closeIssue: mockCloseIssue,
      listIssues: () => [issue],
    }, testDir);

    expect(result.synced).toBe(true);
    expect(result.newStatus).toBe('done');
    expect(result.previousStatus).toBe('in-progress');
    expect(mockCloseIssue).toHaveBeenCalledWith('1');

    // Verify file was updated
    const fullPath = join(testDir, '_bmad-output', 'implementation-artifacts', '3-1-test-story.md');
    expect(readFileSync(fullPath, 'utf-8')).toContain('Status: done');
  });

  it('handles missing story file gracefully', () => {
    const issue = makeIssue({ id: '1', status: 'closed', description: '_bmad-output/implementation-artifacts/nonexistent.md' });
    const mockCloseIssue = vi.fn();

    const result = syncClose('1', {
      closeIssue: mockCloseIssue,
      listIssues: () => [issue],
    }, testDir);

    expect(result.synced).toBe(false);
    expect(result.error).toContain('Story file not found');
    expect(mockCloseIssue).toHaveBeenCalledWith('1');
  });

  it('handles already-closed issue — still updates story file to done (idempotent)', () => {
    const issue = makeIssue({ id: '1', status: 'closed' });
    createStoryFile('3-1-test-story', 'done');

    const mockCloseIssue = vi.fn();

    const result = syncClose('1', {
      closeIssue: mockCloseIssue,
      listIssues: () => [issue],
    }, testDir);

    // closeIssue is still called (idempotent)
    expect(mockCloseIssue).toHaveBeenCalledWith('1');
    expect(result.synced).toBe(true);
    expect(result.newStatus).toBe('done');
  });

  it('handles issue with no description', () => {
    const issue = makeIssue({ id: '1', description: undefined });
    const mockCloseIssue = vi.fn();

    const result = syncClose('1', {
      closeIssue: mockCloseIssue,
      listIssues: () => [issue],
    }, testDir);

    expect(result.synced).toBe(false);
    expect(result.error).toContain('No story file path');
  });

  it('calls listIssues before closeIssue to capture issue data', () => {
    const callOrder: string[] = [];
    const issue = makeIssue({ id: '1', status: 'open' });
    createStoryFile('3-1-test-story', 'in-progress');

    const result = syncClose('1', {
      closeIssue: () => { callOrder.push('close'); },
      listIssues: () => { callOrder.push('list'); return [issue]; },
    }, testDir);

    expect(callOrder).toEqual(['list', 'close']);
    expect(result.synced).toBe(true);
  });

  it('handles issue not found', () => {
    const mockCloseIssue = vi.fn();

    const result = syncClose('999', {
      closeIssue: mockCloseIssue,
      listIssues: () => [],
    }, testDir);

    expect(result.synced).toBe(false);
    expect(result.error).toContain('Beads issue not found');
    // closeIssue is still called even if issue not in list
    expect(mockCloseIssue).toHaveBeenCalledWith('999');
  });
});

// ─── syncAll ────────────────────────────────────────────────────────────────

describe('syncAll', () => {
  it('syncs multiple issues in beads-to-files direction', () => {
    const issues = [
      makeIssue({ id: '1', status: 'closed', description: '_bmad-output/implementation-artifacts/3-1-story-a.md' }),
      makeIssue({ id: '2', status: 'open', description: '_bmad-output/implementation-artifacts/3-2-story-b.md' }),
    ];

    createStoryFile('3-1-story-a', 'in-progress');
    createStoryFile('3-2-story-b', 'in-progress');

    const results = syncAll('beads-to-files', {
      listIssues: () => issues,
      updateIssue: vi.fn(),
      closeIssue: vi.fn(),
    }, testDir);

    expect(results).toHaveLength(2);
    // Story A: closed -> done (synced)
    expect(results[0].synced).toBe(true);
    expect(results[0].newStatus).toBe('done');
    // Story B: open -> in-progress (already in sync)
    expect(results[1].synced).toBe(false);
    expect(results[1].error).toBeUndefined();
  });

  it('syncs in files-to-beads direction', () => {
    const issue = makeIssue({ id: '1', status: 'open' });
    createStoryFile('3-1-test-story', 'done');

    const mockCloseIssue = vi.fn();

    const results = syncAll('files-to-beads', {
      listIssues: () => [issue],
      updateIssue: vi.fn(),
      closeIssue: mockCloseIssue,
    }, testDir);

    expect(results).toHaveLength(1);
    expect(results[0].synced).toBe(true);
    expect(mockCloseIssue).toHaveBeenCalledWith('1');
  });

  it('returns correct counts', () => {
    const issues = [
      makeIssue({ id: '1', status: 'closed', description: '_bmad-output/implementation-artifacts/3-1-synced.md' }),
      makeIssue({ id: '2', status: 'open', description: '_bmad-output/implementation-artifacts/3-2-in-sync.md' }),
      makeIssue({ id: '3', status: 'open', description: '_bmad-output/implementation-artifacts/3-3-missing.md' }),
    ];

    createStoryFile('3-1-synced', 'in-progress');
    createStoryFile('3-2-in-sync', 'in-progress');
    // 3-3-missing.md doesn't exist

    const results = syncAll('beads-to-files', {
      listIssues: () => issues,
      updateIssue: vi.fn(),
      closeIssue: vi.fn(),
    }, testDir);

    const syncedCount = results.filter(r => r.synced).length;
    const alreadyInSync = results.filter(r => !r.synced && !r.error).length;
    const errorCount = results.filter(r => !!r.error).length;

    expect(syncedCount).toBe(1); // 3-1 was synced
    expect(alreadyInSync).toBe(1); // 3-2 was already in sync
    expect(errorCount).toBe(1); // 3-3 had an error
  });

  it('handles errors per-issue without aborting', () => {
    const issues = [
      makeIssue({ id: '1', status: 'open', description: '_bmad-output/implementation-artifacts/3-1-missing.md' }),
      makeIssue({ id: '2', status: 'closed', description: '_bmad-output/implementation-artifacts/3-2-exists.md' }),
    ];

    // Only create the second story file
    createStoryFile('3-2-exists', 'in-progress');

    const results = syncAll('beads-to-files', {
      listIssues: () => issues,
      updateIssue: vi.fn(),
      closeIssue: vi.fn(),
    }, testDir);

    expect(results).toHaveLength(2);
    expect(results[0].error).toBeTruthy();
    expect(results[1].synced).toBe(true);
  });

  it('skips issues without story file paths', () => {
    const issues = [
      makeIssue({ id: '1', status: 'open', description: undefined }),
      makeIssue({ id: '2', status: 'open', description: 'not-a-path' }),
      makeIssue({ id: '3', status: 'closed', description: '_bmad-output/implementation-artifacts/3-1-valid.md' }),
    ];

    createStoryFile('3-1-valid', 'in-progress');

    const results = syncAll('beads-to-files', {
      listIssues: () => issues,
      updateIssue: vi.fn(),
      closeIssue: vi.fn(),
    }, testDir);

    // Only the valid issue should be processed
    expect(results).toHaveLength(1);
    expect(results[0].storyKey).toBe('3-1-valid');
  });

  it('handles listIssues failure gracefully', () => {
    const results = syncAll('beads-to-files', {
      listIssues: () => { throw new Error('bd not available'); },
      updateIssue: vi.fn(),
      closeIssue: vi.fn(),
    }, testDir);

    expect(results).toHaveLength(1);
    expect(results[0].error).toContain('Failed to list beads issues');
  });
});

// ─── readSprintStatus ───────────────────────────────────────────────────────

describe('readSprintStatus', () => {
  it('reads development_status map from sprint-status.yaml', () => {
    createSprintStatusFile(`generated: 2026-03-15
project: codeharness
development_status:
  epic-1: done
  1-1-test-story: in-progress
`);

    const status = readSprintStatus(testDir);
    expect(status['epic-1']).toBe('done');
    expect(status['1-1-test-story']).toBe('in-progress');
  });

  it('returns empty object when file does not exist', () => {
    expect(readSprintStatus(testDir)).toEqual({});
  });

  it('returns empty object for invalid YAML', () => {
    createSprintStatusFile('not: [valid: yaml: content');
    // yaml library may or may not throw — but our function catches
    const result = readSprintStatus(testDir);
    expect(typeof result).toBe('object');
  });

  it('returns empty object when development_status is missing', () => {
    createSprintStatusFile('project: test\n');
    expect(readSprintStatus(testDir)).toEqual({});
  });
});

// ─── updateSprintStatus ─────────────────────────────────────────────────────

describe('updateSprintStatus', () => {
  it('updates a story status in sprint-status.yaml preserving comments', () => {
    createSprintStatusFile(`# comment
generated: 2026-03-15
development_status:
  epic-3: in-progress
  3-1-test-story: ready-for-dev
  3-2-other-story: backlog
`);

    updateSprintStatus('3-1-test-story', 'done', testDir);

    const content = readFileSync(
      join(testDir, '_bmad-output', 'implementation-artifacts', 'sprint-status.yaml'),
      'utf-8',
    );
    expect(content).toContain('3-1-test-story: done');
    expect(content).toContain('3-2-other-story: backlog');
    expect(content).toContain('# comment');
  });

  it('does nothing when story key not found in file', () => {
    createSprintStatusFile(`development_status:
  3-1-test-story: ready-for-dev
`);

    updateSprintStatus('nonexistent-story', 'done', testDir);

    const content = readFileSync(
      join(testDir, '_bmad-output', 'implementation-artifacts', 'sprint-status.yaml'),
      'utf-8',
    );
    expect(content).toContain('3-1-test-story: ready-for-dev');
  });

  it('handles missing sprint-status.yaml gracefully', () => {
    // Should not throw
    updateSprintStatus('any-story', 'done', testDir);
  });
});

// ─── Sprint-status.yaml integration in sync operations ──────────────────────

describe('sprint-status.yaml integration', () => {
  it('syncBeadsToStoryFile updates sprint-status.yaml when syncing', () => {
    const issue = makeIssue({ id: '1', status: 'closed' });
    createStoryFile('3-1-test-story', 'in-progress');
    createSprintStatusFile(`development_status:
  3-1-test-story: in-progress
`);

    syncBeadsToStoryFile('1', { listIssues: () => [issue] }, testDir);

    const content = readFileSync(
      join(testDir, '_bmad-output', 'implementation-artifacts', 'sprint-status.yaml'),
      'utf-8',
    );
    expect(content).toContain('3-1-test-story: done');
  });

  it('syncStoryFileToBeads updates sprint-status.yaml when syncing', () => {
    const issue = makeIssue({ id: '1', status: 'open' });
    createStoryFile('3-1-test-story', 'done');
    createSprintStatusFile(`development_status:
  3-1-test-story: in-progress
`);

    syncStoryFileToBeads('3-1-test-story', {
      listIssues: () => [issue],
      updateIssue: vi.fn(),
      closeIssue: vi.fn(),
    }, testDir);

    const content = readFileSync(
      join(testDir, '_bmad-output', 'implementation-artifacts', 'sprint-status.yaml'),
      'utf-8',
    );
    expect(content).toContain('3-1-test-story: done');
  });

  it('syncClose updates sprint-status.yaml to done', () => {
    const issue = makeIssue({ id: '1', status: 'open' });
    createStoryFile('3-1-test-story', 'in-progress');
    createSprintStatusFile(`development_status:
  3-1-test-story: in-progress
`);

    syncClose('1', {
      closeIssue: vi.fn(),
      listIssues: () => [issue],
    }, testDir);

    const content = readFileSync(
      join(testDir, '_bmad-output', 'implementation-artifacts', 'sprint-status.yaml'),
      'utf-8',
    );
    expect(content).toContain('3-1-test-story: done');
  });
});

// ─── appendOnboardingEpicToSprint ────────────────────────────────────────────

describe('appendOnboardingEpicToSprint', () => {
  it('appends onboarding epic with correct epic number', () => {
    createSprintStatusFile(`development_status:
  epic-0: done
  0-1-first-story: done
  epic-0-retrospective: done

  epic-1: done
  1-1-second-story: done
  epic-1-retrospective: done
`);

    const result = appendOnboardingEpicToSprint(
      [
        { title: 'Create ARCHITECTURE.md' },
        { title: 'Add test coverage for src/lib' },
      ],
      testDir,
    );

    expect(result.epicNumber).toBe(2);
    expect(result.storyKeys).toHaveLength(2);
    expect(result.storyKeys[0]).toMatch(/^2-1-create-architecture-md/);
    expect(result.storyKeys[1]).toMatch(/^2-2-add-test-coverage-for-src-lib/);

    const content = readFileSync(
      join(testDir, '_bmad-output', 'implementation-artifacts', 'sprint-status.yaml'),
      'utf-8',
    );
    expect(content).toContain('epic-2: backlog');
    expect(content).toContain('2-1-create-architecture-md: backlog');
    expect(content).toContain('2-2-add-test-coverage-for-src-lib: backlog');
    expect(content).toContain('epic-2-retrospective: optional');
  });

  it('returns epicNumber 0 when no existing epics', () => {
    createSprintStatusFile(`development_status:
`);

    const result = appendOnboardingEpicToSprint(
      [{ title: 'Create ARCHITECTURE.md' }],
      testDir,
    );

    expect(result.epicNumber).toBe(0);
    expect(result.storyKeys[0]).toMatch(/^0-1-create-architecture-md/);
  });

  it('returns -1 when sprint-status.yaml missing', () => {
    const result = appendOnboardingEpicToSprint(
      [{ title: 'Test' }],
      testDir,
    );

    expect(result.epicNumber).toBe(-1);
    expect(result.storyKeys).toHaveLength(0);
  });

  it('preserves existing content when appending', () => {
    createSprintStatusFile(`# project header
development_status:
  epic-0: done
  0-1-first-story: done
  epic-0-retrospective: done
`);

    appendOnboardingEpicToSprint(
      [{ title: 'New Story' }],
      testDir,
    );

    const content = readFileSync(
      join(testDir, '_bmad-output', 'implementation-artifacts', 'sprint-status.yaml'),
      'utf-8',
    );
    // Existing content preserved
    expect(content).toContain('# project header');
    expect(content).toContain('epic-0: done');
    expect(content).toContain('0-1-first-story: done');
    // New content appended
    expect(content).toContain('epic-1: backlog');
  });

  it('slugifies story titles correctly', () => {
    createSprintStatusFile(`development_status:
`);

    const result = appendOnboardingEpicToSprint(
      [{ title: 'Create src/commands/AGENTS.md' }],
      testDir,
    );

    expect(result.storyKeys[0]).toMatch(/^0-1-create-src-commands-agents-md/);
  });
});
