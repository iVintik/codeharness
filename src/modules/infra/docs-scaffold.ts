/**
 * Documentation scaffolding for project initialization.
 *
 * Produces:
 * - `docs/index.md` — placeholder mirroring the BMAD `document-project` index
 *   template structure so the tech-writer workflow can fill it in later.
 * - `AGENTS.md` — minimal agent-facing entry point pointing at `docs/index.md`.
 * - `CLAUDE.md` — same reference for Claude Code's primary instruction file.
 *
 * Non-destructive: existing AGENTS.md / CLAUDE.md files are appended to (not
 * overwritten) if they lack a `docs/index.md` reference. README.md is never
 * touched — that is the BMAD tech-writer's job (run `/document-project`).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { ok as okOutput, info } from '../../lib/output.js';
import { generateFile, appendFile } from '../../lib/templates.js';
import type { Result } from '../../types/result.js';
import { ok, fail } from '../../types/result.js';
import type { InitDocumentationResult } from './types.js';
import type { StackDetection } from '../../lib/stacks/index.js';
import { getStackProvider } from '../../lib/stacks/index.js';
import type { StackName } from '../../lib/stacks/index.js';

const DO_NOT_EDIT_HEADER = '<!-- DO NOT EDIT MANUALLY -->\n';
const DOCS_INDEX_PATH = 'docs/index.md';

/** Marker block added to AGENTS.md / CLAUDE.md. Detected to avoid duplicate appends. */
const DOC_REFERENCE_MARKER = '<!-- codeharness:docs-index -->';

// ─── Project metadata helpers ───────────────────────────────────────

