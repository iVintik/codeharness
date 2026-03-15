import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { warn } from './output.js';

export type AppType = 'server' | 'cli' | 'web' | 'agent' | 'generic';

export function detectStack(dir: string = process.cwd()): string | null {
  if (existsSync(join(dir, 'package.json'))) return 'nodejs';
  if (existsSync(join(dir, 'requirements.txt'))) return 'python';
  if (existsSync(join(dir, 'pyproject.toml'))) return 'python';
  if (existsSync(join(dir, 'setup.py'))) return 'python';
  warn('No recognized stack detected');
  return null;
}

const AGENT_DEPS_NODE = ['anthropic', '@anthropic-ai/sdk', 'openai', 'langchain', '@langchain/core', 'llamaindex'];
const AGENT_DEPS_PYTHON = ['anthropic', 'openai', 'langchain', 'llama-index', 'traceloop-sdk'];
const WEB_FRAMEWORK_DEPS = ['react', 'vue', 'svelte', 'angular', '@angular/core', 'next', 'nuxt', 'vite', 'webpack'];
const PYTHON_WEB_FRAMEWORKS = ['flask', 'django', 'fastapi', 'streamlit'];

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

  return 'generic';
}
