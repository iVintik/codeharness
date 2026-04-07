/**
 * Tests for workflow-visualizer module (story 27-1).
 *
 * Covers: basic rendering, gate rendering, sliding window, scope prefix,
 * stories-done prefix, task-name truncation, width enforcement, failed steps,
 * edge cases, and purity (no I/O).
 */

import { describe, it, expect, vi } from 'vitest';
import { visualize, stripAnsi, snapshotToPosition } from '../workflow-visualizer.js';
import type { WorkflowPosition, StepStatus } from '../workflow-visualizer.js';

// Mock node:fs at module level (ESM prevents vi.spyOn on namespace exports).
// All tests in this file are pure-function tests that never need real fs.
vi.mock('node:fs', () => ({
  default: {},
  readFileSync: vi.fn(() => Buffer.from('')),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));
import * as nodeFs from 'node:fs';
import type { ResolvedWorkflow } from '../workflow-types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSteps(names: string[], activeIdx: number, failedIdx?: number): StepStatus[] {
  return names.map((name, i) => ({
    name,
    status:
      i === activeIdx ? 'active'
      : i === failedIdx ? 'failed'
      : i < activeIdx ? 'done'
      : 'pending',
  }));
}

function stripped(s: string): string { return stripAnsi(s); }

// ─── AC2: Basic story rendering with epic prefix ──────────────────────────────

describe('basic story rendering', () => {
  it('starts with Epic prefix and contains active step name', () => {
    const steps = makeSteps(['plan', 'implement', 'review', 'deploy'], 1);
    const pos: WorkflowPosition = {
      level: 'story',
      epicId: '17',
      storyIndex: 3,
      totalStories: 6,
      steps,
      activeStepIndex: 1,
    };
    const result = visualize(pos, { maxWidth: 80 });
    expect(stripped(result)).toMatch(/^Epic 17 \[3\/6\]/);
    expect(stripped(result)).toContain('impl');
  });

  it('active step text does not exceed maxWidth=80', () => {
    const steps = makeSteps(['plan', 'implement', 'review', 'deploy'], 1);
    const pos: WorkflowPosition = {
      level: 'story',
      epicId: '17',
      storyIndex: 3,
      totalStories: 6,
      steps,
      activeStepIndex: 1,
    };
    const result = visualize(pos, { maxWidth: 80 });
    expect(stripped(result).length).toBeLessThanOrEqual(80);
  });
});

// ─── AC3: Gate rendering ──────────────────────────────────────────────────────

describe('gate rendering', () => {
  it('renders active gate with iteration and verdict counts', () => {
    const steps: StepStatus[] = [
      { name: 'plan', status: 'done' },
      { name: 'quality', status: 'active', isGate: true },
      { name: 'deploy', status: 'pending' },
    ];
    const pos: WorkflowPosition = {
      level: 'gate',
      steps,
      activeStepIndex: 1,
      gate: { name: 'quality', iteration: 2, maxRetries: 5, passed: 1, failed: 1 },
    };
    const result = visualize(pos);
    expect(stripped(result)).toContain('⟲quality(2/5 1✓1✗)');
  });

  it('renders pending gate without detail', () => {
    const steps: StepStatus[] = [
      { name: 'quality', status: 'pending', isGate: true },
    ];
    const pos: WorkflowPosition = {
      level: 'gate',
      steps,
      activeStepIndex: 0,
      gate: { name: 'quality', iteration: 0, maxRetries: 3, passed: 0, failed: 0 },
    };
    const result = visualize(pos);
    expect(stripped(result)).toContain('⟲quality');
    expect(stripped(result)).not.toContain('(');
  });

  it('renders completed gate with checkmark', () => {
    const steps: StepStatus[] = [
      { name: 'quality', status: 'done', isGate: true },
    ];
    const pos: WorkflowPosition = {
      level: 'gate',
      steps,
      activeStepIndex: 0,
      gate: { name: 'quality', iteration: 2, maxRetries: 3, passed: 2, failed: 0 },
    };
    const result = visualize(pos);
    expect(stripped(result)).toContain('⟲quality✓');
  });

  it('renders gate at iteration 0 without crashing', () => {
    const steps: StepStatus[] = [
      { name: 'gate0', status: 'active', isGate: true },
    ];
    const pos: WorkflowPosition = {
      level: 'gate',
      steps,
      activeStepIndex: 0,
      gate: { name: 'gate0', iteration: 0, maxRetries: 5, passed: 0, failed: 0 },
    };
    expect(() => visualize(pos)).not.toThrow();
    const result = visualize(pos);
    expect(stripped(result)).toContain('⟲gate0');
  });
});

