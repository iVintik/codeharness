import { describe, it, expect, vi } from 'vitest';
import { createProgram } from '../index.js';

describe('CLI entry point', () => {
  it('has correct name and description', () => {
    const program = createProgram();
    expect(program.name()).toBe('codeharness');
    expect(program.description()).toContain('autonomous coding agents');
  });

  it('reports a valid semver version', () => {
    const program = createProgram();
    expect(program.version()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('has --json global option', () => {
    const program = createProgram();
    const jsonOpt = program.options.find(o => o.long === '--json');
    expect(jsonOpt).toBeDefined();
  });

  it('registers all 25 commands', () => {
    const program = createProgram();
    const commands = program.commands.filter(
      (c) => c.name() !== 'help'
    );
    const names = commands.map(c => c.name()).sort();
    expect(names).toEqual([
      'audit', 'bridge', 'coverage', 'doc-health', 'gate', 'github-import', 'init', 'issue', 'observability-gate', 'onboard', 'progress', 'query', 'retro-import', 'run', 'stack', 'state', 'stats', 'status', 'sync', 'teardown', 'timeout-report', 'validate', 'validate-state', 'verify', 'verify-env',
    ]);
  });

  it('registers stack command with subcommands', () => {
    const program = createProgram();
    const stackCmd = program.commands.find(c => c.name() === 'stack');
    expect(stackCmd).toBeDefined();
    const subNames = stackCmd!.commands.map(c => c.name()).sort();
    expect(subNames).toEqual(['start', 'status', 'stop']);
  });

  it('registers state command with subcommands', () => {
    const program = createProgram();
    const stateCmd = program.commands.find(c => c.name() === 'state');
    expect(stateCmd).toBeDefined();
    const subNames = stateCmd!.commands.map(c => c.name()).sort();
    expect(subNames).toEqual(['get', 'reset-session', 'set', 'show']);
  });

  it('--version outputs version string', async () => {
    const program = createProgram();
    program.exitOverride();
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    try {
      await program.parseAsync(['node', 'test', '--version']);
    } catch {
      // Commander throws on --version with exitOverride
    }

    expect(writeSpy).toHaveBeenCalledWith(expect.stringMatching(/\d+\.\d+\.\d+/));
    writeSpy.mockRestore();
  });
});
