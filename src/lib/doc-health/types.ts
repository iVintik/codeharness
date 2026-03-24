import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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

// ─── Shared Utilities ────────────────────────────────────────────────────────
// These live here to avoid circular dependencies between scanner.ts and staleness.ts.

const SOURCE_EXTENSIONS = new Set(['.ts', '.js', '.py']);

export function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot) : '';
}

export function isTestFile(filename: string): boolean {
  return (
    filename.includes('.test.') ||
    filename.includes('.spec.') ||
    filename.includes('__tests__') ||
    filename.startsWith('test_')
  );
}

export function getNewestSourceMtime(dir: string): Date | null {
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