// ─── AC4: Sliding window ─────────────────────────────────────────────────────

describe('sliding window', () => {
  it('shows [N✓] prefix and …N more suffix when steps exceed maxStepSlots', () => {
    // 10 steps, active at index 3, maxStepSlots=5
    // active-first anchoring: start=3, end=8, collapsedBefore=3, collapsedAfter=2
    const steps = makeSteps(
      ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9'],
      3,
    );
    const pos: WorkflowPosition = { level: 'story', steps, activeStepIndex: 3 };
    const result = visualize(pos, { maxStepSlots: 5, maxWidth: 120 });
    const plain = stripped(result);
    // Should have some collapsed prefix
    expect(plain).toMatch(/\[\d+✓\]/);
    // Should have trailing suffix (2 steps after the 5-slot window)
    expect(plain).toMatch(/…\d+ more/);
  });

  it('centers window on active step and backfills to always show exactly maxStepSlots (AC4)', () => {
    // AC4: 12 steps total, active at index 5, maxStepSlots=5.
    // Centered+backfill: half=2, idealStart=5-2=3, start=max(0,min(3,7))=3, end=8.
    // Visible: [3,4,5,6,7] = 5 slots. collapsedBefore=3, collapsedAfter=4.
    // Produces [3✓] prefix and → …4 more suffix, with exactly 5 visible step slots.
    const steps = makeSteps(
      ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11'],
      5,
    );
    const pos: WorkflowPosition = { level: 'story', steps, activeStepIndex: 5 };
    const result = visualize(pos, { maxStepSlots: 5, maxWidth: 120 });
    const plain = stripped(result);
    // 3 done steps before the centered window must be collapsed into [3✓]
    expect(plain).toMatch(/^\[3✓\]/);
    // 4 steps beyond the 5-slot window appear as → …4 more
    expect(plain).toMatch(/→ …4 more$/);
    // Exactly 5 visible step slots in the window
    const core = plain.replace(/^\[\d+✓\] → /, '').replace(/ → …\d+ more$/, '');
    const tokens = core.split(' → ').filter(Boolean);
    expect(tokens.length).toBe(5);
  });

  it('shows at most maxStepSlots visible step tokens', () => {
    const steps = makeSteps(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 3);
    const pos: WorkflowPosition = { level: 'story', steps, activeStepIndex: 3 };
    const result = visualize(pos, { maxStepSlots: 3, maxWidth: 120 });
    const plain = stripped(result);
    // Strip [N✓] prefix and …N more suffix, count remaining → tokens
    const core = plain.replace(/^\[\d+✓\] → /, '').replace(/ → …\d+ more$/, '');
    const tokens = core.split(' → ').filter(Boolean);
    expect(tokens.length).toBeLessThanOrEqual(3);
  });

  it('does not add prefix/suffix when steps fit within maxStepSlots', () => {
    const steps = makeSteps(['a', 'b', 'c'], 1);
    const pos: WorkflowPosition = { level: 'story', steps, activeStepIndex: 1 };
    const result = visualize(pos, { maxStepSlots: 5, maxWidth: 120 });
    const plain = stripped(result);
    expect(plain).not.toMatch(/\[\d+✓\]/);
    expect(plain).not.toMatch(/…\d+ more/);
  });
});

// ─── AC5: Stories-done prefix ────────────────────────────────────────────────

