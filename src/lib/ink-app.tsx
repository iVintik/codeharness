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
import { CompletedTools, ActiveTool, LastThought, RetryNotice, StoryMessageLine } from './ink-activity-components.js';
import { WorkflowGraph } from './ink-workflow.js';

export function App({ state }: { state: RendererState }) {
  return (
    <Box flexDirection="column">
      <Static items={state.messages}>
        {(msg, i) => <StoryMessageLine key={i} msg={msg} />}
      </Static>
      <Header info={state.sprintInfo} />
      <WorkflowGraph flow={state.workflowFlow} currentTask={state.currentTaskName} taskStates={state.taskStates} />
      <StoryBreakdown stories={state.stories} sprintInfo={state.sprintInfo} />
      {state.stories.length > 0 && <Separator />}
      <Box flexDirection="column" paddingLeft={1}>
        <CompletedTools tools={state.completedTools} />
        {state.activeTool && <ActiveTool name={state.activeTool.name} />}
        {state.lastThought && <LastThought text={state.lastThought} />}
        {state.retryInfo && <RetryNotice info={state.retryInfo} />}
      </Box>
    </Box>
  );
}
