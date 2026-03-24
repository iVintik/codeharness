import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { warn } from './output.js';

// Re-export canonical types from stacks/types.ts for backward compatibility.
// Existing consumers that `import { StackName, AppType } from './stack-detect.js'` continue to work.
export type { StackName, AppType } from './stacks/types.js';

export interface StackDetection {
  stack: StackName;
  dir: string;
}

/** Directories to skip during subdirectory scanning. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'target',
  '__pycache__',
  'dist',
  'build',
  'coverage',
  '.venv',
  'venv',
  '.tox',
  '.mypy_cache',
  '.cache',
]);

/** Stack markers in priority order (nodejs > python > rust). */
const STACK_MARKERS: Array<{ stack: StackName; files: string[] }> = [
  { stack: 'nodejs', files: ['package.json'] },
  { stack: 'python', files: ['requirements.txt', 'pyproject.toml', 'setup.py'] },
  { stack: 'rust', files: ['Cargo.toml'] },
];

/**
 * Detect all stacks present in a directory, checking root and one level of subdirectories.
 * Root stacks appear first (in priority order: nodejs > python > rust),
 * then subdirectory stacks sorted alphabetically by directory name.
 */
export function detectStacks(dir: string = process.cwd()): StackDetection[] {
  const results: StackDetection[] = [];

  // Root scan — check all markers, no early return
  for (const marker of STACK_MARKERS) {
    for (const file of marker.files) {
      if (existsSync(join(dir, file))) {
        results.push({ stack: marker.stack, dir: '.' });
        break; // Only add each stack once for root
      }
    }
  }

  // Subdirectory scan — one level deep
  let entries: import('node:fs').Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    entries = [];
  }

  const subdirs = entries
    .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name))
    .map((e) => e.name)
    .sort();

  for (const subdir of subdirs) {
    const subdirPath = join(dir, subdir);
    for (const marker of STACK_MARKERS) {
      for (const file of marker.files) {
        if (existsSync(join(subdirPath, file))) {
          results.push({ stack: marker.stack, dir: subdir });
          break; // Only add each stack once per subdir
        }
      }
    }
  }

  return results;
}

/**
 * Compat wrapper: returns the first detected ROOT stack name, or null.
 * Preserves the original single-stack, root-only API for existing callers.
 * Only considers root-level markers (dir === '.'), never subdirectory detections,
 * so callers like init-project and state that operate on the root directory
 * are not surprised by a stack detected in a subdirectory.
 */
export function detectStack(dir: string = process.cwd()): string | null {
  const stacks = detectStacks(dir);
  const rootStack = stacks.find((s) => s.dir === '.');
  if (rootStack) return rootStack.stack;
  warn('No recognized stack detected');
  return null;
}

const AGENT_DEPS_NODE = ['anthropic', '@anthropic-ai/sdk', 'openai', 'langchain', '@langchain/core', 'llamaindex'];
const AGENT_DEPS_PYTHON = ['anthropic', 'openai', 'langchain', 'llama-index', 'traceloop-sdk'];
const WEB_FRAMEWORK_DEPS = ['react', 'vue', 'svelte', 'angular', '@angular/core', 'next', 'nuxt', 'vite', 'webpack'];
const PYTHON_WEB_FRAMEWORKS = ['flask', 'django', 'fastapi', 'streamlit'];
const RUST_WEB_FRAMEWORKS = ['actix-web', 'axum', 'rocket', 'tide', 'warp'];
const RUST_AGENT_DEPS = ['async-openai', 'anthropic', 'llm-chain'];

