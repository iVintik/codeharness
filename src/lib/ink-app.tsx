/**
 * Ink App root component — composes layout and activity components.
 *
 * Separated from ink-components.tsx to avoid circular imports
 * (ink-components exports types, ink-activity-components imports them,
 * and this file imports from both).
 */

import React from 'react';
import { Box, Static, Text, useInput } from 'ink';
import { Header, Separator, ProgressBar, EpicInfo, StoryContext, type RendererState } from './ink-components.js';
import { StoryMessageLine, ActivitySection } from './ink-activity-components.js';
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

  // Compute available height for activity section (adapts to terminal)
  const termRows = process.stdout.rows || 24;
  // Fixed: header(1) + sep(1) + progress(1) + epic(1) + storyCtx(3) + sep(1) + workflow(1) + sep(1) = 10
  // Plus: static messages above viewport + 2 lines buffer for Ink overhead
  const staticLines = state.messages.length;
  const fixedHeight = 10 + staticLines + 2;
  const availableHeight = Math.max(3, termRows - fixedHeight);

  return (
    <Box flexDirection="column">
      <Static items={state.messages}>
        {(msg, i) => <StoryMessageLine key={i} msg={msg} />}
      </Static>
      <Header info={state.sprintInfo} laneCount={laneCount > 1 ? laneCount : undefined} />
      {laneCount > 1 ? (
        <>
          <LaneContainer lanes={lanes!} terminalWidth={terminalWidth} />
          {state.summaryBar && <><Separator /><SummaryBar {...state.summaryBar} /></>}
          {state.mergeState && <><Separator /><MergeStatus mergeState={state.mergeState} /></>}
          <Separator />
          <Box flexDirection="column" paddingLeft={1}>
            <LaneActivityHeader activeLaneId={state.activeLaneId ?? null} laneCount={activeLaneCount} />
            <ActivitySection completedTools={state.completedTools} activeTool={state.activeTool} activeDriverName={state.activeDriverName} lastThought={state.lastThought} retryInfo={state.retryInfo} availableHeight={availableHeight} />
          </Box>
        </>
      ) : (
        <>
          <Separator />
          <ProgressBar done={state.sprintInfo?.done ?? 0} total={state.sprintInfo?.total ?? 0} inProgress={state.stories.filter(s => s.status === 'in-progress').length} checked={state.stories.filter(s => s.status === 'checked').length} />
          <EpicInfo info={state.sprintInfo} stories={state.stories} />
          <StoryContext entries={state.storyContext ?? []} />
          <Separator />
          {state.workflowVizLine ? <Text>{state.workflowVizLine}</Text> : <WorkflowGraph flow={state.workflowFlow} currentTask={state.currentTaskName} taskStates={state.taskStates} />}
          <Separator />
          <ActivitySection completedTools={state.completedTools} activeTool={state.activeTool} activeDriverName={state.activeDriverName} lastThought={state.lastThought} retryInfo={state.retryInfo} availableHeight={availableHeight} />
        </>
      )}
    </Box>
  );
}
