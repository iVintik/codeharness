/**
 * E2E Integration Test — Stream-JSON Pipeline
 *
 * Story 6-2: Verify Stream-JSON Pipeline End-to-End
 *
 * Tests the full data flow: NDJSON lines → createLineProcessor (line splitting) →
 * parseStreamLine (event parsing) → renderer update (state accumulation).
 *
 * Uses a recorded NDJSON fixture (tests/fixtures/sample-stream.ndjson) that
 * represents a realistic Claude stream-json session.
 *
 * IMPORTANT: This test imports createLineProcessor from run-helpers.ts — the
 * same function used in production (run.ts). No hand-rolled copies.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { parseStreamLine } from '../lib/stream-parser.js';
import type { StreamEvent } from '../lib/stream-parser.js';
import { createLineProcessor } from '../lib/run-helpers.js';
import type { StoryMessage } from '../lib/ink-components.js';

// --- Resolve fixture path (project root / tests / fixtures) ---

function projectRoot(): string {
  // src/__tests__/run-pipeline.test.ts → up two levels to project root
  return join(dirname(new URL(import.meta.url).pathname), '..', '..');
}

function readFixture(name: string): string {
  return readFileSync(join(projectRoot(), 'tests', 'fixtures', name), 'utf-8');
}

// --- Collected state for test assertions ---

interface CollectedState {
  events: StreamEvent[];
  messages: StoryMessage[];
  iterationCount: number;
}

function makeTestProcessor(
  state: CollectedState,
  opts?: { parseRalph?: boolean },
): (data: Buffer) => void {
  return createLineProcessor(
    {
      onEvent: (event) => state.events.push(event),
      onMessage: (msg) => state.messages.push(msg),
      onIteration: (iteration) => { state.iterationCount = iteration; },
    },
    opts,
  );
}

// --- AC1: Full pipeline integration test with recorded NDJSON fixture ---

describe('AC1: Full pipeline — fixture through createLineProcessor → parseStreamLine → renderer', () => {
  let state: CollectedState;

  beforeEach(() => {
    state = { events: [], messages: [], iterationCount: 0 };
  });

  it('pipes the full sample-stream.ndjson fixture through the pipeline', () => {
    const fixture = readFixture('sample-stream.ndjson');
    const handler = makeTestProcessor(state);

    // Feed the fixture as a single Buffer (simulates reading from stdout)
    handler(Buffer.from(fixture));
    // Flush any remaining partial line
    handler(Buffer.from('\n'));

    // Verify events were collected
    expect(state.events.length).toBeGreaterThan(0);

    // The fixture contains: text, tool-start (Read), tool-input, tool-complete,
    // tool-start (Bash), tool-input, tool-complete, text, result
    const types = state.events.map(e => e.type);
    expect(types).toContain('text');
    expect(types).toContain('tool-start');
    expect(types).toContain('tool-input');
    expect(types).toContain('tool-complete');
    expect(types).toContain('result');
  });

  it('handles chunk boundaries — fixture split across multiple Buffers', () => {
    const fixture = readFixture('sample-stream.ndjson');
    const handler = makeTestProcessor(state);

    // Split into chunks of varying sizes to test partial-line buffering
    const chunkSizes = [17, 43, 7, 101, 29, 3, 200];
    let offset = 0;
    let sizeIndex = 0;
    while (offset < fixture.length) {
      const size = chunkSizes[sizeIndex % chunkSizes.length];
      const chunk = fixture.slice(offset, offset + size);
      handler(Buffer.from(chunk));
      offset += size;
      sizeIndex++;
    }
    // Flush trailing partial
    handler(Buffer.from('\n'));

    // Must produce the same events regardless of chunk boundaries
    const singleChunkState: CollectedState = { events: [], messages: [], iterationCount: 0 };
    const singleHandler = makeTestProcessor(singleChunkState);
    singleHandler(Buffer.from(fixture));
    singleHandler(Buffer.from('\n'));

    expect(state.events).toEqual(singleChunkState.events);
  });
});

// --- AC2: Events reach renderer in correct order ---

describe('AC2: Event ordering — tool-start, tool-input, tool-complete, text arrive in order', () => {
  it('events arrive in the correct sequence from the fixture', () => {
    const state: CollectedState = { events: [], messages: [], iterationCount: 0 };
    const handler = makeTestProcessor(state);
    const fixture = readFixture('sample-stream.ndjson');
    handler(Buffer.from(fixture));
    handler(Buffer.from('\n'));

    const types = state.events.map(e => e.type);

    // Expected order from the fixture:
    // 1. text ("I'll start by reading...")
    // 2. tool-complete (text block stop — index 0)
    // 3. tool-start (Read, index 1)
    // 4. tool-input (Read args)
    // 5. tool-complete (Read block stop)
    // 6. tool-start (Bash, index 2)
    // 7. tool-input (Bash args)
    // 8. tool-complete (Bash block stop)
    // 9. text ("All tests pass...")
    // 10. tool-complete (text block stop — index 3)
    // 11. result

    expect(types[0]).toBe('text');
    expect(types[1]).toBe('tool-complete'); // text block stop

    // Find the Read tool-start
    const readStartIdx = types.indexOf('tool-start');
    expect(readStartIdx).toBeGreaterThan(0);
    expect((state.events[readStartIdx] as { name: string }).name).toBe('Read');

    // tool-input(s) must follow tool-start (Read has 2 input deltas)
    expect(types[readStartIdx + 1]).toBe('tool-input');
    expect(types[readStartIdx + 2]).toBe('tool-input');
    // tool-complete must follow tool-inputs
    expect(types[readStartIdx + 3]).toBe('tool-complete');

    // Bash tool-start comes after Read tool-complete
    const bashStartIdx = types.indexOf('tool-start', readStartIdx + 1);
    expect(bashStartIdx).toBeGreaterThan(readStartIdx + 3);
    expect((state.events[bashStartIdx] as { name: string }).name).toBe('Bash');
    expect(types[bashStartIdx + 1]).toBe('tool-input');
    expect(types[bashStartIdx + 2]).toBe('tool-complete');

    // Second text event comes after Bash tool-complete
    const secondTextIdx = types.indexOf('text', bashStartIdx);
    expect(secondTextIdx).toBeGreaterThan(bashStartIdx + 2);

    // Result is the last event
    expect(types[types.length - 1]).toBe('result');
  });

  it('tool-start events contain correct tool names and IDs', () => {
    const state: CollectedState = { events: [], messages: [], iterationCount: 0 };
    const handler = makeTestProcessor(state);
    handler(Buffer.from(readFixture('sample-stream.ndjson')));
    handler(Buffer.from('\n'));

    const toolStarts = state.events.filter(e => e.type === 'tool-start') as Array<{
      type: 'tool-start'; name: string; id: string;
    }>;
    expect(toolStarts).toHaveLength(2);
    expect(toolStarts[0]).toEqual({ type: 'tool-start', name: 'Read', id: 'toolu_read_001' });
    expect(toolStarts[1]).toEqual({ type: 'tool-start', name: 'Bash', id: 'toolu_bash_002' });
  });

  it('tool-input events contain correct partial JSON', () => {
    const state: CollectedState = { events: [], messages: [], iterationCount: 0 };
    const handler = makeTestProcessor(state);
    handler(Buffer.from(readFixture('sample-stream.ndjson')));
    handler(Buffer.from('\n'));

    const toolInputs = state.events.filter(e => e.type === 'tool-input') as Array<{
      type: 'tool-input'; partial: string;
    }>;
    expect(toolInputs.length).toBeGreaterThanOrEqual(2);

    // Read tool input — split across two deltas
    expect(toolInputs[0].partial).toBe('{"file_path"');
    expect(toolInputs[1].partial).toBe(':"/src/index.ts"}');

    // Bash tool input — single delta
    expect(toolInputs[2].partial).toBe('{"command":"npm test"}');
  });

  it('text events contain correct text content', () => {
    const state: CollectedState = { events: [], messages: [], iterationCount: 0 };
    const handler = makeTestProcessor(state);
    handler(Buffer.from(readFixture('sample-stream.ndjson')));
    handler(Buffer.from('\n'));

    const textEvents = state.events.filter(e => e.type === 'text') as Array<{
      type: 'text'; text: string;
    }>;
    expect(textEvents.length).toBeGreaterThanOrEqual(2);
    expect(textEvents[0].text).toBe("I'll start by reading the project files.");
    expect(textEvents[1].text).toBe('All tests pass. The implementation is complete.');
  });

  it('result event contains cost and session ID', () => {
    const state: CollectedState = { events: [], messages: [], iterationCount: 0 };
    const handler = makeTestProcessor(state);
    handler(Buffer.from(readFixture('sample-stream.ndjson')));
    handler(Buffer.from('\n'));

    const results = state.events.filter(e => e.type === 'result') as Array<{
      type: 'result'; cost: number; sessionId: string;
    }>;
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ type: 'result', cost: 0.42, sessionId: 'sess_e2e_test' });
  });
});

// --- AC3: Silently ignored event types ---

describe('AC3: Silently ignored events — thinking_delta, hook_started, hook_response, init', () => {
  it('thinking_delta events produce null (not errors)', () => {
    const thinkingLine = JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'Let me analyze the codebase structure first.' },
      },
    });
    expect(parseStreamLine(thinkingLine)).toBeNull();
  });

  it('hook_started events produce null', () => {
    const hookStarted = JSON.stringify({
      type: 'system',
      subtype: 'hook_started',
      hook: 'pre-tool-use',
      tool: 'Bash',
    });
    expect(parseStreamLine(hookStarted)).toBeNull();
  });

  it('hook_response events produce null', () => {
    const hookResponse = JSON.stringify({
      type: 'system',
      subtype: 'hook_response',
      hook: 'pre-tool-use',
      approved: true,
    });
    expect(parseStreamLine(hookResponse)).toBeNull();
  });

  it('init events produce null', () => {
    const initLine = JSON.stringify({
      type: 'system',
      subtype: 'init',
      session_id: 'sess_abc',
      tools: ['Bash', 'Read'],
    });
    expect(parseStreamLine(initLine)).toBeNull();
  });

  it('message_start, message_stop, message_delta produce null', () => {
    expect(parseStreamLine(JSON.stringify({
      type: 'stream_event',
      event: { type: 'message_start', message: { id: 'msg_001' } },
    }))).toBeNull();

    expect(parseStreamLine(JSON.stringify({
      type: 'stream_event',
      event: { type: 'message_stop' },
    }))).toBeNull();

    expect(parseStreamLine(JSON.stringify({
      type: 'stream_event',
      event: { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
    }))).toBeNull();
  });

  it('the full fixture produces zero errors despite containing ignored events', () => {
    const state: CollectedState = { events: [], messages: [], iterationCount: 0 };
    const handler = makeTestProcessor(state);
    handler(Buffer.from(readFixture('sample-stream.ndjson')));
    handler(Buffer.from('\n'));

    // The fixture has 21 lines. Only some produce events.
    // Ignored lines: init, message_start, content_block_start(text), thinking_delta,
    // hook_started, hook_response, message_delta, message_stop
    // All should be silently ignored — no throws, no error events.
    const eventTypes = new Set(state.events.map(e => e.type));
    expect(eventTypes).not.toContain('error');

    // Count: the fixture should produce exactly these event types
    expect(eventTypes).toEqual(new Set(['text', 'tool-start', 'tool-input', 'tool-complete', 'result']));
  });
});

// --- AC4: Ralph stderr messages parsed into StoryMessage objects ---

describe('AC4: Ralph stderr — [SUCCESS], [WARN], [LOOP] parsed into StoryMessage objects', () => {
  it('[SUCCESS] Story key: DONE is parsed into an OK message', () => {
    const line = '[2026-03-16 10:23:42] [SUCCESS] Story 3-2-stream-parser: DONE — 12/12 ACs verified (18m, $4.20)';
    const state: CollectedState = { events: [], messages: [], iterationCount: 0 };
    const handler = makeTestProcessor(state, { parseRalph: true });
    handler(Buffer.from(line + '\n'));

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].type).toBe('ok');
    expect(state.messages[0].key).toBe('3-2-stream-parser');
    expect(state.messages[0].message).toContain('DONE');
  });

  it('[WARN] Story key exceeded retry limit is parsed into a FAIL message', () => {
    const line = '[2026-03-16 11:00:00] [WARN] Story 4-1-broken-feature exceeded retry limit';
    const state: CollectedState = { events: [], messages: [], iterationCount: 0 };
    const handler = makeTestProcessor(state, { parseRalph: true });
    handler(Buffer.from(line + '\n'));

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].type).toBe('fail');
    expect(state.messages[0].key).toBe('4-1-broken-feature');
    expect(state.messages[0].message).toContain('exceeded retry limit');
  });

  it('[WARN] Story key retry N/M is parsed into a WARN message', () => {
    const line = '[2026-03-16 11:00:00] [WARN] Story 4-1-broken — retry 3/10';
    const state: CollectedState = { events: [], messages: [], iterationCount: 0 };
    const handler = makeTestProcessor(state, { parseRalph: true });
    handler(Buffer.from(line + '\n'));

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].type).toBe('warn');
    expect(state.messages[0].key).toBe('4-1-broken');
    expect(state.messages[0].message).toBe('retry 3/10');
  });

  it('[LOOP] iteration N is parsed into an iteration count', () => {
    const line = '[2026-03-16 11:00:00] [LOOP] iteration 7';
    const state: CollectedState = { events: [], messages: [], iterationCount: 0 };
    const handler = makeTestProcessor(state, { parseRalph: true });
    handler(Buffer.from(line + '\n'));

    expect(state.iterationCount).toBe(7);
    expect(state.messages).toHaveLength(0); // LOOP is not a StoryMessage
  });

  it('ralph messages with ANSI color codes are cleaned before parsing', () => {
    const line = '\x1b[32m[2026-03-16 10:23:42] [SUCCESS] Story 3-2-parser: DONE\x1b[0m';
    const state: CollectedState = { events: [], messages: [], iterationCount: 0 };
    const handler = makeTestProcessor(state, { parseRalph: true });
    handler(Buffer.from(line + '\n'));

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].type).toBe('ok');
    expect(state.messages[0].key).toBe('3-2-parser');
  });

  it('non-ralph lines produce no messages', () => {
    const line = 'Just some random output that is not a ralph message';
    const state: CollectedState = { events: [], messages: [], iterationCount: 0 };
    const handler = makeTestProcessor(state, { parseRalph: true });
    handler(Buffer.from(line + '\n'));

    expect(state.messages).toHaveLength(0);
  });

  it('stderr handler parses both NDJSON events AND ralph messages', () => {
    // Stderr can contain both NDJSON (from tee) and ralph's own log lines
    const ndjsonLine = JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_stop' },
    });
    const ralphLine = '[2026-03-16 10:23:42] [SUCCESS] Story 5-1-feature: DONE';
    const combined = ndjsonLine + '\n' + ralphLine + '\n';

    const state: CollectedState = { events: [], messages: [], iterationCount: 0 };
    const handler = makeTestProcessor(state, { parseRalph: true });
    handler(Buffer.from(combined));

    // NDJSON line produces a stream event
    expect(state.events).toHaveLength(1);
    expect(state.events[0].type).toBe('tool-complete');

    // Ralph line produces a story message
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].key).toBe('5-1-feature');
  });
});

// --- Renderer state accumulation integration ---

describe('Renderer state accumulation — full pipeline to RendererHandle-compatible state', () => {
  it('accumulates state matching what RendererHandle.update() would produce', () => {
    const state: CollectedState = { events: [], messages: [], iterationCount: 0 };
    const handler = makeTestProcessor(state);
    handler(Buffer.from(readFixture('sample-stream.ndjson')));
    handler(Buffer.from('\n'));

    // Simulate what the renderer does: walk events and build renderer state
    let activeTool: { name: string } | null = null;
    let activeToolArgs = '';
    const completedTools: Array<{ name: string; args: string }> = [];
    let lastThought: string | null = null;

    for (const event of state.events) {
      switch (event.type) {
        case 'tool-start':
          activeTool = { name: event.name };
          activeToolArgs = '';
          lastThought = null;
          break;
        case 'tool-input':
          activeToolArgs += event.partial;
          break;
        case 'tool-complete':
          if (activeTool) {
            completedTools.push({ name: activeTool.name, args: activeToolArgs });
            activeTool = null;
            activeToolArgs = '';
          }
          break;
        case 'text':
          lastThought = event.text;
          break;
      }
    }

    // Verify accumulated state
    expect(completedTools).toHaveLength(2);
    expect(completedTools[0]).toEqual({ name: 'Read', args: '{"file_path":"/src/index.ts"}' });
    expect(completedTools[1]).toEqual({ name: 'Bash', args: '{"command":"npm test"}' });
    expect(activeTool).toBeNull(); // All tools completed
    expect(lastThought).toBe('All tests pass. The implementation is complete.');
  });
});
