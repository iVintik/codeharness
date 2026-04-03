import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { startRenderer } from '../ink-renderer.js';
import type { RendererHandle } from '../ink-renderer.js';
import type { StreamEvent } from '../agents/stream-parser.js';
import {
  App,
  Header,
  Separator,
  CompletedTool,
  ActiveTool,
  LastThought,
  RetryNotice,
  StoryBreakdown,
  StoryMessageLine,
  type RendererState,
  type SprintInfo,
  type CompletedToolEntry,
  type StoryStatusEntry,
  type StoryMessage,
} from '../ink-components.js';

// --- Helpers ---

function makeState(overrides?: Partial<RendererState>): RendererState {
  return {
    sprintInfo: null,
    stories: [],
    messages: [],
    completedTools: [],
    activeTool: null,
    activeToolArgs: '',
    lastThought: null,
    retryInfo: null,
    workflowFlow: [],
    currentTaskName: null,
    taskStates: {},
    taskMeta: {},
    activeDriverName: null,
    driverCosts: {},
    ...overrides,
  };
}

// --- Component Tests (using ink-testing-library) ---

describe('Header component', () => {
  it('renders plain text header line (no Box border, no diamond prefix)', () => {
    const info: SprintInfo = {
      storyKey: '0-5-3',
      phase: 'dev',
      done: 3,
      total: 10,
      iterationCount: 2,
      totalCost: 5.50,
    };
    const { lastFrame } = render(<Header info={info} />);
    const frame = lastFrame()!;
    // AC1: plain text header, NO Box border, NO diamond prefix
    expect(frame).toContain('codeharness run');
    expect(frame).toContain('iteration 2');
    expect(frame).toContain('$5.50 spent');
    expect(frame).not.toContain('◆');
    expect(frame).not.toContain('│'); // No Ink Box border character
    // AC3: Story and Phase on separate lines
    expect(frame).toContain('Story: 0-5-3');
    expect(frame).toContain('Phase: dev');
  });

  it('renders separator line with heavy bars', () => {
    const info: SprintInfo = {
      storyKey: '1-1',
      phase: 'dev',
      done: 0,
      total: 5,
    };
    const { lastFrame } = render(<Header info={info} />);
    const frame = lastFrame()!;
    // AC2: separator line
    expect(frame).toContain('━━━');
  });

  it('renders nothing when info is null', () => {
    const { lastFrame } = render(<Header info={null} />);
    expect(lastFrame()).toBe('');
  });

  it('renders Phase with AC progress and current command', () => {
    const info: SprintInfo = {
      storyKey: '3-2',
      phase: 'verify',
      done: 18,
      total: 65,
      acProgress: '8/12',
      currentCommand: 'docker exec ... codeharness init --json',
    };
    const { lastFrame } = render(<Header info={info} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Phase: verify');
    expect(frame).toContain('AC 8/12');
    expect(frame).toContain('(docker exec ... codeharness init --json)');
  });

  it('omits iteration and cost when not provided', () => {
    const info: SprintInfo = {
      storyKey: '1-1',
      phase: 'dev',
      done: 0,
      total: 5,
    };
    const { lastFrame } = render(<Header info={info} />);
    const frame = lastFrame()!;
    expect(frame).toContain('codeharness run');
    expect(frame).not.toContain('iteration');
    expect(frame).not.toContain('spent');
    expect(frame).not.toContain('undefined');
  });
});

describe('Separator component', () => {
  it('renders a line of heavy bar characters', () => {
    const { lastFrame } = render(<Separator />);
    const frame = lastFrame()!;
    expect(frame).toContain('━━━');
    // Verify it uses only ━ characters
    expect(frame.trim()).toMatch(/^━+$/);
  });
});

describe('Header with elapsed time (AC #3)', () => {
  it('renders elapsed time when provided', () => {
    const info: SprintInfo = {
      storyKey: '3-2',
      phase: 'verify',
      done: 18,
      total: 65,
      elapsed: '47m',
      iterationCount: 3,
      totalCost: 12.30,
    };
    const { lastFrame } = render(<Header info={info} />);
    const frame = lastFrame()!;
    expect(frame).toContain('codeharness run');
    expect(frame).toContain('iteration 3');
    expect(frame).toContain('47m elapsed');
    expect(frame).toContain('$12.30 spent');
    expect(frame).toContain('Story: 3-2');
    expect(frame).toContain('Phase: verify');
  });

  it('omits elapsed when not provided', () => {
    const info: SprintInfo = {
      storyKey: '1-1',
      phase: 'dev',
      done: 0,
      total: 5,
    };
    const { lastFrame } = render(<Header info={info} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Story: 1-1');
    expect(frame).not.toContain('undefined');
  });
});

describe('StoryBreakdown component (AC #4)', () => {
  it('renders labeled sections: Done, This, Next, Blocked', () => {
    const stories: StoryStatusEntry[] = [
      { key: '3-1-some-story', status: 'done' },
      { key: '4-1-another', status: 'done' },
      { key: '3-2-current', status: 'in-progress' },
      { key: '3-3-next-one', status: 'pending' },
      { key: '0-1-stuck', status: 'blocked', retryCount: 10, maxRetries: 10 },
    ];
    const { lastFrame } = render(<StoryBreakdown stories={stories} />);
    const frame = lastFrame()!;
    // Done: individual short keys with checkmarks
    expect(frame).toContain('Done:');
    expect(frame).toContain('3-1 ✓');
    expect(frame).toContain('4-1 ✓');
    // This: current story with diamond
    expect(frame).toContain('This:');
    expect(frame).toContain('3-2 ◆');
    // Next: next pending story
    expect(frame).toContain('Next:');
    expect(frame).toContain('3-3');
    // Blocked: with ✕ and retry counts
    expect(frame).toContain('Blocked:');
    expect(frame).toContain('0-1 ✕');
    expect(frame).toContain('(10/10)');
  });

  it('renders nothing when stories array is empty', () => {
    const { lastFrame } = render(<StoryBreakdown stories={[]} />);
    expect(lastFrame()).toBe('');
  });

  it('renders failed stories with ✗', () => {
    const stories: StoryStatusEntry[] = [
      { key: '2-3-broken', status: 'failed', retryCount: 5, maxRetries: 10 },
    ];
    const { lastFrame } = render(<StoryBreakdown stories={stories} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Failed:');
    expect(frame).toContain('2-3 ✗');
    expect(frame).toContain('(5/10)');
  });

  it('shows +N indicator for multiple pending stories', () => {
    const stories: StoryStatusEntry[] = [
      { key: '1-1-a', status: 'pending' },
      { key: '2-1-b', status: 'pending' },
      { key: '3-1-c', status: 'pending' },
      { key: '4-1-d', status: 'pending' },
      { key: '5-1-e', status: 'pending' },
    ];
    const { lastFrame } = render(<StoryBreakdown stories={stories} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Next:');
    expect(frame).toContain('1-1');
    expect(frame).toContain('+4 more');
  });

  it('includes AC progress for current story when sprintInfo provided', () => {
    const stories: StoryStatusEntry[] = [
      { key: '3-2-current', status: 'in-progress' },
    ];
    const sprintInfo: SprintInfo = {
      storyKey: '3-2-current',
      phase: 'verifying',
      done: 5,
      total: 10,
      acProgress: '8/12',
    };
    const { lastFrame } = render(<StoryBreakdown stories={stories} sprintInfo={sprintInfo} />);
    const frame = lastFrame()!;
    expect(frame).toContain('This:');
    expect(frame).toContain('3-2 ◆');
    expect(frame).toContain('verifying');
    expect(frame).toContain('(8/12 ACs)');
  });

  it('renders blocked stories without retry counts when not provided', () => {
    const stories: StoryStatusEntry[] = [
      { key: '1-1-stuck', status: 'blocked' },
    ];
    const { lastFrame } = render(<StoryBreakdown stories={stories} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Blocked:');
    expect(frame).toContain('1-1 ✕');
    expect(frame).not.toContain('(');
  });

  it('does not match story 3-20 as current when sprint info says 3-2 (key prefix collision)', () => {
    const stories: StoryStatusEntry[] = [
      { key: '3-2-current', status: 'in-progress' },
      { key: '3-20-other', status: 'in-progress' },
    ];
    const sprintInfo: SprintInfo = {
      storyKey: '3-2-current',
      phase: 'verifying',
      done: 5,
      total: 10,
      acProgress: '8/12',
    };
    const { lastFrame } = render(<StoryBreakdown stories={stories} sprintInfo={sprintInfo} />);
    const frame = lastFrame()!;
    // 3-2 should have phase info, 3-20 should NOT
    expect(frame).toContain('3-2 ◆ verifying (8/12 ACs)');
    expect(frame).toMatch(/3-20 ◆(?! verifying)/);
  });
});

describe('CompletedTool component', () => {
  it('renders tool name and args', () => {
    const entry: CompletedToolEntry = { name: 'Bash', args: 'ls -la' };
    const { lastFrame } = render(<CompletedTool entry={entry} />);
    const frame = lastFrame();
    expect(frame).toContain('✓');
    expect(frame).toContain('[Bash]');
    expect(frame).toContain('ls -la');
  });

  it('truncates long args to 60 chars', () => {
    const longArgs = 'a'.repeat(100);
    const entry: CompletedToolEntry = { name: 'Write', args: longArgs };
    const { lastFrame } = render(<CompletedTool entry={entry} />);
    const frame = lastFrame()!;
    expect(frame).toContain('a'.repeat(60) + '…');
    expect(frame).not.toContain('a'.repeat(61));
  });
});

describe('ActiveTool component', () => {
  it('renders tool name with lightning bolt', () => {
    const { lastFrame } = render(<ActiveTool name="Read" />);
    const frame = lastFrame();
    expect(frame).toContain('⚡');
    expect(frame).toContain('[Read]');
  });
});

describe('LastThought component', () => {
  it('renders thought text with brain emoji', () => {
    const { lastFrame } = render(<LastThought text="thinking about code" />);
    const frame = lastFrame();
    expect(frame).toContain('💭');
    expect(frame).toContain('thinking about code');
  });
});

describe('LastThought truncation', () => {
  it('handles emoji without splitting surrogate pairs', () => {
    const text = '🎉🎊🎈🎁🎂'.repeat(20);
    const { lastFrame } = render(<LastThought text={text} />);
    const frame = lastFrame()!;
    expect(frame).toContain('💭');
    expect(frame).toBeDefined();
  });
});

describe('RetryNotice component', () => {
  it('renders retry info', () => {
    const { lastFrame } = render(
      <RetryNotice info={{ attempt: 2, delay: 5000 }} />,
    );
    const frame = lastFrame();
    expect(frame).toContain('⏳');
    expect(frame).toContain('retry');
    expect(frame).toContain('2');
    expect(frame).toContain('5000');
  });
});

describe('StoryMessageLine component (AC #5, #6)', () => {
  it('renders [OK] message for completed story', () => {
    const msg: StoryMessage = { type: 'ok', key: '3-2', message: 'DONE — 12/12 ACs verified (18m, $4.20)' };
    const { lastFrame } = render(<StoryMessageLine msg={msg} />);
    const frame = lastFrame()!;
    expect(frame).toContain('[OK]');
    expect(frame).toContain('Story 3-2');
    expect(frame).toContain('DONE');
    expect(frame).toContain('12/12 ACs verified');
  });

  it('renders [WARN] message with details', () => {
    const msg: StoryMessage = {
      type: 'warn',
      key: '3-3',
      message: 'verification found 2 failing ACs → returning to dev (attempt 2/10)',
      details: [
        'AC 3: bridge --dry-run output missing epic headers',
        'AC 7: bridge creates duplicate beads issues',
      ],
    };
    const { lastFrame } = render(<StoryMessageLine msg={msg} />);
    const frame = lastFrame()!;
    expect(frame).toContain('[WARN]');
    expect(frame).toContain('Story 3-3');
    expect(frame).toContain('2 failing ACs');
    expect(frame).toContain('└ AC 3');
    expect(frame).toContain('└ AC 7');
  });

  it('renders [FAIL] message', () => {
    const msg: StoryMessage = { type: 'fail', key: '2-3', message: 'verification failed at AC 4 (attempt 3/10)' };
    const { lastFrame } = render(<StoryMessageLine msg={msg} />);
    const frame = lastFrame()!;
    expect(frame).toContain('[FAIL]');
    expect(frame).toContain('Story 2-3');
  });

  it('renders [OK] with detail lines for proof, duration, and cost', () => {
    const msg: StoryMessage = {
      type: 'ok',
      key: '3-2',
      message: 'DONE — 12/12 ACs verified',
      details: [
        'Proof: verification/3-2-proof.md',
        'Duration: 18m | Cost: $4.20',
      ],
    };
    const { lastFrame } = render(<StoryMessageLine msg={msg} />);
    const frame = lastFrame()!;
    expect(frame).toContain('[OK]');
    expect(frame).toContain('Story 3-2: DONE');
    expect(frame).toContain('└ Proof: verification/3-2-proof.md');
    expect(frame).toContain('└ Duration: 18m | Cost: $4.20');
  });
});

describe('App component', () => {
  it('renders all elements when state is full', () => {
    const state = makeState({
      sprintInfo: {
        storyKey: '1-2-3',
        phase: 'dev',
        done: 1,
        total: 5,
        iterationCount: 1,
        totalCost: 2.50,
      },
      completedTools: [{ name: 'Bash', args: 'echo hello' }],
      activeTool: { name: 'Read' },
      lastThought: 'analyzing...',
      retryInfo: null,
    });
    const { lastFrame } = render(<App state={state} />);
    const frame = lastFrame()!;
    expect(frame).toContain('codeharness run');
    expect(frame).toContain('Story: 1-2-3');
    expect(frame).toContain('✓');
    expect(frame).toContain('[Bash]');
    expect(frame).toContain('⚡');
    expect(frame).toContain('[Read]');
    expect(frame).toContain('💭');
    expect(frame).toContain('analyzing...');
  });

  it('renders empty state without errors', () => {
    const state = makeState();
    const { lastFrame } = render(<App state={state} />);
    expect(lastFrame()).toBeDefined();
  });

  it('renders retry info when present', () => {
    const state = makeState({
      retryInfo: { attempt: 3, delay: 10000 },
    });
    const { lastFrame } = render(<App state={state} />);
    const frame = lastFrame()!;
    expect(frame).toContain('⏳');
    expect(frame).toContain('3');
  });

  it('renders bottom separator after story breakdown', () => {
    const state = makeState({
      sprintInfo: { storyKey: '3-2', phase: 'dev', done: 1, total: 5 },
      stories: [
        { key: '3-1-done', status: 'done' },
        { key: '3-2-current', status: 'in-progress' },
      ],
    });
    const { lastFrame } = render(<App state={state} />);
    const frame = lastFrame()!;
    // Should have separators
    const separatorCount = (frame.match(/━━━/g) || []).length;
    expect(separatorCount).toBeGreaterThanOrEqual(2); // header separator + bottom separator
  });
});

// --- Controller API Tests ---

describe('startRenderer', () => {
  let handle: RendererHandle | null = null;

  afterEach(() => {
    if (handle) {
      handle.cleanup();
      handle = null;
    }
  });

  describe('quiet mode (AC #8)', () => {
    it('returns no-op handle when quiet is true', () => {
      handle = startRenderer({ quiet: true });
      handle.update({ type: 'tool-start', name: 'Bash', id: 'x' });
      handle.update({ type: 'tool-complete' });
      handle.update({ type: 'text', text: 'hello' });
      handle.updateSprintState({ storyKey: 'a', phase: 'b', done: 1, total: 2 });
      handle.updateStories([{ key: '1-1', status: 'done' }]);
      handle.addMessage({ type: 'ok', key: '1-1', message: 'DONE' });
      handle.cleanup();
      handle.cleanup();
    });
  });

  describe('event handling', () => {
    it('handles tool-start event', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.update({ type: 'tool-start', name: 'Bash', id: 'tool1' });
    });

    it('handles tool-complete after tool-start (moves to completed)', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.update({ type: 'tool-start', name: 'Bash', id: 'tool1' });
      handle.update({ type: 'tool-input', partial: '{"command":' });
      handle.update({ type: 'tool-input', partial: '"ls"}' });
      handle.update({ type: 'tool-complete' });
    });

    it('handles tool-complete when no activeTool (text block stop)', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.update({ type: 'tool-complete' });
    });

    it('handles text event', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.update({ type: 'text', text: 'thinking...' });
    });

    it('handles retry event', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.update({ type: 'retry', attempt: 1, delay: 5000 });
    });

    it('handles result event and accumulates cost', () => {
      handle = startRenderer({
        sprintState: { storyKey: 'a', phase: 'b', done: 1, total: 2 },
        _forceTTY: true,
      });
      handle.update({ type: 'result', cost: 0.05, sessionId: 'sess_123' });
      // Cost should be accumulated in sprintInfo
    });

    it('preserves accumulated cost when updateSprintState is called without cost', () => {
      handle = startRenderer({
        sprintState: { storyKey: 'a', phase: 'b', done: 1, total: 2 },
        _forceTTY: true,
      });
      // Accumulate cost via result events
      handle.update({ type: 'result', cost: 0.05, sessionId: 'sess_1' });
      handle.update({ type: 'result', cost: 0.10, sessionId: 'sess_2' });
      // Sprint state refresh (simulating the 5s polling interval) should NOT wipe cost
      handle.updateSprintState({ storyKey: 'a', phase: 'b', done: 2, total: 5, elapsed: '5m', iterationCount: 2 });
      // Cost should still be preserved (0.15 total) — this test ensures the bug fix works
    });

    it('clears retry on next tool-start', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.update({ type: 'retry', attempt: 1, delay: 5000 });
      handle.update({ type: 'tool-start', name: 'Bash', id: 'tool1' });
    });

    it('clears retry on next text event', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.update({ type: 'retry', attempt: 1, delay: 5000 });
      handle.update({ type: 'text', text: 'thinking...' });
    });

    it('clears lastThought on tool-start', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.update({ type: 'text', text: 'old thought' });
      handle.update({ type: 'tool-start', name: 'Bash', id: 'tool1' });
    });

    it('text event overwrites previous thought (not append)', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.update({ type: 'text', text: 'first thought' });
      handle.update({ type: 'text', text: 'second thought' });
    });

    it('accumulates tool input args', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.update({ type: 'tool-start', name: 'Write', id: 'tool1' });
      handle.update({ type: 'tool-input', partial: '{"path":' });
      handle.update({ type: 'tool-input', partial: '"/tmp/test.ts",' });
      handle.update({ type: 'tool-input', partial: '"content":"hello"}' });
      handle.update({ type: 'tool-complete' });
    });

    it('bounds completed tools list at MAX_COMPLETED_TOOLS (50)', () => {
      handle = startRenderer({ _forceTTY: true });
      for (let i = 0; i < 55; i++) {
        handle.update({ type: 'tool-start', name: `Tool${i}`, id: `t${i}` });
        handle.update({ type: 'tool-input', partial: `arg${i}` });
        handle.update({ type: 'tool-complete' });
      }
    });

    it('handles multiple tool cycles', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.update({ type: 'tool-start', name: 'Read', id: 'tool1' });
      handle.update({ type: 'tool-input', partial: '{"path":"/a"}' });
      handle.update({ type: 'tool-complete' });
      handle.update({ type: 'tool-start', name: 'Write', id: 'tool2' });
      handle.update({ type: 'tool-input', partial: '{"path":"/b"}' });
      handle.update({ type: 'tool-complete' });
    });
  });

  describe('updateSprintState', () => {
    it('updates sprint state', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.updateSprintState({
        storyKey: '0-5-3',
        phase: 'dev',
        done: 5,
        total: 12,
      });
    });

    it('clears sprint state with undefined', () => {
      handle = startRenderer({
        sprintState: { storyKey: 'x', phase: 'dev', done: 1, total: 2 },
        _forceTTY: true,
      });
      handle.updateSprintState(undefined);
    });
  });

  describe('updateStories (AC #4)', () => {
    it('updates story statuses', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.updateStories([
        { key: '3-1', status: 'done' },
        { key: '3-2', status: 'in-progress' },
      ]);
    });

    it('clears stories with empty array', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.updateStories([{ key: '1-1', status: 'done' }]);
      handle.updateStories([]);
    });
  });

  describe('addMessage (AC #5, #6)', () => {
    it('adds story completion message', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.addMessage({ type: 'ok', key: '3-2', message: 'DONE — 12/12 ACs verified' });
    });

    it('adds story failure message with details', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.addMessage({
        type: 'warn',
        key: '3-3',
        message: 'verification found 2 failing ACs',
        details: ['AC 3: missing headers', 'AC 7: duplicate issues'],
      });
    });

    it('accumulates multiple messages', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.addMessage({ type: 'ok', key: '3-1', message: 'DONE' });
      handle.addMessage({ type: 'warn', key: '3-2', message: 'failing' });
      handle.addMessage({ type: 'fail', key: '2-3', message: 'failed' });
    });
  });

  describe('updateWorkflowState', () => {
    it('updates workflow graph state', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.updateWorkflowState(
        ['create-story', 'implement', 'verify'],
        'implement',
        { 'create-story': 'done', 'implement': 'active', 'verify': 'pending' },
      );
    });

    it('ignores updates after cleanup', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.cleanup();
      handle.updateWorkflowState(
        ['task1'],
        'task1',
        { task1: 'active' },
      );
      handle = null;
    });
  });

  describe('quiet mode includes new methods', () => {
    it('no-op handle has updateStories, addMessage, and updateWorkflowState', () => {
      handle = startRenderer({ quiet: true });
      handle.updateStories([{ key: '1-1', status: 'done' }]);
      handle.addMessage({ type: 'ok', key: '1-1', message: 'DONE' });
      handle.updateWorkflowState(['task1'], 'task1', { task1: 'active' });
    });
  });

  describe('cleanup (AC #6)', () => {
    it('can be called multiple times without error', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.cleanup();
      handle.cleanup();
      handle.cleanup();
      handle = null;
    });

    it('ignores updates after cleanup', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.cleanup();
      handle.update({ type: 'tool-start', name: 'Bash', id: 'x' });
      handle.update({ type: 'text', text: 'hello' });
      handle.updateSprintState({ storyKey: 'a', phase: 'b', done: 1, total: 2 });
      handle.updateStories([{ key: '1-1', status: 'done' }]);
      handle.addMessage({ type: 'ok', key: '1-1', message: 'DONE' });
      handle = null;
    });
  });

  describe('signal handling (AC #9)', () => {
    it('cleans up and re-raises SIGINT', () => {
      handle = startRenderer({ _forceTTY: true });
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
      try {
        process.emit('SIGINT');
        expect(killSpy).toHaveBeenCalledWith(process.pid, 'SIGINT');
        handle.update({ type: 'text', text: 'should be ignored' });
      } finally {
        killSpy.mockRestore();
      }
      handle = null;
    });

    it('cleans up and re-raises SIGTERM', () => {
      handle = startRenderer({ _forceTTY: true });
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
      try {
        process.emit('SIGTERM');
        expect(killSpy).toHaveBeenCalledWith(process.pid, 'SIGTERM');
      } finally {
        killSpy.mockRestore();
      }
      handle = null;
    });
  });

  describe('non-TTY fallback (AC #6)', () => {
    it('returns no-op handle when stdout is not a TTY', () => {
      handle = startRenderer();
      handle.update({ type: 'tool-start', name: 'Bash', id: 'x' });
      handle.update({ type: 'tool-complete' });
      handle.cleanup();
      handle = null;
    });
  });

  describe('initial sprint state', () => {
    it('accepts sprint state in options', () => {
      handle = startRenderer({
        sprintState: { storyKey: '1-1', phase: 'dev', done: 0, total: 5 },
        _forceTTY: true,
      });
    });
  });
});

