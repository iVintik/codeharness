/**
 * Documentation scaffolding for project initialization.
 * Generates AGENTS.md, docs/ directory structure, and README.md.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { ok as okOutput } from '../../lib/output.js';
import { generateFile } from '../../lib/templates.js';
import { readmeTemplate } from '../../templates/readme.js';
import type { Result } from '../../types/result.js';
import { ok, fail } from '../../types/result.js';
import type { InitDocumentationResult } from './types.js';
import type { StackDetection } from '../../lib/stack-detect.js';

const DO_NOT_EDIT_HEADER = '<!-- DO NOT EDIT MANUALLY -->\n';

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
    // Fall through to Cargo.toml check
  }

  // Cargo.toml fallback for Rust projects
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
    // Fall through to basename
  }

  return basename(projectDir);
}

export function getStackLabel(stack: string | string[] | null): string {
  if (Array.isArray(stack)) {
    if (stack.length === 0) return 'Unknown';
    return stack.map(s => getStackLabel(s)).join(' + ');
  }
  if (stack === 'nodejs') return 'Node.js (package.json)';
  if (stack === 'python') return 'Python';
  if (stack === 'rust') return 'Rust (Cargo.toml)';
  return 'Unknown';
}

export function getCoverageTool(stack: string | null): 'c8' | 'coverage.py' | 'cargo-tarpaulin' | 'unknown' {
  if (stack === 'python') return 'coverage.py';
  if (stack === 'rust') return 'cargo-tarpaulin';
  return 'c8';
}

export function generateAgentsMdContent(projectDir: string, stack: string | StackDetection[] | null): string {
  // Multi-stack path: StackDetection[] with more than one entry
  if (Array.isArray(stack) && stack.length > 1) {
    return generateMultiStackAgentsMd(projectDir, stack);
  }
  // Single-element array: unwrap to string for backward-compatible single-stack output
  if (Array.isArray(stack)) {
    stack = stack.length === 1 ? stack[0].stack : null;
  }

  // Single-stack path: string | null (backward compat)
  const projectName = basename(projectDir);
  const stackLabel = stack === 'nodejs' ? 'Node.js' : stack === 'python' ? 'Python' : stack === 'rust' ? 'Rust' : 'Unknown';

  const lines = [
    `# ${projectName}`,
    '',
    '## Stack',
    '',
    `- **Language/Runtime:** ${stackLabel}`,
    '',
    '## Build & Test Commands',
    '',
  ];

  if (stack === 'nodejs') {
    lines.push(
      '```bash',
      'npm install    # Install dependencies',
      'npm run build  # Build the project',
      'npm test       # Run tests',
      '```',
    );
  } else if (stack === 'python') {
    lines.push(
      '```bash',
      'pip install -r requirements.txt  # Install dependencies',
      'python -m pytest                 # Run tests',
      '```',
    );
  } else if (stack === 'rust') {
    lines.push(
      '```bash',
      'cargo build    # Build the project',
      'cargo test     # Run tests',
      'cargo tarpaulin --out json  # Run coverage',
      '```',
    );
  } else {
    lines.push('```bash', '# No recognized stack — add build/test commands here', '```');
  }

  lines.push(
    '',
    '## Project Structure',
    '',
    '```',
    `${projectName}/`,
    '├── src/           # Source code',
    '├── tests/         # Test files',
    '├── docs/          # Documentation',
    '└── .claude/       # Codeharness state',
    '```',
    '',
    '## Conventions',
    '',
    '- All changes must pass tests before commit',
    '- Maintain test coverage targets',
    '- Follow existing code style and patterns',
    '',
  );

  return lines.join('\n');
}

/** Maps stack identifier to display name for AGENTS.md generation. */
function stackDisplayName(stack: string): string {
  if (stack === 'nodejs') return 'Node.js';
  if (stack === 'python') return 'Python';
  if (stack === 'rust') return 'Rust';
  return 'Unknown';
}

