/**
 * Codebase scanning, module detection, coverage gap analysis, and documentation audit.
 *
 * Story 6.1: Codebase Scan & Gap Analysis
 * Reuses findModules() from doc-health.ts and coverage tools from coverage.ts.
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { findModules, isDocStale } from './doc-health.js';
import { detectCoverageTool, parseCoverageReport } from './coverage.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ModuleInfo {
  path: string;
  sourceFiles: number;
  testFiles: number;
}

export interface DetectedArtifacts {
  hasBmad: boolean;
  hasBmalph: boolean;
  bmadPath: string | null;
  bmalpthFiles: string[];
}

export interface ScanResult {
  modules: ModuleInfo[];
  totalSourceFiles: number;
  artifacts: DetectedArtifacts;
}

export interface ModuleCoverageInfo {
  path: string;
  coveragePercent: number;
  uncoveredFileCount: number;
}

export interface CoverageGapReport {
  overall: number;
  modules: ModuleCoverageInfo[];
  uncoveredFiles: number;
}

export interface DocAuditEntry {
  name: string;
  grade: 'present' | 'stale' | 'missing';
  path: string | null;
}

export interface DocAuditResult {
  documents: DocAuditEntry[];
  summary: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const SOURCE_EXTENSIONS = new Set(['.ts', '.js', '.py']);
const DEFAULT_MIN_MODULE_SIZE = 3;

// ─── Helpers ────────────────────────────────────────────────────────────────

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot) : '';
}

function isTestFile(filename: string): boolean {
  return (
    filename.includes('.test.') ||
    filename.includes('.spec.') ||
    filename.includes('__tests__') ||
    filename.startsWith('test_')
  );
}

function isSkippedDir(name: string): boolean {
  return name === 'node_modules' || name === '.git' || name === 'dist' || name === 'coverage';
}

// ─── Source File Counting (Task 1.3) ────────────────────────────────────────

/**
 * Counts total source files across the entire project, excluding test files,
 * node_modules, .git, etc.
 */
function countSourceFiles(dir: string): number {
  let count = 0;

  function walk(current: string): void {
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (isSkippedDir(entry)) continue;
      if (entry.startsWith('.') && current !== dir) continue;

      const fullPath = join(current, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        // Skip hidden directories at any level except root
        if (entry.startsWith('.')) continue;
        // Skip __tests__ directories — they contain test infrastructure, not source
        if (entry === '__tests__') continue;
        walk(fullPath);
      } else if (stat.isFile()) {
        const ext = getExtension(entry);
        if (SOURCE_EXTENSIONS.has(ext) && !isTestFile(entry)) {
          count++;
        }
      }
    }
  }

  walk(dir);
  return count;
}

// ─── Per-Module File Counting (Task 1.4) ─────────────────────────────────────

/**
 * For a given module path, counts source files and test files.
 */
function countModuleFiles(
  modulePath: string,
  rootDir: string,
): { sourceFiles: number; testFiles: number } {
  const fullModulePath = join(rootDir, modulePath);
  let sourceFiles = 0;
  let testFiles = 0;

  function walk(current: string): void {
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (isSkippedDir(entry)) continue;

      const fullPath = join(current, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile()) {
        const ext = getExtension(entry);
        if (SOURCE_EXTENSIONS.has(ext)) {
          if (isTestFile(entry) || current.includes('__tests__')) {
            testFiles++;
          } else {
            sourceFiles++;
          }
        }
      }
    }
  }

  walk(fullModulePath);
  return { sourceFiles, testFiles };
}

// ─── Artifact Detection (Task 1.5) ──────────────────────────────────────────

/**
 * Detects BMAD and bmalph artifacts in the project.
 */
