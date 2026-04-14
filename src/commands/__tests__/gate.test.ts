import { describe, it, expect, vi } from 'vitest';
import { Command } from 'commander';
import { registerGateCommand } from '../gate.js';

function createCli(): Command {
  const program = new Command();
  program.option('--json', 'JSON output');
  registerGateCommand(program);
  return program;
}

async function runCli(args: string[]): Promise<{ exitCode: number; output: string }> {
  const logs: string[] = [];
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')); });
  const errSpy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')); });

  const savedExitCode = process.exitCode;
  process.exitCode = undefined;

  const program = createCli();
  try {
    await program.parseAsync(['node', 'codeharness', ...args]);
  } catch {
    // commander may throw on missing required options
  }

  const exitCode = process.exitCode ?? 0;
  process.exitCode = savedExitCode;
  logSpy.mockRestore();
  errSpy.mockRestore();
  return { exitCode, output: logs.join('\n') };
}

describe('codeharness gate command', () => {
  describe('argument validation', () => {
    it('requires --name option', async () => {
      const program = createCli();
      program.exitOverride();
      let threw = false;
      try {
        await program.parseAsync(['node', 'codeharness', 'gate', '--key', 'test-key']);
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    });

    it('requires --key option', async () => {
      const program = createCli();
      program.exitOverride();
      let threw = false;
      try {
        await program.parseAsync(['node', 'codeharness', 'gate', '--name', 'quality']);
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    });
  });

  describe('project validation', () => {
    it('fails when plugin directory does not exist', async () => {
      const { exitCode, output } = await runCli([
        'gate', '--name', 'quality', '--key', 'test-key',
        '--project-dir', '/tmp/nonexistent-project-dir-xyz',
      ]);
      expect(exitCode).toBe(1);
      expect(output).toContain('Plugin directory not found');
    });
  });

  describe('workflow loading', () => {
    it('fails when workflow cannot be resolved', async () => {
      const { exitCode, output } = await runCli([
        'gate', '--name', 'quality', '--key', 'test-key',
        '--workflow', 'nonexistent-workflow-xyz',
      ]);
      expect(exitCode).toBe(1);
      expect(output).toContain('Failed to resolve workflow');
    });

    it('fails when gate name does not exist in workflow', async () => {
      const { exitCode, output } = await runCli([
        'gate', '--name', 'nonexistent-gate-xyz', '--key', 'test-key',
      ]);
      expect(exitCode).toBe(1);
      expect(output).toContain('not found in workflow');
    });
  });

  describe('command registration', () => {
    it('registers gate command with required options', () => {
      const program = createCli();
      const gateCmd = program.commands.find(c => c.name() === 'gate');
      expect(gateCmd).toBeDefined();
      expect(gateCmd!.description()).toContain('gate evaluation');
    });
  });
});
