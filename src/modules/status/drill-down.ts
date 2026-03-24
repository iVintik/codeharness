/**
 * Status drill-down — presentation layer for story detail view.
 * Handles formatting of story drill-down data for both human-readable and JSON output.
 */

import { fail, jsonOutput } from '../../lib/output.js';
import { getStoryDrillDown } from '../sprint/index.js';
import type { StoryDrillDown } from '../sprint/index.js';

/**
 * Handle the --story <key> drill-down sub-command.
 * Fetches drill-down data from sprint module and formats output.
 */
export function handleStoryDrillDown(storyId: string, isJson: boolean): void {
  const result = getStoryDrillDown(storyId);
  if (!result.success) {
    if (isJson) {
      jsonOutput({ status: 'fail', message: result.error });
    } else {
      fail(result.error);
    }
    process.exitCode = 1;
    return;
  }

  const d = result.data;

  if (isJson) {
    formatDrillDownJson(d);
    return;
  }

  formatDrillDownHuman(d);
}

function formatDrillDownJson(d: StoryDrillDown): void {
  jsonOutput({
    key: d.key,
    status: d.status,
    epic: d.epic,
    attempts: d.attempts,
    maxAttempts: d.maxAttempts,
    lastAttempt: d.lastAttempt,
    acResults: d.acDetails,
    attemptHistory: d.attemptHistory,
    proof: d.proofSummary,
    ...(d.timeoutSummary ? { timeout: d.timeoutSummary } : {}),
  });
}

function formatDrillDownHuman(d: StoryDrillDown): void {
  // Header
  console.log(`Story: ${d.key}`);
  console.log(`Status: ${d.status} (attempt ${d.attempts}/${d.maxAttempts})`);
  console.log(`Epic: ${d.epic}`);
  console.log(`Last attempt: ${d.lastAttempt ?? 'none'}`);

  // Timeout summary
  if (d.timeoutSummary) {
    const ts = d.timeoutSummary;
    console.log(`Last timeout: iteration ${ts.iteration}, ${ts.durationMinutes}m, ${ts.filesChanged} files changed`);
    console.log(`Report: ${ts.reportPath}`);
  }

  // AC Results
  console.log('');
  console.log('-- AC Results -------------------------------------------------------');

  if (d.acDetails.length === 0) {
    console.log('No AC results recorded');
  } else {
    for (const ac of d.acDetails) {
      const tag = ac.verdict.toUpperCase();
      console.log(`${ac.id}: [${tag}]`);
      if (ac.verdict === 'fail') {
        if (ac.command) console.log(`  Command:  ${ac.command}`);
        if (ac.expected) console.log(`  Expected: ${ac.expected}`);
        if (ac.actual) console.log(`  Actual:   ${ac.actual}`);
        if (ac.reason) console.log(`  Reason:   ${ac.reason}`);
        if (ac.suggestedFix) console.log(`  Suggest:  ${ac.suggestedFix}`);
      }
    }
  }

  // History
  if (d.attemptHistory.length > 0) {
    console.log('');
    console.log('-- History ----------------------------------------------------------');
    for (const attempt of d.attemptHistory) {
      const acPart = attempt.failingAc ? ` (${attempt.failingAc})` : '';
      console.log(`Attempt ${attempt.number}: ${attempt.outcome}${acPart}`);
    }
  }

  // Proof
  if (d.proofSummary) {
    console.log('');
    const p = d.proofSummary;
    const total = p.passCount + p.failCount + p.escalateCount + p.pendingCount;
    console.log(
      `Proof: ${p.path} (${p.passCount}/${total} pass, ${p.failCount} fail, ${p.escalateCount} escalate)`,
    );
  }
}
