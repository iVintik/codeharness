/**
 * Shared audit action handler.
 *
 * Used by both `codeharness audit` and `codeharness onboard` (alias)
 * to ensure identical behavior (FR16).
 */

import { ok as okOutput, fail as failOutput, info, jsonOutput } from '../lib/output.js';
import { runPreconditions } from '../lib/onboard-checks.js';
import { runAudit, generateFixStories, addFixStoriesToState } from '../modules/audit/index.js';
import { formatAuditHuman, formatAuditJson } from '../modules/audit/report.js';
import type { Result } from '../types/result.js';
import type { FixGenerationResult } from '../modules/audit/index.js';

/**
 * Execute the audit action — shared between audit and onboard commands.
 * Handles precondition checks, audit execution, --fix, and output formatting.
 */
export async function executeAudit(opts: { isJson: boolean; isFix: boolean }): Promise<void> {
  const { isJson, isFix } = opts;

  // Precondition: harness must be initialized
  const preconditions = runPreconditions();
  if (!preconditions.canProceed) {
    if (isJson) {
      jsonOutput({
        status: 'fail',
        message: 'Harness not initialized -- run codeharness init first',
      });
    } else {
      failOutput('Harness not initialized -- run codeharness init first');
    }
    process.exitCode = 1;
    return;
  }

  // Run audit
  const result = await runAudit(process.cwd());

  if (!result.success) {
    if (isJson) {
      jsonOutput({ status: 'fail', message: result.error });
    } else {
      failOutput(result.error);
    }
    process.exitCode = 1;
    return;
  }

  // Handle --fix flag
  let fixStories: Result<FixGenerationResult> | undefined;
  let fixStateError: string | undefined;

  if (isFix) {
    // No gaps found
    if (result.data.gapCount === 0) {
      if (!isJson) {
        okOutput('No gaps found -- nothing to fix');
      }
    } else {
      // Generate fix stories
      const fixResult = generateFixStories(result.data);
      fixStories = fixResult;

      if (fixResult.success) {
        // Add to sprint state
        const stateResult = addFixStoriesToState(fixResult.data.stories);
        if (!stateResult.success) {
          fixStateError = stateResult.error;
          if (!isJson) {
            failOutput(`Failed to update sprint state: ${stateResult.error}`);
          }
        }

        if (!isJson) {
          info(`Generated ${fixResult.data.created} fix stories (${fixResult.data.skipped} skipped)`);
        }
      } else if (!isJson) {
        failOutput(fixResult.error);
      }
    }
  }

  // Format output
  if (isJson) {
    const jsonData: Record<string, unknown> = { ...formatAuditJson(result.data) };
    // Include fixStories in JSON when --fix
    if (isFix) {
      if (result.data.gapCount === 0) {
        jsonData.fixStories = [];
      } else if (fixStories!.success) {
        jsonData.fixStories = fixStories!.data.stories.map(s => ({
          key: s.key,
          filePath: s.filePath,
          gap: s.gap,
          ...(s.skipped ? { skipped: true } : {}),
        }));
        if (fixStateError) {
          jsonData.fixStateError = fixStateError;
        }
      } else {
        jsonData.fixStories = [];
        jsonData.fixError = fixStories!.error;
      }
    }
    jsonOutput(jsonData);
  } else if (!isFix || result.data.gapCount > 0) {
    // Print human audit output (skip if --fix with no gaps, already printed OK)
    const lines = formatAuditHuman(result.data);
    for (const line of lines) {
      console.log(line);
    }
  }

  // Set exit code based on overall status
  if (result.data.overallStatus === 'fail') {
    process.exitCode = 1;
  }
}
