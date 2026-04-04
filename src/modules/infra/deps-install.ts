/**
 * Dependency installation and verification for project initialization.
 */

import { installAllDependencies, CriticalDependencyError, checkInstalled, filterDepsForStacks, DEPENDENCY_REGISTRY } from '../../lib/deps.js';
import { ok as okOutput, fail as failOutput } from '../../lib/output.js';
import type { DependencyResult } from '../../lib/deps.js';
import type { Result } from '../../types/result.js';
import { ok, fail } from '../../types/result.js';

interface InstallDepsOptions {
  readonly isJson: boolean;
  readonly stacks?: string[];
}

/**
 * Install all registered dependencies (filtered by detected stacks).
 * Returns fail() only for critical dependency failures.
 */
export function installDeps(opts: InstallDepsOptions): Result<DependencyResult[]> {
  try {
    const depResults = installAllDependencies({ json: opts.isJson, stacks: opts.stacks });
    return ok(depResults);
  } catch (err) {
    if (err instanceof CriticalDependencyError) {
      return fail(err.message);
    }
    const message = err instanceof Error ? err.message : String(err);
    return fail(`Dependency install error: ${message}`);
  }
}

/**
 * Verify already-installed dependencies (used during re-run path).
 * Returns status for each dependency in the registry.
 */
export function verifyDeps(isJson: boolean, stacks?: string[]): DependencyResult[] {
  const specs = stacks ? filterDepsForStacks(stacks) : [...DEPENDENCY_REGISTRY];
  const depResults: DependencyResult[] = [];
  for (const spec of specs) {
    const check = checkInstalled(spec);
    const depResult: DependencyResult = {
      name: spec.name,
      displayName: spec.displayName,
      status: check.installed ? 'already-installed' : 'failed',
      version: check.version,
    };
    depResults.push(depResult);
    if (!isJson) {
      if (check.installed) {
        const versionStr = check.version ? ` (v${check.version})` : '';
        okOutput(`${spec.displayName}: already installed${versionStr}`);
      } else {
        failOutput(`${spec.displayName}: not found`);
      }
    }
  }
  return depResults;
}
