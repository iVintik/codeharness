import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from 'commander';
import { registerDriversCommand } from '../drivers.js';
import { resetDrivers } from '../../lib/agents/drivers/factory.js';

beforeEach(() => {
  resetDrivers();
});

function createCli(): Command {
  const program = new Command();
  program.option('--json', 'JSON output');
  registerDriversCommand(program);
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

describe('codeharness drivers command', () => {
  it('outputs JSON with all registered drivers', async () => {
    const { stdout } = await runCli(['drivers']);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('claude-code');
    expect(parsed).toHaveProperty('opencode');
  });

  it('each driver entry has defaultModel, capabilities, and description', async () => {
    const { stdout } = await runCli(['drivers']);
    const parsed = JSON.parse(stdout);
    for (const name of ['claude-code', 'opencode']) {
      expect(parsed[name]).toHaveProperty('defaultModel');
      expect(parsed[name]).toHaveProperty('capabilities');
      expect(parsed[name]).toHaveProperty('description');
      expect(typeof parsed[name].defaultModel).toBe('string');
      expect(typeof parsed[name].capabilities).toBe('object');
      expect(typeof parsed[name].description).toBe('string');
    }
  });

  it('capabilities include costTier for all drivers', async () => {
    const { stdout } = await runCli(['drivers']);
    const parsed = JSON.parse(stdout);
    expect(parsed['claude-code'].capabilities.costTier).toBe(3);
    expect(parsed['opencode'].capabilities.costTier).toBe(2);
  });

  it('--json flag produces parseable JSON', async () => {
    const { stdout } = await runCli(['--json', 'drivers']);
    expect(() => JSON.parse(stdout)).not.toThrow();
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('claude-code');
  });

  it('default output is pretty-printed (indented), --json is compact', async () => {
    const { stdout: pretty } = await runCli(['drivers']);
    const { stdout: compact } = await runCli(['--json', 'drivers']);
    // Pretty-printed output has newlines/indentation
    expect(pretty).toContain('\n');
    expect(pretty).toMatch(/^\{\n/);
    // Compact JSON is a single line
    const compactLines = compact.split('\n').filter(l => l.trim().length > 0);
    expect(compactLines).toHaveLength(1);
  });

  it('exits with code 0', async () => {
    process.exitCode = undefined;
    await runCli(['drivers']);
    expect(process.exitCode).toBeUndefined();
  });
});
