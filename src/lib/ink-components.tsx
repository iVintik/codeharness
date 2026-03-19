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
}

export interface CompletedToolEntry {
  name: string;
  args: string;
}

export interface RetryInfo {
  attempt: number;
  delay: number;
}

export interface RendererState {
  sprintInfo: SprintInfo | null;
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
      <CompletedTools tools={state.completedTools} />
      {state.activeTool && <ActiveTool name={state.activeTool.name} />}
      {state.lastThought && <LastThought text={state.lastThought} />}
      {state.retryInfo && <RetryNotice info={state.retryInfo} />}
    </Box>
  );
}
