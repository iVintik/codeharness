/**
 * Story file acceptance criteria parser.
 * Reads story markdown files and extracts numbered ACs with type classification.
 */

import { existsSync, readFileSync } from 'node:fs';
import { warn } from '../../lib/output.js';
import type { ParsedAC, Verifiability, VerificationStrategy, VerificationTier, ObservabilityGapResult, ObservabilityGapEntry } from './types.js';
import { LEGACY_TIER_MAP, TIER_HIERARCHY } from './types.js';
import {
  UI_KEYWORDS, API_KEYWORDS, DB_KEYWORDS,
  INTEGRATION_KEYWORDS, ESCALATE_KEYWORDS,
  TEST_PROVABLE_KEYWORDS, RUNTIME_PROVABLE_KEYWORDS,
  ENVIRONMENT_PROVABLE_KEYWORDS, ESCALATE_TIER_KEYWORDS,
} from './parser-keywords.js';

// Re-export for backward compat (INTEGRATION_KEYWORDS was previously exported from parser.ts)
export { INTEGRATION_KEYWORDS } from './parser-keywords.js';

// ─── Verifiability Classification ───────────────────────────────────────────

/**
 * Classifies whether an AC can be verified in a CLI subprocess or requires
 * integration testing. Checks description against integration keywords
 * (case-insensitive). Falls back to 'cli-verifiable'.
 *
 * @deprecated Use `classifyTier()` instead. Will be removed in a future release.
 */
export function classifyVerifiability(description: string): Verifiability {
  const lower = description.toLowerCase();

  for (const kw of INTEGRATION_KEYWORDS) {
    if (lower.includes(kw)) return 'integration-required';
  }

  return 'cli-verifiable';
}

// ─── Verification Strategy ─────────────────────────────────────────────────

/**
 * Determines the best verification strategy for an AC.
 *
 * Docker is the DEFAULT — it's the safest approach because it runs in an
 * isolated container that can't corrupt the host environment.
 *
 * cli-direct is the fallback when Docker is unavailable (checked at runtime).
 * escalate is the last resort for things that truly can't be automated.
 *
 * @deprecated Use `classifyTier()` instead. Will be removed in a future release.
 */
export function classifyStrategy(description: string): VerificationStrategy {
  const lower = description.toLowerCase();

  // Check for true escalation first (very rare)
  for (const kw of ESCALATE_KEYWORDS) {
    if (lower.includes(kw)) return 'escalate';
  }

  // Default: Docker for everything
  return 'docker';
}

// ─── Tier Classification ─────────────────────────────────────────────────────

/**
 * Classifies an AC description into a VerificationTier based on keyword matching.
 * Priority: escalate > environment-provable > runtime-provable > test-provable (default).
 */
export function classifyTier(description: string): VerificationTier {
  const lower = description.toLowerCase();
  // Check highest priority first
  for (const kw of ESCALATE_TIER_KEYWORDS) {
    if (lower.includes(kw)) return 'escalate';
  }
  for (const kw of ENVIRONMENT_PROVABLE_KEYWORDS) {
    if (lower.includes(kw)) return 'environment-provable';
  }
  for (const kw of RUNTIME_PROVABLE_KEYWORDS) {
    if (lower.includes(kw)) return 'runtime-provable';
  }
  // Default: test-provable
  return 'test-provable';
}

// ─── Verification Tag Parsing ───────────────────────────────────────────────

const VERIFICATION_TAG_PATTERN = /<!--\s*verification:\s*(cli-verifiable|integration-required|unit-testable|test-provable|runtime-provable|environment-provable|escalate)\s*-->/;

/**
 * Parses a `<!-- verification: ... -->` HTML comment tag from a string.
 * Accepts both legacy values (cli-verifiable, integration-required) and
 * new VerificationTier values (test-provable, runtime-provable, etc.).
 * Legacy values are mapped to VerificationTier via LEGACY_TIER_MAP.
 * Returns a VerificationTier if found, or null.
 */
export function parseVerificationTag(text: string): VerificationTier | null {
  const match = VERIFICATION_TAG_PATTERN.exec(text);
  if (!match) return null;
  const raw = match[1];
  // Map legacy values to new tiers; validate result is a known tier
  const mapped = LEGACY_TIER_MAP[raw] ?? raw;
  if (!TIER_HIERARCHY.includes(mapped as VerificationTier)) return null;
  return mapped as VerificationTier;
}

// ─── Classification ─────────────────────────────────────────────────────────

/**
 * Classifies an AC description by keywords.
 * Checks UI, API, DB keywords (case-insensitive). Falls back to 'general'.
 */