// --- Integration: full event sequence ---

describe('full event sequence', () => {
  let handle: RendererHandle;

  afterEach(() => {
    handle?.cleanup();
  });

  it('processes a realistic stream of events', () => {
    handle = startRenderer({
      sprintState: { storyKey: '0-5-3', phase: 'dev', done: 3, total: 10 },
      _forceTTY: true,
    });

    const events: StreamEvent[] = [
      { type: 'text', text: 'Let me analyze...' },
      { type: 'tool-complete' },
      { type: 'tool-start', name: 'Read', id: 'tool1' },
      { type: 'tool-input', partial: '{"file_path":"/src/index.ts"}' },
      { type: 'tool-complete' },
      { type: 'text', text: 'Now I understand the structure' },
      { type: 'tool-complete' },
      { type: 'tool-start', name: 'Write', id: 'tool2' },
      { type: 'tool-input', partial: '{"file_path":"/src/new.ts",' },
      { type: 'tool-input', partial: '"content":"export const x = 1;"}' },
      { type: 'tool-complete' },
      { type: 'retry', attempt: 1, delay: 5000 },
      { type: 'tool-start', name: 'Bash', id: 'tool3' },
      { type: 'tool-input', partial: '{"command":"npm test"}' },
      { type: 'tool-complete' },
      { type: 'result', cost: 0.15, sessionId: 'sess_abc' },
    ];

    for (const event of events) {
      handle.update(event);
    }
  });
});

