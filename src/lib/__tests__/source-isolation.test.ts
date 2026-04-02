import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../output.js', () => ({
  warn: vi.fn(),
}));

import { warn } from '../output.js';
import { createIsolatedWorkspace } from '../source-isolation.js';
import type { IsolationOptions, IsolatedWorkspace } from '../source-isolation.js';

let projectDir: string;
let workspace: IsolatedWorkspace | null;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'ch-iso-test-'));
  workspace = null;
  vi.clearAllMocks();
});

afterEach(async () => {
  // Clean up workspace if test created one
  if (workspace) {
    await workspace.cleanup();
  }
  rmSync(projectDir, { recursive: true, force: true });
});

describe('createIsolatedWorkspace', () => {
  it('creates temp dir with expected structure', async () => {
    workspace = await createIsolatedWorkspace({ runId: 'test-run-1', storyFiles: [] });

    expect(existsSync(workspace.dir)).toBe(true);
    expect(workspace.dir).toBe('/tmp/codeharness-verify-test-run-1');
    expect(existsSync(workspace.storyFilesDir)).toBe(true);
    expect(existsSync(workspace.verdictDir)).toBe(true);
  });

  it('story-files/ and verdict/ subdirectories exist', async () => {
    workspace = await createIsolatedWorkspace({ runId: 'test-run-2', storyFiles: [] });

    const entries = readdirSync(workspace.dir);
    expect(entries).toContain('story-files');
    expect(entries).toContain('verdict');
  });

  it('copies story files into story-files/ subdirectory', async () => {
    // Create dummy story files in project dir
    const storyFile1 = join(projectDir, 'story-1.md');
    const storyFile2 = join(projectDir, 'story-2.md');
    writeFileSync(storyFile1, '# Story 1\nAC: something');
    writeFileSync(storyFile2, '# Story 2\nAC: something else');

    workspace = await createIsolatedWorkspace({
      runId: 'test-run-3',
      storyFiles: [storyFile1, storyFile2],
    });

    const copiedFiles = readdirSync(workspace.storyFilesDir);
    expect(copiedFiles).toContain('story-1.md');
    expect(copiedFiles).toContain('story-2.md');

    // Verify content was copied correctly
    const content1 = readFileSync(join(workspace.storyFilesDir, 'story-1.md'), 'utf-8');
    expect(content1).toBe('# Story 1\nAC: something');
  });

  it('workspace does NOT contain src/ directory', async () => {
    workspace = await createIsolatedWorkspace({ runId: 'test-run-4', storyFiles: [] });

    const entries = readdirSync(workspace.dir);
    expect(entries).not.toContain('src');
    expect(entries).not.toContain('node_modules');
    expect(entries).not.toContain('package.json');
  });

  it('empty storyFiles array creates directories but no files in story-files/', async () => {
    workspace = await createIsolatedWorkspace({ runId: 'test-run-5', storyFiles: [] });

    expect(existsSync(workspace.storyFilesDir)).toBe(true);
    expect(existsSync(workspace.verdictDir)).toBe(true);
    const storyEntries = readdirSync(workspace.storyFilesDir);
    expect(storyEntries).toHaveLength(0);
  });

  it('verdict/ directory exists in workspace', async () => {
    workspace = await createIsolatedWorkspace({ runId: 'test-run-6', storyFiles: [] });

    expect(existsSync(workspace.verdictDir)).toBe(true);
    expect(workspace.verdictDir).toBe(join(workspace.dir, 'verdict'));
  });
});

