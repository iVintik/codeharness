/**
 * Ink App root component — composes layout and activity components.
 *
 * Separated from ink-components.tsx to avoid circular imports
 * (ink-components exports types, ink-activity-components imports them,
 * and this file imports from both).
 */

import React from 'react';
import { Box, Static } from 'ink';
import { Header, Separator, StoryBreakdown, type RendererState } from './ink-components.js';
import { CompletedTools, ActiveTool, LastThought, RetryNotice, StoryMessageLine, DriverCostSummary } from './ink-activity-components.js';
import { WorkflowGraph } from './ink-workflow.js';
import { LaneContainer } from './ink-lane-container.js';
import type { LaneData } from './ink-lane-container.js';

export function App({ state }: { state: RendererState }) {
  const lanes: LaneData[] | undefined = state.lanes;
  const laneCount = lanes?.length ?? 0;
  const terminalWidth = process.stdout.columns || 80;

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
      {state.stories.length > 0 && <Separator />}
      <Box flexDirection="column" paddingLeft={1}>
        <CompletedTools tools={state.completedTools} />
        {state.activeTool && <ActiveTool name={state.activeTool.name} driverName={state.activeDriverName} />}
        {state.lastThought && <LastThought text={state.lastThought} />}
        {state.retryInfo && <RetryNotice info={state.retryInfo} />}
      </Box>
    </Box>
  );
}
