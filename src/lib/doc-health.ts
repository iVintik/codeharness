/**
 * Documentation health scanner.
 * Checks freshness of AGENTS.md, exec-plans, generated docs.
 * Manages exec-plan lifecycle (create / complete).
 *
 * FR58 (stale doc scanning), FR59 (exec-plan management),
 * FR60 (doc freshness enforcement).
 */

import { execSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { ok, fail as failFmt, info as infoFmt } from './output.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DocHealthResult {
  path: string;
  grade: 'fresh' | 'stale' | 'missing';
  lastModified: Date | null;
  codeLastModified: Date | null;
  reason: string;
}

export interface DocHealthReport {
  documents: DocHealthResult[];
  summary: { fresh: number; stale: number; missing: number; total: number };
  passed: boolean;
  scanDurationMs: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DO_NOT_EDIT_HEADER = '<!-- DO NOT EDIT MANUALLY';
const SOURCE_EXTENSIONS = new Set(['.ts', '.js', '.py']);
const DEFAULT_MODULE_THRESHOLD = 3;

// ─── Module Detection (Task 1.5) ────────────────────────────────────────────

/**
 * Finds directories that qualify as modules.
 * A directory is a module if it contains at least `threshold` source files
 * (.ts, .js, .py — excluding test files and node_modules).
 * Returns array of relative paths from `dir`.
 */
export function findModules(dir: string, threshold?: number): string[] {
  const limit = threshold ?? DEFAULT_MODULE_THRESHOLD;
  const root = dir;
  const modules: string[] = [];

  function walk(current: string): void {
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }

    // Skip node_modules, .git, hidden directories, and build output directories
    const dirName = current.split('/').pop() ?? '';
    if (
      dirName === 'node_modules' ||
      dirName === '.git' ||
      dirName === 'dist' ||
      dirName === 'coverage' ||
      (dirName.startsWith('.') && current !== root)
    ) {
      return;
    }

    let sourceCount = 0;
    const subdirs: string[] = [];

    for (const entry of entries) {
      const fullPath = join(current, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        subdirs.push(fullPath);
      } else if (stat.isFile()) {
        const ext = getExtension(entry);
        if (SOURCE_EXTENSIONS.has(ext) && !isTestFile(entry)) {
          sourceCount++;
        }
      }
    }

    if (sourceCount >= limit) {
      const rel = relative(root, current);
      // Skip root directory (empty string) — it's not a meaningful module path
      if (rel !== '') {
        modules.push(rel);
      }
    }

    for (const subdir of subdirs) {
      walk(subdir);
    }
  }

  walk(root);
  return modules;
}

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

// ─── Freshness Checking (Task 1.4) ─────────────────────────────────────────

/**
 * Compares the last modification time of `docPath` against the newest file
 * modification time in `codeDir`. If any source file in codeDir is newer
 * than the document, the document is stale.
 */
export function isDocStale(docPath: string, codeDir: string): boolean {
  if (!existsSync(docPath)) return true;
  if (!existsSync(codeDir)) return false;

  const docMtime = statSync(docPath).mtime;
  const newestCode = getNewestSourceMtime(codeDir);

  if (newestCode === null) return false;
  return newestCode.getTime() > docMtime.getTime();
}

function getNewestSourceMtime(dir: string): Date | null {
  let newest: Date | null = null;

  function walk(current: string): void {
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }

    const dirName = current.split('/').pop() ?? '';
    if (dirName === 'node_modules' || dirName === '.git') return;

    for (const entry of entries) {
      const fullPath = join(current, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        // Skip __tests__ directories
        if (entry !== '__tests__') {
          walk(fullPath);
        }
      } else if (stat.isFile()) {
        const ext = getExtension(entry);
        if (SOURCE_EXTENSIONS.has(ext) && !isTestFile(entry)) {
          if (newest === null || stat.mtime.getTime() > newest.getTime()) {
            newest = stat.mtime;
          }
        }
      }
    }
  }

  walk(dir);
  return newest;
}

// ─── AGENTS.md Content Completeness (Story 12.2) ────────────────────────────

/**
 * Lists all source files (.ts, .js, .py — excluding tests) in a module directory.
 * Returns filenames only (not full paths).
 */
export function getSourceFilesInModule(modulePath: string): string[] {
  const files: string[] = [];

  function walk(current: string): void {
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }

    const dirName = current.split('/').pop() ?? '';
    if (
      dirName === 'node_modules' ||
      dirName === '.git' ||
      dirName === '__tests__' ||
      dirName === 'dist' ||
      dirName === 'coverage' ||
      (dirName.startsWith('.') && current !== modulePath)
    ) return;

    for (const entry of entries) {
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
        if (SOURCE_EXTENSIONS.has(ext) && !isTestFile(entry)) {
          files.push(entry);
        }
      }
    }
  }

  walk(modulePath);
  return files;
}

