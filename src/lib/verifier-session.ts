/**
 * Verifier session spawner — clean workspace + Docker container isolation.
 * AD8: CLI orchestrates verification. AD10: Two-layer isolation.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ok, fail } from '../types/result.js';
import type { Result } from '../types/result.js';
import { verifyPromptTemplate } from '../templates/verify-prompt.js';
import { isValidStoryKey, cleanupStaleContainers, parseObservabilityGaps } from '../modules/verify/index.js';
import type { VerifyResult } from '../modules/verify/index.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface VerifierSessionOptions {
  /** Story key, e.g. "13-3-black-box-verifier-agent" */
  storyKey: string;
  /** Absolute path to the main project directory */
  projectDir: string;
  /** Max budget in USD for the verifier session (default: 3) */
  maxBudgetUsd?: number;
  /** Timeout in milliseconds (default: 0 = no timeout, ralph handles timeouts) */
  timeoutMs?: number;
  /** Docker container name (default: "codeharness-verify") */
  containerName?: string;
  /** Observability endpoint overrides */
  observabilityEndpoints?: {
    victoriaLogs?: string;
    victoriaMetrics?: string;
    victoriaTraces?: string;
  };
}

/** Error shape from Node.js child_process spawn failures. */
interface SpawnError {
  status?: number;
  stdout?: Buffer;
  stderr?: Buffer;
  message?: string;
  code?: string;
  killed?: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const TEMP_PREFIX = '/tmp/codeharness-verify-';
const DEFAULT_BUDGET = 3;
const DEFAULT_TIMEOUT = 0; // No timeout — ralph's iteration timeout is the safety net
const DEFAULT_CONTAINER = 'codeharness-verify';
const TIMEOUT_EXIT_CODE = 124;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Returns true if the error indicates a timeout. */
function isTimeoutError(error: SpawnError): boolean {
  return (
    error.killed === true ||
    error.code === 'ETIMEDOUT' ||
    error.message?.includes('ETIMEDOUT') === true ||
    error.message?.includes('timed out') === true
  );
}

/** Guarantees non-empty output: falls back to stderr, then descriptive message. */
function ensureNonEmptyOutput(stdout: string, stderr: string, fallback: string): string {
  if (stdout.length > 0) return stdout;
  if (stderr.length > 0) return stderr;
  return fallback;
}

/** Saves partial proof on timeout. Returns true if saved. */
function savePartialProof(
  workspace: string,
  storyKey: string,
  duration: number,
  partialOutput: string,
  errorMessage: string,
): boolean {
  const proofDir = join(workspace, 'verification');
  const proofPath = join(proofDir, `${storyKey}-proof.md`);
  // If a partial proof already exists (verifier wrote some before timeout), keep it
  if (existsSync(proofPath)) return true;
  try {
    mkdirSync(proofDir, { recursive: true });
    const report = [
      `# Timeout Report: ${storyKey}`,
      '',
      `**Duration:** ${duration}ms`,
      `**Error:** ${errorMessage}`,
      `**Partial output length:** ${partialOutput.length} bytes`,
      '',
      '## Partial Output',
      '',
      '```text',
      partialOutput.slice(0, 5000),
      '```',
    ].join('\n');
    writeFileSync(proofPath, report, 'utf-8');
    return true;
  } catch {
    // IGNORE: proof file write failed, non-fatal
    return false;
  }
}

// ─── Session Spawner ────────────────────────────────────────────────────────

/** Spawns a verifier subprocess. Returns Result<VerifyResult> — never throws. */
export function spawnVerifierSession(
  options: VerifierSessionOptions,
): Result<VerifyResult> {
  try {
    const {
      storyKey,
      maxBudgetUsd = DEFAULT_BUDGET,
      timeoutMs = DEFAULT_TIMEOUT,
      containerName = DEFAULT_CONTAINER,
      observabilityEndpoints,
    } = options;

    // 0. Validate story key to prevent path traversal
    if (!isValidStoryKey(storyKey)) {
      return fail(
        `Invalid story key: ${storyKey}. Keys must contain only alphanumeric characters, hyphens, and underscores.`,
      );
    }

    // 1. Clean up stale containers before spawning
    cleanupStaleContainers();

    // 2. Resolve workspace path
    const workspace = `${TEMP_PREFIX}${storyKey}`;

    // 3. Verify workspace exists
    if (!existsSync(workspace)) {
      return fail(
        `Clean workspace not found at ${workspace}. Call prepareVerifyWorkspace() first.`,
      );
    }

    // 4. Read story.md from workspace
    const storyPath = join(workspace, 'story.md');
    if (!existsSync(storyPath)) {
      return fail(`story.md not found in workspace at ${storyPath}`);
    }
    const storyContent = readFileSync(storyPath, 'utf-8');

    // 5. Build verification prompt
    const prompt = verifyPromptTemplate({
      storyKey,
      storyContent,
      containerName,
      observabilityEndpoints,
    });

    // 6. Spawn claude --print with allowed tools so it doesn't hang on permissions
    const args = [
      '--print',
      '--max-budget-usd',
      String(maxBudgetUsd),
      '--allowedTools',
      'Bash', 'Read', 'Write', 'Glob', 'Grep', 'Edit',
      '-p',
      prompt,
    ];

    const startTime = Date.now();
    let output = '';
    let exitCode = 0;
    let isTimeout = false;

    try {
      const result = execFileSync('claude', args, {
        cwd: workspace,
        stdio: 'pipe',
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });
      output = result.toString('utf-8');
    } catch (err: unknown) {
      const error = err as SpawnError;
      exitCode = error.status ?? 1;
      const stdout = error.stdout?.toString('utf-8') ?? '';
      const stderr = error.stderr?.toString('utf-8') ?? '';
      isTimeout = isTimeoutError(error);

      if (isTimeout) {
        exitCode = TIMEOUT_EXIT_CODE;
        output = ensureNonEmptyOutput(
          stdout,
          stderr,
          `Verifier session timed out after ${timeoutMs}ms`,
        );
      } else {
        output = ensureNonEmptyOutput(
          stdout,
          stderr,
          error.message ?? `Verifier process exited with code ${exitCode}`,
        );
      }
    }

    const duration = Date.now() - startTime;

    // 7. On timeout: save partial proof
    let proofSaved = false;
    if (isTimeout) {
      proofSaved = savePartialProof(
        workspace, storyKey, duration, output, `Timeout after ${duration}ms`,
      );
    }

    // 8. Guarantee non-zero output (final safety net)
    if (output.length === 0) {
      output = `Verifier session produced no output (exit code: ${exitCode}, duration: ${duration}ms)`;
    }

    // 9. Check for proof file
    const proofPath = join(workspace, 'verification', `${storyKey}-proof.md`);
    const proofExists = existsSync(proofPath);
    const sessionSuccess = exitCode === 0 && proofExists;

    // Parse observability gaps from proof if available (Story 2.1)
    let observabilityGapCount = 0;
    let runtimeCoveragePercent = 0;
    if (proofExists) {
      try {
        const proofContent = readFileSync(proofPath, 'utf-8');
        const gapResult = parseObservabilityGaps(proofContent);
        observabilityGapCount = gapResult.gapCount;
        runtimeCoveragePercent =
          gapResult.totalACs === 0
            ? 0
            : (gapResult.coveredCount / gapResult.totalACs) * 100;
      } catch {
        // IGNORE: proof file may not be parseable, proceed with defaults
      }
    }

    // Build a minimal VerifyResult for the session outcome
    const verifyResult: VerifyResult = {
      storyId: storyKey,
      success: sessionSuccess,
      totalACs: 0,
      verifiedCount: 0,
      failedCount: 0,
      escalatedCount: 0,
      proofPath: proofExists ? proofPath : '',
      showboatVerifyStatus: 'skipped',
      observabilityGapCount,
      runtimeCoveragePercent,
      perAC: [],
    };

    if (!sessionSuccess) {
      return fail(
        isTimeout
          ? `Verifier session timed out after ${duration}ms`
          : `Verifier session failed (exit code: ${exitCode})`,
        {
          duration,
          partialOutputLength: output.length,
          proofSaved,
          exitCode,
          output,
          proofPath: proofExists ? proofPath : null,
        },
      );
    }

    return ok(verifyResult);
  } catch (err: unknown) {
    // Catch-all: never throw an unhandled exception
    const message = err instanceof Error ? err.message : String(err);
    return fail(`Unexpected error in spawnVerifierSession: ${message}`);
  }
}

// ─── Proof Copy ─────────────────────────────────────────────────────────────

/** Copies proof from temp workspace to project's verification/ directory. */
export function copyProofToProject(
  storyKey: string,
  workspace: string,
  projectDir: string,
): string {
  // Validate story key to prevent path traversal
  if (!isValidStoryKey(storyKey)) {
    throw new Error(
      `Invalid story key: ${storyKey}. Keys must contain only alphanumeric characters, hyphens, and underscores.`,
    );
  }

  const sourceProof = join(workspace, 'verification', `${storyKey}-proof.md`);
  if (!existsSync(sourceProof)) {
    throw new Error(`Proof file not found at ${sourceProof}`);
  }

  const destDir = join(projectDir, 'verification');
  mkdirSync(destDir, { recursive: true });

  const destPath = join(destDir, `${storyKey}-proof.md`);
  cpSync(sourceProof, destPath);

  return destPath;
}
