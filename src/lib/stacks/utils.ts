/**
 * Shared utility functions for stack providers.
 * Extracted from stack-detect.ts to avoid duplication across providers.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Safely read and parse a JSON file. Returns null on any error. */
export function readJsonSafe(path: string): Record<string, unknown> | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Safely read a text file. Returns null on any error. */
export function readTextSafe(path: string): string | null {
  try {
    if (!existsSync(path)) return null;
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

/** Collect all dependency names from a package.json object (dependencies + devDependencies). */
export function getNodeDeps(pkg: Record<string, unknown>): Set<string> {
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

/**
 * Read and concatenate content from Python dependency files
 * (requirements.txt, pyproject.toml, setup.py) in a directory.
 */
export function getPythonDepsContent(dir: string): string {
  const files = ['requirements.txt', 'pyproject.toml', 'setup.py'];
  const parts: string[] = [];
  for (const file of files) {
    const content = readTextSafe(join(dir, file));
    if (content) parts.push(content);
  }
  return parts.join('\n');
}

/**
 * Check if a Python dependency is present in combined deps content.
 * Uses word-boundary-aware matching to avoid substring false positives
 * (e.g., "openai" should not match "not-openai" or "myopenai").
 */
export function hasPythonDep(content: string, dep: string): boolean {
  const escaped = dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?:^|[\\s"',])${escaped}(?:[\\[>=<~!;\\s"',]|$)`, 'm');
  return pattern.test(content);
}

/**
 * Extract the [dependencies] section from Cargo.toml content.
 * Stops at the next section header (e.g., [dev-dependencies], [build-dependencies]).
 * Returns empty string if no [dependencies] section found.
 */
export function getCargoDepsSection(content: string): string {
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
 * (e.g., searching for "anthropic" should not match "anthropic-sdk").
 */
export function hasCargoDep(depsSection: string, dep: string): boolean {
  const escaped = dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?:^|\\s)${escaped}(?:\\s*=|\\s*\\{)`, 'm');
  return pattern.test(depsSection);
}
