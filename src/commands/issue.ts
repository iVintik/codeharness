/**
 * Issue command — create, list, and close issues via CLI.
 */

import { Command } from 'commander';
import { createIssue, closeIssue, readIssues } from '../lib/issue-tracker.js';
import { ok, fail, info, jsonOutput } from '../lib/output.js';

export function registerIssueCommand(program: Command): void {
  const issueCmd = program
    .command('issue')
    .description('Create, list, and manage issues');

  issueCmd
    .command('create <title>')
    .description('Create a new issue')
    .option('--priority <priority>', 'Issue priority (low, medium, high, critical)', 'medium')
    .option('--source <source>', 'Issue source', 'manual')
    .action((title: string, options: { priority: string; source: string }, cmd: Command) => {
      const opts = cmd.optsWithGlobals() as { json?: boolean };
      const isJson = opts.json === true;

      try {
        const issue = createIssue(title, {
          priority: options.priority,
          source: options.source,
        });
        if (isJson) {
          jsonOutput(issue as Record<string, unknown>);
        } else {
          ok(`Created ${issue.id}: ${issue.title} [${issue.priority}]`);
        }
      } catch (err) {
        fail((err as Error).message, { json: isJson });
        process.exitCode = 1;
      }
    });

  issueCmd
    .command('list')
    .description('List all issues')
    .action((_, cmd: Command) => {
      const opts = cmd.optsWithGlobals() as { json?: boolean };
      const isJson = opts.json === true;

      try {
        const data = readIssues();

        if (data.issues.length === 0) {
          if (isJson) {
            jsonOutput({ issues: [] });
          } else {
            info('No issues found');
          }
          return;
        }

        if (isJson) {
          jsonOutput({ issues: data.issues as unknown as Record<string, unknown>[] });
          return;
        }

        for (const issue of data.issues) {
          console.log(`${issue.id}  ${issue.title}  [${issue.priority}]  ${issue.status}  (${issue.source})`);
        }
      } catch (err) {
        fail((err as Error).message, { json: isJson });
        process.exitCode = 1;
      }
    });

  issueCmd
    .command('close <id>')
    .description('Close an issue (set status to done)')
    .action((id: string, _, cmd: Command) => {
      const opts = cmd.optsWithGlobals() as { json?: boolean };
      const isJson = opts.json === true;

      try {
        const issue = closeIssue(id);
        if (isJson) {
          jsonOutput(issue as Record<string, unknown>);
        } else {
          ok(`Closed ${issue.id}: ${issue.title}`);
        }
      } catch (err) {
        fail((err as Error).message, { json: isJson });
        process.exitCode = 1;
      }
    });
}