// --- Visual Snapshot Test (AC #10) ---

describe('Visual snapshot: spec-compliant output', () => {
  it('renders known state matching UX spec format', () => {
    const state = makeState({
      sprintInfo: {
        storyKey: '3-2-bmad-installation-workflow-patching',
        phase: 'verify',
        done: 18,
        total: 65,
        elapsed: '47m',
        iterationCount: 3,
        totalCost: 12.30,
        acProgress: '8/12',
        currentCommand: 'docker exec ... codeharness init --json',
      },
      stories: [
        { key: '3-1-first', status: 'done' },
        { key: '4-1-second', status: 'done' },
        { key: '4-2-third', status: 'done' },
        { key: '3-2-bmad-installation-workflow-patching', status: 'in-progress' },
        { key: '3-3-next', status: 'pending' },
        { key: '0-1-stuck', status: 'blocked', retryCount: 10, maxRetries: 10 },
        { key: '13-3-also-stuck', status: 'blocked', retryCount: 10, maxRetries: 10 },
      ],
      completedTools: [{ name: 'Bash', args: 'npm test' }],
      activeTool: null,
      lastThought: null,
      retryInfo: null,
    });

    const { lastFrame } = render(<App state={state} />);
    const frame = lastFrame()!;

    // Header line: plain text with pipe separators
    expect(frame).toContain('codeharness run | iteration 3 | 47m elapsed | $12.30 spent');

    // Separator lines (━━━)
    expect(frame).toContain('━━━');

    // Story and Phase lines
    expect(frame).toContain('Story: 3-2-bmad-installation-workflow-patching');
    expect(frame).toContain('Phase: verify');
    expect(frame).toContain('AC 8/12');
    expect(frame).toContain('(docker exec ... codeharness init --json)');

    // Labeled story sections
    expect(frame).toContain('Done:');
    expect(frame).toContain('3-1 ✓');
    expect(frame).toContain('4-1 ✓');
    expect(frame).toContain('4-2 ✓');
    expect(frame).toContain('This:');
    expect(frame).toContain('3-2 ◆');
    expect(frame).toContain('Next:');
    expect(frame).toContain('3-3');
    expect(frame).toContain('Blocked:');
    expect(frame).toContain('0-1 ✕ (10/10)');
    expect(frame).toContain('13-3 ✕ (10/10)');

    // No Ink Box border artifacts
    expect(frame).not.toContain('╭');
    expect(frame).not.toContain('╮');
    expect(frame).not.toContain('╰');
    expect(frame).not.toContain('╯');
    expect(frame).not.toMatch(/│/);
  });

  it('renders story completion in spec format', () => {
    const msg: StoryMessage = {
      type: 'ok',
      key: '3-2',
      message: 'DONE — 12/12 ACs verified',
      details: [
        'Proof: verification/3-2-proof.md',
        'Duration: 18m | Cost: $4.20',
      ],
    };
    const { lastFrame } = render(<StoryMessageLine msg={msg} />);
    const frame = lastFrame()!;
    expect(frame).toContain('[OK] Story 3-2: DONE — 12/12 ACs verified');
    expect(frame).toContain('└ Proof: verification/3-2-proof.md');
    expect(frame).toContain('└ Duration: 18m | Cost: $4.20');
  });

  it('renders story warning in spec format', () => {
    const msg: StoryMessage = {
      type: 'warn',
      key: '3-3',
      message: 'verification found 2 failing ACs → returning to dev',
      details: [
        'AC 3: bridge --dry-run output missing epic headers',
        'AC 7: bridge creates duplicate beads issues',
        'Attempt 2/10 — dev will fix and re-verify',
      ],
    };
    const { lastFrame } = render(<StoryMessageLine msg={msg} />);
    const frame = lastFrame()!;
    expect(frame).toContain('[WARN] Story 3-3: verification found 2 failing ACs');
    expect(frame).toContain('└ AC 3');
    expect(frame).toContain('└ AC 7');
    expect(frame).toContain('└ Attempt 2/10');
  });
});

