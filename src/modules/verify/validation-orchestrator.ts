/**
 * Validation orchestrator — coordinates AC execution, result processing,
 * progress tracking, and dev-routing for the self-validation cycle.
 *
 * Story 10-2: Validation Infrastructure
 */

import { ok, fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type { StoryState } from '../../types/state.js';
import { VALIDATION_ACS, getACById } from './validation-acs.js';
import type {
  ValidationCycleResult,
  ValidationProgress,
} from './validation-runner-types.js';
import { getSprintState } from '../sprint/index.js';
import { developStory } from '../dev/index.js';
import {
  executeValidationAC,
  createFixStory,
  processValidationResult,
  MAX_VALIDATION_ATTEMPTS,
  VAL_KEY_PREFIX,
} from './validation-runner.js';

/**
 * Get aggregate validation progress (AC 8).
 * Returns counts: total, passed, failed, blocked, remaining, and per-AC status.
 */
export function getValidationProgress(): Result<ValidationProgress> {
  try {
    const stateResult = getSprintState();
    if (!stateResult.success) {
      return fail(stateResult.error);
    }

    const stories = stateResult.data.stories;
    let total = 0;
    let passed = 0;
    let failed = 0;
    let blocked = 0;
    let remaining = 0;
    const perAC: Array<{ acId: number; status: StoryState['status']; attempts: number; lastError: string | null }> = [];

    for (const ac of VALIDATION_ACS) {
      const key = `${VAL_KEY_PREFIX}${ac.id}`;
      const story = stories[key];
      if (!story) continue;

      total++;
      switch (story.status) {
        case 'done':
          passed++;
          break;
        case 'failed':
          failed++;
          break;
        case 'blocked':
          blocked++;
          break;
        case 'backlog':
        case 'ready':
          remaining++;
          break;
        default:
          remaining++;
          break;
      }

      perAC.push({
        acId: ac.id,
        status: story.status,
        attempts: story.attempts,
        lastError: story.lastError ?? null,
      });
    }

    return ok({ total, passed, failed, blocked, remaining, perAC });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Failed to get validation progress: ${msg}`);
  }
}

/**
 * Run one validation cycle: select next failing/backlog AC, execute it,
 * process result, and route failures to dev (AC 2, 3).
 */
export function runValidationCycle(): Result<ValidationCycleResult> {
  try {
    const stateResult = getSprintState();
    if (!stateResult.success) {
      return fail(stateResult.error);
    }

    const stories = stateResult.data.stories;

    // Find next actionable validation AC: prefer failed, then backlog
    let targetAcId: number | null = null;

    // First pass: find failed ACs (re-validation)
    for (const ac of VALIDATION_ACS) {
      const key = `${VAL_KEY_PREFIX}${ac.id}`;
      const story = stories[key];
      if (story && story.status === 'failed' && story.attempts < MAX_VALIDATION_ATTEMPTS) {
        targetAcId = ac.id;
        break;
      }
    }

    // Second pass: find backlog ACs
    if (targetAcId === null) {
      for (const ac of VALIDATION_ACS) {
        const key = `${VAL_KEY_PREFIX}${ac.id}`;
        const story = stories[key];
        if (story && story.status === 'backlog') {
          targetAcId = ac.id;
          break;
        }
      }
    }

    if (targetAcId === null) {
      return ok({
        acId: 0,
        action: 'no-actionable-ac',
      });
    }

    const ac = getACById(targetAcId);
    if (!ac) {
      return fail(`AC ${targetAcId} not found in registry`);
    }

    // Execute the AC
    const execResult = executeValidationAC(ac);
    if (!execResult.success) {
      return fail(execResult.error);
    }

    const acResult = execResult.data;

    // Process the result (update state)
    const processResult = processValidationResult(ac.id, acResult);
    if (!processResult.success) {
      return fail(processResult.error);
    }

    // Route based on verdict
    if (acResult.verdict === 'pass') {
      return ok({
        acId: ac.id,
        action: 'passed',
        result: acResult,
      });
    }

    if (acResult.verdict === 'blocked') {
      return ok({
        acId: ac.id,
        action: 'blocked',
        result: acResult,
      });
    }

    // Failed: create fix story and route to dev
    const fixResult = createFixStory(ac, acResult.output);
    if (!fixResult.success) {
      return fail(fixResult.error);
    }

    const fixStoryKey = fixResult.data;

    // Route to dev module — check result but don't block on failure
    const devResult = developStory(fixStoryKey);
    if (!devResult.success) {
      return ok({
        acId: ac.id,
        action: 'failed-routed-to-dev',
        result: acResult,
        fixStoryKey,
        devError: devResult.error,
      });
    }

    return ok({
      acId: ac.id,
      action: 'failed-routed-to-dev',
      result: acResult,
      fixStoryKey,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Validation cycle failed: ${msg}`);
  }
}
