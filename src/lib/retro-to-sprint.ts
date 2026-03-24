/**
 * Retro-to-Sprint pipeline: processes retro action items into TD stories
 * and manages the persistent epic-TD in sprint state.
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseRetroSections, isDuplicate } from './retro-parser.js';
import type { RetroSectionItem } from './retro-parser.js';
import type { SprintState, EpicState, StoryState } from '../types/state.js';

/** Result of processing retro action items */
export interface ProcessRetroResult {
  readonly updatedState: SprintState;
  readonly created: string[];
  readonly skipped: string[];
  readonly backlogAppended: string[];
}

/**
 * Generate a slug from item text.
 * Lowercase, replace non-alphanumeric with hyphens, truncate to 40 chars, trim trailing hyphens.
 */
export function generateSlug(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return slug || 'untitled';
}

/**
 * Scan existing TD-* story keys and return the next story number.
 * Returns max existing N + 1, or 1 if none exist.
 */
export function nextTdStoryNumber(state: SprintState): number {
  let max = 0;
  for (const key of Object.keys(state.stories)) {
    const match = key.match(/^TD-(\d+)-/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
  }
  return max + 1;
}

/**
 * Ensure epic-TD exists in state. Creates it if absent.
 * Returns updated state (immutable — returns new object).
 */
export function ensureEpicTd(state: SprintState): SprintState {
  if (state.epics['epic-TD']) return state;
  const epicTd: EpicState = {
    status: 'in-progress',
    storiesTotal: 0,
    storiesDone: 0,
  };
  return {
    ...state,
    epics: { ...state.epics, 'epic-TD': epicTd },
  };
}

/**
 * Add a TD story to sprint state. Increments epic-TD.storiesTotal.
 * Returns updated state.
 */
export function createTdStory(state: SprintState, slug: string): SprintState {
  const num = nextTdStoryNumber(state);
  const key = `TD-${num}-${slug}`;
  const story: StoryState = {
    status: 'backlog',
    attempts: 0,
    lastAttempt: null,
    lastError: null,
    proofPath: null,
    acResults: null,
  };
  const currentEpic = state.epics['epic-TD'];
  const updatedEpic: EpicState = {
    status: 'in-progress',
    storiesTotal: (currentEpic?.storiesTotal ?? 0) + 1,
    storiesDone: currentEpic?.storiesDone ?? 0,
  };
  return {
    ...state,
    stories: { ...state.stories, [key]: story },
    epics: { ...state.epics, 'epic-TD': updatedEpic },
  };
}

/**
 * Append backlog items to tech-debt-backlog.md at project root.
 * Creates the file with a header if it doesn't exist.
 */
function appendToBacklogFile(items: string[], projectRoot: string): void {
  const filePath = join(projectRoot, 'tech-debt-backlog.md');
  const date = new Date().toISOString().slice(0, 10);

  let content = '';
  if (existsSync(filePath)) {
    content = readFileSync(filePath, 'utf-8');
  } else {
    content = '## Backlog Items (auto-appended from retros)\n\n';
  }

  for (const item of items) {
    content += `- [${date}] ${item}\n`;
  }

  writeFileSync(filePath, content, 'utf-8');
}

/**
 * Get existing TD story titles from state for deduplication.
 */
function getExistingTdTitles(state: SprintState): string[] {
  return Object.keys(state.stories)
    .filter(k => k.startsWith('TD-'))
    .map(k => k.replace(/^TD-\d+-/, '').replace(/-/g, ' '));
}

/**
 * Process retro action items into TD stories and backlog entries.
 *
 * - fix-now and fix-soon items: create TD-N-slug stories (with dedup check)
 * - backlog items: append to tech-debt-backlog.md (no sprint-state stories)
 */
export function processRetroActionItems(
  retroContent: string,
  state: SprintState,
  projectRoot?: string,
): ProcessRetroResult {
  const sectionItems = parseRetroSections(retroContent);
  const created: string[] = [];
  const skipped: string[] = [];
  const backlogAppended: string[] = [];

  let current = ensureEpicTd(state);

  const backlogItems: string[] = [];

  for (const item of sectionItems) {
    if (item.section === 'backlog') {
      backlogItems.push(item.text);
      backlogAppended.push(item.text);
      continue;
    }

    // fix-now or fix-soon: create TD story
    const existingTitles = getExistingTdTitles(current);
    const dedupResult = isDuplicate(item.text, existingTitles);
    if (dedupResult.duplicate) {
      console.log(`[INFO] Skipping duplicate: "${item.text}" (matches: "${dedupResult.matchedTitle}")`);
      skipped.push(item.text);
      continue;
    }

    const slug = generateSlug(item.text);
    current = createTdStory(current, slug);
    created.push(item.text);
  }

  // Append backlog items to file (only report as appended if actually written)
  if (backlogItems.length > 0 && projectRoot) {
    appendToBacklogFile(backlogItems, projectRoot);
  } else if (backlogItems.length > 0 && !projectRoot) {
    // No projectRoot — items were parsed but not persisted; clear appended list
    backlogAppended.length = 0;
  }

  return { updatedState: current, created, skipped, backlogAppended };
}
