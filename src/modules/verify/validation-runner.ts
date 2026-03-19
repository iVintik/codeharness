/**
 * Validation runner — sprint initialization, AC execution, fix story generation,
 * and result processing for the self-validation cycle.
 *
 * Orchestration (runValidationCycle, getValidationProgress) lives in
 * validation-orchestrator.ts to comply with NFR18 (300-line file limit).
 *
 * Story 10-2: Validation Infrastructure
 */

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ok, fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type { SprintState, StoryState } from '../../types/state.js';
import { VALIDATION_ACS } from './validation-acs.js';
import type { ValidationAC } from './validation-ac-types.js';
import type {
  ValidationACResult,
  ValidationSprintResult,
} from './validation-runner-types.js';
import {
  getSprintState,
  writeStateAtomic,
  computeSprintCounts,
} from '../sprint/index.js';

/** Maximum consecutive failures before marking an AC as blocked */
export const MAX_VALIDATION_ATTEMPTS = 10;

/** Timeout for CLI AC command execution (30 seconds) */
const AC_COMMAND_TIMEOUT_MS = 30_000;

/** Prefix for validation story keys to avoid collision with real stories */
export const VAL_KEY_PREFIX = 'val-';

// ─── Task 1: Validation Sprint Initializer ───────────────────────────────────

/**
 * Populate sprint-state.json with one story entry per validation AC.
 * Preserves any existing non-validation stories (AC 1, 5).
 */
export function createValidationSprint(): Result<ValidationSprintResult> {
  try {
    const stateResult = getSprintState();
    if (!stateResult.success) {
      return fail(stateResult.error);
    }

    const current = stateResult.data;
    const updatedStories = { ...current.stories };

    let existingPreserved = 0;
    for (const key of Object.keys(updatedStories)) {
      if (!key.startsWith(VAL_KEY_PREFIX)) {
        existingPreserved++;
      }
    }

    let acsAdded = 0;
    for (const ac of VALIDATION_ACS) {
      const key = `${VAL_KEY_PREFIX}${ac.id}`;
      if (!(key in updatedStories)) {
        const initialState: StoryState = {
          status: 'backlog',
          attempts: 0,
          lastAttempt: null,
          lastError: null,
          proofPath: null,
          acResults: null,
        };
        updatedStories[key] = initialState;
        acsAdded++;
      }
    }

    const updatedSprint = computeSprintCounts(updatedStories);
    const updatedState: SprintState = {
      ...current,
      sprint: updatedSprint,
      stories: updatedStories,
    };

    const writeResult = writeStateAtomic(updatedState);
    if (!writeResult.success) {
      return fail(writeResult.error);
    }

    return ok({ acsAdded, existingPreserved });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Failed to create validation sprint: ${msg}`);
  }
}

// ─── Task 2: Validation AC Executor ──────────────────────────────────────────

/**
 * Execute a single validation AC (AC 3, 6, 7).
 * CLI-verifiable: spawns command, captures output, checks exit code.
 * Integration-required: returns blocked immediately.
 */
export function executeValidationAC(ac: ValidationAC): Result<ValidationACResult> {
  try {
    if (ac.verificationMethod === 'integration') {
      return ok({
        acId: ac.id,
        verdict: 'blocked',
        output: '',
        durationMs: 0,
        reason: 'integration-required',
      });
    }

    if (!ac.command) {
      return ok({
        acId: ac.id,
        verdict: 'blocked',
        output: '',
        durationMs: 0,
        reason: 'no-command',
      });
    }

    const startTime = Date.now();
    try {
      const output = execSync(ac.command, {
        timeout: AC_COMMAND_TIMEOUT_MS,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const durationMs = Date.now() - startTime;

      return ok({
        acId: ac.id,
        verdict: 'pass',
        output: output.trim(),
        durationMs,
      });
    } catch (execErr: unknown) {
      const durationMs = Date.now() - startTime;
      let output = '';

      if (execErr && typeof execErr === 'object') {
        const e = execErr as { stdout?: string; stderr?: string; message?: string };
        const parts: string[] = [];
        if (e.stdout) parts.push(e.stdout);
        if (e.stderr) parts.push(e.stderr);
        output = parts.length > 0 ? parts.join('\n').trim() : (e.message ?? '');
      }

      return ok({
        acId: ac.id,
        verdict: 'fail',
        output,
        durationMs,
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Failed to execute validation AC ${ac.id}: ${msg}`);
  }
}

