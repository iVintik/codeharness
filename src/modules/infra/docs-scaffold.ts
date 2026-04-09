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
import type { AgentRuntime, InitDocumentationResult } from './types.js';
import type { StackDetection } from '../../lib/stacks/index.js';
import { getStackProvider } from '../../lib/stacks/index.js';
import type { StackName } from '../../lib/stacks/index.js';

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
    // IGNORE: package.json may not exist or be malformed
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
    // IGNORE: Cargo.toml may not exist or be malformed
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

/** Coverage tool name mapping for state file (uses state-format names, not provider CoverageToolName). */
const STATE_COVERAGE_TOOLS: Record<string, 'c8' | 'coverage.py' | 'cargo-tarpaulin'> = {
  nodejs: 'c8',
  python: 'coverage.py',
  rust: 'cargo-tarpaulin',
};

export function getCoverageTool(stack: string | null): 'c8' | 'coverage.py' | 'cargo-tarpaulin' | 'unknown' {
  if (!stack) return 'c8';
  return STATE_COVERAGE_TOOLS[stack] ?? 'c8';
}

function getHarnessFileLines(agentRuntime: AgentRuntime): string[] {
  const lines = [
    '## Harness Files',
    '',
    '- `AGENTS.md` is the primary repo-local instruction file for coding agents',
    '- `commands/` contains harness command playbooks the agent can read and execute directly',
    '- `skills/` contains focused harness skills and operating procedures',
  ];

  if (agentRuntime === 'opencode') {
    lines.push('- Install BMAD with `npx bmad-method install --yes --directory . --modules bmm --tools none` for OpenCode');
  } else {
    lines.push('- Install BMAD with `npx bmad-method install --yes --directory . --modules bmm --tools claude-code` for Claude Code');
  }

  lines.push('');
  return lines;
}

export function generateAgentsMdContent(
  projectDir: string,
  stack: string | StackDetection[] | null,
  agentRuntime: AgentRuntime = 'claude-code',
): string {
  // Multi-stack path: StackDetection[] with more than one entry
  if (Array.isArray(stack) && stack.length > 1) {
    return generateMultiStackAgentsMd(projectDir, stack, agentRuntime);
  }
  // Single-element array: unwrap to string for backward-compatible single-stack output
  if (Array.isArray(stack)) {
    stack = stack.length === 1 ? stack[0].stack : null;
  }

  // Single-stack path: string | null (backward compat)
  const projectName = basename(projectDir);
  const provider = stack ? getStackProvider(stack as StackName) : undefined;
  const stackLabel = provider ? stackDisplayName(stack!) : 'Unknown';

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

  if (provider) {
    appendBuildTestCommands(lines, provider.name, '');
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
  );

  lines.push(...getHarnessFileLines(agentRuntime));

  return lines.join('\n');
}

/** Maps stack identifier to short display name for AGENTS.md generation (no parenthetical). */
function stackDisplayName(stack: string): string {
  const provider = getStackProvider(stack as StackName);
  if (!provider) return 'Unknown';
  // Strip parenthetical qualifiers like " (package.json)" or " (Cargo.toml)"
  return provider.displayName.replace(/ \(.*\)$/, '');
}

/** Build/test commands per stack, keyed by provider name. Uses provider methods. */
function appendBuildTestCommands(lines: string[], stack: string, prefix: string): void {
  const provider = getStackProvider(stack as StackName);
  if (!provider) return;
  const buildCmds = provider.getBuildCommands();
  const testCmds = provider.getTestCommands();
  lines.push('```bash');
  for (const cmd of buildCmds) {
    lines.push(`${prefix}${cmd}`);
  }
  for (const cmd of testCmds) {
    lines.push(`${prefix}${cmd}`);
  }
  lines.push('```');
}

function generateMultiStackAgentsMd(
  projectDir: string,
  stacks: StackDetection[],
  agentRuntime: AgentRuntime,
): string {
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

    lines.push(heading, '');

    appendBuildTestCommands(lines, detection.stack, prefix);

    lines.push('');
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
  );

  lines.push(...getHarnessFileLines(agentRuntime));

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
  readonly agentRuntime?: AgentRuntime;
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
      const content = generateAgentsMdContent(opts.projectDir, stackArg, opts.agentRuntime ?? 'claude-code');
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
        // IGNORE: CLI help may not be available during init
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
