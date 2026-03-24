/**
 * Stale container cleanup for infra containers.
 *
 * Removes exited/dead containers matching codeharness-shared-* and
 * codeharness-collector-* patterns. Complements verify/env.ts which
 * handles codeharness-verify-* containers.
 *
 * Public functions return Result<T> and never throw.
 */

import { execFileSync } from 'node:child_process';
import { isDockerAvailable } from '../../lib/docker/index.js';
import { ok, fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type { CleanupResult } from './types.js';

/** Container name patterns to match for cleanup */
const STALE_PATTERNS = ['codeharness-shared-', 'codeharness-collector-'];

/**
 * Remove stale codeharness infra containers (exited or dead).
 *
 * If Docker is not available, returns ok with 0 removed (AC#7).
 */
export function cleanupContainers(): Result<CleanupResult> {
  try {
    if (!isDockerAvailable()) {
      return ok({ containersRemoved: 0, names: [] });
    }

    // List all containers (including stopped) matching our patterns
    const staleNames: string[] = [];

    for (const pattern of STALE_PATTERNS) {
      try {
        const output = execFileSync(
          'docker',
          [
            'ps',
            '-a',
            '--filter', `name=${pattern}`,
            '--filter', 'status=exited',
            '--filter', 'status=dead',
            '--format', '{{.Names}}',
          ],
          { stdio: 'pipe', timeout: 10_000 },
        );
        const names = output
          .toString()
          .trim()
          .split('\n')
          .filter(n => n.trim());
        staleNames.push(...names);
      } catch {
        // docker ps failed for this pattern — skip
      }
    }

    if (staleNames.length === 0) {
      return ok({ containersRemoved: 0, names: [] });
    }

    // Remove all stale containers
    const removed: string[] = [];
    for (const name of staleNames) {
      try {
        execFileSync('docker', ['rm', '-f', name], {
          stdio: 'pipe',
          timeout: 10_000,
        });
        removed.push(name);
      } catch {
        // Individual removal failed — continue with others
      }
    }

    return ok({ containersRemoved: removed.length, names: removed });
    /* c8 ignore start -- defensive: inner catches handle all known paths */
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(`Container cleanup failed: ${message}`);
  }
  /* c8 ignore stop */
}
