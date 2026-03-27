/**
 * Verify module — story verification and proof parsing.
 * Public interface: only this file should be imported from outside the module.
 */

import { readFileSync } from 'node:fs';
import { ok, fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import { validateProofQuality } from './proof.js';
import {
  checkPreconditions as checkPreconditionsImpl,
  createProofDocument as createProofDocumentImpl,
  runShowboatVerify as runShowboatVerifyImpl,
  updateVerificationState as updateVerificationStateImpl,
  closeBeadsIssue as closeBeadsIssueImpl,
} from './orchestrator.js';
import { parseStoryACs as parseStoryACsImpl, parseObservabilityGaps as parseObservabilityGapsImpl } from './parser.js';
import { computeRuntimeCoverage as computeRuntimeCoverageImpl, saveRuntimeCoverage as saveRuntimeCoverageImpl } from '../observability/index.js';
import type { VerifyResult, ProofQuality, ObservabilityGapResult } from './types.js';

// Re-export all public types
export type {
  VerifyResult,
  ProofQuality,
  ObservabilityGapResult,
  ObservabilityGapEntry,
  ParsedAC,
  Verifiability,
  VerificationTier,
  VerificationStrategy,
  ProjectType,
  PreconditionResult,
  ShowboatVerifyResult,
  ClassifiedCommand,
  EvidenceCommandType,
  BlackBoxEnforcementResult,
  BrowserActionResult,
  DiffResult,
  BuildOptions,
  BuildResult,
  CheckResult,
} from './types.js';

export { TIER_HIERARCHY, maxTier, LEGACY_TIER_MAP } from './types.js';

// Re-export browser verifier
export { BrowserVerifier } from './browser.js';

// Re-export orchestrator functions
export {
  checkPreconditions,
  createProofDocument,
  runShowboatVerify,
  updateVerificationState,
  closeBeadsIssue,
} from './orchestrator.js';

// Re-export parser functions
export {
  parseStoryACs,
  classifyAC,
  classifyVerifiability,
  classifyStrategy,
  classifyTier,
  parseVerificationTag,
  parseObservabilityGaps,
  INTEGRATION_KEYWORDS,
} from './parser.js';

// Re-export proof functions
export {
  validateProofQuality,
  proofHasContent,
  classifyEvidenceCommands,
  checkBlackBoxEnforcement,
} from './proof.js';

// Re-export validation AC registry
export {
  VALIDATION_ACS,
  FR_ACS,
  NFR_ACS,
  UX_ACS,
  REGRESSION_ACS,
  ACTION_ITEM_ACS,
  getACsByCategory,
  getTestProvableACs,
  getEnvironmentProvableACs,
  getCliVerifiableACs,
  getIntegrationRequiredACs,
  getACById,
} from './validation-acs.js';
export type { ValidationAC, VerificationMethod, AcCategory } from './validation-acs.js';

// Re-export validation runner functions and types
export {
  createValidationSprint,
  executeValidationAC,
  createFixStory,
  processValidationResult,
} from './validation-runner.js';
export {
  getValidationProgress,
  runValidationCycle,
} from './validation-orchestrator.js';
export type {
  ValidationACResult,
  ValidationSprintResult,
  ValidationCycleResult,
  ValidationProgress,
  ValidationVerdict,
} from './validation-runner-types.js';

// Re-export env functions
export {
  buildVerifyImage,
  detectProjectType,
  prepareVerifyWorkspace,
  checkVerifyEnv,
  cleanupVerifyEnv,
  cleanupStaleContainers,
  isValidStoryKey,
  computeDistHash,
} from './env.js';

/**
 * Verify a story by running the full verification pipeline.
 * Returns Result<VerifyResult> — never throws.
 */
export function verifyStory(key: string): Result<VerifyResult> {
  try {
    const preconditions = checkPreconditionsImpl(undefined, key);
    if (!preconditions.passed) {
      return fail(`Preconditions not met: ${preconditions.failures.join('; ')}`);
    }

    const storyDir = '_bmad-output/implementation-artifacts';
    const storyFilePath = `${storyDir}/${key}.md`;
    const acs = parseStoryACsImpl(storyFilePath);
    const proofPath = `verification/${key}-proof.md`;
    const quality = validateProofQuality(proofPath);

    if (!quality.passed) {
      return fail(
        `Proof quality check failed: ${quality.verified}/${quality.total} ACs verified`,
      );
    }

    const showboatResult = runShowboatVerifyImpl(proofPath);
    let showboatStatus: 'pass' | 'fail' | 'skipped' = 'skipped';
    if (showboatResult.output !== 'showboat not available') {
      showboatStatus = showboatResult.passed ? 'pass' : 'fail';
    }

    // Parse observability gaps from proof content (Story 2.1)
    let observabilityGapCount = 0;
    let runtimeCoveragePercent = 0;
    try {
      const proofContent = readFileSync(proofPath, 'utf-8');
      const gapResult = parseObservabilityGapsImpl(proofContent);
      observabilityGapCount = gapResult.gapCount;
      runtimeCoveragePercent =
        gapResult.totalACs === 0
          ? 0
          : (gapResult.coveredCount / gapResult.totalACs) * 100;

      // Persist runtime coverage to sprint-state.json (Story 2.1 AC #4)
      if (gapResult.totalACs > 0) {
        const runtimeResult = computeRuntimeCoverageImpl(gapResult);
        saveRuntimeCoverageImpl('.', runtimeResult);
      }
    } catch {
      // IGNORE: proof file may not exist yet or be unreadable, proceed with defaults
    }

    const result: VerifyResult = {
      storyId: key,
      success: true,
      totalACs: quality.total,
      verifiedCount: quality.verified,
      failedCount: quality.pending,
      escalatedCount: quality.escalated,
      proofPath,
      showboatVerifyStatus: showboatStatus,
      observabilityGapCount,
      runtimeCoveragePercent,
      perAC: acs.map(ac => ({
        id: ac.id,
        description: ac.description,
        verified: true,
        evidencePaths: [],
      })),
    };

    updateVerificationStateImpl(key, result);
    closeBeadsIssueImpl(key);

    return ok(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(message);
  }
}

/**
 * Parse a proof document and return quality metrics.
 * Returns Result<ProofQuality> — never throws.
 */
export function parseProof(path: string): Result<ProofQuality> {
  try {
    const quality = validateProofQuality(path);
    return ok(quality);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(message);
  }
}
