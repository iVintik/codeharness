import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { existsSync as origExistsSync, readFileSync as origReadFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { resolvePluginDir, countStories } from '../run.js';

// --- Hoisted mocks ---
const {
  getDriverMock, existsSyncMock, readSprintStatusMock,
  realExistsSync, startRendererMock, rendererCleanupMock,
  getSprintStateMock, reconcileStateMock,
  isDockerAvailableMock, cleanupContainersMock,
  parseWorkflowMock, resolveWorkflowMock, resolveAgentMock, compileSubagentMock,
  executeWorkflowMock,
  readWorkflowStateMock, writeWorkflowStateMock,
} = vi.hoisted(() => {
   
  const fs = require('node:fs');
  const realFn = fs.existsSync.bind(fs);

  const rendererCleanupMock = vi.fn();

  return {
    getDriverMock: vi.fn(() => { throw new Error('No agent drivers available'); }),
    existsSyncMock: vi.fn(realFn),
    readSprintStatusMock: vi.fn(() => ({}) as Record<string, string>),
    realExistsSync: realFn as (path: string) => boolean,
    startRendererMock: vi.fn(() => ({
      update: vi.fn(),
      updateSprintState: vi.fn(),
      updateStories: vi.fn(),
      addMessage: vi.fn(),
      updateWorkflowState: vi.fn(),
      processLaneEvent: vi.fn(),
      updateMergeState: vi.fn(),
      cleanup: rendererCleanupMock,
    })),
    rendererCleanupMock,
    getSprintStateMock: vi.fn((): { success: boolean; data?: Record<string, unknown>; error?: string } => ({ success: false, error: 'no state' })),
    reconcileStateMock: vi.fn(() => ({ success: true, data: { corrections: [], stateChanged: false } })),
    isDockerAvailableMock: vi.fn(() => true),
    cleanupContainersMock: vi.fn((): { success: boolean; data?: { containersRemoved: number; names: string[] }; error?: string } => ({ success: true, data: { containersRemoved: 0, names: [] } })),
    parseWorkflowMock: vi.fn(() => ({
      tasks: {
        implement: { agent: 'dev', session: 'fresh', source_access: true },
      },
      flow: ['implement'],
      storyFlow: ['implement'],
      epicFlow: ['story_flow'],
      sprintFlow: [],
    })),
    resolveWorkflowMock: vi.fn(() => ({
      tasks: {
        implement: { agent: 'dev', session: 'fresh', source_access: true },
      },
      flow: ['implement'],
      storyFlow: ['implement'],
      epicFlow: ['story_flow'],
      sprintFlow: [],
    })),
    resolveAgentMock: vi.fn(() => ({
      name: 'dev',
      role: { title: 'Developer', purpose: 'Implement code' },
      persona: { identity: 'A developer', communication_style: 'direct', principles: [] },
    })),
    compileSubagentMock: vi.fn(() => ({
      name: 'dev',
      model: 'claude-sonnet-4-20250514',
      instructions: 'You are a developer',
      disallowedTools: [],
      bare: true,
    })),
    executeWorkflowMock: vi.fn(async () => ({
      success: true,
      tasksCompleted: 3,
      storiesProcessed: 1,
      errors: [],
      durationMs: 60000,
    })),
    readWorkflowStateMock: vi.fn(() => ({
      workflow_name: '',
      started: '',
      iteration: 0,
      phase: 'idle',
      tasks_completed: [],
      evaluator_scores: [],
      circuit_breaker: { triggered: false, reason: null, score_history: [] },
      trace_ids: [],
    })),
    writeWorkflowStateMock: vi.fn(),
  };
});

vi.mock('../../lib/agents/index.js', () => ({
  getDriver: (...args: unknown[]) => getDriverMock(...(args as Parameters<typeof getDriverMock>)),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: existsSyncMock };
});

vi.mock('../../lib/ink-renderer.js', () => ({
  startRenderer: (...args: unknown[]) => startRendererMock(...(args as Parameters<typeof startRendererMock>)),
}));

vi.mock('../../modules/sprint/index.js', () => ({
  getSprintState: (...args: unknown[]) => getSprintStateMock(...(args as Parameters<typeof getSprintStateMock>)),
  readSprintStatusFromState: (...args: unknown[]) => readSprintStatusMock(...(args as Parameters<typeof readSprintStatusMock>)),
  reconcileState: (...args: unknown[]) => reconcileStateMock(...(args as Parameters<typeof reconcileStateMock>)),
  updateStoryStatus: vi.fn(() => ({ success: true, data: undefined })),
  shouldDeferPhase: vi.fn(() => false),
  getPhaseEstimate: vi.fn(() => 15),
  computeRemainingMinutes: vi.fn(() => 60),
}));

vi.mock('../../lib/docker/index.js', () => ({
  isDockerAvailable: (...args: unknown[]) => isDockerAvailableMock(...(args as Parameters<typeof isDockerAvailableMock>)),
}));

vi.mock('../../modules/infra/index.js', () => ({
  cleanupContainers: (...args: unknown[]) => cleanupContainersMock(...(args as Parameters<typeof cleanupContainersMock>)),
}));

vi.mock('../../lib/workflow-parser.js', () => ({
  parseWorkflow: (...args: unknown[]) => parseWorkflowMock(...(args as Parameters<typeof parseWorkflowMock>)),
  resolveWorkflow: (...args: unknown[]) => resolveWorkflowMock(...(args as Parameters<typeof resolveWorkflowMock>)),
}));

vi.mock('../../lib/agent-resolver.js', () => ({
  resolveAgent: (...args: unknown[]) => resolveAgentMock(...(args as Parameters<typeof resolveAgentMock>)),
  compileSubagentDefinition: (...args: unknown[]) => compileSubagentMock(...(args as Parameters<typeof compileSubagentMock>)),
}));

vi.mock('../../lib/workflow-runner.js', () => ({
  runWorkflowActor: (...args: unknown[]) => executeWorkflowMock(...(args as Parameters<typeof executeWorkflowMock>)),
}));

vi.mock('../../lib/workflow-state.js', () => ({
  readWorkflowState: (...args: unknown[]) => readWorkflowStateMock(...(args as Parameters<typeof readWorkflowStateMock>)),
  writeWorkflowState: (...args: unknown[]) => writeWorkflowStateMock(...(args as Parameters<typeof writeWorkflowStateMock>)),
}));


describe('run command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'run-test-'));
    getDriverMock.mockClear();
    existsSyncMock.mockReset();
    existsSyncMock.mockImplementation((p: unknown) => realExistsSync(String(p)));
    readSprintStatusMock.mockReset();
    readSprintStatusMock.mockReturnValue({});
    startRendererMock.mockClear();
    rendererCleanupMock.mockClear();
    getSprintStateMock.mockClear();
    getSprintStateMock.mockReturnValue({ success: false, error: 'no state' });
    reconcileStateMock.mockClear();
    reconcileStateMock.mockReturnValue({ success: true, data: { corrections: [], stateChanged: false } });
    isDockerAvailableMock.mockClear();
    isDockerAvailableMock.mockReturnValue(true);
    cleanupContainersMock.mockClear();
    cleanupContainersMock.mockReturnValue({ success: true, data: { containersRemoved: 0, names: [] } });
    parseWorkflowMock.mockReset();
    parseWorkflowMock.mockReturnValue({
      tasks: {
        implement: { agent: 'dev', session: 'fresh', source_access: true },
      },
      flow: ['implement'],
      storyFlow: ['implement'],
      epicFlow: ['story_flow'],
      sprintFlow: [],
    });
    resolveWorkflowMock.mockReset();
    resolveWorkflowMock.mockReturnValue({
      tasks: {
        implement: { agent: 'dev', session: 'fresh', source_access: true },
      },
      flow: ['implement'],
      storyFlow: ['implement'],
      epicFlow: ['story_flow'],
      sprintFlow: [],
    });
    resolveAgentMock.mockReset();
    resolveAgentMock.mockReturnValue({
      name: 'dev',
      role: { title: 'Developer', purpose: 'Implement code' },
      persona: { identity: 'A developer', communication_style: 'direct', principles: [] },
    });
    compileSubagentMock.mockReset();
    compileSubagentMock.mockReturnValue({
      name: 'dev',
      model: 'claude-sonnet-4-20250514',
      instructions: 'You are a developer',
      disallowedTools: [],
      bare: true,
    });
    executeWorkflowMock.mockReset();
    executeWorkflowMock.mockResolvedValue({
      success: true,
      tasksCompleted: 3,
      storiesProcessed: 1,
      errors: [],
      durationMs: 60000,
    });
    readWorkflowStateMock.mockReset();
    readWorkflowStateMock.mockReturnValue({
      workflow_name: '',
      started: '',
      iteration: 0,
      phase: 'idle',
      tasks_completed: [],
      evaluator_scores: [],
      circuit_breaker: { triggered: false, reason: null, score_history: [] },
      trace_ids: [],
    });
    writeWorkflowStateMock.mockReset();
    process.exitCode = undefined;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  function mockPaths(overrides: Record<string, boolean>) {
    existsSyncMock.mockImplementation((p: unknown) => {
      const path = String(p);
      for (const [pattern, value] of Object.entries(overrides)) {
        if (path.includes(pattern)) return value;
      }
      return realExistsSync(path);
    });
  }

  async function runCommand(args: string[] = []) {
    const { registerRunCommand } = await import('../run.js');
    const program = new Command();
    program.exitOverride();
    program.option('--json', 'JSON output');
    registerRunCommand(program);
    await program.parseAsync(['node', 'codeharness', 'run', ...args]);
  }

  describe('resolvePluginDir', () => {
    it('returns cwd/.claude', () => {
      expect(resolvePluginDir()).toBe(join(process.cwd(), '.claude'));
    });
  });

  describe('countStories (re-export)', () => {
    it('re-exports countStories from run-helpers.ts', () => {
      const counts = countStories({ '1-1-story': 'done', '1-2-story': 'backlog' });
      expect(counts.total).toBe(2);
      expect(counts.done).toBe(1);
    });
  });

  describe('action handler', () => {
    it('fails when plugin directory not found', async () => {
      mockPaths({ '.claude': false });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Plugin directory not found'));
      expect(process.exitCode).toBe(1);
    });

    it('fails when Docker is unavailable', async () => {
      mockPaths({ '.claude': true });
      isDockerAvailableMock.mockReturnValue(false);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Docker not available'));
      expect(process.exitCode).toBe(1);
    });

    it('fails when no stories found in sprint state', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({});
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No stories found'));
      expect(process.exitCode).toBe(1);
    });

    it('fails when no stories are ready for execution (AC #9)', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'done', '1-2-story': 'done' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No stories ready for execution'));
      expect(process.exitCode).toBe(1);
    });

    it('calls executeWorkflow on success path (AC #1, #2)', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(resolveWorkflowMock).toHaveBeenCalled();
      expect(resolveAgentMock).toHaveBeenCalled();
      expect(executeWorkflowMock).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Workflow completed'));
      expect(process.exitCode).toBeUndefined();
    });

    it('prints truthful interrupt message when persistence was cleared after a late interrupt', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      let resolveRun: ((value: {
        success: boolean;
        tasksCompleted: number;
        storiesProcessed: number;
        errors: [];
        durationMs: number;
        finalPhase: string;
        persistenceState: 'cleared' | 'preserved';
      }) => void) | undefined;
      executeWorkflowMock.mockImplementation(() => new Promise((resolve) => {
        resolveRun = resolve;
      }));

      const runPromise = runCommand();
      await new Promise((resolve) => setTimeout(resolve, 20));
      process.emit('SIGINT', 'SIGINT');
      resolveRun?.({ success: true, tasksCompleted: 3, storiesProcessed: 1, errors: [], durationMs: 60000, finalPhase: 'completed', persistenceState: 'cleared' });
      await runPromise;

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Interrupted after current task finished'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('no resume state was kept'));
      expect(process.exitCode).toBe(130);
    });

    it('prints resume message when interrupt preserved persistence', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      let resolveRun: ((value: {
        success: boolean;
        tasksCompleted: number;
        storiesProcessed: number;
        errors: [];
        durationMs: number;
        finalPhase: string;
        persistenceState: 'cleared' | 'preserved';
      }) => void) | undefined;
      executeWorkflowMock.mockImplementation(() => new Promise((resolve) => {
        resolveRun = resolve;
      }));

      const runPromise = runCommand();
      await new Promise((resolve) => setTimeout(resolve, 20));
      process.emit('SIGINT', 'SIGINT');
      resolveRun?.({ success: false, tasksCompleted: 2, storiesProcessed: 1, errors: [], durationMs: 12000, finalPhase: 'interrupted', persistenceState: 'preserved' });
      await runPromise;

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('State saved — run again to resume'));
      expect(process.exitCode).toBe(130);
    });

    it('constructs EngineConfig correctly from CLI options (AC #4)', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand(['--max-iterations', '10']);

      expect(executeWorkflowMock).toHaveBeenCalled();
      const config = executeWorkflowMock.mock.calls[0][0];
      expect(config.maxIterations).toBe(10);
      expect(config.runId).toMatch(/^run-\d+$/);
      expect(config.workflow).toBeDefined();
      expect(config.agents).toBeDefined();
      expect(config.sprintStatusPath).toContain('sprint-status.yaml');
    });

    it('exits 1 on workflow failure (AC #2)', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      executeWorkflowMock.mockResolvedValue({
        success: false,
        tasksCompleted: 1,
        storiesProcessed: 1,
        errors: [{ taskName: 'implement', storyKey: '1-1-story', code: 'UNKNOWN', message: 'dispatch failed' }],
        durationMs: 5000,
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Workflow failed'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('dispatch failed'));
      expect(process.exitCode).toBe(1);
    });

    it('exits 1 when executeWorkflow throws', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      executeWorkflowMock.mockRejectedValue(new Error('engine crashed'));
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Workflow engine error'));
      expect(process.exitCode).toBe(1);
    });

    it('exits 1 when workflow resolution fails', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      resolveWorkflowMock.mockImplementation(() => { throw new Error('bad YAML'); });
      // Fallback also fails
      parseWorkflowMock.mockImplementation(() => { throw new Error('fallback bad YAML'); });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to resolve workflow'));
      expect(process.exitCode).toBe(1);
    });

    it('exits 1 when agent resolution fails', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      resolveAgentMock.mockImplementation(() => { throw new Error('agent not found'); });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to resolve agents'));
      expect(process.exitCode).toBe(1);
    });

    it('logs reconciliation corrections when present', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      reconcileStateMock.mockReturnValue({
        success: true,
        data: { corrections: ['Fixed story-a status'], stateChanged: true },
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Reconciled: Fixed story-a status'));
    });

    it('warns when state reconciliation fails', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      reconcileStateMock.mockReturnValue({ success: false, error: 'state file corrupt' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('State reconciliation failed'));
    });

    it('logs container cleanup when containers removed', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      cleanupContainersMock.mockReturnValue({
        success: true,
        data: { containersRemoved: 2, names: ['harness-a', 'harness-b'] },
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Cleaned up 2 orphaned container(s)'));
    });

    it('warns when container cleanup fails', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      cleanupContainersMock.mockReturnValue({ success: false, error: 'docker socket error' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Container cleanup failed'));
    });

    it('fails with invalid numeric option', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand(['--max-iterations', 'abc']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid numeric option'));
      expect(process.exitCode).toBe(1);
    });

    it('--resume resets completed phase to idle before executing (AC #3)', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      readWorkflowStateMock.mockReturnValue({
        workflow_name: 'implement -> verify',
        started: new Date().toISOString(),
        iteration: 3,
        phase: 'completed',
        tasks_completed: [],
        evaluator_scores: [],
        circuit_breaker: { triggered: false, reason: null, score_history: [] },
        trace_ids: [],
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand(['--resume']);

      expect(writeWorkflowStateMock).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'idle' }),
        expect.any(String),
      );
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Resuming from completed state'));
      expect(executeWorkflowMock).toHaveBeenCalled();
    });

    it('--resume does nothing when phase is not completed', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      readWorkflowStateMock.mockReturnValue({
        workflow_name: '',
        started: '',
        iteration: 0,
        phase: 'idle',
        tasks_completed: [],
        evaluator_scores: [],
        circuit_breaker: { triggered: false, reason: null, score_history: [] },
        trace_ids: [],
      });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand(['--resume']);

      expect(writeWorkflowStateMock).not.toHaveBeenCalled();
      expect(executeWorkflowMock).toHaveBeenCalled();
    });

    it('--resume resets circuit-breaker phase: triggered/reason/phase reset, score_history and evaluator_scores preserved', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      readWorkflowStateMock.mockReturnValue({
        workflow_name: 'implement -> verify',
        started: new Date().toISOString(),
        iteration: 5,
        phase: 'circuit-breaker',
        tasks_completed: ['implement:1', 'verify:1'],
        evaluator_scores: [
          { iteration: 1, passed: 3, failed: 2, unknown: 0, total: 5, timestamp: '2026-04-03T00:00:00.000Z' },
          { iteration: 2, passed: 3, failed: 2, unknown: 0, total: 5, timestamp: '2026-04-03T00:01:00.000Z' },
        ],
        circuit_breaker: {
          triggered: true,
          reason: 'Stagnation detected: no improvement for 2 consecutive iterations',
          score_history: [3, 3],
        },
        trace_ids: ['trace-1'],
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand(['--resume']);

      expect(writeWorkflowStateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: 'idle',
          circuit_breaker: expect.objectContaining({
            triggered: false,
            reason: null,
            score_history: [3, 3],
          }),
          evaluator_scores: [
            { iteration: 1, passed: 3, failed: 2, unknown: 0, total: 5, timestamp: '2026-04-03T00:00:00.000Z' },
            { iteration: 2, passed: 3, failed: 2, unknown: 0, total: 5, timestamp: '2026-04-03T00:01:00.000Z' },
          ],
          tasks_completed: ['implement:1', 'verify:1'],
          iteration: 5,
        }),
        expect.any(String),
      );
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Resuming after circuit breaker — previous findings preserved'));
      expect(executeWorkflowMock).toHaveBeenCalled();
    });

    it('--resume with circuit-breaker logs appropriate info message', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      readWorkflowStateMock.mockReturnValue({
        workflow_name: '',
        started: '',
        iteration: 2,
        phase: 'circuit-breaker',
        tasks_completed: [],
        evaluator_scores: [],
        circuit_breaker: { triggered: true, reason: 'stagnation', score_history: [1] },
        trace_ids: [],
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand(['--resume']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Resuming after circuit breaker'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('previous findings preserved'));
    });

    it('--resume with completed phase still works as before (regression)', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      readWorkflowStateMock.mockReturnValue({
        workflow_name: 'implement -> verify',
        started: new Date().toISOString(),
        iteration: 3,
        phase: 'completed',
        tasks_completed: [],
        evaluator_scores: [],
        circuit_breaker: { triggered: false, reason: null, score_history: [] },
        trace_ids: [],
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand(['--resume']);

      expect(writeWorkflowStateMock).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'idle' }),
        expect.any(String),
      );
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Resuming from completed state'));
    });

    it('without --resume, circuit-breaker phase is NOT reset (AC #5)', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      readWorkflowStateMock.mockReturnValue({
        workflow_name: '',
        started: '',
        iteration: 5,
        phase: 'circuit-breaker',
        tasks_completed: [],
        evaluator_scores: [],
        circuit_breaker: { triggered: true, reason: 'stagnation', score_history: [3, 3] },
        trace_ids: [],
      });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(writeWorkflowStateMock).not.toHaveBeenCalled();
      expect(executeWorkflowMock).toHaveBeenCalled();
    });

    // ── story 27-4: config.onEvent → renderer bridge ──────────────────────────

    it('EngineConfig includes onEvent handler that routes stream-event to renderer.update (story 27-4)', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(executeWorkflowMock).toHaveBeenCalled();
      const config = executeWorkflowMock.mock.calls[0][0];
      expect(typeof config.onEvent).toBe('function');

      // The renderer mock is captured from startRendererMock
      const rendererHandle = startRendererMock.mock.results[0].value;

      // Invoke onEvent with a stream-event — should route to renderer.update()
      config.onEvent({
        type: 'stream-event',
        taskName: 'implement',
        storyKey: '1-1-story',
        driverName: 'claude-code',
        streamEvent: { type: 'text', text: 'hello from agent' },
      });
      expect(rendererHandle.update).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'text', text: 'hello from agent' }),
        'claude-code',
      );
    });

    it('EngineConfig.onEvent routes dispatch-error to renderer.addMessage and marks story failed (story 27-4)', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      const config = executeWorkflowMock.mock.calls[0][0];
      const rendererHandle = startRendererMock.mock.results[0].value;

      config.onEvent({
        type: 'dispatch-error',
        taskName: 'implement',
        storyKey: '1-1-story',
        error: { code: 'UNKNOWN', message: 'task exploded' },
      });

      expect(rendererHandle.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'fail', message: expect.stringContaining('task exploded') }),
      );
      expect(rendererHandle.updateStories).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ key: '1-1-story', status: 'failed' })]),
      );
    });

    it('gate dispatch-error (storyKey with colon) shows warn message but does NOT mark story failed (story 27-4 review)', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      const config = executeWorkflowMock.mock.calls[0][0];
      const rendererHandle = startRendererMock.mock.results[0].value;

      // Gate machine emits dispatch-error with namespaced storyKey (e.g. "1-1-story:quality")
      config.onEvent({
        type: 'dispatch-error',
        taskName: 'review',
        storyKey: '1-1-story:quality',
        error: { code: 'UNKNOWN', message: 'check failed, retrying' },
      });

      // Must show the error as a warning — not a failure
      expect(rendererHandle.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'warn', message: expect.stringContaining('check failed, retrying') }),
      );
      // Must NOT mark the story as failed — gate is still in its retry loop
      const allUpdateStoriesCalls = rendererHandle.updateStories.mock.calls.flat(2);
      const failedEntries = allUpdateStoriesCalls.filter(
        (e: { key?: string; status?: string }) => e.key === '1-1-story' && e.status === 'failed'
      );
      expect(failedEntries).toHaveLength(0);
    });
  });

  describe('--workflow option (Story 9.2)', () => {
    it('passes --workflow name and cwd to resolveWorkflow', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand(['--workflow', 'my-workflow']);

      expect(resolveWorkflowMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'my-workflow', cwd: expect.any(String) }),
      );
    });

    it('defaults to "default" when --workflow is not specified', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(resolveWorkflowMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'default' }),
      );
    });

    it('exits 1 with clear error when custom workflow not found (no fallback)', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      resolveWorkflowMock.mockImplementation(() => {
        throw new Error('Embedded workflow not found: my-workflow');
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand(['--workflow', 'my-workflow']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to resolve workflow'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('my-workflow'));
      expect(process.exitCode).toBe(1);
      // Should NOT attempt fallback for non-default workflows
      expect(parseWorkflowMock).not.toHaveBeenCalled();
    });

    it('rejects workflow names with path traversal characters', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand(['--workflow', '../../../etc/passwd']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid workflow name'));
      expect(process.exitCode).toBe(1);
      expect(resolveWorkflowMock).not.toHaveBeenCalled();
    });

    it('rejects workflow names with slashes', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand(['--workflow', 'foo/bar']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid workflow name'));
      expect(process.exitCode).toBe(1);
    });

    it('rejects workflow names with dots', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand(['--workflow', 'my.workflow']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid workflow name'));
      expect(process.exitCode).toBe(1);
    });

    it('accepts valid workflow names with hyphens and underscores', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand(['--workflow', 'my-custom_workflow123']);

      expect(resolveWorkflowMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'my-custom_workflow123' }),
      );
    });

    it('still uses fallback for default workflow when resolveWorkflow fails', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      resolveWorkflowMock.mockImplementation(() => { throw new Error('bad YAML'); });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      // Default workflow should try fallback
      expect(parseWorkflowMock).toHaveBeenCalled();
    });
  });

  describe('run command registration', () => {
    it('registers the run command with correct options', async () => {
      const { registerRunCommand } = await import('../run.js');
      const program = new Command();
      program.option('--json', 'JSON output');
      registerRunCommand(program);

      const runCmd = program.commands.find(c => c.name() === 'run');
      expect(runCmd).toBeDefined();
      expect(runCmd!.description()).toBe('Execute the autonomous coding loop');

      const optionNames = runCmd!.options.map(o => o.long);
      expect(optionNames).toContain('--max-iterations');
      expect(optionNames).toContain('--timeout');
      expect(optionNames).toContain('--quiet');
      expect(optionNames).toContain('--max-story-retries');
      expect(optionNames).toContain('--resume');
      expect(optionNames).toContain('--workflow');
    });

    it('--max-story-retries defaults to 10', async () => {
      const { registerRunCommand } = await import('../run.js');
      const program = new Command();
      program.option('--json', 'JSON output');
      registerRunCommand(program);

      const runCmd = program.commands.find(c => c.name() === 'run');
      const retryOpt = runCmd!.options.find(o => o.long === '--max-story-retries');
      expect(retryOpt!.defaultValue).toBe('10');
    });
  });

  describe('source code verification', () => {
    it('run.ts does not import spawn from node:child_process', () => {
      const runSource = origReadFileSync(
        join(process.cwd(), 'src', 'commands', 'run.ts'),
        'utf-8',
      );
      expect(runSource).not.toContain("from 'node:child_process'");
    });

    it('run.ts does not import buildSpawnArgs or resolveRalphPath', () => {
      const runSource = origReadFileSync(
        join(process.cwd(), 'src', 'commands', 'run.ts'),
        'utf-8',
      );
      expect(runSource).not.toContain('buildSpawnArgs');
      expect(runSource).not.toContain('resolveRalphPath');
    });

    it('run.ts does not import or use createLineProcessor', () => {
      const runSource = origReadFileSync(
        join(process.cwd(), 'src', 'commands', 'run.ts'),
        'utf-8',
      );
      expect(runSource).not.toContain('createLineProcessor');
    });

    it('run.ts does not import getDriver (Ralph spawn removed in Story 1.2)', () => {
      const runSource = origReadFileSync(
        join(process.cwd(), 'src', 'commands', 'run.ts'),
        'utf-8',
      );
      expect(runSource).not.toContain('getDriver');
    });

    it('run.ts does not import DashboardFormatter', () => {
      const runSource = origReadFileSync(
        join(process.cwd(), 'src', 'commands', 'run.ts'),
        'utf-8',
      );
      expect(runSource).not.toContain('DashboardFormatter');
    });

    it('run.ts does not import generateRalphPrompt', () => {
      const runSource = origReadFileSync(
        join(process.cwd(), 'src', 'commands', 'run.ts'),
        'utf-8',
      );
      expect(runSource).not.toContain('generateRalphPrompt');
    });

    it('run.ts imports workflow-engine, workflow-parser, and agent-resolver', () => {
      const runSource = origReadFileSync(
        join(process.cwd(), 'src', 'commands', 'run.ts'),
        'utf-8',
      );
      expect(runSource).toContain('workflow-runner');
      expect(runSource).toContain('workflow-parser');
      expect(runSource).toContain('agent-resolver');
    });
  });
});
