/**
 * Epic Flow Executor.
 *
 * Orchestrates sequential execution of epic_flow tasks (retro, merge,
 * validate) when an epic completes. Delegates to existing modules for
 * each step and drives epic state transitions via transitionEpicState().
 *
 * @see Story 19-2: Epic Flow Execution
 */

import type { SprintState } from '../types/state.js';
import type { TelemetryEntry } from './telemetry-writer.js';
import type { WorktreeManager, MergeStrategy, OnConflictCallback } from './worktree-manager.js';

import { transitionEpicState, type EpicLifecycleStatus } from './epic-completion.js';
import { readTelemetryForEpic } from './telemetry-writer.js';
import { validateMerge } from './cross-worktree-validator.js';

// --- Types ---

/**
 * Configuration for executing an epic flow.
 */
export interface EpicFlowConfig {
  /** The epic identifier (numeric string). */
  readonly epicId: string;
  /** Ordered list of epic_flow step names from the workflow. */
  readonly epicFlow: string[];
  /** Worktree manager instance for merge operations. */
  readonly worktreeManager: WorktreeManager;
  /** Strategy for merging the epic branch. */
  readonly mergeStrategy: MergeStrategy;
  /** Command to run for test validation. */
  readonly testCommand: string;
  /** Project root directory. */
  readonly projectDir: string;
  /** Current sprint state (immutable — each transition produces a new state). */
  readonly initialState: SprintState;
  /** Optional callback for conflict resolution during merge. */
  readonly onConflict?: OnConflictCallback;
  /** Optional callback to dispatch the analyst agent for retro. */
  readonly dispatchRetro?: (epicId: string, telemetry: TelemetryEntry[]) => Promise<void>;
  /** Optional callback invoked on each state transition. */
  readonly onStateChange?: (state: SprintState) => void;
}

/**
 * Result of a single epic_flow step.
 */
export interface EpicFlowStepResult {
  /** Step name. */
  readonly step: string;
  /** Whether the step succeeded. */
  readonly success: boolean;
  /** Wall-clock duration in milliseconds. */
  readonly durationMs: number;
  /** Error message if the step failed. */
  readonly error?: string;
}

/**
 * Result of executing the full epic flow.
 */
export interface EpicFlowResult {
  /** Whether all steps completed successfully. */
  readonly success: boolean;
  /** The epic identifier. */
  readonly epicId: string;
  /** Names of steps that completed successfully. */
  readonly stepsCompleted: string[];
  /** Detailed results for each attempted step. */
  readonly stepResults: EpicFlowStepResult[];
  /** Name of the step that failed, or null if all succeeded. */
  readonly failedStep: string | null;
  /** Error message from the failed step, or null. */
  readonly error: string | null;
  /** Total wall-clock duration in milliseconds. */
  readonly durationMs: number;
}

// --- Error ---

/**
 * Error thrown by epic flow step execution.
 */
export class EpicFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EpicFlowError';
  }
}

// --- Step-to-State Mapping ---

/**
 * Maps built-in epic_flow step names to the epic state they transition to
 * BEFORE the step executes.
 */
const STEP_STATE_MAP: Record<string, EpicLifecycleStatus> = {
  'merge': 'merging',
  'validate': 'validating',
};

/**
 * Transition sequence for an empty epicFlow.
 * The state machine requires completing → merging → validating → done;
 * we cannot skip directly from completing to done.
 */
const EMPTY_FLOW_TRANSITIONS: EpicLifecycleStatus[] = ['merging', 'validating', 'done'];

// --- Step Execution ---

/**
 * Execute a single epic_flow step.
 * Throws EpicFlowError on failure.
 */
async function executeStep(step: string, config: EpicFlowConfig): Promise<void> {
  switch (step) {
    case 'retro': {
      const telemetry = readTelemetryForEpic(config.epicId, config.projectDir);
      if (config.dispatchRetro) {
        await config.dispatchRetro(config.epicId, telemetry);
      }
      return;
    }
    case 'merge': {
      const result = await config.worktreeManager.mergeWorktree(
        config.epicId,
        config.mergeStrategy,
        config.testCommand,
        config.onConflict,
      );
      if (!result.success) {
        throw new EpicFlowError(`Merge failed: ${result.reason ?? 'unknown'}`);
      }
      return;
    }
    case 'validate': {
      const result = await validateMerge({
        testCommand: config.testCommand,
        cwd: config.projectDir,
        epicId: config.epicId,
        writeTelemetry: true,
      });
      if (!result.valid) {
        throw new EpicFlowError(`Validation failed: ${result.testResults.failed} test(s) failed`);
      }
      return;
    }
    default:
      throw new EpicFlowError(`Unknown epic_flow step: "${step}"`);
  }
}

// --- Orchestrator ---

/**
 * Execute epic_flow tasks in strict sequence.
 *
 * Transitions epic state at each step boundary:
 * - Before `merge`: completing → merging
 * - Before `validate`: merging → validating
 * - After all steps: → done
 * - On failure: → failed
 *
 * @param config  Epic flow configuration including steps, managers, and callbacks.
 * @returns Comprehensive result describing each step outcome.
 */
export async function executeEpicFlow(config: EpicFlowConfig): Promise<EpicFlowResult> {
  const start = Date.now();
  let state = config.initialState;
  const stepResults: EpicFlowStepResult[] = [];
  const stepsCompleted: string[] = [];

  // Empty flow — fast-path through the state machine to reach 'done'.
  // The state machine requires completing → merging → validating → done,
  // so we transition through each intermediate state.
  if (config.epicFlow.length === 0) {
    for (const intermediateStatus of EMPTY_FLOW_TRANSITIONS) {
      state = transitionEpicState(state, config.epicId, intermediateStatus);
      config.onStateChange?.(state);
    }
    return {
      success: true,
      epicId: config.epicId,
      stepsCompleted: [],
      stepResults: [],
      failedStep: null,
      error: null,
      durationMs: Date.now() - start,
    };
  }

  for (const step of config.epicFlow) {
    const stepStart = Date.now();

    // Transition epic state before built-in steps
    const preTransition = STEP_STATE_MAP[step];
    if (preTransition) {
      state = transitionEpicState(state, config.epicId, preTransition);
      config.onStateChange?.(state);
    }

    try {
      await executeStep(step, config);
      const stepResult: EpicFlowStepResult = {
        step,
        success: true,
        durationMs: Date.now() - stepStart,
      };
      stepResults.push(stepResult);
      stepsCompleted.push(step);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const stepResult: EpicFlowStepResult = {
        step,
        success: false,
        durationMs: Date.now() - stepStart,
        error: errorMessage,
      };
      stepResults.push(stepResult);

      // Transition to failed
      state = transitionEpicState(state, config.epicId, 'failed');
      config.onStateChange?.(state);

      return {
        success: false,
        epicId: config.epicId,
        stepsCompleted,
        stepResults,
        failedStep: step,
        error: errorMessage,
        durationMs: Date.now() - start,
      };
    }
  }

  // All steps succeeded — transition to done
  state = transitionEpicState(state, config.epicId, 'done');
  config.onStateChange?.(state);

  return {
    success: true,
    epicId: config.epicId,
    stepsCompleted,
    stepResults,
    failedStep: null,
    error: null,
    durationMs: Date.now() - start,
  };
}
