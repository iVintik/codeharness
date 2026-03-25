import { Command } from 'commander';
import { ok, fail, info, jsonOutput } from '../lib/output.js';
import { listIssues, updateIssue, closeIssue, isBeadsCLIInstalled } from '../lib/beads.js';
import {
  syncAll,
  syncStoryFileToBeads,
  syncBeadsToStoryFile,
} from '../lib/sync/index.js';
import type { SyncDirection, SyncResult } from '../lib/sync/index.js';

export interface SyncCommandResult {
  status: 'ok' | 'fail';
  synced: number;
  already_in_sync: number;
  errors: number;
  results: SyncResult[];
}

const VALID_DIRECTIONS = new Set(['beads-to-files', 'files-to-beads', 'bidirectional']);

export function registerSyncCommand(program: Command): void {
  program
    .command('sync')
    .description('Synchronize beads issue statuses with story files and sprint-status.yaml')
    .option('--direction <dir>', 'Sync direction: beads-to-files, files-to-beads, or bidirectional', 'bidirectional')
    .option('--story <key>', 'Sync only a single story by key')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as { json?: boolean };
      const isJson = globalOpts.json ?? false;
      const direction = opts.direction as string;
      const storyKey = opts.story as string | undefined;

      // Validate direction
      if (!VALID_DIRECTIONS.has(direction)) {
        fail(`Invalid direction: ${direction}. Must be one of: beads-to-files, files-to-beads, bidirectional`, { json: isJson });
        process.exitCode = 2;
        return;
      }

      // Check if beads CLI is installed before attempting sync
      if (!isBeadsCLIInstalled()) {
        info('beads CLI not installed -- skipping', { json: isJson });
        process.exitCode = 0;
        return;
      }

      const beadsFns = {
        listIssues,
        updateIssue,
        closeIssue,
      };

      let results: SyncResult[];

      try {
        if (storyKey) {
          // Single story sync
          let result: SyncResult;
          if (direction === 'files-to-beads') {
            result = syncStoryFileToBeads(storyKey, beadsFns);
          } else {
            // For beads-to-files and bidirectional, find the beads issue by story key
            const issues = listIssues();
            const matchingIssue = issues.find(i => {
              const desc = i.description;
              if (!desc) return false;
              return desc.includes(storyKey);
            });
            if (!matchingIssue) {
              fail(`No beads issue found for story: ${storyKey}`, { json: isJson });
              process.exitCode = 1;
              return;
            }
            result = syncBeadsToStoryFile(matchingIssue.id, { listIssues: () => issues });
          }
          results = [result];
        } else {
          // Sync all
          results = syncAll(direction as SyncDirection, beadsFns);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        fail(`Sync failed: ${message}`, { json: isJson });
        process.exitCode = 1;
        return;
      }

      const syncedCount = results.filter(r => r.synced).length;
      const alreadyInSync = results.filter(r => !r.synced && !r.error).length;
      const errorCount = results.filter(r => !!r.error).length;

      if (isJson) {
        const commandResult: SyncCommandResult = {
          status: errorCount > 0 && syncedCount === 0 ? 'fail' : 'ok',
          synced: syncedCount,
          already_in_sync: alreadyInSync,
          errors: errorCount,
          results,
        };
        jsonOutput(commandResult as unknown as Record<string, unknown>);
      } else {
        // Print per-story results
        for (const r of results) {
          if (r.synced) {
            ok(`${r.storyKey}: ${r.previousStatus} -> ${r.newStatus}`);
          } else if (r.error) {
            fail(`${r.storyKey || r.beadsId}: ${r.error}`);
          } else {
            info(`${r.storyKey}: already in sync (${r.previousStatus})`);
          }
        }

        // Print summary
        ok(`Sync: ${syncedCount} stories synced, ${alreadyInSync} already in sync, ${errorCount} errors`);
      }

      process.exitCode = 0;
    });
}
