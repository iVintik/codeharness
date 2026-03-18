import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { registerTimeoutReportCommand } from '../timeout-report.js';

let testDir: string;
let originalCwd: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-timeout-report-cmd-'));
  mkdirSync(join(testDir, 'ralph', 'logs'), { recursive: true });
  originalCwd = process.cwd();
  process.chdir(testDir);

  // Create a fake output log
  writeFileSync(join(testDir, 'ralph', 'logs', 'output.log'), 'line 1\nline 2\n');

  // Create a fake state snapshot
  writeFileSync(join(testDir, 'ralph', '.state-snapshot.json'), '{"stories":{}}');

  // Create current sprint-state.json
  writeFileSync(join(testDir, 'sprint-state.json'), '{"stories":{}}');
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
  registerTimeoutReportCommand(program);
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

describe('timeout-report command', () => {
  it('creates report file with valid options', async () => {
    const { stdout } = await runCli([
      'timeout-report',
      '--story', '3-1-test',
      '--iteration', '1',
      '--duration', '30',
      '--output-file', join(testDir, 'ralph', 'logs', 'output.log'),
      '--state-snapshot', join(testDir, 'ralph', '.state-snapshot.json'),
    ]);
    expect(stdout).toContain('[OK]');
    expect(stdout).toContain('Timeout report written');
    expect(stdout).toContain('timeout-report-1-3-1-test.md');
  });

  it('rejects non-numeric iteration', async () => {
    const { stdout } = await runCli([
      'timeout-report',
      '--story', '3-1-test',
      '--iteration', 'abc',
      '--duration', '30',
      '--output-file', join(testDir, 'ralph', 'logs', 'output.log'),
      '--state-snapshot', join(testDir, 'ralph', '.state-snapshot.json'),
    ]);
    expect(stdout).toContain('[FAIL]');
    expect(stdout).toContain('iteration and duration must be numbers');
    expect(process.exitCode).toBe(1);
  });

  it('rejects non-numeric duration', async () => {
    const { stdout } = await runCli([
      'timeout-report',
      '--story', '3-1-test',
      '--iteration', '1',
      '--duration', 'xyz',
      '--output-file', join(testDir, 'ralph', 'logs', 'output.log'),
      '--state-snapshot', join(testDir, 'ralph', '.state-snapshot.json'),
    ]);
    expect(stdout).toContain('[FAIL]');
    expect(stdout).toContain('iteration and duration must be numbers');
    expect(process.exitCode).toBe(1);
  });

  it('handles capture failure gracefully', async () => {
    const { stdout } = await runCli([
      'timeout-report',
      '--story', '3-1-test',
      '--iteration', '0',
      '--duration', '30',
      '--output-file', join(testDir, 'ralph', 'logs', 'output.log'),
      '--state-snapshot', join(testDir, 'ralph', '.state-snapshot.json'),
    ]);
    expect(stdout).toContain('[FAIL]');
    expect(stdout).toContain('Invalid iteration number');
    expect(process.exitCode).toBe(1);
  });
});

describe('timeout-report --json', () => {
  it('outputs JSON on success', async () => {
    const { stdout } = await runCli([
      '--json',
      'timeout-report',
      '--story', '3-1-test',
      '--iteration', '1',
      '--duration', '30',
      '--output-file', join(testDir, 'ralph', 'logs', 'output.log'),
      '--state-snapshot', join(testDir, 'ralph', '.state-snapshot.json'),
    ]);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('ok');
    expect(parsed.reportPath).toContain('timeout-report-1-3-1-test.md');
    expect(parsed.storyKey).toBe('3-1-test');
    expect(parsed.iteration).toBe(1);
  });

  it('outputs JSON on validation failure', async () => {
    const { stdout } = await runCli([
      '--json',
      'timeout-report',
      '--story', '3-1-test',
      '--iteration', 'bad',
      '--duration', '30',
      '--output-file', join(testDir, 'ralph', 'logs', 'output.log'),
      '--state-snapshot', join(testDir, 'ralph', '.state-snapshot.json'),
    ]);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('fail');
    expect(parsed.message).toContain('iteration and duration must be numbers');
  });

  it('outputs JSON on capture failure', async () => {
    const { stdout } = await runCli([
      '--json',
      'timeout-report',
      '--story', '3-1-test',
      '--iteration', '0',
      '--duration', '30',
      '--output-file', join(testDir, 'ralph', 'logs', 'output.log'),
      '--state-snapshot', join(testDir, 'ralph', '.state-snapshot.json'),
    ]);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('fail');
    expect(parsed.message).toContain('Invalid iteration number');
  });
});