describe('stories-done rendering', () => {
  it('shows "stories✓" before epic-level steps when storiesDone=true', () => {
    const steps: StepStatus[] = [
      { name: 'deploy', status: 'active' },
    ];
    const pos: WorkflowPosition = {
      level: 'epic',
      epicId: '5',
      steps,
      activeStepIndex: 0,
      storiesDone: true,
    };
    const result = visualize(pos);
    const plain = stripped(result);
    expect(plain).toContain('stories✓');
    const storiesIdx = plain.indexOf('stories✓');
    const deployIdx = plain.indexOf('deploy');
    expect(storiesIdx).toBeLessThan(deployIdx);
  });
});

// ─── AC6: No scope prefix for flat flows ─────────────────────────────────────

describe('scope prefix', () => {
  it('has no Epic prefix when epicId is absent (flat flow)', () => {
    const steps = makeSteps(['build', 'test'], 0);
    const pos: WorkflowPosition = { level: 'story', steps, activeStepIndex: 0 };
    const result = visualize(pos);
    expect(stripped(result)).not.toMatch(/^Epic/);
  });

  it('has Epic prefix when epicId is present', () => {
    const steps = makeSteps(['build'], 0);
    const pos: WorkflowPosition = {
      level: 'story',
      epicId: '3',
      storyIndex: 1,
      totalStories: 4,
      steps,
      activeStepIndex: 0,
    };
    const result = visualize(pos);
    expect(stripped(result)).toMatch(/^Epic 3/);
  });
});

// ─── AC7: Task name truncation ───────────────────────────────────────────────

describe('task name truncation', () => {
  it('truncates names longer than taskNameMaxLen', () => {
    const steps: StepStatus[] = [{ name: 'create-story', status: 'active' }];
    const pos: WorkflowPosition = { level: 'story', steps, activeStepIndex: 0 };
    const result = visualize(pos, { taskNameMaxLen: 8 });
    const plain = stripped(result);
    // The active step is rendered as "name…", strip trailing markers to measure name
    // name portion should be ≤ 8 chars
    // We look for the truncated name before the status marker
    const match = /([^\s→[\]]+)[…✓✗⊘]/.exec(plain);
    expect(match).toBeTruthy();
    const truncated = match![1];
    expect(truncated.length).toBeLessThanOrEqual(8);
  });

  it('does not truncate short names', () => {
    const steps: StepStatus[] = [{ name: 'build', status: 'active' }];
    const pos: WorkflowPosition = { level: 'story', steps, activeStepIndex: 0 };
    const result = visualize(pos, { taskNameMaxLen: 8 });
    const plain = stripped(result);
    expect(plain).toContain('build');
  });
});

// ─── AC8: Width enforcement ───────────────────────────────────────────────────

