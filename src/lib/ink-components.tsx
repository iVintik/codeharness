/**
 * Ink UI components — types and layout components (Header, Separator, StoryBreakdown).
 *
 * Renders a UX-spec-compliant live display with plain text header,
 * ━━━ separators, and labeled story breakdown sections.
 * Activity components (tools, thoughts, retry) are in ink-activity-components.tsx.
 * The App root component is in ink-app.tsx to avoid circular imports.
 */

import React from 'react';
import { Text, Box } from 'ink';
import type { FlowStep } from './workflow-parser.js';

// --- Types ---

export interface SprintInfo {
  storyKey: string;
  phase: string;
  done: number;
  total: number;
  elapsed?: string;
  iterationCount?: number;
  totalCost?: number;
  acProgress?: string;
  currentCommand?: string;
  /** Epic context. */
  epicId?: string;
  epicTitle?: string;
  epicStoriesDone?: number;
  epicStoriesTotal?: number;
  /** Number of active lanes (multi-lane mode). */
  laneCount?: number;
  /** Total cost across all lanes (multi-lane mode). */
  laneTotalCost?: number;
}

export interface StoryContextEntry {
  key: string;
  role: 'prev' | 'current' | 'next';
  task?: string;
}

export interface CompletedToolEntry {
  name: string;
  args: string;
  driver?: string;
  /** When true, this entry is a text/thought line, not a tool. */
  isText?: boolean;
}

export type StoryStatusValue = 'done' | 'in-progress' | 'pending' | 'failed' | 'blocked';

