/**
 * Sprint state consistency validator — verifies sprint-state.json integrity
 * after long runs. All functions return Result<T>, never throw.
 */

import { readFileSync, existsSync } from 'node:fs';
import { ok, fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type { SprintState, StoryStatus } from '../../types/state.js';

/** Valid story status values */
const VALID_STATUSES: ReadonlySet<string> = new Set<StoryStatus>([
  'backlog',
  'ready',
  'in-progress',
  'review',
  'verifying',
  'done',
  'failed',
  'blocked',
]);

/** A single validation issue found in the state */
export interface ValidationIssue {
  readonly storyKey: string;
  readonly field: string;
  readonly message: string;
}

/** Report from validateStateConsistency */
export interface ValidationReport {
  readonly totalStories: number;
  readonly validCount: number;
  readonly invalidCount: number;
  readonly missingKeys: ReadonlyArray<string>;
  readonly issues: ReadonlyArray<ValidationIssue>;
}

/** Threshold in ms — lastError older than this relative to lastAttempt is stale */
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Parse sprint-status.yaml and extract story keys.
 * Minimal parser: looks for top-level keys ending with ':'
 * that have a 'status:' child property.
 */
export function parseSprintStatusKeys(content: string): Result<string[]> {
  try {
    const keys: string[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match top-level keys (no leading whitespace, ends with colon)
      const match = line.match(/^([a-zA-Z0-9][a-zA-Z0-9._-]*):$/);
      if (match) {
        keys.push(match[1]);
      }
    }

    return ok(keys);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Failed to parse sprint-status.yaml: ${msg}`);
  }
}

/**
 * Parse a sprint-state.json file and return the SprintState.
 */
export function parseStateFile(statePath: string): Result<SprintState> {
  try {
    if (!existsSync(statePath)) {
      return fail(`State file not found: ${statePath}`);
    }

    const raw = readFileSync(statePath, 'utf-8');
    const parsed = JSON.parse(raw) as SprintState;
    return ok(parsed);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Failed to parse state file: ${msg}`);
  }
}

/**
 * Validate sprint-state.json consistency against sprint-status.yaml.
 *
 * Checks:
 * - Every story in sprint-status.yaml has a sprint-state.json entry
 * - All status values are valid enum members
 * - All attempt counts are non-negative integers
 * - lastError is non-stale (timestamp within last attempt window)
 */
export function validateStateConsistency(
  statePath: string,
  sprintStatusPath: string,
): Result<ValidationReport> {
  try {
    // Read and parse state file
    const stateResult = parseStateFile(statePath);
    if (!stateResult.success) {
      return fail(stateResult.error);
    }
    const state = stateResult.data;

    // Read and parse sprint-status.yaml
    if (!existsSync(sprintStatusPath)) {
      return fail(`Sprint status file not found: ${sprintStatusPath}`);
    }

    const statusContent = readFileSync(sprintStatusPath, 'utf-8');
    const keysResult = parseSprintStatusKeys(statusContent);
    if (!keysResult.success) {
      return fail(keysResult.error);
    }
    const expectedKeys = keysResult.data;

    const issues: ValidationIssue[] = [];
    const missingKeys: string[] = [];

    // Check: every story in sprint-status.yaml has a sprint-state.json entry
    for (const key of expectedKeys) {
      if (!(key in state.stories)) {
        missingKeys.push(key);
        issues.push({
          storyKey: key,
          field: 'entry',
          message: `Story "${key}" in sprint-status.yaml has no entry in sprint-state.json`,
        });
      }
    }

    // Check: sprint.total matches actual story count in state
    const actualStoryCount = Object.keys(state.stories).length;
    if (state.sprint.total !== actualStoryCount) {
      issues.push({
        storyKey: '_sprint',
        field: 'sprint.total',
        message: `sprint.total is ${state.sprint.total} but state has ${actualStoryCount} stories`,
      });
    }

    // Check: stories in state that are not in sprint-status.yaml
    for (const key of Object.keys(state.stories)) {
      if (!expectedKeys.includes(key)) {
        issues.push({
          storyKey: key,
          field: 'entry',
          message: `Story "${key}" in sprint-state.json has no entry in sprint-status.yaml`,
        });
      }
    }

    // Validate each story in state
    for (const [key, story] of Object.entries(state.stories)) {
      // Check: valid status
      if (!VALID_STATUSES.has(story.status)) {
        issues.push({
          storyKey: key,
          field: 'status',
          message: `Invalid status "${story.status}" (expected one of: ${[...VALID_STATUSES].join(', ')})`,
        });
      }

      // Check: non-negative integer attempts
      if (
        typeof story.attempts !== 'number' ||
        !Number.isInteger(story.attempts) ||
        story.attempts < 0
      ) {
        issues.push({
          storyKey: key,
          field: 'attempts',
          message: `Invalid attempts value "${story.attempts}" (must be non-negative integer)`,
        });
      }

      // Check: lastError staleness
      if (story.lastError !== null && story.lastAttempt !== null) {
        const attemptTime = new Date(story.lastAttempt).getTime();
        const now = Date.now();
        if (!isNaN(attemptTime) && now - attemptTime > STALE_THRESHOLD_MS) {
          issues.push({
            storyKey: key,
            field: 'lastError',
            message: `Stale lastError: lastAttempt was "${story.lastAttempt}" (>24h ago)`,
          });
        }
      }
    }

    // Total = union of sprint-status keys and state keys
    const allKeys = new Set([...expectedKeys, ...Object.keys(state.stories)]);
    const totalStories = allKeys.size;
    const invalidCount = new Set(issues.map((i) => i.storyKey)).size;
    const validCount = totalStories - invalidCount;

    return ok({
      totalStories,
      validCount,
      invalidCount,
      missingKeys,
      issues,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Validation failed: ${msg}`);
  }
}
