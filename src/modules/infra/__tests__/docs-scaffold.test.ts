import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../../../lib/templates.js', async () => {
  // Route mocked generateFile/appendFile through the real fs so scaffoldDocs
  // actually writes to a tmpdir and tests can assert on file contents.
  const { mkdirSync, writeFileSync, appendFileSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  return {
    generateFile: vi.fn((path: string, content: string) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    }),
    appendFile: vi.fn((path: string, content: string) => {
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(path, content);
    }),
  };
});

import {
  getProjectName,
  getStackLabel,
  getCoverageTool,
  generateDocsIndexContent,
  generateAgentFileContent,
  ensureAgentFile,
  scaffoldDocs,
} from '../docs-scaffold.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-docs-test-'));
  vi.restoreAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// ─── getProjectName ───────────────────────────────────────────────

describe('getProjectName', () => {
  it('returns name from package.json', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'my-project' }));
    expect(getProjectName(testDir)).toBe('my-project');
  });

  it('returns name from Cargo.toml [package] section when no package.json', () => {
    writeFileSync(join(testDir, 'Cargo.toml'), '[package]\nname = "rust-crate"\n');
    expect(getProjectName(testDir)).toBe('rust-crate');
  });

  it('returns name from pyproject.toml when no package.json / Cargo.toml', () => {
    writeFileSync(join(testDir, 'pyproject.toml'), '[project]\nname = "my-python-sdk"\n');
    expect(getProjectName(testDir)).toBe('my-python-sdk');
  });

  it('falls back to basename when no recognized manifest', () => {
    const name = getProjectName(testDir);
    expect(typeof name).toBe('string');
    expect(name.length).toBeGreaterThan(0);
  });

  it('falls back to basename when package.json has no name', () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    expect(typeof getProjectName(testDir)).toBe('string');
  });
});

// ─── getStackLabel ────────────────────────────────────────────────

describe('getStackLabel', () => {
  it('returns Python label for python stack', () => {
    expect(getStackLabel('python')).toBe('Python');
  });

  it('returns Unknown for null stack', () => {
    expect(getStackLabel(null)).toBe('Unknown');
  });

  it('returns Rust label for rust stack', () => {
    expect(getStackLabel('rust')).toBe('Rust (Cargo.toml)');
  });

  it('joins multi-stack array', () => {
    expect(getStackLabel(['nodejs', 'rust'])).toBe('Node.js (package.json) + Rust (Cargo.toml)');
  });
});

// ─── getCoverageTool ──────────────────────────────────────────────

describe('getCoverageTool', () => {
  it('returns c8 for nodejs', () => {
    expect(getCoverageTool('nodejs')).toBe('c8');
  });

  it('returns coverage.py for python', () => {
    expect(getCoverageTool('python')).toBe('coverage.py');
  });

  it('returns cargo-tarpaulin for rust', () => {
    expect(getCoverageTool('rust')).toBe('cargo-tarpaulin');
  });
});

// ─── generateDocsIndexContent ─────────────────────────────────────

describe('generateDocsIndexContent', () => {
  it('includes project name in heading', () => {
    const content = generateDocsIndexContent('my-sdk', 'Python');
    expect(content).toContain('# my-sdk Documentation Index');
  });

  it('includes stack label as primary language', () => {
    const content = generateDocsIndexContent('my-sdk', 'Python');
    expect(content).toContain('**Primary Language:** Python');
  });

  it('marks sections as TBD for document-project workflow', () => {
    const content = generateDocsIndexContent('x', 'Node.js');
    expect(content).toContain('_(To be generated)_');
    expect(content).toContain('Project Overview');
    expect(content).toContain('Generated Documentation');
  });

  it('recommends running /bmad-bmm-document-project', () => {
    const content = generateDocsIndexContent('x', 'Node.js');
    expect(content).toContain('/bmad-bmm-document-project');
  });

  it('does NOT dump codeharness CLI help', () => {
    const content = generateDocsIndexContent('x', 'Python');
    expect(content).not.toContain('codeharness --help');
    expect(content).not.toContain('codeharness init');
  });
});

// ─── generateAgentFileContent ─────────────────────────────────────

