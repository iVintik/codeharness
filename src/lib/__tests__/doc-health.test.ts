import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  findModules,
  isDocStale,
  checkAgentsMdForModule,
  checkDoNotEditHeaders,
  scanDocHealth,
  checkStoryDocFreshness,
  createExecPlan,
  completeExecPlan,
  getExecPlanStatus,
  formatDocHealthOutput,
  printDocHealthOutput,
} from '../doc-health.js';
import type { DocHealthReport } from '../doc-health.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-doc-health-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// Helper to set file mtime to a specific time
function setMtime(filePath: string, date: Date): void {
  utimesSync(filePath, date, date);
}

// Helper to create a file with specific content
function createFile(relPath: string, content = ''): string {
  const fullPath = join(testDir, relPath);
  mkdirSync(join(fullPath, '..'), { recursive: true });
  writeFileSync(fullPath, content, 'utf-8');
  return fullPath;
}

// ─── findModules ─────────────────────────────────────────────────────────────

describe('findModules', () => {
  it('finds directories with at least 3 source files', () => {
    createFile('src/a.ts', 'code');
    createFile('src/b.ts', 'code');
    createFile('src/c.ts', 'code');
    createFile('lib/x.ts', 'code');
    createFile('lib/y.ts', 'code');

    const modules = findModules(testDir);
    expect(modules).toContain('src');
    expect(modules).not.toContain('lib');
  });

  it('respects custom threshold', () => {
    createFile('lib/x.ts', 'code');
    createFile('lib/y.ts', 'code');

    const modules = findModules(testDir, 2);
    expect(modules).toContain('lib');
  });

  it('excludes test files', () => {
    createFile('src/a.test.ts', 'test');
    createFile('src/b.spec.ts', 'test');
    createFile('src/test_c.ts', 'test');
    createFile('src/d.ts', 'code');

    const modules = findModules(testDir, 2);
    // Only d.ts is a source file, so src should not qualify
    expect(modules).not.toContain('src');
  });

  it('excludes node_modules', () => {
    createFile('node_modules/pkg/a.ts', 'code');
    createFile('node_modules/pkg/b.ts', 'code');
    createFile('node_modules/pkg/c.ts', 'code');

    const modules = findModules(testDir);
    expect(modules).toHaveLength(0);
  });

  it('finds nested modules', () => {
    createFile('src/lib/a.ts', 'code');
    createFile('src/lib/b.ts', 'code');
    createFile('src/lib/c.ts', 'code');

    const modules = findModules(testDir);
    expect(modules).toContain('src/lib');
  });

  it('supports .js and .py extensions', () => {
    createFile('app/a.js', 'code');
    createFile('app/b.py', 'code');
    createFile('app/c.ts', 'code');

    const modules = findModules(testDir);
    expect(modules).toContain('app');
  });

  it('returns empty for directory with no source files', () => {
    createFile('docs/readme.md', 'text');
    createFile('docs/guide.md', 'text');
    createFile('docs/faq.md', 'text');

    const modules = findModules(testDir);
    expect(modules).toHaveLength(0);
  });
});

// ─── isDocStale ──────────────────────────────────────────────────────────────

describe('isDocStale', () => {
  it('returns true when source is newer than doc', () => {
    const docPath = createFile('AGENTS.md', '# Agents');
    const srcPath = createFile('src/a.ts', 'code');

    const past = new Date(Date.now() - 10000);
    const future = new Date(Date.now() + 10000);

    setMtime(docPath, past);
    setMtime(srcPath, future);

    expect(isDocStale(docPath, join(testDir, 'src'))).toBe(true);
  });

  it('returns false when doc is newer than source', () => {
    const docPath = createFile('AGENTS.md', '# Agents');
    const srcPath = createFile('src/a.ts', 'code');

    const past = new Date(Date.now() - 10000);
    const future = new Date(Date.now() + 10000);

    setMtime(srcPath, past);
    setMtime(docPath, future);

    expect(isDocStale(docPath, join(testDir, 'src'))).toBe(false);
  });

  it('returns true when doc does not exist', () => {
    createFile('src/a.ts', 'code');
    expect(isDocStale(join(testDir, 'AGENTS.md'), join(testDir, 'src'))).toBe(true);
  });

  it('returns false when code dir does not exist', () => {
    const docPath = createFile('AGENTS.md', '# Agents');
    expect(isDocStale(docPath, join(testDir, 'nonexistent'))).toBe(false);
  });

  it('returns false when code dir has no source files', () => {
    const docPath = createFile('AGENTS.md', '# Agents');
    createFile('src/readme.md', 'text');

    expect(isDocStale(docPath, join(testDir, 'src'))).toBe(false);
  });
});

