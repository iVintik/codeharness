import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../../../lib/templates.js', () => ({
  generateFile: vi.fn((_path: string, _content: string) => {
    // Simulate file creation for test assertions
    const { mkdirSync, writeFileSync } = require('node:fs');
    const { dirname } = require('node:path');
    mkdirSync(dirname(_path), { recursive: true });
    writeFileSync(_path, _content);
  }),
}));

vi.mock('../../../templates/readme.js', () => ({
  readmeTemplate: vi.fn(() => '# Test README\n'),
}));

import {
  getProjectName,
  getStackLabel,
  getCoverageTool,
  generateAgentsMdContent,
  generateDocsIndexContent,
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


describe('getProjectName', () => {
  it('returns name from package.json', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'my-project' }));
    expect(getProjectName(testDir)).toBe('my-project');
  });

  it('falls back to basename when no package.json', () => {
    const name = getProjectName(testDir);
    expect(typeof name).toBe('string');
    expect(name.length).toBeGreaterThan(0);
  });

  it('falls back to basename when package.json has no name', () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    const name = getProjectName(testDir);
    expect(typeof name).toBe('string');
  });

  it('returns name from Cargo.toml [package] section when no package.json', () => {
    writeFileSync(join(testDir, 'Cargo.toml'), '[package]\nname = "myapp"\nversion = "0.1.0"\n');
    expect(getProjectName(testDir)).toBe('myapp');
  });

  it('returns package.json name over Cargo.toml name (precedence)', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'npm-name' }));
    writeFileSync(join(testDir, 'Cargo.toml'), '[package]\nname = "rust-name"\nversion = "0.1.0"\n');
    expect(getProjectName(testDir)).toBe('npm-name');
  });

  it('falls back to basename when Cargo.toml has name only in [dependencies]', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      '[dependencies]\nname = "dep-name"\nversion = "0.1.0"\n',
    );
    const name = getProjectName(testDir);
    const { basename } = require('node:path');
    // Should NOT return 'dep-name' — no [package] section; should return basename
    expect(name).not.toBe('dep-name');
    expect(name).toBe(basename(testDir));
  });

  it('falls back to basename when Cargo.toml is malformed', () => {
    writeFileSync(join(testDir, 'Cargo.toml'), 'this is not valid toml!!!');
    const name = getProjectName(testDir);
    const { basename } = require('node:path');
    expect(name).toBe(basename(testDir));
  });

  it('falls back to basename when Cargo.toml [package] has no name field', () => {
    writeFileSync(join(testDir, 'Cargo.toml'), '[package]\nversion = "0.1.0"\nedition = "2021"\n');
    const name = getProjectName(testDir);
    const { basename } = require('node:path');
    expect(name).toBe(basename(testDir));
  });

  it('handles single-quoted name in Cargo.toml', () => {
    writeFileSync(join(testDir, 'Cargo.toml'), "[package]\nname = 'single-quoted'\nversion = \"0.1.0\"\n");
    expect(getProjectName(testDir)).toBe('single-quoted');
  });

  it('handles Cargo.toml with [package] name before [dependencies] section', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      '[package]\nname = "real-name"\nversion = "0.1.0"\n\n[dependencies]\nserde = "1.0"\n',
    );
    expect(getProjectName(testDir)).toBe('real-name');
  });
});

describe('getStackLabel', () => {
  it('returns Node.js label for nodejs stack', () => {
    expect(getStackLabel('nodejs')).toBe('Node.js (package.json)');
  });

  it('returns Python label for python stack', () => {
    expect(getStackLabel('python')).toBe('Python');
  });

  it('returns Unknown for null stack', () => {
    expect(getStackLabel(null)).toBe('Unknown');
  });

  it('returns Rust label for rust stack', () => {
    expect(getStackLabel('rust')).toBe('Rust (Cargo.toml)');
  });

  it('returns joined label for multi-stack array', () => {
    expect(getStackLabel(['nodejs', 'rust'])).toBe('Node.js (package.json) + Rust (Cargo.toml)');
  });

  it('returns single label for single-element array', () => {
    expect(getStackLabel(['python'])).toBe('Python');
  });

  it('returns Unknown for empty array', () => {
    expect(getStackLabel([])).toBe('Unknown');
  });
});

