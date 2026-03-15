import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { writeState, readState, getDefaultState } from '../../lib/state.js';
import { registerStateCommand } from '../state.js';
import * as stateLib from '../../lib/state.js';

let testDir: string;
let originalCwd: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-cmd-state-'));
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
  registerStateCommand(program);
  return program;
}

async function runCli(args: string[]): Promise<{ stdout: string; exitCode: number | undefined }> {
  const logs: string[] = [];
  const writeCalls: string[] = [];
  const consoleSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    logs.push(a.map(String).join(' '));
  });
  const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    writeCalls.push(String(chunk));
    return true;
  });
  process.exitCode = undefined;

  const program = createCli();
  await program.parseAsync(['node', 'codeharness', ...args]);

  consoleSpy.mockRestore();
  writeSpy.mockRestore();
  const exitCode = process.exitCode;
  process.exitCode = undefined;

  return { stdout: [...logs, ...writeCalls].join('\n'), exitCode };
}

describe('state show', () => {
  it('dumps full state as YAML', async () => {
    const state = getDefaultState('nodejs');
    writeState(state, testDir);

    const { stdout, exitCode } = await runCli(['state', 'show']);
    expect(stdout).toContain('harness_version');
    expect(stdout).toContain('nodejs');
    expect(exitCode).toBeUndefined();
  });

  it('dumps full state as JSON with --json', async () => {
    const state = getDefaultState('nodejs');
    writeState(state, testDir);

    const { stdout } = await runCli(['state', 'show', '--json']);
    const parsed = JSON.parse(stdout.split('\n').pop()!);
    expect(parsed.harness_version).toBe('0.1.0');
    expect(parsed.stack).toBe('nodejs');
  });

  it('shows error when no state file exists', async () => {
    const { stdout, exitCode } = await runCli(['state', 'show']);
    expect(stdout).toContain('No state file found');
    expect(exitCode).toBe(1);
  });

  it('re-throws unexpected errors', async () => {
    const state = getDefaultState();
    writeState(state, testDir);
    vi.spyOn(stateLib, 'readState').mockImplementation(() => { throw new Error('disk error'); });

    const program = createCli();
    await expect(program.parseAsync(['node', 'codeharness', 'state', 'show'])).rejects.toThrow('disk error');
    vi.restoreAllMocks();
  });
});

describe('state get', () => {
  it('retrieves top-level value', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);

    const { stdout } = await runCli(['state', 'get', 'initialized']);
    expect(stdout).toContain('true');
  });

  it('retrieves nested value with dot notation', async () => {
    const state = getDefaultState('nodejs');
    writeState(state, testDir);

    const { stdout } = await runCli(['state', 'get', 'session_flags.tests_passed']);
    expect(stdout).toContain('false');
  });

  it('shows error for missing key', async () => {
    const state = getDefaultState();
    writeState(state, testDir);

    const { stdout, exitCode } = await runCli(['state', 'get', 'nonexistent']);
    expect(stdout).toContain('not found');
    expect(exitCode).toBe(1);
  });

  it('shows error when no state file exists', async () => {
    const { stdout, exitCode } = await runCli(['state', 'get', 'stack']);
    expect(stdout).toContain('No state file found');
    expect(exitCode).toBe(1);
  });

  it('re-throws unexpected errors', async () => {
    const state = getDefaultState();
    writeState(state, testDir);
    vi.spyOn(stateLib, 'readState').mockImplementation(() => { throw new Error('disk error'); });

    const program = createCli();
    await expect(program.parseAsync(['node', 'codeharness', 'state', 'get', 'stack'])).rejects.toThrow('disk error');
    vi.restoreAllMocks();
  });

  it('outputs JSON with --json flag', async () => {
    const state = getDefaultState('nodejs');
    writeState(state, testDir);

    const { stdout } = await runCli(['state', 'get', 'stack', '--json']);
    const parsed = JSON.parse(stdout.split('\n').pop()!);
    expect(parsed.key).toBe('stack');
    expect(parsed.value).toBe('nodejs');
  });
});