describe('width enforcement', () => {
  const edgeCases: Array<{ label: string; pos: WorkflowPosition }> = [
    {
      label: 'first step active',
      pos: { level: 'story', steps: makeSteps(['only'], 0), activeStepIndex: 0 },
    },
    {
      label: 'last step active',
      pos: {
        level: 'story',
        steps: makeSteps(['a', 'b', 'c'], 2),
        activeStepIndex: 2,
      },
    },
    {
      label: 'single step',
      pos: { level: 'story', steps: [{ name: 'x', status: 'active' }], activeStepIndex: 0 },
    },
    {
      label: 'many steps with epic prefix',
      pos: {
        level: 'story',
        epicId: 'LONG-EPIC-ID-42',
        storyIndex: 5,
        totalStories: 20,
        steps: makeSteps(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta'], 4),
        activeStepIndex: 4,
      },
    },
    {
      label: 'all checks passed gate',
      pos: {
        level: 'gate',
        steps: [{ name: 'qualitygate', status: 'active', isGate: true }],
        activeStepIndex: 0,
        gate: { name: 'qualitygate', iteration: 3, maxRetries: 3, passed: 3, failed: 0 },
      },
    },
  ];

  for (const { label, pos } of edgeCases) {
    it(`stripped length ≤ 120 for: ${label}`, () => {
      const result = visualize(pos, { maxWidth: 120 });
      expect(stripped(result).length).toBeLessThanOrEqual(120);
    });

    it(`stripped length ≤ 80 (default) for: ${label}`, () => {
      const result = visualize(pos);
      expect(stripped(result).length).toBeLessThanOrEqual(80);
    });
  }

  it('caps maxWidth at 120 even if caller passes higher value', () => {
    const steps = makeSteps(['a'], 0);
    const pos: WorkflowPosition = { level: 'story', steps, activeStepIndex: 0 };
    // Should not throw, output still ≤ 120
    const result = visualize(pos, { maxWidth: 200 });
    expect(stripped(result).length).toBeLessThanOrEqual(120);
  });
});

// ─── AC9: Failed step rendering ──────────────────────────────────────────────

describe('failed step rendering', () => {
  it('marks failed step with ✗', () => {
    const steps: StepStatus[] = [
      { name: 'plan', status: 'done' },
      { name: 'build', status: 'failed' },
      { name: 'test', status: 'pending' },
    ];
    const pos: WorkflowPosition = { level: 'story', steps, activeStepIndex: 1 };
    const result = visualize(pos);
    expect(stripped(result)).toContain('✗');
  });

  it('failed step is distinct from done and pending steps in plain text', () => {
    // Use names ≤ 8 chars so they aren't truncated at default taskNameMaxLen=8
    const steps: StepStatus[] = [
      { name: 'done-ok', status: 'done' },
      { name: 'fail-ok', status: 'failed' },
      { name: 'pend-ok', status: 'pending' },
    ];
    const pos: WorkflowPosition = { level: 'story', steps, activeStepIndex: 1 };
    const result = visualize(pos);
    const plain = stripped(result);
    expect(plain).toContain('done-ok✓');
    expect(plain).toContain('fail-ok✗');
    expect(plain).toContain('pend-ok');
    expect(plain).not.toContain('pend-ok✓');
    expect(plain).not.toContain('pend-ok✗');
  });
});

// ─── AC10: Edge cases ────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles empty steps array gracefully', () => {
    const pos: WorkflowPosition = { level: 'story', steps: [], activeStepIndex: 0 };
    expect(() => visualize(pos)).not.toThrow();
    expect(typeof visualize(pos)).toBe('string');
  });

  it('handles skipped step status', () => {
    const steps: StepStatus[] = [{ name: 'skip', status: 'skipped' }];
    const pos: WorkflowPosition = { level: 'story', steps, activeStepIndex: 0 };
    const result = visualize(pos);
    expect(stripped(result)).toContain('⊘');
  });

  it('returns a string (pure — no throws)', () => {
    const steps = makeSteps(['x', 'y', 'z'], 1);
    const pos: WorkflowPosition = { level: 'story', steps, activeStepIndex: 1 };
    expect(typeof visualize(pos)).toBe('string');
    expect(typeof visualize(pos, {})).toBe('string');
    expect(typeof visualize(pos, { maxWidth: 40, maxStepSlots: 2, taskNameMaxLen: 3 })).toBe('string');
  });
});

// ─── AC12: Purity — no I/O ───────────────────────────────────────────────────

describe('purity (no I/O)', () => {
  it('does not call fs.readFileSync, fs.writeFileSync, or fs.existsSync during visualize()', () => {
    // Reset mock call counts before this test
    vi.mocked(nodeFs.readFileSync).mockClear();
    vi.mocked(nodeFs.writeFileSync).mockClear();
    vi.mocked(nodeFs.existsSync).mockClear();

    const steps = makeSteps(['a', 'b'], 0);
    const pos: WorkflowPosition = { level: 'story', steps, activeStepIndex: 0 };

    let result: string | undefined;
    expect(() => { result = visualize(pos); }).not.toThrow();
    expect(typeof result).toBe('string');

    // Verify no filesystem calls were made — visualize() is a pure function
    expect(nodeFs.readFileSync).not.toHaveBeenCalled();
    expect(nodeFs.writeFileSync).not.toHaveBeenCalled();
    expect(nodeFs.existsSync).not.toHaveBeenCalled();
  });

  it('returns same output for same input (deterministic)', () => {
    const steps = makeSteps(['plan', 'build', 'deploy'], 1);
    const pos: WorkflowPosition = {
      level: 'story',
      epicId: '7',
      storyIndex: 2,
      totalStories: 5,
      steps,
      activeStepIndex: 1,
    };
    const r1 = visualize(pos, { maxWidth: 80 });
    const r2 = visualize(pos, { maxWidth: 80 });
    expect(r1).toBe(r2);
  });
});

