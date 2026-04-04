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
  const spinnerFrame = Math.floor(Date.now() / 80);

  // Determine if we're inside the loop (any loop task is active/done/failed)
  let inLoop = false;
  let loopBlock: LoopBlock | null = null;
  let loopItCount = 0;
  for (const step of flow) {
    if (isLoopBlock(step)) {
      loopBlock = step;
      loopItCount = loopIteration(step.loop, taskStates);
      inLoop = loopItCount > 0;
      break;
    }
  }

  if (inLoop && loopBlock) {
    // --- In loop: show pre-loop tasks with status + loop tasks expanded ---
    const elements: React.ReactNode[] = [];

    // Pre-loop tasks: show each with status
    for (const step of flow) {
      if (isLoopBlock(step)) break;
      if (typeof step === 'string') {
        if (elements.length > 0) elements.push(<Text key={`a-${step}`}>{' → '}</Text>);
        elements.push(
          <TaskNode key={`t-${step}`} name={step} status={taskStates[step]} spinnerFrame={spinnerFrame} driver={meta[step]?.driver} />
        );
      }
    }

    // Loop tasks with iteration count
    if (elements.length > 0) elements.push(<Text key="loop-arrow">{' → '}</Text>);
    elements.push(<Text key="loop-label"><Text bold>{`Loop ${loopItCount}: `}</Text></Text>);
    for (let j = 0; j < loopBlock.loop.length; j++) {
      if (j > 0) elements.push(<Text key={`la-${j}`}>{' → '}</Text>);
      const tn = loopBlock.loop[j];
      elements.push(
        <TaskNode key={`lt-${j}`} name={tn} status={taskStates[tn]} spinnerFrame={spinnerFrame} driver={meta[tn]?.driver} />
      );
    }

    // Post-loop tasks (e.g., retro): only show if loop is complete
    const loopDone = loopBlock.loop.every(t => taskStates[t] === 'done');
    if (loopDone) {
      let afterLoop = false;
      for (const step of flow) {
        if (afterLoop && typeof step === 'string') {
          elements.push(<Text key={`post-a-${step}`}>{' → '}</Text>);
          elements.push(
            <TaskNode key={`post-${step}`} name={step} status={taskStates[step]} spinnerFrame={spinnerFrame} driver={meta[step]?.driver} />
          );
        }
        if (isLoopBlock(step)) afterLoop = true;
      }
    }

    return <Box flexDirection="column"><Text>  {elements}</Text></Box>;
  }

  // --- Pre-loop: show only pre-loop tasks up to current + next ---
  const elements: React.ReactNode[] = [];
  let passedCurrent = false;

  for (const step of flow) {
    if (isLoopBlock(step)) break; // Don't show loop before entering

    if (typeof step === 'string') {
      if (elements.length > 0) {
        elements.push(<Text key={`a-${step}`}>{' → '}</Text>);
      }
      elements.push(
        <TaskNode key={`t-${step}`} name={step} status={taskStates[step]} spinnerFrame={spinnerFrame} driver={meta[step]?.driver} />
      );

      if (step === currentTask) passedCurrent = true;
      // Show one step after current, then stop
      if (passedCurrent && step !== currentTask) break;
    }
  }

  return <Box flexDirection="column"><Text>  {elements}</Text></Box>;
}