export interface StoryStatusEntry {
  key: string;
  status: StoryStatusValue;
  retryCount?: number;
  maxRetries?: number;
  costByDriver?: Record<string, number>;
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

export type TaskNodeState = 'pending' | 'active' | 'done' | 'failed';

export interface TaskNodeMeta {
  driver?: string;
  costUsd?: number | null;
  elapsedMs?: number | null;
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
  workflowFlow: FlowStep[];
  currentTaskName: string | null;
  taskStates: Record<string, TaskNodeState>;
  taskMeta: Record<string, TaskNodeMeta>;
  activeDriverName: string | null;
  driverCosts: Record<string, number>;
  storyContext: StoryContextEntry[];
  /** Multi-lane data for parallel execution TUI. */
  lanes?: import('./ink-lane-container.js').LaneData[];
  /** Summary bar data for multi-lane sprint overview. */
  summaryBar?: import('./ink-summary-bar.js').SummaryBarProps;
  /** Merge status data for detailed merge progress display. */
  mergeState?: import('./ink-merge-status.js').MergeState | null;
  /** ID of the lane whose activity is currently displayed (multi-lane mode). */
  activeLaneId?: string | null;
  /** Total number of active lanes (for lane indicator display). */
  laneCount?: number;
}

// --- Layout Components ---

/** Full-width separator using ━ characters. */
export function Separator() {
  const width = process.stdout.columns || 60;
  return <Text>{'━'.repeat(width)}</Text>;
}

function shortKey(key: string): string {
  const m = key.match(/^(\d+-\d+)/);
  return m ? m[1] : key;
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

export function Header({ info, laneCount }: { info: SprintInfo | null; laneCount?: number }) {
  if (!info) return null;

  const parts: string[] = ['codeharness run'];
  if (laneCount != null && laneCount > 1) parts.push(`${laneCount} lanes`);
  if (info.elapsed) parts.push(`${info.elapsed} elapsed`);
  const displayCost = (laneCount != null && laneCount > 1 && info.laneTotalCost != null)
    ? info.laneTotalCost : info.totalCost;
  if (displayCost != null) parts.push(`${formatCost(displayCost)} spent`);

  const left = parts.join(' | ');
  const right = '[q to quit]';
  const width = process.stdout.columns || 80;
  const pad = Math.max(0, width - left.length - right.length);

  return <Text>{left}{' '.repeat(pad)}<Text dimColor>{right}</Text></Text>;
}

/** Progress bar with verified (green) and in-progress (yellow) segments. */
export function ProgressBar({ done, total, inProgress }: { done: number; total: number; inProgress?: number }) {
  const width = Math.max(10, (process.stdout.columns || 80) - 40);
  const ip = inProgress ?? 0;
  const donePct = total > 0 ? done / total : 0;
  const ipPct = total > 0 ? ip / total : 0;
  const doneFilled = Math.round(width * donePct);
  const ipFilled = Math.round(width * ipPct);
  const empty = Math.max(0, width - doneFilled - ipFilled);
  const pctStr = total > 0 ? `${Math.round((done + ip) * 100 / total)}%` : '0%';
  const label = ip > 0 ? `${done} verified + ${ip} in progress / ${total} (${pctStr})` : `${done}/${total} stories (${pctStr})`;
  return (
    <Text>
      {'Progress: '}
      <Text color="green">{'\u2588'.repeat(doneFilled)}</Text>
      <Text color="yellow">{'\u2588'.repeat(ipFilled)}</Text>
      <Text>{'\u2591'.repeat(empty)}</Text>
      {` ${label}`}
    </Text>
  );
}

/** Epic context: name and progress within current epic. */
export function EpicInfo({ info, stories }: { info: SprintInfo | null; stories?: Array<{ key: string; status: string }> }) {
  if (!info?.epicId) return null;
  const title = info.epicTitle ?? `Epic ${info.epicId}`;
  // Count in-progress stories for this epic from the stories array
  const epicPrefix = `${info.epicId}-`;
  const epicStories = stories?.filter(s => s.key.startsWith(epicPrefix)) ?? [];
  const ipCount = epicStories.filter(s => s.status === 'in-progress').length;
  const doneCount = info.epicStoriesDone ?? 0;
  const totalCount = info.epicStoriesTotal ?? epicStories.length;
  const progressParts: string[] = [];
  if (doneCount > 0) progressParts.push(`${doneCount} verified`);
  if (ipCount > 0) progressParts.push(`${ipCount} implemented`);
  const progress = totalCount > 0 ? ` \u2014 ${progressParts.join(', ')} / ${totalCount} stories` : '';
  return <Text><Text bold>{`Epic ${info.epicId}: ${title}`}</Text><Text dimColor>{progress}</Text></Text>;
}

/** Story context: prev/current/next sliding window. */
export function StoryContext({ entries }: { entries: StoryContextEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <Box flexDirection="column">
      {entries.map((e, i) => {
        if (e.role === 'prev') return <Text key={i}><Text color="green">{`  Prev: ${e.key} \u2713`}</Text></Text>;
        if (e.role === 'current') return <Text key={i}><Text color="cyan">{`  This: ${e.key}`}</Text></Text>;
        return <Text key={i}><Text dimColor>{`  Next: ${e.key}`}</Text></Text>;
      })}
    </Box>
  );
}

/** @deprecated Use ProgressBar + StoryContext instead. Kept for multi-lane compatibility. */
export function StoryBreakdown({ stories, sprintInfo }: { stories: StoryStatusEntry[]; sprintInfo?: SprintInfo | null }) {
  if (stories.length === 0) return null;
  const done = stories.filter(s => s.status === 'done');
  const inProgress = stories.filter(s => s.status === 'in-progress');
  const pending = stories.filter(s => s.status === 'pending');
  return (
    <Box flexDirection="column">
      {done.length > 0 && <Text color="green">{`Done: ${done.map(s => `${shortKey(s.key)} \u2713`).join('  ')}`}</Text>}
      {inProgress.map(s => <Text key={s.key} color="cyan">{`This: ${shortKey(s.key)} \u25C6 ${sprintInfo?.phase ?? ''}`}</Text>)}
      {pending.length > 0 && <Text>{`Next: ${shortKey(pending[0].key)}${pending.length > 1 ? ` (+${pending.length - 1} more)` : ''}`}</Text>}
    </Box>
  );
}

// Re-export activity components so existing consumers don't break
export { CompletedTool, CompletedTools, ActiveTool, LastThought, RetryNotice, StoryMessageLine, DriverCostSummary } from './ink-activity-components.js';

// Re-export App from ink-app
export { App } from './ink-app.js';
