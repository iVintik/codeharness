/**
 * Story file acceptance criteria parser.
 * Reads story markdown files and extracts numbered ACs with type classification.
 */

import { existsSync, readFileSync } from 'node:fs';
import { warn } from '../../lib/output.js';
import type { ParsedAC, Verifiability, VerificationStrategy } from './types.js';

// ─── Keywords for Classification ────────────────────────────────────────────

const UI_KEYWORDS = [
  'agent-browser',
  'screenshot',
  'navigate',
  'click',
  'form',
  'ui verification',
  'ui acceptance',
];

const API_KEYWORDS = [
  'http',
  'api',
  'endpoint',
  'curl',
  'rest',
  'response bod',
];

const DB_KEYWORDS = [
  'database',
  'db state',
  'db mcp',
  'query',
  'sql',
  'table',
];

// ─── Integration Keywords ───────────────────────────────────────────────────

export const INTEGRATION_KEYWORDS = [
  'external system',
  'real infrastructure',
  'manual verification',
];

// Keywords that indicate true escalation (cannot be automated at all)
const ESCALATE_KEYWORDS = [
  'physical hardware',
  'manual human',
  'visual inspection by human',
  'paid external service',
];

// ─── Verifiability Classification ───────────────────────────────────────────

/**
 * Classifies whether an AC can be verified in a CLI subprocess or requires
 * integration testing. Checks description against integration keywords
 * (case-insensitive). Falls back to 'cli-verifiable'.
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

// ─── Verification Tag Parsing ───────────────────────────────────────────────

const VERIFICATION_TAG_PATTERN = /<!--\s*verification:\s*(cli-verifiable|integration-required)\s*-->/;

/**
 * Parses a `<!-- verification: cli-verifiable|integration-required -->` HTML
 * comment tag from a string. Returns the tag value if found, or null.
 */
export function parseVerificationTag(text: string): Verifiability | null {
  const match = VERIFICATION_TAG_PATTERN.exec(text);
  return match ? (match[1] as Verifiability) : null;
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
        const verifiability = tag ?? classifyVerifiability(description);
        const strategy = classifyStrategy(description);
        acs.push({
          id: currentId,
          description,
          type: classifyAC(description),
          verifiability,
          strategy,
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