/**
 * Parses AGENTS.md and extracts all filenames mentioned in the document.
 * Looks for filenames in code blocks, inline code, bullet lists, and tables.
 */
export function getMentionedFilesInAgentsMd(agentsPath: string): string[] {
  if (!existsSync(agentsPath)) return [];

  const content = readFileSync(agentsPath, 'utf-8');
  const mentioned = new Set<string>();

  // Match filenames with source extensions in various contexts:
  // - inline code: `filename.ts`
  // - code blocks, bullet items, table cells, plain text
  // Pattern: word characters, hyphens, dots forming a filename with a known extension
  const filenamePattern = /[\w./-]*[\w-]+\.(?:ts|js|py)\b/g;
  let match;
  while ((match = filenamePattern.exec(content)) !== null) {
    // Extract just the filename (last segment of any path)
    const fullMatch = match[0];
    const basename = fullMatch.split('/').pop()!;
    // Skip test files
    if (!isTestFile(basename)) {
      mentioned.add(basename);
    }
  }

  return Array.from(mentioned);
}

/**
 * Compares source files in a module against files mentioned in AGENTS.md.
 * Returns completeness status and list of missing files.
 */
export function checkAgentsMdCompleteness(
  agentsPath: string,
  modulePath: string,
): { complete: boolean; missing: string[] } {
  const sourceFiles = getSourceFilesInModule(modulePath);
  const mentionedFiles = new Set(getMentionedFilesInAgentsMd(agentsPath));

  const missing = sourceFiles.filter(f => !mentionedFiles.has(f));

  return {
    complete: missing.length === 0,
    missing,
  };
}

// ─── AGENTS.md Checking (Task 1.6) ─────────────────────────────────────────

/**
 * Checks if a module has a corresponding AGENTS.md and whether it's fresh.
 * Uses content completeness (are all source files mentioned?) instead of mtime.
 */
export function checkAgentsMdForModule(
  modulePath: string,
  dir?: string,
): DocHealthResult {
  const root = dir ?? process.cwd();
  const fullModulePath = join(root, modulePath);

  // Check for module-level AGENTS.md first, then root AGENTS.md
  let agentsPath = join(fullModulePath, 'AGENTS.md');
  if (!existsSync(agentsPath)) {
    // Fall back to root AGENTS.md if the module is top-level source
    agentsPath = join(root, 'AGENTS.md');
  }

  if (!existsSync(agentsPath)) {
    return {
      path: relative(root, agentsPath),
      grade: 'missing',
      lastModified: null,
      codeLastModified: getNewestSourceMtime(fullModulePath),
      reason: `No AGENTS.md found for module: ${modulePath}`,
    };
  }

  const docMtime = statSync(agentsPath).mtime;
  const codeMtime = getNewestSourceMtime(fullModulePath);

  // Use content completeness check instead of mtime comparison
  const { complete, missing } = checkAgentsMdCompleteness(agentsPath, fullModulePath);

  if (!complete) {
    const missingList = missing.join(', ');
    return {
      path: relative(root, agentsPath),
      grade: 'stale',
      lastModified: docMtime,
      codeLastModified: codeMtime,
      reason: `AGENTS.md stale for module: ${modulePath} — missing: ${missingList}`,
    };
  }

  return {
    path: relative(root, agentsPath),
    grade: 'fresh',
    lastModified: docMtime,
    codeLastModified: codeMtime,
    reason: 'Up to date',
  };
}

// ─── DO NOT EDIT Header Check (Task 1.7) ────────────────────────────────────

/**
 * Reads the file and checks if it starts with a `DO NOT EDIT MANUALLY` header.
 */
export function checkDoNotEditHeaders(docPath: string): boolean {
  if (!existsSync(docPath)) return false;

  try {
    const content = readFileSync(docPath, 'utf-8');
    if (content.length === 0) return false;
    return content.trimStart().startsWith(DO_NOT_EDIT_HEADER);
  } catch {
    return false;
  }
}

// ─── Full Scan (Task 1.3) ───────────────────────────────────────────────────

/**
 * Main scan function. Scans AGENTS.md files, docs/index.md,
 * active exec-plans, and generated docs for DO NOT EDIT headers.
 */
