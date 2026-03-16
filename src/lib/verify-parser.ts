/**
 * Story file acceptance criteria parser.
 * Reads story markdown files and extracts numbered ACs with type classification.
 */

import { existsSync, readFileSync } from 'node:fs';
import { warn } from './output.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type Verifiability = 'cli-verifiable' | 'integration-required';

export interface ParsedAC {
  id: string;
  description: string;
  type: 'ui' | 'api' | 'db' | 'general';
  verifiability: Verifiability;
}

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
  'sprint planning',
  'workflow',
  'run /command',
  'user session',
  'multi-step',
  'external system',
  'real infrastructure',
  'integration test',
  'manual verification',
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

  // Parse numbered ACs: lines starting with a number followed by a period
  // ACs may span multiple lines — collect until the next numbered item or section end
  const acPattern = /^\s*(\d+)\.\s+/;
  const acs: ParsedAC[] = [];
  const acLines = acSection.split('\n');

  let currentId: string | null = null;
  let currentDesc: string[] = [];

  const flushCurrent = (): void => {
    if (currentId !== null && currentDesc.length > 0) {
      const description = currentDesc.join(' ').trim();
      if (description) {
        // Check for explicit verification tag (authoritative), fall back to heuristic
        const tag = parseVerificationTag(description);
        const verifiability = tag ?? classifyVerifiability(description);
        acs.push({
          id: currentId,
          description,
          type: classifyAC(description),
          verifiability,
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
      // Continuation line for current AC
      currentDesc.push(line.trim());
    }
  }

  // Flush last AC
  flushCurrent();

  return acs;
}
