import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ok, fail, info, warn, jsonOutput } from '../lib/output.js';
import { parseRetroActionItems, classifyFinding, parseRetroSections, isDuplicate, derivePriority } from '../lib/retro-parser.js';
import { createIssue, readIssues } from '../lib/issue-tracker.js';
import { isGhAvailable, findExistingGhIssue, ghIssueCreate, ensureLabels, getRepoFromRemote } from '../lib/github.js';
import { readState, StateFileNotFoundError } from '../lib/state.js';
import type { Classification } from '../lib/retro-parser.js';
import type { RetroIssueTarget } from '../lib/github.js';

const STORY_DIR = '_bmad-output/implementation-artifacts';

/** Maximum length for issue titles derived from action item descriptions. */
const MAX_TITLE_LENGTH = 120;

interface ImportedIssue {
  number: string;
  title: string;
  gapId: string;
  classification: string;
  created: boolean;
  status: string;
  notes: string;
}

interface LocalImportResult {
  imported: number;
  skipped: number;
  duplicates: number;
  issues: Array<{ id: string; title: string; source: string; priority: string }>;
}

interface GitHubResult {
  created: number;
  skipped: number;
  errors: number;
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
    .description('Import retrospective action items as GitHub issues')
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

      // ─── Local issues.yaml import ──────────────────────────────────────
      let localResult: LocalImportResult;
      try {
        localResult = importToIssuesYaml(content, epicNum, root, isJson);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (!isJson) {
          warn(`Local issues.yaml import failed: ${message}`);
        }
        localResult = { imported: 0, skipped: 0, duplicates: 0, issues: [] };
      }

      // Parse table-based action items for GitHub phase
      const items = parseRetroActionItems(content);

      // If both parsers found nothing, report and exit
      if (items.length === 0 && localResult.imported === 0 && localResult.skipped === 0 && localResult.duplicates === 0) {
        if (isJson) {
          jsonOutput({ imported: 0, skipped: 0, duplicates: 0, issues: [] });
        } else {
          info('No action items found in retro file');
        }
        return;
      }

      const issues: ImportedIssue[] = [];

      for (const item of items) {
        const classification = classifyFinding(item);
        const gapId = `[gap:retro:epic-${epicNum}-item-${item.number}]`;

        // Truncate title to reasonable length
        const title =
          item.description.length > MAX_TITLE_LENGTH
            ? item.description.slice(0, MAX_TITLE_LENGTH - 3) + '...'
            : item.description;

        const issueRecord: ImportedIssue = {
          number: item.number,
          title,
          gapId,
          classification: classificationToString(classification),
          created: false,
          status: item.status,
          notes: item.notes,
        };

        issues.push(issueRecord);

        if (!isJson) {
          info(`Parsed: ${title}`);
        }
      }

      // ─── GitHub Issue Creation Phase ────────────────────────────────────
      const githubResult = createGitHubIssues(issues, epicNum, isJson);

      if (isJson) {
        jsonOutput({
          imported: localResult.imported,
          skipped: localResult.skipped,
          duplicates: localResult.duplicates,
          issues: localResult.issues as unknown as Record<string, unknown>[],
          github: githubResult as unknown as Record<string, unknown>,
        });
      } else if (localResult.imported > 0 || localResult.duplicates > 0 || localResult.skipped > 0) {
        info(`Summary: ${localResult.imported} imported, ${localResult.skipped} skipped, ${localResult.duplicates} duplicates`);
      }
    });
}

/**
 * Import retro action items into `.codeharness/issues.yaml`.
 * Tries section-based parsing first, falls back to table-based parsing.
 */
function importToIssuesYaml(
  content: string,
  epicNum: number,
  dir: string,
  isJson: boolean,
): LocalImportResult {
  const source = `retro-epic-${epicNum}`;
  const result: LocalImportResult = { imported: 0, skipped: 0, duplicates: 0, issues: [] };

  // Read existing issue titles for dedup
  const existingIssues = readIssues(dir);
  const existingTitles = existingIssues.issues.map(i => i.title);

  // Strategy: try section-based first, fall back to table-based
  const sectionItems = parseRetroSections(content);
  const actionableSections = sectionItems.filter(i => i.section !== 'backlog');
  const backlogSections = sectionItems.filter(i => i.section === 'backlog');

  if (actionableSections.length > 0 || backlogSections.length > 0) {
    // Section-based format found
    for (const item of backlogSections) {
      result.skipped++;
      if (!isJson) {
        info(`Skipped (backlog — non-actionable): ${item.text}`);
      }
    }

    for (const item of actionableSections) {
      const priority = item.section === 'fix-now' ? 'high' : 'medium';

      // Check for duplicates
      const dupCheck = isDuplicate(item.text, existingTitles);
      if (dupCheck.duplicate) {
        result.duplicates++;
        if (!isJson) {
          info(`Skipped (duplicate of "${dupCheck.matchedTitle}"): ${item.text}`);
        }
        continue;
      }

      const issue = createIssue(item.text, { priority, source }, dir);
      existingTitles.push(issue.title);
      result.imported++;
      result.issues.push({ id: issue.id, title: issue.title, source: issue.source, priority: issue.priority });

      if (!isJson) {
        ok(`Imported [${issue.id}] (${priority}): ${item.text}`);
      }
    }

    return result;
  }

  // Fall back to table-based parsing
  const tableItems = parseRetroActionItems(content);

  if (tableItems.length === 0) {
    return result;
  }

  for (const item of tableItems) {
    const priorityNum = derivePriority(item);
    const priority = priorityNum === 1 ? 'high' : 'medium';

    // Check for duplicates
    const dupCheck = isDuplicate(item.description, existingTitles);
    if (dupCheck.duplicate) {
      result.duplicates++;
      if (!isJson) {
        info(`Skipped (duplicate of "${dupCheck.matchedTitle}"): ${item.description}`);
      }
      continue;
    }

    const issue = createIssue(item.description, { priority, source }, dir);
    existingTitles.push(issue.title);
    result.imported++;
    result.issues.push({ id: issue.id, title: issue.title, source: issue.source, priority: issue.priority });

    if (!isJson) {
      ok(`Imported [${issue.id}] (${priority}): ${item.description}`);
    }
  }

  return result;
}

