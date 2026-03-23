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
    // Fall through to basename
  }
  return basename(projectDir);
}

export function getStackLabel(stack: string | null): string {
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

export function generateAgentsMdContent(projectDir: string, stack: string | null): string {
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
      const content = generateAgentsMdContent(opts.projectDir, opts.stack);
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

      const readmeContent = readmeTemplate({
        projectName: getProjectName(opts.projectDir),
        stack: opts.stack,
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
