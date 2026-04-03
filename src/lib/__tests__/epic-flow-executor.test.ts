import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  executeEpicFlow,
  EpicFlowError,
  type EpicFlowConfig,
  type EpicFlowResult,
  type EpicFlowStepResult,
} from '../epic-flow-executor.js';

import { buildSprintState, buildEpicState, buildStoryEntry } from './fixtures/state-builders.js';

import type { WorktreeManager, MergeResult } from '../worktree-manager.js';
import type { SprintState } from '../../types/state.js';

// --- Mocks ---

vi.mock('../telemetry-writer.js', () => ({
  readTelemetryForEpic: vi.fn().mockReturnValue([]),
}));

vi.mock('../cross-worktree-validator.js', () => ({
  validateMerge: vi.fn().mockResolvedValue({
    valid: true,
    testResults: { passed: 10, failed: 0, coverage: 95 },
    output: '10 passed',
    durationMs: 1000,
  }),
}));

// We do NOT mock epic-completion — we use the real state machine

import { readTelemetryForEpic } from '../telemetry-writer.js';
import { validateMerge } from '../cross-worktree-validator.js';

const mockReadTelemetry = vi.mocked(readTelemetryForEpic);
const mockValidateMerge = vi.mocked(validateMerge);

// --- Helpers ---

function createMockWorktreeManager(mergeResult?: Partial<MergeResult>): WorktreeManager {
  return {
    mergeWorktree: vi.fn().mockResolvedValue({
      success: true,
      durationMs: 500,
      ...mergeResult,
    }),
    createWorktree: vi.fn(),
    cleanupWorktree: vi.fn(),
    listWorktrees: vi.fn().mockReturnValue([]),
    detectOrphans: vi.fn().mockReturnValue([]),
  } as unknown as WorktreeManager;
}

/**
 * Build a state where epic-19 is in "completing" status with all stories done.
 * This is the expected starting state when executeEpicFlow is called.
 */
function buildCompletingState(epicId = '19'): SprintState {
  return buildSprintState({
    epics: { [`epic-${epicId}`]: buildEpicState({ status: 'completing', storiesTotal: 2, storiesDone: 2 }) },
    stories: {
      [`${epicId}-1-foo`]: buildStoryEntry({ status: 'done' }),
      [`${epicId}-2-bar`]: buildStoryEntry({ status: 'done' }),
    },
  });
}

function buildBaseConfig(overrides?: Partial<EpicFlowConfig>): EpicFlowConfig {
  return {
    epicId: '19',
    epicFlow: ['retro', 'merge', 'validate'],
    worktreeManager: createMockWorktreeManager(),
    mergeStrategy: 'merge-commit',
    testCommand: 'npm test',
    projectDir: '/tmp/test-project',
    initialState: buildCompletingState(),
    ...overrides,
  };
}

// --- Tests ---

