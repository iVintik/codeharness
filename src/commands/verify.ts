import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ok, fail, warn, info, jsonOutput } from '../lib/output.js';
import { parseStoryACs } from '../lib/verify-parser.js';
import {
  checkPreconditions,
  createProofDocument,
  runShowboatVerify,
  proofHasContent,
  updateVerificationState,
  closeBeadsIssue,
} from '../lib/verify.js';
import { completeExecPlan } from '../lib/doc-health.js';
import { updateSprintStatus } from '../lib/beads-sync.js';
import type { VerifyResult } from '../lib/verify.js';

const STORY_DIR = '_bmad-output/implementation-artifacts';

/**
 * Validates that a story ID is safe for use in file paths.
 * Rejects path traversal sequences and characters that could escape the project directory.
 */
function isValidStoryId(storyId: string): boolean {
  // Reject empty, path traversal, absolute paths, and special characters
  if (!storyId || storyId.includes('..') || storyId.includes('/') || storyId.includes('\\')) {
    return false;
  }
  // Only allow alphanumeric, hyphens, and underscores
  return /^[a-zA-Z0-9_-]+$/.test(storyId);
}

export function registerVerifyCommand(program: Command): void {
  program
    .command('verify')
    .description('Run verification pipeline on completed work')
    .option('--story <id>', 'Story ID to verify')
    .option('--retro', 'Verify retrospective completion for an epic')
    .option('--epic <n>', 'Epic number (required with --retro)')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const isJson = globalOpts.json === true;
      const root = process.cwd();

      // Route to retro verification if --retro flag is set
      if (opts.retro) {
        verifyRetro(opts, isJson, root);
        return;
      }

      // For story verification, --story is required
      if (!opts.story) {
        fail('--story is required when --retro is not set', { json: isJson });
        process.exitCode = 1;
        return;
      }

      verifyStory(opts.story, isJson, root);
    });
}

/**
 * Verifies retrospective completion for an epic.
 * Checks that epic-N-retrospective.md exists, then updates sprint-status.yaml.
 */
function verifyRetro(opts: { epic?: string }, isJson: boolean, root: string): void {
  if (!opts.epic) {
    fail('--epic is required with --retro', { json: isJson });
    process.exitCode = 1;
    return;
  }

  const epicNum = parseInt(opts.epic, 10);
  if (isNaN(epicNum) || epicNum < 1) {
    fail(`Invalid epic number: ${opts.epic}`, { json: isJson });
    process.exitCode = 1;
    return;
  }

  const retroFile = `epic-${epicNum}-retrospective.md`;
  const retroPath = join(root, STORY_DIR, retroFile);

  if (!existsSync(retroPath)) {
    if (isJson) {
      jsonOutput({ status: 'fail', epic: epicNum, retroFile, message: `${retroFile} not found` });
    } else {
      fail(`${retroFile} not found`);
    }
    process.exitCode = 1;
    return;
  }

  // Update sprint-status.yaml
  const retroKey = `epic-${epicNum}-retrospective`;
  try {
    updateSprintStatus(retroKey, 'done', root);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    warn(`Failed to update sprint status: ${message}`);
  }

  if (isJson) {
    jsonOutput({ status: 'ok', epic: epicNum, retroFile: join(STORY_DIR, retroFile) });
  } else {
    ok(`Epic ${epicNum} retrospective: marked done`);
  }
}

/**
 * Verifies a story via the full verification pipeline (existing behavior).
 */
function verifyStory(storyId: string, isJson: boolean, root: string): void {
  // 0. Validate story ID to prevent path traversal
  if (!isValidStoryId(storyId)) {
    fail(`Invalid story ID: ${storyId}. Story IDs must contain only alphanumeric characters, hyphens, and underscores.`, { json: isJson });
    process.exitCode = 1;
    return;
  }

  // 1. Resolve story file path
  const storyFilePath = join(root, STORY_DIR, `${storyId}.md`);
  if (!existsSync(storyFilePath)) {
    fail(`Story file not found: ${storyFilePath}`, { json: isJson });
    process.exitCode = 1;
    return;
  }

  // 2. Check preconditions
  let preconditions;
  try {
    preconditions = checkPreconditions(root, storyId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail(`Precondition check failed: ${message}`, { json: isJson });
    process.exitCode = 1;
    return;
  }

  if (!preconditions.passed) {
    if (isJson) {
      jsonOutput({
        status: 'fail',
        message: 'Preconditions not met',
        failures: preconditions.failures,
      });
    } else {
      fail('Preconditions not met:');
      for (const f of preconditions.failures) {
        info(`  - ${f}`);
      }
    }
    process.exitCode = 1;
    return;
  }

  // 3. Parse story ACs
  let acs;
  try {
    acs = parseStoryACs(storyFilePath);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail(`Failed to parse story file: ${message}`, { json: isJson });
    process.exitCode = 1;
    return;
  }

  // 4. Extract story title from file
  const storyTitle = extractStoryTitle(storyFilePath);

  // 5. Create proof document skeleton
  const proofPath = createProofDocument(storyId, storyTitle, acs, root);

  // 6. Run showboat verify if proof has content
  let showboatStatus: 'pass' | 'fail' | 'skipped' = 'skipped';
  if (proofHasContent(proofPath)) {
    const showboatResult = runShowboatVerify(proofPath);
    if (showboatResult.output === 'showboat not available') {
      showboatStatus = 'skipped';
      warn('Showboat not installed — skipping re-verification');
    } else {
      showboatStatus = showboatResult.passed ? 'pass' : 'fail';
      if (!showboatResult.passed) {
        fail(`Showboat verify failed: ${showboatResult.output}`, { json: isJson });
        process.exitCode = 1;
        return;
      }
    }
  }

  // 7. Build result
  // ACs are marked verified only if showboat verify passed.
  // For skeleton-only (no showboat content), ACs are pending.
  const acsVerified = showboatStatus === 'pass';
  const verifiedCount = acsVerified ? acs.length : 0;
  const result: VerifyResult = {
    storyId,
    success: true,
    totalACs: acs.length,
    verifiedCount,
    failedCount: acs.length - verifiedCount,
    proofPath: `verification/${storyId}-proof.md`,
    showboatVerifyStatus: showboatStatus,
    perAC: acs.map(ac => ({
      id: ac.id,
      description: ac.description,
      verified: acsVerified,
      evidencePaths: [],
    })),
  };

  // 8. Update state
  try {
    updateVerificationState(storyId, result, root);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    warn(`Failed to update state: ${message}`);
  }

  // 9. Close beads issue
  try {
    closeBeadsIssue(storyId, root);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    warn(`Failed to close beads issue: ${message}`);
  }

  // 10. Complete exec-plan
  try {
    const completedPath = completeExecPlan(storyId, root);
    if (completedPath) {
      if (!isJson) {
        ok(`Exec-plan moved to completed: ${completedPath}`);
      }
    } else {
      if (!isJson) {
        warn(`No exec-plan found for story: ${storyId}`);
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    warn(`Failed to complete exec-plan: ${message}`);
  }

  // 11. Output result
  if (isJson) {
    jsonOutput(result as unknown as Record<string, unknown>);
  } else {
    ok(`Story ${storyId}: verified — proof at verification/${storyId}-proof.md`);
  }
}

function extractStoryTitle(filePath: string): string {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const match = /^#\s+(.+)$/m.exec(content);
    return match ? match[1] : 'Unknown Story';
  } catch {
    return 'Unknown Story';
  }
}
