import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  resolveStoryFilePath,
  readStoryFileStatus,
  updateStoryFileStatus,
  storyKeyFromPath,
} from '../story-files.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-story-files-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('storyKeyFromPath', () => {
  it('extracts key from full path', () => {
    expect(storyKeyFromPath('_bmad-output/implementation-artifacts/1-1-my-story.md')).toBe(
      '1-1-my-story',
    );
  });

  it('handles filename only', () => {
    expect(storyKeyFromPath('1-2-another.md')).toBe('1-2-another');
  });

  it('handles path without .md extension', () => {
    expect(storyKeyFromPath('some/path/story')).toBe('story');
  });
});

describe('resolveStoryFilePath', () => {
  it('returns null for undefined description', () => {
    expect(resolveStoryFilePath(undefined)).toBeNull();
  });

  it('returns null for empty description', () => {
    expect(resolveStoryFilePath('')).toBeNull();
  });

  it('returns null for whitespace-only description', () => {
    expect(resolveStoryFilePath('   ')).toBeNull();
  });

  it('returns null for description not ending in .md', () => {
    expect(resolveStoryFilePath('some/path/file.txt')).toBeNull();
  });

  it('returns trimmed path for valid .md description', () => {
    expect(resolveStoryFilePath('  _bmad-output/1-1-story.md  ')).toBe(
      '_bmad-output/1-1-story.md',
    );
  });

  it('returns path for exact .md description', () => {
    expect(resolveStoryFilePath('path/to/story.md')).toBe('path/to/story.md');
  });
});

describe('readStoryFileStatus', () => {
  it('returns null for nonexistent file', () => {
    expect(readStoryFileStatus(join(testDir, 'missing.md'))).toBeNull();
  });

  it('returns null for file without Status line', () => {
    const p = join(testDir, 'story.md');
    writeFileSync(p, '# Story\n\nSome content\n', 'utf-8');
    expect(readStoryFileStatus(p)).toBeNull();
  });

  it('reads Status line from story file', () => {
    const p = join(testDir, 'story.md');
    writeFileSync(p, '# Story 1.1\n\nStatus: in-progress\n\n## AC\n', 'utf-8');
    expect(readStoryFileStatus(p)).toBe('in-progress');
  });

  it('reads Status with heading prefix', () => {
    const p = join(testDir, 'story.md');
    writeFileSync(p, '# Story\n\n## Status: review\n\nContent\n', 'utf-8');
    expect(readStoryFileStatus(p)).toBe('review');
  });
});

describe('updateStoryFileStatus', () => {
  it('replaces existing Status line', () => {
    const p = join(testDir, 'story.md');
    writeFileSync(p, '# Story\n\nStatus: in-progress\n\n## AC\n', 'utf-8');
    updateStoryFileStatus(p, 'done');
    const content = readFileSync(p, 'utf-8');
    expect(content).toContain('Status: done');
    expect(content).not.toContain('in-progress');
  });

  it('inserts Status line after title when none exists', () => {
    const p = join(testDir, 'story.md');
    writeFileSync(p, '# My Story\n\n## Acceptance Criteria\n', 'utf-8');
    updateStoryFileStatus(p, 'backlog');
    const content = readFileSync(p, 'utf-8');
    expect(content).toContain('Status: backlog');
    // Should be after the title
    const lines = content.split('\n');
    const titleIdx = lines.findIndex(l => l.startsWith('# '));
    const statusIdx = lines.findIndex(l => l.includes('Status: backlog'));
    expect(statusIdx).toBeGreaterThan(titleIdx);
  });

  it('prepends Status line when no title exists', () => {
    const p = join(testDir, 'story.md');
    writeFileSync(p, 'No title here\n', 'utf-8');
    updateStoryFileStatus(p, 'review');
    const content = readFileSync(p, 'utf-8');
    expect(content.startsWith('Status: review')).toBe(true);
  });
});
