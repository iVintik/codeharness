import { Command } from 'commander';
import { ok, fail, info, warn, jsonOutput } from '../lib/output.js';
import {
  scanDocHealth,
  checkStoryDocFreshness,
  printDocHealthOutput,
} from '../lib/doc-health/index.js';

export function registerDocHealthCommand(program: Command): void {
  program
    .command('doc-health')
    .description('Scan documentation for freshness and quality issues')
    .option('--json', 'Machine-readable JSON output')
    .option('--story <id>', 'Check only modules changed by a specific story')
    .option('--fix', 'Auto-generate missing AGENTS.md stubs (placeholder)')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const isJson = opts.json === true || globalOpts.json === true;
      const storyId: string | undefined = opts.story;
      const root = process.cwd();

      // --fix is a placeholder for future implementation
      if (opts.fix) {
        if (isJson) {
          jsonOutput({ status: 'fail', message: '--fix is not yet implemented' });
        } else {
          warn('--fix is not yet implemented');
        }
      }

      // Run scan
      let report;
      try {
        if (storyId) {
          report = checkStoryDocFreshness(storyId, root);
        } else {
          report = scanDocHealth(root);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (isJson) {
          jsonOutput({ status: 'fail', message: `Scan failed: ${message}` });
        } else {
          fail(`Scan failed: ${message}`);
        }
        process.exitCode = 1;
        return;
      }

      // Output results
      if (isJson) {
        const status = report.passed ? 'ok' : 'fail';
        jsonOutput({
          status,
          documents: report.documents.map(d => ({
            ...d,
            lastModified: d.lastModified?.toISOString() ?? null,
            codeLastModified: d.codeLastModified?.toISOString() ?? null,
          })),
          summary: report.summary,
          scanDurationMs: report.scanDurationMs,
        });
      } else {
        printDocHealthOutput(report);
        if (storyId) {
          info(`Story: ${storyId}`);
        }
        info(`Scan completed in ${report.scanDurationMs}ms`);
      }

      // Exit code
      if (!report.passed) {
        process.exitCode = 1;
      }
    });
}
