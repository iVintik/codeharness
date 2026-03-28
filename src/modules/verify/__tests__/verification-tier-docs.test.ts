import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..', '..', '..');

/**
 * Extract a section from markdown content between a start heading and the next heading at or above
 * the given delimiter level. Throws if the start heading is not found, preventing silent empty-string
 * fallbacks that make assertions vacuous.
 *
 * Uses line-anchored matching so headings in prose don't cause false splits.
 */
function extractSection(content: string, startHeading: string, nextHeadingPrefix: string): string {
  const lines = content.split('\n');
  const startIdx = lines.findIndex((line) => line.trimEnd().startsWith(startHeading));
  if (startIdx === -1) {
    throw new Error(`Section heading "${startHeading}" not found in content`);
  }
  const remaining = lines.slice(startIdx + 1);
  const endIdx = remaining.findIndex((line) => line.startsWith(nextHeadingPrefix));
  const sectionLines = endIdx === -1 ? remaining : remaining.slice(0, endIdx);
  return sectionLines.join('\n');
}

const FOUR_TIERS = ['test-provable', 'runtime-provable', 'environment-provable', 'escalate'] as const;
const LEGACY_TERMS = ['cli-verifiable', 'integration-required', 'unit-testable', 'black-box'] as const;

let knowledgeDoc: string;
let devEnforcement: string;
let reviewEnforcement: string;
let storyVerification: string;

const DOC_PATHS = {
  knowledge: resolve(ROOT, 'knowledge/verification-patterns.md'),
  devEnforcement: resolve(ROOT, 'patches/dev/enforcement.md'),
  reviewEnforcement: resolve(ROOT, 'patches/review/enforcement.md'),
  storyVerification: resolve(ROOT, 'patches/verify/story-verification.md'),
} as const;

beforeAll(() => {
  for (const [key, path] of Object.entries(DOC_PATHS)) {
    if (!existsSync(path)) {
      throw new Error(`Required doc file missing: ${key} at ${path}`);
    }
  }
  knowledgeDoc = readFileSync(DOC_PATHS.knowledge, 'utf-8');
  devEnforcement = readFileSync(DOC_PATHS.devEnforcement, 'utf-8');
  reviewEnforcement = readFileSync(DOC_PATHS.reviewEnforcement, 'utf-8');
  storyVerification = readFileSync(DOC_PATHS.storyVerification, 'utf-8');
});

// ─── AC1: knowledge/verification-patterns.md has Verification Tier Guide ─────

describe('knowledge/verification-patterns.md — Verification Tier Guide (AC1)', () => {
  it('contains a "Verification Tier Guide" section', () => {
    expect(knowledgeDoc).toContain('## Verification Tier Guide');
  });

  it.each(FOUR_TIERS)('lists tier `%s` with criteria and examples', (tier) => {
    expect(knowledgeDoc).toContain(`### \`${tier}\``);
  });

  it('includes decision criteria for each tier', () => {
    expect(knowledgeDoc).toContain('Decision criteria:');
  });

  it('includes examples for each tier', () => {
    expect(knowledgeDoc).toContain('Examples:');
  });
});

// ─── AC2: knowledge/verification-patterns.md has NO legacy tier names ────────

describe('knowledge/verification-patterns.md — no legacy terms (AC2)', () => {
  it.each(LEGACY_TERMS)('does NOT contain legacy term "%s"', (term) => {
    expect(knowledgeDoc).not.toContain(term);
  });
});

// ─── AC3: patches/dev/enforcement.md — renamed section ──────────────────────

describe('patches/dev/enforcement.md — tier-aware language (AC3)', () => {
  it('contains "Verification Tier Awareness" section (renamed from "Black-Box Thinking")', () => {
    expect(devEnforcement).toContain('### Verification Tier Awareness');
  });

  it.each(FOUR_TIERS)('references `%s` development guidance', (tier) => {
    expect(devEnforcement).toContain(`\`${tier}\``);
  });
});

// ─── AC4: patches/dev/enforcement.md has NO black-box ───────────────────────

describe('patches/dev/enforcement.md — no legacy terms (AC4)', () => {
  it('does NOT contain "black-box" as a verification strategy name', () => {
    expect(devEnforcement).not.toContain('black-box');
  });

  it('does NOT contain "Black-Box Thinking" section heading', () => {
    expect(devEnforcement).not.toContain('Black-Box Thinking');
  });

  it.each(LEGACY_TERMS)('does NOT contain legacy term "%s"', (term) => {
    expect(devEnforcement).not.toContain(term);
  });
});

// ─── AC5: patches/review/enforcement.md uses four-tier vocabulary ────────────

describe('patches/review/enforcement.md — four-tier vocabulary (AC5)', () => {
  it.each(FOUR_TIERS)('references tier `%s`', (tier) => {
    expect(reviewEnforcement).toContain(tier);
  });

  it.each(LEGACY_TERMS)('does NOT contain legacy term "%s"', (term) => {
    expect(reviewEnforcement).not.toContain(term);
  });
});

// ─── AC6: patches/review/enforcement.md — tier-appropriate evidence ─────────