describe('generateAgentFileContent', () => {
  it('references docs/index.md', () => {
    const content = generateAgentFileContent('my-sdk', 'Python');
    expect(content).toContain('docs/index.md');
  });

  it('recommends /bmad-bmm-document-project', () => {
    const content = generateAgentFileContent('my-sdk', 'Python');
    expect(content).toContain('/bmad-bmm-document-project');
  });

  it('does NOT hardcode src/ layout', () => {
    const content = generateAgentFileContent('my-sdk', 'Python');
    expect(content).not.toMatch(/├── src\//);
  });

  it('does NOT reference codeharness plugin internals', () => {
    const content = generateAgentFileContent('my-sdk', 'Python');
    expect(content).not.toContain('commands/');
    expect(content).not.toContain('skills/');
    expect(content).not.toContain('bmad-method install');
  });

  it('includes the docs-reference marker', () => {
    const content = generateAgentFileContent('my-sdk', 'Python');
    expect(content).toContain('<!-- codeharness:docs-index -->');
  });
});

// ─── ensureAgentFile ──────────────────────────────────────────────

describe('ensureAgentFile', () => {
  it('creates a fresh file when none exists', () => {
    const path = join(testDir, 'AGENTS.md');
    const result = ensureAgentFile(path, 'proj', 'Python');
    expect(result).toBe('created');
    expect(readFileSync(path, 'utf-8')).toContain('docs/index.md');
  });

  it('appends a reference block when file exists without marker', () => {
    const path = join(testDir, 'AGENTS.md');
    writeFileSync(path, '# Existing Content\n\nSome project-specific instructions.\n');
    const result = ensureAgentFile(path, 'proj', 'Python');
    expect(result).toBe('updated');
    const updated = readFileSync(path, 'utf-8');
    expect(updated).toContain('# Existing Content');
    expect(updated).toContain('Some project-specific instructions');
    expect(updated).toContain('docs/index.md');
  });

  it('returns unchanged when file already references docs/index.md', () => {
    const path = join(testDir, 'AGENTS.md');
    writeFileSync(path, '# existing\n\nSee [docs](./docs/index.md).\n');
    const result = ensureAgentFile(path, 'proj', 'Python');
    expect(result).toBe('unchanged');
  });

  it('returns unchanged when marker is already present', () => {
    const path = join(testDir, 'AGENTS.md');
    writeFileSync(path, '# existing\n\n<!-- codeharness:docs-index -->\n');
    const result = ensureAgentFile(path, 'proj', 'Python');
    expect(result).toBe('unchanged');
  });
});

// ─── scaffoldDocs ─────────────────────────────────────────────────

describe('scaffoldDocs', () => {
  it('creates docs scaffold when docs/ does not exist', async () => {
    const result = await scaffoldDocs({ projectDir: testDir, stack: 'nodejs', isJson: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.docs_scaffold).toBe('created');
    }
    expect(existsSync(join(testDir, 'docs', 'index.md'))).toBe(true);
  });

  it('creates AGENTS.md and CLAUDE.md when absent', async () => {
    const result = await scaffoldDocs({ projectDir: testDir, stack: 'nodejs', isJson: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agents_md).toBe('created');
      expect(result.data.claude_md).toBe('created');
    }
    expect(existsSync(join(testDir, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(testDir, 'CLAUDE.md'))).toBe(true);
  });

  it('appends to existing AGENTS.md without overwriting', async () => {
    writeFileSync(join(testDir, 'AGENTS.md'), '# existing project notes\n');
    const result = await scaffoldDocs({ projectDir: testDir, stack: 'nodejs', isJson: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agents_md).toBe('updated');
    }
    const content = readFileSync(join(testDir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('existing project notes');
    expect(content).toContain('docs/index.md');
  });

  it('appends to existing CLAUDE.md without overwriting', async () => {
    writeFileSync(join(testDir, 'CLAUDE.md'), '# claude instructions\n\nuse typescript strict.\n');
    const result = await scaffoldDocs({ projectDir: testDir, stack: 'nodejs', isJson: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.claude_md).toBe('updated');
    }
    const content = readFileSync(join(testDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('use typescript strict');
    expect(content).toContain('docs/index.md');
  });

  it('returns unchanged when AGENTS.md already references docs/index.md', async () => {
    writeFileSync(join(testDir, 'AGENTS.md'), '# notes\n\nSee ./docs/index.md for details.\n');
    const result = await scaffoldDocs({ projectDir: testDir, stack: 'nodejs', isJson: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agents_md).toBe('unchanged');
    }
  });

  it('does NOT create README.md', async () => {
    await scaffoldDocs({ projectDir: testDir, stack: 'nodejs', isJson: false });
    expect(existsSync(join(testDir, 'README.md'))).toBe(false);
  });

  it('does NOT invoke codeharness --help', async () => {
    // Regression guard: old scaffolder spawned process.execPath to capture --help.
    const result = await scaffoldDocs({ projectDir: testDir, stack: 'python', isJson: false });
    expect(result.success).toBe(true);
    const agentsContent = readFileSync(join(testDir, 'AGENTS.md'), 'utf-8');
    expect(agentsContent).not.toContain('codeharness --help');
  });

  it('suppresses stdout in json mode', async () => {
    const spy = vi.spyOn(console, 'log');
    await scaffoldDocs({ projectDir: testDir, stack: 'nodejs', isJson: true });
    const calls = spy.mock.calls.map(c => c[0] as string);
    const outputCalls = calls.filter(c => c && (c.startsWith('[OK]') || c.startsWith('[INFO]')));
    expect(outputCalls).toHaveLength(0);
  });

  it('handles python SDK with pyproject.toml', async () => {
    writeFileSync(join(testDir, 'pyproject.toml'), '[project]\nname = "surf_ai_sdk"\n');
    const result = await scaffoldDocs({ projectDir: testDir, stack: 'python', isJson: false });
    expect(result.success).toBe(true);
    const indexContent = readFileSync(join(testDir, 'docs', 'index.md'), 'utf-8');
    expect(indexContent).toContain('# surf_ai_sdk Documentation Index');
    expect(indexContent).toContain('**Primary Language:** Python');
  });

  it('creates index.md placeholder with document-project recommendation', async () => {
    await scaffoldDocs({ projectDir: testDir, stack: 'nodejs', isJson: false });
    const content = readFileSync(join(testDir, 'docs', 'index.md'), 'utf-8');
    expect(content).toContain('/bmad-bmm-document-project');
    expect(content).toContain('_(To be generated)_');
  });
});
