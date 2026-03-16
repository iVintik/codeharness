/**
 * Verification orchestrator.
 * Checks preconditions, creates proof documents, runs showboat verify,
 * updates state and beads.
 *
 * Architecture Decision 8: CLI orchestrates verification.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { warn } from './output.js';
import { readState, readStateWithBody, writeState } from './state.js';
import { checkStoryDocFreshness } from './doc-health.js';
import { isBeadsInitialized, listIssues, closeIssue } from './beads.js';
import { syncClose } from './beads-sync.js';
import { showboatProofTemplate } from '../templates/showboat-template.js';
import type { ParsedAC } from './verify-parser.js';
import type { AcceptanceCriterion } from '../templates/showboat-template.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProofQuality {
  verified: number;
  pending: number;
  escalated: number;
  total: number;
  passed: boolean;
}

export interface VerifyResult {
  storyId: string;
  success: boolean;
  totalACs: number;
  verifiedCount: number;
  failedCount: number;
  escalatedCount: number;
  proofPath: string;
  showboatVerifyStatus: 'pass' | 'fail' | 'skipped';
  perAC: {
    id: string;
    description: string;
    verified: boolean;
    evidencePaths: string[];
  }[];
}

export interface PreconditionResult {
  passed: boolean;
  failures: string[];
}

export interface ShowboatVerifyResult {
  passed: boolean;
  output: string;
}

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
      // Doc health check failed — don't block verification
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
export function createProofDocument(
  storyId: string,
  storyTitle: string,
  acs: ParsedAC[],
  dir?: string,
): string {
  const root = dir ?? process.cwd();
  const verificationDir = join(root, 'verification');
  const screenshotsDir = join(verificationDir, 'screenshots');

  mkdirSync(verificationDir, { recursive: true });
  mkdirSync(screenshotsDir, { recursive: true });

  const criteria: AcceptanceCriterion[] = acs.map(ac => ({
    id: ac.id,
    description: ac.description,
    verified: false,
    evidence: [],
  }));

  const content = showboatProofTemplate({
    storyId,
    storyTitle,
    acceptanceCriteria: criteria,
  });

  const proofPath = join(verificationDir, `${storyId}-proof.md`);
  writeFileSync(proofPath, content, 'utf-8');

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
    // Check if it's a command-not-found error (showboat not installed)
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('ENOENT') || message.includes('not found')) {
      return { passed: false, output: 'showboat not available' };
    }
    // Showboat ran but returned non-zero exit code
    const stderr = (err as { stderr?: Buffer })?.stderr?.toString().trim() ?? '';
    const stdout = (err as { stdout?: Buffer })?.stdout?.toString().trim() ?? '';
    return { passed: false, output: stdout || stderr || message };
  }
}

/**
 * Validates proof quality by parsing AC sections and counting their statuses.
 * Returns detailed quality metrics including per-AC verified/pending counts.
 *
 * AC sections are identified by `## AC N:` headers.
 * A section is considered "verified" if it contains a `<!-- /showboat exec -->` or
 * `<!-- showboat image:` marker. Otherwise it is "pending".
 *
 * `passed` is true only when `pending === 0 && verified > 0`.
 */
export function validateProofQuality(proofPath: string): ProofQuality {
  if (!existsSync(proofPath)) {
    return { verified: 0, pending: 0, escalated: 0, total: 0, passed: false };
  }

  const content = readFileSync(proofPath, 'utf-8');

  // Split into AC sections by ## AC N: headers
  const acHeaderPattern = /^## AC \d+:/gm;
  const matches = [...content.matchAll(acHeaderPattern)];

  if (matches.length === 0) {
    return { verified: 0, pending: 0, escalated: 0, total: 0, passed: false };
  }

  let verified = 0;
  let pending = 0;
  let escalated = 0;

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index!;
    const end = i + 1 < matches.length ? matches[i + 1].index! : content.length;
    const section = content.slice(start, end);

    // Check for [ESCALATE] marker first — escalated ACs are explicitly
    // unverifiable, distinct from pending (missing evidence).
    if (section.includes('[ESCALATE]')) {
      escalated++;
      continue;
    }

    // Recognise both the codeharness template markers AND showboat's native
    // format (```bash + ```output pairs produced by `showboat exec`).
    const hasEvidence =
      section.includes('<!-- /showboat exec -->') ||
      section.includes('<!-- showboat image:') ||
      /```(?:bash|shell)\n[\s\S]*?```\n+```output\n/m.test(section);

    if (hasEvidence) {
      verified++;
    } else {
      pending++;
    }
  }

  const total = verified + pending + escalated;
  return {
    verified,
    pending,
    escalated,
    total,
    // Proof passes when no pending ACs remain and at least one is verified.
    // Escalated ACs are allowed — they are explicitly acknowledged as unverifiable.
    passed: pending === 0 && verified > 0,
  };
}

/**
 * @deprecated Use `validateProofQuality()` instead. This function is kept
 * for backward compatibility and returns `validateProofQuality(proofPath).passed`.
 */
export function proofHasContent(proofPath: string): boolean {
  return validateProofQuality(proofPath).passed;
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

// ─── Beads Close ────────────────────────────────────────────────────────────

/**
 * Closes the beads issue for the story via syncClose.
 * Handles beads not initialized gracefully.
 */
export function closeBeadsIssue(storyId: string, dir?: string): void {
  const root = dir ?? process.cwd();

  if (!isBeadsInitialized(root)) {
    warn('Beads not initialized — skipping issue close');
    return;
  }

  try {
    const issues = listIssues();
    // Find issue whose description path contains the story ID
    const issue = issues.find(i => {
      const desc = i.description ?? '';
      return desc.includes(storyId);
    });

    if (!issue) {
      warn(`No beads issue found for story ${storyId} — skipping issue close`);
      return;
    }

    syncClose(issue.id, { closeIssue, listIssues }, root);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    warn(`Failed to close beads issue: ${message}`);
  }
}
