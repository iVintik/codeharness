import { Command } from 'commander';
import { registerInitCommand } from './commands/init.js';
import { registerBridgeCommand } from './commands/bridge.js';
import { registerRunCommand } from './commands/run.js';
import { registerVerifyCommand } from './commands/verify.js';
import { registerStatusCommand } from './commands/status.js';
import { registerOnboardCommand } from './commands/onboard.js';
import { registerTeardownCommand } from './commands/teardown.js';
import { registerStateCommand } from './commands/state.js';
import { registerSyncCommand } from './commands/sync.js';
import { registerCoverageCommand } from './commands/coverage.js';
import { registerDocHealthCommand } from './commands/doc-health.js';
import { registerStackCommand } from './commands/stack.js';
import { registerQueryCommand } from './commands/query.js';
import { registerRetroImportCommand } from './commands/retro-import.js';
import { registerGithubImportCommand } from './commands/github-import.js';
import { registerVerifyEnvCommand } from './commands/verify-env.js';
import { registerRetryCommand } from './commands/retry.js';

declare const __PKG_VERSION__: string;
const VERSION = typeof __PKG_VERSION__ !== 'undefined' ? __PKG_VERSION__ : '0.0.0-dev';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('codeharness')
    .description('Makes autonomous coding agents produce software that actually works')
    .version(VERSION)
    .option('--json', 'Output in machine-readable JSON format');

  registerInitCommand(program);
  registerBridgeCommand(program);
  registerRunCommand(program);
  registerVerifyCommand(program);
  registerStatusCommand(program);
  registerOnboardCommand(program);
  registerTeardownCommand(program);
  registerStateCommand(program);
  registerSyncCommand(program);
  registerCoverageCommand(program);
  registerDocHealthCommand(program);
  registerStackCommand(program);
  registerQueryCommand(program);
  registerRetroImportCommand(program);
  registerGithubImportCommand(program);
  registerVerifyEnvCommand(program);
  registerRetryCommand(program);

  return program;
}

// Only parse when running as CLI entry point, not when imported in tests
if (!process.env['VITEST']) {
  const program = createProgram();
  program.parse(process.argv);
}
