/**
 * Ink UI components for the terminal activity dashboard.
 *
 * Uses Ink's Box/flexbox layout with borders for a panel-based dashboard.
 * Static component is used for permanent messages (story completions).
 */

import React from 'react';
import { Text, Box, Static } from 'ink';
import { Spinner } from '@inkjs/ui';

// --- Types ---

export interface SprintInfo {
  storyKey: string;
  phase: string;
  done: number;
  total: number;
  elapsed?: string;
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
  const pct = info.total > 0 ? Math.round((info.done / info.total) * 100) : 0;
  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">{'◆ '}</Text>
      <Text bold>{info.storyKey || '(waiting)'}</Text>
      <Text dimColor>{' — '}</Text>
      <Text color="yellow">{info.phase || '...'}</Text>
      {info.elapsed && <Text dimColor>{` │ ${info.elapsed}`}</Text>}
      <Text dimColor>{' │ Sprint: '}</Text>
      <Text bold color="green">{info.done}</Text>
      <Text dimColor>{'/'}</Text>
      <Text>{String(info.total)}</Text>
      <Text dimColor>{` (${pct}%)`}</Text>
    </Box>
  );
}

const STATUS_SYMBOLS: Record<StoryStatusValue, string> = {
  'done': '✓',
  'in-progress': '◆',
  'pending': '○',
  'failed': '✗',
  'blocked': '✕',
};

const STATUS_COLORS: Record<StoryStatusValue, string> = {
  'done': 'green',
  'in-progress': 'cyan',
  'pending': 'gray',
  'failed': 'red',
  'blocked': 'yellow',
};

function shortKey(key: string): string {
  const m = key.match(/^(\d+-\d+)/);
  return m ? m[1] : key;
}

export function StoryBreakdown({ stories }: { stories: StoryStatusEntry[] }) {
  if (stories.length === 0) return null;

  const groups: Partial<Record<StoryStatusValue, string[]>> = {};
  for (const s of stories) {
    if (!groups[s.status]) groups[s.status] = [];
    groups[s.status]!.push(s.key);
  }

  return (
    <Box paddingX={1} gap={2}>
      {groups['done']?.length && (
        <Text>
          <Text color="green">{groups['done'].length} ✓</Text>
          <Text dimColor> done</Text>
        </Text>
      )}
      {groups['in-progress']?.map(k => (
        <Text key={k}>
          <Text color="cyan">◆ </Text>
          <Text bold>{k}</Text>
        </Text>
      ))}
      {groups['pending']?.length && (
        <Text>
          <Text dimColor>next: </Text>
          <Text>{groups['pending'].slice(0, 3).map(k => shortKey(k)).join(' ')}</Text>
          {groups['pending'].length > 3 && <Text dimColor>{` +${groups['pending'].length - 3}`}</Text>}
        </Text>
      )}
      {groups['failed']?.map(k => (
        <Text key={k}><Text color="red">✗ {shortKey(k)}</Text></Text>
      ))}
      {groups['blocked']?.map(k => (
        <Text key={k}><Text color="yellow">✕ {shortKey(k)}</Text></Text>
      ))}
    </Box>
  );
}

const MESSAGE_STYLE: Record<StoryMessage['type'], { prefix: string; color: string }> = {
  ok: { prefix: '[OK]', color: 'green' },
  warn: { prefix: '[WARN]', color: 'yellow' },
  fail: { prefix: '[FAIL]', color: 'red' },
};

export function StoryMessageLine({ msg }: { msg: StoryMessage }) {
  const style = MESSAGE_STYLE[msg.type];
  return (
    <Box flexDirection="column">
      <Text>
        <Text color={style.color} bold>{style.prefix}</Text>
        <Text>{` Story ${msg.key}: ${msg.message}`}</Text>
      </Text>
      {msg.details?.map((d, j) => (
        <Text key={j} dimColor>{`  └ ${d}`}</Text>
      ))}
    </Box>
  );
}

export function CompletedTool({ entry }: { entry: CompletedToolEntry }) {
  const argsSummary = entry.args.length > 60
    ? entry.args.slice(0, 60) + '…'
    : entry.args;
  return (
    <Text wrap="truncate-end">
      <Text color="green">{'✓ '}</Text>
      <Text dimColor>{'['}</Text>
      <Text>{entry.name}</Text>
      <Text dimColor>{'] '}</Text>
      <Text dimColor>{argsSummary}</Text>
    </Text>
  );
}

/** Show only the last N completed tools to keep output compact. */
const VISIBLE_COMPLETED_TOOLS = 5;

export function CompletedTools({ tools }: { tools: CompletedToolEntry[] }) {
  const visible = tools.slice(-VISIBLE_COMPLETED_TOOLS);
  const hidden = tools.length - visible.length;
  return (
    <Box flexDirection="column">
      {hidden > 0 && <Text dimColor>{`  … ${hidden} earlier tools`}</Text>}
      {visible.map((entry, i) => (
        <CompletedTool key={i} entry={entry} />
      ))}
    </Box>
  );
}

export function ActiveTool({ name }: { name: string }) {
  return (
    <Box>
      <Text color="yellow">{'⚡ '}</Text>
      <Text dimColor>{'['}</Text>
      <Text bold>{name}</Text>
      <Text dimColor>{'] '}</Text>
      <Spinner label="" />
    </Box>
  );
}

export function LastThought({ text }: { text: string }) {
  return (
    <Text wrap="truncate-end">
      <Text>{'💭 '}</Text>
      <Text dimColor>{text}</Text>
    </Text>
  );
}

export function RetryNotice({ info }: { info: RetryInfo }) {
  return (
    <Text color="yellow">
      {'⏳ API retry '}
      {info.attempt}
      {' (waiting '}
      {info.delay}
      {'ms)'}
    </Text>
  );
}

// --- Root App ---

export function App({
  state,
}: {
  state: RendererState;
}) {
  return (
    <Box flexDirection="column">
      {/* Permanent messages — rendered once via Static, scroll up */}
      <Static items={state.messages}>
        {(msg, i) => (
          <StoryMessageLine key={i} msg={msg} />
        )}
      </Static>

      {/* Dynamic section — re-renders on every state change */}
      <Header info={state.sprintInfo} />
      <StoryBreakdown stories={state.stories} />
      <Box flexDirection="column" paddingLeft={1}>
        <CompletedTools tools={state.completedTools} />
        {state.activeTool && <ActiveTool name={state.activeTool.name} />}
        {state.lastThought && <LastThought text={state.lastThought} />}
        {state.retryInfo && <RetryNotice info={state.retryInfo} />}
      </Box>
    </Box>
  );
}
