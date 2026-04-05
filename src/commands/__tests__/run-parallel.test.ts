import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import { extractEpicId, buildEpicDescriptors } from '../run.js';
import type { SprintState } from '../../types/state.js';

// --- Hoisted mocks ---
// Mutable references so mockPoolAndWorktree can swap implementations at test time
let _poolFactory: () => Record<string, unknown>;
let _wtFactory: () => Record<string, unknown>;
// Track constructor calls for assertions
let _lanePoolConstructed = false;
let _lanePoolConstructorArgs: unknown[] = [];
let _worktreeManagerConstructed = false;

const {
  existsSyncMock, readSprintStatusMock, reconcileStateMock,
  isDockerAvailableMock, cleanupContainersMock,
  resolveWorkflowMock, resolveAgentMock, compileSubagentMock,
  executeWorkflowMock,
  readWorkflowStateMock, writeWorkflowStateMock,
  getSprintStateMock,
  LanePoolClass, WorktreeManagerClass,
  realExistsSync,
} = vi.hoisted(() => {
   
  const fs = require('node:fs');
  const realFn = fs.existsSync.bind(fs);

  // Class mocks that delegate to the mutable factories
   
  class LanePoolClass {
    constructor(...args: unknown[]) {
      _lanePoolConstructed = true;
      _lanePoolConstructorArgs = args;
      return _poolFactory();
    }
  }
   
  class WorktreeManagerClass {
    constructor(..._args: unknown[]) {
      _worktreeManagerConstructed = true;
      return _wtFactory();
    }
  }

  return {
    existsSyncMock: vi.fn(realFn),
    readSprintStatusMock: vi.fn(() => ({}) as Record<string, string>),
    reconcileStateMock: vi.fn(() => ({ success: true, data: { corrections: [], stateChanged: false } })),
    isDockerAvailableMock: vi.fn(() => true),
    cleanupContainersMock: vi.fn(() => ({ success: true, data: { containersRemoved: 0, names: [] } })),
    resolveWorkflowMock: vi.fn((_opts?: unknown): {
      tasks: Record<string, unknown>;
      flow: string[];
      execution?: { epic_strategy: string; max_parallel: number; isolation: string; merge_strategy: string; story_strategy: string };
      storyFlow: string[];
      epicFlow: string[];
    } => ({
      tasks: { implement: { agent: 'dev', session: 'fresh', source_access: true } },
      flow: ['implement'],
      execution: { epic_strategy: 'sequential', max_parallel: 1, isolation: 'none', merge_strategy: 'merge-commit', story_strategy: 'sequential' },
      storyFlow: ['implement'],
      epicFlow: [],
    })),
    resolveAgentMock: vi.fn((_name?: unknown) => ({
      name: 'dev',
      role: { title: 'Developer', purpose: 'Implement code' },
      persona: { identity: 'A developer', communication_style: 'direct', principles: [] },
    })),
    compileSubagentMock: vi.fn((_resolved?: unknown) => ({
      name: 'dev',
      model: 'claude-sonnet-4-20250514',
      instructions: 'You are a developer',
      disallowedTools: [],
      bare: true,
    })),
    executeWorkflowMock: vi.fn(async (_config?: unknown) => ({
      success: true,
      tasksCompleted: 3,
      storiesProcessed: 1,
      errors: [],
      durationMs: 60000,
    })),
    readWorkflowStateMock: vi.fn((_dir?: unknown) => ({
      workflow_name: '',
      started: '',
      iteration: 0,
      phase: 'idle',
      tasks_completed: [],
      evaluator_scores: [],
      circuit_breaker: { triggered: false, reason: null, score_history: [] },
      trace_ids: [],
    })),
    writeWorkflowStateMock: vi.fn((_state?: unknown, _dir?: unknown) => {}),
    getSprintStateMock: vi.fn((): { success: boolean; data?: unknown; error?: string } => ({ success: false, error: 'no state' })),
    LanePoolClass,
    WorktreeManagerClass,
    realExistsSync: realFn as (path: string) => boolean,
  };
});

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: existsSyncMock };
});

vi.mock('../../lib/ink-renderer.js', () => ({
  startRenderer: vi.fn(() => ({
    update: vi.fn(),
    updateSprintState: vi.fn(),
    updateStories: vi.fn(),
    addMessage: vi.fn(),
    updateWorkflowState: vi.fn(),
    processLaneEvent: vi.fn(),
    updateMergeState: vi.fn(),
    cleanup: vi.fn(),
  })),
}));