export function scanDocHealth(dir?: string): DocHealthReport {
  const start = Date.now();
  const root = dir ?? process.cwd();
  const documents: DocHealthResult[] = [];

  // Compute modules once for reuse
  const modules = findModules(root);

  // 1. Root AGENTS.md — use content completeness check
  const rootAgentsPath = join(root, 'AGENTS.md');
  if (existsSync(rootAgentsPath)) {
    if (modules.length > 0) {
      const docMtime = statSync(rootAgentsPath).mtime;

      // Collect all source files across all modules and check completeness
      let allMissing: string[] = [];
      let staleModule = '';
      let newestCode: Date | null = null;

      for (const mod of modules) {
        const fullModPath = join(root, mod);
        // Only check root AGENTS.md for modules that don't have their own AGENTS.md
        const modAgentsPath = join(fullModPath, 'AGENTS.md');
        if (existsSync(modAgentsPath)) continue;

        const { missing } = checkAgentsMdCompleteness(rootAgentsPath, fullModPath);
        if (missing.length > 0 && staleModule === '') {
          staleModule = mod;
          allMissing = missing;
        }

        const modMtime = getNewestSourceMtime(fullModPath);
        if (modMtime !== null && (newestCode === null || modMtime.getTime() > newestCode.getTime())) {
          newestCode = modMtime;
        }
      }

      if (allMissing.length > 0) {
        documents.push({
          path: 'AGENTS.md',
          grade: 'stale',
          lastModified: docMtime,
          codeLastModified: newestCode,
          reason: `AGENTS.md stale for module: ${staleModule} — missing: ${allMissing.join(', ')}`,
        });
      } else {
        documents.push({
          path: 'AGENTS.md',
          grade: 'fresh',
          lastModified: docMtime,
          codeLastModified: newestCode,
          reason: 'Up to date',
        });
      }
    } else {
      documents.push({
        path: 'AGENTS.md',
        grade: 'fresh',
        lastModified: statSync(rootAgentsPath).mtime,
        codeLastModified: null,
        reason: 'No modules found to compare',
      });
    }

    // NFR24: AGENTS.md line count check (warning only)
    checkAgentsMdLineCount(rootAgentsPath, 'AGENTS.md', documents);
  } else {
    documents.push({
      path: 'AGENTS.md',
      grade: 'missing',
      lastModified: null,
      codeLastModified: null,
      reason: 'Root AGENTS.md not found',
    });
  }

  // 2. Per-module AGENTS.md files
  for (const mod of modules) {
    const modAgentsPath = join(root, mod, 'AGENTS.md');
    if (existsSync(modAgentsPath)) {
      const result = checkAgentsMdForModule(mod, root);
      // Avoid duplicating root AGENTS.md
      if (result.path !== 'AGENTS.md') {
        documents.push(result);
        checkAgentsMdLineCount(modAgentsPath, result.path, documents);
      }
    }
  }

  // 3. docs/index.md
  const indexPath = join(root, 'docs', 'index.md');
  if (existsSync(indexPath)) {
    const content = readFileSync(indexPath, 'utf-8');
    // NFR25: check that index only uses relative paths, not copied content
    const hasAbsolutePaths = /https?:\/\/|file:\/\//i.test(content);
    documents.push({
      path: 'docs/index.md',
      grade: 'fresh',
      lastModified: statSync(indexPath).mtime,
      codeLastModified: null,
      reason: hasAbsolutePaths
        ? 'Contains absolute URLs (may violate NFR25)'
        : 'Uses relative paths',
    });
  }

  // 4. Active exec-plans
  const activeDir = join(root, 'docs', 'exec-plans', 'active');
  if (existsSync(activeDir)) {
    const files = readdirSync(activeDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const filePath = join(activeDir, file);
      documents.push({
        path: `docs/exec-plans/active/${file}`,
        grade: 'fresh',
        lastModified: statSync(filePath).mtime,
        codeLastModified: null,
        reason: 'Active exec-plan',
      });
    }
  }

  // 5. docs/quality/ and docs/generated/ — check DO NOT EDIT headers (NFR26)
  for (const subdir of ['quality', 'generated']) {
    const dirPath = join(root, 'docs', subdir);
    if (!existsSync(dirPath)) continue;

    const files = readdirSync(dirPath).filter(f => !f.startsWith('.'));
    for (const file of files) {
      const filePath = join(dirPath, file);
      let stat;
      try {
        stat = statSync(filePath);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;

      const hasHeader = checkDoNotEditHeaders(filePath);
      documents.push({
        path: `docs/${subdir}/${file}`,
        grade: hasHeader ? 'fresh' : 'stale',
        lastModified: stat.mtime,
        codeLastModified: null,
        reason: hasHeader
          ? 'Has DO NOT EDIT MANUALLY header'
          : 'Missing DO NOT EDIT MANUALLY header (NFR26)',
      });
    }
  }

  const summary = {
    fresh: documents.filter(d => d.grade === 'fresh').length,
    stale: documents.filter(d => d.grade === 'stale').length,
    missing: documents.filter(d => d.grade === 'missing').length,
    total: documents.length,
  };

  return {
    documents,
    summary,
    passed: summary.stale === 0 && summary.missing === 0,
    scanDurationMs: Date.now() - start,
  };
}

function checkAgentsMdLineCount(
  filePath: string,
  docPath: string,
  documents: DocHealthResult[],
): void {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lineCount = content.split('\n').length;
    if (lineCount > 100) {
      // NFR24 warning — push a separate warning result
      // This is a warning, not a failure, so we don't change the grade
      documents.push({
        path: docPath,
        grade: 'fresh', // warnings don't affect pass/fail
        lastModified: statSync(filePath).mtime,
        codeLastModified: null,
        reason: `AGENTS.md exceeds 100 lines (${lineCount} lines) — consider splitting`,
      });
    }
  } catch {
    // Ignore read errors
  }
}

