import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyPatch } from './patch-engine.js';
import { PATCH_TEMPLATES } from '../templates/bmad-patches.js';
import { warn } from './output.js';
import { buildGapId, findExistingByGapId, appendGapId } from './beads.js';
import type { BeadsIssue } from './beads.js';

export class BmadError extends Error {
  constructor(
    public readonly command: string,
    public readonly originalMessage: string,
  ) {
    super(`BMAD failed: ${originalMessage}. Command: ${command}`);
    this.name = 'BmadError';
  }
}

export interface BmadInstallResult {
  status: 'installed' | 'already-installed' | 'failed';
  version: string | null;
  patches_applied: string[];
}

export interface PatchResult {
  patchName: string;
  targetFile: string;
  applied: boolean;
  updated: boolean;
  error?: string;
}

/**
 * Maps each patch name to its target file path relative to `_bmad/`.
 */
export const PATCH_TARGETS: Record<string, string> = {
  'story-verification': 'bmm/workflows/4-implementation/create-story/template.md',
  'dev-enforcement': 'bmm/workflows/4-implementation/dev-story/checklist.md',
  'review-enforcement': 'bmm/workflows/4-implementation/code-review/checklist.md',
  'retro-enforcement': 'bmm/workflows/4-implementation/retrospective/instructions.md',
  'sprint-beads': 'bmm/workflows/4-implementation/sprint-planning/checklist.md',
};

/**
 * Checks if BMAD is installed by looking for `_bmad/` directory.
 */
export function isBmadInstalled(dir?: string): boolean {
  const bmadDir = join(dir ?? process.cwd(), '_bmad');
  return existsSync(bmadDir);
}

/**
 * Detects the BMAD version by reading `_bmad/core/module.yaml` or `_bmad/VERSION`.
 * Returns version string or null if undetectable.
 */
export function detectBmadVersion(dir?: string): string | null {
  const root = dir ?? process.cwd();

  // Try core/module.yaml first (BMAD v6+ format)
  const moduleYamlPath = join(root, '_bmad', 'core', 'module.yaml');
  if (existsSync(moduleYamlPath)) {
    try {
      const content = readFileSync(moduleYamlPath, 'utf-8');
      const versionMatch = content.match(/version:\s*["']?([^\s"']+)["']?/);
      if (versionMatch) {
        return versionMatch[1];
      }
    } catch {
      // Fall through to other methods
    }
  }

  // Try VERSION file
  const versionFilePath = join(root, '_bmad', 'VERSION');
  if (existsSync(versionFilePath)) {
    try {
      return readFileSync(versionFilePath, 'utf-8').trim() || null;
    } catch {
      // Fall through
    }
  }

  // Try package.json in _bmad
  const packageJsonPath = join(root, '_bmad', 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version?: string };
      return pkg.version ?? null;
    } catch {
      // Fall through
    }
  }

  return null;
}

/**
 * Installs BMAD Method via `npx bmad-method init`.
 * If `_bmad/` already exists, skips installation and returns `already-installed`.
 * On failure, throws BmadError.
 */
