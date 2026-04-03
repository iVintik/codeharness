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
}

export interface CompletedToolEntry {
  name: string;
  args: string;
}

export type StoryStatusValue = 'done' | 'in-progress' | 'pending' | 'failed' | 'blocked';

export interface StoryStatusEntry {
  key: string;
  status: StoryStatusValue;
  retryCount?: number;
  maxRetries?: number;
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

export function Header({ info }: { info: SprintInfo | null }) {
  if (!info) return null;

  const parts: string[] = ['codeharness run'];
  if (info.iterationCount != null) {
    parts.push(`iteration ${info.iterationCount}`);
  }
  if (info.elapsed) {
    parts.push(`${info.elapsed} elapsed`);
  }
  if (info.totalCost != null) {
    parts.push(`${formatCost(info.totalCost)} spent`);
  }
  const headerLine = parts.join(' | ');

  let phaseLine = '';
  if (info.phase) {
    phaseLine = `Phase: ${info.phase}`;
    if (info.acProgress) {
      phaseLine += ` → AC ${info.acProgress}`;
    }
    if (info.currentCommand) {
      phaseLine += ` (${info.currentCommand})`;
    }
  }

  return (
    <Box flexDirection="column">
      <Text>{headerLine}</Text>
      <Separator />
      <Text>{`Story: ${info.storyKey || '(waiting)'}`}</Text>
      {phaseLine && <Text>{phaseLine}</Text>}
    </Box>
  );
}

export function StoryBreakdown({ stories, sprintInfo }: { stories: StoryStatusEntry[]; sprintInfo?: SprintInfo | null }) {
  if (stories.length === 0) return null;

  const done: StoryStatusEntry[] = [];
  const inProgress: StoryStatusEntry[] = [];
  const pending: StoryStatusEntry[] = [];
  const failed: StoryStatusEntry[] = [];
  const blocked: StoryStatusEntry[] = [];

  for (const s of stories) {
    switch (s.status) {
      case 'done': done.push(s); break;
      case 'in-progress': inProgress.push(s); break;
      case 'pending': pending.push(s); break;
      case 'failed': failed.push(s); break;
      case 'blocked': blocked.push(s); break;
    }
  }

  const lines: React.ReactNode[] = [];

  if (done.length > 0) {
    const doneItems = done.map(s => `${shortKey(s.key)} ✓`).join('  ');
    lines.push(
      <Text key="done"><Text color="green">{'Done: '}</Text><Text color="green">{doneItems}</Text></Text>
    );
  }

  if (inProgress.length > 0) {
    for (const s of inProgress) {
      let thisText = `${shortKey(s.key)} ◆`;
      if (sprintInfo && sprintInfo.storyKey && shortKey(s.key) === shortKey(sprintInfo.storyKey)) {
        if (sprintInfo.phase) thisText += ` ${sprintInfo.phase}`;
        if (sprintInfo.acProgress) thisText += ` (${sprintInfo.acProgress} ACs)`;
      }
      lines.push(
        <Text key={`this-${s.key}`}><Text color="cyan">{'This: '}</Text><Text color="cyan">{thisText}</Text></Text>
      );
    }
  }

  if (pending.length > 0) {
    lines.push(
      <Text key="next">
        <Text>{'Next: '}</Text><Text>{shortKey(pending[0].key)}</Text>
        {pending.length > 1 && <Text dimColor>{` (+${pending.length - 1} more)`}</Text>}
      </Text>
    );
  }

  if (blocked.length > 0) {
    const blockedItems = blocked.map(s => {
      let item = `${shortKey(s.key)} ✕`;
      if (s.retryCount != null && s.maxRetries != null) item += ` (${s.retryCount}/${s.maxRetries})`;
      return item;
    }).join('  ');
    lines.push(
      <Text key="blocked"><Text color="yellow">{'Blocked: '}</Text><Text color="yellow">{blockedItems}</Text></Text>
    );
  }

  if (failed.length > 0) {
    const failedItems = failed.map(s => {
      let item = `${shortKey(s.key)} ✗`;
      if (s.retryCount != null && s.maxRetries != null) item += ` (${s.retryCount}/${s.maxRetries})`;
      return item;
    }).join('  ');
    lines.push(
      <Text key="failed"><Text color="red">{'Failed: '}</Text><Text color="red">{failedItems}</Text></Text>
    );
  }

  return (
    <Box flexDirection="column">
      {lines}
    </Box>
  );
}

// Re-export activity components so existing consumers don't break
export { CompletedTool, CompletedTools, ActiveTool, LastThought, RetryNotice, StoryMessageLine } from './ink-activity-components.js';

// Re-export App from ink-app
export { App } from './ink-app.js';
