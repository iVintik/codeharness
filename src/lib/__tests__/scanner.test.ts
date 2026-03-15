import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  scanCodebase,
  analyzeCoverageGaps,
  auditDocumentation,
} from '../scanner.js';
import type { ModuleInfo } from '../scanner.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-scanner-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// Helper to create a file with specific content
function createFile(relPath: string, content = ''): string {
  const fullPath = join(testDir, relPath);
  mkdirSync(join(fullPath, '..'), { recursive: true });
  writeFileSync(fullPath, content, 'utf-8');
  return fullPath;
}

// Helper to set file mtime
function setMtime(filePath: string, date: Date): void {
  utimesSync(filePath, date, date);
}

// ─── scanCodebase ─────────────────────────────────────────────────────────────

describe('scanCodebase', () => {
  it('detects modules and counts source files', () => {
    createFile('src/a.ts', 'code');
    createFile('src/b.ts', 'code');
    createFile('src/c.ts', 'code');
    createFile('lib/x.js', 'code');
    createFile('lib/y.py', 'code');

    const result = scanCodebase(testDir);
    expect(result.modules.length).toBe(1); // only src qualifies (3 files)
    expect(result.modules[0].path).toBe('src');
    expect(result.totalSourceFiles).toBe(5);
  });

  it('counts test files separately per module', () => {
    createFile('src/a.ts', 'code');
    createFile('src/b.ts', 'code');
    createFile('src/c.ts', 'code');
    createFile('src/__tests__/a.test.ts', 'test');
    createFile('src/d.test.ts', 'test');

    const result = scanCodebase(testDir);
    const srcModule = result.modules.find(m => m.path === 'src');
    expect(srcModule).toBeDefined();
    expect(srcModule!.sourceFiles).toBe(3);
    expect(srcModule!.testFiles).toBe(2);
  });

  it('respects minModuleSize option', () => {
    createFile('src/a.ts', 'code');
    createFile('src/b.ts', 'code');
    createFile('lib/x.ts', 'code');
    createFile('lib/y.ts', 'code');

    // Default threshold 3 — neither qualifies
    const result3 = scanCodebase(testDir);
    expect(result3.modules.length).toBe(0);

    // Threshold 2 — both qualify
    const result2 = scanCodebase(testDir, { minModuleSize: 2 });
    expect(result2.modules.length).toBe(2);
  });

  it('threshold 1 produces more modules than threshold 5', () => {
    createFile('src/a.ts', 'code');
    createFile('src/b.ts', 'code');
    createFile('src/c.ts', 'code');
    createFile('lib/x.ts', 'code');
    createFile('lib/y.ts', 'code');
    createFile('utils/z.ts', 'code');

    const low = scanCodebase(testDir, { minModuleSize: 1 });
    const high = scanCodebase(testDir, { minModuleSize: 5 });
    expect(low.modules.length).toBeGreaterThan(high.modules.length);
  });

  it('detects bmalph artifacts', () => {
    createFile('src/a.ts', 'code');
    createFile('.ralph/.ralphrc', 'config');
    createFile('_bmad/config.md', 'bmad config');

    const result = scanCodebase(testDir, { minModuleSize: 1 });
    expect(result.artifacts.hasBmalph).toBe(true);
    expect(result.artifacts.hasBmad).toBe(true);
    expect(result.artifacts.bmalpthFiles).toContain('.ralph/.ralphrc');
    // _bmad is preserved, not flagged as bmalph
    expect(result.artifacts.bmadPath).toBe('_bmad');
  });

  it('detects root .ralphrc as bmalph artifact', () => {
    createFile('.ralphrc', 'config');

    const result = scanCodebase(testDir, { minModuleSize: 1 });
    expect(result.artifacts.hasBmalph).toBe(true);
    expect(result.artifacts.bmalpthFiles).toContain('.ralphrc');
  });

  it('reports hasBmalph=false when no bmalph artifacts exist', () => {
    createFile('src/a.ts', 'code');

    const result = scanCodebase(testDir, { minModuleSize: 1 });
    expect(result.artifacts.hasBmalph).toBe(false);
    expect(result.artifacts.bmalpthFiles).toHaveLength(0);
  });

  it('parent-grouping: subdirectory below threshold not a standalone module', () => {
    // src/commands has 4 files (qualifies at threshold 3)
    createFile('src/commands/a.ts', 'code');
    createFile('src/commands/b.ts', 'code');
    createFile('src/commands/c.ts', 'code');
    createFile('src/commands/d.ts', 'code');
    // src/commands/utils has 1 file (below threshold)
    createFile('src/commands/utils/helper.ts', 'code');

    const result = scanCodebase(testDir);
    const modulePaths = result.modules.map(m => m.path);
    expect(modulePaths).toContain('src/commands');
    expect(modulePaths).not.toContain('src/commands/utils');
  });

  it('excludes node_modules from source file count', () => {
    createFile('src/a.ts', 'code');
    createFile('node_modules/pkg/a.ts', 'code');
    createFile('node_modules/pkg/b.ts', 'code');
    createFile('node_modules/pkg/c.ts', 'code');

    const result = scanCodebase(testDir, { minModuleSize: 1 });
    expect(result.totalSourceFiles).toBe(1);
  });
});

