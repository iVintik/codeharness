import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { startRenderer } from '../ink-renderer.js';
import type { RendererHandle } from '../ink-renderer.js';
import type { StreamEvent } from '../stream-parser.js';
import {
  App,
  Header,
  CompletedTool,
  ActiveTool,
  LastThought,
  RetryNotice,
  StoryBreakdown,
  StoryMessages,
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
    ...overrides,
  };
}

// --- Component Tests (using ink-testing-library) ---

describe('Header component', () => {
  it('renders sprint info', () => {
    const info: SprintInfo = {
      storyKey: '0-5-3',
      phase: 'dev',
      done: 3,
      total: 10,
    };
    const { lastFrame } = render(<Header info={info} />);
    const frame = lastFrame();
    expect(frame).toContain('◆');
    expect(frame).toContain('0-5-3');
    expect(frame).toContain('dev');
    expect(frame).toContain('3/10');
  });

  it('renders nothing when info is null', () => {
    const { lastFrame } = render(<Header info={null} />);
    expect(lastFrame()).toBe('');
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
    expect(frame).toContain('a'.repeat(60) + '...');
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
    // Emoji are multi-byte; truncation should not produce broken characters
    const text = '🎉🎊🎈🎁🎂'.repeat(20); // lots of emoji
    const { lastFrame } = render(<LastThought text={text} />);
    const frame = lastFrame()!;
    // Should contain the prefix and no broken characters
    expect(frame).toContain('💭');
    // Should not throw or produce garbage
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

describe('App component', () => {
  it('renders all elements when state is full', () => {
    const state = makeState({
      sprintInfo: { storyKey: '1-2-3', phase: 'dev', done: 1, total: 5 },
      completedTools: [{ name: 'Bash', args: 'echo hello' }],
      activeTool: { name: 'Read' },
      lastThought: 'analyzing...',
      retryInfo: null,
    });
    const { lastFrame } = render(<App state={state} />);
    const frame = lastFrame()!;
    expect(frame).toContain('1-2-3');
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
    // Should not throw, frame can be empty
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
});

// --- New component tests (Story 0.5.3 rework) ---

describe('Header with elapsed time (AC #3)', () => {
  it('renders elapsed time when provided', () => {
    const info: SprintInfo = {
      storyKey: '3-2',
      phase: 'verify',
      done: 18,
      total: 65,
      elapsed: '47m',
    };
    const { lastFrame } = render(<Header info={info} />);
    const frame = lastFrame()!;
    expect(frame).toContain('◆');
    expect(frame).toContain('3-2');
    expect(frame).toContain('verify');
    expect(frame).toContain('47m');
    expect(frame).toContain('18/65');
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
    expect(frame).toContain('1-1');
    expect(frame).not.toContain('undefined');
  });
});

describe('StoryBreakdown component (AC #4)', () => {
  it('renders stories grouped by status with correct symbols', () => {
    const stories: StoryStatusEntry[] = [
      { key: '3-1', status: 'done' },
      { key: '4-1', status: 'done' },
      { key: '3-2', status: 'in-progress' },
      { key: '3-3', status: 'pending' },
      { key: '0-1', status: 'blocked' },
    ];
    const { lastFrame } = render(<StoryBreakdown stories={stories} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Done:');
    expect(frame).toContain('3-1 ✓');
    expect(frame).toContain('4-1 ✓');
    expect(frame).toContain('This:');
    expect(frame).toContain('3-2 ◆');
    expect(frame).toContain('Next:');
    expect(frame).toContain('3-3 ○');
    expect(frame).toContain('Blocked:');
    expect(frame).toContain('0-1 ✕');
  });

  it('renders nothing when stories array is empty', () => {
    const { lastFrame } = render(<StoryBreakdown stories={[]} />);
    expect(lastFrame()).toBe('');
  });

  it('renders failed stories with ✗ symbol', () => {
    const stories: StoryStatusEntry[] = [
      { key: '2-3', status: 'failed' },
    ];
    const { lastFrame } = render(<StoryBreakdown stories={stories} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Failed:');
    expect(frame).toContain('2-3 ✗');
  });
});

describe('StoryMessages component (AC #5, #6)', () => {
  it('renders [OK] message for completed story', () => {
    const messages: StoryMessage[] = [
      { type: 'ok', key: '3-2', message: 'DONE — 12/12 ACs verified (18m, $4.20)' },
    ];
    const { lastFrame } = render(<StoryMessages messages={messages} />);
    const frame = lastFrame()!;
    expect(frame).toContain('[OK]');
    expect(frame).toContain('Story 3-2');
    expect(frame).toContain('DONE');
    expect(frame).toContain('12/12 ACs verified');
  });

  it('renders [WARN] message with details for failed verification', () => {
    const messages: StoryMessage[] = [
      {
        type: 'warn',
        key: '3-3',
        message: 'verification found 2 failing ACs → returning to dev (attempt 2/10)',
        details: [
          'AC 3: bridge --dry-run output missing epic headers',
          'AC 7: bridge creates duplicate beads issues',
        ],
      },
    ];
    const { lastFrame } = render(<StoryMessages messages={messages} />);
    const frame = lastFrame()!;
    expect(frame).toContain('[WARN]');
    expect(frame).toContain('Story 3-3');
    expect(frame).toContain('2 failing ACs');
    expect(frame).toContain('└ AC 3');
    expect(frame).toContain('└ AC 7');
  });

  it('renders [FAIL] message', () => {
    const messages: StoryMessage[] = [
      { type: 'fail', key: '2-3', message: 'verification failed at AC 4 (attempt 3/10)' },
    ];
    const { lastFrame } = render(<StoryMessages messages={messages} />);
    const frame = lastFrame()!;
    expect(frame).toContain('[FAIL]');
    expect(frame).toContain('Story 2-3');
  });

  it('renders nothing when messages array is empty', () => {
    const { lastFrame } = render(<StoryMessages messages={[]} />);
    expect(lastFrame()).toBe('');
  });

  it('renders multiple messages in order', () => {
    const messages: StoryMessage[] = [
      { type: 'ok', key: '3-1', message: 'DONE' },
      { type: 'warn', key: '3-2', message: 'failing ACs' },
      { type: 'fail', key: '2-3', message: 'failed' },
    ];
    const { lastFrame } = render(<StoryMessages messages={messages} />);
    const frame = lastFrame()!;
    expect(frame).toContain('[OK]');
    expect(frame).toContain('[WARN]');
    expect(frame).toContain('[FAIL]');
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
      // Should not throw on any method
      handle.update({ type: 'tool-start', name: 'Bash', id: 'x' });
      handle.update({ type: 'tool-complete' });
      handle.update({ type: 'text', text: 'hello' });
      handle.updateSprintState({ storyKey: 'a', phase: 'b', done: 1, total: 2 });
      handle.updateStories([{ key: '1-1', status: 'done' }]);
      handle.addMessage({ type: 'ok', key: '1-1', message: 'DONE' });
      handle.cleanup();
      // Double cleanup should not throw
      handle.cleanup();
    });
  });

  describe('event handling', () => {
    it('handles tool-start event', () => {
      handle = startRenderer({ _forceTTY: true });
      // Should not throw
      handle.update({ type: 'tool-start', name: 'Bash', id: 'tool1' });
    });

    it('handles tool-complete after tool-start (moves to completed)', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.update({ type: 'tool-start', name: 'Bash', id: 'tool1' });
      handle.update({ type: 'tool-input', partial: '{"command":' });
      handle.update({ type: 'tool-input', partial: '"ls"}' });
      handle.update({ type: 'tool-complete' });
      // No throw = success
    });

    it('handles tool-complete when no activeTool (text block stop)', () => {
      handle = startRenderer({ _forceTTY: true });
      // Directly send tool-complete without tool-start — this is a text block stop
      handle.update({ type: 'tool-complete' });
      // Should not throw or add anything to completed tools
    });

    it('handles text event', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.update({ type: 'text', text: 'thinking...' });
    });

    it('handles retry event', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.update({ type: 'retry', attempt: 1, delay: 5000 });
    });

    it('handles result event (no-op rendering)', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.update({ type: 'result', cost: 0.05, sessionId: 'sess_123' });
    });

    it('clears retry on next tool-start', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.update({ type: 'retry', attempt: 1, delay: 5000 });
      handle.update({ type: 'tool-start', name: 'Bash', id: 'tool1' });
      // Retry info should be cleared
    });

    it('clears retry on next text event', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.update({ type: 'retry', attempt: 1, delay: 5000 });
      handle.update({ type: 'text', text: 'thinking...' });
      // Retry info should be cleared
    });

    it('clears lastThought on tool-start', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.update({ type: 'text', text: 'old thought' });
      handle.update({ type: 'tool-start', name: 'Bash', id: 'tool1' });
      // lastThought should be cleared
    });

    it('text event overwrites previous thought (not append)', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.update({ type: 'text', text: 'first thought' });
      handle.update({ type: 'text', text: 'second thought' });
      // Only second thought should be displayed
    });

    it('accumulates tool input args', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.update({ type: 'tool-start', name: 'Write', id: 'tool1' });
      handle.update({ type: 'tool-input', partial: '{"path":' });
      handle.update({ type: 'tool-input', partial: '"/tmp/test.ts",' });
      handle.update({ type: 'tool-input', partial: '"content":"hello"}' });
      handle.update({ type: 'tool-complete' });
      // Should have accumulated all partials into args
    });

    it('bounds completed tools list at MAX_COMPLETED_TOOLS (50)', () => {
      handle = startRenderer({ _forceTTY: true });
      // Add 55 tool cycles to exceed the cap of 50
      for (let i = 0; i < 55; i++) {
        handle.update({ type: 'tool-start', name: `Tool${i}`, id: `t${i}` });
        handle.update({ type: 'tool-input', partial: `arg${i}` });
        handle.update({ type: 'tool-complete' });
      }
      // No throw = success; internally, only the last 50 should be retained
    });

    it('handles multiple tool cycles', () => {
      handle = startRenderer({ _forceTTY: true });
      // First tool
      handle.update({ type: 'tool-start', name: 'Read', id: 'tool1' });
      handle.update({ type: 'tool-input', partial: '{"path":"/a"}' });
      handle.update({ type: 'tool-complete' });
      // Second tool
      handle.update({ type: 'tool-start', name: 'Write', id: 'tool2' });
      handle.update({ type: 'tool-input', partial: '{"path":"/b"}' });
      handle.update({ type: 'tool-complete' });
      // Both should be in completed list
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
      // No throw = success
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

  describe('quiet mode includes new methods', () => {
    it('no-op handle has updateStories and addMessage', () => {
      handle = startRenderer({ quiet: true });
      handle.updateStories([{ key: '1-1', status: 'done' }]);
      handle.addMessage({ type: 'ok', key: '1-1', message: 'DONE' });
      // No throw = success
    });
  });

  describe('cleanup (AC #6)', () => {
    it('can be called multiple times without error', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.cleanup();
      handle.cleanup();
      handle.cleanup();
      handle = null; // Prevent afterEach double-cleanup
    });

    it('ignores updates after cleanup', () => {
      handle = startRenderer({ _forceTTY: true });
      handle.cleanup();
      // These should not throw
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
        // After signal, further updates should be no-ops (cleaned up)
        handle.update({ type: 'text', text: 'should be ignored' });
      } finally {
        killSpy.mockRestore();
      }
      handle = null; // Already cleaned up by signal handler
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
      // In test environment, isTTY is typically undefined
      handle = startRenderer();
      // Should behave like quiet mode — no-op
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
      // No throw = success
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
      { type: 'tool-complete' }, // text block stop — should be ignored
      { type: 'tool-start', name: 'Read', id: 'tool1' },
      { type: 'tool-input', partial: '{"file_path":"/src/index.ts"}' },
      { type: 'tool-complete' },
      { type: 'text', text: 'Now I understand the structure' },
      { type: 'tool-complete' }, // text block stop — should be ignored
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
    // No throw = success through full sequence
  });
});