export function classifyAC(description: string): 'ui' | 'api' | 'db' | 'general' {
  const lower = description.toLowerCase();

  for (const kw of UI_KEYWORDS) {
    if (lower.includes(kw)) return 'ui';
  }
  for (const kw of API_KEYWORDS) {
    if (lower.includes(kw)) return 'api';
  }
  for (const kw of DB_KEYWORDS) {
    if (lower.includes(kw)) return 'db';
  }

  return 'general';
}

// ─── Parser ─────────────────────────────────────────────────────────────────

/**
 * Reads a story markdown file and extracts numbered acceptance criteria.
 * Finds the `## Acceptance Criteria` section, then parses numbered items.
 *
 * @throws Error if file not found (with actionable message)
 * @returns ParsedAC[] — empty array if no AC section found (with warning)
 */
export function parseStoryACs(storyFilePath: string): ParsedAC[] {
  if (!existsSync(storyFilePath)) {
    throw new Error(
      `Story file not found: ${storyFilePath}. Ensure the story file exists at the expected path.`,
    );
  }

  const content = readFileSync(storyFilePath, 'utf-8');
  const lines = content.split('\n');

  // Find the AC section
  let acSectionStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Acceptance\s+Criteria/i.test(lines[i])) {
      acSectionStart = i + 1;
      break;
    }
  }

  if (acSectionStart === -1) {
    warn('No "## Acceptance Criteria" section found in story file');
    return [];
  }

  // Find section end (next ## heading or end of file)
  let acSectionEnd = lines.length;
  for (let i = acSectionStart; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i]) && i !== acSectionStart - 1) {
      acSectionEnd = i;
      break;
    }
  }

  const acSection = lines.slice(acSectionStart, acSectionEnd).join('\n');

  // Parse numbered ACs
  const acPattern = /^\s*(\d+)\.\s+/;
  const acs: ParsedAC[] = [];
  const acLines = acSection.split('\n');

  let currentId: string | null = null;
  let currentDesc: string[] = [];

  const flushCurrent = (): void => {
    if (currentId !== null && currentDesc.length > 0) {
      const description = currentDesc.join(' ').trim();
      if (description) {
        const tag = parseVerificationTag(description);
        const tier: VerificationTier = tag ?? classifyTier(description);
        const verifiability = classifyVerifiability(description); // deprecated, kept for compat
        const strategy = classifyStrategy(description); // deprecated, kept for compat
        acs.push({
          id: currentId,
          description,
          type: classifyAC(description),
          verifiability,
          strategy,
          tier,
        });
      } else {
        warn(`Skipping malformed AC #${currentId}: empty description`);
      }
    }
  };

  for (const line of acLines) {
    const match = acPattern.exec(line);
    if (match) {
      flushCurrent();
      currentId = match[1];
      currentDesc = [line.replace(acPattern, '').trim()];
    } else if (currentId !== null && line.trim()) {
      currentDesc.push(line.trim());
    }
  }

  // Flush last AC
  flushCurrent();

  return acs;
}

// ─── Observability Gap Parser ────────────────────────────────────────────

const AC_HEADING_PATTERN = /^##\s+AC\s+(\d+)/i;
const OBSERVABILITY_GAP_TAG = '[OBSERVABILITY GAP]';

/**
 * Parses proof content for `[OBSERVABILITY GAP]` tags.
 * Scans each AC section (delimited by `## AC N:` headings) for the gap tag.
 *
 * @param proofContent - Raw markdown content of the proof document
 * @returns Per-AC gap presence and aggregate counts
 */
export function parseObservabilityGaps(proofContent: string): ObservabilityGapResult {
  const lines = proofContent.split('\n');
  const entries: ObservabilityGapEntry[] = [];

  let currentAcId: string | null = null;
  let currentSectionLines: string[] = [];

  const flushSection = (): void => {
    if (currentAcId !== null) {
      const sectionText = currentSectionLines.join('\n');
      const hasGap = sectionText.includes(OBSERVABILITY_GAP_TAG);
      const gapNote = hasGap
        ? 'No log events detected for this user interaction'
        : undefined;
      entries.push({ acId: currentAcId, hasGap, gapNote });
    }
  };

  for (const line of lines) {
    const match = AC_HEADING_PATTERN.exec(line);
    if (match) {
      flushSection();
      currentAcId = match[1];
      currentSectionLines = [line];
    } else if (currentAcId !== null) {
      currentSectionLines.push(line);
    }
  }

  // Flush last section
  flushSection();

  const totalACs = entries.length;
  const gapCount = entries.filter(e => e.hasGap).length;
  const coveredCount = totalACs - gapCount;

  return { entries, totalACs, gapCount, coveredCount };
}
