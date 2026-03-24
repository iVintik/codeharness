/**
 * Boundary test — enforces NFR4: no direct stack conditionals outside src/lib/stacks/.
 *
 * Scans all .ts files in src/ (excluding src/lib/stacks/) for patterns that indicate
 * leaked stack abstraction: direct stack name comparisons and legacy imports.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC_DIR = join(__dirname, '..', '..', '..');
const STACKS_DIR = join(SRC_DIR, 'lib', 'stacks');

/**
 * Files that are intentional exceptions to the boundary check.
 * These use AppType / PromptProjectType / ProjectType comparisons,
 * NOT StackName comparisons. Documented here per AC17.
 */
const ALLOWED_EXCEPTIONS = new Set([
  // verify-prompt.ts uses PromptProjectType ('nodejs' | 'python' | 'plugin' | 'generic'),
  // not StackName. The comparisons are for display logic, not stack dispatch.
  'templates/verify-prompt.ts',
]);

/** Stack comparison patterns that should not appear outside src/lib/stacks/. */
const FORBIDDEN_PATTERNS = [
  /stack\s*===\s*'nodejs'/,
  /stack\s*===\s*'python'/,
  /stack\s*===\s*'rust'/,
  /===\s*'nodejs'/,
  /===\s*'python'/,
  /===\s*'rust'/,
];

/** Legacy import pattern that should not appear after migration. */
const LEGACY_IMPORT_PATTERN = /from\s+['"].*stack-detect/;

/** Recursively collect all .ts files under a directory. */
function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const name of entries) {
    const fullPath = join(dir, name);
    try {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        // Skip node_modules, coverage, dist
        if (['node_modules', 'coverage', 'dist'].includes(name)) continue;
        results.push(...collectTsFiles(fullPath));
      } else if (stat.isFile() && name.endsWith('.ts')) {
        results.push(fullPath);
      }
    } catch {
      continue;
    }
  }
  return results;
}

/** Check if a file path is inside the stacks directory. */
function isInsideStacksDir(filePath: string): boolean {
  return filePath.startsWith(STACKS_DIR);
}

describe('stack abstraction boundary', () => {
  const allFiles = collectTsFiles(SRC_DIR);
  const outsideFiles = allFiles.filter(f => !isInsideStacksDir(f));

  it('no stack string comparisons outside src/lib/stacks/', () => {
    const violations: Array<{ file: string; line: number; content: string; pattern: string }> = [];

    for (const filePath of outsideFiles) {
      const relPath = relative(SRC_DIR, filePath);
      if (ALLOWED_EXCEPTIONS.has(relPath)) continue;

      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comments
        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;

        for (const pattern of FORBIDDEN_PATTERNS) {
          if (pattern.test(line)) {
            violations.push({
              file: relPath,
              line: i + 1,
              content: line.trim(),
              pattern: pattern.source,
            });
          }
        }
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map(v => `  ${v.file}:${v.line} — ${v.content}`)
        .join('\n');
      expect.fail(
        `Found ${violations.length} stack string comparison(s) outside src/lib/stacks/:\n${report}`,
      );
    }

    expect(violations).toHaveLength(0);
  });

  it('no imports from stack-detect.ts outside src/lib/stacks/', () => {
    const violations: Array<{ file: string; line: number; content: string }> = [];

    for (const filePath of outsideFiles) {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comments
        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;

        if (LEGACY_IMPORT_PATTERN.test(line)) {
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
        .map(v => `  ${v.file}:${v.line} — ${v.content}`)
        .join('\n');
      expect.fail(
        `Found ${violations.length} import(s) from stack-detect.ts:\n${report}`,
      );
    }

    expect(violations).toHaveLength(0);
  });
});