// ─── snapshotToPosition tests (story 27-2) ───────────────────────────────────

/** Minimal ResolvedWorkflow fixture for tests. */
function makeWorkflow(storyFlow: ResolvedWorkflow['storyFlow'] = ['create-story', 'implement', 'document']): ResolvedWorkflow {
  return {
    tasks: {},
    storyFlow,
    epicFlow: ['story_flow', 'retro'],
    sprintFlow: [],
    execution: { max_parallel: 1, isolation: 'none', merge_strategy: 'merge-commit', epic_strategy: 'sequential', story_strategy: 'sequential' },
    flow: [],
  };
}

/** Build a run-machine snapshot fixture. */
function makeRunSnapshot(overrides: Record<string, unknown> = {}): unknown {
  return {
    status: 'active',
    value: 'processingEpic',
    context: {
      currentEpicIndex: 1,
      epicEntries: [['ep1', []], ['ep2', []], ['ep3', []], ['ep4', []]],
      halted: false,
      ...overrides,
    },
  };
}

describe('snapshotToPosition — active processing', () => {
  it('AC2: extracts epic/story/step indices from epicEntries and tasks_completed', () => {
    // Real run-machine snapshot shape: epicEntries[currentEpicIndex] gives [epicId, epicItems].
    // Story/step position is derived from workflowState.tasks_completed.
    const stories = ['e2-s1', 'e2-s2', 'e2-s3', 'e2-s4', 'e2-s5', 'e2-s6'].map(k => ({ key: k }));
    const snapshot = {
      value: 'processingEpic',
      context: {
        currentEpicIndex: 1,  // 0-based → epicIndex=2
        epicEntries: [['e1', []], ['e2', stories], ['e3', []], ['e4', []]],
        workflowState: {
          tasks_completed: [
            // stories 0 and 1 fully done
            { task_name: 'create-story', story_key: 'e2-s1' },
            { task_name: 'implement',    story_key: 'e2-s1' },
            { task_name: 'document',     story_key: 'e2-s1' },
            { task_name: 'create-story', story_key: 'e2-s2' },
            { task_name: 'implement',    story_key: 'e2-s2' },
            { task_name: 'document',     story_key: 'e2-s2' },
            // story 2 (index 2): create-story done → active step is 'implement' (index 1)
            { task_name: 'create-story', story_key: 'e2-s3' },
          ],
        },
        halted: false,
      },
    };
    const workflow = makeWorkflow(['create-story', 'implement', 'document']);
    const pos = snapshotToPosition(snapshot, workflow);

    expect(pos.epicIndex).toBe(2);
    expect(pos.totalEpics).toBe(4);
    expect(pos.storyIndex).toBe(3);
    expect(pos.totalStories).toBe(6);
    expect(pos.activeStepIndex).toBe(1);

    const out = stripAnsi(visualize(pos, { maxWidth: 120 }));
    expect(out).toMatch(/Epic/);
    expect(out).toMatch(/\[3\/6\]/);
  });
});

