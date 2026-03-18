import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const MODULES_DIR = join(import.meta.dirname, '..');
const COMMANDS_DIR = join(import.meta.dirname, '..', '..', 'commands');
const MODULE_NAMES = ['infra', 'sprint', 'verify', 'dev', 'review'];

/** Recursively collect all .ts files under a directory, excluding __tests__ */
function collectTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry !== '__tests__' && entry !== 'node_modules') {
        files.push(...collectTsFiles(full));
      }
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      files.push(full);
    }
  }
  return files;
}

/** Extract import paths from a TypeScript file */
function extractImports(filePath: string): string[] {
  const content = readFileSync(filePath, 'utf-8');
  const importRegex = /(?:import|export)\s+.*?from\s+['"]([^'"]+)['"]/g;
  const imports: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

describe('import boundaries', () => {
  it('no module imports from another module\'s internal files', () => {
    const violations: string[] = [];

    for (const moduleName of MODULE_NAMES) {
      const moduleDir = join(MODULES_DIR, moduleName);
      let files: string[];
      try {
        files = collectTsFiles(moduleDir);
      } catch {
        continue; // module dir may not exist yet
      }

      for (const file of files) {
        const imports = extractImports(file);
        for (const imp of imports) {
          // Check if this import reaches into another module's internals
          for (const otherModule of MODULE_NAMES) {
            if (otherModule === moduleName) continue;

            // Pattern: relative import into another module's non-index file
            // e.g., '../verify/parser.js' or '../../modules/verify/parser.js'
            const internalPattern = new RegExp(
              `(?:^|/)${otherModule}/(?!index\\.)[^/]+$`,
            );
            if (internalPattern.test(imp)) {
              const rel = relative(MODULES_DIR, file);
              violations.push(
                `${rel} imports internal file from ${otherModule}: ${imp}`,
              );
            }
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('no command file imports from a module\'s internal files', () => {
    const violations: string[] = [];

    let commandFiles: string[];
    try {
      commandFiles = collectTsFiles(COMMANDS_DIR);
    } catch {
      // commands dir may not exist in test context
      return;
    }

    for (const file of commandFiles) {
      const imports = extractImports(file);
      for (const imp of imports) {
        for (const moduleName of MODULE_NAMES) {
          // Pattern: import reaching into module internals (not index)
          // e.g., '../modules/verify/parser.js' or '../../modules/verify/parser.js'
          const internalPattern = new RegExp(
            `modules/${moduleName}/(?!index\\.)[^/]+$`,
          );
          if (internalPattern.test(imp)) {
            const rel = relative(join(MODULES_DIR, '..'), file);
            violations.push(
              `${rel} imports internal file from modules/${moduleName}: ${imp}`,
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