export function installBmad(dir?: string): BmadInstallResult {
  const root = dir ?? process.cwd();

  if (isBmadInstalled(root)) {
    const version = detectBmadVersion(root);
    return {
      status: 'already-installed',
      version,
      patches_applied: [],
    };
  }

  const cmdStr = 'npx bmad-method init';
  try {
    execFileSync('npx', ['bmad-method', 'init'], {
      stdio: 'pipe',
      timeout: 60_000,
      cwd: root,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new BmadError(cmdStr, message);
  }

  const version = detectBmadVersion(root);
  return {
    status: 'installed',
    version,
    patches_applied: [],
    bmalph_detected: false,
  };
}

/**
 * Applies all 5 harness patches to BMAD workflow files.
 * Handles missing target files gracefully with warnings.
 * Returns array of results per patch.
 */
export function applyAllPatches(dir?: string): PatchResult[] {
  const root = dir ?? process.cwd();
  const results: PatchResult[] = [];

  for (const [patchName, relativePath] of Object.entries(PATCH_TARGETS)) {
    const targetFile = join(root, '_bmad', relativePath);

    if (!existsSync(targetFile)) {
      warn(`Patch target not found: ${relativePath}`);
      results.push({
        patchName,
        targetFile,
        applied: false,
        updated: false,
        error: `File not found: ${relativePath}`,
      });
      continue;
    }

    const templateFn = PATCH_TEMPLATES[patchName];
    if (!templateFn) {
      results.push({
        patchName,
        targetFile,
        applied: false,
        updated: false,
        error: `No template function for patch: ${patchName}`,
      });
      continue;
    }

    try {
      const patchContent = templateFn();
      const patchResult = applyPatch(targetFile, patchName, patchContent);
      results.push({
        patchName,
        targetFile,
        applied: patchResult.applied,
        updated: patchResult.updated,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        patchName,
        targetFile,
        applied: false,
        updated: false,
        error: message,
      });
    }
  }

  return results;
}

// ─── BMAD Epics/Stories Parser ───────────────────────────────────────────────

export interface ParsedStory {
  epicNumber: number;
  storyNumber: number;
  key: string;
  title: string;
  userStory: string;
  acceptanceCriteria: string[];
  technicalNotes: string | null;
}

export interface ParsedEpic {
  number: number;
  title: string;
  stories: ParsedStory[];
}

/**
 * Generates a story key from epic and story numbers.
 * e.g. epicNumber=3, storyNumber=3, title="BMAD Parser & Story Bridge Command"
 * → "3-3-bmad-parser-story-bridge-command"
 */
function generateStoryKey(epicNumber: number, storyNumber: number, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${epicNumber}-${storyNumber}-${slug}`;
}

/**
 * Returns the conventional path to a story implementation file.
 */
export function getStoryFilePath(storyKey: string): string {
  return `_bmad-output/implementation-artifacts/${storyKey}.md`;
}

/**
 * Parses a BMAD epics markdown file into structured data.
 * Handles `## Epic N:` and `### Epic N:` headers, `### Story N.M:` headers,
 * "As a/I want/So that" user stories, Given/When/Then acceptance criteria,
 * and Technical notes sections.
 */
export function parseEpicsFile(filePath: string): ParsedEpic[] {
  if (!existsSync(filePath)) {
    return [];
  }

  const content = readFileSync(filePath, 'utf-8');
  if (!content.trim()) {
    return [];
  }

  const lines = content.split('\n');
  const epics: ParsedEpic[] = [];

  let currentEpic: ParsedEpic | null = null;
  let currentStory: {
    epicNumber: number;
    storyNumber: number;
    title: string;
    lines: string[];
  } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match epic header: ## Epic N: Title or ### Epic N: Title
    const epicMatch = line.match(/^#{2,3}\s+Epic\s+(\d+):\s*(.+)$/);
    if (epicMatch) {
      // Finalize previous story
      if (currentStory && currentEpic) {
        currentEpic.stories.push(finalizeStory(currentStory));
        currentStory = null;
      }

      const epicNum = parseInt(epicMatch[1], 10);
      const epicTitle = epicMatch[2].trim();

      // If an epic with this number already exists (e.g. summary section vs full definition),
      // replace it with the later occurrence which has the actual story content.
      const existingIdx = epics.findIndex(e => e.number === epicNum);
      if (existingIdx !== -1) {
        currentEpic = {
          number: epicNum,
          title: epicTitle,
          stories: [],
        };
        epics[existingIdx] = currentEpic;
      } else {
        currentEpic = {
          number: epicNum,
          title: epicTitle,
          stories: [],
        };
        epics.push(currentEpic);
      }
      continue;
    }

    // Match story header: ### Story N.M: Title
    const storyMatch = line.match(/^###\s+Story\s+(\d+)\.(\d+):\s*(.+)$/);
    if (storyMatch) {
      // Finalize previous story
      if (currentStory && currentEpic) {
        currentEpic.stories.push(finalizeStory(currentStory));
      }

      currentStory = {
        epicNumber: parseInt(storyMatch[1], 10),
        storyNumber: parseInt(storyMatch[2], 10),
        title: storyMatch[3].trim(),
        lines: [],
      };
      continue;
    }

    // Accumulate lines for current story
    if (currentStory) {
      currentStory.lines.push(line);
    }
  }

  // Finalize last story
  if (currentStory && currentEpic) {
    currentEpic.stories.push(finalizeStory(currentStory));
  }

  return epics;
}

function finalizeStory(raw: {
  epicNumber: number;
  storyNumber: number;
  title: string;
  lines: string[];
}): ParsedStory {
  const body = raw.lines.join('\n');

  // Extract user story (As a ... I want ... So that ...)
  const userStoryMatch = body.match(
    /As\s+a[n]?\s+.+?,\s*\n\s*I\s+want\s+.+?,\s*\n\s*So\s+that\s+.+?\./s
  );
  const userStory = userStoryMatch ? userStoryMatch[0].trim() : '';

  // Extract acceptance criteria — each Given/When/Then block
  const acceptanceCriteria: string[] = [];
  const acBlockRegex = /\*\*Given\*\*\s+.+?(?=\n\n\*\*Given\*\*|\n\n\*\*Technical\s+notes|\n\n---|\n\n##|\n\n###|$)/gs;
  let acMatch: RegExpExecArray | null;
  while ((acMatch = acBlockRegex.exec(body)) !== null) {
    acceptanceCriteria.push(acMatch[0].trim());
  }

  // Extract technical notes
  let technicalNotes: string | null = null;
  const techMatch = body.match(/\*\*Technical\s+notes:\*\*\s*\n([\s\S]*?)(?=\n\n---|\n\n##|\n\n###|$)/);
  if (techMatch) {
    technicalNotes = techMatch[1].trim() || null;
  }

  const key = generateStoryKey(raw.epicNumber, raw.storyNumber, raw.title);

  return {
    epicNumber: raw.epicNumber,
    storyNumber: raw.storyNumber,
    key,
    title: raw.title,
    userStory,
    acceptanceCriteria,
    technicalNotes,
  };
}

// ─── Bridge Import Logic ────────────────────────────────────────────────────

export interface BridgeImportResult {
  storyKey: string;
  title: string;
  beadsId: string | null;
  status: 'created' | 'exists' | 'skipped' | 'failed';
  storyFilePath: string;
  error?: string;
}

/**
 * Imports parsed stories into beads as issues.
 * Handles deduplication by title, dry-run mode, and dependency chaining.
 */
export function importStoriesToBeads(
  stories: ParsedStory[],
  opts: { dryRun?: boolean },
  beadsFns: {
    listIssues: () => BeadsIssue[];
    createIssue: (title: string, createOpts?: {
      type?: string;
      priority?: number;
      description?: string;
      deps?: string[];
    }) => BeadsIssue;
  },
): BridgeImportResult[] {
  const results: BridgeImportResult[] = [];

  // Load existing issues for deduplication (also in dry-run to show accurate status)
  let existingIssues: BeadsIssue[] = [];
  try {
    existingIssues = beadsFns.listIssues();
  } catch {
    // If listIssues fails, proceed without dedup — createIssue will still work
  }

  // Track beads IDs per epic for dependency chaining
  const lastBeadsIdByEpic = new Map<number, string>();
  let priority = 1;

  for (const story of stories) {
    const storyFilePath = getStoryFilePath(story.key);
    const gapId = buildGapId('bridge', `${story.epicNumber}.${story.storyNumber}`);

    // Gap-id-based deduplication check
    const existingIssue = findExistingByGapId(gapId, existingIssues);
    if (existingIssue) {
      lastBeadsIdByEpic.set(story.epicNumber, existingIssue.id);
      results.push({
        storyKey: story.key,
        title: story.title,
        beadsId: existingIssue.id,
        status: 'exists',
        storyFilePath,
      });
      priority++;
      continue;
    }

    // Dry run — skip actual creation
    if (opts.dryRun) {
      results.push({
        storyKey: story.key,
        title: story.title,
        beadsId: null,
        status: 'skipped',
        storyFilePath,
      });
      priority++;
      continue;
    }

    // Build deps from previous story in same epic
    const deps: string[] = [];
    const prevId = lastBeadsIdByEpic.get(story.epicNumber);
    if (prevId) {
      deps.push(prevId);
    }

    try {
      const description = appendGapId(storyFilePath, gapId);
      const issue = beadsFns.createIssue(story.title, {
        type: 'story',
        priority,
        description,
        deps: deps.length > 0 ? deps : undefined,
      });

      lastBeadsIdByEpic.set(story.epicNumber, issue.id);

      results.push({
        storyKey: story.key,
        title: story.title,
        beadsId: issue.id,
        status: 'created',
        storyFilePath,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        storyKey: story.key,
        title: story.title,
        beadsId: null,
        status: 'failed',
        storyFilePath,
        error: message,
      });
    }

    priority++;
  }

  return results;
}