// ─── checkAgentsMdForModule ──────────────────────────────────────────────────

describe('checkAgentsMdForModule', () => {
  it('returns fresh when module AGENTS.md is newer than code', () => {
    const agentsPath = createFile('src/AGENTS.md', '# Agents');
    const srcPath = createFile('src/a.ts', 'code');

    const past = new Date(Date.now() - 10000);
    const future = new Date(Date.now() + 10000);

    setMtime(srcPath, past);
    setMtime(agentsPath, future);

    const result = checkAgentsMdForModule('src', testDir);
    expect(result.grade).toBe('fresh');
    expect(result.reason).toBe('Up to date');
  });

  it('returns stale when code is newer than AGENTS.md', () => {
    const agentsPath = createFile('src/AGENTS.md', '# Agents');
    const srcPath = createFile('src/a.ts', 'code');

    const past = new Date(Date.now() - 10000);
    const future = new Date(Date.now() + 10000);

    setMtime(agentsPath, past);
    setMtime(srcPath, future);

    const result = checkAgentsMdForModule('src', testDir);
    expect(result.grade).toBe('stale');
    expect(result.reason).toContain('AGENTS.md stale for module: src');
  });

  it('falls back to root AGENTS.md when module has none', () => {
    const agentsPath = createFile('AGENTS.md', '# Root');
    const srcPath = createFile('src/a.ts', 'code');

    const past = new Date(Date.now() - 10000);
    const future = new Date(Date.now() + 10000);

    setMtime(srcPath, past);
    setMtime(agentsPath, future);

    const result = checkAgentsMdForModule('src', testDir);
    expect(result.grade).toBe('fresh');
  });

  it('returns missing when no AGENTS.md found', () => {
    createFile('src/a.ts', 'code');

    const result = checkAgentsMdForModule('src', testDir);
    expect(result.grade).toBe('missing');
    expect(result.reason).toContain('No AGENTS.md found for module: src');
  });
});

// ─── checkDoNotEditHeaders ───────────────────────────────────────────────────

describe('checkDoNotEditHeaders', () => {
  it('returns true when file starts with DO NOT EDIT MANUALLY', () => {
    const filePath = createFile('docs/quality/report.md', '<!-- DO NOT EDIT MANUALLY -->\n# Report');
    expect(checkDoNotEditHeaders(filePath)).toBe(true);
  });

  it('returns true with whitespace before header', () => {
    const filePath = createFile('docs/quality/report.md', '\n<!-- DO NOT EDIT MANUALLY -->\n# Report');
    expect(checkDoNotEditHeaders(filePath)).toBe(true);
  });

  it('returns false when header is missing', () => {
    const filePath = createFile('docs/quality/report.md', '# Report\nSome content');
    expect(checkDoNotEditHeaders(filePath)).toBe(false);
  });

  it('returns false for empty file', () => {
    const filePath = createFile('docs/quality/empty.md', '');
    expect(checkDoNotEditHeaders(filePath)).toBe(false);
  });

  it('returns false for nonexistent file', () => {
    expect(checkDoNotEditHeaders(join(testDir, 'nope.md'))).toBe(false);
  });
});

// ─── scanDocHealth ───────────────────────────────────────────────────────────

