import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { registerValidateStateCommand } from '../validate-state.js';

let testDir: string;
let originalCwd: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-validate-state-cmd-'));
  originalCwd = process.cwd();
  process.chdir(testDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(testDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

function createCli(): Command {
  const program = new Command();
  program.exitOverride();
  program.option('--json', 'JSON output');
  registerValidateStateCommand(program);
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

const VALID_STATE = JSON.stringify({
  version: 1,
  sprint: { total: 2, done: 1, failed: 0, blocked: 0, inProgress: null },
  stories: {
    'story-a': {
      status: 'done',
      attempts: 1,
      lastAttempt: new Date().toISOString(),
      lastError: null,
      proofPath: null,
      acResults: null,
    },
    'story-b': {
      status: 'backlog',
      attempts: 0,
      lastAttempt: null,
      lastError: null,
      proofPath: null,
      acResults: null,
    },
  },
  run: { active: false, startedAt: null, iteration: 0, cost: 0, completed: [], failed: [] },
  actionItems: [],
});

const VALID_STATUS = `story-a:
  status: done
story-b:
  status: backlog
`;

const BAD_STATE = JSON.stringify({
  version: 1,
  sprint: { total: 1, done: 0, failed: 0, blocked: 0, inProgress: null },
  stories: {
    'story-a': {
      status: 'bogus-status',
      attempts: -3,
      lastAttempt: null,
      lastError: null,
      proofPath: null,
      acResults: null,
    },
  },
  run: { active: false, startedAt: null, iteration: 0, cost: 0, completed: [], failed: [] },
  actionItems: [],
});

describe('validate-state command', () => {
  it('reports all valid on good state', async () => {
    writeFileSync(join(testDir, 'sprint-state.json'), VALID_STATE);
    writeFileSync(join(testDir, 'sprint-status.yaml'), VALID_STATUS);

    const { stdout } = await runCli(['validate-state']);
    expect(stdout).toContain('Valid: 2');
    expect(stdout).toContain('Invalid: 0');
    expect(stdout).toContain('[OK]');
    expect(process.exitCode).toBe(0);
  });

  it('reports issues on bad state', async () => {
    writeFileSync(join(testDir, 'sprint-state.json'), BAD_STATE);
    writeFileSync(join(testDir, 'sprint-status.yaml'), `story-a:\n  status: backlog\nstory-b:\n  status: backlog\n`);

    const { stdout } = await runCli(['validate-state']);
    expect(stdout).toContain('[FAIL]');
    expect(process.exitCode).toBe(1);
  });

  it('fails when state file is missing', async () => {
    writeFileSync(join(testDir, 'sprint-status.yaml'), VALID_STATUS);

    const { stdout } = await runCli(['validate-state']);
    expect(stdout).toContain('[FAIL]');
    expect(stdout).toContain('State file not found');
    expect(process.exitCode).toBe(1);
  });

  it('accepts custom file paths', async () => {
    writeFileSync(join(testDir, 'custom-state.json'), VALID_STATE);
    writeFileSync(join(testDir, 'custom-status.yaml'), VALID_STATUS);

    const { stdout } = await runCli([
      'validate-state',
      '--state', 'custom-state.json',
      '--sprint-status', 'custom-status.yaml',
    ]);
    expect(stdout).toContain('[OK]');
    expect(process.exitCode).toBe(0);
  });
});

describe('validate-state --json', () => {
  it('outputs JSON on valid state', async () => {
    writeFileSync(join(testDir, 'sprint-state.json'), VALID_STATE);
    writeFileSync(join(testDir, 'sprint-status.yaml'), VALID_STATUS);

    const { stdout } = await runCli(['--json', 'validate-state']);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('ok');
    expect(parsed.totalStories).toBe(2);
    expect(parsed.invalidCount).toBe(0);
  });

  it('outputs JSON on invalid state', async () => {
    writeFileSync(join(testDir, 'sprint-state.json'), BAD_STATE);
    writeFileSync(join(testDir, 'sprint-status.yaml'), `story-a:\n  status: backlog\n`);

    const { stdout } = await runCli(['--json', 'validate-state']);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('fail');
    expect(parsed.invalidCount).toBeGreaterThan(0);
    expect(parsed.issues.length).toBeGreaterThan(0);
  });

  it('outputs JSON on missing file', async () => {
    const { stdout } = await runCli(['--json', 'validate-state']);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('fail');
    expect(parsed.message).toContain('State file not found');
  });
});
