/**
 * Documentation health scanner — module detection and full scan.
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { getExtension, isTestFile, getNewestSourceMtime } from './types.js';
import {
  checkAgentsMdForModule,
  checkAgentsMdCompleteness,
  checkDoNotEditHeaders,
} from './staleness.js';
import type { DocHealthResult, DocHealthReport } from './types.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const SOURCE_EXTENSIONS = new Set(['.ts', '.js', '.py']);
const DEFAULT_MODULE_THRESHOLD = 3;

// ─── Module Detection ────────────────────────────────────────────────────────

export function findModules(dir: string, threshold?: number): string[] {
  const limit = threshold ?? DEFAULT_MODULE_THRESHOLD;
  const root = dir;
  const modules: string[] = [];

  function walk(current: string): void {
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      // IGNORE: directory may not be readable
      return;
    }

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
        // IGNORE: file stat may fail, skip entry
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

// ─── Full Scan ──────────────────────────────────────────────────────────────

export function scanDocHealth(dir?: string): DocHealthReport {
  const start = Date.now();
  const root = dir ?? process.cwd();
  const documents: DocHealthResult[] = [];

  const modules = findModules(root);

  // 1. Root AGENTS.md
  const rootAgentsPath = join(root, 'AGENTS.md');
  if (existsSync(rootAgentsPath)) {
    if (modules.length > 0) {
      const docMtime = statSync(rootAgentsPath).mtime;

      let allMissing: string[] = [];
      let staleModule = '';
      let newestCode: Date | null = null;

      for (const mod of modules) {
        const fullModPath = join(root, mod);
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

  // 5. docs/quality/ and docs/generated/
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
        // IGNORE: file stat may fail, skip entry
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
      documents.push({
        path: docPath,
        grade: 'fresh',
        lastModified: statSync(filePath).mtime,
        codeLastModified: null,
        reason: `AGENTS.md exceeds 100 lines (${lineCount} lines) — consider splitting`,
      });
    }
  } catch {
    // IGNORE: AGENTS.md file may not be readable
  }
}