// ─── Story-Specific Freshness (Task 2) ──────────────────────────────────────

/**
 * Given a story ID, determines which modules were changed and checks
 * AGENTS.md freshness for those specific modules.
 */
export function checkStoryDocFreshness(
  storyId: string,
  dir?: string,
): DocHealthReport {
  const start = Date.now();
  const root = dir ?? process.cwd();
  const documents: DocHealthResult[] = [];

  // Try git-based detection first
  const changedFiles = getRecentlyChangedFiles(root);
  const allModules = findModules(root);

  let modulesToCheck: string[];

  if (changedFiles.length > 0) {
    // Map changed files to their parent module directories
    const changedModules = new Set<string>();
    for (const file of changedFiles) {
      for (const mod of allModules) {
        if (file.startsWith(mod + '/') || file.startsWith(mod + '\\')) {
          changedModules.add(mod);
        }
      }
    }
    modulesToCheck = Array.from(changedModules);
  } else {
    // Fall back to full scan
    modulesToCheck = allModules;
  }

  // Check AGENTS.md for each relevant module
  for (const mod of modulesToCheck) {
    const result = checkAgentsMdForModule(mod, root);
    documents.push(result);

    // NFR24 line count warning — check the actual AGENTS.md path used
    const moduleAgentsPath = join(root, mod, 'AGENTS.md');
    const actualAgentsPath = existsSync(moduleAgentsPath)
      ? moduleAgentsPath
      : join(root, 'AGENTS.md');
    if (existsSync(actualAgentsPath)) {
      checkAgentsMdLineCount(actualAgentsPath, result.path, documents);
    }
  }

  // If no modules to check, report root AGENTS.md
  if (modulesToCheck.length === 0) {
    const rootAgentsPath = join(root, 'AGENTS.md');
    if (existsSync(rootAgentsPath)) {
      documents.push({
        path: 'AGENTS.md',
        grade: 'fresh',
        lastModified: statSync(rootAgentsPath).mtime,
        codeLastModified: null,
        reason: 'No changed modules detected',
      });
    }
  }

  const summary = {
    fresh: documents.filter(d => d.grade === 'fresh').length,
    stale: documents.filter(d => d.grade === 'stale').length,
    missing: documents.filter(d => d.grade === 'missing').length,
    total: documents.length,
  };

  return {
    documents,
    summary,
    passed: summary.stale === 0 && summary.missing === 0,
    scanDurationMs: Date.now() - start,
  };
}

function getRecentlyChangedFiles(dir: string): string[] {
  try {
    const output = execSync('git diff --name-only HEAD~5', {
      cwd: dir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10_000,
    });
    return output
      .trim()
      .split('\n')
      .filter(line => line.length > 0);
  } catch {
    return [];
  }
}

// ─── Exec-Plan Lifecycle (Task 3) ───────────────────────────────────────────

/**
 * Generates an exec-plan from story file content.
 * Creates docs/exec-plans/active/<storyId>.md.
 */