describe('getCoverageTool', () => {
  it('returns c8 for nodejs', () => {
    expect(getCoverageTool('nodejs')).toBe('c8');
  });

  it('returns coverage.py for python', () => {
    expect(getCoverageTool('python')).toBe('coverage.py');
  });

  it('returns c8 for null', () => {
    expect(getCoverageTool(null)).toBe('c8');
  });

  it('returns cargo-tarpaulin for rust', () => {
    expect(getCoverageTool('rust')).toBe('cargo-tarpaulin');
  });
});

describe('generateAgentsMdContent', () => {
  it('includes project name', () => {
    const content = generateAgentsMdContent(testDir, 'nodejs');
    expect(content).toContain('# ');
  });

  it('includes Node.js commands for nodejs stack', () => {
    const content = generateAgentsMdContent(testDir, 'nodejs');
    expect(content).toContain('npm install');
    expect(content).toContain('npm test');
  });

  it('includes Python commands for python stack', () => {
    const content = generateAgentsMdContent(testDir, 'python');
    expect(content).toContain('pip install');
    expect(content).toContain('pytest');
  });

  it('includes generic message for unknown stack', () => {
    const content = generateAgentsMdContent(testDir, null);
    expect(content).toContain('No recognized stack');
  });

  it('includes Rust commands for rust stack', () => {
    const content = generateAgentsMdContent(testDir, 'rust');
    expect(content).toContain('cargo build');
    expect(content).toContain('cargo test');
  });

  it('labels Rust stack correctly', () => {
    const content = generateAgentsMdContent(testDir, 'rust');
    expect(content).toContain('Rust');
  });

  it('includes Claude Code BMAD guidance by default', () => {
    const content = generateAgentsMdContent(testDir, 'nodejs');
    expect(content).toContain('## Harness Files');
    expect(content).toContain('commands/');
    expect(content).toContain('skills/');
    expect(content).toContain('--tools claude-code');
  });

  it('includes Codex BMAD guidance when requested', () => {
    const content = generateAgentsMdContent(testDir, 'nodejs', 'opencode');
    expect(content).toContain('## Harness Files');
    expect(content).toContain('--tools none');
  });
});

describe('generateAgentsMdContent — multi-stack', () => {
  it('generates per-stack sections with directory-relative commands', () => {
    const content = generateAgentsMdContent(testDir, [
      { stack: 'nodejs', dir: 'frontend' },
      { stack: 'rust', dir: 'backend' },
    ]);
    expect(content).toContain('### Node.js (frontend/)');
    expect(content).toContain('### Rust (backend/)');
    expect(content).toContain('cd frontend && npm install');
    expect(content).toContain('cd backend && cargo build');
    expect(content).toContain('cd frontend && npm test');
    expect(content).toContain('cd backend && cargo test');
  });

  it('omits cd prefix for root stack (dir === ".")', () => {
    const content = generateAgentsMdContent(testDir, [
      { stack: 'nodejs', dir: '.' },
      { stack: 'rust', dir: 'backend' },
    ]);
    // Root stack should have bare commands
    expect(content).toContain('npm install');
    expect(content).not.toContain('cd . &&');
    // Subdir stack should have cd prefix
    expect(content).toContain('cd backend && cargo build');
    // Root heading should not have directory suffix
    expect(content).toContain('### Node.js');
    expect(content).not.toContain('### Node.js (./)');
  });

  it('lists combined stack label in header', () => {
    const content = generateAgentsMdContent(testDir, [
      { stack: 'nodejs', dir: 'frontend' },
      { stack: 'rust', dir: 'backend' },
    ]);
    expect(content).toContain('Node.js + Rust');
  });

  it('single-stack string argument still produces existing output (backward compat)', () => {
    const content = generateAgentsMdContent(testDir, 'nodejs');
    expect(content).toContain('npm install');
    expect(content).toContain('npm test');
    expect(content).not.toContain('###');
  });

  it('includes python commands in multi-stack with cd prefix', () => {
    const content = generateAgentsMdContent(testDir, [
      { stack: 'python', dir: 'ml' },
      { stack: 'nodejs', dir: '.' },
    ]);
    expect(content).toContain('cd ml && pip install');
    expect(content).toContain('cd ml && python -m pytest');
    expect(content).toContain('### Python (ml/)');
  });

  it('unwraps single-element StackDetection[] to single-stack output (no subsections)', () => {
    const content = generateAgentsMdContent(testDir, [{ stack: 'nodejs', dir: '.' }]);
    expect(content).toContain('npm install');
    expect(content).toContain('npm test');
    // Should produce flat single-stack output, not multi-stack subsections
    expect(content).not.toContain('###');
  });

  it('treats empty StackDetection[] as null (unknown stack)', () => {
    const content = generateAgentsMdContent(testDir, []);
    expect(content).toContain('No recognized stack');
  });
});

