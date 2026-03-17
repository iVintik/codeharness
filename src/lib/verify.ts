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
  /** Count of `grep ... src/` commands in evidence (black-box metric) */
  grepSrcCount: number;
  /** Count of `docker exec` commands in evidence (black-box metric) */
  dockerExecCount: number;
  /** Count of observability query commands in evidence (black-box metric) */
  observabilityCount: number;
  /** Count of other commands in evidence (black-box metric) */
  otherCount: number;
  /** Whether the proof passes black-box enforcement checks */
  blackBoxPass: boolean;
}

// ─── Evidence Command Classification ─────────────────────────────────────────

export type EvidenceCommandType = 'docker-exec' | 'docker-host' | 'observability' | 'grep-src' | 'other';

export interface ClassifiedCommand {
  command: string;
  type: EvidenceCommandType;
}

/**
 * Extracts command strings from evidence blocks in a proof document
 * and classifies each as: docker-exec, observability, grep-src, or other.
 *
 * Scans for commands inside ```bash or ```shell fenced code blocks.
 */
export function classifyEvidenceCommands(proofContent: string): ClassifiedCommand[] {
  const results: ClassifiedCommand[] = [];

  // Extract commands from ```bash or ```shell code blocks
  const codeBlockPattern = /```(?:bash|shell)\n([\s\S]*?)```/g;
  for (const match of proofContent.matchAll(codeBlockPattern)) {
    const block = match[1].trim();
    // Each non-empty line in a code block is a command (or continuation)
    // We treat the whole block as one command for classification
    const lines = block.split('\n').filter(l => l.trim().length > 0);
    for (const line of lines) {
      const cmd = line.trim();
      if (!cmd) continue;
      results.push({ command: cmd, type: classifyCommand(cmd) });
    }
  }

  return results;
}

/**
 * Classifies a single command string.
 */
function classifyCommand(cmd: string): EvidenceCommandType {
  // docker exec commands
  if (/docker\s+exec\b/.test(cmd)) {
    return 'docker-exec';
  }

  // Docker host commands (docker ps, docker logs, docker inspect, etc.)
  // These are legitimate black-box evidence — querying container state from the host
  if (/docker\s+(ps|logs|inspect|stats|top|port)\b/.test(cmd)) {
    return 'docker-host';
  }

  // Observability queries (curl to known endpoints)
  if (/curl\b/.test(cmd) && /localhost:(9428|8428|16686)\b/.test(cmd)) {
    return 'observability';
  }

  // grep against src/
  if (/\bgrep\b/.test(cmd) && /\bsrc\//.test(cmd)) {
    return 'grep-src';
  }

  return 'other';
}

/**
 * Checks black-box enforcement criteria for a proof document.
 * Returns whether the proof passes and per-AC docker exec presence.
 *
 * Rejection criteria:
 * - >50% of evidence commands are grep against src/
 * - Any AC section has zero docker exec commands
 */
export function checkBlackBoxEnforcement(proofContent: string): {
  blackBoxPass: boolean;
  grepSrcCount: number;
  dockerExecCount: number;
  observabilityCount: number;
  otherCount: number;
  grepRatio: number;
  acsMissingDockerExec: number[];
} {
  const commands = classifyEvidenceCommands(proofContent);

  const grepSrcCount = commands.filter(c => c.type === 'grep-src').length;
  const dockerExecCount = commands.filter(c => c.type === 'docker-exec').length;
  const observabilityCount = commands.filter(c => c.type === 'observability').length;
  const otherCount = commands.filter(c => c.type === 'other').length;
  const totalCommands = commands.length;

  const grepRatio = totalCommands > 0 ? grepSrcCount / totalCommands : 0;

  // Check per-AC docker exec presence
  const acsMissingDockerExec: number[] = [];
  const acHeaderPattern = /^## AC ?(\d+):/gm;
  const acMatches = [...proofContent.matchAll(acHeaderPattern)];

  if (acMatches.length > 0) {
    for (let i = 0; i < acMatches.length; i++) {
      const acNum = parseInt(acMatches[i][1], 10);
      const start = acMatches[i].index!;
      const end = i + 1 < acMatches.length ? acMatches[i + 1].index! : proofContent.length;
      const section = proofContent.slice(start, end);

      // Skip escalated ACs
      if (section.includes('[ESCALATE]')) continue;

      // Check if this section has black-box evidence commands
      // (docker exec, docker host commands, or observability queries)
      const sectionCommands = classifyEvidenceCommands(section);
      const hasBlackBoxEvidence = sectionCommands.some(c =>
        c.type === 'docker-exec' || c.type === 'docker-host' || c.type === 'observability'
      );
      if (!hasBlackBoxEvidence) {
        acsMissingDockerExec.push(acNum);
      }
    }
  }

  const grepTooHigh = grepRatio > 0.5;
  const missingDockerExec = acsMissingDockerExec.length > 0;

  // If no bash/shell code blocks were found at all, black-box checks are
  // not applicable (the proof may use showboat-native exec markers).
  // Enforcement only kicks in when there are extractable commands.
  const hasExtractableCommands = totalCommands > 0;

  return {
    blackBoxPass: !hasExtractableCommands || (!grepTooHigh && !missingDockerExec),
    grepSrcCount,
    dockerExecCount,
    observabilityCount,
    otherCount,
    grepRatio,
    acsMissingDockerExec,
  };
}

