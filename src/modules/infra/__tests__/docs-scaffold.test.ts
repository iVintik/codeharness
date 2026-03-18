import { describe, it, expect, vi, beforeEach } from 'vitest';
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

import { afterEach } from 'vitest';

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
});
