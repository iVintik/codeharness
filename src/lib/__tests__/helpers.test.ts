import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  // Re-exported from cargo-toml-variants
  CARGO_TOML_MINIMAL,
  CARGO_TOML_ACTIX_WEB,
  CARGO_TOML_AXUM,
  CARGO_TOML_ASYNC_OPENAI,
  CARGO_TOML_WORKSPACE,
  CARGO_TOML_BINARY,
  CARGO_TOML_LIBRARY,
  CARGO_TOML_GENERIC,
  // Re-exported from state-builders
  buildSprintState,
  buildStoryEntry,
  buildEpicState,
  buildActionItem,
  buildSprintStateWithStory,
  // Re-exported from mock-factories
  createFsMock,
  createChildProcessMock,
  createDockerMock,
  createStateMock,
  createSprintStateMock,
  // helpers.ts own export
  withTempDir,
} from './helpers.js';

describe('helpers.ts — re-exports', () => {
  it('re-exports all cargo-toml-variants', () => {
    expect(CARGO_TOML_MINIMAL).toBeDefined();
    expect(CARGO_TOML_ACTIX_WEB).toBeDefined();
    expect(CARGO_TOML_AXUM).toBeDefined();
    expect(CARGO_TOML_ASYNC_OPENAI).toBeDefined();
    expect(CARGO_TOML_WORKSPACE).toBeDefined();
    expect(CARGO_TOML_BINARY).toBeDefined();
    expect(CARGO_TOML_LIBRARY).toBeDefined();
    expect(CARGO_TOML_GENERIC).toBeDefined();
  });

  it('re-exports all state-builders', () => {
    expect(typeof buildSprintState).toBe('function');
    expect(typeof buildStoryEntry).toBe('function');
    expect(typeof buildEpicState).toBe('function');
    expect(typeof buildActionItem).toBe('function');
    expect(typeof buildSprintStateWithStory).toBe('function');
  });

  it('re-exports all mock-factories', () => {
    expect(typeof createFsMock).toBe('function');
    expect(typeof createChildProcessMock).toBe('function');
    expect(typeof createDockerMock).toBe('function');
    expect(typeof createStateMock).toBe('function');
    expect(typeof createSprintStateMock).toBe('function');
  });
});

describe('withTempDir', () => {
  it('creates a temp directory and passes it to the callback', async () => {
    let capturedDir = '';
    await withTempDir(async (dir) => {
      capturedDir = dir;
      expect(existsSync(dir)).toBe(true);
    });
    expect(capturedDir).toBeTruthy();
  });

  it('cleans up the temp directory after callback completes', async () => {
    let capturedDir = '';
    await withTempDir(async (dir) => {
      capturedDir = dir;
    });
    expect(existsSync(capturedDir)).toBe(false);
  });

  it('cleans up on error', async () => {
    let capturedDir = '';
    await expect(
      withTempDir(async (dir) => {
        capturedDir = dir;
        throw new Error('test error');
      }),
    ).rejects.toThrow('test error');
    expect(existsSync(capturedDir)).toBe(false);
  });

  it('supports custom prefix', async () => {
    await withTempDir(async (dir) => {
      const base = dir.split('/').pop() ?? '';
      expect(base.startsWith('custom-prefix-')).toBe(true);
    }, 'custom-prefix-');
  });

  it('default prefix is ch-test-', async () => {
    await withTempDir(async (dir) => {
      const base = dir.split('/').pop() ?? '';
      expect(base.startsWith('ch-test-')).toBe(true);
    });
  });
});
