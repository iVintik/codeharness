import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { registerRetryCommand } from '../retry.js';
import { retriesPath, flaggedPath } from '../../lib/retry-state.js';

// The retry command uses 'ralph' as its dir. We need to create that inside
// the temp dir and chdir to the temp dir.
let testDir: string;
let ralphDir: string;
let originalCwd: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-retry-cmd-'));
  ralphDir = join(testDir, 'ralph');
  const { mkdirSync } = require('node:fs');
  mkdirSync(ralphDir, { recursive: true });
  originalCwd = process.cwd();
  process.chdir(testDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(testDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function createCli(): Command {
  const program = new Command();
  program.option('--json', 'JSON output');
  registerRetryCommand(program);
  return program;
}

async function runCli(args: string[]): Promise<{ stdout: string }> {
  const logs: string[] = [];
  const consoleSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    logs.push(a.map(String).join(' '));
  });

  const program = createCli();
  await program.parseAsync(['node', 'codeharness', ...args]);

  consoleSpy.mockRestore();
  return { stdout: logs.join('\n') };
}

// ─── --status ─────────────────────────────────────────────────────────────────

describe('retry --status', () => {
  it('shows "No retry entries." when no files exist', async () => {
    const { stdout } = await runCli(['retry', '--status']);
    expect(stdout).toContain('No retry entries.');
  });

  it('shows table with retry counts and flagged status', async () => {
    writeFileSync(retriesPath(ralphDir), 'story-a=3\nstory-b=1\n');
    writeFileSync(flaggedPath(ralphDir), 'story-a\n');

    const { stdout } = await runCli(['retry', '--status']);
    expect(stdout).toContain('story-a');
    expect(stdout).toContain('3');
    expect(stdout).toContain('yes');
    expect(stdout).toContain('story-b');
    expect(stdout).toContain('1');
  });

  it('includes flagged-only stories (no retry entry)', async () => {
    writeFileSync(flaggedPath(ralphDir), 'story-c\n');

    const { stdout } = await runCli(['retry', '--status']);
    expect(stdout).toContain('story-c');
    expect(stdout).toContain('yes');
  });

  it('shows header line', async () => {
    writeFileSync(retriesPath(ralphDir), 'story-a=1\n');

    const { stdout } = await runCli(['retry', '--status']);
    expect(stdout).toContain('Story');
    expect(stdout).toContain('Retries');
    expect(stdout).toContain('Flagged');
  });
});

// ─── --status --json ──────────────────────────────────────────────────────────

describe('retry --status --json', () => {
  it('outputs JSON with entries', async () => {
    writeFileSync(retriesPath(ralphDir), 'story-a=3\nstory-b=1\n');
    writeFileSync(flaggedPath(ralphDir), 'story-a\n');

    const { stdout } = await runCli(['--json', 'retry', '--status']);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('ok');
    expect(parsed.entries['story-a']).toEqual({ count: 3, flagged: true });
    expect(parsed.entries['story-b']).toEqual({ count: 1, flagged: false });
  });

  it('outputs JSON with empty entries when no data', async () => {
    const { stdout } = await runCli(['--json', 'retry', '--status']);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('ok');
    expect(parsed.entries).toEqual({});
  });

  it('includes flagged-only stories in JSON', async () => {
    writeFileSync(flaggedPath(ralphDir), 'story-x\n');

    const { stdout } = await runCli(['--json', 'retry', '--status']);
    const parsed = JSON.parse(stdout);
    expect(parsed.entries['story-x']).toEqual({ count: 0, flagged: true });
  });
});

// ─── --reset ──────────────────────────────────────────────────────────────────

describe('retry --reset', () => {
  it('clears all retries and flagged stories', async () => {
    writeFileSync(retriesPath(ralphDir), 'story-a=3\nstory-b=1\n');
    writeFileSync(flaggedPath(ralphDir), 'story-a\n');

    const { stdout } = await runCli(['retry', '--reset']);
    expect(stdout).toContain('[OK] All retry counters and flagged stories cleared');
    expect(readFileSync(retriesPath(ralphDir), 'utf-8')).toBe('');
    expect(readFileSync(flaggedPath(ralphDir), 'utf-8')).toBe('');
  });

  it('JSON output for reset all', async () => {
    const { stdout } = await runCli(['--json', 'retry', '--reset']);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('ok');
    expect(parsed.action).toBe('reset_all');
  });
});