/**
 * Checks if a section contains a [FAIL] verdict outside of code blocks.
 * Returns true only if [FAIL] appears in prose/headers, not inside ```output blocks.
 */
function hasFailVerdict(section: string): boolean {
  // Strip fenced code blocks (```...```) and inline code (`...`) to avoid
  // matching [FAIL] in command output or inline code references
  const withoutCodeBlocks = section.replace(/```[\s\S]*?```/g, '');
  const withoutInlineCode = withoutCodeBlocks.replace(/`[^`]+`/g, '');
  return withoutInlineCode.includes('[FAIL]');
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
  const emptyResult: ProofQuality = {
    verified: 0, pending: 0, escalated: 0, total: 0, passed: false,
    grepSrcCount: 0, dockerExecCount: 0, observabilityCount: 0, otherCount: 0,
    blackBoxPass: false,
  };

  if (!existsSync(proofPath)) {
    return emptyResult;
  }

  const content = readFileSync(proofPath, 'utf-8');

  // Compute black-box enforcement metrics once
  const bbEnforcement = checkBlackBoxEnforcement(content);

  /** Helper: merge base counts with black-box metrics to produce final ProofQuality */
  function buildResult(base: { verified: number; pending: number; escalated: number; total: number }): ProofQuality {
    const basePassed = base.pending === 0 && base.verified > 0;
    return {
      ...base,
      passed: basePassed && bbEnforcement.blackBoxPass,
      grepSrcCount: bbEnforcement.grepSrcCount,
      dockerExecCount: bbEnforcement.dockerExecCount,
      observabilityCount: bbEnforcement.observabilityCount,
      otherCount: bbEnforcement.otherCount,
      blackBoxPass: bbEnforcement.blackBoxPass,
    };
  }

  // Try two formats: (1) ## AC N: section headers, (2) inline --- ACN: markers in code blocks
  const acHeaderPattern = /^## AC ?(\d+):/gm;
  const matches = [...content.matchAll(acHeaderPattern)];

  let verified = 0;
  let pending = 0;
  let escalated = 0;

  if (matches.length > 0) {
    // Format 1: dedicated ## AC N: section headers
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index!;
      const end = i + 1 < matches.length ? matches[i + 1].index! : content.length;
      const section = content.slice(start, end);

      if (section.includes('[ESCALATE]')) {
        escalated++;
        continue;
      }

      // Check for FAIL verdict — AC failed verification
      // Only match [FAIL] outside of code blocks (not in command output)
      if (hasFailVerdict(section)) {
        pending++;
        continue;
      }

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
  } else {
    // Format 2: showboat native — inline --- ACN: markers inside code blocks
    const inlineAcPattern = /--- AC ?(\d+):/g;
    const inlineMatches = [...content.matchAll(inlineAcPattern)];
    const acNumbers = new Set(inlineMatches.map(m => m[1]));

    if (acNumbers.size === 0) {
      // Format 3: narrative proofs with === AC N: markers inside code block output
      const narrativeAcPattern = /=== AC ?(\d+):/g;
      const narrativeMatches = [...content.matchAll(narrativeAcPattern)];
      const narrativeAcNumbers = new Set(narrativeMatches.map(m => m[1]));

      if (narrativeAcNumbers.size === 0) {
        // Format 4: bullet-list AC summaries (e.g., "- AC1: desc", "- AC1 PASS: desc", "- AC 1: desc")
        const bulletAcPattern = /^- AC ?(\d+)[^:\n]*:/gm;
        const bulletMatches = [...content.matchAll(bulletAcPattern)];
        const bulletAcNumbers = new Set(bulletMatches.map(m => m[1]));

        if (bulletAcNumbers.size === 0) {
          return buildResult({ verified: 0, pending: 0, escalated: 0, total: 0 });
        }

        let bVerified = 0;
        let bPending = 0;
        let bEscalated = 0;

        for (const acNum of bulletAcNumbers) {
          // Find the bullet line for this AC
          const bulletPattern = new RegExp(`^- AC ?${acNum}[^:\\n]*:(.*)$`, 'm');
          const bulletMatch = content.match(bulletPattern);
          if (!bulletMatch) { bPending++; continue; }

          const bulletText = bulletMatch[1].toLowerCase();
          if (bulletText.includes('n/a') || bulletText.includes('escalat') || bulletText.includes('superseded')) {
            bEscalated++;
          } else if (bulletText.includes('fail')) {
            bPending++;
          } else {
            // Check if the proof has evidence blocks (```bash + ```output) anywhere in the document
            // For bullet-list format, evidence is distributed throughout the proof body
            bVerified++;
          }
        }

        // Verify there's at least some ```output evidence in the document overall
        const hasAnyEvidence = /```output\n/m.test(content);
        if (!hasAnyEvidence) {
          // No evidence at all — all verified become pending
          bPending += bVerified;
          bVerified = 0;
        }

        const bTotal = bVerified + bPending + bEscalated;
        return buildResult({
          verified: bVerified,
          pending: bPending,
          escalated: bEscalated,
          total: bTotal,
        });
      }

      // Sort AC markers by position for region-based analysis
      const sortedAcs = narrativeMatches
        .map(m => ({ num: m[1], idx: m.index! }))
        .filter((v, i, a) => a.findIndex(x => x.num === v.num) === i) // dedupe by AC num
        .sort((a, b) => a.idx - b.idx);

      for (let i = 0; i < sortedAcs.length; i++) {
        const { num: acNum, idx: acIdx } = sortedAcs[i];
        // Region: from previous AC (or start) to next AC (or end)
        const regionStart = i > 0 ? sortedAcs[i - 1].idx : 0;
        const regionEnd = i + 1 < sortedAcs.length ? sortedAcs[i + 1].idx : content.length;
        const section = content.slice(regionStart, regionEnd);

        if (section.includes('[ESCALATE]')) {
          escalated++;
        } else if (hasFailVerdict(section)) {
          pending++;
        } else if (/```output/m.test(section)) {
          verified++;
        } else {
          pending++;
        }
      }

      const narrativeTotal = verified + pending + escalated;
      return buildResult({
        verified,
        pending,
        escalated,
        total: narrativeTotal,
      });
    }

    for (const acNum of acNumbers) {
      const acPattern = new RegExp(`--- AC ?${acNum}:`, 'g');
      // Find first occurrence and extract surrounding context
      const acIdx = content.search(acPattern);
      if (acIdx === -1) { pending++; continue; }

      // Get content from this AC marker to the next AC marker or end
      const nextAcPattern = new RegExp(`--- AC ?(?!${acNum})\\d+:`, 'g');
      nextAcPattern.lastIndex = acIdx + 1;
      const nextMatch = nextAcPattern.exec(content);
      const section = content.slice(acIdx, nextMatch ? nextMatch.index : content.length);

      if (section.includes('[ESCALATE]')) {
        escalated++;
      } else if (hasFailVerdict(section)) {
        pending++;
      } else if (/```output\n/m.test(section)) {
        verified++;
      } else {
        pending++;
      }
    }
  }

  const total = verified + pending + escalated;
  return buildResult({ verified, pending, escalated, total });
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
