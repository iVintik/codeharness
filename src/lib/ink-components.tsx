/**
 * Ink UI components for the terminal activity display.
 *
 * Each component renders one visual element of the Claude activity dashboard.
 * These are consumed by the root <App> component in ink-renderer.tsx.
 */

import React from 'react';
import { Text, Box } from 'ink';
import { Spinner } from '@inkjs/ui';

// --- Types ---

export interface SprintInfo {
  storyKey: string;
  phase: string;
  done: number;
  total: number;
  elapsed?: string; // formatted elapsed time, e.g. "47m" or "2h14m"
}

export interface CompletedToolEntry {
  name: string;
  args: string;
}

export type StoryStatusValue = 'done' | 'in-progress' | 'pending' | 'failed' | 'blocked';

export interface StoryStatusEntry {
  key: string;
  status: StoryStatusValue;
}

export interface RetryInfo {
  attempt: number;
  delay: number;
}

export interface StoryMessage {
  type: 'ok' | 'warn' | 'fail';
  key: string;
  message: string;
  details?: string[];
}

export interface RendererState {
  sprintInfo: SprintInfo | null;
  stories: StoryStatusEntry[];
  messages: StoryMessage[];
  completedTools: CompletedToolEntry[];
  activeTool: { name: string } | null;
  activeToolArgs: string;
  lastThought: string | null;
  retryInfo: RetryInfo | null;
}

// --- Components ---

export function Header({ info }: { info: SprintInfo | null }) {
  if (!info) return null;
  return (
    <Text>
      {'◆ '}
      {info.storyKey}
      {' — '}
      {info.phase}
      {info.elapsed ? ` | ${info.elapsed}` : ''}
      {' | Sprint: '}
      {info.done}
      {'/'}
      {info.total}
    </Text>
  );
}

export function CompletedTool({ entry }: { entry: CompletedToolEntry }) {
  const argsSummary = entry.args.length > 60
    ? entry.args.slice(0, 60) + '...'
    : entry.args;
  return (
    <Text>
      {'✓ ['}
      {entry.name}
      {'] '}
      {argsSummary}
    </Text>
  );
}

export function CompletedTools({ tools }: { tools: CompletedToolEntry[] }) {
  return (
    <Box flexDirection="column">
      {tools.map((entry, i) => (
        <CompletedTool key={i} entry={entry} />
      ))}
    </Box>
  );
}

export function ActiveTool({ name }: { name: string }) {
  return (
    <Box>
      <Text>{'⚡ ['}{name}{'] '}</Text>
      <Spinner label="" />
    </Box>
  );
}

export function LastThought({ text }: { text: string }) {
  const maxWidth = (process.stdout.columns || 80) - 4;
  const truncated = truncateToWidth(text, maxWidth);
  return (
    <Text>
      {'💭 '}
      {truncated}
    </Text>
  );
}

/**
 * Truncate a string to fit within a given terminal column width.
 * Iterates by codepoint (not UTF-16 index) to avoid splitting surrogate pairs.
 * Treats characters outside the Basic Latin range as 2 columns wide (CJK, emoji).
 */
function truncateToWidth(text: string, maxWidth: number): string {
  let width = 0;
  let result = '';
  for (const char of text) {
    const cp = char.codePointAt(0)!;
    // Rough heuristic: ASCII printable = 1 col, everything else = 2 cols
    const charWidth = cp <= 0x7e ? 1 : 2;
    if (width + charWidth > maxWidth) {
      return result;
    }
    width += charWidth;
    result += char;
  }
  return result;
}

const STATUS_SYMBOLS: Record<StoryStatusValue, string> = {
  'done': '✓',
  'in-progress': '◆',
  'pending': '○',
  'failed': '✗',
  'blocked': '✕',
};

export function StoryBreakdown({ stories }: { stories: StoryStatusEntry[] }) {
  if (stories.length === 0) return null;

  const groups: Partial<Record<StoryStatusValue, string[]>> = {};
  for (const s of stories) {
    if (!groups[s.status]) groups[s.status] = [];
    groups[s.status]!.push(s.key);
  }

  const fmt = (keys: string[], status: StoryStatusValue) =>
    keys.map(k => `${k} ${STATUS_SYMBOLS[status]}`).join('  ');

  const parts: string[] = [];
  if (groups['done']?.length) {
    parts.push(`Done: ${fmt(groups['done'], 'done')}`);
  }
  if (groups['in-progress']?.length) {
    parts.push(`This: ${fmt(groups['in-progress'], 'in-progress')}`);
  }
  if (groups['pending']?.length) {
    parts.push(`Next: ${fmt(groups['pending'], 'pending')}`);
  }
  if (groups['failed']?.length) {
    parts.push(`Failed: ${fmt(groups['failed'], 'failed')}`);
  }
  if (groups['blocked']?.length) {
    parts.push(`Blocked: ${fmt(groups['blocked'], 'blocked')}`);
  }

  return <Text>{parts.join(' | ')}</Text>;
}

const MESSAGE_PREFIX: Record<StoryMessage['type'], string> = {
  ok: '[OK]',
  warn: '[WARN]',
  fail: '[FAIL]',
};

export function StoryMessages({ messages }: { messages: StoryMessage[] }) {
  if (messages.length === 0) return null;
  return (
    <Box flexDirection="column">
      {messages.map((msg, i) => (
        <Box key={i} flexDirection="column">
          <Text>{`${MESSAGE_PREFIX[msg.type]} Story ${msg.key}: ${msg.message}`}</Text>
          {msg.details?.map((d, j) => (
            <Text key={j}>{`  └ ${d}`}</Text>
          ))}
        </Box>
      ))}
    </Box>
  );
}

export function RetryNotice({ info }: { info: RetryInfo }) {
  return (
    <Text>
      {'⏳ API retry '}
      {info.attempt}
      {' (waiting '}
      {info.delay}
      {'ms)'}
    </Text>
  );
}

export function App({
  state,
}: {
  state: RendererState;
}) {
  return (
    <Box flexDirection="column">
      <Header info={state.sprintInfo} />
      <StoryBreakdown stories={state.stories} />
      <StoryMessages messages={state.messages} />
      <CompletedTools tools={state.completedTools} />
      {state.activeTool && <ActiveTool name={state.activeTool.name} />}
      {state.lastThought && <LastThought text={state.lastThought} />}
      {state.retryInfo && <RetryNotice info={state.retryInfo} />}
    </Box>
  );
}
