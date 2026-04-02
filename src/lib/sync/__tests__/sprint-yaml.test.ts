import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Mock output
vi.mock('../../output.js', () => ({
  warn: vi.fn(),
}));

import { readSprintStatus, updateSprintStatus, appendOnboardingEpicToSprint } from '../sprint-yaml.js';
import { warn } from '../../output.js';

let testDir: string;

beforeEach(() => {
  vi.clearAllMocks();
  testDir = mkdtempSync(join(tmpdir(), 'ch-sprint-yaml-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function createSprintFile(content: string): void {
  const dir = join(testDir, '_bmad-output', 'implementation-artifacts');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'sprint-status.yaml'), content, 'utf-8');
}

function readSprintFile(): string {
  return readFileSync(
    join(testDir, '_bmad-output', 'implementation-artifacts', 'sprint-status.yaml'),
    'utf-8',
  );
}

describe('readSprintStatus', () => {
  it('returns empty object when file does not exist', () => {
    expect(readSprintStatus(testDir)).toEqual({});
  });

  it('returns empty object for empty file', () => {
    createSprintFile('');
    expect(readSprintStatus(testDir)).toEqual({});
  });

  it('returns empty object for file without development_status', () => {
    createSprintFile('something_else:\n  key: value\n');
    expect(readSprintStatus(testDir)).toEqual({});
  });

  it('returns empty object when development_status is not an object', () => {
    createSprintFile('development_status: "string-value"\n');
    expect(readSprintStatus(testDir)).toEqual({});
  });

  it('parses development_status correctly', () => {
    createSprintFile(
      'development_status:\n  1-1-story: done\n  1-2-story: in-progress\n',
    );
    expect(readSprintStatus(testDir)).toEqual({
      '1-1-story': 'done',
      '1-2-story': 'in-progress',
    });
  });

  it('returns empty object on malformed YAML', () => {
    createSprintFile('{{{{invalid yaml');
    expect(readSprintStatus(testDir)).toEqual({});
  });

  it('returns empty object when parsed value is null', () => {
    createSprintFile('---\n');
    expect(readSprintStatus(testDir)).toEqual({});
  });
});

describe('updateSprintStatus', () => {
  it('warns and skips when file does not exist', () => {
    updateSprintStatus('1-1-story', 'done', testDir);
    expect(vi.mocked(warn)).toHaveBeenCalledWith(expect.stringContaining('not found'));
  });

  it('does nothing when story key not found', () => {
    const content = 'development_status:\n  1-1-story: in-progress\n';
    createSprintFile(content);
    updateSprintStatus('2-2-nonexistent', 'done', testDir);
    expect(readSprintFile()).toBe(content);
  });

  it('updates existing story status preserving structure', () => {
    createSprintFile('development_status:\n  1-1-story: in-progress\n  1-2-story: backlog\n');
    updateSprintStatus('1-1-story', 'done', testDir);
    const updated = readSprintFile();
    expect(updated).toContain('1-1-story: done');
    expect(updated).toContain('1-2-story: backlog');
  });

  it('preserves comments in YAML', () => {
    const content = 'development_status:\n  1-1-story: in-progress # important\n';
    createSprintFile(content);
    updateSprintStatus('1-1-story', 'done', testDir);
    const updated = readSprintFile();
    expect(updated).toContain('1-1-story: done # important');
  });
});

describe('appendOnboardingEpicToSprint', () => {
  it('warns and returns -1 when file does not exist', () => {
    const result = appendOnboardingEpicToSprint(
      [{ title: 'Test Story' }],
      testDir,
    );
    expect(result.epicNumber).toBe(-1);
    expect(result.storyKeys).toEqual([]);
    expect(vi.mocked(warn)).toHaveBeenCalled();
  });

  it('appends onboarding epic with correct numbering', () => {
    createSprintFile('development_status:\n  epic-0: done\n  0-1-first: done\n');
    const result = appendOnboardingEpicToSprint(
      [{ title: 'Add tests for foo' }, { title: 'Fix bar module' }],
      testDir,
    );
    expect(result.epicNumber).toBe(1);
    expect(result.storyKeys).toHaveLength(2);
    expect(result.storyKeys[0]).toMatch(/^1-1-/);
    expect(result.storyKeys[1]).toMatch(/^1-2-/);

    const content = readSprintFile();
    expect(content).toContain('epic-1: backlog');
    expect(content).toContain('epic-1-retrospective: optional');
  });

  it('starts at epic-0 when no epics exist', () => {
    createSprintFile('development_status:\n  some-key: done\n');
    const result = appendOnboardingEpicToSprint(
      [{ title: 'Story One' }],
      testDir,
    );
    expect(result.epicNumber).toBe(0);
  });

  it('slugifies story titles correctly', () => {
    createSprintFile('development_status:\n  x: done\n');
    const result = appendOnboardingEpicToSprint(
      [{ title: 'Add Test Coverage for src/lib/foo.ts' }],
      testDir,
    );
    expect(result.storyKeys[0]).toMatch(/^0-1-add-test-coverage-for-src-lib-foo-ts$/);
  });
});
