/**
 * Audit fix story generator — creates BMAD-format stories for audit gaps.
 *
 * FR15: `audit --fix` generates stories for gaps.
 * NFR6: Generated stories follow BMAD format.
 *
 * Architecture Decision 4: Coordinator Pattern extension.
 */

import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ok, fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type { AuditResult, AuditGap } from './types.js';
import type { FixStoryResult, FixGenerationResult } from './fix-types.js';
import {
  getSprintState,
  writeStateAtomic,
  computeSprintCounts,
} from '../sprint/index.js';
import type { StoryState } from '../../types/state.js';

// ─── Story Key Generation (Task 2.2) ────────────────────────────────────────

/**
 * Generate a deterministic, filesystem-safe key for an audit gap.
 * Format: audit-fix-{dimension}-{index}
 */
export function buildStoryKey(gap: AuditGap, index: number): string {
  const safeDimension = gap.dimension
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `audit-fix-${safeDimension}-${index}`;
}

// ─── Story Markdown Rendering (Task 2.3) ────────────────────────────────────

/**
 * Render BMAD-format markdown for a fix story.
 * Includes user story, Given/When/Then AC, and Dev Notes with gap details.
 */
export function buildStoryMarkdown(gap: AuditGap, _key: string): string {
  return [
    `# Fix: ${gap.dimension} — ${gap.description}`,
    '',
    'Status: backlog',
    '',
    '## Story',
    '',
    `As an operator, I need ${gap.description} fixed so that audit compliance improves.`,
    '',
    '## Acceptance Criteria',
    '',
    `1. **Given** ${gap.description}, **When** the fix is applied, **Then** ${gap.suggestedFix}.`,
    '',
    '## Dev Notes',
    '',
    'This is an auto-generated fix story created by `codeharness audit --fix`.',
    `**Audit Gap:** ${gap.dimension}: ${gap.description}`,
    `**Suggested Fix:** ${gap.suggestedFix}`,
    '',
  ].join('\n');
}

// ─── Fix Story Generation (Task 2.1) ────────────────────────────────────────

/**
 * Generate fix stories for all gaps in the audit result.
 * Skips gaps whose story file already exists (idempotent).
 */
export function generateFixStories(
  auditResult: AuditResult,
): Result<FixGenerationResult> {
  try {
    const stories: FixStoryResult[] = [];
    let created = 0;
    let skipped = 0;

    const artifactsDir = join(
      process.cwd(),
      '_bmad-output',
      'implementation-artifacts',
    );

    // Iterate all gaps across all dimensions
    for (const dimension of Object.values(auditResult.dimensions)) {
      for (let i = 0; i < dimension.gaps.length; i++) {
        const gap = dimension.gaps[i];
        const key = buildStoryKey(gap, i + 1);
        const filePath = join(artifactsDir, `${key}.md`);

        // AC #6: Skip if file already exists
        if (existsSync(filePath)) {
          stories.push({
            key,
            filePath,
            gap,
            skipped: true,
            skipReason: 'Story file already exists',
          });
          skipped++;
          continue;
        }

        // Write story file
        const markdown = buildStoryMarkdown(gap, key);
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, markdown, 'utf-8');

        stories.push({ key, filePath, gap, skipped: false });
        created++;
      }
    }

    return ok({ stories, created, skipped });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Failed to generate fix stories: ${msg}`);
  }
}

// ─── Sprint State Integration (Task 3) ──────────────────────────────────────

/**
 * Add generated fix stories to sprint-state.json as backlog entries.
 * Uses atomic write pattern. Creates default state if file missing.
 */
export function addFixStoriesToState(
  stories: FixStoryResult[],
): Result<void> {
  // Filter to only non-skipped stories
  const newStories = stories.filter(s => !s.skipped);
  if (newStories.length === 0) {
    return ok(undefined);
  }

  // AC #9: getSprintState returns defaultState() when file missing
  const stateResult = getSprintState();
  if (!stateResult.success) {
    return fail(stateResult.error);
  }

  const current = stateResult.data;

  // Add each new story as a backlog entry
  const updatedStories: Record<string, StoryState> = { ...current.stories };
  for (const story of newStories) {
    updatedStories[story.key] = {
      status: 'backlog',
      attempts: 0,
      lastAttempt: null,
      lastError: null,
      proofPath: null,
      acResults: null,
    };
  }

  // Recompute sprint counts
  const updatedSprint = computeSprintCounts(updatedStories);

  // AC #8: Write atomically
  return writeStateAtomic({
    ...current,
    sprint: updatedSprint,
    stories: updatedStories,
  });
}
