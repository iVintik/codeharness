/**
 * Ink App root component — composes layout and activity components.
 *
 * Separated from ink-components.tsx to avoid circular imports
 * (ink-components exports types, ink-activity-components imports them,
 * and this file imports from both).
 */

import React from 'react';
import { Box, Static, Text, useInput } from 'ink';
import { Header, Separator, StoryBreakdown, type RendererState } from './ink-components.js';
import { CompletedTools, ActiveTool, LastThought, RetryNotice, StoryMessageLine, DriverCostSummary } from './ink-activity-components.js';
import { WorkflowGraph } from './ink-workflow.js';
import { LaneContainer } from './ink-lane-container.js';
import type { LaneData } from './ink-lane-container.js';
import { SummaryBar } from './ink-summary-bar.js';
import { MergeStatus } from './ink-merge-status.js';

// --- Lane Activity Header ---

/**
 * Shows which lane's activity is currently displayed in the activity section.
 * Only renders when laneCount > 1 (multi-lane mode).
 */
export function LaneActivityHeader({ activeLaneId, laneCount }: { activeLaneId: string | null; laneCount: number }) {
  if (laneCount <= 1 || !activeLaneId) return null;
  return (
    <Text>
      <Text color="cyan">{`[Lane ${activeLaneId} \u25B8]`}</Text>
    </Text>
  );
}

// --- App Component ---

export function App({ state, onCycleLane, onQuit }: { state: RendererState; onCycleLane?: () => void; onQuit?: () => void }) {
  const lanes: LaneData[] | undefined = state.lanes;
  const laneCount = lanes?.length ?? 0;
  const terminalWidth = process.stdout.columns || 80;

  // Key handlers: Ctrl+L for lane cycling, 'q' for quit
  useInput((input, key) => {
    if (key.ctrl && input === 'l' && onCycleLane && laneCount > 1) {
      onCycleLane();
    }
    if (input === 'q' && onQuit) {
      onQuit();
    }
  }, { isActive: typeof process.stdin.setRawMode === 'function' });

  const activeLaneCount = state.laneCount ?? 0;

  return (
    <Box flexDirection="column">
      <Static items={state.messages}>
        {(msg, i) => <StoryMessageLine key={i} msg={msg} />}
      </Static>
      <Header info={state.sprintInfo} laneCount={laneCount > 1 ? laneCount : undefined} />
      {laneCount > 1 ? (
        <LaneContainer lanes={lanes!} terminalWidth={terminalWidth} />
      ) : (
        <>
          <WorkflowGraph flow={state.workflowFlow} currentTask={state.currentTaskName} taskStates={state.taskStates} taskMeta={state.taskMeta} />
          <StoryBreakdown stories={state.stories} sprintInfo={state.sprintInfo} />
          <DriverCostSummary driverCosts={state.driverCosts} />
        </>
      )}
      {laneCount > 1 && state.summaryBar && (
        <>
          <Separator />
          <SummaryBar {...state.summaryBar} />
        </>
      )}
      {laneCount > 1 && state.mergeState && (
        <>
          <Separator />
          <MergeStatus mergeState={state.mergeState} />
        </>
      )}
      {(state.stories.length > 0 || (laneCount > 1 && (state.summaryBar || state.mergeState))) && <Separator />}
      <Box flexDirection="column" paddingLeft={1}>
        <LaneActivityHeader activeLaneId={state.activeLaneId ?? null} laneCount={activeLaneCount} />
        <CompletedTools tools={state.completedTools} />
        {state.activeTool && <ActiveTool name={state.activeTool.name} driverName={state.activeDriverName} />}
        {state.lastThought && <LastThought text={state.lastThought} />}
        {state.retryInfo && <RetryNotice info={state.retryInfo} />}
      </Box>
    </Box>
  );
}
