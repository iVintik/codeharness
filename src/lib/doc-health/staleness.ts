/**
 * Documentation staleness and completeness checks.
 */

import { execSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { getExtension, isTestFile, getNewestSourceMtime } from './types.js';
import type { DocHealthResult, DocHealthReport } from './types.js';
import { findModules } from './scanner.js';

const SOURCE_EXTENSIONS = new Set(['.ts', '.js', '.py']);
const DO_NOT_EDIT_HEADER = '<!-- DO NOT EDIT MANUALLY';

// ─── Freshness Checking ─────────────────────────────────────────────────────

export function isDocStale(docPath: string, codeDir: string): boolean {
  if (!existsSync(docPath)) return true;
  if (!existsSync(codeDir)) return false;

  const docMtime = statSync(docPath).mtime;
  const newestCode = getNewestSourceMtime(codeDir);

  if (newestCode === null) return false;
  return newestCode.getTime() > docMtime.getTime();
}

// ─── AGENTS.md Content Completeness ──────────────────────────────────────────

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

export function getMentionedFilesInAgentsMd(agentsPath: string): string[] {
  if (!existsSync(agentsPath)) return [];

  const content = readFileSync(agentsPath, 'utf-8');
  const mentioned = new Set<string>();

  const filenamePattern = /[\w./-]*[\w-]+\.(?:ts|js|py)\b/g;
  let match;
  while ((match = filenamePattern.exec(content)) !== null) {
    const fullMatch = match[0];
    const basename = fullMatch.split('/').pop()!;
    if (!isTestFile(basename)) {
      mentioned.add(basename);
    }
  }

  return Array.from(mentioned);
}

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

// ─── AGENTS.md Checking ─────────────────────────────────────────────────────

export function checkAgentsMdForModule(
  modulePath: string,
  dir?: string,
): DocHealthResult {
  const root = dir ?? process.cwd();
  const fullModulePath = join(root, modulePath);

  let agentsPath = join(fullModulePath, 'AGENTS.md');
  if (!existsSync(agentsPath)) {
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

// ─── DO NOT EDIT Header Check ────────────────────────────────────────────────

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

// ─── Story-Specific Freshness ────────────────────────────────────────────────

export function checkStoryDocFreshness(
  storyId: string,
  dir?: string,
): DocHealthReport {
  const start = Date.now();
  const root = dir ?? process.cwd();
  const documents: DocHealthResult[] = [];

  const changedFiles = getRecentlyChangedFiles(root);
  const allModules = findModules(root);

  let modulesToCheck: string[];

  if (changedFiles.length > 0) {
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
    modulesToCheck = allModules;
  }

  for (const mod of modulesToCheck) {
    const result = checkAgentsMdForModule(mod, root);
    documents.push(result);

    const moduleAgentsPath = join(root, mod, 'AGENTS.md');
    const actualAgentsPath = existsSync(moduleAgentsPath)
      ? moduleAgentsPath
      : join(root, 'AGENTS.md');
    if (existsSync(actualAgentsPath)) {
      checkAgentsMdLineCountInternal(actualAgentsPath, result.path, documents);
    }
  }

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

function checkAgentsMdLineCountInternal(
  filePath: string,
  docPath: string,
  documents: DocHealthResult[],
): void {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lineCount = content.split('\n').length;
    if (lineCount > 100) {
      documents.push({
        path: docPath,
        grade: 'fresh',
        lastModified: statSync(filePath).mtime,
        codeLastModified: null,
        reason: `AGENTS.md exceeds 100 lines (${lineCount} lines) — consider splitting`,
      });
    }
  } catch {
    // Ignore read errors
  }
}
