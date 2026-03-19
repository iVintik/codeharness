import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { registerProgressCommand } from '../progress.js';
import type { SprintState } from '../../types/state.js';

// Mock migration so tests don't touch real project files
vi.mock('../../modules/sprint/migration.js', () => ({
  migrateFromOldFormat: vi.fn(() => ({
    success: false,
    error: 'No old format files found for migration',
  })),
}));

let testDir: string;
let originalCwd: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-cmd-progress-'));
  originalCwd = process.cwd();
  process.chdir(testDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(testDir, { recursive: true, force: true });
});

function createCli(): Command {
  const program = new Command();
  program.option('--json', 'JSON output');
  registerProgressCommand(program);
  return program;
}

async function runCli(args: string[]): Promise<{ stdout: string; exitCode: number | undefined }> {
  const logs: string[] = [];
  const consoleSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    logs.push(a.map(String).join(' '));
  });
  process.exitCode = undefined;

  const program = createCli();
  await program.parseAsync(['node', 'codeharness', ...args]);

  consoleSpy.mockRestore();
  const exitCode = process.exitCode;
  process.exitCode = undefined;

  return { stdout: logs.join('\n'), exitCode };
}

function readState(): SprintState {
  const raw = readFileSync(join(process.cwd(), 'sprint-state.json'), 'utf-8');
  return JSON.parse(raw) as SprintState;
}

describe('codeharness progress', () => {
  it('updates story, phase, and action', async () => {
    const { stdout, exitCode } = await runCli([
      'progress',
      '--story', '1-2-user-auth',
      '--phase', 'dev',
      '--action', 'Starting development',
    ]);

    expect(exitCode).toBeUndefined();
    expect(stdout).toContain('Run progress updated');

    const state = readState();
    expect(state.run.currentStory).toBe('1-2-user-auth');
    expect(state.run.currentPhase).toBe('dev');
    expect(state.run.lastAction).toBe('Starting development');
  });

  it('updates ac-progress only', async () => {
    await runCli([
      'progress',
      '--story', '1-2-user-auth',
      '--phase', 'verify',
    ]);

    const { exitCode } = await runCli([
      'progress',
      '--ac-progress', '4/12',
    ]);

    expect(exitCode).toBeUndefined();

    const state = readState();
    expect(state.run.acProgress).toBe('4/12');
    expect(state.run.currentStory).toBe('1-2-user-auth');
  });

  it('clears all progress fields with --clear', async () => {
    await runCli([
      'progress',
      '--story', '1-2-user-auth',
      '--phase', 'dev',
      '--action', 'Working',
      '--ac-progress', '3/7',
    ]);

    const { stdout, exitCode } = await runCli(['progress', '--clear']);

    expect(exitCode).toBeUndefined();
    expect(stdout).toContain('Run progress cleared');

    const state = readState();
    expect(state.run.currentStory).toBeNull();
    expect(state.run.currentPhase).toBeNull();
    expect(state.run.lastAction).toBeNull();
    expect(state.run.acProgress).toBeNull();
  });

  it('fails with exit code 1 when no flags provided', async () => {
    const { stdout, exitCode } = await runCli(['progress']);

    expect(exitCode).toBe(1);
    expect(stdout).toContain('No progress fields specified');
  });

  it('supports --json output for update', async () => {
    const { stdout, exitCode } = await runCli([
      '--json', 'progress',
      '--story', 'test-story',
      '--phase', 'create',
    ]);

    expect(exitCode).toBeUndefined();
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('ok');
    expect(parsed.updated.currentStory).toBe('test-story');
  });

  it('rejects invalid phase value', async () => {
    const { stdout, exitCode } = await runCli([
      'progress',
      '--phase', 'garbage',
    ]);

    expect(exitCode).toBe(1);
    expect(stdout).toContain('Invalid phase');
    expect(stdout).toContain('garbage');
  });

  it('supports --json output for --clear', async () => {
    const { stdout, exitCode } = await runCli([
      '--json', 'progress', '--clear',
    ]);

    expect(exitCode).toBeUndefined();
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('ok');
    expect(parsed.cleared).toBe(true);
  });
});
