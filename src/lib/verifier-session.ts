/**
 * Verifier session spawner.
 * Spawns a separate Claude Code process in a clean workspace for black-box verification.
 *
 * Architecture Decision 8: CLI orchestrates all verification.
 * Architecture Decision 10: Two-layer isolation — clean workspace + Docker container.
 *
 * The verifier runs as `claude --print --max-budget-usd N -p "..."` with cwd set
 * to the clean workspace. This is fundamentally different from the Agent tool —
 * the subprocess has a completely different filesystem view with NO source code.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { verifyPromptTemplate } from '../templates/verify-prompt.js';
import { isValidStoryKey } from './verify-env.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface VerifierSessionOptions {
  /** Story key, e.g. "13-3-black-box-verifier-agent" */
  storyKey: string;
  /** Absolute path to the main project directory */
  projectDir: string;
  /** Max budget in USD for the verifier session (default: 3) */
  maxBudgetUsd?: number;
  /** Timeout in milliseconds (default: 600_000 = 10 min) */
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

export interface VerifierSessionResult {
  /** Whether the verifier session completed successfully and produced a proof */
  success: boolean;
  /** Absolute path to the proof file, or null if not found */
  proofPath: string | null;
  /** Exit code of the claude process */
  exitCode: number;
  /** Stdout from the claude process */
  output: string;
  /** Duration in milliseconds */
  duration: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const TEMP_PREFIX = '/tmp/codeharness-verify-';
const DEFAULT_BUDGET = 3;
const DEFAULT_TIMEOUT = 600_000; // 10 minutes
const DEFAULT_CONTAINER = 'codeharness-verify';

// ─── Session Spawner ────────────────────────────────────────────────────────

/**
 * Spawns a verifier as a separate Claude Code process in the clean workspace.
 *
 * Flow:
 * 1. Resolve clean workspace path
 * 2. Verify workspace exists (prepareVerifyWorkspace must be called first)
 * 3. Read story.md from workspace
 * 4. Build verification prompt from template
 * 5. Spawn `claude --print --max-budget-usd N -p "..."` with cwd = workspace
 * 6. Check for proof file after process completes
 * 7. Return result with success/failure, proof path, output, duration
 */
export function spawnVerifierSession(options: VerifierSessionOptions): VerifierSessionResult {
  const {
    storyKey,
    projectDir,
    maxBudgetUsd = DEFAULT_BUDGET,
    timeoutMs = DEFAULT_TIMEOUT,
    containerName = DEFAULT_CONTAINER,
    observabilityEndpoints,
  } = options;

  // 0. Validate story key to prevent path traversal
  if (!isValidStoryKey(storyKey)) {
    throw new Error(
      `Invalid story key: ${storyKey}. Keys must contain only alphanumeric characters, hyphens, and underscores.`,
    );
  }

  // 1. Resolve workspace path
  const workspace = `${TEMP_PREFIX}${storyKey}`;

  // 2. Verify workspace exists
  if (!existsSync(workspace)) {
    throw new Error(
      `Clean workspace not found at ${workspace}. Call prepareVerifyWorkspace() first.`,
    );
  }

  // 3. Read story.md from workspace
  const storyPath = join(workspace, 'story.md');
  if (!existsSync(storyPath)) {
    throw new Error(`story.md not found in workspace at ${storyPath}`);
  }
  const storyContent = readFileSync(storyPath, 'utf-8');

  // 4. Build verification prompt
  const prompt = verifyPromptTemplate({
    storyKey,
    storyContent,
    containerName,
    observabilityEndpoints,
  });

  // 5. Spawn claude --print
  const args = [
    '--print',
    '--max-budget-usd',
    String(maxBudgetUsd),
    '-p',
    prompt,
  ];

  const startTime = Date.now();
  let output = '';
  let exitCode = 0;

  try {
    const result = execFileSync('claude', args, {
      cwd: workspace,
      stdio: 'pipe',
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });
    output = result.toString('utf-8');
  } catch (err: unknown) {
    const error = err as { status?: number; stdout?: Buffer; stderr?: Buffer; message?: string };
    exitCode = error.status ?? 1;
    output = error.stdout?.toString('utf-8') ?? error.stderr?.toString('utf-8') ?? error.message ?? '';

    // Check for specific failure modes
    if (error.message?.includes('ETIMEDOUT') || error.message?.includes('timed out')) {
      output = `Verifier session timed out after ${timeoutMs}ms. ${output}`;
    }
  }

  const duration = Date.now() - startTime;

  // 6. Check for proof file
  const proofPath = join(workspace, 'verification', `${storyKey}-proof.md`);
  const proofExists = existsSync(proofPath);

  return {
    success: exitCode === 0 && proofExists,
    proofPath: proofExists ? proofPath : null,
    exitCode,
    output,
    duration,
  };
}

// ─── Proof Copy ─────────────────────────────────────────────────────────────

/**
 * Copies the proof document from the temp workspace to the main project's
 * verification/ directory.
 *
 * Creates the verification/ directory if it doesn't exist.
 * Returns the destination path.
 */
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