describe('scanDocHealth', () => {
  it('produces correct grades for fresh AGENTS.md', () => {
    // Create AGENTS.md and source files where doc is newest
    const agentsPath = createFile('AGENTS.md', '# Agents');
    createFile('src/a.ts', 'code');
    createFile('src/b.ts', 'code');
    createFile('src/c.ts', 'code');

    const future = new Date(Date.now() + 10000);
    setMtime(agentsPath, future);

    const report = scanDocHealth(testDir);
    const agentsResult = report.documents.find(d => d.path === 'AGENTS.md' && d.grade !== 'fresh' || d.path === 'AGENTS.md');
    expect(agentsResult).toBeDefined();
    expect(agentsResult!.grade).toBe('fresh');
  });

  it('produces stale grade when code is newer than AGENTS.md', () => {
    const agentsPath = createFile('AGENTS.md', '# Agents');
    const srcPath = createFile('src/a.ts', 'code');
    createFile('src/b.ts', 'code');
    createFile('src/c.ts', 'code');

    const past = new Date(Date.now() - 10000);
    const future = new Date(Date.now() + 10000);

    setMtime(agentsPath, past);
    setMtime(srcPath, future);

    const report = scanDocHealth(testDir);
    expect(report.passed).toBe(false);
    expect(report.summary.stale).toBeGreaterThanOrEqual(1);
  });

  it('reports missing AGENTS.md', () => {
    createFile('src/a.ts', 'code');
    createFile('src/b.ts', 'code');
    createFile('src/c.ts', 'code');

    const report = scanDocHealth(testDir);
    expect(report.passed).toBe(false);
    const missing = report.documents.find(d => d.path === 'AGENTS.md' && d.grade === 'missing');
    expect(missing).toBeDefined();
  });

  it('checks docs/quality files for DO NOT EDIT header', () => {
    createFile('AGENTS.md', '# Agents');
    createFile('docs/quality/report.md', '<!-- DO NOT EDIT MANUALLY -->\n# Report');
    createFile('docs/quality/bad.md', '# Bad report');

    const report = scanDocHealth(testDir);
    const goodDoc = report.documents.find(d => d.path === 'docs/quality/report.md');
    const badDoc = report.documents.find(d => d.path === 'docs/quality/bad.md');

    expect(goodDoc?.grade).toBe('fresh');
    expect(badDoc?.grade).toBe('stale');
  });

  it('checks docs/generated files for DO NOT EDIT header', () => {
    createFile('AGENTS.md', '# Agents');
    createFile('docs/generated/auto.md', '<!-- DO NOT EDIT MANUALLY -->\n# Auto');

    const report = scanDocHealth(testDir);
    const doc = report.documents.find(d => d.path === 'docs/generated/auto.md');
    expect(doc?.grade).toBe('fresh');
  });

  it('includes docs/index.md in scan', () => {
    createFile('AGENTS.md', '# Agents');
    createFile('docs/index.md', '# Index\n[link](../artifacts/prd.md)');

    const report = scanDocHealth(testDir);
    const indexDoc = report.documents.find(d => d.path === 'docs/index.md');
    expect(indexDoc).toBeDefined();
    expect(indexDoc!.grade).toBe('fresh');
  });

  it('reports active exec-plans', () => {
    createFile('AGENTS.md', '# Agents');
    createFile('docs/exec-plans/active/test-story.md', '# Exec Plan');

    const report = scanDocHealth(testDir);
    const execPlan = report.documents.find(d => d.path === 'docs/exec-plans/active/test-story.md');
    expect(execPlan).toBeDefined();
    expect(execPlan!.grade).toBe('fresh');
  });

  it('completes within 60 seconds (NFR23)', () => {
    // Create a project with ~50 files
    createFile('AGENTS.md', '# Agents');
    for (let i = 0; i < 50; i++) {
      createFile(`src/file${i}.ts`, `// file ${i}`);
    }

    const report = scanDocHealth(testDir);
    expect(report.scanDurationMs).toBeLessThan(60_000);
  });

  it('warns when AGENTS.md exceeds 100 lines (NFR24)', () => {
    const lines = Array.from({ length: 120 }, (_, i) => `Line ${i}`).join('\n');
    createFile('AGENTS.md', lines);
    createFile('src/a.ts', 'code');
    createFile('src/b.ts', 'code');
    createFile('src/c.ts', 'code');

    const future = new Date(Date.now() + 10000);
    setMtime(join(testDir, 'AGENTS.md'), future);

    const report = scanDocHealth(testDir);
    const warnings = report.documents.filter(d => d.reason.includes('exceeds 100 lines'));
    expect(warnings.length).toBeGreaterThanOrEqual(1);
  });

  it('correctly computes summary counts', () => {
    createFile('AGENTS.md', '# Agents');
    createFile('docs/quality/good.md', '<!-- DO NOT EDIT MANUALLY -->\n# Good');
    createFile('docs/quality/bad.md', '# Bad');

    const report = scanDocHealth(testDir);
    expect(report.summary.total).toBe(report.documents.length);
    expect(report.summary.fresh + report.summary.stale + report.summary.missing).toBe(report.summary.total);
  });

  it('skips hidden directories in docs/quality', () => {
    createFile('AGENTS.md', '# Agents');
    createFile('docs/quality/.gitkeep', '');

    const report = scanDocHealth(testDir);
    const gitkeep = report.documents.find(d => d.path.includes('.gitkeep'));
    expect(gitkeep).toBeUndefined();
  });
});