vi.mock('../../modules/sprint/index.js', () => ({
  getSprintState: () => getSprintStateMock(),
  readSprintStatusFromState: () => readSprintStatusMock(),
  reconcileState: () => reconcileStateMock(),
  updateStoryStatus: vi.fn(() => ({ success: true, data: undefined })),
  shouldDeferPhase: vi.fn(() => false),
  getPhaseEstimate: vi.fn(() => 15),
  computeRemainingMinutes: vi.fn(() => 60),
}));

vi.mock('../../lib/docker/index.js', () => ({
  isDockerAvailable: () => isDockerAvailableMock(),
}));

vi.mock('../../modules/infra/index.js', () => ({
  cleanupContainers: () => cleanupContainersMock(),
}));

vi.mock('../../lib/workflow-parser.js', () => ({
  parseWorkflow: vi.fn(),
  resolveWorkflow: (...args: unknown[]) => resolveWorkflowMock(args[0]),
}));

vi.mock('../../lib/agent-resolver.js', () => ({
  resolveAgent: (...args: unknown[]) => resolveAgentMock(args[0]),
  compileSubagentDefinition: (...args: unknown[]) => compileSubagentMock(args[0]),
}));

vi.mock('../../lib/workflow-machine.js', () => ({
  runWorkflowActor: (...args: unknown[]) => executeWorkflowMock(args[0]),
}));

vi.mock('../../lib/workflow-state.js', () => ({
  readWorkflowState: (...args: unknown[]) => readWorkflowStateMock(args[0]),
  writeWorkflowState: (...args: unknown[]) => writeWorkflowStateMock(args[0], args[1]),
}));

vi.mock('../../lib/worktree-manager.js', () => ({
  WorktreeManager: WorktreeManagerClass,
}));

vi.mock('../../lib/lane-pool.js', () => ({
  LanePool: LanePoolClass,
}));


// --- Helper: minimal SprintState factory ---
function makeSprintState(overrides?: Partial<SprintState>): SprintState {
  return {
    version: 2,
    sprint: { total: 0, done: 0, failed: 0, blocked: 0, inProgress: null },
    stories: {},
    retries: {},
    flagged: [],
    epics: {},
    session: { active: false, startedAt: null, iteration: 0, elapsedSeconds: 0 },
    observability: { statementCoverage: null, branchCoverage: null, functionCoverage: null, lineCoverage: null },
    run: { active: false, startedAt: null, iteration: 0, cost: 0, completed: [], failed: [], currentStory: null, currentPhase: null, lastAction: null, acProgress: null },
    actionItems: [],
    ...overrides,
  };
}

const defaultStory = { status: 'backlog' as const, attempts: 0, lastAttempt: null, lastError: null, proofPath: null, acResults: null };


