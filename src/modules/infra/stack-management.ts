/**
 * Shared stack management — detect, start, port-conflict check.
 *
 * Public functions return Result<T> and never throw.
 */

import { execFileSync } from 'node:child_process';
import {
  isDockerAvailable,
  isSharedStackRunning,
  startSharedStack,
  getStackHealth,
} from '../../lib/docker/index.js';
import { getComposeFilePath } from '../../lib/stack-path.js';
import { ok, fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type {
  StackStatus,
  StackDetectionResult,
  PortConflictResult,
} from './types.js';
import { ALL_STACK_PORTS } from './types.js';

const SHARED_PROJECT_NAME = 'codeharness-shared';

/**
 * Detect whether the shared observability stack is currently running.
 * Returns detailed information about running services.
 */
export function detectRunningStack(): Result<StackDetectionResult> {
  try {
    if (!isDockerAvailable()) {
      return ok({
        running: false,
        projectName: SHARED_PROJECT_NAME,
        composePath: '',
        services: [],
      });
    }

    const composePath = getComposeFilePath();
    const running = isSharedStackRunning();

    if (!running) {
      return ok({
        running: false,
        projectName: SHARED_PROJECT_NAME,
        composePath,
        services: [],
      });
    }

    const health = getStackHealth(composePath, SHARED_PROJECT_NAME);
    const services = health.services.map(s => ({
      name: s.name,
      running: s.running,
    }));

    return ok({
      running: true,
      projectName: SHARED_PROJECT_NAME,
      composePath,
      services,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(`Failed to detect running stack: ${message}`);
  }
}

/**
 * Check whether any of the given ports are already in use by non-codeharness
 * processes. Uses `lsof` on macOS/Linux.
 */
export function detectPortConflicts(
  ports: readonly number[] = ALL_STACK_PORTS,
): Result<PortConflictResult> {
  try {
    const conflicts: Array<{
      port: number;
      pid: number;
      processName: string;
    }> = [];

    for (const port of ports) {
      try {
        const output = execFileSync('lsof', ['-i', `:${port}`, '-t'], {
          stdio: 'pipe',
          timeout: 5_000,
        });
        const pids = output
          .toString()
          .trim()
          .split('\n')
          .filter(l => l.trim())
          .map(l => parseInt(l.trim(), 10))
          .filter(n => !isNaN(n));

        if (pids.length > 0) {
          const pid = pids[0];
          let processName = 'unknown';
          try {
            processName = execFileSync('ps', ['-p', String(pid), '-o', 'comm='], {
              stdio: 'pipe',
              timeout: 5_000,
            })
              .toString()
              .trim();
          } catch {
            // ps failed — keep "unknown"
          }
          conflicts.push({ port, pid, processName });
        }
      } catch {
        // lsof returns non-zero when port is free — this is expected
      }
    }

    return ok({ conflicts });
    /* c8 ignore next 3 -- defensive: inner catches handle all known paths */
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(`Port conflict detection failed: ${message}`);
  }
}

/**
 * Ensure the shared observability stack is running.
 *
 * 1. If Docker is unavailable, returns fail.
 * 2. If the stack is already running, returns ok with current status.
 * 3. Checks for port conflicts before starting.
 * 4. Starts the shared stack and returns status.
 *
 * Data volumes are preserved — `startSharedStack()` uses `docker compose up -d`
 * which does NOT remove named volumes (NFR11).
 */
export function ensureStack(): Result<StackStatus> {
  try {
    if (!isDockerAvailable()) {
      return fail('Docker is required to run the shared observability stack but is not available');
    }

    const composePath = getComposeFilePath();

    // Already running — reuse
    if (isSharedStackRunning()) {
      const health = getStackHealth(composePath, SHARED_PROJECT_NAME);
      return ok({
        running: true,
        composePath,
        projectName: SHARED_PROJECT_NAME,
        services: health.services.map(s => ({
          name: s.name,
          healthy: s.running,
        })),
      });
    }

    // Pre-flight port check
    const portResult = detectPortConflicts();
    /* c8 ignore next 3 -- defensive: detectPortConflicts outer catch is near-unreachable */
    if (!portResult.success) {
      return fail(portResult.error);
    }
    if (portResult.data.conflicts.length > 0) {
      const details = portResult.data.conflicts
        .map(c => `port ${c.port} in use by ${c.processName} (pid ${c.pid})`)
        .join(', ');
      return fail(`Port conflict detected: ${details}`);
    }

    // Start the stack
    const startResult = startSharedStack();
    if (!startResult.started) {
      return fail(`Failed to start shared stack: ${startResult.error ?? 'unknown error'}`);
    }

    const health = getStackHealth(composePath, SHARED_PROJECT_NAME);
    return ok({
      running: true,
      composePath,
      projectName: SHARED_PROJECT_NAME,
      services: health.services.map(s => ({
        name: s.name,
        healthy: s.running,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(`ensureStack failed: ${message}`);
  }
}
