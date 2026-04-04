import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { MergeStatus } from '../ink-merge-status.js';
import type { MergeState, MergeStatusProps, MergeTestResults } from '../ink-merge-status.js';

describe('MergeStatus component', () => {
  it('exports MergeStatus as a function component', () => {
    expect(MergeStatus).toBeDefined();
    expect(typeof MergeStatus).toBe('function');
  });

  it('renders nothing when mergeState is null', () => {
    const { lastFrame } = render(<MergeStatus mergeState={null} />);
    expect(lastFrame()).toBe('');
  });

  it('renders clean merge in green', () => {
    const mergeState: MergeState = {
      epicId: 'epic-14',
      outcome: 'clean',
      conflictCount: 0,
    };
    const { lastFrame } = render(<MergeStatus mergeState={mergeState} />);
    const frame = lastFrame()!;
    expect(frame).toContain('[OK] Merge epic-14');
    expect(frame).toContain('\u2192 main: clean (0 conflicts)');
  });

  it('renders resolved merge with file paths', () => {
    const mergeState: MergeState = {
      epicId: 'epic-11',
      outcome: 'resolved',
      conflictCount: 1,
      conflicts: ['src/lib/workflow-engine.ts: additive changes in different functions'],
    };
    const { lastFrame } = render(<MergeStatus mergeState={mergeState} />);
    const frame = lastFrame()!;
    expect(frame).toContain('[OK] Merge epic-11');
    expect(frame).toContain('1 conflict auto-resolved');
    expect(frame).toContain('src/lib/workflow-engine.ts');
  });

  it('renders resolved merge with plural conflicts', () => {
    const mergeState: MergeState = {
      epicId: 'epic-11',
      outcome: 'resolved',
      conflictCount: 3,
      conflicts: ['file1.ts', 'file2.ts', 'file3.ts'],
    };
    const { lastFrame } = render(<MergeStatus mergeState={mergeState} />);
    const frame = lastFrame()!;
    expect(frame).toContain('3 conflicts auto-resolved');
    expect(frame).toContain('file1.ts');
    expect(frame).toContain('file2.ts');
    expect(frame).toContain('file3.ts');
  });

  it('renders escalated merge in red with worktree path', () => {
    const mergeState: MergeState = {
      epicId: 'epic-11',
      outcome: 'escalated',
      reason: 'conflict unresolvable after 3 attempts',
      conflicts: ['src/lib/workflow-engine.ts: semantic conflict in dispatchTaskWithResult()'],
      worktreePath: '/tmp/codeharness-wt-epic-11',
    };
    const { lastFrame } = render(<MergeStatus mergeState={mergeState} />);
    const frame = lastFrame()!;
    expect(frame).toContain('[FAIL] Merge epic-11');
    expect(frame).toContain('conflict unresolvable after 3 attempts');
    expect(frame).toContain('src/lib/workflow-engine.ts');
    expect(frame).toContain('Manual resolution required');
    expect(frame).toContain('Worktree preserved: /tmp/codeharness-wt-epic-11');
  });

  it('renders escalated merge without worktree path', () => {
    const mergeState: MergeState = {
      epicId: 'epic-11',
      outcome: 'escalated',
      reason: 'merge failed',
    };
    const { lastFrame } = render(<MergeStatus mergeState={mergeState} />);
    const frame = lastFrame()!;
    expect(frame).toContain('[FAIL] Merge epic-11');
    expect(frame).toContain('merge failed');
    expect(frame).toContain('Manual resolution required');
    expect(frame).not.toContain('Worktree preserved');
  });

  it('renders passing test results in green', () => {
    const mergeState: MergeState = {
      epicId: 'epic-14',
      outcome: 'clean',
      conflictCount: 0,
      testResults: {
        passed: 1650,
        failed: 0,
        total: 1650,
        durationSecs: 18,
        coverage: null,
      },
    };
    const { lastFrame } = render(<MergeStatus mergeState={mergeState} />);
    const frame = lastFrame()!;
    expect(frame).toContain('[OK] Tests: 1650/1650 passed (18s)');
  });

  it('renders failing test results in red', () => {
    const mergeState: MergeState = {
      epicId: 'epic-14',
      outcome: 'clean',
      conflictCount: 0,
      testResults: {
        passed: 1648,
        failed: 2,
        total: 1650,
        durationSecs: 19,
        coverage: null,
      },
    };
    const { lastFrame } = render(<MergeStatus mergeState={mergeState} />);
    const frame = lastFrame()!;
    expect(frame).toContain('[FAIL] Tests: 1648/1650 passed (19s)');
  });

  it('renders test results with coverage when available', () => {
    const mergeState: MergeState = {
      epicId: 'epic-14',
      outcome: 'clean',
      testResults: {
        passed: 1650,
        failed: 0,
        total: 1650,
        durationSecs: 18,
        coverage: 94,
      },
    };
    const { lastFrame } = render(<MergeStatus mergeState={mergeState} />);
    const frame = lastFrame()!;
    expect(frame).toContain('[OK] Tests: 1650/1650 passed (18s) 94% coverage');
  });

  it('renders in-progress merge', () => {
    const mergeState: MergeState = {
      epicId: 'epic-14',
      outcome: 'in-progress',
    };
    const { lastFrame } = render(<MergeStatus mergeState={mergeState} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Merging epic-14');
    expect(frame).toContain('\u2192 main');
    expect(frame).toContain('\u25CC');
  });

  it('exports correct types', () => {
    // Type-level check: ensure interfaces are importable
    const state: MergeState = {
      epicId: 'epic-14',
      outcome: 'clean',
      conflictCount: 0,
      testResults: { passed: 100, failed: 0, total: 100, durationSecs: 5, coverage: 90 },
      worktreePath: '/tmp/wt',
      reason: 'test',
      conflicts: ['file.ts'],
    };
    const props: MergeStatusProps = { mergeState: state };
    expect(props.mergeState).not.toBeNull();
  });

  it('renders escalated with default reason when reason is missing', () => {
    const mergeState: MergeState = {
      epicId: 'epic-11',
      outcome: 'escalated',
    };
    const { lastFrame } = render(<MergeStatus mergeState={mergeState} />);
    const frame = lastFrame()!;
    expect(frame).toContain('[FAIL] Merge epic-11');
    expect(frame).toContain('unknown error');
  });

  it('renders resolved merge deriving count from conflicts array when conflictCount absent', () => {
    const mergeState: MergeState = {
      epicId: 'epic-11',
      outcome: 'resolved',
      conflicts: ['file1.ts', 'file2.ts'],
    };
    const { lastFrame } = render(<MergeStatus mergeState={mergeState} />);
    const frame = lastFrame()!;
    expect(frame).toContain('2 conflicts auto-resolved');
  });
});
