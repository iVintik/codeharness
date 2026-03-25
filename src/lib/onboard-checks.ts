/**
 * Onboard precondition checks and gap filtering.
 *
 * Story 8.2: Checks prerequisites before onboarding and filters
 * already-tracked gaps using the gap-id system from story 8-1.
 */

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getStatePath, readState } from './state.js';
import { isBmadInstalled } from './bmad.js';
import { buildGapId, findExistingByGapId } from './beads.js';
import type { BeadsIssue } from './beads.js';
import type { OnboardingStory } from './epic-generator.js';
import { readSprintStatusFromState } from '../modules/sprint/index.js';
import { checkPerFileCoverage } from './coverage/index.js';
import { isStackRunning } from './docker/index.js';

// ─── Precondition Checks ────────────────────────────────────────────────────

export function checkHarnessInitialized(dir?: string): { ok: boolean } {
  const statePath = getStatePath(dir ?? process.cwd());
  return { ok: existsSync(statePath) };
}

export function checkBmadInstalled(dir?: string): { ok: boolean } {
  return { ok: isBmadInstalled(dir) };
}

export function checkHooksRegistered(dir?: string): { ok: boolean } {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const hooksPath = join(__dirname, '..', '..', 'hooks', 'hooks.json');
  return { ok: existsSync(hooksPath) };
}

export interface PreconditionResult {
  canProceed: boolean;
  warnings: string[];
  initialized: boolean;
  bmad: boolean;
  hooks: boolean;
}

export function runPreconditions(dir?: string): PreconditionResult {
  const harnessCheck = checkHarnessInitialized(dir);
  if (!harnessCheck.ok) {
    return {
      canProceed: false,
      warnings: [],
      initialized: false,
      bmad: false,
      hooks: false,
    };
  }

  const warnings: string[] = [];
  const bmadCheck = checkBmadInstalled(dir);
  const hooksCheck = checkHooksRegistered(dir);

  if (!bmadCheck.ok) {
    warnings.push(
      "BMAD not installed \u2014 generated stories won't be executable until init completes",
    );
  }
  if (!hooksCheck.ok) {
    warnings.push("Hooks not registered \u2014 enforcement won't be active");
  }

  return {
    canProceed: true,
    warnings,
    initialized: true,
    bmad: bmadCheck.ok,
    hooks: hooksCheck.ok,
  };
}

// ─── Verification Gap Detection ─────────────────────────────────────────────

/**
 * Story pattern: keys like "1-1-xxx", "4-2-yyy" — starts with digit-digit-.
 * Excludes epic/retrospective entries (e.g., "epic-1", "epic-1-retrospective").
 */
const STORY_KEY_PATTERN = /^\d+-\d+-/;

/**
 * Finds stories marked 'done' in sprint-status.yaml that lack proof documents.
 *
 * Instead of creating meta-stories ("create verification proof for X"),
 * this resets unverified stories back to 'verifying' status so they go through
 * the real verification pipeline (showboat exec + showboat verify).
 *
 * Returns the count of stories reset for reporting purposes.
 */
export function findVerificationGaps(dir?: string): OnboardingStory[] {
  const statuses = readSprintStatusFromState();
  const root = dir ?? process.cwd();
  const unverified: string[] = [];

  for (const [key, status] of Object.entries(statuses)) {
    if (status !== 'done') continue;
    if (!STORY_KEY_PATTERN.test(key)) continue;

    const proofPath = join(root, 'verification', `${key}-proof.md`);
    if (!existsSync(proofPath)) {
      unverified.push(key);
    }
  }

  // Verification is a gate on stories, not a separate story.
  // Instead of generating meta-stories, we return an empty array.
  // The harness-run workflow handles verification as Step 3d of every story lifecycle.
  // Unverified stories should be reset to 'verifying' status via the onboard command.
  return [];
}

// ─── Per-File Coverage Gap Detection ────────────────────────────────────────

/**
 * Finds files below the coverage floor using checkPerFileCoverage.
 */
export function findPerFileCoverageGaps(floor: number, dir?: string): OnboardingStory[] {
  const result = checkPerFileCoverage(floor, dir);
  const stories: OnboardingStory[] = [];
  let counter = 1;

  for (const violation of result.violations) {
    stories.push({
      key: `0.fc${counter}`,
      title: `Add test coverage for ${violation.file}`,
      type: 'coverage',
      module: violation.file,
      acceptanceCriteria: [
        `**Given** ${violation.file} has ${violation.statements}% statement coverage (below ${floor}% floor)\n**When** the agent writes tests\n**Then** ${violation.file} reaches at least ${floor}% statement coverage`,
      ],
    });
    counter++;
  }

  return stories;
}