describe('snapshotToPosition — gate parsing', () => {
  it('AC3: extracts gate info from epicEntries, tasks_completed, and workflowState scores', () => {
    // Gate position: create-story + implement done, quality gate active.
    // Iteration/scores from workflowState (run-level context field).
    const snapshot = {
      value: 'processingEpic',
      context: {
        currentEpicIndex: 0,
        epicEntries: [['e1', [{ key: 'e1-s1' }]]],
        workflowState: {
          iteration: 2,
          evaluator_scores: [{ iteration: 2, passed: 1, failed: 1, unknown: 0, total: 2, timestamp: '' }],
          tasks_completed: [
            { task_name: 'create-story', story_key: 'e1-s1' },
            { task_name: 'implement',    story_key: 'e1-s1' },
            // 'quality' gate not yet complete → active step index 2
          ],
        },
        halted: false,
      },
    };
    const workflow = makeWorkflow(['create-story', 'implement', { gate: 'quality', check: ['check'], fix: ['retry'], pass_when: 'consensus', max_retries: 5, circuit_breaker: 'stagnation' }]);
    const pos = snapshotToPosition(snapshot, workflow);

    expect(pos.gate).toBeDefined();
    expect(pos.gate?.name).toBe('quality');
    expect(pos.gate?.iteration).toBe(2);
    expect(pos.gate?.maxRetries).toBe(5);
    expect(pos.gate?.passed).toBe(1);
    expect(pos.gate?.failed).toBe(1);

    const out = stripAnsi(visualize(pos, { maxWidth: 120 }));
    expect(out).toContain('⟲quality(2/5 1✓1✗)');
  });
});

describe('snapshotToPosition — terminal states', () => {
  it('AC4: allDone marks all steps as done', () => {
    const snapshot = makeRunSnapshot({ value: 'allDone' } as Record<string, unknown>);
    // Need to reconstruct with correct value field at top level
    const snap = { value: 'allDone', context: { halted: false } };
    const pos = snapshotToPosition(snap, makeWorkflow(['plan', 'build', 'deploy']));
    expect(pos.steps.every(s => s.status === 'done')).toBe(true);
    const out = stripAnsi(visualize(pos, { maxWidth: 120 }));
    expect(out).not.toContain('…');  // no active marker
  });

  it('AC5: halted marks active step as failed (derived from tasks_completed)', () => {
    // Real shape: step 0 (plan) done, step 1 (build) was active when halted.
    const snap = {
      value: 'halted',
      context: {
        currentEpicIndex: 0,
        epicEntries: [['ep1', [{ key: 's1' }]]],
        workflowState: { tasks_completed: [{ task_name: 'plan', story_key: 's1' }] },
        halted: true,
      },
    };
    const pos = snapshotToPosition(snap, makeWorkflow(['plan', 'build', 'deploy']));
    expect(pos.steps[1]?.status).toBe('failed');
    expect(stripAnsi(visualize(pos, { maxWidth: 120 }))).toContain('✗');
  });

  it('AC6: interrupted does not throw and active step is not done', () => {
    // Real shape: step 0 done, step 1 was in-progress when interrupted.
    const snap = {
      value: 'interrupted',
      context: {
        currentEpicIndex: 0,
        epicEntries: [['ep1', [{ key: 's1' }]]],
        workflowState: { tasks_completed: [{ task_name: 'plan', story_key: 's1' }] },
        halted: false,
      },
    };
    let pos: ReturnType<typeof snapshotToPosition> | undefined;
    expect(() => { pos = snapshotToPosition(snap, makeWorkflow(['plan', 'build', 'deploy'])); }).not.toThrow();
    expect(pos!.steps[1]?.status).not.toBe('done');
  });
});