function detectArtifacts(dir: string): DetectedArtifacts {
  const bmadPath = join(dir, '_bmad');
  const hasBmad = existsSync(bmadPath);

  const bmalpthFiles: string[] = [];

  // Check for .ralph directory
  const ralphDir = join(dir, '.ralph');
  if (existsSync(ralphDir)) {
    try {
      const stat = statSync(ralphDir);
      if (stat.isDirectory()) {
        // Check for .ralphrc inside
        const ralphrc = join(ralphDir, '.ralphrc');
        if (existsSync(ralphrc)) {
          bmalpthFiles.push('.ralph/.ralphrc');
        }
        // Also flag other files in .ralph/
        try {
          const entries = readdirSync(ralphDir);
          for (const entry of entries) {
            const entryPath = join(ralphDir, entry);
            try {
              const entryStat = statSync(entryPath);
              if (entryStat.isFile() && entry !== '.ralphrc') {
                bmalpthFiles.push(`.ralph/${entry}`);
              }
            } catch {
              // skip
            }
          }
        } catch {
          // skip
        }
      }
    } catch {
      // skip
    }
  }

  // Check for root .ralphrc
  const rootRalphrc = join(dir, '.ralphrc');
  if (existsSync(rootRalphrc)) {
    bmalpthFiles.push('.ralphrc');
  }

  return {
    hasBmad,
    hasBmalph: bmalpthFiles.length > 0,
    bmadPath: hasBmad ? relative(dir, bmadPath) || '_bmad' : null,
    bmalpthFiles,
  };
}

// ─── Codebase Scanning (Task 1.2, 1.6) ──────────────────────────────────────

/**
 * Scans the codebase for modules, source files, and artifacts.
 * Reuses findModules() from doc-health.ts for module detection.
 * Directories below the threshold are not standalone modules —
 * findModules() already handles this by only returning directories
 * that meet the threshold.
 */
export function scanCodebase(
  dir: string,
  options?: { minModuleSize?: number },
): ScanResult {
  const threshold = options?.minModuleSize ?? DEFAULT_MIN_MODULE_SIZE;

  // Use findModules from doc-health.ts — handles threshold, skips node_modules/.git,
  // and filters test files
  const modulePaths = findModules(dir, threshold);

  // Build ModuleInfo for each detected module
  const modules: ModuleInfo[] = modulePaths.map(modPath => {
    const { sourceFiles, testFiles } = countModuleFiles(modPath, dir);
    return { path: modPath, sourceFiles, testFiles };
  });

  // Count total source files across the entire project
  const totalSourceFiles = countSourceFiles(dir);

  // Detect artifacts
  const artifacts = detectArtifacts(dir);

  return { modules, totalSourceFiles, artifacts };
}

// ─── Coverage Gap Analysis (Task 2) ─────────────────────────────────────────

/**
 * Analyzes per-module coverage gaps by reading the coverage report
 * and mapping file paths to detected modules.
 */
export function analyzeCoverageGaps(
  modules: ModuleInfo[],
  dir?: string,
): CoverageGapReport {
  const baseDir = dir ?? process.cwd();

  // Detect coverage tool
  const toolInfo = detectCoverageTool(baseDir);

  if (toolInfo.tool === 'unknown') {
    // No coverage tool — return zero report
    return {
      overall: 0,
      modules: modules.map(m => ({
        path: m.path,
        coveragePercent: 0,
        uncoveredFileCount: m.sourceFiles,
      })),
      uncoveredFiles: modules.reduce((sum, m) => sum + m.sourceFiles, 0),
    };
  }

  // Get overall coverage from parsed report (don't run tests, just read report)
  const overall = parseCoverageReport(baseDir, toolInfo.reportFormat);

  // Try to read per-file coverage data for module breakdown
  const perFileCoverage = readPerFileCoverage(baseDir, toolInfo.reportFormat);

  let totalUncovered = 0;
  const moduleCoverage: ModuleCoverageInfo[] = modules.map(mod => {
    if (perFileCoverage === null) {
      // No per-file data — use overall for all modules
      return {
        path: mod.path,
        coveragePercent: overall,
        uncoveredFileCount: 0,
      };
    }

    // Map files to this module
    let coveredSum = 0;
    let fileCount = 0;
    let uncoveredCount = 0;

    for (const [filePath, pct] of perFileCoverage.entries()) {
      // Normalize file path to relative from project root
      const relPath = filePath.startsWith('/') ? relative(baseDir, filePath) : filePath;
      if (relPath.startsWith(mod.path + '/') || relPath === mod.path) {
        fileCount++;
        coveredSum += pct;
        if (pct === 0) {
          uncoveredCount++;
        }
      }
    }

    totalUncovered += uncoveredCount;

    const modulePercent = fileCount > 0 ? Math.round((coveredSum / fileCount) * 100) / 100 : 0;
    return {
      path: mod.path,
      coveragePercent: modulePercent,
      uncoveredFileCount: uncoveredCount,
    };
  });

  // If we couldn't break down per-file, count uncovered as total source files with 0%
  if (perFileCoverage === null) {
    totalUncovered = 0;
  }

  return {
    overall,
    modules: moduleCoverage,
    uncoveredFiles: totalUncovered,
  };
}

