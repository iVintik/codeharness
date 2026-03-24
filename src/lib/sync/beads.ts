import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { BeadsIssue } from '../beads.js';
import {
  resolveStoryFilePath,
  readStoryFileStatus,
  updateStoryFileStatus,
  storyKeyFromPath,
  beadsStatusToStoryStatus,
  storyStatusToBeadsStatus,
} from './story-files.js';
import type { SyncResult, SyncDirection } from './story-files.js';
import { updateSprintStatus } from './sprint-yaml.js';

export type { SyncResult, SyncDirection };

export function syncBeadsToStoryFile(
  beadsId: string,
  beadsFns: {
    listIssues: () => BeadsIssue[];
  },
  dir?: string,
): SyncResult {
  const root = dir ?? process.cwd();
  const issues = beadsFns.listIssues();
  const issue = issues.find(i => i.id === beadsId);

  if (!issue) {
    return {
      storyKey: '',
      beadsId,
      previousStatus: '',
      newStatus: '',
      synced: false,
      error: `Beads issue not found: ${beadsId}`,
    };
  }
  const storyFilePath = resolveStoryFilePath(issue);
  if (!storyFilePath) {
    return {
      storyKey: '',
      beadsId,
      previousStatus: issue.status,
      newStatus: '',
      synced: false,
      error: `No story file path in beads issue description: ${beadsId}`,
    };
  }
  const storyKey = storyKeyFromPath(storyFilePath);
  const fullPath = join(root, storyFilePath);
  const currentStoryStatus = readStoryFileStatus(fullPath);

  if (currentStoryStatus === null) {
    return {
      storyKey,
      beadsId,
      previousStatus: issue.status,
      newStatus: '',
      synced: false,
      error: `Story file not found or has no Status line: ${storyFilePath}`,
    };
  }
  const targetStoryStatus = beadsStatusToStoryStatus(issue.status);
  if (!targetStoryStatus) {
    return {
      storyKey,
      beadsId,
      previousStatus: currentStoryStatus,
      newStatus: '',
      synced: false,
      error: `Unknown beads status: ${issue.status}`,
    };
  }
  if (currentStoryStatus === targetStoryStatus) {
    return {
      storyKey,
      beadsId,
      previousStatus: currentStoryStatus,
      newStatus: currentStoryStatus,
      synced: false,
    };
  }
  updateStoryFileStatus(fullPath, targetStoryStatus);
  updateSprintStatus(storyKey, targetStoryStatus, root);

  return {
    storyKey,
    beadsId,
    previousStatus: currentStoryStatus,
    newStatus: targetStoryStatus,
    synced: true,
  };
}

export function syncStoryFileToBeads(
  storyKey: string,
  beadsFns: {
    listIssues: () => BeadsIssue[];
    updateIssue: (id: string, opts: { status?: string }) => void;
    closeIssue: (id: string) => void;
  },
  dir?: string,
): SyncResult {
  const root = dir ?? process.cwd();
  const storyFilePath = `_bmad-output/implementation-artifacts/${storyKey}.md`;
  const fullPath = join(root, storyFilePath);

  const currentStoryStatus = readStoryFileStatus(fullPath);
  if (currentStoryStatus === null) {
    return {
      storyKey,
      beadsId: '',
      previousStatus: '',
      newStatus: '',
      synced: false,
      error: `Story file not found or has no Status line: ${storyFilePath}`,
    };
  }
  const issues = beadsFns.listIssues();
  const issue = issues.find(i => {
    const path = resolveStoryFilePath(i);
    if (!path) return false;
    return storyKeyFromPath(path) === storyKey;
  });

  if (!issue) {
    return {
      storyKey,
      beadsId: '',
      previousStatus: currentStoryStatus,
      newStatus: '',
      synced: false,
      error: `No beads issue found for story: ${storyKey}`,
    };
  }
  const targetBeadsStatus = storyStatusToBeadsStatus(currentStoryStatus);
  if (!targetBeadsStatus) {
    return {
      storyKey,
      beadsId: issue.id,
      previousStatus: currentStoryStatus,
      newStatus: '',
      synced: false,
      error: `Unknown story status: ${currentStoryStatus}`,
    };
  }
  if (issue.status === targetBeadsStatus) {
    return {
      storyKey,
      beadsId: issue.id,
      previousStatus: currentStoryStatus,
      newStatus: currentStoryStatus,
      synced: false,
    };
  }
  if (targetBeadsStatus === 'closed') {
    beadsFns.closeIssue(issue.id);
  } else {
    beadsFns.updateIssue(issue.id, { status: targetBeadsStatus });
  }
  updateSprintStatus(storyKey, currentStoryStatus, root);

  return {
    storyKey,
    beadsId: issue.id,
    previousStatus: issue.status,
    newStatus: targetBeadsStatus,
    synced: true,
  };
}

