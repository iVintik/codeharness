import { Command } from 'commander';
import { info, jsonOutput } from '../lib/output.js';

// TODO: v2 issue tracker (Epic 8) — sync command reimplementation with new issue tracker

export interface SyncCommandResult {
  status: 'ok';
  message: string;
}

export function registerSyncCommand(program: Command): void {
  program
    .command('sync')
    .description('Synchronize issue statuses with story files and sprint-status.yaml')
    .option('--direction <dir>', 'Sync direction (reserved for Epic 8 issue tracker)', 'bidirectional')
    .option('--story <key>', 'Sync only a single story by key')
    .action((_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as { json?: boolean };
      const isJson = globalOpts.json ?? false;

      const message = 'Sync: beads integration removed — will be replaced by issue tracker in Epic 8';

      if (isJson) {
        jsonOutput({ status: 'ok', message });
      } else {
        info(message);
      }

      process.exitCode = 0;
    });
}
