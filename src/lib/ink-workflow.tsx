/**
 * WorkflowGraph — Ink component that renders a schematic workflow graph.
 *
 * Displays tasks as nodes connected by arrows, with status indicators
 * (pending, active, done, failed). Loop blocks are rendered with an
 * iteration counter and visual grouping.
 *
 * When `taskMeta` is provided, renders a multi-row layout:
 *   Row 1: task names with status icons, connected by arrows
 *   Row 2: driver labels (dimmed)
 *   Row 3: cost/time for completed tasks (dimmed)
 *
 * When `taskMeta` is empty or omitted, renders the original single-line format.
 *
 * This is a pure presentational component — no side effects, no state hooks.
 */

import React from 'react';
import { Text, Box } from 'ink';
import type { FlowStep, LoopBlock } from './workflow-parser.js';
import type { TaskNodeState, TaskNodeMeta } from './ink-components.js';

/** Terminal width, capped to avoid excessive line lengths. */
const termWidth = () => Math.min(process.stdout.columns || 60, 80);

/** Spinner frames for active task animation. */
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export interface WorkflowGraphProps {
  flow: FlowStep[];
  currentTask: string | null;
  taskStates: Record<string, TaskNodeState>;
  taskMeta?: Record<string, TaskNodeMeta>;
}

function isLoopBlock(step: FlowStep): step is LoopBlock {
  return typeof step === 'object' && step !== null && 'loop' in step;
}

/** Format cost in USD. Returns `...` for null/undefined. */
export function formatCost(costUsd: number | null | undefined): string {
  if (costUsd == null) return '...';
  return `$${costUsd.toFixed(2)}`;
}

/** Format elapsed time. Returns `Xm` for >=60s, `Xs` for <60s, `...` for null/undefined. */
export function formatElapsed(ms: number | null | undefined): string {
  if (ms == null) return '...';
  const seconds = Math.round(ms / 1000);
  if (seconds >= 60) {
    return `${Math.floor(seconds / 60)}m`;
  }
  return `${seconds}s`;
}

/** Shorten driver/model to a compact label. */
function driverLabel(driver?: string): string {
  if (!driver) return '';
  if (driver.includes('opus')) return 'opus';
  if (driver.includes('sonnet')) return 'snnt';
  if (driver.includes('haiku')) return 'haiku';
  if (driver === 'codex' || driver === 'codex-mini') return 'cdx';
  if (driver === 'claude-code') return 'cc';
  if (driver === 'opencode') return 'oc';
  return driver.slice(0, 4);
}

/** Render a single task name with its status indicator and optional driver tag. */
function TaskNode({ name, status, spinnerFrame, driver }: { name: string; status: TaskNodeState | undefined; spinnerFrame?: number; driver?: string }) {
  const s = status ?? 'pending';
  const tag = driver ? ` [${driverLabel(driver)}]` : '';
  switch (s) {
    case 'done':
      return <Text color="green">{name}<Text dimColor>{tag}</Text> ✓</Text>;
    case 'active': {
      const frame = SPINNER_FRAMES[(spinnerFrame ?? 0) % SPINNER_FRAMES.length];
      return <Text color="cyan">{frame} {name}<Text dimColor>{tag}</Text></Text>;
    }
    case 'failed':
      return <Text color="red">{name}<Text dimColor>{tag}</Text> ✗</Text>;
    case 'pending':
    default:
      return <Text dimColor>{name}{tag}</Text>;
  }
}

/** Count completed iterations for a loop block based on task states. */
function loopIteration(tasks: string[], taskStates: Record<string, TaskNodeState>): number {
  // Heuristic: 0 before any task starts, 1 once any task is active/done/failed.
  const anyStarted = tasks.some(t => {
    const s = taskStates[t];
    return s !== undefined && s !== 'pending';
  });
  return anyStarted ? 1 : 0;
}

/** Collect all task names from the flow in order (flattening loop blocks). */
function collectTaskNames(flow: FlowStep[]): string[] {
  const names: string[] = [];
  for (const step of flow) {
    if (isLoopBlock(step)) {
      names.push(...step.loop);
    } else {
      names.push(step);
    }
  }
  return names;
}

/** Check if taskMeta has any meaningful data. */
function hasMetaData(taskMeta: Record<string, TaskNodeMeta> | undefined): boolean {
  if (!taskMeta) return false;
  return Object.keys(taskMeta).length > 0;
}

export function WorkflowGraph({ flow, currentTask, taskStates, taskMeta }: WorkflowGraphProps) {
  if (flow.length === 0 || Object.keys(taskStates).length === 0) {
    return null;
  }

  const meta = taskMeta ?? {};
  const showMeta = hasMetaData(taskMeta);

  // Derive spinner frame from wall clock. Parent re-renders on state updates
  // which naturally advances the animation. No hooks needed.
  const spinnerFrame = Math.floor(Date.now() / 80);

  // Row 1: task names with status icons and arrows
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < flow.length; i++) {
    const step = flow[i];

    if (i > 0) {
      elements.push(<Text key={`arrow-${i}`}>{' → '}</Text>);
    }

    if (isLoopBlock(step)) {
      const iteration = loopIteration(step.loop, taskStates);
      const loopNodes: React.ReactNode[] = [];
      for (let j = 0; j < step.loop.length; j++) {
        if (j > 0) {
          loopNodes.push(<Text key={`loop-arrow-${i}-${j}`}>{' → '}</Text>);
        }
        loopNodes.push(
          <TaskNode key={`loop-task-${i}-${j}`} name={step.loop[j]} status={taskStates[step.loop[j]]} spinnerFrame={spinnerFrame} driver={meta[step.loop[j]]?.driver} />
        );
      }
      elements.push(
        <Text key={`loop-${i}`}>
          <Text>loop({iteration})[ </Text>
          {loopNodes}
          <Text> ]</Text>
        </Text>
      );
    } else {
      elements.push(
        <TaskNode key={`task-${i}`} name={step} status={taskStates[step]} spinnerFrame={spinnerFrame} driver={meta[step]?.driver} />
      );
    }
  }

  return (
    <Box flexDirection="column">
      <Text>  {elements}</Text>
    </Box>
  );
}