export function getProjectName(projectDir: string): string {
  try {
    const pkgPath = join(projectDir, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
      if (pkg.name && typeof pkg.name === 'string') {
        return pkg.name;
      }
    }
  } catch {
    // IGNORE: package.json may not exist or be malformed
  }

  try {
    const cargoPath = join(projectDir, 'Cargo.toml');
    if (existsSync(cargoPath)) {
      const content = readFileSync(cargoPath, 'utf-8');
      const packageMatch = content.match(/\[package\]([\s\S]*?)(?=\n\[|$)/s);
      if (packageMatch) {
        const nameMatch = packageMatch[1].match(/^\s*name\s*=\s*["']([^"']+)["']/m);
        if (nameMatch) {
          return nameMatch[1];
        }
      }
    }
  } catch {
    // IGNORE: Cargo.toml may not exist or be malformed
  }

  try {
    const pyprojectPath = join(projectDir, 'pyproject.toml');
    if (existsSync(pyprojectPath)) {
      const content = readFileSync(pyprojectPath, 'utf-8');
      const nameMatch = content.match(/^\s*name\s*=\s*["']([^"']+)["']/m);
      if (nameMatch) return nameMatch[1];
    }
  } catch {
    // IGNORE: pyproject.toml may not exist or be malformed
  }

  return basename(projectDir);
}

export function getStackLabel(stack: string | string[] | null): string {
  if (Array.isArray(stack)) {
    if (stack.length === 0) return 'Unknown';
    return stack.map(s => getStackLabel(s)).join(' + ');
  }
  if (!stack) return 'Unknown';
  const provider = getStackProvider(stack as StackName);
  return provider ? provider.displayName : 'Unknown';
}

const STATE_COVERAGE_TOOLS: Record<string, 'c8' | 'coverage.py' | 'cargo-tarpaulin'> = {
  nodejs: 'c8',
  python: 'coverage.py',
  rust: 'cargo-tarpaulin',
};

export function getCoverageTool(stack: string | null): 'c8' | 'coverage.py' | 'cargo-tarpaulin' | 'unknown' {
  if (!stack) return 'c8';
  return STATE_COVERAGE_TOOLS[stack] ?? 'c8';
}

// ─── Content generators ────────────────────────────────────────────

/**
 * Generate a placeholder `docs/index.md` matching the BMAD
 * `document-project` index template. Sections are present but marked
 * as TBD so `/document-project` can populate them on a later run.
 */
export function generateDocsIndexContent(projectName: string, stackLabel: string): string {
  return [
    `# ${projectName} Documentation Index`,
    '',
    `**Type:** _(To be generated)_`,
    `**Primary Language:** ${stackLabel}`,
    `**Architecture:** _(To be generated)_`,
    `**Last Updated:** _(To be generated)_`,
    '',
    '## Project Overview',
    '',
    '_(To be generated)_',
    '',
    '## Quick Reference',
    '',
    '- **Tech Stack:** _(To be generated)_',
    '- **Entry Point:** _(To be generated)_',
    '- **Architecture Pattern:** _(To be generated)_',
    '',
    '## Generated Documentation',
    '',
    '### Core Documentation',
    '',
    '- [Project Overview](./project-overview.md) _(To be generated)_',
    '- [Source Tree Analysis](./source-tree-analysis.md) _(To be generated)_',
    '- [Architecture](./architecture.md) _(To be generated)_',
    '- [Component Inventory](./component-inventory.md) _(To be generated)_',
    '- [Development Guide](./development-guide.md) _(To be generated)_',
    '',
    '## Getting Started',
    '',
    '_(To be generated)_',
    '',
    '## For AI-Assisted Development',
    '',
    'When working on this codebase, start by reading the sections above. Once',
    'populated, they describe the architecture, entry points, and conventions',
    'needed to make informed changes.',
    '',
    '---',
    '',
    '_This index is a placeholder. Run `/document-project` (BMAD tech-writer)',
    'to scan the codebase and populate it with real content._',
    '',
  ].join('\n');
}

/** Agent-facing instruction file body used when AGENTS.md / CLAUDE.md don't exist. */
export function generateAgentFileContent(projectName: string, stackLabel: string): string {
  return [
    `# ${projectName}`,
    '',
    `**Language/Runtime:** ${stackLabel}`,
    '',
    '## Documentation',
    '',
    DOC_REFERENCE_MARKER,
    `- [Documentation Index](./${DOCS_INDEX_PATH}) — entry point for project docs.`,
    '  Start here before making changes. If sections are marked _(To be generated)_,',
    '  run `/document-project` (BMAD tech-writer) to populate them.',
    '',
    '## Conventions',
    '',
    '- Read the documentation index before making non-trivial changes.',
    '- All changes must pass tests before commit.',
    '- Follow existing code style and patterns.',
    '',
  ].join('\n');
}

/** Appended block used when AGENTS.md / CLAUDE.md already exist but lack a reference. */
export function docReferenceAppendBlock(): string {
  return [
    '',
    '## Documentation',
    '',
    DOC_REFERENCE_MARKER,
    `- [Documentation Index](./${DOCS_INDEX_PATH}) — entry point for project docs.`,
    '  Start here before making changes. If sections are marked _(To be generated)_,',
    '  run `/document-project` (BMAD tech-writer) to populate them.',
    '',
  ].join('\n');
}

// ─── Non-destructive file updater ──────────────────────────────────

/**
 * Create the target file with fresh content, or append a documentation-index
 * reference block if the file exists but lacks one. Never overwrites existing
 * content. Returns 'created', 'updated', or 'unchanged'.
 */
export function ensureAgentFile(
  filePath: string,
  projectName: string,
  stackLabel: string,
): 'created' | 'updated' | 'unchanged' {
  if (!existsSync(filePath)) {
    generateFile(filePath, generateAgentFileContent(projectName, stackLabel));
    return 'created';
  }

  const existing = readFileSync(filePath, 'utf-8');
  if (existing.includes(DOC_REFERENCE_MARKER) || existing.includes(DOCS_INDEX_PATH)) {
    return 'unchanged';
  }

  appendFile(filePath, docReferenceAppendBlock());
  return 'updated';
}

// ─── scaffoldDocs ──────────────────────────────────────────────────

interface ScaffoldDocsOptions {
  readonly projectDir: string;
  readonly stack: string | null;
  readonly stacks?: StackDetection[];
  readonly isJson: boolean;
}

export async function scaffoldDocs(opts: ScaffoldDocsOptions): Promise<Result<InitDocumentationResult>> {
  try {
    const projectName = getProjectName(opts.projectDir);
    const stackArg = opts.stacks && opts.stacks.length > 1 ? opts.stacks.map((s) => s.stack) : opts.stack;
    const stackLabel = getStackLabel(stackArg);

    // docs/ scaffold — write index.md + exec-plans + quality placeholders
    let docsScaffold: 'created' | 'exists' | 'skipped' = 'skipped';
    const docsDir = join(opts.projectDir, 'docs');
    const indexPath = join(docsDir, 'index.md');
    if (!existsSync(docsDir)) {
      generateFile(indexPath, generateDocsIndexContent(projectName, stackLabel));
      generateFile(join(docsDir, 'exec-plans', 'active', '.gitkeep'), '');
      generateFile(join(docsDir, 'exec-plans', 'completed', '.gitkeep'), '');
      generateFile(join(docsDir, 'quality', '.gitkeep'), DO_NOT_EDIT_HEADER);
      generateFile(join(docsDir, 'generated', '.gitkeep'), DO_NOT_EDIT_HEADER);
      docsScaffold = 'created';
    } else if (!existsSync(indexPath)) {
      // docs/ exists but no index — add a placeholder index without touching siblings
      generateFile(indexPath, generateDocsIndexContent(projectName, stackLabel));
      docsScaffold = 'created';
    } else {
      docsScaffold = 'exists';
    }

    // AGENTS.md + CLAUDE.md — non-destructive
    const agentsMd = ensureAgentFile(join(opts.projectDir, 'AGENTS.md'), projectName, stackLabel);
    const claudeMd = ensureAgentFile(join(opts.projectDir, 'CLAUDE.md'), projectName, stackLabel);

    const result: InitDocumentationResult = {
      agents_md: agentsMd,
      claude_md: claudeMd,
      docs_scaffold: docsScaffold,
    };

    if (!opts.isJson) {
      if (docsScaffold === 'created') {
        okOutput('Documentation: docs/ scaffold + index.md placeholder created');
      }
      if (agentsMd === 'created') okOutput('Documentation: AGENTS.md created');
      else if (agentsMd === 'updated') okOutput('Documentation: AGENTS.md updated with docs/index.md reference');
      if (claudeMd === 'created') okOutput('Documentation: CLAUDE.md created');
      else if (claudeMd === 'updated') okOutput('Documentation: CLAUDE.md updated with docs/index.md reference');

      info('');
      info('Next step: populate docs/ and README.md from your actual code by running:');
      info('  /document-project   (BMAD tech-writer)');
      info('');
    }

    return ok(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(`Documentation scaffold failed: ${message}`);
  }
}
