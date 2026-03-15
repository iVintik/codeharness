import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { ok, fail, warn, info, jsonOutput } from '../lib/output.js';
import { parseEpicsFile, importStoriesToBeads } from '../lib/bmad.js';
import { createIssue, listIssues } from '../lib/beads.js';
import type { BridgeImportResult } from '../lib/bmad.js';

export interface BridgeResult {
  status: 'ok' | 'fail';
  epics_parsed: number;
  stories_processed: number;
  stories_created: number;
  stories_existing: number;
  results: BridgeImportResult[];
}

export function registerBridgeCommand(program: Command): void {
  program
    .command('bridge')
    .description('Bridge BMAD epics/stories into beads task store')
    .option('--epics <path>', 'Path to BMAD epics markdown file')
    .option('--dry-run', 'Parse and display without creating beads issues')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as { json?: boolean };
      const isJson = globalOpts.json ?? false;
      const epicsPath = opts.epics as string | undefined;
      const dryRun = (opts.dryRun as boolean | undefined) ?? false;

      // Validate --epics is provided
      if (!epicsPath) {
        fail('Missing required option: --epics <path>', { json: isJson });
        process.exitCode = 2;
        return;
      }

      // Validate epics file exists
      if (!existsSync(epicsPath)) {
        fail(`Epics file not found: ${epicsPath}`, { json: isJson });
        process.exitCode = 1;
        return;
      }

      // Parse the epics file
      const epics = parseEpicsFile(epicsPath);

      // Flatten all stories across epics
      const allStories = epics.flatMap(e => e.stories);

      // Handle empty file / no stories
      if (allStories.length === 0) {
        warn(`No stories found in ${epicsPath}`, { json: isJson });
        if (isJson) {
          jsonOutput({
            status: 'ok',
            epics_parsed: epics.length,
            stories_processed: 0,
            stories_created: 0,
            stories_existing: 0,
            results: [],
          });
        }
        process.exitCode = 0;
        return;
      }

      // Warn about stories without acceptance criteria (non-JSON only)
      if (!isJson) {
        for (const story of allStories) {
          if (story.acceptanceCriteria.length === 0) {
            warn(`Story ${story.title}: no acceptance criteria found`);
          }
        }
      }

      // Import stories into beads
      const results = importStoriesToBeads(
        allStories,
        { dryRun },
        { listIssues, createIssue },
      );

      const created = results.filter(r => r.status === 'created').length;
      const existing = results.filter(r => r.status === 'exists').length;

      if (!isJson) {
        // Print per-epic summary
        for (const epic of epics) {
          ok(`Epic ${epic.number}: ${epic.title} — ${epic.stories.length} stories`);
        }

        // Print deduplication info
        for (const r of results) {
          if (r.status === 'exists') {
            info(`Already tracked: ${r.title} (${r.beadsId})`);
          }
        }

        // Print dry-run details
        if (dryRun) {
          for (const r of results) {
            info(`Dry run: would import "${r.title}" → ${r.storyFilePath}`);
          }
        }

        // Print summary
        if (dryRun) {
          info(`Bridge: ${allStories.length} stories parsed (dry run, nothing created)`);
        } else {
          ok(`Bridge: ${allStories.length} stories processed (${created} new, ${existing} existing)`);
        }
      }

      // JSON output
      if (isJson) {
        const bridgeResult: BridgeResult = {
          status: 'ok',
          epics_parsed: epics.length,
          stories_processed: allStories.length,
          stories_created: created,
          stories_existing: existing,
          results,
        };
        jsonOutput(bridgeResult as unknown as Record<string, unknown>);
      }

      process.exitCode = 0;
    });
}