describe('snapshotToPosition — epic-level steps', () => {
  it('AC7: level is "epic" (not "story") when storiesDone=true', () => {
    // storiesDone is true when all stories in the epic have completed all storyFlow steps.
    const snapshot = {
      value: 'processingEpic',
      context: {
        currentEpicIndex: 0,
        epicEntries: [['e1', [{ key: 'e1-s1' }]]],
        workflowState: {
          tasks_completed: [
            { task_name: 'create-story', story_key: 'e1-s1' },
            { task_name: 'implement',    story_key: 'e1-s1' },
            { task_name: 'document',     story_key: 'e1-s1' },
          ],
        },
        halted: false,
      },
    };
    const pos = snapshotToPosition(snapshot, makeWorkflow());
    expect(pos.storiesDone).toBe(true);
    expect(pos.level).toBe('epic');
  });

  it('AC7: storiesDone=true when all storyFlow steps are complete', () => {
    const snapshot = {
      value: 'processingEpic',
      context: {
        currentEpicIndex: 0,
        epicEntries: [['e1', [{ key: 'e1-s1' }]]],
        workflowState: {
          tasks_completed: [
            { task_name: 'create-story', story_key: 'e1-s1' },
            { task_name: 'implement',    story_key: 'e1-s1' },
            { task_name: 'document',     story_key: 'e1-s1' },
          ],
        },
        halted: false,
      },
    };
    const pos = snapshotToPosition(snapshot, makeWorkflow());
    expect(pos.storiesDone).toBe(true);
    const out = stripAnsi(visualize(pos, { maxWidth: 120 }));
    expect(out).toContain('stories✓');
  });

  it('AC7: when storiesDone=true, uses epicFlow steps not storyFlow steps', () => {
    // This verifies the bug fix: storyFlow=['create-story','implement','document']
    // but when storiesDone=true the parser must switch to epicFlow=['story_flow','retro'].
    const snapshot = {
      value: 'processingEpic',
      context: {
        currentEpicIndex: 0,
        epicEntries: [['e1', [{ key: 'e1-s1' }]]],
        workflowState: {
          tasks_completed: [
            { task_name: 'create-story', story_key: 'e1-s1' },
            { task_name: 'implement',    story_key: 'e1-s1' },
            { task_name: 'document',     story_key: 'e1-s1' },
          ],
        },
        halted: false,
      },
    };
    const workflow = makeWorkflow(); // storyFlow=[create-story,implement,document], epicFlow=[story_flow,retro]
    const pos = snapshotToPosition(snapshot, workflow);
    expect(pos.storiesDone).toBe(true);
    // Steps must come from epicFlow, not storyFlow
    const stepNames = pos.steps.map(s => s.name);
    expect(stepNames).toContain('retro');
    expect(stepNames).not.toContain('implement');
    const out = stripAnsi(visualize(pos, { maxWidth: 120 }));
    expect(out).toContain('retro');
    expect(out).not.toContain('implement');
  });
});

describe('snapshotToPosition — epic-level step advancement', () => {
  it('AC7: advances past first epicFlow step when story_flow sentinel task is complete', () => {
    // Bug fix: after all stories done, epicFlow steps must advance based on
    // __epic_X__ sentinel tasks, not stay stuck at index 0.
    const snapshot = {
      value: 'processingEpic',
      context: {
        currentEpicIndex: 0,
        epicEntries: [['e1', [{ key: 'e1-s1' }]]],
        workflowState: {
          tasks_completed: [
            // All storyFlow tasks done for the single story
            { task_name: 'create-story', story_key: 'e1-s1' },
            { task_name: 'implement',    story_key: 'e1-s1' },
            { task_name: 'document',     story_key: 'e1-s1' },
            // epicFlow step 0 (story_flow) is also done via the sentinel key
            { task_name: 'story_flow',   story_key: '__epic_e1__' },
          ],
        },
        halted: false,
      },
    };
    const workflow = makeWorkflow(); // epicFlow=['story_flow','retro']
    const pos = snapshotToPosition(snapshot, workflow);
    expect(pos.storiesDone).toBe(true);
    // Active step should be 'retro' (index 1), not 'story_flow' (index 0)
    expect(pos.activeStepIndex).toBe(1);
    const stepNames = pos.steps.map(s => s.name);
    expect(stepNames).toContain('retro');
    const retroStep = pos.steps.find(s => s.name === 'retro');
    expect(retroStep?.status).toBe('active');
    const storyFlowStep = pos.steps.find(s => s.name === 'story_flow');
    expect(storyFlowStep?.status).toBe('done');
  });

  it('AC7: all epicFlow steps done shows all steps as done', () => {
    const snapshot = {
      value: 'processingEpic',
      context: {
        currentEpicIndex: 0,
        epicEntries: [['e1', [{ key: 'e1-s1' }]]],
        workflowState: {
          tasks_completed: [
            { task_name: 'create-story', story_key: 'e1-s1' },
            { task_name: 'implement',    story_key: 'e1-s1' },
            { task_name: 'document',     story_key: 'e1-s1' },
            { task_name: 'story_flow',   story_key: '__epic_e1__' },
            { task_name: 'retro',        story_key: '__epic_e1__' },
          ],
        },
        halted: false,
      },
    };
    const workflow = makeWorkflow(); // epicFlow=['story_flow','retro']
    const pos = snapshotToPosition(snapshot, workflow);
    expect(pos.storiesDone).toBe(true);
    expect(pos.steps.every(s => s.status === 'done')).toBe(true);
  });
});

