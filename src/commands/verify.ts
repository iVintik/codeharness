import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ok, fail, warn, info, jsonOutput } from '../lib/output.js';
import {
  parseStoryACs,
  checkPreconditions,
  createProofDocument,
  runShowboatVerify,
  validateProofQuality,
  updateVerificationState,
  closeBeadsIssue,
  parseObservabilityGaps,
} from '../modules/verify/index.js';
import { completeExecPlan } from '../lib/doc-health/index.js';
import { updateSprintStatus } from '../lib/sync/index.js';
import type { VerifyResult } from '../modules/verify/index.js';

const STORY_DIR = '_bmad-output/implementation-artifacts';

/** Validates that a story ID is safe for file paths (no traversal or special chars). */
function isValidStoryId(storyId: string): boolean {
  if (!storyId || storyId.includes('..') || storyId.includes('/') || storyId.includes('\\')) return false;
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

  // 0b. README.md gate — without docs, verification is meaningless
  const readmePath = join(root, 'README.md');
  if (!existsSync(readmePath)) {
    if (isJson) {
      jsonOutput({ status: 'fail', message: 'No README.md found — verification requires user documentation' });
    } else {
      fail('No README.md found — verification requires user documentation');
    }
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

  // 5. Create proof document skeleton (only if one doesn't already exist)
  const expectedProofPath = join(root, 'verification', `${storyId}-proof.md`);
  const proofPath = existsSync(expectedProofPath)
    ? expectedProofPath
    : createProofDocument(storyId, storyTitle, acs, root);

  // 6. Check proof quality — reject if any ACs are PENDING
  const proofQuality = validateProofQuality(proofPath);
  if (!proofQuality.passed) {
    if (isJson) {
      jsonOutput({
        status: 'fail',
        message: `Proof quality check failed: ${proofQuality.verified}/${proofQuality.total} ACs verified`,
        proofQuality: { verified: proofQuality.verified, pending: proofQuality.pending, escalated: proofQuality.escalated, total: proofQuality.total },
      });
    } else {
      fail(`Proof quality check failed: ${proofQuality.verified}/${proofQuality.total} ACs verified`);
    }
    process.exitCode = 1;
    return;
  }

  // 6b. Warn about escalated ACs (passed but some ACs are integration-required)
  if (proofQuality.escalated > 0) {
    warn(`Story ${storyId} has ${proofQuality.escalated} ACs requiring integration verification`);
    info('Run these ACs manually or in a dedicated verification session');
  }

  // 7. Run showboat verify — proof quality passed so we know there's real content
  let showboatStatus: 'pass' | 'fail' | 'skipped' = 'skipped';
  const showboatResult = runShowboatVerify(proofPath);
  if (showboatResult.output === 'showboat not available') {
    showboatStatus = 'skipped';
    warn('Showboat not installed — skipping re-verification');
  } else {
    showboatStatus = showboatResult.passed ? 'pass' : 'fail';
    if (!showboatResult.passed) {
      if (isJson) {
        jsonOutput({
          status: 'fail',
          message: `Showboat verify failed: ${showboatResult.output}`,
          proofQuality: { verified: proofQuality.verified, pending: proofQuality.pending, escalated: proofQuality.escalated, total: proofQuality.total },
        });
      } else {
        fail(`Showboat verify failed: ${showboatResult.output}`);
      }
      process.exitCode = 1;
      return;
    }
  }

  // 8. Parse observability gaps from proof (Story 2.1)
  let observabilityGapCount = 0;
  let runtimeCoveragePercent = 0;
  try {
    const proofContent = readFileSync(proofPath, 'utf-8');
    const gapResult = parseObservabilityGaps(proofContent);
    observabilityGapCount = gapResult.gapCount;
    runtimeCoveragePercent =
      gapResult.totalACs === 0
        ? 0
        : (gapResult.coveredCount / gapResult.totalACs) * 100;
  } catch {
    // IGNORE: proof file may not be readable, proceed with defaults
  }

  // 9. Build result
  const result: VerifyResult = {
    storyId,
    success: true,
    totalACs: proofQuality.total,
    verifiedCount: proofQuality.verified,
    failedCount: proofQuality.pending,
    escalatedCount: proofQuality.escalated,
    proofPath: `verification/${storyId}-proof.md`,
    showboatVerifyStatus: showboatStatus,
    observabilityGapCount,
    runtimeCoveragePercent,
    perAC: acs.map(ac => ({
      id: ac.id,
      description: ac.description,
      verified: true,
      evidencePaths: [],
    })),
  };

  // 10. Update state
  try {
    updateVerificationState(storyId, result, root);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    warn(`Failed to update state: ${message}`);
  }

  // 11. Close beads issue
  try {
    closeBeadsIssue(storyId, root);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    warn(`Failed to close beads issue: ${message}`);
  }

  // 12. Complete exec-plan
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

  // 13. Output result
  if (isJson) {
    jsonOutput({
      ...(result as unknown as Record<string, unknown>),
      proofQuality: { verified: proofQuality.verified, pending: proofQuality.pending, escalated: proofQuality.escalated, total: proofQuality.total },
    });
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
    // IGNORE: story file may not be readable
    return 'Unknown Story';
  }
}
