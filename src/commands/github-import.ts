import { Command } from 'commander';
import { fail, info, jsonOutput } from '../lib/output.js';
import { isGhAvailable, ghIssueSearch, getRepoFromRemote } from '../lib/github.js';
import type { GhIssue } from '../lib/github.js';

/** Maximum length for issue titles derived from GitHub issue titles. */
const MAX_TITLE_LENGTH = 120;

interface ImportedIssue {
  number: number;
  title: string;
  gapId: string;
  type: string;
  created: boolean;
}

/**
 * Maps GitHub labels to an issue type string.
 * bug -> bug, enhancement -> story, default -> task.
 */
function mapLabelsToType(labels: Array<{ name: string }> | undefined): string {
  if (!labels) return 'task';
  const names = labels.map(l => l.name);
  if (names.includes('bug')) return 'bug';
  if (names.includes('enhancement')) return 'story';
  return 'task';
}


export function registerGithubImportCommand(program: Command): void {
  program
    .command('github-import')
    .description('Import GitHub issues labeled for sprint planning')
    .option('--repo <owner/repo>', 'GitHub repository (auto-detected from git remote if omitted)')
    .option('--label <label>', 'GitHub label to filter issues by', 'sprint-candidate')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const isJson = globalOpts.json === true;

      // Check gh CLI availability
      if (!isGhAvailable()) {
        fail('gh CLI not found. Install: https://cli.github.com/', { json: isJson });
        process.exitCode = 1;
        return;
      }

      // Resolve repo
      let repo: string | undefined = opts.repo;
      if (!repo) {
        repo = getRepoFromRemote();
      }
      if (!repo) {
        fail('Cannot detect repo. Use --repo owner/repo', { json: isJson });
        process.exitCode = 1;
        return;
      }

      // Query GitHub issues
      const label: string = opts.label;
      let ghIssues: GhIssue[];
      try {
        ghIssues = ghIssueSearch(repo, `label:${label}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        fail(`Failed to search GitHub issues: ${message}`, { json: isJson });
        process.exitCode = 1;
        return;
      }

      // TODO: v2 issue tracker (Epic 8) — beads import removed, just collect issue info
      const imported = 0;
      const skipped = 0;
      const errors = 0;
      const issues: ImportedIssue[] = [];

      for (const ghIssue of ghIssues) {
        const gapId = `[gap:source:github:${repo}#${ghIssue.number}]`;
        const type = mapLabelsToType(ghIssue.labels);

        // Truncate title to reasonable length
        const title =
          ghIssue.title.length > MAX_TITLE_LENGTH
            ? ghIssue.title.slice(0, MAX_TITLE_LENGTH - 3) + '...'
            : ghIssue.title;

        const issueRecord: ImportedIssue = {
          number: ghIssue.number,
          title,
          gapId,
          type,
          created: false,
        };

        issues.push(issueRecord);

        if (!isJson) {
          info(`Parsed: ${repo}#${ghIssue.number} — ${title}`);
        }
      }

      if (isJson) {
        jsonOutput({
          imported,
          skipped,
          errors,
          issues: issues as unknown[] as Record<string, unknown>[],
        });
      } else if (ghIssues.length > 0) {
        info(`Summary: ${ghIssues.length} issues found, ${imported} imported (beads removed — Epic 8)`);
      }
    });
}