// ─── Observability Gap Detection ────────────────────────────────────────────

/**
 * Checks observability readiness: OTLP config and Docker stack status.
 */
export function findObservabilityGaps(dir?: string): OnboardingStory[] {
  let state;
  try {
    state = readState(dir);
  } catch {
    // IGNORE: state file missing, fail open
    return [];
  }

  const stories: OnboardingStory[] = [];

  // Check OTLP config
  if (!state.otlp?.enabled) {
    stories.push({
      key: '0.o1',
      title: 'Configure OTLP instrumentation',
      type: 'observability',
      module: 'otlp-config',
      acceptanceCriteria: [
        '**Given** observability is enabled but OTLP is not configured\n**When** onboard runs\n**Then** OTLP instrumentation must be configured with endpoint and service name',
      ],
    });
  }

  // Check Docker stack
  if (state.docker?.compose_file) {
    if (!isStackRunning(state.docker.compose_file)) {
      stories.push({
        key: '0.o2',
        title: 'Start Docker observability stack',
        type: 'observability',
        module: 'docker-stack',
        acceptanceCriteria: [
          '**Given** observability is enabled but Docker stack is not running\n**When** onboard runs\n**Then** Docker observability stack must be started',
        ],
      });
    }
  } else {
    // No compose file configured at all
    stories.push({
      key: '0.o2',
      title: 'Start Docker observability stack',
      type: 'observability',
      module: 'docker-stack',
      acceptanceCriteria: [
        '**Given** observability is enabled but Docker compose file is not configured\n**When** onboard runs\n**Then** Docker observability stack must be configured and started',
      ],
    });
  }

  return stories;
}

// ─── Onboarding Progress Tracking ────────────────────────────────────────────

const GAP_ID_PATTERN = /\[gap:[a-z-]+:[^\]]+\]/;

/**
 * Computes onboarding progress by counting gap-tagged beads issues.
 * Returns null if no gap-tagged issues exist or beads is unavailable.
 */
export function getOnboardingProgress(
  beadsFns: { listIssues: () => BeadsIssue[] },
): { total: number; resolved: number; remaining: number } | null {
  let issues: BeadsIssue[];
  try {
    issues = beadsFns.listIssues();
  } catch {
    // IGNORE: beads unavailable, cannot count gap progress
    return null;
  }

  const gapIssues = issues.filter(
    issue => issue.description && GAP_ID_PATTERN.test(issue.description),
  );

  if (gapIssues.length === 0) {
    return null;
  }

  const total = gapIssues.length;
  const resolved = gapIssues.filter(
    issue => issue.status === 'done' || issue.status === 'closed',
  ).length;

  return { total, resolved, remaining: total - resolved };
}

// ─── Gap Filtering ──────────────────────────────────────────────────────────

/**
 * Maps an OnboardingStory to its gap-id string based on story type.
 */
export function storyToGapId(story: OnboardingStory): string {
  switch (story.type) {
    case 'coverage':
      return buildGapId('coverage', story.module!);
    case 'agents-md':
      return buildGapId('docs', story.module + '/AGENTS.md');
    case 'architecture':
      return buildGapId('docs', 'ARCHITECTURE.md');
    case 'doc-freshness':
      return buildGapId('docs', 'stale-docs');
    case 'verification':
      return buildGapId('verification', story.storyKey!);
    case 'observability':
      return buildGapId('observability', story.module!);
  }
}

/**
 * Filters onboarding stories to only those not yet tracked in beads.
 * Fails open: if listIssues throws, returns all stories as untracked.
 */
export function filterTrackedGaps(
  stories: OnboardingStory[],
  beadsFns: { listIssues: () => BeadsIssue[] },
): { untracked: OnboardingStory[]; trackedCount: number } {
  let existingIssues: BeadsIssue[];
  try {
    existingIssues = beadsFns.listIssues();
  } catch {
    // IGNORE: beads unavailable, return all as untracked
    return { untracked: [...stories], trackedCount: 0 };
  }

  const untracked: OnboardingStory[] = [];
  let trackedCount = 0;

  for (const story of stories) {
    const gapId = storyToGapId(story);
    const existing = findExistingByGapId(gapId, existingIssues);
    if (existing) {
      trackedCount++;
    } else {
      untracked.push(story);
    }
  }

  return { untracked, trackedCount };
}
