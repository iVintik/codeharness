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