function readJsonSafe(path: string): Record<string, unknown> | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readTextSafe(path: string): string | null {
  try {
    if (!existsSync(path)) return null;
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

function getNodeDeps(pkg: Record<string, unknown>): Set<string> {
  const deps = new Set<string>();
  for (const field of ['dependencies', 'devDependencies']) {
    const section = pkg[field] as Record<string, string> | undefined;
    if (section && typeof section === 'object') {
      for (const key of Object.keys(section)) {
        deps.add(key);
      }
    }
  }
  return deps;
}

function hasPythonDep(content: string, dep: string): boolean {
  // Match dep name as a standalone package, not as a substring of another package.
  // Handles requirements.txt lines like "openai>=1.0", pyproject.toml entries like '"openai"',
  // and extras like "openai[all]". Uses word boundary or common delimiters to avoid
  // matching "not-openai" or "myopenai".
  const escaped = dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?:^|[\\s"',])${escaped}(?:[\\[>=<~!;\\s"',]|$)`, 'm');
  return pattern.test(content);
}

/**
 * Extract the [dependencies] section from Cargo.toml content.
 * Stops at the next section header (e.g., [dev-dependencies], [build-dependencies]).
 * Returns empty string if no [dependencies] section found.
 */
function getCargoDepsSection(content: string): string {
  const match = content.match(/^\[dependencies\]\s*$/m);
  if (!match || match.index === undefined) return '';
  const start = match.index + match[0].length;
  // Find next section header
  const nextSection = content.slice(start).search(/^\[/m);
  return nextSection === -1 ? content.slice(start) : content.slice(start, start + nextSection);
}

/**
 * Check if a Cargo.toml [dependencies] section contains a specific crate.
 * Uses word-boundary matching to avoid substring false positives
 * (e.g., "anthropic-sdk" should not match "anthropic").
 */
function hasCargoDep(depsSection: string, dep: string): boolean {
  const escaped = dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?:^|\\s)${escaped}(?:\\s*=|\\s*\\{)`, 'm');
  return pattern.test(depsSection);
}

function getPythonDepsContent(dir: string): string {
  const files = ['requirements.txt', 'pyproject.toml', 'setup.py'];
  const parts: string[] = [];
  for (const file of files) {
    const content = readTextSafe(join(dir, file));
    if (content) parts.push(content);
  }
  return parts.join('\n');
}

export function detectAppType(dir: string, stack: string | null): AppType {
  if (stack === 'nodejs') {
    const pkg = readJsonSafe(join(dir, 'package.json'));
    if (!pkg) return 'generic';

    const deps = getNodeDeps(pkg);

    // Priority 1: Agent detection
    if (AGENT_DEPS_NODE.some(d => deps.has(d))) {
      return 'agent';
    }

    // Priority 2: Web detection
    if (WEB_FRAMEWORK_DEPS.some(d => deps.has(d))) {
      return 'web';
    }
    if (
      existsSync(join(dir, 'index.html')) ||
      existsSync(join(dir, 'public', 'index.html')) ||
      existsSync(join(dir, 'src', 'index.html'))
    ) {
      return 'web';
    }

    // Priority 3: CLI detection
    const bin = pkg['bin'];
    const scripts = pkg['scripts'] as Record<string, string> | undefined;
    const hasStart = scripts?.['start'] !== undefined;
    if (bin && !hasStart) {
      return 'cli';
    }

    // Priority 4: Server detection
    if (hasStart) {
      return 'server';
    }

    return 'generic';
  }

  if (stack === 'python') {
    const content = getPythonDepsContent(dir);

    // Priority 1: Agent detection
    if (AGENT_DEPS_PYTHON.some(d => hasPythonDep(content, d))) {
      return 'agent';
    }

    // Priority 2: Web detection (framework + templates/static dirs)
    const hasWebFramework = PYTHON_WEB_FRAMEWORKS.some(d => hasPythonDep(content, d));
    if (hasWebFramework) {
      const hasTemplates = existsSync(join(dir, 'templates'));
      const hasStatic = existsSync(join(dir, 'static'));
      if (hasTemplates || hasStatic) {
        return 'web';
      }
      // Bare Flask/Django/FastAPI without templates => server
      return 'server';
    }

    // Priority 4: Server detection (has main entry point)
    if (
      existsSync(join(dir, 'app.py')) ||
      existsSync(join(dir, 'main.py')) ||
      existsSync(join(dir, 'manage.py'))
    ) {
      return 'server';
    }

    return 'generic';
  }

  if (stack === 'rust') {
    const cargoContent = readTextSafe(join(dir, 'Cargo.toml'));
    if (!cargoContent) return 'generic';

    const depsSection = getCargoDepsSection(cargoContent);

    // Priority 1: Agent detection (only in [dependencies], not [dev-dependencies])
    if (RUST_AGENT_DEPS.some(d => hasCargoDep(depsSection, d))) {
      return 'agent';
    }

    // Priority 2: Server detection (web framework in [dependencies])
    if (RUST_WEB_FRAMEWORKS.some(d => hasCargoDep(depsSection, d))) {
      return 'server';
    }

    // Priority 3: CLI detection ([[bin]] section present)
    if (/^\[\[bin\]\]\s*$/m.test(cargoContent)) {
      return 'cli';
    }

    // Priority 4: Library detection ([lib] section present, no [[bin]])
    if (/^\[lib\]\s*$/m.test(cargoContent)) {
      return 'generic';
    }

    return 'generic';
  }

  return 'generic';
}
