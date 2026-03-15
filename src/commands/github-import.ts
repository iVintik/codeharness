import { Command } from 'commander';
import { ok, fail, info, jsonOutput } from '../lib/output.js';
import { createOrFindIssue, buildGapId } from '../lib/beads.js';
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
 * Maps GitHub labels to a beads issue type.
 * bug -> bug, enhancement -> story, default -> task.
 */
function mapLabelsToType(labels: Array<{ name: string }> | undefined): string {
  if (!labels) return 'task';
  const names = labels.map(l => l.name);
  if (names.includes('bug')) return 'bug';
  if (names.includes('enhancement')) return 'story';
  return 'task';
}

/**
 * Maps GitHub labels to a beads issue priority.
 * priority:high -> 1, priority:low -> 3, default -> 2.
 */
function mapLabelsToPriority(labels: Array<{ name: string }> | undefined): number {
  if (!labels) return 2;
  const names = labels.map(l => l.name);
  if (names.includes('priority:high')) return 1;
  if (names.includes('priority:low')) return 3;
  return 2;
}

export function registerGithubImportCommand(program: Command): void {
  program
    .command('github-import')
    .description('Import GitHub issues labeled for sprint planning into beads')
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

      let imported = 0;
      let skipped = 0;
      let errors = 0;
      const issues: ImportedIssue[] = [];

      for (const ghIssue of ghIssues) {
        const gapId = buildGapId('source', `github:${repo}#${ghIssue.number}`);
        const type = mapLabelsToType(ghIssue.labels);
        const priority = mapLabelsToPriority(ghIssue.labels);

        // Truncate title to reasonable length
        const title =
          ghIssue.title.length > MAX_TITLE_LENGTH
            ? ghIssue.title.slice(0, MAX_TITLE_LENGTH - 3) + '...'
            : ghIssue.title;

        try {
          const result = createOrFindIssue(title, gapId, {
            type,
            priority,
            description: ghIssue.body ?? '',
          });

          const issueRecord: ImportedIssue = {
            number: ghIssue.number,
            title,
            gapId,
            type,
            created: result.created,
          };

          issues.push(issueRecord);

          if (result.created) {
            imported++;
            if (!isJson) {
              ok(`Imported: ${repo}#${ghIssue.number} — ${title}`);
            }
          } else {
            skipped++;
            if (!isJson) {
              info(`Skipping existing: ${repo}#${ghIssue.number} — ${title}`);
            }
          }
        } catch (err: unknown) {
          errors++;
          const message = err instanceof Error ? err.message : String(err);
          fail(`Failed to import ${repo}#${ghIssue.number}: ${message}`, { json: isJson });
        }
      }

      if (errors > 0) {
        process.exitCode = 1;
      }

      if (isJson) {
        jsonOutput({
          imported,
          skipped,
          errors,
          issues: issues as unknown[] as Record<string, unknown>[],
        });
      } else if (ghIssues.length > 0) {
        info(`Summary: ${imported} imported, ${skipped} skipped, ${errors} errors`);
      }
    });
}