function generateMultiStackAgentsMd(projectDir: string, stacks: StackDetection[]): string {
  const projectName = basename(projectDir);
  const stackNames = stacks.map(s => stackDisplayName(s.stack));

  const lines = [
    `# ${projectName}`,
    '',
    '## Stack',
    '',
    `- **Language/Runtime:** ${stackNames.join(' + ')}`,
    '',
    '## Build & Test Commands',
    '',
  ];

  for (const detection of stacks) {
    const label = stackDisplayName(detection.stack);
    const heading = detection.dir === '.' ? `### ${label}` : `### ${label} (${detection.dir}/)`;
    const prefix = detection.dir === '.' ? '' : `cd ${detection.dir} && `;

    lines.push(heading, '', '```bash');

    if (detection.stack === 'nodejs') {
      lines.push(
        `${prefix}npm install    # Install dependencies`,
        `${prefix}npm run build  # Build the project`,
        `${prefix}npm test       # Run tests`,
      );
    } else if (detection.stack === 'python') {
      lines.push(
        `${prefix}pip install -r requirements.txt  # Install dependencies`,
        `${prefix}python -m pytest                 # Run tests`,
      );
    } else if (detection.stack === 'rust') {
      lines.push(
        `${prefix}cargo build    # Build the project`,
        `${prefix}cargo test     # Run tests`,
        `${prefix}cargo tarpaulin --out json  # Run coverage`,
      );
    }

    lines.push('```', '');
  }

  lines.push(
    '## Project Structure',
    '',
    '```',
    `${projectName}/`,
    '├── src/           # Source code',
    '├── tests/         # Test files',
    '├── docs/          # Documentation',
    '└── .claude/       # Codeharness state',
    '```',
    '',
    '## Conventions',
    '',
    '- All changes must pass tests before commit',
    '- Maintain test coverage targets',
    '- Follow existing code style and patterns',
    '',
  );

  return lines.join('\n');
}

export function generateDocsIndexContent(): string {
  return [
    '# Project Documentation',
    '',
    '## Planning Artifacts',
    '- [Product Requirements](../_bmad-output/planning-artifacts/prd.md)',
    '- [Architecture](../_bmad-output/planning-artifacts/architecture.md)',
    '- [Epics & Stories](../_bmad-output/planning-artifacts/epics.md)',
    '',
    '## Execution',
    '- [Active Exec Plans](exec-plans/active/)',
    '- [Completed Exec Plans](exec-plans/completed/)',
    '',
    '## Quality',
    '- [Quality Reports](quality/)',
    '- [Generated Reports](generated/)',
    '',
  ].join('\n');
}

interface ScaffoldDocsOptions {
  readonly projectDir: string;
  readonly stack: string | null;
  readonly stacks?: StackDetection[];
  readonly isJson: boolean;
}

export async function scaffoldDocs(opts: ScaffoldDocsOptions): Promise<Result<InitDocumentationResult>> {
  try {
    let agentsMd: 'created' | 'exists' | 'skipped' = 'skipped';
    let docsScaffold: 'created' | 'exists' | 'skipped' = 'skipped';
    let readme: 'created' | 'exists' | 'skipped' = 'skipped';

    // AGENTS.md
    const agentsMdPath = join(opts.projectDir, 'AGENTS.md');
    if (!existsSync(agentsMdPath)) {
      const stackArg = opts.stacks && opts.stacks.length > 1 ? opts.stacks : opts.stack;
      const content = generateAgentsMdContent(opts.projectDir, stackArg);
      generateFile(agentsMdPath, content);
      agentsMd = 'created';
    } else {
      agentsMd = 'exists';
    }

    // docs/ scaffold
    const docsDir = join(opts.projectDir, 'docs');
    if (!existsSync(docsDir)) {
      generateFile(join(docsDir, 'index.md'), generateDocsIndexContent());
      generateFile(join(docsDir, 'exec-plans', 'active', '.gitkeep'), '');
      generateFile(join(docsDir, 'exec-plans', 'completed', '.gitkeep'), '');
      generateFile(join(docsDir, 'quality', '.gitkeep'), DO_NOT_EDIT_HEADER);
      generateFile(join(docsDir, 'generated', '.gitkeep'), DO_NOT_EDIT_HEADER);
      docsScaffold = 'created';
    } else {
      docsScaffold = 'exists';
    }

    // README.md
    const readmePath = join(opts.projectDir, 'README.md');
    if (!existsSync(readmePath)) {
      let cliHelpOutput = '';
      try {
        const { execFileSync } = await import('node:child_process');
        cliHelpOutput = execFileSync(process.execPath, [process.argv[1], '--help'], {
          stdio: 'pipe',
          timeout: 10_000,
        }).toString();
      } catch {
        cliHelpOutput = 'Run: codeharness --help';
      }

      const readmeStack = opts.stacks && opts.stacks.length > 1
        ? opts.stacks.map(s => s.stack)
        : opts.stack;
      const readmeContent = readmeTemplate({
        projectName: getProjectName(opts.projectDir),
        stack: readmeStack,
        cliHelpOutput,
      });
      generateFile(readmePath, readmeContent);
      readme = 'created';
    } else {
      readme = 'exists';
    }

    const result: InitDocumentationResult = { agents_md: agentsMd, docs_scaffold: docsScaffold, readme };

    if (!opts.isJson) {
      if (result.agents_md === 'created' || result.docs_scaffold === 'created') {
        okOutput('Documentation: AGENTS.md + docs/ scaffold created');
      }
      if (result.readme === 'created') {
        okOutput('Documentation: README.md created');
      }
    }

    return ok(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(`Documentation scaffold failed: ${message}`);
  }
}