// ─── analyzeCoverageGaps ──────────────────────────────────────────────────────

describe('analyzeCoverageGaps', () => {
  it('returns zero report when no coverage tool detected', () => {
    const modules: ModuleInfo[] = [
      { path: 'src', sourceFiles: 5, testFiles: 2 },
    ];

    // testDir has no package.json — no coverage tool
    const report = analyzeCoverageGaps(modules, testDir);
    expect(report.overall).toBe(0);
    expect(report.modules[0].coveragePercent).toBe(0);
    expect(report.modules[0].uncoveredFileCount).toBe(5);
    expect(report.uncoveredFiles).toBe(5);
  });

  it('reads overall coverage from vitest report', () => {
    // Set up project with vitest coverage report
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test',
        devDependencies: { '@vitest/coverage-v8': '^1.0.0' },
      }),
    );
    mkdirSync(join(testDir, 'coverage'), { recursive: true });
    writeFileSync(
      join(testDir, 'coverage', 'coverage-summary.json'),
      JSON.stringify({
        total: {
          statements: { pct: 87.5 },
        },
        'src/a.ts': { statements: { pct: 100 } },
        'src/b.ts': { statements: { pct: 75 } },
        'src/c.ts': { statements: { pct: 0 } },
      }),
    );

    const modules: ModuleInfo[] = [
      { path: 'src', sourceFiles: 3, testFiles: 1 },
    ];

    const report = analyzeCoverageGaps(modules, testDir);
    expect(report.overall).toBe(87.5);
  });

  it('computes per-module coverage from report data', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test',
        devDependencies: { '@vitest/coverage-v8': '^1.0.0' },
      }),
    );
    mkdirSync(join(testDir, 'coverage'), { recursive: true });
    writeFileSync(
      join(testDir, 'coverage', 'coverage-summary.json'),
      JSON.stringify({
        total: { statements: { pct: 75 } },
        'src/a.ts': { statements: { pct: 100 } },
        'src/b.ts': { statements: { pct: 50 } },
        'lib/c.ts': { statements: { pct: 0 } },
      }),
    );

    const modules: ModuleInfo[] = [
      { path: 'src', sourceFiles: 2, testFiles: 1 },
      { path: 'lib', sourceFiles: 1, testFiles: 0 },
    ];

    const report = analyzeCoverageGaps(modules, testDir);
    expect(report.overall).toBe(75);

    const srcMod = report.modules.find(m => m.path === 'src');
    expect(srcMod).toBeDefined();
    expect(srcMod!.coveragePercent).toBe(75); // (100 + 50) / 2

    const libMod = report.modules.find(m => m.path === 'lib');
    expect(libMod).toBeDefined();
    expect(libMod!.coveragePercent).toBe(0);
    expect(libMod!.uncoveredFileCount).toBe(1);
  });

  it('counts total uncovered files across all modules', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test',
        devDependencies: { '@vitest/coverage-v8': '^1.0.0' },
      }),
    );
    mkdirSync(join(testDir, 'coverage'), { recursive: true });
    writeFileSync(
      join(testDir, 'coverage', 'coverage-summary.json'),
      JSON.stringify({
        total: { statements: { pct: 50 } },
        'src/a.ts': { statements: { pct: 0 } },
        'lib/b.ts': { statements: { pct: 0 } },
        'lib/c.ts': { statements: { pct: 100 } },
      }),
    );

    const modules: ModuleInfo[] = [
      { path: 'src', sourceFiles: 1, testFiles: 0 },
      { path: 'lib', sourceFiles: 2, testFiles: 0 },
    ];

    const report = analyzeCoverageGaps(modules, testDir);
    expect(report.uncoveredFiles).toBe(2); // a.ts and b.ts
  });
});

