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

/** Maximum characters for the output summary before truncation. */
const OUTPUT_TRUNCATE_LIMIT = 2000;

/**
 * Format an OutputContract as a structured text block suitable for injection
 * into a subsequent task's prompt. Provides cross-framework context: changed
 * files, test results, output summary, and acceptance criteria statuses.
 *
 * The `output` field is truncated to 2000 characters to avoid prompt bloat.
 */
export function formatContractAsPromptContext(contract: OutputContract): string {
  const sections: string[] = [];

  // Header: task metadata
  const costStr = contract.cost_usd != null ? `$${contract.cost_usd.toFixed(2)}` : 'N/A';
  const durationStr = `${(contract.duration_ms / 1000).toFixed(1)}s`;
  sections.push(
    `### Context from Previous Task\n` +
      `- **Task:** ${contract.taskName}\n` +
      `- **Scope:** ${contract.targetScope ?? 'story'}\n` +
      `- **Driver:** ${contract.driver}\n` +
    `- **Model:** ${contract.model}\n` +
    `- **Cost:** ${costStr}\n` +
    `- **Duration:** ${durationStr}\n` +
    `- **Timestamp:** ${contract.timestamp}`,
  );

  // Changed Files
  if (contract.changedFiles.length > 0) {
    const fileList = contract.changedFiles.map((f) => `- ${f}`).join('\n');
    sections.push(`### Changed Files\n${fileList}`);
  } else {
    sections.push(`### Changed Files\nNone`);
  }

  // Test Results
  if (contract.testResults) {
    const tr = contract.testResults;
    const coverageStr = tr.coverage != null ? `${tr.coverage}%` : 'N/A';
    sections.push(
      `### Test Results\n` +
      `- **Passed:** ${tr.passed}\n` +
      `- **Failed:** ${tr.failed}\n` +
      `- **Coverage:** ${coverageStr}`,
    );
  } else {
    sections.push(`### Test Results\nNo test results available`);
  }

  // Output Summary (truncated)
  let outputText = contract.output;
  if (outputText.length > OUTPUT_TRUNCATE_LIMIT) {
    outputText = outputText.slice(0, OUTPUT_TRUNCATE_LIMIT) + ' [truncated]';
  }
  if (outputText.length > 0) {
    sections.push(`### Output Summary\n${outputText}`);
  } else {
    sections.push(`### Output Summary\nNone`);
  }

  // Acceptance Criteria
  if (contract.acceptanceCriteria.length > 0) {
    const acList = contract.acceptanceCriteria
      .map((ac) => `- **${ac.id}** (${ac.status}): ${ac.description}`)
      .join('\n');
    sections.push(`### Acceptance Criteria\n${acList}`);
  } else {
    sections.push(`### Acceptance Criteria\nNone`);
  }

  return sections.join('\n\n');
}

/**
 * Build a prompt with optional contract context appended.
 *
 * If `previousContract` is null (first task in workflow), returns `basePrompt`
 * unchanged. Otherwise, appends a formatted contract context block separated
 * by a clear delimiter.
 */
export function buildPromptWithContractContext(
  basePrompt: string,
  previousContract: OutputContract | null,
): string {
  if (!previousContract) {
    return basePrompt;
  }

  const context = formatContractAsPromptContext(previousContract);
  return `${basePrompt}\n\n---\n\n## Previous Task Context\n\n${context}`;
}
