/**
 * codeharness drivers — Query the driver capability matrix.
 *
 * Outputs a JSON object with each registered driver's default model,
 * capabilities, and a human-readable description.
 *
 * @see architecture-multi-framework.md — FR37: queryable driver capabilities
 */

import { Command } from 'commander';
import { jsonOutput } from '../lib/output.js';
import { listDrivers, getDriver, registerDriver } from '../lib/agents/drivers/factory.js';
import { ClaudeCodeDriver } from '../lib/agents/drivers/claude-code.js';
import { CodexDriver } from '../lib/agents/drivers/codex.js';
import { OpenCodeDriver } from '../lib/agents/drivers/opencode.js';

/** Static description map — avoids changing the AgentDriver interface for display concerns. */
const DRIVER_DESCRIPTIONS: Record<string, string> = {
  'claude-code': 'Anthropic Claude via Agent SDK (in-process)',
  codex: 'OpenAI Codex via CLI',
  opencode: 'OpenCode via CLI',
};

/**
 * Ensure all built-in drivers are registered.
 * Safe to call multiple times — skips already-registered drivers.
 */
export function ensureDriversRegistered(): void {
  const registered = new Set(listDrivers());
  if (!registered.has('claude-code')) registerDriver(new ClaudeCodeDriver());
  if (!registered.has('codex')) registerDriver(new CodexDriver());
  if (!registered.has('opencode')) registerDriver(new OpenCodeDriver());
}

export function registerDriversCommand(program: Command): void {
  program
    .command('drivers')
    .description('List registered drivers and their capabilities')
    .action((_options, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const isJson = !!globalOpts.json;

      ensureDriversRegistered();

      const result: Record<string, unknown> = {};
      for (const name of listDrivers()) {
        const driver = getDriver(name);
        result[name] = {
          defaultModel: driver.defaultModel,
          capabilities: { ...driver.capabilities },
          description: DRIVER_DESCRIPTIONS[name] ?? name,
        };
      }

      if (isJson) {
        jsonOutput(result);
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    });
}