// ─── auditDocumentation ───────────────────────────────────────────────────────

describe('auditDocumentation', () => {
  it('reports missing documents correctly', () => {
    // Empty project — no docs
    const result = auditDocumentation(testDir);
    const readme = result.documents.find(d => d.name === 'README.md');
    const agents = result.documents.find(d => d.name === 'AGENTS.md');
    const arch = result.documents.find(d => d.name === 'ARCHITECTURE.md');
    const docs = result.documents.find(d => d.name === 'docs/');

    expect(readme?.grade).toBe('missing');
    expect(agents?.grade).toBe('missing');
    expect(arch?.grade).toBe('missing');
    expect(docs?.grade).toBe('missing');
  });

  it('reports present documents correctly', () => {
    createFile('README.md', '# Project');
    createFile('AGENTS.md', '# Agents');
    createFile('ARCHITECTURE.md', '# Architecture');
    mkdirSync(join(testDir, 'docs'), { recursive: true });

    const result = auditDocumentation(testDir);
    const readme = result.documents.find(d => d.name === 'README.md');
    const agents = result.documents.find(d => d.name === 'AGENTS.md');
    const arch = result.documents.find(d => d.name === 'ARCHITECTURE.md');
    const docs = result.documents.find(d => d.name === 'docs/');

    expect(readme?.grade).toBe('present');
    expect(agents?.grade).toBe('present');
    expect(arch?.grade).toBe('present');
    expect(docs?.grade).toBe('present');
  });

  it('detects stale documents', () => {
    const readmePath = createFile('README.md', '# Project');
    const srcPath = createFile('src/a.ts', 'code');

    const past = new Date(Date.now() - 10000);
    const future = new Date(Date.now() + 10000);

    setMtime(readmePath, past);
    setMtime(srcPath, future);

    const result = auditDocumentation(testDir);
    const readme = result.documents.find(d => d.name === 'README.md');
    expect(readme?.grade).toBe('stale');
  });

  it('detects docs/index.md when present', () => {
    createFile('docs/index.md', '# Index');

    const result = auditDocumentation(testDir);
    const index = result.documents.find(d => d.name === 'docs/index.md');
    expect(index).toBeDefined();
    expect(index?.grade).toBe('present');
  });

  it('generates correct summary string', () => {
    createFile('README.md', '# Project');

    const result = auditDocumentation(testDir);
    // README present, AGENTS missing, ARCHITECTURE missing
    expect(result.summary).toContain('README.md(present)');
    expect(result.summary).toContain('AGENTS.md(missing)');
    expect(result.summary).toContain('ARCHITECTURE.md(missing)');
  });

  it('summary does not include docs/ entries', () => {
    createFile('docs/index.md', '# Index');

    const result = auditDocumentation(testDir);
    // docs/ and docs/index.md should not appear in summary
    expect(result.summary).not.toContain('docs/');
  });

  it('reports docs/index.md as missing when absent', () => {
    const result = auditDocumentation(testDir);
    const index = result.documents.find(d => d.name === 'docs/index.md');
    expect(index).toBeDefined();
    expect(index?.grade).toBe('missing');
    expect(index?.path).toBeNull();
  });

  it('detects stale docs/index.md', () => {
    const indexPath = createFile('docs/index.md', '# Index');
    const srcPath = createFile('src/a.ts', 'code');

    const past = new Date(Date.now() - 10000);
    const future = new Date(Date.now() + 10000);

    setMtime(indexPath, past);
    setMtime(srcPath, future);

    const result = auditDocumentation(testDir);
    const index = result.documents.find(d => d.name === 'docs/index.md');
    expect(index).toBeDefined();
    expect(index?.grade).toBe('stale');
  });
});

// ─── countSourceFiles __tests__ exclusion ────────────────────────────────────

describe('scanCodebase __tests__ handling', () => {
  it('excludes files inside __tests__ directories from total source file count', () => {
    createFile('src/a.ts', 'code');
    createFile('src/b.ts', 'code');
    createFile('src/c.ts', 'code');
    createFile('src/__tests__/helper.ts', 'not a test by naming');
    createFile('src/__tests__/fixtures.ts', 'fixture data');

    const result = scanCodebase(testDir, { minModuleSize: 1 });
    // Only 3 source files — __tests__/ contents excluded from total count
    expect(result.totalSourceFiles).toBe(3);
  });
});
