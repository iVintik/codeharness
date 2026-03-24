/**
 * Shared utility functions for stack providers.
 * Extracted from stack-detect.ts to avoid duplication across providers.
 */

import { existsSync, readFileSync } from 'node:fs';

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
