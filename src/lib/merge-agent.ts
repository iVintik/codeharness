/**
 * Merge Agent — conflict resolution via driver dispatch with retry loop.
 *
 * Receives a MergeConflictContext with conflicting files, epic descriptions,
 * and an AgentDriver instance. Dispatches the driver to resolve conflicts,
 * validates with the test suite, and retries up to 3 times before escalating.
 *
 * @see Story 18-2: Merge Agent for Conflict Resolution
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

import type { AgentDriver } from './agents/types.js';

const execAsync = promisify(exec);

// --- Interfaces ---

/**
 * Context provided to the merge agent for conflict resolution.
 */
export interface MergeConflictContext {
  /** Epic identifier. */
  readonly epicId: string;
  /** Branch being merged. */
  readonly branch: string;
  /** List of conflicting file paths (relative to cwd). */
  readonly conflicts: string[];
  /** Description of what the main branch contains. */
  readonly mainDescription: string;
  /** Description of what the feature branch was building. */
  readonly branchDescription: string;
  /** Working directory (main repo root where merge is in progress). */
  readonly cwd: string;
  /** Command to run for test validation. */
  readonly testCommand: string;
  /** Driver instance to dispatch for conflict resolution. */
  readonly driver: AgentDriver;
}

/**
 * Result of a conflict resolution attempt.
 */
export interface ConflictResolutionResult {
  /** Whether all conflicts were resolved and tests pass. */
  resolved: boolean;
  /** Number of resolution attempts made. */
  attempts: number;
  /** Whether the conflict was escalated for manual resolution. */
  escalated: boolean;
  /** Human-readable escalation message with details for manual resolution. */
  escalationMessage?: string;
  /** Test suite results from the last successful validation. */
  testResults?: { passed: number; failed: number; coverage?: number };
  /** List of files that were resolved. */
  resolvedFiles?: string[];
}

// --- Constants ---

const MAX_ATTEMPTS = 3;

// --- Prompt Construction ---

/**
 * Build the conflict resolution prompt for the driver.
 *
 * Includes file paths with full conflict-marker content, descriptions
 * of both branches, and instructions to resolve preserving both changes.
 */
export function buildConflictPrompt(ctx: MergeConflictContext, testFailure?: string): string {
  const conflictSections = ctx.conflicts.map((file) => {
    try {
      const content = readFileSync(join(ctx.cwd, file), 'utf-8');
      return `### ${file}\n\`\`\`\n${content}\n\`\`\``;
    } catch { // IGNORE: file may be deleted on one side or unreadable — degrade gracefully in prompt
      return `### ${file}\n*(File deleted on one side or unreadable)*`;
    }
  }).join('\n\n');

  let prompt = `Merge conflict in ${ctx.conflicts.length} file(s) between main and ${ctx.branch}.\n\n`;
  prompt += `**Main branch context:** ${ctx.mainDescription}\n`;
  prompt += `**Feature branch context:** ${ctx.branchDescription}\n\n`;
  prompt += `**Conflicting files:**\n\n${conflictSections}\n\n`;
  prompt += `Resolve ALL conflicts preserving changes from both branches. Both are correct additions.\n`;
  prompt += `Write the resolved content to each file, stage with \`git add\`, and commit the merge resolution.\n`;

  if (testFailure) {
    prompt += `\n**Previous attempt failed tests:**\n\`\`\`\n${testFailure}\n\`\`\`\n`;
    prompt += `Fix the resolution to make all tests pass.\n`;
  }
  return prompt;
}

// --- Escalation ---

/**
 * Build an escalation message with details for manual resolution.
 */
function buildEscalationMessage(ctx: MergeConflictContext): string {
  const fileList = ctx.conflicts.map((f) => `  - ${f}`).join('\n');
  return [
    `Merge conflict could not be auto-resolved after ${MAX_ATTEMPTS} attempts.`,
    ``,
    `Worktree: ${ctx.cwd}`,
    `Branch: ${ctx.branch}`,
    `Epic: ${ctx.epicId}`,
    ``,
    `Conflicting files:`,
    fileList,
    ``,
    `To inspect the diff:`,
    `  git diff ${ctx.branch}`,
  ].join('\n');
}

// --- Test Suite Runner ---

