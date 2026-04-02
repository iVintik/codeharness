/**
 * Onboarding epic generation from scan findings.
 *
 * Story 6.2: Maps scan results, coverage gaps, and doc audit findings
 * into an onboarding epic with stories, writes markdown, handles approval,
 * for the onboarding flow.
 */

import { createInterface } from 'node:readline';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseEpicsFile } from './bmad.js';
import type { ParsedStory } from './bmad.js';
import type { ScanResult, CoverageGapReport, DocAuditResult } from './scanner.js';
// ─── Types ──────────────────────────────────────────────────────────────────

export interface OnboardingStory {
  key: string;
  title: string;
  type: 'coverage' | 'agents-md' | 'architecture' | 'doc-freshness' | 'verification' | 'observability';
  module?: string;
  storyKey?: string;
  acceptanceCriteria: string[];
}

export interface EpicSummary {
  totalStories: number;
  coverageStories: number;
  docStories: number;
  verificationStories: number;
  observabilityStories: number;
}

export interface OnboardingEpic {
  title: string;
  generatedAt: string;
  stories: OnboardingStory[];
  summary: EpicSummary;
}

// ─── Priority Mapping ───────────────────────────────────────────────────────

const PRIORITY_BY_TYPE: Record<OnboardingStory['type'], number> = {
  observability: 1,
  coverage: 2,
  verification: 2,
  'agents-md': 3,
  architecture: 3,
  'doc-freshness': 3,
};

// ─── Epic Generation ────────────────────────────────────────────────────────

/**
 * Generates an onboarding epic from scan findings.
 * Maps coverage gaps, missing docs, stale docs, and bmalph artifacts to stories.
 *
 * @param rootDir - Project root directory (defaults to cwd)
 */
export function generateOnboardingEpic(
  scan: ScanResult,
  coverage: CoverageGapReport,
  audit: DocAuditResult,
  rootDir?: string,
): OnboardingEpic {
  const root = rootDir ?? process.cwd();
  const stories: OnboardingStory[] = [];
  let storyNum = 1;

  // README.md story — verification gate requires it (Epic 13, story 13-2)
  const readmeDoc = audit.documents.find(d => d.name === 'README.md');
  if (readmeDoc && readmeDoc.grade === 'missing') {
    stories.push({
      key: `0.${storyNum}`,
      title: 'Create README.md',
      type: 'doc-freshness',
      acceptanceCriteria: [
        '**Given** no README.md exists\n**When** the agent runs `codeharness init`\n**Then** README.md is created with project name, installation command, Quick Start section, and CLI reference',
      ],
    });
    storyNum++;
  }

  // Architecture story — if ARCHITECTURE.md is missing
  const archDoc = audit.documents.find(d => d.name === 'ARCHITECTURE.md');
  if (archDoc && archDoc.grade === 'missing') {
    stories.push({
      key: `0.${storyNum}`,
      title: 'Create ARCHITECTURE.md',
      type: 'architecture',
      acceptanceCriteria: [
        '**Given** no ARCHITECTURE.md exists\n**When** the agent analyzes the codebase\n**Then** ARCHITECTURE.md is created with module overview and dependencies',
      ],
    });
    storyNum++;
  }

  // AGENTS.md stories — one per module missing AGENTS.md
  for (const mod of scan.modules) {
    const agentsPath = join(root, mod.path, 'AGENTS.md');
    if (!existsSync(agentsPath)) {
      stories.push({
        key: `0.${storyNum}`,
        title: `Create ${mod.path}/AGENTS.md`,
        type: 'agents-md',
        module: mod.path,
        acceptanceCriteria: [
          `**Given** ${mod.path} has ${mod.sourceFiles} source files and no AGENTS.md\n**When** the agent reads the module\n**Then** ${mod.path}/AGENTS.md is created with module purpose and key files`,
        ],
      });
      storyNum++;
    }
  }

  // Coverage stories — one per module below 100%
  for (const mod of coverage.modules) {
    if (mod.coveragePercent < 100) {
      stories.push({
        key: `0.${storyNum}`,
        title: `Add test coverage for ${mod.path}`,
        type: 'coverage',
        module: mod.path,
        acceptanceCriteria: [
          `**Given** ${mod.path} has ${mod.uncoveredFileCount} uncovered files at ${mod.coveragePercent}% coverage\n**When** the agent writes tests\n**Then** ${mod.path} has 100% test coverage`,
        ],
      });
      storyNum++;
    }
  }

  // Doc freshness stories — one story listing all stale documents
  const staleDocs = audit.documents.filter(d => d.grade === 'stale');
  if (staleDocs.length > 0) {
    const staleNames = staleDocs.map(d => d.name).join(', ');
    stories.push({
      key: `0.${storyNum}`,
      title: 'Update stale documentation',
      type: 'doc-freshness',
      acceptanceCriteria: [
        `**Given** the following documents are stale: ${staleNames}\n**When** the agent reviews them against current source\n**Then** all stale documents are updated to reflect the current codebase`,
      ],
    });
    storyNum++;
  }

  // Build summary
  const coverageStories = stories.filter(s => s.type === 'coverage').length;
  const docStories = stories.filter(
    s => s.type === 'agents-md' || s.type === 'architecture' || s.type === 'doc-freshness',
  ).length;
  const verificationStories = stories.filter(s => s.type === 'verification').length;
  const observabilityStories = stories.filter(s => s.type === 'observability').length;

  return {
    title: 'Onboarding Epic: Bring Project to Harness Compliance',
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    stories,
    summary: {
      totalStories: stories.length,
      coverageStories,
      docStories,
      verificationStories,
      observabilityStories,
    },
  };
}

