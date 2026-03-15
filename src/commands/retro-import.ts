import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ok, fail, info, jsonOutput } from '../lib/output.js';
import { parseRetroActionItems, classifyFinding, derivePriority } from '../lib/retro-parser.js';
import { createOrFindIssue, buildGapId } from '../lib/beads.js';
import type { Classification } from '../lib/retro-parser.js';

const STORY_DIR = '_bmad-output/implementation-artifacts';

/** Maximum length for issue titles derived from action item descriptions. */
const MAX_TITLE_LENGTH = 120;

interface ImportedIssue {
  number: string;
  title: string;
  gapId: string;
  classification: string;
  created: boolean;
}

function classificationToString(c: Classification): string {
  if (c.type === 'tool') {
    return `tool:${c.name}`;
  }
  return c.type;
}

export function registerRetroImportCommand(program: Command): void {
  program
    .command('retro-import')
    .description('Import retrospective action items as beads issues')
    .requiredOption('--epic <n>', 'Epic number to import action items from')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const isJson = globalOpts.json === true;
      const root = process.cwd();

      // Validate epic number
      const epicNum = parseInt(opts.epic, 10);
      if (isNaN(epicNum) || epicNum < 1) {
        fail(`Invalid epic number: ${opts.epic}`, { json: isJson });
        process.exitCode = 1;
        return;
      }

      // Read retro file
      const retroFile = `epic-${epicNum}-retrospective.md`;
      const retroPath = join(root, STORY_DIR, retroFile);

      if (!existsSync(retroPath)) {
        fail(`Retro file not found: ${retroFile}`, { json: isJson });
        process.exitCode = 1;
        return;
      }

      let content: string;
      try {
        content = readFileSync(retroPath, 'utf-8');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        fail(`Failed to read retro file: ${message}`, { json: isJson });
        process.exitCode = 1;
        return;
      }

      // Parse action items
      const items = parseRetroActionItems(content);

      if (items.length === 0) {
        if (isJson) {
          jsonOutput({ imported: 0, skipped: 0, issues: [] });
        } else {
          info('No action items found in retro file');
        }
        return;
      }

      // Import each action item
      let imported = 0;
      let skipped = 0;
      const issues: ImportedIssue[] = [];

      for (const item of items) {
        const classification = classifyFinding(item);
        const priority = derivePriority(item);
        const gapId = buildGapId('retro', `epic-${epicNum}-item-${item.number}`);

        // Truncate title to reasonable length
        const title =
          item.description.length > MAX_TITLE_LENGTH
            ? item.description.slice(0, MAX_TITLE_LENGTH - 3) + '...'
            : item.description;

        const retroContext = `Retro action item ${item.number} from Epic ${epicNum}.\nStatus: ${item.status}\nNotes: ${item.notes}\nClassification: ${classificationToString(classification)}`;

        try {
          const result = createOrFindIssue(title, gapId, {
            type: 'task',
            priority,
            description: retroContext,
          });

          const issueRecord: ImportedIssue = {
            number: item.number,
            title,
            gapId,
            classification: classificationToString(classification),
            created: result.created,
          };

          issues.push(issueRecord);

          if (result.created) {
            imported++;
            if (!isJson) {
              ok(`Imported: ${title}`);
            }
          } else {
            skipped++;
            if (!isJson) {
              info(`Skipping existing: ${title}`);
            }
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          fail(`Failed to import ${item.number}: ${message}`, { json: isJson });
        }
      }

      if (isJson) {
        jsonOutput({ imported, skipped, issues: issues as unknown as Record<string, unknown>[] });
      }
    });
}