describe('patches/review/enforcement.md — tier-appropriate evidence (AC6)', () => {
  it('test-provable stories do NOT require docker exec evidence', () => {
    const testProvableSection = extractSection(reviewEnforcement, '#### `test-provable`', '####');
    expect(testProvableSection).toContain('`docker exec` evidence is NOT required');
  });

  it('runtime-provable stories do NOT require docker exec evidence', () => {
    const runtimeSection = extractSection(reviewEnforcement, '#### `runtime-provable`', '####');
    expect(runtimeSection).toContain('`docker exec` evidence is NOT required');
  });

  it('environment-provable stories require docker exec evidence', () => {
    const envSection = extractSection(reviewEnforcement, '#### `environment-provable`', '####');
    expect(envSection).toContain('docker exec');
  });

  it('escalate stories require human judgment', () => {
    const escalateSection = extractSection(reviewEnforcement, '#### `escalate`', '###');
    expect(escalateSection).toContain('Human judgment');
  });
});

// ─── AC7: patches/verify/story-verification.md — four-tier tags ─────────────

describe('patches/verify/story-verification.md — Verification Tags (AC7)', () => {
  it('contains "Verification Tags" section', () => {
    expect(storyVerification).toContain('### Verification Tags');
  });

  it.each(FOUR_TIERS)('lists `<!-- verification: %s -->` tag', (tier) => {
    expect(storyVerification).toContain(`<!-- verification: ${tier} -->`);
  });

  it('does NOT contain cli-verifiable tag', () => {
    expect(storyVerification).not.toContain('<!-- verification: cli-verifiable -->');
  });

  it('does NOT contain integration-required tag', () => {
    expect(storyVerification).not.toContain('<!-- verification: integration-required -->');
  });
});

// ─── AC8: patches/verify/story-verification.md — tier-dependent evidence ────

describe('patches/verify/story-verification.md — Proof Standard (AC8)', () => {
  const getProofStandard = () =>
    extractSection(storyVerification, '### Proof Standard', '###');

  it('test-provable evidence rule: build+test+grep', () => {
    const section = getProofStandard();
    expect(section).toContain('`test-provable`');
    expect(section).toContain('build + test output');
  });

  it('runtime-provable evidence rule: run binary and check output', () => {
    const section = getProofStandard();
    expect(section).toContain('`runtime-provable`');
    expect(section).toContain('running the actual binary');
  });

  it('environment-provable evidence rule: docker exec', () => {
    const section = getProofStandard();
    expect(section).toContain('`environment-provable`');
    expect(section).toContain('`docker exec`');
  });

  it('escalate evidence rule: human judgment', () => {
    const section = getProofStandard();
    expect(section).toContain('`escalate`');
    expect(section).toContain('Human judgment');
  });
});

// ─── AC9-11: All four files — zero legacy term matches ──────────────────────

describe('All four files — zero legacy term matches (AC9, AC10, AC11)', () => {
  const allFiles = () => [
    { name: 'knowledge/verification-patterns.md', content: knowledgeDoc },
    { name: 'patches/dev/enforcement.md', content: devEnforcement },
    { name: 'patches/review/enforcement.md', content: reviewEnforcement },
    { name: 'patches/verify/story-verification.md', content: storyVerification },
  ];

  it('zero matches for "cli-verifiable" across all four files (AC9)', () => {
    for (const file of allFiles()) {
      expect(file.content, `Found "cli-verifiable" in ${file.name}`).not.toContain('cli-verifiable');
    }
  });

  it('zero matches for "integration-required" across all four files (AC10)', () => {
    for (const file of allFiles()) {
      expect(file.content, `Found "integration-required" in ${file.name}`).not.toContain('integration-required');
    }
  });

  it('zero matches for "unit-testable" across all four files (AC11)', () => {
    for (const file of allFiles()) {
      expect(file.content, `Found "unit-testable" in ${file.name}`).not.toContain('unit-testable');
    }
  });
});

// ─── Preserve non-tier content ──────────────────────────────────────────────

describe('Non-tier content preserved', () => {
  it('dev enforcement still has Architecture Awareness section', () => {
    expect(devEnforcement).toContain('### Architecture Awareness');
  });

  it('dev enforcement still has Observability section', () => {
    expect(devEnforcement).toContain('### Observability');
  });

  it('dev enforcement still has Dockerfile Maintenance section', () => {
    expect(devEnforcement).toContain('### Dockerfile Maintenance');
  });

  it('review enforcement still has Observability section', () => {
    expect(reviewEnforcement).toContain('### Observability');
  });

  it('review enforcement still has Code Quality section', () => {
    expect(reviewEnforcement).toContain('### Code Quality');
  });

  it('story verification still has Observability Evidence section', () => {
    expect(storyVerification).toContain('### Observability Evidence');
  });

  it('Observability Evidence section clarifies it applies to environment-provable stories', () => {
    const section = extractSection(storyVerification, '### Observability Evidence', '###');
    expect(section).toContain('`environment-provable`');
  });

  it('story verification still has Testing Requirements section', () => {
    expect(storyVerification).toContain('### Testing Requirements');
  });
});