// ─── Markdown Writing ───────────────────────────────────────────────────────

/**
 * Writes the onboarding epic to a markdown file.
 * Creates parent directories if needed (Task 4).
 */
export function writeOnboardingEpic(epic: OnboardingEpic, outputPath: string): void {
  mkdirSync(dirname(outputPath), { recursive: true });

  const lines: string[] = [];
  lines.push(`# ${epic.title}`);
  lines.push('');
  lines.push(`Generated: ${epic.generatedAt}`);
  lines.push('');
  lines.push('## Epic 0: Onboarding');
  lines.push('');

  for (const story of epic.stories) {
    lines.push(`### Story ${story.key}: ${story.title}`);
    lines.push('');

    // User story
    if (story.type === 'coverage') {
      lines.push(`As a developer, I want tests for ${story.module} to ensure correctness.`);
    } else if (story.type === 'agents-md') {
      lines.push(`As an agent, I want AGENTS.md for ${story.module} so I have local context.`);
    } else if (story.type === 'architecture') {
      lines.push("As a developer, I want an ARCHITECTURE.md documenting the project's architecture.");
    } else if (story.type === 'doc-freshness') {
      lines.push('As a developer, I want up-to-date documentation reflecting the current codebase.');
    } else if (story.type === 'verification') {
      lines.push(`As a developer, I want verification proof for ${story.storyKey} to ensure it's properly documented.`);
    } else if (story.type === 'observability') {
      lines.push('As a developer, I want observability infrastructure configured so the harness can monitor runtime behavior.');
    }
    lines.push('');

    // Acceptance criteria
    for (const ac of story.acceptanceCriteria) {
      lines.push(ac);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(`**Total stories:** ${epic.stories.length}`);
  lines.push('');
  lines.push('Review and approve before execution.');
  lines.push('');

  writeFileSync(outputPath, lines.join('\n'), 'utf-8');
}

// ─── Summary Formatting ─────────────────────────────────────────────────────

/**
 * Returns a human-readable summary string for the epic.
 */
export function formatEpicSummary(epic: OnboardingEpic): string {
  const { totalStories, coverageStories, docStories, verificationStories, observabilityStories } = epic.summary;
  return `Onboarding plan: ${totalStories} stories (${coverageStories} coverage, ${docStories} documentation, ${verificationStories} verification, ${observabilityStories} observability)`;
}

// ─── Interactive Approval ───────────────────────────────────────────────────

/**
 * Prompts the user for approval via readline.
 * Returns true on Y, y, or empty input. Returns false otherwise.
 */
export function promptApproval(): Promise<boolean> {
  return new Promise((resolve) => {
    let answered = false;
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.on('close', () => {
      if (!answered) {
        answered = true;
        resolve(false);
      }
    });

    rl.question('Review the onboarding plan. Approve? [Y/n] ', (answer) => {
      answered = true;
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed === '' || trimmed === 'y');
    });
  });
}

// TODO: v2 issue tracker (Epic 8) — importOnboardingEpic removed with beads cleanup