describe('state set', () => {
  it('updates a value', async () => {
    const state = getDefaultState();
    writeState(state, testDir);

    await runCli(['state', 'set', 'session_flags.tests_passed', 'true']);

    const { stdout } = await runCli(['state', 'get', 'session_flags.tests_passed']);
    expect(stdout).toContain('true');
  });

  it('parses boolean values correctly', async () => {
    const state = getDefaultState();
    writeState(state, testDir);

    const { stdout } = await runCli(['state', 'set', 'initialized', 'true']);
    expect(stdout).toContain('Set initialized = true');
  });

  it('shows error when no state file exists', async () => {
    const { stdout, exitCode } = await runCli(['state', 'set', 'stack', 'python']);
    expect(stdout).toContain('No state file found');
    expect(exitCode).toBe(1);
  });

  it('re-throws unexpected errors', async () => {
    vi.spyOn(stateLib, 'readStateWithBody').mockImplementation(() => { throw new Error('disk error'); });

    const program = createCli();
    await expect(program.parseAsync(['node', 'codeharness', 'state', 'set', 'stack', 'python'])).rejects.toThrow('disk error');
    vi.restoreAllMocks();
  });

  it('outputs JSON with --json flag', async () => {
    const state = getDefaultState();
    writeState(state, testDir);

    const { stdout } = await runCli(['state', 'set', 'stack', 'python', '--json']);
    const parsed = JSON.parse(stdout.split('\n').pop()!);
    expect(parsed.status).toBe('ok');
    expect(parsed.key).toBe('stack');
    expect(parsed.value).toBe('python');
  });
});

describe('state reset-session', () => {
  it('resets all four session flags to false', async () => {
    const state = getDefaultState('nodejs');
    state.session_flags.tests_passed = true;
    state.session_flags.coverage_met = true;
    state.session_flags.verification_run = true;
    state.session_flags.logs_queried = true;
    writeState(state, testDir);

    const { stdout, exitCode } = await runCli(['state', 'reset-session']);
    expect(stdout).toContain('Session flags reset to false');
    expect(exitCode).toBeUndefined();

    // Verify all flags are now false
    const updated = readState(testDir);
    expect(updated.session_flags.tests_passed).toBe(false);
    expect(updated.session_flags.coverage_met).toBe(false);
    expect(updated.session_flags.verification_run).toBe(false);
    expect(updated.session_flags.logs_queried).toBe(false);
  });

  it('preserves other state values after reset', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    state.session_flags.tests_passed = true;
    state.session_flags.coverage_met = true;
    writeState(state, testDir);

    await runCli(['state', 'reset-session']);

    const updated = readState(testDir);
    expect(updated.initialized).toBe(true);
    expect(updated.stack).toBe('nodejs');
    expect(updated.session_flags.tests_passed).toBe(false);
  });

  it('outputs JSON with --json flag', async () => {
    const state = getDefaultState();
    state.session_flags.tests_passed = true;
    writeState(state, testDir);

    const { stdout } = await runCli(['state', 'reset-session', '--json']);
    const parsed = JSON.parse(stdout.split('\n').pop()!);
    expect(parsed.status).toBe('ok');
    expect(parsed.reset.tests_passed).toBe(false);
    expect(parsed.reset.coverage_met).toBe(false);
    expect(parsed.reset.verification_run).toBe(false);
    expect(parsed.reset.logs_queried).toBe(false);
  });

  it('shows error when no state file exists', async () => {
    const { stdout, exitCode } = await runCli(['state', 'reset-session']);
    expect(stdout).toContain('No state file found');
    expect(exitCode).toBe(1);
  });

  it('re-throws unexpected errors', async () => {
    vi.spyOn(stateLib, 'readStateWithBody').mockImplementation(() => { throw new Error('disk error'); });

    const program = createCli();
    await expect(program.parseAsync(['node', 'codeharness', 'state', 'reset-session'])).rejects.toThrow('disk error');
    vi.restoreAllMocks();
  });

  it('is idempotent — resetting already-false flags is safe', async () => {
    const state = getDefaultState();
    // All flags are already false by default
    writeState(state, testDir);

    const { exitCode } = await runCli(['state', 'reset-session']);
    expect(exitCode).toBeUndefined();

    const updated = readState(testDir);
    expect(updated.session_flags.tests_passed).toBe(false);
    expect(updated.session_flags.coverage_met).toBe(false);
    expect(updated.session_flags.verification_run).toBe(false);
    expect(updated.session_flags.logs_queried).toBe(false);
  });
});
