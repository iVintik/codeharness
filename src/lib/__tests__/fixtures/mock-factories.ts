/**
 * Mock factory functions for commonly mocked modules.
 *
 * Each factory returns a plain object with vi.fn() stubs.
 * They do NOT call vi.mock() — that must happen at module level
 * in each test file (Vitest hoisting requirement).
 *
 * Usage pattern:
 *   import { createFsMock } from '../../lib/__tests__/helpers.js';
 *   const fsMock = createFsMock();
 *   vi.mock('node:fs', () => fsMock);
 */

import { vi } from 'vitest';

/**
 * Create mock stubs for `node:fs` module.
 * Includes the most commonly used fs functions in tests.
 */
export function createFsMock() {
  return {
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    mkdtempSync: vi.fn(),
    rmSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(),
    unlinkSync: vi.fn(),
    copyFileSync: vi.fn(),
    renameSync: vi.fn(),
  };
}

/**
 * Create mock stubs for `node:child_process` module.
 */
export function createChildProcessMock() {
  return {
    execFileSync: vi.fn(),
    execSync: vi.fn(),
    spawn: vi.fn(),
    exec: vi.fn(),
  };
}

/**
 * Create mock stubs for Docker-related functions.
 * Matches the exports from `src/lib/docker/index.ts`.
 */
export function createDockerMock() {
  return {
    isDockerAvailable: vi.fn(() => true),
    isDockerComposeAvailable: vi.fn(() => true),
    isStackRunning: vi.fn(() => false),
    startStack: vi.fn(() => ({ started: true, services: [], error: undefined })),
    stopStack: vi.fn(),
    getStackHealth: vi.fn(() => ({
      healthy: true,
      services: [],
      remedy: undefined,
    })),
    isSharedStackRunning: vi.fn(() => false),
    startSharedStack: vi.fn(() => ({ started: true, error: undefined })),
    stopSharedStack: vi.fn(),
    startCollectorOnly: vi.fn(() => ({ started: true, error: undefined })),
    isCollectorRunning: vi.fn(() => false),
    stopCollectorOnly: vi.fn(),
    getCollectorHealth: vi.fn(() => ({
      healthy: true,
      services: [],
      remedy: undefined,
    })),
    checkRemoteEndpoint: vi.fn(async () => ({ reachable: true, error: undefined })),
    cleanupOrphanedContainers: vi.fn(),
    cleanupVerifyEnv: vi.fn(),
  };
}

/**
 * Create mock stubs for HarnessState functions from `src/lib/state.ts`.
 */
export function createStateMock() {
  return {
    readState: vi.fn(() => ({})),
    writeState: vi.fn(),
    readStateWithBody: vi.fn(() => ({ state: {}, body: '' })),
    getStatePath: vi.fn(() => '.claude/codeharness.local.md'),
  };
}

/**
 * Create mock stubs for SprintState functions from `src/modules/sprint/state.ts`.
 */
export function createSprintStateMock() {
  return {
    getSprintState: vi.fn(() => ({ success: true, data: undefined })),
    updateStoryStatus: vi.fn(() => ({ success: true, data: undefined })),
    writeStateAtomic: vi.fn(() => ({ success: true, data: undefined })),
    computeSprintCounts: vi.fn(() => ({ total: 0, done: 0, failed: 0, blocked: 0 })),
  };
}