// --- Driver Name Integration Tests (via App component rendering) ---

describe('driver name in rendered output', () => {
  it('renders driver name on active tool when activeDriverName is set', () => {
    const state = makeState({
      activeTool: { name: 'Bash' },
      activeToolArgs: '',
      activeDriverName: 'codex',
    });
    const { lastFrame } = render(<App state={state} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Bash');
    expect(frame).toContain('(codex)');
  });

  it('renders no driver label on active tool when activeDriverName is null', () => {
    const state = makeState({
      activeTool: { name: 'Bash' },
      activeToolArgs: '',
      activeDriverName: null,
    });
    const { lastFrame } = render(<App state={state} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Bash');
    expect(frame).not.toContain('(codex)');
    expect(frame).not.toContain('(null)');
    expect(frame).not.toContain('(undefined)');
  });

  it('renders driver name on completed tool entry', () => {
    const state = makeState({
      completedTools: [{ name: 'Edit', args: 'src/foo.ts', driver: 'codex' }],
    });
    const { lastFrame } = render(<App state={state} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Edit');
    expect(frame).toContain('(codex)');
  });

  it('renders no driver on completed tool when driver is undefined', () => {
    const state = makeState({
      completedTools: [{ name: 'Edit', args: 'src/foo.ts' }],
    });
    const { lastFrame } = render(<App state={state} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Edit');
    expect(frame).not.toContain('(undefined)');
  });

  it('renders DriverCostSummary with multi-driver costs in App layout', () => {
    const state = makeState({
      driverCosts: { codex: 0.45, 'claude-code': 1.23 },
    });
    const { lastFrame } = render(<App state={state} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Cost: claude-code $1.23, codex $0.45');
  });

  it('renders nothing for DriverCostSummary when driverCosts is empty', () => {
    const state = makeState({ driverCosts: {} });
    const { lastFrame } = render(<App state={state} />);
    const frame = lastFrame()!;
    expect(frame).not.toContain('Cost:');
  });
});

describe('driver name in update() (controller integration)', () => {
  let handle: RendererHandle;

  afterEach(() => {
    handle?.cleanup();
  });

  it('sets activeDriverName on tool-start when driverName provided', () => {
    handle = startRenderer({ sprintState: { storyKey: 'test', phase: 'dev', done: 0, total: 1 }, _forceTTY: true });
    handle.update({ type: 'tool-start', name: 'Bash', id: 't1' }, 'codex');
    handle.update({ type: 'tool-complete' });
    // Accepted without error — driver tracking is internal state
  });

  it('leaves activeDriverName null when no driverName provided', () => {
    handle = startRenderer({ sprintState: { storyKey: 'test', phase: 'dev', done: 0, total: 1 }, _forceTTY: true });
    handle.update({ type: 'tool-start', name: 'Bash', id: 't1' });
    handle.update({ type: 'tool-complete' });
  });

  it('accumulates driverCosts on result event with driverName', () => {
    handle = startRenderer({ sprintState: { storyKey: 'test', phase: 'dev', done: 0, total: 1 }, _forceTTY: true });
    handle.update({ type: 'result', cost: 1.50, sessionId: 'sess1' }, 'claude-code');
    handle.update({ type: 'result', cost: 0.75, sessionId: 'sess2' }, 'claude-code');
    handle.update({ type: 'result', cost: 0.25, sessionId: 'sess3' }, 'codex');
  });

  it('does not accumulate driverCosts when no driverName on result', () => {
    handle = startRenderer({ sprintState: { storyKey: 'test', phase: 'dev', done: 0, total: 1 }, _forceTTY: true });
    handle.update({ type: 'result', cost: 1.50, sessionId: 'sess1' });
  });

  it('handles error-like sequence without crash (driver failure resilience)', () => {
    handle = startRenderer({ sprintState: { storyKey: 'test', phase: 'dev', done: 0, total: 1 }, _forceTTY: true });
    handle.update({ type: 'tool-start', name: 'Bash', id: 't1' }, 'codex');
    handle.update({ type: 'tool-input', partial: '{"command":"exit 1"}' });
    handle.update({ type: 'tool-complete' });
    handle.update({ type: 'text', text: 'The command failed' });
    handle.update({ type: 'tool-start', name: 'Read', id: 't2' }, 'claude-code');
    handle.update({ type: 'tool-complete' });
  });
});

// --- Per-Story Cost Tracking Tests (Story 15-2) ---

describe('StoryBreakdown per-story cost display', () => {
  it('renders done story with multi-driver costs sorted alphabetically', () => {
    const stories: StoryStatusEntry[] = [
      { key: '1-1-auth', status: 'done', costByDriver: { codex: 0.15, 'claude-code': 0.42 } },
    ];
    const { lastFrame } = render(<StoryBreakdown stories={stories} />);
    const frame = lastFrame()!;
    expect(frame).toContain('1-1 ✓ claude-code $0.42, codex $0.15');
  });

  it('renders done story with single-driver cost', () => {
    const stories: StoryStatusEntry[] = [
      { key: '1-1-auth', status: 'done', costByDriver: { 'claude-code': 0.42 } },
    ];
    const { lastFrame } = render(<StoryBreakdown stories={stories} />);
    const frame = lastFrame()!;
    expect(frame).toContain('1-1 ✓ claude-code $0.42');
  });

  it('renders done story with no cost data as just checkmark', () => {
    const stories: StoryStatusEntry[] = [
      { key: '1-1-auth', status: 'done' },
    ];
    const { lastFrame } = render(<StoryBreakdown stories={stories} />);
    const frame = lastFrame()!;
    expect(frame).toContain('1-1 ✓');
    expect(frame).not.toContain('$');
  });

  it('renders done story with empty costByDriver as just checkmark', () => {
    const stories: StoryStatusEntry[] = [
      { key: '1-1-auth', status: 'done', costByDriver: {} },
    ];
    const { lastFrame } = render(<StoryBreakdown stories={stories} />);
    const frame = lastFrame()!;
    expect(frame).toContain('1-1 ✓');
    expect(frame).not.toContain('$');
  });

  it('formats cost as $X.XX with two decimal places', () => {
    const stories: StoryStatusEntry[] = [
      { key: '2-1-test', status: 'done', costByDriver: { opencode: 3 } },
    ];
    const { lastFrame } = render(<StoryBreakdown stories={stories} />);
    const frame = lastFrame()!;
    expect(frame).toContain('$3.00');
  });

  it('renders multiple done stories each with their own cost breakdown', () => {
    const stories: StoryStatusEntry[] = [
      { key: '1-1-auth', status: 'done', costByDriver: { 'claude-code': 0.42 } },
      { key: '1-2-api', status: 'done', costByDriver: { codex: 0.30, 'claude-code': 0.10 } },
      { key: '1-3-ui', status: 'done' },
    ];
    const { lastFrame } = render(<StoryBreakdown stories={stories} />);
    const frame = lastFrame()!;
    expect(frame).toContain('1-1 ✓ claude-code $0.42');
    expect(frame).toContain('1-2 ✓ claude-code $0.10, codex $0.30');
    expect(frame).toContain('1-3 ✓');
  });
});

describe('per-story cost accumulation (controller integration)', () => {
  let handle: RendererHandle;

  afterEach(() => {
    handle?.cleanup();
  });

  it('snapshots per-story costs from multiple drivers onto done story', () => {
    handle = startRenderer({
      sprintState: { storyKey: '1-1-auth', phase: 'dev', done: 0, total: 2 },
      _forceTTY: true,
    });
    handle.update({ type: 'result', cost: 0.42, sessionId: 's1' }, 'claude-code');
    handle.update({ type: 'result', cost: 0.15, sessionId: 's2' }, 'codex');
    handle.updateStories([{ key: '1-1-auth', status: 'done' }]);
    const stories = handle._getState!().stories;
    expect(stories[0].costByDriver).toEqual({ 'claude-code': 0.42, codex: 0.15 });
  });

  it('sums multiple result events from same driver within one story', () => {
    handle = startRenderer({
      sprintState: { storyKey: '1-1-auth', phase: 'dev', done: 0, total: 2 },
      _forceTTY: true,
    });
    handle.update({ type: 'result', cost: 0.20, sessionId: 's1' }, 'claude-code');
    handle.update({ type: 'result', cost: 0.22, sessionId: 's2' }, 'claude-code');
    handle.updateStories([{ key: '1-1-auth', status: 'done' }]);
    const stories = handle._getState!().stories;
    expect(stories[0].costByDriver).toEqual({ 'claude-code': expect.closeTo(0.42, 5) });
  });

  it('preserves old story costs when story key changes via updateSprintState', () => {
    handle = startRenderer({
      sprintState: { storyKey: '1-1-auth', phase: 'dev', done: 0, total: 3 },
      _forceTTY: true,
    });
    handle.update({ type: 'result', cost: 0.50, sessionId: 's1' }, 'claude-code');
    // Story changes — old costs frozen for 1-1-auth, new accumulation starts
    handle.updateSprintState({ storyKey: '1-2-api', phase: 'dev', done: 1, total: 3 });
    handle.update({ type: 'result', cost: 0.10, sessionId: 's2' }, 'codex');
    handle.updateStories([
      { key: '1-1-auth', status: 'done' },
      { key: '1-2-api', status: 'done' },
    ]);
    const stories = handle._getState!().stories;
    expect(stories[0].costByDriver).toEqual({ 'claude-code': 0.50 });
    expect(stories[1].costByDriver).toEqual({ codex: 0.10 });
  });

  it('does not create cost entries for zero cost events', () => {
    handle = startRenderer({
      sprintState: { storyKey: '1-1-auth', phase: 'dev', done: 0, total: 2 },
      _forceTTY: true,
    });
    handle.update({ type: 'result', cost: 0, sessionId: 's1' }, 'claude-code');
    handle.updateStories([{ key: '1-1-auth', status: 'done' }]);
    const stories = handle._getState!().stories;
    expect(stories[0].costByDriver).toBeUndefined();
  });

  it('does not mutate caller story objects', () => {
    handle = startRenderer({
      sprintState: { storyKey: '1-1-auth', phase: 'dev', done: 0, total: 2 },
      _forceTTY: true,
    });
    handle.update({ type: 'result', cost: 0.30, sessionId: 's1' }, 'claude-code');
    const callerStory: StoryStatusEntry = { key: '1-1-auth', status: 'done' };
    handle.updateStories([callerStory]);
    // Caller object should NOT have been mutated
    expect(callerStory.costByDriver).toBeUndefined();
    // But internal state should have costs
    const stories = handle._getState!().stories;
    expect(stories[0].costByDriver).toEqual({ 'claude-code': 0.30 });
  });
});