describe('snapshotToPosition — flat workflow', () => {
  it('AC8: no epic fields when epicId/currentEpicIndex absent', () => {
    const snap = { value: 'processingEpic', context: { currentStepIndex: 0, halted: false } };
    const pos = snapshotToPosition(snap, makeWorkflow(['build', 'test']));
    expect(pos.epicId).toBeUndefined();
    expect(pos.storyIndex).toBeUndefined();
    expect(pos.totalStories).toBeUndefined();
    const out = stripAnsi(visualize(pos, { maxWidth: 120 }));
    expect(out).not.toMatch(/^Epic/);
  });
});

describe('snapshotToPosition — step enumeration', () => {
  it('AC9: steps array names match workflow storyFlow in order with isGate flags', () => {
    const flow: ResolvedWorkflow['storyFlow'] = [
      'create-story',
      'implement',
      { gate: 'quality', check: ['check'], fix: ['retry'], pass_when: 'consensus', max_retries: 3, circuit_breaker: 'stagnation' },
      'document',
    ];
    const snap = { value: 'processingEpic', context: { currentStepIndex: 0, halted: false } };
    const pos = snapshotToPosition(snap, makeWorkflow(flow));
    expect(pos.steps.map(s => s.name)).toEqual(['create-story', 'implement', 'quality', 'document']);
    expect(pos.steps[2]?.isGate).toBe(true);
    expect(pos.steps[0]?.isGate).toBeFalsy();
  });
});

describe('snapshotToPosition — defensive edge cases', () => {
  it('AC12: returns empty position on null snapshot without throwing', () => {
    expect(() => snapshotToPosition(null, makeWorkflow())).not.toThrow();
    const pos = snapshotToPosition(null, makeWorkflow());
    expect(pos.steps).toEqual([]);
    expect(pos.activeStepIndex).toBe(0);
  });

  it('AC12: returns empty position on undefined snapshot without throwing', () => {
    expect(() => snapshotToPosition(undefined, makeWorkflow())).not.toThrow();
    const pos = snapshotToPosition(undefined, makeWorkflow());
    expect(pos.steps).toEqual([]);
  });

  it('AC12: returns empty position on malformed snapshot without throwing', () => {
    expect(() => snapshotToPosition({ garbage: true, random: 42 }, makeWorkflow())).not.toThrow();
    const pos = snapshotToPosition({ garbage: true, random: 42 }, makeWorkflow());
    expect(pos.steps).toEqual([]);
    expect(pos.activeStepIndex).toBe(0);
  });

  it('AC12: no I/O — function is synchronous and pure', () => {
    const snap = { value: 'processingEpic', context: { currentStepIndex: 0, halted: false } };
    let pos: ReturnType<typeof snapshotToPosition> | undefined;
    expect(() => { pos = snapshotToPosition(snap, makeWorkflow()); }).not.toThrow();
    expect(typeof pos).toBe('object');
  });
});

describe('snapshotToPosition — pipeline integration', () => {
  it('AC2/AC10: snapshotToPosition → visualize produces valid string output', () => {
    // Real run-machine snapshot: epicEntries[0]=[epicId, stories], tasks_completed drives position.
    const snapshot = {
      value: 'processingEpic',
      context: {
        currentEpicIndex: 0,
        epicEntries: [['e1', [{ key: 'e1-s1' }, { key: 'e1-s2' }]], ['e2', []]],
        workflowState: {
          tasks_completed: [
            { task_name: 'plan', story_key: 'e1-s1' },  // step 0 done → active on step 1
          ],
        },
        halted: false,
      },
    };
    const pos = snapshotToPosition(snapshot, makeWorkflow(['plan', 'implement', 'review']));
    const out = visualize(pos, { maxWidth: 120 });
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    expect(stripAnsi(out).length).toBeLessThanOrEqual(120);
  });
});