/**
 * Run the test suite and parse results.
 * Returns pass/fail counts, coverage, and raw output for retry context.
 */
async function runTestSuite(
  testCommand: string,
  cwd: string,
): Promise<{ passed: number; failed: number; coverage?: number; output: string }> {
  try {
    const { stdout } = await execAsync(testCommand, {
      cwd,
      timeout: 300_000,
    });
    return { ...parseTestOutput(stdout), output: stdout };
  } catch (err: unknown) {
    const stdout = (err as { stdout?: string })?.stdout ?? '';
    const result = parseTestOutput(stdout);
    if (result.passed === 0 && result.failed === 0) {
      return { passed: 0, failed: 1, output: stdout || 'Test command failed with no output' };
    }
    return { ...result, output: stdout };
  }
}

/**
 * Parse test output to extract pass/fail counts and optional coverage.
 */
function parseTestOutput(stdout: string): { passed: number; failed: number; coverage?: number } {
  let passed = 0;
  let failed = 0;
  let coverage: number | undefined;

  const passMatch = stdout.match(/(\d+)\s+passed/);
  const failMatch = stdout.match(/(\d+)\s+failed/);
  if (passMatch) passed = parseInt(passMatch[1], 10);
  if (failMatch) failed = parseInt(failMatch[1], 10);

  const covMatch = stdout.match(/All files[^|]*\|\s*([\d.]+)/);
  if (covMatch) coverage = parseFloat(covMatch[1]);

  return { passed, failed, ...(coverage !== undefined && { coverage }) };
}

// --- Main Entry Point ---

/**
 * Resolve merge conflicts using an agent driver with retry loop.
 *
 * Dispatches the driver with conflict context, validates with the test suite,
 * and retries up to 3 times. After 3 failures, escalates for manual resolution.
 *
 * @param ctx  Merge conflict context with files, descriptions, and driver.
 * @returns Resolution result indicating success, failure, or escalation.
 */
export async function resolveConflicts(ctx: MergeConflictContext): Promise<ConflictResolutionResult> {
  // Guard: empty conflict list
  if (ctx.conflicts.length === 0) {
    return { resolved: true, attempts: 0, escalated: false };
  }

  let lastTestFailure: string | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const prompt = buildConflictPrompt(ctx, lastTestFailure);

    // Dispatch driver — consume stream events to completion
    try {
      for await (const _event of ctx.driver.dispatch({
        prompt,
        model: ctx.driver.defaultModel,
        cwd: ctx.cwd,
        sourceAccess: true,
      })) {
        // Stream events consumed; merge agent doesn't need to display them
      }
    } catch { // IGNORE: driver dispatch failed (network error, rate limit) — treat as failed attempt
      // Treat as a failed attempt — try to revert and retry
      try {
        execSync('git reset --hard HEAD~1', { cwd: ctx.cwd, timeout: 30_000 });
      } catch { // IGNORE: git reset failed — escalate immediately on corrupted git state
        return {
          resolved: false,
          attempts: attempt,
          escalated: true,
          escalationMessage: buildEscalationMessage(ctx),
        };
      }
      lastTestFailure = 'Driver dispatch failed. Retrying with fresh attempt.';
      continue;
    }

    // Run test suite
    const testResults = await runTestSuite(ctx.testCommand, ctx.cwd);
    if (testResults.failed === 0 && testResults.passed > 0) {
      return {
        resolved: true,
        attempts: attempt,
        escalated: false,
        testResults: {
          passed: testResults.passed,
          failed: testResults.failed,
          ...(testResults.coverage !== undefined && { coverage: testResults.coverage }),
        },
        resolvedFiles: ctx.conflicts,
      };
    }

    // Tests failed — revert and retry
    lastTestFailure = testResults.output;
    try {
      execSync('git reset --hard HEAD~1', { cwd: ctx.cwd, timeout: 30_000 });
    } catch { // IGNORE: git reset failed after test failure — escalate on corrupted git state
      return {
        resolved: false,
        attempts: attempt,
        escalated: true,
        escalationMessage: buildEscalationMessage(ctx),
      };
    }
  }

  // All attempts exhausted — escalate
  return {
    resolved: false,
    attempts: MAX_ATTEMPTS,
    escalated: true,
    escalationMessage: buildEscalationMessage(ctx),
  };
}