// ─── checkStoryDocFreshness ──────────────────────────────────────────────────

describe('checkStoryDocFreshness', () => {
  it('checks AGENTS.md freshness for modules', () => {
    const agentsPath = createFile('AGENTS.md', '# Agents');
    createFile('src/a.ts', 'code');
    createFile('src/b.ts', 'code');
    createFile('src/c.ts', 'code');

    const future = new Date(Date.now() + 10000);
    setMtime(agentsPath, future);

    // Without git, falls back to full scan
    const report = checkStoryDocFreshness('test-story', testDir);
    expect(report.documents.length).toBeGreaterThanOrEqual(1);
  });

  it('returns passed when all docs are fresh', () => {
    const agentsPath = createFile('AGENTS.md', '# Agents');
    createFile('src/a.ts', 'code');
    createFile('src/b.ts', 'code');
    createFile('src/c.ts', 'code');

    const future = new Date(Date.now() + 10000);
    setMtime(agentsPath, future);

    const report = checkStoryDocFreshness('test-story', testDir);
    expect(report.passed).toBe(true);
  });

  it('returns not passed when AGENTS.md is stale', () => {
    const agentsPath = createFile('AGENTS.md', '# Agents');
    const srcPath = createFile('src/a.ts', 'code');
    createFile('src/b.ts', 'code');
    createFile('src/c.ts', 'code');

    const past = new Date(Date.now() - 10000);
    const future = new Date(Date.now() + 10000);

    setMtime(agentsPath, past);
    setMtime(srcPath, future);

    const report = checkStoryDocFreshness('test-story', testDir);
    expect(report.passed).toBe(false);
  });

  it('reports root AGENTS.md when no modules to check', () => {
    createFile('AGENTS.md', '# Agents');
    // No source files means no modules

    const report = checkStoryDocFreshness('test-story', testDir);
    const agentsDoc = report.documents.find(d => d.path === 'AGENTS.md');
    expect(agentsDoc).toBeDefined();
  });
});

// ─── Exec-Plan Lifecycle ─────────────────────────────────────────────────────