describe('generateDocsIndexContent', () => {
  it('includes documentation sections', () => {
    const content = generateDocsIndexContent();
    expect(content).toContain('Planning Artifacts');
    expect(content).toContain('Execution');
    expect(content).toContain('Quality');
  });
});

describe('scaffoldDocs', () => {
  it('creates AGENTS.md when it does not exist', async () => {
    const result = await scaffoldDocs({ projectDir: testDir, stack: 'nodejs', isJson: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agents_md).toBe('created');
    }
  });

  it('reports exists when AGENTS.md already exists', async () => {
    writeFileSync(join(testDir, 'AGENTS.md'), '# existing');
    const result = await scaffoldDocs({ projectDir: testDir, stack: 'nodejs', isJson: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agents_md).toBe('exists');
    }
  });

  it('creates docs scaffold when docs/ does not exist', async () => {
    const result = await scaffoldDocs({ projectDir: testDir, stack: 'nodejs', isJson: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.docs_scaffold).toBe('created');
    }
  });

  it('creates README.md when it does not exist', async () => {
    const result = await scaffoldDocs({ projectDir: testDir, stack: 'nodejs', isJson: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.readme).toBe('created');
    }
  });

  it('reports exists when README.md already exists', async () => {
    writeFileSync(join(testDir, 'README.md'), '# existing');
    const result = await scaffoldDocs({ projectDir: testDir, stack: 'nodejs', isJson: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.readme).toBe('exists');
    }
  });

  it('suppresses console output in json mode', async () => {
    const spy = vi.spyOn(console, 'log');
    await scaffoldDocs({ projectDir: testDir, stack: 'nodejs', isJson: true });
    // In json mode, no [OK]/[INFO] messages should be printed
    const calls = spy.mock.calls.map(c => c[0] as string);
    const outputCalls = calls.filter(c => c && (c.startsWith('[OK]') || c.startsWith('[INFO]')));
    expect(outputCalls).toHaveLength(0);
  });

  it('passes multi-stack stacks to AGENTS.md generation (AC5)', async () => {
    const stacks = [
      { stack: 'nodejs' as const, dir: 'frontend' },
      { stack: 'rust' as const, dir: 'backend' },
    ];
    const result = await scaffoldDocs({ projectDir: testDir, stack: 'nodejs', stacks, isJson: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agents_md).toBe('created');
    }
    // Verify AGENTS.md was created with multi-stack content
    const { readFileSync } = require('node:fs');
    const content = readFileSync(join(testDir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('### Node.js (frontend/)');
    expect(content).toContain('### Rust (backend/)');
  });

  it('uses single-stack path when stacks has only one entry', async () => {
    const stacks = [{ stack: 'nodejs' as const, dir: '.' }];
    const result = await scaffoldDocs({ projectDir: testDir, stack: 'nodejs', stacks, isJson: false });
    expect(result.success).toBe(true);
    // Single-element stacks should fall back to single-stack (opts.stack) path
    const { readFileSync } = require('node:fs');
    const content = readFileSync(join(testDir, 'AGENTS.md'), 'utf-8');
    expect(content).not.toContain('###');
  });
});
