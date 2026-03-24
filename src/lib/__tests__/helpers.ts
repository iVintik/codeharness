/**
 * Shared test utilities and fixtures.
 *
 * Single import point for test helpers, fixtures, and mock factories.
 * Usage: import { withTempDir, buildSprintState, createFsMock, CARGO_TOML_MINIMAL } from '../../lib/__tests__/helpers.js';
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ── Re-exports from fixtures ───────────────────────────────────────────────────

export * from './fixtures/cargo-toml-variants.js';
export * from './fixtures/state-builders.js';
export * from './fixtures/mock-factories.js';

// ── Temp directory helper ──────────────────────────────────────────────────────

/**
 * Create a temporary directory, run the callback, then clean up.
 * Cleanup runs on success, error, or any exception.
 *
 * @param fn - async callback receiving the temp directory path
 * @param prefix - optional prefix for the temp directory name (default: 'ch-test-')
 */
export async function withTempDir(
  fn: (dir: string) => Promise<void>,
  prefix = 'ch-test-',
): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