/**
 * Reads per-file coverage data from the coverage report JSON.
 * Returns a Map of file path -> statement coverage percentage.
 */
function readPerFileCoverage(
  dir: string,
  format: string,
): Map<string, number> | null {
  if (format === 'vitest-json' || format === 'jest-json') {
    return readVitestPerFileCoverage(dir);
  }
  if (format === 'coverage-py-json') {
    return readPythonPerFileCoverage(dir);
  }
  return null;
}

function readVitestPerFileCoverage(dir: string): Map<string, number> | null {
  const reportPath = join(dir, 'coverage', 'coverage-summary.json');
  if (!existsSync(reportPath)) return null;

  try {
    const report = JSON.parse(readFileSync(reportPath, 'utf-8')) as Record<
      string,
      { statements?: { pct?: number } }
    >;

    const result = new Map<string, number>();
    for (const [key, value] of Object.entries(report)) {
      if (key === 'total') continue;
      result.set(key, value.statements?.pct ?? 0);
    }
    return result;
  } catch {
    return null;
  }
}

function readPythonPerFileCoverage(dir: string): Map<string, number> | null {
  const reportPath = join(dir, 'coverage.json');
  if (!existsSync(reportPath)) return null;

  try {
    const report = JSON.parse(readFileSync(reportPath, 'utf-8')) as {
      files?: Record<string, { summary?: { percent_covered?: number } }>;
    };

    if (!report.files) return null;

    const result = new Map<string, number>();
    for (const [key, value] of Object.entries(report.files)) {
      result.set(key, value.summary?.percent_covered ?? 0);
    }
    return result;
  } catch {
    return null;
  }
}

// ─── Documentation Audit (Task 3) ───────────────────────────────────────────

const AUDIT_DOCUMENTS = ['README.md', 'AGENTS.md', 'ARCHITECTURE.md'];

/**
 * Audits project documentation for presence and staleness.
 * Checks README.md, AGENTS.md, ARCHITECTURE.md, docs/ directory.
 */
export function auditDocumentation(dir?: string): DocAuditResult {
  const root = dir ?? process.cwd();
  const documents: DocAuditEntry[] = [];

  // Check standard documentation files
  for (const docName of AUDIT_DOCUMENTS) {
    const docPath = join(root, docName);

    if (!existsSync(docPath)) {
      documents.push({ name: docName, grade: 'missing', path: null });
      continue;
    }

    // Check staleness — compare against src/ or project source
    const srcDir = join(root, 'src');
    const codeDir = existsSync(srcDir) ? srcDir : root;
    const stale = isDocStale(docPath, codeDir);

    documents.push({
      name: docName,
      grade: stale ? 'stale' : 'present',
      path: docName,
    });
  }

  // Check docs/ directory
  const docsDir = join(root, 'docs');
  if (existsSync(docsDir)) {
    try {
      const stat = statSync(docsDir);
      if (stat.isDirectory()) {
        documents.push({ name: 'docs/', grade: 'present', path: 'docs/' });
      }
    } catch {
      documents.push({ name: 'docs/', grade: 'missing', path: null });
    }
  } else {
    documents.push({ name: 'docs/', grade: 'missing', path: null });
  }

  // Check docs/index.md
  const indexPath = join(root, 'docs', 'index.md');
  if (existsSync(indexPath)) {
    // Check staleness against source code
    const srcDir = join(root, 'src');
    const indexCodeDir = existsSync(srcDir) ? srcDir : root;
    const indexStale = isDocStale(indexPath, indexCodeDir);
    documents.push({
      name: 'docs/index.md',
      grade: indexStale ? 'stale' : 'present',
      path: 'docs/index.md',
    });
  } else {
    documents.push({ name: 'docs/index.md', grade: 'missing', path: null });
  }

  // Generate summary string
  const summaryParts = documents
    .filter(d => !d.name.startsWith('docs/'))
    .map(d => `${d.name}(${d.grade})`);
  const summary = summaryParts.join(' ');

  return { documents, summary };
}
