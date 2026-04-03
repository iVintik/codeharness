/**
 * Output contract serialization and deserialization.
 *
 * Provides atomic write/read for OutputContract JSON files.
 * Written atomically: first to a .tmp file, then renamed to final path.
 * See architecture-multi-framework.md Decision 3.
 */

import { writeFileSync, readFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { OutputContract } from './types.js';

/**
 * Validate that a string is a safe filename component (no path separators, not empty).
 */
function assertSafeComponent(value: string, label: string): void {
  if (!value || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  if (value.includes('/') || value.includes('\\') || value.includes('..')) {
    throw new Error(`${label} contains invalid path characters: ${value}`);
  }
}

/**
 * Compute the file path for a contract.
 * Validates that taskName and storyId are safe filename components.
 */
function contractFilePath(taskName: string, storyId: string, contractDir: string): string {
  assertSafeComponent(taskName, 'taskName');
  assertSafeComponent(storyId, 'storyId');
  const filePath = join(contractDir, `${taskName}-${storyId}.json`);
  // Ensure the resolved path is inside the contract directory
  const resolvedDir = resolve(contractDir);
  const resolvedFile = resolve(filePath);
  if (!resolvedFile.startsWith(resolvedDir)) {
    throw new Error(`Path traversal detected: ${filePath} escapes ${contractDir}`);
  }
  return filePath;
}

/**
 * Write an OutputContract to disk atomically.
 *
 * Creates the target directory if it does not exist.
 * Writes to a .tmp file first, then renames to the final path.
 * On failure, throws an error with a descriptive message including the file path.
 */
export function writeOutputContract(contract: OutputContract, contractDir: string): void {
  const finalPath = contractFilePath(contract.taskName, contract.storyId, contractDir);
  const tmpPath = finalPath + '.tmp';

  try {
    mkdirSync(contractDir, { recursive: true });
    writeFileSync(tmpPath, JSON.stringify(contract, null, 2) + '\n', 'utf-8');
    renameSync(tmpPath, finalPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to write output contract to ${finalPath}: ${message}`, { cause: err });
  }
}

/**
 * Read an OutputContract from disk.
 *
 * Returns null if the file does not exist.
 */
export function readOutputContract(
  taskName: string,
  storyId: string,
  contractDir: string,
): OutputContract | null {
  const filePath = contractFilePath(taskName, storyId, contractDir);

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as OutputContract;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read output contract from ${filePath}: ${message}`, { cause: err });
  }
}