export function createExecPlan(storyId: string, dir?: string): string {
  const root = dir ?? process.cwd();
  const activeDir = join(root, 'docs', 'exec-plans', 'active');
  mkdirSync(activeDir, { recursive: true });

  const execPlanPath = join(activeDir, `${storyId}.md`);

  // Try to extract content from story file
  const storyDir = join(root, '_bmad-output', 'implementation-artifacts');
  const storyPath = join(storyDir, `${storyId}.md`);

  let storyTitle = storyId;
  let acSection = '';
  let taskSection = '';

  if (existsSync(storyPath)) {
    const content = readFileSync(storyPath, 'utf-8');

    // Extract title
    const titleMatch = /^#\s+(.+)$/m.exec(content);
    if (titleMatch) {
      storyTitle = titleMatch[1];
    }

    // Extract acceptance criteria section
    const acMatch = /## Acceptance Criteria\n([\s\S]*?)(?=\n## |\n<!-- |$)/i.exec(content);
    if (acMatch) {
      acSection = acMatch[1].trim();
    }

    // Extract tasks section
    const taskMatch = /## Tasks \/ Subtasks\n([\s\S]*?)(?=\n## |\n<!-- |$)/i.exec(content);
    if (taskMatch) {
      taskSection = taskMatch[1].trim();
    }
  }

  const timestamp = new Date().toISOString();
  const execPlanContent = [
    '<!-- DO NOT EDIT MANUALLY — managed by codeharness -->',
    `# Exec Plan: ${storyId}`,
    '',
    'Status: active',
    `Created: ${timestamp}`,
    '',
    '## Acceptance Criteria',
    '',
    acSection || '_No acceptance criteria extracted_',
    '',
    '## Task Checklist',
    '',
    taskSection || '_No tasks extracted_',
    '',
  ].join('\n');

  writeFileSync(execPlanPath, execPlanContent, 'utf-8');
  return execPlanPath;
}

/**
 * Moves an active exec-plan to completed.
 * Updates Status header and adds completion timestamp.
 */
export function completeExecPlan(storyId: string, dir?: string): string | null {
  const root = dir ?? process.cwd();
  const activePath = join(root, 'docs', 'exec-plans', 'active', `${storyId}.md`);

  if (!existsSync(activePath)) {
    return null;
  }

  let content = readFileSync(activePath, 'utf-8');

  // Update status
  content = content.replace(/^Status:\s*active$/m, 'Status: completed');

  // Add completion timestamp after Created line
  const timestamp = new Date().toISOString();
  content = content.replace(
    /^(Created:\s*.+)$/m,
    `$1\nCompleted: ${timestamp}`,
  );

  // Create completed directory and write
  const completedDir = join(root, 'docs', 'exec-plans', 'completed');
  mkdirSync(completedDir, { recursive: true });

  const completedPath = join(completedDir, `${storyId}.md`);
  writeFileSync(completedPath, content, 'utf-8');

  // Remove from active
  try {
    unlinkSync(activePath);
  } catch {
    // Best-effort removal
  }

  return completedPath;
}

/**
 * Checks whether an exec-plan exists for the story and its current location.
 */
export function getExecPlanStatus(
  storyId: string,
  dir?: string,
): 'active' | 'completed' | 'missing' {
  const root = dir ?? process.cwd();

  if (existsSync(join(root, 'docs', 'exec-plans', 'active', `${storyId}.md`))) {
    return 'active';
  }
  if (existsSync(join(root, 'docs', 'exec-plans', 'completed', `${storyId}.md`))) {
    return 'completed';
  }
  return 'missing';
}

// ─── Output Formatting (Task 1.8) ───────────────────────────────────────────

/**
 * Returns array of output lines using ok(), fail(), info() format.
 */
export function formatDocHealthOutput(report: DocHealthReport): string[] {
  const lines: string[] = [];

  for (const doc of report.documents) {
    switch (doc.grade) {
      case 'fresh':
        lines.push(`[OK] ${doc.path}: fresh`);
        break;
      case 'stale':
        lines.push(`[FAIL] ${doc.reason}`);
        break;
      case 'missing':
        lines.push(`[FAIL] ${doc.reason}`);
        break;
    }
  }

  lines.push(
    `[INFO] Doc health: ${report.summary.fresh} fresh, ${report.summary.stale} stale, ${report.summary.missing} missing`,
  );

  return lines;
}

/**
 * Prints the doc health report using output utilities.
 */
export function printDocHealthOutput(report: DocHealthReport): void {
  for (const doc of report.documents) {
    switch (doc.grade) {
      case 'fresh':
        ok(`${doc.path}: fresh`);
        break;
      case 'stale':
        failFmt(doc.reason);
        break;
      case 'missing':
        failFmt(doc.reason);
        break;
    }
  }

  infoFmt(
    `Doc health: ${report.summary.fresh} fresh, ${report.summary.stale} stale, ${report.summary.missing} missing`,
  );
}
