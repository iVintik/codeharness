/**
 * Ink UI components — activity display (tools, thoughts, retry, messages).
 *
 * Split from ink-components.tsx to comply with NFR9 (max 300 lines per file).
 * Types are defined in ink-components.tsx and imported here.
 */

import React from 'react';
import { Text, Box } from 'ink';
import { Spinner } from '@inkjs/ui';
import type { CompletedToolEntry, RetryInfo, StoryMessage } from './ink-components.js';

// --- Message Styles ---

const MESSAGE_STYLE: Record<StoryMessage['type'], { prefix: string; color: string }> = {
  ok: { prefix: '[OK]', color: 'green' },
  warn: { prefix: '[WARN]', color: 'yellow' },
  fail: { prefix: '[FAIL]', color: 'red' },
};

// --- Components ---

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
      {entry.driver && <Text dimColor>{` (${entry.driver})`}</Text>}
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

export function ActiveTool({ name, driverName }: { name: string; driverName?: string | null }) {
  return (
    <Box>
      <Text color="yellow">{'⚡ '}</Text>
      <Text dimColor>{'['}</Text>
      <Text bold>{name}</Text>
      <Text dimColor>{'] '}</Text>
      {driverName && <Text dimColor>{`(${driverName}) `}</Text>}
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

export function DriverCostSummary({ driverCosts }: { driverCosts: Record<string, number> }) {
  if (!driverCosts) return null;
  const entries = Object.entries(driverCosts).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return null;
  const parts = entries.map(([driver, cost]) => `${driver} $${cost.toFixed(2)}`).join(', ');
  return <Text dimColor>{`Cost: ${parts}`}</Text>;
}