// ─── --reset --story ──────────────────────────────────────────────────────────

describe('retry --reset --story', () => {
  it('clears only the specified story', async () => {
    writeFileSync(retriesPath(ralphDir), 'story-a=3\nstory-b=1\n');
    writeFileSync(flaggedPath(ralphDir), 'story-a\nstory-b\n');

    const { stdout } = await runCli(['retry', '--reset', '--story', 'story-a']);
    expect(stdout).toContain('[OK] Retry counter and flagged status cleared for story-a');

    const content = readFileSync(retriesPath(ralphDir), 'utf-8');
    expect(content).toContain('story-b=1');
    expect(content).not.toContain('story-a');

    const flagged = readFileSync(flaggedPath(ralphDir), 'utf-8');
    expect(flagged).toContain('story-b');
    expect(flagged).not.toContain('story-a');
  });

  it('JSON output for single story reset', async () => {
    writeFileSync(retriesPath(ralphDir), 'story-a=3\n');

    const { stdout } = await runCli(['--json', 'retry', '--reset', '--story', 'story-a']);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('ok');
    expect(parsed.action).toBe('reset');
    expect(parsed.story).toBe('story-a');
  });
});

// ─── --status --story (filter) ────────────────────────────────────────────────

describe('retry --status --story', () => {
  it('filters table to specified story', async () => {
    writeFileSync(retriesPath(ralphDir), 'story-a=3\nstory-b=1\n');
    writeFileSync(flaggedPath(ralphDir), 'story-a\n');

    const { stdout } = await runCli(['retry', '--status', '--story', 'story-a']);
    expect(stdout).toContain('story-a');
    expect(stdout).not.toContain('story-b');
  });

  it('shows "No retry entries." when filtered story not found', async () => {
    writeFileSync(retriesPath(ralphDir), 'story-a=3\n');

    const { stdout } = await runCli(['retry', '--status', '--story', 'nonexistent']);
    expect(stdout).toContain('No retry entries.');
  });

  it('filters JSON output to specified story', async () => {
    writeFileSync(retriesPath(ralphDir), 'story-a=3\nstory-b=1\n');

    const { stdout } = await runCli(['--json', 'retry', '--status', '--story', 'story-a']);
    const parsed = JSON.parse(stdout);
    expect(parsed.entries['story-a']).toEqual({ count: 3, flagged: false });
    expect(parsed.entries['story-b']).toBeUndefined();
  });
});

// ─── input validation ─────────────────────────────────────────────────────────

describe('retry input validation', () => {
  it('rejects story key with path traversal', async () => {
    const { stdout } = await runCli(['retry', '--reset', '--story', '../etc/passwd']);
    expect(stdout).toContain('[WARN] Invalid story key');
  });

  it('rejects story key with slashes', async () => {
    const { stdout } = await runCli(['retry', '--reset', '--story', 'foo/bar']);
    expect(stdout).toContain('[WARN] Invalid story key');
  });

  it('rejects story key with special characters', async () => {
    const { stdout } = await runCli(['retry', '--reset', '--story', 'story key=bad']);
    expect(stdout).toContain('[WARN] Invalid story key');
  });

  it('returns fail status in JSON for invalid key', async () => {
    const { stdout } = await runCli(['--json', 'retry', '--reset', '--story', '../bad']);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('fail');
    expect(parsed.message).toContain('Invalid story key');
  });
});

// ─── --story without --reset ──────────────────────────────────────────────────

describe('retry --story without --reset', () => {
  it('warns and shows status for that story', async () => {
    writeFileSync(retriesPath(ralphDir), 'story-a=3\nstory-b=1\n');

    const { stdout } = await runCli(['retry', '--story', 'story-a']);
    expect(stdout).toContain('[WARN]');
    expect(stdout).toContain('story-a');
    expect(stdout).not.toContain('story-b');
  });
});

// ─── default behavior ─────────────────────────────────────────────────────────

describe('retry (default)', () => {
  it('shows status when no flags provided', async () => {
    const { stdout } = await runCli(['retry']);
    expect(stdout).toContain('No retry entries.');
  });
});