describe('epic-flow-executor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadTelemetry.mockReturnValue([]);
    mockValidateMerge.mockResolvedValue({
      valid: true,
      testResults: { passed: 10, failed: 0, coverage: 95 },
      output: '10 passed',
      durationMs: 1000,
    });
  });

  // --- Exports (AC #1) ---

  describe('exports', () => {
    it('exports executeEpicFlow function', () => {
      expect(typeof executeEpicFlow).toBe('function');
    });

    it('exports EpicFlowError class', () => {
      const err = new EpicFlowError('test');
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('EpicFlowError');
      expect(err.message).toBe('test');
    });
  });

  // --- Sequential execution (AC #2) ---

  describe('sequential execution', () => {
    it('executes retro → merge → validate in strict sequence', async () => {
      const executionOrder: string[] = [];
      const dispatchRetro = vi.fn().mockImplementation(async () => {
        executionOrder.push('retro');
      });
      const wm = createMockWorktreeManager();
      (wm.mergeWorktree as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        executionOrder.push('merge');
        return { success: true, durationMs: 100 };
      });
      mockValidateMerge.mockImplementation(async () => {
        executionOrder.push('validate');
        return { valid: true, testResults: { passed: 5, failed: 0, coverage: 90 }, output: '', durationMs: 100 };
      });

      const config = buildBaseConfig({ worktreeManager: wm, dispatchRetro });
      await executeEpicFlow(config);

      expect(executionOrder).toEqual(['retro', 'merge', 'validate']);
    });

    it('never runs steps in parallel', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;

      const trackConcurrency = async (name: string, fn: () => Promise<void>) => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await fn();
        concurrent--;
      };

      const dispatchRetro = vi.fn().mockImplementation(() =>
        trackConcurrency('retro', async () => {}),
      );
      const wm = createMockWorktreeManager();
      (wm.mergeWorktree as ReturnType<typeof vi.fn>).mockImplementation(() =>
        trackConcurrency('merge', async () => ({ success: true, durationMs: 1 })),
      );
      mockValidateMerge.mockImplementation(() =>
        trackConcurrency('validate', async () => ({
          valid: true,
          testResults: { passed: 1, failed: 0, coverage: null },
          output: '',
          durationMs: 1,
        })) as any,
      );

      const config = buildBaseConfig({ worktreeManager: wm, dispatchRetro });
      await executeEpicFlow(config);

      expect(maxConcurrent).toBe(1);
    });
  });

  // --- Retro step (AC #3) ---

  describe('retro step', () => {
    it('reads telemetry and dispatches callback', async () => {
      const mockTelemetry = [{ version: 1 as const, timestamp: '2026-01-01', storyKey: '19-1-foo', epicId: '19', duration_ms: 100, cost_usd: null, attempts: null, acResults: null, filesChanged: [], testResults: null, errors: [] }];
      mockReadTelemetry.mockReturnValue(mockTelemetry);

      const dispatchRetro = vi.fn().mockResolvedValue(undefined);
      // Use 'validating' state so the final → done transition is valid
      // (retro has no state mapping, so the state stays at validating throughout)
      const state = buildSprintState({
        epics: { 'epic-19': buildEpicState({ status: 'validating', storiesTotal: 2, storiesDone: 2 }) },
        stories: {
          '19-1-foo': buildStoryEntry({ status: 'done' }),
          '19-2-bar': buildStoryEntry({ status: 'done' }),
        },
      });
      const config = buildBaseConfig({ epicFlow: ['retro'], dispatchRetro, initialState: state });

      const result = await executeEpicFlow(config);

      expect(mockReadTelemetry).toHaveBeenCalledWith('19', '/tmp/test-project');
      expect(dispatchRetro).toHaveBeenCalledWith('19', mockTelemetry);
      expect(result.success).toBe(true);
    });

    it('succeeds without callback (retro is advisory)', async () => {
      const state = buildSprintState({
        epics: { 'epic-19': buildEpicState({ status: 'validating', storiesTotal: 1, storiesDone: 1 }) },
        stories: { '19-1-foo': buildStoryEntry({ status: 'done' }) },
      });
      const config = buildBaseConfig({ epicFlow: ['retro'], dispatchRetro: undefined, initialState: state });

      const result = await executeEpicFlow(config);

      expect(result.success).toBe(true);
      expect(result.stepsCompleted).toContain('retro');
    });

    it('passes empty telemetry array when no entries exist', async () => {
      mockReadTelemetry.mockReturnValue([]);
      const dispatchRetro = vi.fn().mockResolvedValue(undefined);
      const state = buildSprintState({
        epics: { 'epic-19': buildEpicState({ status: 'validating', storiesTotal: 1, storiesDone: 1 }) },
        stories: { '19-1-foo': buildStoryEntry({ status: 'done' }) },
      });
      const config = buildBaseConfig({ epicFlow: ['retro'], dispatchRetro, initialState: state });

      await executeEpicFlow(config);

      expect(dispatchRetro).toHaveBeenCalledWith('19', []);
    });
  });

  // --- Merge step (AC #4, #12) ---

  describe('merge step', () => {
    it('calls worktreeManager.mergeWorktree with correct args', async () => {
      const wm = createMockWorktreeManager();
      const onConflict = vi.fn();
      // State: completing → merging (merge step transitions), then merging → done not valid
      // We need: completing → merging → done. But done only from validating.
      // For a flow with just ['merge'], completing → merging, then → done.
      // But VALID_TRANSITIONS says merging can go to validating or failed, NOT done.
      // So we need at least merge + validate, or we test merge in the full flow.
      const config = buildBaseConfig({
        worktreeManager: wm,
        onConflict,
        epicFlow: ['merge', 'validate'],
      });

      await executeEpicFlow(config);

      expect(wm.mergeWorktree).toHaveBeenCalledWith('19', 'merge-commit', 'npm test', onConflict);
    });

    it('worktree cleanup happens via mergeWorktree (not separately)', async () => {
      const wm = createMockWorktreeManager();
      const config = buildBaseConfig({ worktreeManager: wm, epicFlow: ['merge', 'validate'] });

      await executeEpicFlow(config);

      // cleanupWorktree should NOT be called by the executor — it's internal to mergeWorktree
      expect(wm.cleanupWorktree).not.toHaveBeenCalled();
    });

    it('fails when mergeWorktree returns success: false with conflict', async () => {
      const wm = createMockWorktreeManager({
        success: false,
        reason: 'conflict',
        conflicts: ['src/index.ts'],
      });
      const config = buildBaseConfig({ worktreeManager: wm, epicFlow: ['merge', 'validate'] });

      const result = await executeEpicFlow(config);

      expect(result.success).toBe(false);
      expect(result.failedStep).toBe('merge');
      expect(result.error).toContain('Merge failed');
    });

    it('fails when mergeWorktree returns success: false with tests-failed', async () => {
      const wm = createMockWorktreeManager({
        success: false,
        reason: 'tests-failed',
      });
      const config = buildBaseConfig({ worktreeManager: wm, epicFlow: ['merge', 'validate'] });

      const result = await executeEpicFlow(config);

      expect(result.success).toBe(false);
      expect(result.failedStep).toBe('merge');
    });
  });

  // --- Validate step (AC #5) ---

  describe('validate step', () => {
    it('calls validateMerge with correct args', async () => {
      const config = buildBaseConfig({ epicFlow: ['merge', 'validate'] });

      await executeEpicFlow(config);

      expect(mockValidateMerge).toHaveBeenCalledWith({
        testCommand: 'npm test',
        cwd: '/tmp/test-project',
        epicId: '19',
        writeTelemetry: true,
      });
    });

    it('fails when validation returns valid: false', async () => {
      mockValidateMerge.mockResolvedValue({
        valid: false,
        testResults: { passed: 8, failed: 2, coverage: 80 },
        output: '2 failed',
        durationMs: 500,
      });

      const config = buildBaseConfig({ epicFlow: ['merge', 'validate'] });
      const result = await executeEpicFlow(config);

      expect(result.success).toBe(false);
      expect(result.failedStep).toBe('validate');
      expect(result.error).toContain('2 test(s) failed');
    });
  });

  // --- State transitions (AC #6) ---

  describe('state transitions', () => {
    it('transitions completing → merging before merge step', async () => {
      const stateChanges: string[] = [];
      const onStateChange = vi.fn().mockImplementation((s: SprintState) => {
        stateChanges.push(s.epics['epic-19'].status);
      });

      const config = buildBaseConfig({ onStateChange, epicFlow: ['merge', 'validate'] });
      await executeEpicFlow(config);

      // merging (before merge), validating (before validate), done (after all)
      expect(stateChanges).toEqual(['merging', 'validating', 'done']);
    });

    it('transitions merging → validating before validate step', async () => {
      const stateChanges: string[] = [];
      const onStateChange = vi.fn().mockImplementation((s: SprintState) => {
        stateChanges.push(s.epics['epic-19'].status);
      });

      const config = buildBaseConfig({ onStateChange, epicFlow: ['merge', 'validate'] });
      await executeEpicFlow(config);

      expect(stateChanges[1]).toBe('validating');
    });

    it('transitions to done after all steps succeed', async () => {
      const stateChanges: string[] = [];
      const onStateChange = vi.fn().mockImplementation((s: SprintState) => {
        stateChanges.push(s.epics['epic-19'].status);
      });

      const config = buildBaseConfig({ onStateChange, epicFlow: ['merge', 'validate'] });
      await executeEpicFlow(config);

      expect(stateChanges[stateChanges.length - 1]).toBe('done');
    });

    it('does not transition state for retro step (no mapping)', async () => {
      const stateChanges: string[] = [];
      const onStateChange = vi.fn().mockImplementation((s: SprintState) => {
        stateChanges.push(s.epics['epic-19'].status);
      });

      const config = buildBaseConfig({ onStateChange });
      await executeEpicFlow(config);

      // retro has no state mapping, so first change is merging (from merge step)
      expect(stateChanges[0]).toBe('merging');
    });
  });

  // --- Failure handling (AC #7) ---

  describe('failure handling', () => {
    it('skips remaining steps on failure', async () => {
      const wm = createMockWorktreeManager({ success: false, reason: 'conflict' });
      const config = buildBaseConfig({ worktreeManager: wm, epicFlow: ['merge', 'validate'] });

      const result = await executeEpicFlow(config);

      expect(result.stepsCompleted).toEqual([]);
      expect(result.failedStep).toBe('merge');
      // validate was never called
      expect(mockValidateMerge).not.toHaveBeenCalled();
    });

    it('transitions to failed on step failure', async () => {
      const stateChanges: string[] = [];
      const onStateChange = vi.fn().mockImplementation((s: SprintState) => {
        stateChanges.push(s.epics['epic-19'].status);
      });

      const wm = createMockWorktreeManager({ success: false, reason: 'conflict' });
      const config = buildBaseConfig({ worktreeManager: wm, onStateChange, epicFlow: ['merge', 'validate'] });

      await executeEpicFlow(config);

      expect(stateChanges).toContain('failed');
    });

    it('handles unknown step name as failure', async () => {
      // Need a state where completing can go to failed
      const config = buildBaseConfig({ epicFlow: ['unknown-step'] });

      const result = await executeEpicFlow(config);

      expect(result.success).toBe(false);
      expect(result.failedStep).toBe('unknown-step');
      expect(result.error).toContain('Unknown epic_flow step: "unknown-step"');
    });

    it('handles non-Error throw from a step (string coercion)', async () => {
      const wm = createMockWorktreeManager();
      (wm.mergeWorktree as ReturnType<typeof vi.fn>).mockRejectedValue('raw string error');
      const config = buildBaseConfig({ worktreeManager: wm, epicFlow: ['merge', 'validate'] });

      const result = await executeEpicFlow(config);

      expect(result.success).toBe(false);
      expect(result.failedStep).toBe('merge');
      expect(result.error).toBe('raw string error');
    });

    it('includes "unknown" reason when merge fails without a reason field', async () => {
      const wm = createMockWorktreeManager({ success: false });
      // reason is undefined — triggers the ?? 'unknown' fallback
      const config = buildBaseConfig({ worktreeManager: wm, epicFlow: ['merge', 'validate'] });

      const result = await executeEpicFlow(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('unknown');
    });

    it('handles dispatchRetro throwing an error', async () => {
      const dispatchRetro = vi.fn().mockRejectedValue(new Error('Agent dispatch failed'));
      // Retro has no state mapping; on failure it transitions to 'failed'.
      // completing → failed is valid.
      const config = buildBaseConfig({ epicFlow: ['retro'], dispatchRetro });

      const result = await executeEpicFlow(config);

      expect(result.success).toBe(false);
      expect(result.failedStep).toBe('retro');
      expect(result.error).toContain('Agent dispatch failed');
    });
  });

  // --- EpicFlowResult shape (AC #8) ---

  describe('EpicFlowResult', () => {
    it('has all expected fields on success', async () => {
      const config = buildBaseConfig({ epicFlow: ['merge', 'validate'] });
      const result = await executeEpicFlow(config);

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('epicId', '19');
      expect(result).toHaveProperty('stepsCompleted');
      expect(result).toHaveProperty('stepResults');
      expect(result).toHaveProperty('failedStep', null);
      expect(result).toHaveProperty('error', null);
      expect(result).toHaveProperty('durationMs');
      expect(typeof result.durationMs).toBe('number');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('has all expected fields on failure', async () => {
      const wm = createMockWorktreeManager({ success: false, reason: 'git-error' });
      const config = buildBaseConfig({ worktreeManager: wm, epicFlow: ['merge', 'validate'] });
      const result = await executeEpicFlow(config);

      expect(result.success).toBe(false);
      expect(result.epicId).toBe('19');
      expect(result.failedStep).toBe('merge');
      expect(result.error).toBeTruthy();
      expect(Array.isArray(result.stepsCompleted)).toBe(true);
      expect(Array.isArray(result.stepResults)).toBe(true);
      expect(typeof result.durationMs).toBe('number');
    });

    it('stepResults contain step name, success, and durationMs', async () => {
      const config = buildBaseConfig({ epicFlow: ['merge', 'validate'] });
      const result = await executeEpicFlow(config);

      for (const sr of result.stepResults) {
        expect(sr).toHaveProperty('step');
        expect(sr).toHaveProperty('success');
        expect(sr).toHaveProperty('durationMs');
        expect(typeof sr.step).toBe('string');
        expect(typeof sr.success).toBe('boolean');
        expect(typeof sr.durationMs).toBe('number');
      }
    });

    it('failed step result includes error string', async () => {
      const wm = createMockWorktreeManager({ success: false, reason: 'conflict' });
      const config = buildBaseConfig({ worktreeManager: wm, epicFlow: ['merge', 'validate'] });
      const result = await executeEpicFlow(config);

      const failedResult = result.stepResults.find((sr) => !sr.success);
      expect(failedResult).toBeDefined();
      expect(failedResult!.error).toBeTruthy();
    });
  });

  // --- EpicFlowConfig (AC #9) ---

  describe('EpicFlowConfig', () => {
    it('accepts all required fields', async () => {
      const config: EpicFlowConfig = {
        epicId: '19',
        epicFlow: ['retro', 'merge', 'validate'],
        worktreeManager: createMockWorktreeManager(),
        mergeStrategy: 'merge-commit',
        testCommand: 'npm test',
        projectDir: '/tmp/test-project',
        initialState: buildCompletingState(),
      };

      // Should not throw
      const result = await executeEpicFlow(config);
      expect(result.epicId).toBe('19');
    });

    it('accepts optional dispatchRetro callback', async () => {
      const dispatchRetro = vi.fn().mockResolvedValue(undefined);
      const state = buildSprintState({
        epics: { 'epic-19': buildEpicState({ status: 'validating', storiesTotal: 1, storiesDone: 1 }) },
        stories: { '19-1-foo': buildStoryEntry({ status: 'done' }) },
      });
      const config = buildBaseConfig({ epicFlow: ['retro'], dispatchRetro, initialState: state });

      const result = await executeEpicFlow(config);
      expect(result.success).toBe(true);
      expect(dispatchRetro).toHaveBeenCalled();
    });

    it('accepts rebase merge strategy', async () => {
      const wm = createMockWorktreeManager();
      const config = buildBaseConfig({ worktreeManager: wm, mergeStrategy: 'rebase', epicFlow: ['merge', 'validate'] });

      await executeEpicFlow(config);

      expect(wm.mergeWorktree).toHaveBeenCalledWith('19', 'rebase', 'npm test', undefined);
    });
  });

  // --- Lane freed after completion (AC #10) ---

  describe('lane freed after completion', () => {
    it('returns a resolved promise (no hanging) on success', async () => {
      const config = buildBaseConfig({ epicFlow: ['merge', 'validate'] });

      // executeEpicFlow returns a Promise<EpicFlowResult> — it must resolve
      const result = await executeEpicFlow(config);
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('returns a resolved promise (no hanging) on failure', async () => {
      const wm = createMockWorktreeManager({ success: false, reason: 'conflict' });
      const config = buildBaseConfig({ worktreeManager: wm, epicFlow: ['merge', 'validate'] });

      const result = await executeEpicFlow(config);
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
    });
  });

  // --- Empty epicFlow (AC #11) ---

  describe('empty epicFlow', () => {
    it('returns success immediately with empty stepsCompleted', async () => {
      // Empty flow from 'completing' state — the executor fast-paths through
      // completing → merging → validating → done via EMPTY_FLOW_TRANSITIONS.
      const config = buildBaseConfig({ epicFlow: [] });
      const result = await executeEpicFlow(config);

      expect(result.success).toBe(true);
      expect(result.stepsCompleted).toEqual([]);
      expect(result.stepResults).toEqual([]);
      expect(result.failedStep).toBeNull();
      expect(result.error).toBeNull();
    });

    it('transitions epic through merging → validating → done', async () => {
      const stateChanges: string[] = [];
      const onStateChange = vi.fn().mockImplementation((s: SprintState) => {
        stateChanges.push(s.epics['epic-19'].status);
      });

      const config = buildBaseConfig({ epicFlow: [], onStateChange });
      await executeEpicFlow(config);

      // Must walk the full state machine: completing → merging → validating → done
      expect(stateChanges).toEqual(['merging', 'validating', 'done']);
    });
  });

  // --- Full flow integration ---

  describe('full flow integration', () => {
    it('executes retro → merge → validate and transitions through all states', async () => {
      const stateChanges: string[] = [];
      const onStateChange = vi.fn().mockImplementation((s: SprintState) => {
        stateChanges.push(s.epics['epic-19'].status);
      });
      const dispatchRetro = vi.fn().mockResolvedValue(undefined);

      const config = buildBaseConfig({ onStateChange, dispatchRetro });
      const result = await executeEpicFlow(config);

      expect(result.success).toBe(true);
      expect(result.stepsCompleted).toEqual(['retro', 'merge', 'validate']);
      expect(result.stepResults).toHaveLength(3);
      // retro has no state transition, merge → merging, validate → validating, then → done
      expect(stateChanges).toEqual(['merging', 'validating', 'done']);
    });

    it('retro failure prevents merge and validate from running', async () => {
      const dispatchRetro = vi.fn().mockRejectedValue(new Error('retro crash'));
      const wm = createMockWorktreeManager();

      const config = buildBaseConfig({ dispatchRetro, worktreeManager: wm });
      const result = await executeEpicFlow(config);

      expect(result.success).toBe(false);
      expect(result.failedStep).toBe('retro');
      expect(wm.mergeWorktree).not.toHaveBeenCalled();
      expect(mockValidateMerge).not.toHaveBeenCalled();
    });

    it('merge failure prevents validate from running', async () => {
      const wm = createMockWorktreeManager({ success: false, reason: 'conflict' });

      const config = buildBaseConfig({ worktreeManager: wm });
      const result = await executeEpicFlow(config);

      expect(result.success).toBe(false);
      expect(result.failedStep).toBe('merge');
      expect(result.stepsCompleted).toEqual(['retro']);
      expect(mockValidateMerge).not.toHaveBeenCalled();
    });

    it('validate failure after merge success', async () => {
      mockValidateMerge.mockResolvedValue({
        valid: false,
        testResults: { passed: 3, failed: 1, coverage: null },
        output: '1 failed',
        durationMs: 200,
      });

      const config = buildBaseConfig();
      const result = await executeEpicFlow(config);

      expect(result.success).toBe(false);
      expect(result.failedStep).toBe('validate');
      expect(result.stepsCompleted).toEqual(['retro', 'merge']);
    });
  });
});
