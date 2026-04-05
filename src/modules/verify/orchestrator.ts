/**
 * Verification orchestrator.
 * Checks preconditions, creates proof documents, runs showboat verify,
 * and updates state.
 *
 * Architecture Decision 8: CLI orchestrates verification.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { warn } from '../../lib/output.js';
import { readState, readStateWithBody, writeState } from '../../lib/state.js';
import { checkStoryDocFreshness } from '../../lib/doc-health/index.js';
import type {
  ParsedAC,
  VerifyResult,
  PreconditionResult,
  ShowboatVerifyResult,
} from './types.js';

// ─── Preconditions ──────────────────────────────────────────────────────────

/**
 * Checks that tests_passed and coverage_met flags are true in state,
 * and that documentation is fresh for the story being verified.
 */
export function checkPreconditions(dir?: string, storyId?: string): PreconditionResult {
  const state = readState(dir);
  const failures: string[] = [];

  if (!state.session_flags.tests_passed) {
    failures.push('tests_passed is false — run tests first');
  }
  if (!state.session_flags.coverage_met) {
    failures.push('coverage_met is false — ensure coverage target is met');
  }

  // Check doc freshness for the story being verified
  if (storyId) {
    try {
      const docReport = checkStoryDocFreshness(storyId, dir);
      if (!docReport.passed) {
        for (const doc of docReport.documents) {
          if (doc.grade === 'stale') {
            failures.push(doc.reason);
          } else if (doc.grade === 'missing') {
            failures.push(doc.reason);
          }
        }
      }
    } catch {
      // IGNORE: doc health check failed, don't block verification
      warn('Doc health check failed — skipping');
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

// ─── Proof Document ─────────────────────────────────────────────────────────

/**
 * Creates the proof document skeleton at verification/<story-id>-proof.md.
 * Creates verification/ and verification/screenshots/ directories if needed.
 * Returns the proof file path.
 */
// TODO: v2 blind evaluator (Epic 6) — proof document creation removed with showboat template.
// createProofDocument will be replaced by JSON verdict generation in Epic 6.
export function createProofDocument(
  storyId: string,
  _storyTitle: string,
  _acs: ParsedAC[],
  dir?: string,
): string {
  const root = dir ?? process.cwd();
  const verificationDir = join(root, 'verification');
  mkdirSync(verificationDir, { recursive: true });

  const proofPath = join(verificationDir, `${storyId}-proof.md`);
  writeFileSync(proofPath, `# ${storyId} — Proof\n\nPending: blind evaluator (Epic 6)\n`, 'utf-8');

  return proofPath;
}

// ─── Showboat Verify ────────────────────────────────────────────────────────

/**
 * Runs `showboat verify <proofPath>`.
 * Returns pass/fail based on exit code. Handles showboat not installed.
 */
export function runShowboatVerify(proofPath: string): ShowboatVerifyResult {
  try {
    const output = execFileSync('showboat', ['verify', proofPath], {
      stdio: 'pipe',
      timeout: 300_000,
    });
    return { passed: true, output: output.toString().trim() };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('ENOENT') || message.includes('not found')) {
      return { passed: false, output: 'showboat not available' };
    }
    const stderr = (err as { stderr?: Buffer })?.stderr?.toString().trim() ?? '';
    const stdout = (err as { stdout?: Buffer })?.stdout?.toString().trim() ?? '';
    return { passed: false, output: stdout || stderr || message };
  }
}

// ─── State Update ───────────────────────────────────────────────────────────

/**
 * Updates state: sets verification_run = true, appends to verification_log.
 */
export function updateVerificationState(
  storyId: string,
  result: VerifyResult,
  dir?: string,
): void {
  const { state, body } = readStateWithBody(dir);
  state.session_flags.verification_run = true;

  const status = result.success ? 'pass' : 'fail';
  const timestamp = new Date().toISOString();
  state.verification_log.push(`${storyId}: ${status} at ${timestamp}`);

  writeState(state, dir, body);
}

// ─── Beads Close (removed — Epic 8 replacement pending) ────────────────────

// TODO: v2 issue tracker (Epic 8) — closeBeadsIssue removed with beads cleanup
/**
 * Stub: no-op since beads has been removed.
 */
export function closeBeadsIssue(_storyId: string, _dir?: string): void {
  // No-op: beads integration removed. Will be replaced by issue tracker in Epic 8.
}
