/**
 * Types for the verify module.
 * Merged from src/lib/verify.ts and src/lib/verify-parser.ts.
 */

import type { AcResult } from '../../types/state.js';

// ─── Parser Types ────────────────────────────────────────────────────────────

export type Verifiability = 'cli-verifiable' | 'integration-required';

/**
 * Verification strategy — how the verifier should approach proving an AC.
 *
 * - docker:    Run in a Docker container (default, safest)
 * - cli-direct: Run CLI commands in the current subprocess (fallback)
 * - escalate:   Truly impossible — requires physical hardware, external paid
 *               service, or human judgement. Last resort only.
 */
export type VerificationStrategy = 'docker' | 'cli-direct' | 'escalate';

export interface ParsedAC {
  readonly id: string;
  readonly description: string;
  readonly type: 'ui' | 'api' | 'db' | 'general';
  readonly verifiability: Verifiability;
  readonly strategy: VerificationStrategy;
}

// ─── Proof Quality Types ─────────────────────────────────────────────────────

export interface ProofQuality {
  readonly verified: number;
  readonly pending: number;
  readonly escalated: number;
  readonly total: number;
  readonly passed: boolean;
  /** Count of `grep ... src/` commands in evidence (black-box metric) */
  readonly grepSrcCount: number;
  /** Count of `docker exec` commands in evidence (black-box metric) */
  readonly dockerExecCount: number;
  /** Count of observability query commands in evidence (black-box metric) */
  readonly observabilityCount: number;
  /** Count of other commands in evidence (black-box metric) */
  readonly otherCount: number;
  /** Whether the proof passes black-box enforcement checks */
  readonly blackBoxPass: boolean;
}

export type EvidenceCommandType =
  | 'docker-exec'
  | 'docker-host'
  | 'observability'
  | 'grep-src'
  | 'other';

export interface ClassifiedCommand {
  readonly command: string;
  readonly type: EvidenceCommandType;
}

// ─── Orchestrator Types ──────────────────────────────────────────────────────

export interface VerifyResult {
  readonly storyId: string;
  readonly success: boolean;
  readonly totalACs: number;
  readonly verifiedCount: number;
  readonly failedCount: number;
  readonly escalatedCount: number;
  readonly proofPath: string;
  readonly showboatVerifyStatus: 'pass' | 'fail' | 'skipped';
  /** Number of ACs with observability gaps (Story 2.1) */
  readonly observabilityGapCount: number;
  /** Runtime coverage percentage: ACs with logs / total ACs * 100 (Story 2.1) */
  readonly runtimeCoveragePercent: number;
  readonly perAC: ReadonlyArray<{
    readonly id: string;
    readonly description: string;
    readonly verified: boolean;
    readonly evidencePaths: readonly string[];
  }>;
}

export interface PreconditionResult {
  readonly passed: boolean;
  readonly failures: readonly string[];
}

export interface ShowboatVerifyResult {
  readonly passed: boolean;
  readonly output: string;
}

// ─── Observability Gap Types ─────────────────────────────────────────────

/** Per-AC observability gap presence */
export interface ObservabilityGapEntry {
  /** Acceptance criterion identifier */
  readonly acId: string;
  /** Whether an observability gap was detected */
  readonly hasGap: boolean;
  /** The gap note text, if present */
  readonly gapNote?: string;
}

/** Result of parsing observability gaps from proof content */
export interface ObservabilityGapResult {
  /** Per-AC gap presence */
  readonly entries: readonly ObservabilityGapEntry[];
  /** Total number of ACs found in proof */
  readonly totalACs: number;
  /** Number of ACs with observability gaps */
  readonly gapCount: number;
  /** Number of ACs without gaps (produced log events) */
  readonly coveredCount: number;
}

// ─── Env Types ───────────────────────────────────────────────────────────────

/** Project type for verification strategy selection. */
export type ProjectType = 'nodejs' | 'python' | 'plugin' | 'generic';

export interface BuildOptions {
  readonly projectDir?: string;
}

export interface BuildResult {
  readonly imageTag: string;
  readonly imageSize: string;
  readonly buildTimeMs: number;
  readonly cached: boolean;
}

export interface CheckResult {
  readonly imageExists: boolean;
  readonly cliWorks: boolean;
  readonly otelReachable: boolean;
}

// ─── Browser Verifier Types ──────────────────────────────────────────────────

export interface BrowserActionResult {
  readonly output: string;
  readonly screenshotPath?: string;
  readonly exitCode: number;
}

export interface DiffResult {
  readonly hasDifferences: boolean;
  readonly beforePath: string;
  readonly afterPath: string;
}

// ─── Black-Box Enforcement Result ────────────────────────────────────────────

export interface BlackBoxEnforcementResult {
  readonly blackBoxPass: boolean;
  readonly grepSrcCount: number;
  readonly dockerExecCount: number;
  readonly observabilityCount: number;
  readonly otherCount: number;
  readonly grepRatio: number;
  readonly acsMissingDockerExec: readonly number[];
}