// ─── Task 3: Fix Story Generator ─────────────────────────────────────────────

/**
 * Create a minimal fix story file for a failing validation AC (AC 2).
 * Writes to _bmad-output/implementation-artifacts/val-fix-{acId}.md.
 */
export function createFixStory(ac: ValidationAC, error: string): Result<string> {
  try {
    const storyKey = `val-fix-${ac.id}`;
    const storyPath = join(
      process.cwd(),
      '_bmad-output',
      'implementation-artifacts',
      `${storyKey}.md`,
    );

    const markdown = [
      `# Fix: Validation AC ${ac.id} — ${ac.frRef}`,
      '',
      'Status: ready-for-dev',
      '',
      '## Story',
      '',
      `As a release manager, I need validation AC ${ac.id} to pass so that the self-validation suite confirms compliance with ${ac.frRef}.`,
      '',
      '## Acceptance Criteria',
      '',
      `1. **Given** AC ${ac.id} (${ac.frRef}), **When** the validation command runs, **Then** it exits with code 0.`,
      '',
      '## Failing AC Details',
      '',
      `**AC ID:** ${ac.id}`,
      `**Reference:** ${ac.frRef}`,
      `**Description:** ${ac.description}`,
      `**Verification Method:** ${ac.verificationMethod}`,
      ...(ac.command ? [`**Command:** \`${ac.command}\``] : []),
      '',
      '## Error Output',
      '',
      '```',
      error,
      '```',
      '',
      '## Suggested Fix',
      '',
      `Review the failing command and its expected behavior. The AC expects: ${ac.description}`,
      '',
      '## Dev Notes',
      '',
      'This is an auto-generated fix story created by the validation runner.',
      'Fix the root cause so the validation command passes.',
      '',
    ].join('\n');

    mkdirSync(dirname(storyPath), { recursive: true });
    writeFileSync(storyPath, markdown, 'utf-8');

    return ok(storyKey);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Failed to create fix story for AC ${ac.id}: ${msg}`);
  }
}

// ─── Task 4: Validation Result Processor ─────────────────────────────────────

/**
 * Process a validation AC result: update sprint-state.json (AC 4).
 * Increments attempts, sets verdict, marks blocked after MAX_VALIDATION_ATTEMPTS.
 */
export function processValidationResult(
  acId: number,
  result: ValidationACResult,
): Result<void> {
  try {
    const stateResult = getSprintState();
    if (!stateResult.success) {
      return fail(stateResult.error);
    }

    const current = stateResult.data;
    const key = `${VAL_KEY_PREFIX}${acId}`;
    const existing = current.stories[key];

    if (!existing) {
      return fail(`Validation story ${key} not found in sprint state`);
    }

    const newAttempts = existing.attempts + 1;
    const now = new Date().toISOString();

    let newStatus: StoryState['status'];
    let newError: string | null = existing.lastError;

    if (result.verdict === 'pass') {
      newStatus = 'done';
      newError = null;
    } else if (result.verdict === 'blocked') {
      newStatus = 'blocked';
      newError = result.reason ?? 'blocked';
    } else if (newAttempts >= MAX_VALIDATION_ATTEMPTS) {
      newStatus = 'blocked';
      newError = 'retry-exhausted';
    } else {
      newStatus = 'failed';
      newError = result.output || 'validation failed';
    }

    const updatedStory: StoryState = {
      status: newStatus,
      attempts: newAttempts,
      lastAttempt: now,
      lastError: newError,
      proofPath: existing.proofPath,
      acResults: existing.acResults,
    };

    const updatedStories = { ...current.stories, [key]: updatedStory };
    const updatedSprint = computeSprintCounts(updatedStories);
    const updatedState: SprintState = {
      ...current,
      sprint: updatedSprint,
      stories: updatedStories,
    };

    return writeStateAtomic(updatedState);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Failed to process validation result for AC ${acId}: ${msg}`);
  }
}
