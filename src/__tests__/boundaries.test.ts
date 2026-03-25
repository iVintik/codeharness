/**
 * Boundary tests — enforces NFR3 (no bare catch) and NFR6 (module imports through index.ts).
 *
 * Scans all .ts files in src/ for:
 * 1. Catch blocks without // IGNORE: comments (NFR3)
 * 2. Cross-module internal imports bypassing barrel files (NFR6)
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC_DIR = join(__dirname, '..');

// ─── Shared file walker ─────────────────────────────────────────────────────

/** Recursively collect all .ts files under a directory (excluding common skip dirs). */
function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    // IGNORE: directory may not be readable
    return results;
  }
  for (const name of entries) {
    const fullPath = join(dir, name);
    try {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        if (['node_modules', 'coverage', 'dist'].includes(name)) continue;
        results.push(...collectTsFiles(fullPath));
      } else if (stat.isFile() && name.endsWith('.ts')) {
        results.push(fullPath);
      }
    } catch {
      // IGNORE: stat may fail, skip entry
      continue;
    }
  }
  return results;
}

// ─── NFR3: No bare catch {} without // IGNORE: comment ──────────────────────

describe('catch block enforcement (NFR3)', () => {
  const allFiles = collectTsFiles(SRC_DIR);
  // Exclude test files — they are covered separately
  const sourceFiles = allFiles.filter(
    (f) => !f.includes('__tests__') && !f.endsWith('.test.ts'),
  );

  it('all catch blocks have // IGNORE: comment, rethrow, or Result.fail()', () => {
    const violations: Array<{ file: string; line: number; content: string }> = [];

    for (const filePath of sourceFiles) {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Match lines that contain `catch {` or `catch{`
        if (!/catch\s*\{/.test(line)) continue;

        // Check if the catch block itself has an inline comment with IGNORE:
        if (/IGNORE:/.test(line)) continue;

        // Check the next few lines (up to 3) for an IGNORE: comment
        let hasIgnore = false;
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          const nextLine = lines[j].trim();
          if (/\/\/\s*IGNORE:/.test(nextLine)) {
            hasIgnore = true;
            break;
          }
          // If we hit a non-comment, non-empty line that isn't the closing brace, stop looking
          if (nextLine && !nextLine.startsWith('//') && !nextLine.startsWith('/*') && !nextLine.startsWith('*') && nextLine !== '}') {
            break;
          }
        }

        if (!hasIgnore) {
          violations.push({
            file: relative(SRC_DIR, filePath),
            line: i + 1,
            content: line.trim(),
          });
        }
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line} — ${v.content}`)
        .join('\n');
      expect.fail(
        `Found ${violations.length} catch block(s) without // IGNORE: comment:\n${report}`,
      );
    }

    expect(violations).toHaveLength(0);
  });
});

// ─── NFR6: Module imports only through index.ts ─────────────────────────────

describe('module import boundary (NFR6)', () => {
  const allFiles = collectTsFiles(SRC_DIR);

  /**
   * Modules under src/modules/ and domain directories under src/lib/
   * that enforce barrel-only imports from external consumers.
   */
  const PROTECTED_DIRS = [
    'modules/infra',
    'modules/verify',
    'modules/observability',
    'modules/audit',
    'modules/review',
    'modules/dev',
    'modules/status',
    'modules/sprint',
    'lib/coverage',
    'lib/docker',
    'lib/stacks',
    'lib/sync',
    'lib/observability',
  ];

  /**
   * Pattern: import from '.../<protected-dir>/<internal-file>'
   * where <internal-file> is NOT index, index.js, or index.ts.
   *
   * This catches direct imports into module internals like:
   *   import { foo } from '../../modules/infra/container-cleanup.js'
   * but allows:
   *   import { foo } from '../../modules/infra/index.js'
   */
  function isInternalImport(importPath: string): { protected: boolean; dir: string } {
    for (const dir of PROTECTED_DIRS) {
      // Match import paths that reference a protected directory with a file after it
      // Allow: .../modules/infra/index.js, .../modules/infra/index
      // Reject: .../modules/infra/container-cleanup.js, .../modules/infra/types.js
      const regex = new RegExp(`/${dir}/([^'"]+)$`);
      const match = regex.exec(importPath);
      if (match) {
        const fileName = match[1];
        // Allow index imports (index, index.js, index.ts)
        if (/^index(\.(js|ts))?$/.test(fileName)) continue;
        return { protected: true, dir };
      }
    }
    return { protected: false, dir: '' };
  }

  it('no cross-module imports bypass barrel files (index.ts)', () => {
    const violations: Array<{ file: string; line: number; content: string; dir: string }> = [];

    for (const filePath of allFiles) {
      const relPath = relative(SRC_DIR, filePath);

      // Files INSIDE a protected directory can import their own siblings
      const isInsideProtected = PROTECTED_DIRS.some(
        (dir) => relPath.startsWith(dir + '/') || relPath.startsWith(dir + '\\'),
      );
      if (isInsideProtected) continue;

      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comments
        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;

        // Match import/export from statements
        const importMatch = /(?:import|export)\s+.*from\s+['"]([^'"]+)['"]/g;
        let match;
        while ((match = importMatch.exec(line)) !== null) {
          const importPath = match[1];
          const result = isInternalImport(importPath);
          if (result.protected) {
            violations.push({
              file: relPath,
              line: i + 1,
              content: line.trim(),
              dir: result.dir,
            });
          }
        }
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line} [${v.dir}] — ${v.content}`)
        .join('\n');
      expect.fail(
        `Found ${violations.length} cross-module internal import(s) bypassing barrel files:\n${report}`,
      );
    }

    expect(violations).toHaveLength(0);
  });
});