describe('createExecPlan', () => {
  it('creates exec-plan in active directory', () => {
    const path = createExecPlan('test-story', testDir);
    expect(existsSync(path)).toBe(true);
    expect(path).toContain('docs/exec-plans/active/test-story.md');
  });

  it('includes DO NOT EDIT header', () => {
    const path = createExecPlan('test-story', testDir);
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('DO NOT EDIT MANUALLY');
  });

  it('includes Status: active', () => {
    const path = createExecPlan('test-story', testDir);
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('Status: active');
  });

  it('includes Created timestamp', () => {
    const path = createExecPlan('test-story', testDir);
    const content = readFileSync(path, 'utf-8');
    expect(content).toMatch(/Created: \d{4}-\d{2}-\d{2}/);
  });

  it('extracts content from story file if available', () => {
    // Create a story file
    const storyContent = [
      '# Story: Test Story',
      '',
      '## Acceptance Criteria',
      '',
      '1. Given X, When Y, Then Z',
      '',
      '## Tasks / Subtasks',
      '',
      '- [ ] Task 1: Do something',
      '- [ ] Task 2: Do something else',
      '',
    ].join('\n');

    mkdirSync(join(testDir, '_bmad-output', 'implementation-artifacts'), { recursive: true });
    writeFileSync(join(testDir, '_bmad-output', 'implementation-artifacts', 'test-story.md'), storyContent);

    const path = createExecPlan('test-story', testDir);
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('Given X, When Y, Then Z');
    expect(content).toContain('Task 1: Do something');
  });
});

describe('completeExecPlan', () => {
  it('moves exec-plan from active to completed', () => {
    createExecPlan('test-story', testDir);
    const completedPath = completeExecPlan('test-story', testDir);

    expect(completedPath).not.toBeNull();
    expect(completedPath!).toContain('docs/exec-plans/completed/test-story.md');
    expect(existsSync(completedPath!)).toBe(true);
    expect(existsSync(join(testDir, 'docs/exec-plans/active/test-story.md'))).toBe(false);
  });

  it('updates status to completed', () => {
    createExecPlan('test-story', testDir);
    const completedPath = completeExecPlan('test-story', testDir)!;
    const content = readFileSync(completedPath, 'utf-8');
    expect(content).toContain('Status: completed');
    expect(content).not.toContain('Status: active');
  });

  it('adds Completed timestamp', () => {
    createExecPlan('test-story', testDir);
    const completedPath = completeExecPlan('test-story', testDir)!;
    const content = readFileSync(completedPath, 'utf-8');
    expect(content).toMatch(/Completed: \d{4}-\d{2}-\d{2}/);
  });

  it('returns null when no active exec-plan exists', () => {
    const result = completeExecPlan('nonexistent', testDir);
    expect(result).toBeNull();
  });
});

describe('getExecPlanStatus', () => {
  it('returns active when exec-plan is in active directory', () => {
    createExecPlan('test-story', testDir);
    expect(getExecPlanStatus('test-story', testDir)).toBe('active');
  });

  it('returns completed when exec-plan is in completed directory', () => {
    createExecPlan('test-story', testDir);
    completeExecPlan('test-story', testDir);
    expect(getExecPlanStatus('test-story', testDir)).toBe('completed');
  });

  it('returns missing when no exec-plan exists', () => {
    expect(getExecPlanStatus('nonexistent', testDir)).toBe('missing');
  });
});

// ─── formatDocHealthOutput ───────────────────────────────────────────────────