describe('missing file handling', () => {
  it('logs a warning and skips missing story file', async () => {
    const missingFile = join(projectDir, 'does-not-exist.md');

    workspace = await createIsolatedWorkspace({
      runId: 'test-run-missing',
      storyFiles: [missingFile],
    });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('story file not found, skipping'),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(missingFile),
    );

    const storyEntries = readdirSync(workspace.storyFilesDir);
    expect(storyEntries).toHaveLength(0);
  });

  it('copies valid files and skips missing ones without throwing', async () => {
    const validFile = join(projectDir, 'valid-story.md');
    writeFileSync(validFile, '# Valid');
    const missingFile = join(projectDir, 'missing-story.md');

    workspace = await createIsolatedWorkspace({
      runId: 'test-run-mixed',
      storyFiles: [validFile, missingFile],
    });

    const storyEntries = readdirSync(workspace.storyFilesDir);
    expect(storyEntries).toHaveLength(1);
    expect(storyEntries).toContain('valid-story.md');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('toDispatchOptions', () => {
  it('returns DispatchOptions with cwd set to the temp directory', async () => {
    workspace = await createIsolatedWorkspace({ runId: 'test-run-dispatch', storyFiles: [] });

    const opts = workspace.toDispatchOptions();
    expect(opts).toEqual({ cwd: workspace.dir });
    expect(opts.cwd).toBe('/tmp/codeharness-verify-test-run-dispatch');
  });
});

describe('cleanup', () => {
  it('removes the temp directory and all contents', async () => {
    workspace = await createIsolatedWorkspace({ runId: 'test-run-cleanup', storyFiles: [] });
    const dir = workspace.dir;

    expect(existsSync(dir)).toBe(true);
    await workspace.cleanup();
    expect(existsSync(dir)).toBe(false);

    // Prevent afterEach from trying to clean up again
    workspace = null;
  });

  it('calling cleanup() twice does not throw (idempotent)', async () => {
    workspace = await createIsolatedWorkspace({ runId: 'test-run-idem', storyFiles: [] });

    await workspace.cleanup();
    // Second call should not throw
    await expect(workspace.cleanup()).resolves.toBeUndefined();

    workspace = null;
  });

  it('cleanup removes files that were copied', async () => {
    const storyFile = join(projectDir, 'ac.md');
    writeFileSync(storyFile, '# AC');

    workspace = await createIsolatedWorkspace({
      runId: 'test-run-cleanup-files',
      storyFiles: [storyFile],
    });
    const dir = workspace.dir;

    expect(existsSync(join(dir, 'story-files', 'ac.md'))).toBe(true);
    await workspace.cleanup();
    expect(existsSync(dir)).toBe(false);

    workspace = null;
  });
});

describe('runId sanitization', () => {
  it('sanitizes path traversal characters in runId', async () => {
    workspace = await createIsolatedWorkspace({
      runId: '../../etc/passwd',
      storyFiles: [],
    });

    // Slashes replaced with underscores; leading dots stripped to prevent traversal
    expect(workspace.dir).toBe('/tmp/codeharness-verify-_.._etc_passwd');
    // No slash in the runId portion
    expect(workspace.dir.replace('/tmp/codeharness-verify-', '')).not.toContain('/');
    expect(existsSync(workspace.dir)).toBe(true);
  });

  it('sanitizes spaces and special characters in runId', async () => {
    workspace = await createIsolatedWorkspace({
      runId: 'run id with spaces & $pecial',
      storyFiles: [],
    });

    // Spaces, &, and $ all replaced with underscores
    expect(workspace.dir).toBe('/tmp/codeharness-verify-run_id_with_spaces____pecial');
    expect(existsSync(workspace.dir)).toBe(true);
  });

  it('throws on runId that sanitizes to empty string', async () => {
    // Leading dots stripped, slashes replaced — '...' becomes empty after stripping
    await expect(
      createIsolatedWorkspace({ runId: '...', storyFiles: [] }),
    ).rejects.toThrow('runId is empty after sanitization');
  });

  it('preserves valid runId characters', async () => {
    workspace = await createIsolatedWorkspace({
      runId: 'valid-run_id.123',
      storyFiles: [],
    });

    expect(workspace.dir).toBe('/tmp/codeharness-verify-valid-run_id.123');
  });
});

describe('pre-existing workspace cleanup', () => {
  it('cleans stale workspace before creating new one', async () => {
    // Pre-create a stale workspace with a rogue file
    const staleDir = '/tmp/codeharness-verify-stale-test';
    mkdirSync(join(staleDir, 'story-files'), { recursive: true });
    writeFileSync(join(staleDir, 'story-files', 'rogue.txt'), 'stale data');

    workspace = await createIsolatedWorkspace({
      runId: 'stale-test',
      storyFiles: [],
    });

    // Rogue file should be gone — fresh workspace
    const storyEntries = readdirSync(workspace.storyFilesDir);
    expect(storyEntries).toHaveLength(0);
    expect(existsSync(join(staleDir, 'story-files', 'rogue.txt'))).toBe(false);
  });
});

describe('filename deduplication', () => {
  it('deduplicates story files with the same basename', async () => {
    // Create two story files with the same name in different dirs
    const dir1 = join(projectDir, 'dir1');
    const dir2 = join(projectDir, 'dir2');
    mkdirSync(dir1, { recursive: true });
    mkdirSync(dir2, { recursive: true });
    writeFileSync(join(dir1, 'story.md'), '# Story from dir1');
    writeFileSync(join(dir2, 'story.md'), '# Story from dir2');

    workspace = await createIsolatedWorkspace({
      runId: 'dedup-test',
      storyFiles: [join(dir1, 'story.md'), join(dir2, 'story.md')],
    });

    const files = readdirSync(workspace.storyFilesDir).sort();
    expect(files).toHaveLength(2);
    expect(files).toContain('story.md');
    expect(files).toContain('story-1.md');

    // Verify both contents are preserved
    const content1 = readFileSync(join(workspace.storyFilesDir, 'story.md'), 'utf-8');
    const content2 = readFileSync(join(workspace.storyFilesDir, 'story-1.md'), 'utf-8');
    expect(content1).toBe('# Story from dir1');
    expect(content2).toBe('# Story from dir2');
  });

  it('deduplicates files without extensions', async () => {
    const dir1 = join(projectDir, 'a');
    const dir2 = join(projectDir, 'b');
    mkdirSync(dir1, { recursive: true });
    mkdirSync(dir2, { recursive: true });
    writeFileSync(join(dir1, 'README'), 'first');
    writeFileSync(join(dir2, 'README'), 'second');

    workspace = await createIsolatedWorkspace({
      runId: 'dedup-noext-test',
      storyFiles: [join(dir1, 'README'), join(dir2, 'README')],
    });

    const files = readdirSync(workspace.storyFilesDir).sort();
    expect(files).toHaveLength(2);
    expect(files).toContain('README');
    expect(files).toContain('README-1');
  });
});

describe('toDispatchOptions return shape', () => {
  it('returns object with only cwd property', async () => {
    workspace = await createIsolatedWorkspace({ runId: 'shape-test', storyFiles: [] });

    const opts = workspace.toDispatchOptions();
    expect(Object.keys(opts)).toEqual(['cwd']);
  });
});

describe('integration point verification', () => {
  it('evaluator template has disallowedTools: [Edit, Write]', async () => {
    // Read the evaluator template and verify disallowedTools
    const { readFileSync: readFs } = await import('node:fs');
    const { resolve } = await import('node:path');
    const { parse } = await import('yaml');

    const evalPath = resolve(__dirname, '../../../templates/agents/evaluator.yaml');
    const raw = readFs(evalPath, 'utf-8');
    const parsed = parse(raw) as { disallowedTools?: string[] };

    expect(parsed.disallowedTools).toEqual(['Edit', 'Write']);
  });
});
