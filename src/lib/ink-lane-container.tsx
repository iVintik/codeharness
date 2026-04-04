/**
 * LaneContainer — Ink component that manages multi-lane layout.
 *
 * Renders lanes side-by-side, stacked, or single depending on terminal width.
 * Lanes 3+ collapse to one-line summaries. Pure presentational component.
 *
 * @see Story 20.1: Lane Container & Lane Components
 */

import React from 'react';
import { Text, Box } from 'ink';
import { Lane, formatLaneCost, formatLaneElapsed } from './ink-lane.js';
import type { StoryProgressEntry } from './ink-lane.js';

// --- Types ---

export type LayoutMode = 'side-by-side' | 'stacked' | 'single';

export interface LaneData {
  /** Epic identifier. */
  epicId: string;
  /** Human-readable epic title. */
  epicTitle: string;
  /** Current story key. */
  currentStory: string | null;
  /** Current phase. */
  phase: string | null;
  /** AC progress (e.g., "4/9"). */
  acProgress: string | null;
  /** Story progress entries. */
  storyProgressEntries: StoryProgressEntry[];
  /** Driver name. */
  driver: string | null;
  /** Cost in USD. */
  cost: number | null;
  /** Elapsed time in ms. */
  elapsedTime: number | null;
  /** Timestamp of last activity (ISO 8601 or epoch ms). */
  lastActivityTime?: number;
}

export interface LaneContainerProps {
  /** All active lanes to render. */
  lanes: LaneData[];
  /** Current terminal width in columns. */
  terminalWidth: number;
}

export interface CollapsedLaneData {
  /** Lane index (1-based for display). */
  laneIndex: number;
  /** Epic title. */
  epicTitle: string;
  /** Current story key. */
  currentStory: string | null;
  /** Current phase. */
  phase: string | null;
  /** Cost in USD. */
  cost: number | null;
  /** Elapsed time in ms. */
  elapsedTime: number | null;
}

// --- Helpers ---

/** Determine layout mode from terminal width. */
export function getLayoutMode(terminalWidth: number): LayoutMode {
  if (terminalWidth >= 120) return 'side-by-side';
  if (terminalWidth >= 80) return 'stacked';
  return 'single';
}

/** Truncate a string to fit within maxLen, adding ellipsis if needed. */
function truncate(str: string, maxLen: number): string {
  if (maxLen < 4) return str.slice(0, maxLen);
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '\u2026';
}

// --- Sub-components ---

/** Renders collapsed lane summaries as single lines. */
export function CollapsedLanes({ lanes }: { lanes: CollapsedLaneData[] }) {
  if (lanes.length === 0) return null;

  return (
    <Box flexDirection="column">
      {lanes.map((lane) => {
        const storyPart = lane.currentStory ?? '--';
        const phasePart = lane.phase ?? '--';
        const costPart = formatLaneCost(lane.cost);
        const timePart = formatLaneElapsed(lane.elapsedTime);
        const line = `Lane ${lane.laneIndex}: ${lane.epicTitle} \u2502 ${storyPart} \u25C6 ${phasePart} \u2502 ${costPart} / ${timePart}`;

        return (
          <Text key={`collapsed-${lane.laneIndex}`} dimColor>{line}</Text>
        );
      })}
    </Box>
  );
}

/** Multi-lane layout manager. */
export function LaneContainer({ lanes, terminalWidth }: LaneContainerProps) {
  if (lanes.length === 0) return null;

  const mode = getLayoutMode(terminalWidth);

  // Determine which lanes are full vs collapsed
  // In single mode: only most recently active lane is full, rest collapsed
  // In side-by-side/stacked: first 2 full, rest collapsed
  let fullLanes: LaneData[];
  let collapsedLaneData: CollapsedLaneData[];

  if (mode === 'single') {
    // Find most recently active lane
    let mostRecentIndex = 0;
    let mostRecentTime = -Infinity;
    for (let i = 0; i < lanes.length; i++) {
      const t = lanes[i].lastActivityTime ?? 0;
      if (t >= mostRecentTime) {
        mostRecentTime = t;
        mostRecentIndex = i;
      }
    }
    fullLanes = [lanes[mostRecentIndex]];
    collapsedLaneData = lanes
      .filter((_, i) => i !== mostRecentIndex)
      .map((lane, i) => {
        // Calculate original 1-based index
        const originalIndex = i >= mostRecentIndex ? i + 2 : i + 1;
        return {
          laneIndex: originalIndex,
          epicTitle: truncate(lane.epicTitle, 30),
          currentStory: lane.currentStory,
          phase: lane.phase,
          cost: lane.cost,
          elapsedTime: lane.elapsedTime,
        };
      });
  } else {
    // Side-by-side or stacked: first 2 full, rest collapsed
    fullLanes = lanes.slice(0, 2);
    collapsedLaneData = lanes.slice(2).map((lane, i) => ({
      laneIndex: i + 3,
      epicTitle: truncate(lane.epicTitle, 30),
      currentStory: lane.currentStory,
      phase: lane.phase,
      cost: lane.cost,
      elapsedTime: lane.elapsedTime,
    }));
  }

  // Render full lanes
  const laneWidth = mode === 'side-by-side'
    ? Math.floor(terminalWidth / 2) - 1
    : terminalWidth;

  const fullLaneElements: React.ReactNode[] = [];
  for (let i = 0; i < fullLanes.length; i++) {
    const lane = fullLanes[i];
    const laneIndex = mode === 'single' ? undefined : i + 1;
    // Add a thin separator between stacked/single full lanes (not in side-by-side)
    if (i > 0 && mode !== 'side-by-side') {
      fullLaneElements.push(<Text key={`sep-${i}`} dimColor>{'─'.repeat(Math.min(terminalWidth, 60))}</Text>);
    }
    fullLaneElements.push(
      <Box key={`lane-${lane.epicId}`} width={mode === 'side-by-side' ? laneWidth : undefined} flexDirection="column">
        <Lane
          epicId={lane.epicId}
          epicTitle={lane.epicTitle}
          currentStory={lane.currentStory}
          phase={lane.phase}
          acProgress={lane.acProgress}
          storyProgressEntries={lane.storyProgressEntries}
          driver={lane.driver}
          cost={lane.cost}
          elapsedTime={lane.elapsedTime}
          laneIndex={laneIndex}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {mode === 'side-by-side' ? (
        <Box flexDirection="row">
          {fullLaneElements}
        </Box>
      ) : (
        <Box flexDirection="column">
          {fullLaneElements}
        </Box>
      )}
      <CollapsedLanes lanes={collapsedLaneData} />
    </Box>
  );
}