describe('formatDocHealthOutput', () => {
  it('formats healthy report correctly', () => {
    const report: DocHealthReport = {
      documents: [
        { path: 'AGENTS.md', grade: 'fresh', lastModified: new Date(), codeLastModified: new Date(), reason: 'Up to date' },
      ],
      summary: { fresh: 1, stale: 0, missing: 0, total: 1 },
      passed: true,
      scanDurationMs: 10,
    };

    const lines = formatDocHealthOutput(report);
    expect(lines).toContain('[OK] AGENTS.md: fresh');
    expect(lines.some(l => l.includes('1 fresh, 0 stale, 0 missing'))).toBe(true);
  });

  it('formats stale report correctly', () => {
    const report: DocHealthReport = {
      documents: [
        { path: 'AGENTS.md', grade: 'stale', lastModified: new Date(), codeLastModified: new Date(), reason: 'AGENTS.md stale for module: src' },
      ],
      summary: { fresh: 0, stale: 1, missing: 0, total: 1 },
      passed: false,
      scanDurationMs: 10,
    };

    const lines = formatDocHealthOutput(report);
    expect(lines).toContain('[FAIL] AGENTS.md stale for module: src');
  });

  it('formats missing doc correctly', () => {
    const report: DocHealthReport = {
      documents: [
        { path: 'AGENTS.md', grade: 'missing', lastModified: null, codeLastModified: null, reason: 'Root AGENTS.md not found' },
      ],
      summary: { fresh: 0, stale: 0, missing: 1, total: 1 },
      passed: false,
      scanDurationMs: 5,
    };

    const lines = formatDocHealthOutput(report);
    expect(lines).toContain('[FAIL] Root AGENTS.md not found');
  });
});

// ─── checkStoryDocFreshness with git ──────────────────────────────────────────

describe('checkStoryDocFreshness with git repo', () => {
  let gitDir: string;

  beforeEach(() => {
    gitDir = mkdtempSync(join(tmpdir(), 'ch-doc-health-git-'));
    // Initialize a git repo with some files
    const { execSync } = require('node:child_process') as typeof import('node:child_process');
    execSync('git init -q', { cwd: gitDir });
    execSync('git config user.email "test@test.com"', { cwd: gitDir });
    execSync('git config user.name "Test"', { cwd: gitDir });

    // Create initial files and commit
    mkdirSync(join(gitDir, 'src'), { recursive: true });
    writeFileSync(join(gitDir, 'src', 'a.ts'), 'code a');
    writeFileSync(join(gitDir, 'src', 'b.ts'), 'code b');
    writeFileSync(join(gitDir, 'src', 'c.ts'), 'code c');
    writeFileSync(join(gitDir, 'AGENTS.md'), '# Agents');
    execSync('git add -A && git commit -q -m "init"', { cwd: gitDir });

    // Make a change and commit
    writeFileSync(join(gitDir, 'src', 'a.ts'), 'code a modified');
    execSync('git add -A && git commit -q -m "modify a"', { cwd: gitDir });
  });

  afterEach(() => {
    rmSync(gitDir, { recursive: true, force: true });
  });

  it('uses git to detect changed modules', () => {
    // Touch AGENTS.md to be newer
    const future = new Date(Date.now() + 10000);
    setMtime(join(gitDir, 'AGENTS.md'), future);

    const report = checkStoryDocFreshness('test-story', gitDir);
    // Should detect src as a changed module via git
    expect(report.documents.length).toBeGreaterThanOrEqual(1);
  });

  it('detects stale AGENTS.md via git-based checking', () => {
    // AGENTS.md committed before the src change, so it's stale
    const past = new Date(Date.now() - 10000);
    setMtime(join(gitDir, 'AGENTS.md'), past);
    const future = new Date(Date.now() + 10000);
    setMtime(join(gitDir, 'src', 'a.ts'), future);

    const report = checkStoryDocFreshness('test-story', gitDir);
    expect(report.passed).toBe(false);
  });
});

// ─── printDocHealthOutput ────────────────────────────────────────────────────

describe('printDocHealthOutput', () => {
  it('calls output functions without error', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const report: DocHealthReport = {
      documents: [
        { path: 'AGENTS.md', grade: 'fresh', lastModified: new Date(), codeLastModified: new Date(), reason: 'Up to date' },
        { path: 'docs/quality/bad.md', grade: 'stale', lastModified: new Date(), codeLastModified: null, reason: 'Missing header' },
        { path: 'AGENTS.md', grade: 'missing', lastModified: null, codeLastModified: null, reason: 'Not found' },
      ],
      summary: { fresh: 1, stale: 1, missing: 1, total: 3 },
      passed: false,
      scanDurationMs: 10,
    };

    printDocHealthOutput(report);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
