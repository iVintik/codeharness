/**
 * WorkflowGraph — Ink component that renders a schematic workflow graph.
 *
 * Displays tasks as nodes connected by arrows, with status indicators
 * (pending, active, done, failed). Loop blocks are rendered with an
 * iteration counter and visual grouping.
 *
 * This is a pure presentational component — no side effects, no state hooks.
 */

import React from 'react';
import { Text, Box } from 'ink';
import type { FlowStep, LoopBlock } from './workflow-parser.js';
import type { TaskNodeState } from './ink-components.js';

/** Terminal width, capped to avoid excessive line lengths. */
const termWidth = () => Math.min(process.stdout.columns || 60, 80);

export interface WorkflowGraphProps {
  flow: FlowStep[];
  currentTask: string | null;
  taskStates: Record<string, TaskNodeState>;
}

function isLoopBlock(step: FlowStep): step is LoopBlock {
  return typeof step === 'object' && step !== null && 'loop' in step;
}

/** Render a single task name with its status indicator. */
function TaskNode({ name, status }: { name: string; status: TaskNodeState | undefined }) {
  const s = status ?? 'pending';
  switch (s) {
    case 'done':
      return <Text color="green">{name} ✓</Text>;
    case 'active':
      return <Text color="cyan">◆ {name}</Text>;
    case 'failed':
      return <Text color="red">{name} ✗</Text>;
    case 'pending':
    default:
      return <Text dimColor>{name}</Text>;
  }
}

/** Count completed iterations for a loop block based on task states. */
function loopIteration(tasks: string[], taskStates: Record<string, TaskNodeState>): number {
  // Heuristic: 0 before any task starts, 1 once any task is active/done/failed.
  // Proper multi-iteration counting requires engine-provided iteration data,
  // which will be wired when the engine integration story lands.
  const anyStarted = tasks.some(t => {
    const s = taskStates[t];
    return s !== undefined && s !== 'pending';
  });
  return anyStarted ? 1 : 0;
}

export function WorkflowGraph({ flow, currentTask, taskStates }: WorkflowGraphProps) {
  if (flow.length === 0 || Object.keys(taskStates).length === 0) {
    return null;
  }

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
          <TaskNode key={`loop-task-${i}-${j}`} name={step.loop[j]} status={taskStates[step.loop[j]]} />
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
        <TaskNode key={`task-${i}`} name={step} status={taskStates[step]} />
      );
    }
  }

  return (
    <Box flexDirection="column">
      <Text>{'━'.repeat(termWidth())}</Text>
      <Text>  {elements}</Text>
      <Text>{'━'.repeat(termWidth())}</Text>
    </Box>
  );
}