/**
 * Resolves the target repo for a classification based on retro_issue_targets config.
 */
function resolveTargetRepo(
  classification: string,
  targets: RetroIssueTarget[],
): RetroIssueTarget | undefined {
  if (targets.length === 0) return undefined;

  if (classification === 'harness') {
    // Prefer explicit codeharness repo, then first non-auto, then auto as fallback
    const explicit = targets.find(t => t.repo === 'iVintik/codeharness');
    if (explicit) return explicit;
    const nonAuto = targets.find(t => t.repo !== 'auto');
    if (nonAuto) return nonAuto;
    return targets[0];
  }

  // project or tool:* → prefer auto, else first target
  const auto = targets.find(t => t.repo === 'auto');
  if (auto) return auto;
  return targets[0];
}

/**
 * Builds the GitHub issue body with retro context and gap-id for dedup.
 */
function buildGitHubIssueBody(
  item: ImportedIssue,
  epicNum: number,
  projectName: string,
): string {
  return `## Retro Action Item ${item.number} — Epic ${epicNum}

**Source project:** ${projectName}
**Classification:** ${item.classification}
**Original status:** ${item.status}
**Notes:** ${item.notes}

${item.title}

<!-- gap-id: ${item.gapId} -->`;
}

/**
 * GitHub issue creation phase.
 */
function createGitHubIssues(
  issues: ImportedIssue[],
  epicNum: number,
  isJson: boolean,
): GitHubResult | undefined {
  // Read state to check for retro_issue_targets
  let targets: RetroIssueTarget[] | undefined;
  try {
    const state = readState();
    targets = state.retro_issue_targets;
  } catch (err: unknown) {
    if (err instanceof StateFileNotFoundError) {
      if (!isJson) {
        info('No state file found — skipping GitHub issues');
      }
      return undefined;
    }
    // Other state errors — skip GitHub phase gracefully
    if (!isJson) {
      info('Could not read state file — skipping GitHub issues');
    }
    return undefined;
  }

  if (!targets || targets.length === 0) {
    if (!isJson) {
      info('No retro_issue_targets configured — skipping GitHub issues');
    }
    return undefined;
  }

  // Check gh CLI availability
  if (!isGhAvailable()) {
    if (!isJson) {
      warn('gh CLI not available — skipping GitHub issue creation');
    }
    return undefined;
  }

  // Resolve "auto" repos
  const resolvedAutoRepo = getRepoFromRemote();

  const result: GitHubResult = { created: 0, skipped: 0, errors: 0 };

  // Detect project name from git remote
  const projectName = resolvedAutoRepo ?? 'unknown';

  for (const item of issues) {
    const target = resolveTargetRepo(item.classification, targets);
    if (!target) continue;

    // Resolve actual repo name
    const repo = target.repo === 'auto' ? resolvedAutoRepo : target.repo;
    if (!repo) {
      if (!isJson) {
        warn(`Cannot resolve repo for ${item.number} — git remote not detected`);
      }
      result.errors++;
      continue;
    }

    try {
      // Check for existing issue (dedup)
      const existing = findExistingGhIssue(repo, item.gapId);
      if (existing) {
        if (!isJson) {
          info(`GitHub issue exists: ${repo}#${existing.number}`);
        }
        result.skipped++;
        continue;
      }

      // Ensure labels exist
      ensureLabels(repo, target.labels);

      // Create the issue
      const body = buildGitHubIssueBody(item, epicNum, projectName);
      const created = ghIssueCreate(repo, item.title, body, target.labels);
      if (!isJson) {
        ok(`GitHub issue created: ${repo}#${created.number}`);
      }
      result.created++;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (!isJson) {
        fail(`GitHub issue failed for ${item.number}: ${message}`);
      }
      result.errors++;
    }
  }

  return result;
}
