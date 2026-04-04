/**
 * Lane — Ink component that renders a single epic lane's status display.
 *
 * Shows epic title, current story + phase, story progress bar,
 * and driver name + cost/time. Pure presentational component.
 *
 * @see Story 20.1: Lane Container & Lane Components
 */

import React from 'react';
import { Text, Box } from 'ink';

// --- Types ---

export type StoryProgressStatus = 'done' | 'in-progress' | 'pending';

export interface StoryProgressEntry {
  key: string;
  status: StoryProgressStatus;
}

export interface LaneProps {
  /** Epic identifier (e.g., "10"). */
  epicId: string;
  /** Human-readable epic title (e.g., "Driver Interface"). */
  epicTitle: string;
  /** Current story key (e.g., "10-3"). */
  currentStory: string | null;
  /** Current phase (e.g., "dev", "verify"). */
  phase: string | null;
  /** Acceptance criteria progress (e.g., "4/9"). */
  acProgress: string | null;
  /** Progress entries for all stories in this epic. */
  storyProgressEntries: StoryProgressEntry[];
  /** Driver name (e.g., "claude-code"). */
  driver: string | null;
  /** Total cost in USD for this lane. */
  cost: number | null;
  /** Elapsed time in milliseconds. */
  elapsedTime: number | null;
  /** Lane index (1-based for display). */
  laneIndex?: number;
}

/** Format cost as $X.XX, or `--` for null. */
export function formatLaneCost(cost: number | null): string {
  if (cost == null) return '--';
  return `$${cost.toFixed(2)}`;
}

/** Format elapsed time: Xh Xm for >=60min, Xm for >=1min, Xs for <1min, `--` for null. */
export function formatLaneElapsed(ms: number | null): string {
  if (ms == null) return '--';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
  if (minutes >= 1) {
    return `${minutes}m`;
  }
  return `${totalSeconds}s`;
}

/** Render the story progress bar: ✓ done, ◆ in-progress, ○ pending. */
function StoryProgressBar({ entries }: { entries: StoryProgressEntry[] }) {
  if (entries.length === 0) return null;

  const items: React.ReactNode[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (i > 0) items.push(<Text key={`sp-${i}`}>{' '}</Text>);

    switch (entry.status) {
      case 'done':
        items.push(<Text key={`s-${i}`} color="green">{`✓ ${entry.key}`}</Text>);
        break;
      case 'in-progress':
        items.push(<Text key={`s-${i}`} color="yellow">{`◆ ${entry.key}`}</Text>);
        break;
      case 'pending':
        items.push(<Text key={`s-${i}`} dimColor>{`○ ${entry.key}`}</Text>);
        break;
    }
  }

  return <Text> {items}</Text>;
}

/** Single lane display component. */
export function Lane(props: LaneProps) {
  const {
    epicId,
    epicTitle,
    currentStory,
    phase,
    acProgress,
    storyProgressEntries,
    driver,
    cost,
    elapsedTime,
    laneIndex,
  } = props;

  const laneLabel = laneIndex != null ? `Lane ${laneIndex}: ` : '';
  const titleLine = `${laneLabel}Epic ${epicId} \u2014 ${epicTitle}`;

  const storyParts: string[] = [];
  if (currentStory) storyParts.push(currentStory);
  if (phase) storyParts.push(`\u25C6 ${phase}`);
  if (acProgress) storyParts.push(`(AC ${acProgress})`);
  const storyLine = storyParts.length > 0 ? ` ${storyParts.join(' ')}` : null;

  const driverLine = ` ${driver ?? 'unknown'} | ${formatLaneCost(cost)} / ${formatLaneElapsed(elapsedTime)}`;

  return (
    <Box flexDirection="column">
      <Text bold>{titleLine}</Text>
      {storyLine && <Text>{storyLine}</Text>}
      <StoryProgressBar entries={storyProgressEntries} />
      <Text dimColor>{driverLine}</Text>
    </Box>
  );
}