describe('run command — parallel execution (Story 17.3)', () => {
  beforeEach(() => {
    existsSyncMock.mockReset();
    existsSyncMock.mockImplementation((p: unknown) => realExistsSync(String(p)));
    readSprintStatusMock.mockReset();
    readSprintStatusMock.mockReturnValue({});
    reconcileStateMock.mockReset();
    reconcileStateMock.mockReturnValue({ success: true, data: { corrections: [], stateChanged: false } });
    isDockerAvailableMock.mockReset();
    isDockerAvailableMock.mockReturnValue(true);
    cleanupContainersMock.mockReset();
    cleanupContainersMock.mockReturnValue({ success: true, data: { containersRemoved: 0, names: [] } });
    resolveWorkflowMock.mockReset();
    resolveAgentMock.mockReset();
    resolveAgentMock.mockReturnValue({
      name: 'dev', role: { title: 'Developer', purpose: 'Implement code' },
      persona: { identity: 'A developer', communication_style: 'direct', principles: [] },
    });
    compileSubagentMock.mockReset();
    compileSubagentMock.mockReturnValue({
      name: 'dev', model: 'claude-sonnet-4-20250514', instructions: 'You are a developer', disallowedTools: [], bare: true,
    });
    executeWorkflowMock.mockReset();
    executeWorkflowMock.mockResolvedValue({ success: true, tasksCompleted: 3, storiesProcessed: 1, errors: [], durationMs: 60000 });
    readWorkflowStateMock.mockReset();
    readWorkflowStateMock.mockReturnValue({
      workflow_name: '', started: '', iteration: 0, phase: 'idle',
      tasks_completed: [], evaluator_scores: [],
      circuit_breaker: { triggered: false, reason: null, score_history: [] },
      trace_ids: [],
    });
    writeWorkflowStateMock.mockReset();
    getSprintStateMock.mockReset();
    // Reset tracking variables
    _lanePoolConstructed = false;
    _lanePoolConstructorArgs = [];
    _worktreeManagerConstructed = false;
    // Reset pool/worktree factories to defaults
    _poolFactory = () => ({
      onEvent: vi.fn(),
      startPool: vi.fn().mockResolvedValue({
        success: true, epicsProcessed: 0, epicResults: new Map(), durationMs: 0,
      }),
    });
    _wtFactory = () => ({
      createWorktree: vi.fn(() => '/tmp/codeharness-wt-epic-1'),
      cleanupWorktree: vi.fn(),
      listWorktrees: vi.fn(() => []),
      detectOrphans: vi.fn(() => []),
    });
    process.exitCode = undefined;
  });

  afterEach(() => {
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

  function mockParallelWorkflow(maxParallel = 2) {
    resolveWorkflowMock.mockReturnValue({
      tasks: { implement: { agent: 'dev', session: 'fresh', source_access: true } },
      flow: ['implement'],
      execution: { epic_strategy: 'parallel', max_parallel: maxParallel, isolation: 'none', merge_strategy: 'merge-commit', story_strategy: 'sequential' },
      storyFlow: ['implement'],
      epicFlow: [],
    });
  }

  function mockSequentialWorkflow() {
    resolveWorkflowMock.mockReturnValue({
      tasks: { implement: { agent: 'dev', session: 'fresh', source_access: true } },
      flow: ['implement'],
      execution: { epic_strategy: 'sequential', max_parallel: 1, isolation: 'none', merge_strategy: 'merge-commit', story_strategy: 'sequential' },
      storyFlow: ['implement'],
      epicFlow: [],
    });
  }

  function mockPoolAndWorktree(poolOverrides?: Record<string, unknown>, wtOverrides?: Record<string, unknown>) {
    const poolInstance: Record<string, unknown> = {
      onEvent: vi.fn(),
      startPool: vi.fn().mockResolvedValue({
        success: true, epicsProcessed: 1,
        epicResults: new Map([['1', { epicId: '1', status: 'completed', engineResult: { success: true, tasksCompleted: 1, storiesProcessed: 1, errors: [], durationMs: 1000 }, durationMs: 1000 }]]),
        durationMs: 1000,
      }),
      ...poolOverrides,
    };
    const wtInstance: Record<string, unknown> = {
      createWorktree: vi.fn(() => '/tmp/codeharness-wt-epic-1'),
      cleanupWorktree: vi.fn(),
      listWorktrees: vi.fn(() => []),
      detectOrphans: vi.fn(() => []),
      ...wtOverrides,
    };
    _poolFactory = () => poolInstance;
    _wtFactory = () => wtInstance;
    return { poolInstance, wtInstance };
  }

  async function runCommand(args: string[] = []) {
    const { registerRunCommand } = await import('../run.js');
    const program = new Command();
    program.exitOverride();
    program.option('--json', 'JSON output');
    registerRunCommand(program);
    await program.parseAsync(['node', 'codeharness', 'run', ...args]);
  }


  // --- extractEpicId unit tests ---

  describe('extractEpicId', () => {
    it('extracts numeric epic prefix from story key', () => {
      expect(extractEpicId('17-1-foo')).toBe('17');
      expect(extractEpicId('3-2-bar-baz')).toBe('3');
      expect(extractEpicId('100-5-long-slug')).toBe('100');
    });

    it('returns full key if no numeric prefix', () => {
      expect(extractEpicId('nonnumeric')).toBe('nonnumeric');
    });
  });


  // --- buildEpicDescriptors unit tests ---

  describe('buildEpicDescriptors', () => {
    it('groups stories by epic ID (AC #3)', () => {
      const state = makeSprintState({
        stories: {
          '17-1-worktree': { ...defaultStory },
          '17-2-lane-pool': { ...defaultStory },
          '18-1-merge': { ...defaultStory },
        },
        epics: {},
      });
      const descriptors = buildEpicDescriptors(state);
      expect(descriptors).toHaveLength(2);
      const epic17 = descriptors.find(d => d.id === '17');
      expect(epic17).toBeDefined();
      expect(epic17!.stories).toEqual(['17-1-worktree', '17-2-lane-pool']);
      expect(epic17!.slug).toBe('epic-17');
    });

    it('filters out epics with done status (AC #3)', () => {
      const state = makeSprintState({
        stories: {
          '17-1-foo': { ...defaultStory },
          '18-1-bar': { ...defaultStory },
        },
        epics: {
          'epic-17': { status: 'done', storiesTotal: 1, storiesDone: 1 },
          'epic-18': { status: 'in-progress', storiesTotal: 1, storiesDone: 0 },
        },
      });
      const descriptors = buildEpicDescriptors(state);
      expect(descriptors).toHaveLength(1);
      expect(descriptors[0].id).toBe('18');
    });

    it('returns empty array when all epics are done', () => {
      const state = makeSprintState({
        stories: { '17-1-foo': { ...defaultStory } },
        epics: { 'epic-17': { status: 'done', storiesTotal: 1, storiesDone: 1 } },
      });
      expect(buildEpicDescriptors(state)).toEqual([]);
    });

    it('includes epics not present in epics map (assumes not done)', () => {
      const state = makeSprintState({
        stories: { '99-1-new': { ...defaultStory } },
        epics: {},
      });
      const descriptors = buildEpicDescriptors(state);
      expect(descriptors).toHaveLength(1);
      expect(descriptors[0].id).toBe('99');
    });
  });


  // --- Parallel execution path tests ---

  describe('parallel mode detection (AC #1, #8)', () => {
    it('detects parallel mode when epic_strategy is parallel', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      mockParallelWorkflow(2);
      getSprintStateMock.mockReturnValue({
        success: true,
        data: makeSprintState({
          stories: { '1-1-story': { ...defaultStory } },
        }),
      });

      const { poolInstance } = mockPoolAndWorktree();
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(_lanePoolConstructed).toBe(true);
      expect(_worktreeManagerConstructed).toBe(true);
      expect(poolInstance.startPool).toHaveBeenCalled();
      // executeWorkflow should NOT be called directly in parallel mode
      expect(executeWorkflowMock).not.toHaveBeenCalled();
    });

    it('uses sequential path when epic_strategy is sequential (AC #8)', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      mockSequentialWorkflow();
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(_lanePoolConstructed).toBe(false);
      expect(_worktreeManagerConstructed).toBe(false);
      expect(executeWorkflowMock).toHaveBeenCalled();
    });

    it('uses sequential path when no execution config present (AC #8)', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      resolveWorkflowMock.mockReturnValue({
        tasks: { implement: { agent: 'dev', session: 'fresh', source_access: true } },
        flow: ['implement'],
        storyFlow: ['implement'],
        epicFlow: [],
        execution: undefined,
        // No execution config — should use sequential path
      });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(_lanePoolConstructed).toBe(false);
      expect(executeWorkflowMock).toHaveBeenCalled();
    });
  });

  describe('LanePool created with correct config (AC #2)', () => {
    it('creates LanePool with maxParallel from execution config', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      mockParallelWorkflow(3);
      getSprintStateMock.mockReturnValue({
        success: true,
        data: makeSprintState({ stories: { '1-1-story': { ...defaultStory } } }),
      });

      mockPoolAndWorktree();
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(_lanePoolConstructorArgs[1]).toBe(3);
    });
  });

  describe('executeFn sets projectDir to worktree path (AC #4, #5)', () => {
    it('passes worktree path as projectDir in EngineConfig', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      mockParallelWorkflow(2);
      getSprintStateMock.mockReturnValue({
        success: true,
        data: makeSprintState({ stories: { '1-1-story': { ...defaultStory } } }),
      });

      let capturedExecuteFn: ((epicId: string, worktreePath: string) => Promise<unknown>) | undefined;
      mockPoolAndWorktree({
        startPool: vi.fn().mockImplementation((epics: unknown[], executeFn: (epicId: string, path: string) => Promise<unknown>) => {
          capturedExecuteFn = executeFn;
          return Promise.resolve({
            success: true, epicsProcessed: 1,
            epicResults: new Map([['1', { epicId: '1', status: 'completed', engineResult: { success: true, tasksCompleted: 1, storiesProcessed: 1, errors: [], durationMs: 1000 }, durationMs: 1000 }]]),
            durationMs: 1000,
          });
        }),
      });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(capturedExecuteFn).toBeDefined();
      // Call executeFn to verify it sets projectDir
      await capturedExecuteFn!('1', '/tmp/codeharness-wt-epic-1');
      expect(executeWorkflowMock).toHaveBeenCalledWith(
        expect.objectContaining({ projectDir: '/tmp/codeharness-wt-epic-1' }),
      );
    });
  });

  describe('pool result maps to correct exit code (AC #7)', () => {
    it('exits 0 when pool succeeds', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      mockParallelWorkflow(2);
      getSprintStateMock.mockReturnValue({
        success: true,
        data: makeSprintState({ stories: { '1-1-story': { ...defaultStory } } }),
      });

      mockPoolAndWorktree({
        startPool: vi.fn().mockResolvedValue({
          success: true, epicsProcessed: 2,
          epicResults: new Map([
            ['1', { epicId: '1', status: 'completed', engineResult: { success: true, tasksCompleted: 2, storiesProcessed: 1, errors: [], durationMs: 1000 }, durationMs: 1000 }],
            ['2', { epicId: '2', status: 'completed', engineResult: { success: true, tasksCompleted: 1, storiesProcessed: 1, errors: [], durationMs: 2000 }, durationMs: 2000 }],
          ]),
          durationMs: 3000,
        }),
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Parallel execution completed'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('2 epics'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('2 stories processed'));
      expect(process.exitCode).toBeUndefined();
    });

    it('exits 1 when pool fails (AC #7)', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      mockParallelWorkflow(2);
      getSprintStateMock.mockReturnValue({
        success: true,
        data: makeSprintState({ stories: { '1-1-story': { ...defaultStory } } }),
      });

      mockPoolAndWorktree({
        startPool: vi.fn().mockResolvedValue({
          success: false, epicsProcessed: 2,
          epicResults: new Map([
            ['1', { epicId: '1', status: 'completed', engineResult: { success: true, tasksCompleted: 2, storiesProcessed: 1, errors: [], durationMs: 1000 }, durationMs: 1000 }],
            ['2', { epicId: '2', status: 'failed', error: 'Engine crashed', durationMs: 500 }],
          ]),
          durationMs: 2000,
        }),
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Parallel execution failed'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('1 failed'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Epic 2: Engine crashed'));
      expect(process.exitCode).toBe(1);
    });
  });

  describe('lane events are logged (AC #10)', () => {
    it('registers onEvent callback for lane event logging', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      mockParallelWorkflow(2);
      getSprintStateMock.mockReturnValue({
        success: true,
        data: makeSprintState({ stories: { '1-1-story': { ...defaultStory } } }),
      });

      const { poolInstance } = mockPoolAndWorktree();
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(poolInstance.onEvent).toHaveBeenCalledWith(expect.any(Function));

      // Simulate lane events and verify console output
      const consoleSpy = vi.spyOn(console, 'log');
      const onEventMock = poolInstance.onEvent as ReturnType<typeof vi.fn>;
      const eventCallback = onEventMock.mock.calls[0][0];

      eventCallback({ type: 'lane-started', epicId: '17', laneIndex: 0, timestamp: new Date().toISOString() });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[LANE] Started epic 17 in lane 0'));

      eventCallback({ type: 'lane-completed', epicId: '17', laneIndex: 0, timestamp: new Date().toISOString() });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[LANE] Epic 17 completed in lane 0'));

      eventCallback({ type: 'lane-failed', epicId: '18', laneIndex: 1, timestamp: new Date().toISOString(), error: 'boom' });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[LANE] Epic 18 failed in lane 1: boom'));

      eventCallback({ type: 'epic-queued', epicId: '19', laneIndex: -1, timestamp: new Date().toISOString() });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[LANE] Epic 19 queued for execution'));
    });
  });

  describe('max_parallel=1 with parallel strategy (AC #9)', () => {
    it('creates lane pool with maxParallel=1 for sequential-through-pool execution', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      mockParallelWorkflow(1);
      getSprintStateMock.mockReturnValue({
        success: true,
        data: makeSprintState({ stories: { '1-1-story': { ...defaultStory } } }),
      });

      const { poolInstance } = mockPoolAndWorktree();
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(_lanePoolConstructorArgs[1]).toBe(1);
      expect(poolInstance.startPool).toHaveBeenCalled();
    });
  });

  describe('parallel strategy forces worktree isolation (AC #12)', () => {
    it('creates WorktreeManager even when isolation is none', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      // isolation: 'none' but epic_strategy: 'parallel'
      resolveWorkflowMock.mockReturnValue({
        tasks: { implement: { agent: 'dev', session: 'fresh', source_access: true } },
        flow: ['implement'],
        execution: { epic_strategy: 'parallel', max_parallel: 2, isolation: 'none', merge_strategy: 'merge-commit', story_strategy: 'sequential' },
        storyFlow: ['implement'],
        epicFlow: [],
      });
      getSprintStateMock.mockReturnValue({
        success: true,
        data: makeSprintState({ stories: { '1-1-story': { ...defaultStory } } }),
      });

      mockPoolAndWorktree();
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      // WorktreeManager created regardless of isolation setting
      expect(_worktreeManagerConstructed).toBe(true);
      expect(_lanePoolConstructed).toBe(true);
    });
  });

  describe('crash in one lane does not abort run (AC #6)', () => {
    it('handles pool that reports partial failure without crashing', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      mockParallelWorkflow(2);
      getSprintStateMock.mockReturnValue({
        success: true,
        data: makeSprintState({
          stories: {
            '1-1-story': { ...defaultStory },
            '2-1-other': { ...defaultStory },
          },
        }),
      });

      mockPoolAndWorktree({
        startPool: vi.fn().mockResolvedValue({
          success: false, epicsProcessed: 2,
          epicResults: new Map([
            ['1', { epicId: '1', status: 'failed', error: 'Lane crashed', durationMs: 500 }],
            ['2', { epicId: '2', status: 'completed', engineResult: { success: true, tasksCompleted: 1, storiesProcessed: 1, errors: [], durationMs: 2000 }, durationMs: 2000 }],
          ]),
          durationMs: 2500,
        }),
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      // Both epics were processed — crash in one did not prevent the other
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('2 epics'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('1 succeeded'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('1 failed'));
      expect(process.exitCode).toBe(1);
    });
  });

  describe('remaining worktrees warned after pool completion (AC #11)', () => {
    it('warns when worktrees still exist after pool finishes', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      mockParallelWorkflow(2);
      getSprintStateMock.mockReturnValue({
        success: true,
        data: makeSprintState({ stories: { '1-1-story': { ...defaultStory } } }),
      });

      mockPoolAndWorktree({}, {
        listWorktrees: vi.fn(() => [
          { epicId: '1', path: '/tmp/codeharness-wt-epic-1', branch: 'codeharness/epic-1-foo', createdAt: new Date() },
        ]),
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('1 worktree(s) still exist after pool completion'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('/tmp/codeharness-wt-epic-1'));
    });
  });

  describe('sprint state failure in parallel mode', () => {
    it('exits 1 when getSprintState fails in parallel mode', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      mockParallelWorkflow(2);
      getSprintStateMock.mockReturnValue({ success: false, error: 'state file corrupt' });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to read sprint state for epic discovery'));
      expect(process.exitCode).toBe(1);
    });
  });

  describe('no pending epics in parallel mode', () => {
    it('reports nothing to execute when all epics are done', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      mockParallelWorkflow(2);
      getSprintStateMock.mockReturnValue({
        success: true,
        data: makeSprintState({
          stories: { '1-1-story': { ...defaultStory } },
          epics: { 'epic-1': { status: 'done', storiesTotal: 1, storiesDone: 1 } },
        }),
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No pending epics'));
      expect(process.exitCode).toBeUndefined();
    });
  });

  describe('parallel execution error handling', () => {
    it('catches and reports unexpected errors in parallel path', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      mockParallelWorkflow(2);
      getSprintStateMock.mockReturnValue({
        success: true,
        data: makeSprintState({ stories: { '1-1-story': { ...defaultStory } } }),
      });

      // LanePool constructor throws
      _poolFactory = () => { throw new Error('pool creation failed'); };
      _wtFactory = () => ({ createWorktree: vi.fn(), cleanupWorktree: vi.fn(), listWorktrees: vi.fn(() => []), detectOrphans: vi.fn(() => []) });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Parallel execution error'));
      expect(process.exitCode).toBe(1);
    });
  });
});
