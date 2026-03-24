/**
 * Stack provider registry — stores registered providers and provides
 * marker-based stack detection (replacing hardcoded checks).
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { StackName, StackProvider } from './types.js';

/** Internal registry map. */
const providers = new Map<StackName, StackProvider>();

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

/**
 * Priority order for stack detection.
 * When multiple stacks match at the same directory level, they appear in this order.
 */
const STACK_PRIORITY: StackName[] = ['nodejs', 'python', 'rust'];

/** Register a StackProvider. Overwrites any existing provider for the same name. */
export function registerProvider(provider: StackProvider): void {
  providers.set(provider.name, provider);
}

/** Retrieve a registered provider by name, or undefined if not registered. */
export function getStackProvider(name: StackName): StackProvider | undefined {
  return providers.get(name);
}

/** Detection result: stack name + directory where it was found. */
export interface StackDetection {
  stack: StackName;
  dir: string;
}

/**
 * Detect all stacks present in a directory using registered provider markers.
 * Checks root and one level of subdirectories.
 * Root stacks appear first (in priority order), then subdirectory stacks sorted alphabetically.
 */
export function detectStacks(dir: string = process.cwd()): StackDetection[] {
  const results: StackDetection[] = [];

  // Build ordered list of providers by priority
  const ordered = getOrderedProviders();

  // Root scan
  for (const provider of ordered) {
    if (hasMarker(dir, provider.markers)) {
      results.push({ stack: provider.name, dir: '.' });
    }
  }

  // Subdirectory scan — one level deep
  let entries: import('node:fs').Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (_err: unknown) {
    // Non-existent or unreadable directory — treat as empty (no subdirectories to scan)
    entries = [];
  }

  const subdirs = entries
    .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name))
    .map((e) => e.name)
    .sort();

  for (const subdir of subdirs) {
    const subdirPath = join(dir, subdir);
    for (const provider of ordered) {
      if (hasMarker(subdirPath, provider.markers)) {
        results.push({ stack: provider.name, dir: subdir });
      }
    }
  }

  return results;
}

/**
 * Compat wrapper: returns the first detected ROOT stack name, or null.
 * Only considers root-level markers (dir === '.'), never subdirectory detections.
 */
export function detectStack(dir: string = process.cwd()): StackName | null {
  const stacks = detectStacks(dir);
  const rootStack = stacks.find((s) => s.dir === '.');
  return rootStack ? rootStack.stack : null;
}

/** Check if any of the marker files exist in the given directory. */
function hasMarker(dir: string, markers: string[]): boolean {
  return markers.some((marker) => existsSync(join(dir, marker)));
}

/** Return providers ordered by STACK_PRIORITY, then any extras at the end. */
function getOrderedProviders(): StackProvider[] {
  const ordered: StackProvider[] = [];
  for (const name of STACK_PRIORITY) {
    const p = providers.get(name);
    if (p) ordered.push(p);
  }
  // Add any providers not in the priority list
  for (const [name, provider] of providers) {
    if (!STACK_PRIORITY.includes(name)) {
      ordered.push(provider);
    }
  }
  return ordered;
}

/**
 * Reset the registry (for testing only).
 * @internal
 */
export function _resetRegistry(): void {
  providers.clear();
}
