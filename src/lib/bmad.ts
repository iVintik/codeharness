import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentRuntime } from '../modules/infra/index.js';
import { PATCH_TEMPLATES } from '../templates/bmad-patches.js';
import { warn } from './output.js';

const BMAD_MODULES = 'bmm';

function getBmadToolTarget(agentRuntime: AgentRuntime): string {
  return agentRuntime === 'codex' ? 'none' : 'claude-code';
}

function getBmadInstallArgs(root: string, agentRuntime: AgentRuntime): string[] {
  return [
    'bmad-method',
    'install',
    '--yes',
    '--directory',
    root,
    '--modules',
    BMAD_MODULES,
    '--tools',
    getBmadToolTarget(agentRuntime),
  ];
}

function getBmadInstallCommand(root: string, agentRuntime: AgentRuntime): string {
  return `npx ${getBmadInstallArgs(root, agentRuntime).join(' ')}`;
}

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
  'dev-enforcement': 'bmm/workflows/4-implementation/dev-story/instructions.xml',
  'review-enforcement': 'bmm/workflows/4-implementation/code-review/instructions.xml',
  'retro-enforcement': 'bmm/workflows/4-implementation/retrospective/instructions.md',
  'sprint-beads': 'bmm/workflows/4-implementation/sprint-planning/checklist.md',
  'sprint-retro': 'bmm/workflows/4-implementation/sprint-planning/instructions.md',
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
      // IGNORE: file read may fail, fall through to other methods
    }
  }

  // Try VERSION file
  const versionFilePath = join(root, '_bmad', 'VERSION');
  if (existsSync(versionFilePath)) {
    try {
      return readFileSync(versionFilePath, 'utf-8').trim() || null;
    } catch {
      // IGNORE: VERSION file may be unreadable, fall through
    }
  }

  // Try package.json in _bmad
  const packageJsonPath = join(root, '_bmad', 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version?: string };
      return pkg.version ?? null;
    } catch {
      // IGNORE: package.json may be malformed, fall through
    }
  }

  return null;
}

/**
 * Installs BMAD Method via `npx bmad-method install`.
 * If `_bmad/` already exists, skips installation and returns `already-installed`.
 * On failure, throws BmadError.
 */
export function installBmad(dir?: string, agentRuntime: AgentRuntime = 'claude-code'): BmadInstallResult {
  const root = dir ?? process.cwd();

  if (isBmadInstalled(root)) {
    const version = detectBmadVersion(root);
    return {
      status: 'already-installed',
      version,
      patches_applied: [],
    };
  }

  const cmdArgs = getBmadInstallArgs(root, agentRuntime);
  const cmdStr = getBmadInstallCommand(root, agentRuntime);
  try {
    execFileSync('npx', cmdArgs, {
      // stdin ignored to force non-interactive mode - BMAD v6 uses @clack/prompts which
      // can still prompt even with --yes flag (see BMAD issues #1803, #1962)
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 180_000, // 3 min — npx may need to download the package first time
      cwd: root,
      env: {
        ...process.env,
        // Force CI mode to suppress any remaining interactive prompts
        CI: '1',
        // Disable colors to avoid TUI rendering issues
        FORCE_COLOR: '0',
        // Ensure no TTY detection tricks work
        TERM: 'dumb',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new BmadError(cmdStr, message);
  }

  // Verify that _bmad/ was actually created
  if (!isBmadInstalled(root)) {
    throw new BmadError(cmdStr, '_bmad/ directory was not created after successful npx bmad-method install');
  }

  const version = detectBmadVersion(root);
  return {
    status: 'installed',
    version,
    patches_applied: [],
  };
}

/**
 * Applies all harness patches to BMAD workflow files.
 * Handles missing target files gracefully with warnings.
 * Returns array of results per patch.
 */
export function applyAllPatches(dir?: string, options?: { silent?: boolean }): PatchResult[] {
  const root = dir ?? process.cwd();
  const silent = options?.silent ?? false;
  const results: PatchResult[] = [];

  for (const [patchName, relativePath] of Object.entries(PATCH_TARGETS)) {
    const targetFile = join(root, '_bmad', relativePath);

    if (!existsSync(targetFile)) {
      if (!silent) warn(`Patch target not found: ${relativePath}`);
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
      // TODO: v2 workflow-engine (Epic 5) — patch engine removed, applyPatch no longer available
      // For now, patches are not applied. The patch engine will be rebuilt in the v2 architecture.
      const _patchContent = templateFn();
      results.push({
        patchName,
        targetFile,
        applied: false,
        updated: false,
        error: 'Patch engine removed (Story 1.2) — pending v2 rebuild',
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

/**
 * Detects bmalph (predecessor to codeharness) artifacts in the project.
 * Checks for `.ralph/.ralphrc` and other bmalph-specific config files.
 * Returns detection result with list of found files.
 */
export function detectBmalph(dir?: string): { detected: boolean; files: string[] } {
  const root = dir ?? process.cwd();
  const files: string[] = [];

  // Check for .ralph/.ralphrc (bmalph configuration file)
  const ralphRcPath = join(root, '.ralph', '.ralphrc');
  if (existsSync(ralphRcPath)) {
    files.push('.ralph/.ralphrc');
  }

  // Check for .ralph/ directory itself (not to be confused with ralph/ used by codeharness)
  const dotRalphDir = join(root, '.ralph');
  if (existsSync(dotRalphDir)) {
    // Only count .ralph/ if it contains bmalph-specific files
    // The presence of .ralphrc is the key indicator
    if (files.length === 0) {
      // .ralph/ exists but no .ralphrc — still note the directory
      files.push('.ralph/');
    }
  }

  return { detected: files.length > 0, files };
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

// TODO: v2 issue tracker (Epic 8) — importStoriesToBeads and BridgeImportResult removed with beads cleanup