export function syncClose(
  beadsId: string,
  beadsFns: {
    closeIssue: (id: string) => void;
    listIssues: () => BeadsIssue[];
  },
  dir?: string,
): SyncResult {
  const root = dir ?? process.cwd();

  const issues = beadsFns.listIssues();
  const issue = issues.find(i => i.id === beadsId);

  beadsFns.closeIssue(beadsId);

  if (!issue) {
    return {
      storyKey: '',
      beadsId,
      previousStatus: '',
      newStatus: 'closed',
      synced: false,
      error: `Beads issue not found: ${beadsId}`,
    };
  }
  const storyFilePath = resolveStoryFilePath(issue);
  if (!storyFilePath) {
    return {
      storyKey: '',
      beadsId,
      previousStatus: issue.status,
      newStatus: 'closed',
      synced: false,
      error: `No story file path in beads issue description: ${beadsId}`,
    };
  }
  const storyKey = storyKeyFromPath(storyFilePath);
  const fullPath = join(root, storyFilePath);
  const previousStatus = readStoryFileStatus(fullPath);

  if (previousStatus === null) {
    if (!existsSync(fullPath)) {
      return {
        storyKey,
        beadsId,
        previousStatus: '',
        newStatus: 'closed',
        synced: false,
        error: `Story file not found: ${storyFilePath}`,
      };
    }
  }
  updateStoryFileStatus(fullPath, 'done');
  updateSprintStatus(storyKey, 'done', root);

  return {
    storyKey,
    beadsId,
    previousStatus: previousStatus ?? '',
    newStatus: 'done',
    synced: true,
  };
}

export function syncAll(
  direction: SyncDirection,
  beadsFns: {
    listIssues: () => BeadsIssue[];
    updateIssue: (id: string, opts: { status?: string }) => void;
    closeIssue: (id: string) => void;
  },
  dir?: string,
): SyncResult[] {
  const root = dir ?? process.cwd();
  const results: SyncResult[] = [];

  let issues: BeadsIssue[];
  try {
    issues = beadsFns.listIssues();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return [{
      storyKey: '',
      beadsId: '',
      previousStatus: '',
      newStatus: '',
      synced: false,
      error: `Failed to list beads issues: ${message}`,
    }];
  }
  const cachedListIssues = () => issues;

  for (const issue of issues) {
    const storyFilePath = resolveStoryFilePath(issue);
    if (!storyFilePath) {
      continue;
    }

    const storyKey = storyKeyFromPath(storyFilePath);

    try {
      if (direction === 'beads-to-files' || direction === 'bidirectional') {
        const result = syncBeadsToStoryFile(issue.id, { listIssues: cachedListIssues }, root);
        results.push(result);
      } else if (direction === 'files-to-beads') {
        const result = syncStoryFileToBeads(storyKey, {
          listIssues: cachedListIssues,
          updateIssue: beadsFns.updateIssue,
          closeIssue: beadsFns.closeIssue,
        }, root);
        results.push(result);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        storyKey,
        beadsId: issue.id,
        previousStatus: '',
        newStatus: '',
        synced: false,
        error: message,
      });
    }
  }
  return results;
}
