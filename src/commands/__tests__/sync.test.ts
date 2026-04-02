import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerSyncCommand } from '../sync.js';

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

  it('outputs info message about beads removal', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'test', 'sync']);

    const calls = consoleSpy.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls).toContainEqual(expect.stringContaining('[INFO]'));
    expect(calls).toContainEqual(expect.stringContaining('beads integration removed'));
    expect(process.exitCode).toBe(0);
  });

  it('outputs JSON message with --json flag', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'test', '--json', 'sync']);

    const jsonCalls = consoleSpy.mock.calls.filter((c: unknown[]) => {
      try {
        JSON.parse(c[0] as string);
        return true;
      } catch {
        return false;
      }
    });
    expect(jsonCalls).toHaveLength(1);
    const result = JSON.parse(jsonCalls[0][0] as string) as Record<string, unknown>;
    expect(result.status).toBe('ok');
    expect(result.message).toContain('beads');
    expect(process.exitCode).toBe(0);
  });
});
