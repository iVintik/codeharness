/**
 * MergeStatus — Ink component showing detailed merge progress.
 *
 * Renders merge outcome (clean/resolved/escalated), conflict details,
 * and post-merge test results. Pure presentational component.
 *
 * @see Story 20.2: Summary Bar & Merge Status
 */

import React from 'react';
import { Text, Box } from 'ink';

// --- Types ---

export interface MergeTestResults {
  passed: number;
  failed: number;
  total: number;
  durationSecs: number;
  coverage: number | null;
}

export interface MergeState {
  epicId: string;
  outcome: 'clean' | 'resolved' | 'escalated' | 'in-progress';
  conflicts?: string[];
  conflictCount?: number;
  testResults?: MergeTestResults;
  worktreePath?: string;
  reason?: string;
}

export interface MergeStatusProps {
  mergeState: MergeState | null;
}

// --- Component ---

export function MergeStatus({ mergeState }: MergeStatusProps) {
  if (!mergeState) return null;

  const lines: React.ReactNode[] = [];

  if (mergeState.outcome === 'clean') {
    const count = mergeState.conflictCount ?? 0;
    lines.push(
      <Text key="merge-clean" color="green">
        {`[OK] Merge ${mergeState.epicId} \u2192 main: clean (${count} conflicts)`}
      </Text>
    );
  } else if (mergeState.outcome === 'resolved') {
    const count = mergeState.conflictCount ?? mergeState.conflicts?.length ?? 0;
    const suffix = count === 1 ? '' : 's';
    lines.push(
      <Text key="merge-resolved" color="green">
        {`[OK] Merge ${mergeState.epicId} \u2192 main: ${count} conflict${suffix} auto-resolved`}
      </Text>
    );
    if (mergeState.conflicts && mergeState.conflicts.length > 0) {
      for (let i = 0; i < mergeState.conflicts.length; i++) {
        lines.push(
          <Text key={`conflict-${i}`}>
            {'     \u2514 '}{mergeState.conflicts[i]}
          </Text>
        );
      }
    }
  } else if (mergeState.outcome === 'escalated') {
    lines.push(
      <Text key="merge-escalated" color="red">
        {`[FAIL] Merge ${mergeState.epicId} \u2192 main: ${mergeState.reason ?? 'unknown error'}`}
      </Text>
    );
    if (mergeState.conflicts && mergeState.conflicts.length > 0) {
      for (let i = 0; i < mergeState.conflicts.length; i++) {
        lines.push(
          <Text key={`esc-conflict-${i}`}>
            {'       \u2514 '}{mergeState.conflicts[i]}
          </Text>
        );
      }
    }
    lines.push(
      <Text key="manual" color="red">{'       \u2192 Manual resolution required'}</Text>
    );
    if (mergeState.worktreePath) {
      lines.push(
        <Text key="worktree" color="red">
          {`       \u2192 Worktree preserved: ${mergeState.worktreePath}`}
        </Text>
      );
    }
  } else if (mergeState.outcome === 'in-progress') {
    lines.push(
      <Text key="merge-inprog">
        {`Merging ${mergeState.epicId} \u2192 main \u25CC`}
      </Text>
    );
  }

  // Test results
  if (mergeState.testResults) {
    const t = mergeState.testResults;
    const hasFailed = t.failed > 0;
    const prefix = hasFailed ? '[FAIL]' : '[OK]';
    const color = hasFailed ? 'red' : 'green';
    let testLine = `${prefix} Tests: ${t.passed}/${t.total} passed (${t.durationSecs}s)`;
    if (t.coverage != null) {
      testLine += ` ${t.coverage}% coverage`;
    }
    lines.push(
      <Text key="tests" color={color}>{testLine}</Text>
    );
  }

  return (
    <Box flexDirection="column">
      {lines}
    </Box>
  );
}
