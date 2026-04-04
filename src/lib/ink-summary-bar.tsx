/**
 * SummaryBar — Ink component showing sprint-level summary.
 *
 * Displays done stories, active merge status, and pending epics
 * in a single-line overview. Also renders lane completion lines.
 * Pure presentational component — receives all data via props.
 *
 * @see Story 20.2: Summary Bar & Merge Status
 */

import React from 'react';
import { Text, Box } from 'ink';

// --- Types ---

export interface MergingEpicInfo {
  epicId: string;
  status: 'in-progress' | 'resolving' | 'complete';
  conflictCount?: number;
}

export interface CompletedLaneInfo {
  laneIndex: number;
  epicId: string;
  storyCount: number;
  cost: number;
  elapsed: string;
}

export interface SummaryBarProps {
  doneStories: string[];
  mergingEpic: MergingEpicInfo | null;
  pendingEpics: string[];
  completedLanes?: CompletedLaneInfo[];
}

// --- Helpers ---

function formatConflictText(count: number): string {
  return count === 1 ? '1 conflict' : `${count} conflicts`;
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

// --- Component ---

export function SummaryBar({ doneStories, mergingEpic, pendingEpics, completedLanes }: SummaryBarProps) {
  // Done section
  const doneSection = doneStories.length > 0
    ? doneStories.map(s => `${s} \u2713`).join('  ')
    : '\u2014';

  // Merging section
  let mergingNode: React.ReactNode;
  if (!mergingEpic) {
    mergingNode = <Text dimColor>{'\u2014'}</Text>;
  } else if (mergingEpic.status === 'resolving') {
    const conflictText = mergingEpic.conflictCount != null
      ? ` (resolving ${formatConflictText(mergingEpic.conflictCount)})`
      : '';
    mergingNode = <Text color="yellow">{`${mergingEpic.epicId} \u2192 main${conflictText} \u25CC`}</Text>;
  } else if (mergingEpic.status === 'in-progress') {
    mergingNode = <Text>{`${mergingEpic.epicId} \u2192 main \u25CC`}</Text>;
  } else {
    // complete
    mergingNode = <Text color="green">{`${mergingEpic.epicId} \u2192 main \u2713`}</Text>;
  }

  // Pending section
  const pendingSection = pendingEpics.length > 0
    ? pendingEpics.join(', ')
    : '\u2014';

  return (
    <Box flexDirection="column">
      <Text>
        <Text color="green">{`Done: ${doneSection}`}</Text>
        <Text>{' \u2502 '}</Text>
        <Text>{'Merging: '}</Text>
        {mergingNode}
        <Text>{' \u2502 '}</Text>
        <Text dimColor>{`Pending: ${pendingSection}`}</Text>
      </Text>
      {completedLanes && completedLanes.length > 0 && completedLanes.map(lane => (
        <Text key={`lane-complete-${lane.laneIndex}`} color="green">
          {`[OK] Lane ${lane.laneIndex}: Epic ${lane.epicId} complete (${lane.storyCount} stories, ${formatCost(lane.cost)}, ${lane.elapsed})`}
        </Text>
      ))}
    </Box>
  );
}
