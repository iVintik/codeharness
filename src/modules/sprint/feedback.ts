/**
 * Feedback loop — processes verification proof documents and returns
 * stories to dev with findings when ACs fail.
 * All functions return Result<T>, never throw.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ok, fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type { FailingAc, FeedbackResult } from './types.js';
import {
  getSprintState as getSprintStateImpl,
  updateStoryStatus as updateStoryStatusImpl,
} from './state.js';

/** Default max attempts before marking a story as blocked */
const DEFAULT_MAX_ATTEMPTS = 10;

/**
 * Parse a proof markdown document and extract failing ACs.
 * Failing = verdict is not PASS and does not contain [ESCALATE].
 */
export function parseProofForFailures(proofPath: string): Result<FailingAc[]> {
  try {
    if (!existsSync(proofPath)) {
      return fail(`Proof file not found: ${proofPath}`);
    }

    const content = readFileSync(proofPath, 'utf-8');
    const failingAcs: FailingAc[] = [];

    // Split into AC sections using ## AC N: pattern
    const acPattern = /^## AC (\d+):\s*(.+)$/gm;
    const matches: Array<{ index: number; acNumber: number; description: string }> = [];

    let match: RegExpExecArray | null;
    while ((match = acPattern.exec(content)) !== null) {
      matches.push({
        index: match.index,
        acNumber: parseInt(match[1], 10),
        description: match[2].trim(),
      });
    }

    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index;
      const end = i + 1 < matches.length ? matches[i + 1].index : content.length;
      const section = content.slice(start, end);

      // Extract verdict line (may be on same line or next line after Verdict:)
      const verdictMatch = section.match(/\*\*Verdict:\*\*\s*(.+)/) ??
        section.match(/\*\*Verdict:\*\*\s*\n\s*(.+)/);
      if (!verdictMatch) continue;

      const verdict = verdictMatch[1].trim();

      // Skip PASS and ESCALATE
      if (verdict === 'PASS') continue;
      if (verdict.includes('[ESCALATE]')) continue;

      // Extract error output from ```output blocks or any code blocks after the verdict description
      let errorOutput = '';
      const outputBlocks = section.match(/```(?:output|bash)?\n([\s\S]*?)```/g);
      if (outputBlocks) {
        errorOutput = outputBlocks
          .map((block) => {
            const inner = block.replace(/^```(?:output|bash)?\n/, '').replace(/```$/, '');
            return inner.trim();
          })
          .join('\n');
      }

      failingAcs.push({
        acNumber: matches[i].acNumber,
        description: matches[i].description,
        errorOutput,
        verdict,
      });
    }

    return ok(failingAcs);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Failed to parse proof: ${msg}`);
  }
}

/**
 * Write (or replace) a ## Verification Findings section in the story file.
 * Inserts before ## Dev Agent Record if present, otherwise appends at end.
 */
export function writeVerificationFindings(
  storyKey: string,
  failingAcs: ReadonlyArray<FailingAc>,
): Result<void> {
  try {
    const storyPath = join(
      process.cwd(),
      '_bmad-output',
      'implementation-artifacts',
      `${storyKey}.md`,
    );

    if (!existsSync(storyPath)) {
      return fail(`Story file not found: ${storyPath}`);
    }

    const content = readFileSync(storyPath, 'utf-8');

    // Build findings section
    const timestamp = new Date().toISOString();
    const lines: string[] = [
      '## Verification Findings',
      '',
      `_Last updated: ${timestamp}_`,
      '',
      'The following ACs failed black-box verification:',
      '',
    ];

    for (const ac of failingAcs) {
      lines.push(`### AC ${ac.acNumber}: ${ac.description}`);
      lines.push(`**Verdict:** ${ac.verdict}`);
      lines.push('**Error output:**');
      lines.push('```');
      lines.push(ac.errorOutput);
      lines.push('```');
      lines.push('');
    }

    const findingsText = lines.join('\n');

    // Remove existing findings section if present.
    // Greedy match captures everything until the next ## heading (not Verification Findings) or EOF.
    const findingsPattern = /## Verification Findings\n[\s\S]*?(?=\n## (?!Verification Findings))|## Verification Findings\n[\s\S]*$/;
    let updated: string;

    if (findingsPattern.test(content)) {
      // Replace existing section
      updated = content.replace(findingsPattern, findingsText);
    } else {
      // Insert before ## Dev Agent Record, or append
      const devAgentIdx = content.indexOf('\n## Dev Agent Record');
      if (devAgentIdx !== -1) {
        updated = content.slice(0, devAgentIdx) + '\n\n' + findingsText + content.slice(devAgentIdx);
      } else {
        updated = content.trimEnd() + '\n\n' + findingsText;
      }
    }

    writeFileSync(storyPath, updated, 'utf-8');
    return ok(undefined);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Failed to write verification findings: ${msg}`);
  }
}

/**
 * Orchestrate the verify-dev feedback loop for a story.
 * 1. Read proof document and extract failures.
 * 2. Check attempt count — if >= maxAttempts, mark blocked.
 * 3. If all pass, mark done.
 * 4. If failures, write findings and return to dev.
 */
export function processVerifyResult(
  storyKey: string,
  opts?: { maxAttempts?: number },
): Result<FeedbackResult> {
  try {
    const maxAttempts = opts?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

    // Read proof document
    const proofPath = join(
      process.cwd(),
      'verification',
      `${storyKey}-proof.md`,
    );
    const parseResult = parseProofForFailures(proofPath);
    if (!parseResult.success) {
      return fail(parseResult.error);
    }

    const failingAcs = parseResult.data;

    // Read current attempt count from state
    const stateResult = getSprintStateImpl();
    if (!stateResult.success) {
      return fail(stateResult.error);
    }
    const currentAttempts = stateResult.data.stories[storyKey]?.attempts ?? 0;

    // All pass → mark done
    if (failingAcs.length === 0) {
      const updateResult = updateStoryStatusImpl(storyKey, 'done');
      if (!updateResult.success) {
        return fail(updateResult.error);
      }
      return ok({
        storyKey,
        action: 'mark-done',
        failingAcs: [],
        attempts: currentAttempts,
      });
    }

    // Check attempt limit (currentAttempts reflects count BEFORE this cycle;
    // updateStoryStatus('in-progress') will increment by 1)
    if (currentAttempts >= maxAttempts) {
      const updateResult = updateStoryStatusImpl(storyKey, 'blocked', {
        error: 'verify-dev-cycle-limit',
      });
      if (!updateResult.success) {
        return fail(updateResult.error);
      }
      return ok({
        storyKey,
        action: 'mark-blocked',
        failingAcs,
        attempts: currentAttempts,
      });
    }

    // Failures exist and under limit → return to dev
    // Update state FIRST so we don't write findings to disk if state update fails
    const updateResult = updateStoryStatusImpl(storyKey, 'in-progress');
    if (!updateResult.success) {
      return fail(updateResult.error);
    }

    const findingsResult = writeVerificationFindings(storyKey, failingAcs);
    if (!findingsResult.success) {
      return fail(findingsResult.error);
    }

    return ok({
      storyKey,
      action: 'return-to-dev',
      failingAcs,
      attempts: currentAttempts + 1, // reflects post-increment
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Failed to process verify result: ${msg}`);
  }
}
