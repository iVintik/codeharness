import { describe, it, expect } from 'vitest';
import { parseObservabilityGaps } from '../parser.js';
import { parseObservabilityGaps as barrelExport } from '../index.js';

// ============================================================
// Module barrel export
// ============================================================

describe('module barrel export', () => {
  it('re-exports parseObservabilityGaps from index.ts', () => {
    expect(barrelExport).toBe(parseObservabilityGaps);
  });
});

// ============================================================
// parseObservabilityGaps
// ============================================================

describe('parseObservabilityGaps', () => {
  it('detects [OBSERVABILITY GAP] tags in proof markdown', () => {
    const proof = `## AC 1: Feature works

\`\`\`bash
docker exec codeharness-verify codeharness --version
\`\`\`

\`\`\`output
codeharness 0.20.0
\`\`\`

## AC 2: Logs are emitted

\`\`\`bash
docker exec codeharness-verify codeharness init
\`\`\`

[OBSERVABILITY GAP] No log events detected for this user interaction

## AC 3: Metrics are collected

\`\`\`bash
docker exec codeharness-verify codeharness coverage
\`\`\`

\`\`\`output
Coverage: 80%
\`\`\`
`;

    const result = parseObservabilityGaps(proof);

    expect(result.totalACs).toBe(3);
    expect(result.gapCount).toBe(1);
    expect(result.coveredCount).toBe(2);
  });

  it('returns correct per-AC gap presence', () => {
    const proof = `## AC 1: First feature

All good here.

## AC 2: Second feature

[OBSERVABILITY GAP] No log events detected for this user interaction

## AC 3: Third feature

[OBSERVABILITY GAP] No log events detected for this user interaction
`;

    const result = parseObservabilityGaps(proof);

    expect(result.entries).toHaveLength(3);
    expect(result.entries[0].acId).toBe('1');
    expect(result.entries[0].hasGap).toBe(false);
    expect(result.entries[0].gapNote).toBeUndefined();

    expect(result.entries[1].acId).toBe('2');
    expect(result.entries[1].hasGap).toBe(true);
    expect(result.entries[1].gapNote).toBe(
      'No log events detected for this user interaction',
    );

    expect(result.entries[2].acId).toBe('3');
    expect(result.entries[2].hasGap).toBe(true);
  });

  it('handles proof with no gaps (all clean)', () => {
    const proof = `## AC 1: Feature A

Evidence here.

## AC 2: Feature B

Evidence here.

## AC 3: Feature C

Evidence here.
`;

    const result = parseObservabilityGaps(proof);

    expect(result.totalACs).toBe(3);
    expect(result.gapCount).toBe(0);
    expect(result.coveredCount).toBe(3);
    expect(result.entries.every(e => !e.hasGap)).toBe(true);
  });

  it('handles proof with all gaps', () => {
    const proof = `## AC 1: Feature A

[OBSERVABILITY GAP] No log events detected for this user interaction

## AC 2: Feature B

[OBSERVABILITY GAP] No log events detected for this user interaction
`;

    const result = parseObservabilityGaps(proof);

    expect(result.totalACs).toBe(2);
    expect(result.gapCount).toBe(2);
    expect(result.coveredCount).toBe(0);
    expect(result.entries.every(e => e.hasGap)).toBe(true);
  });

  it('handles empty proof content', () => {
    const result = parseObservabilityGaps('');

    expect(result.totalACs).toBe(0);
    expect(result.gapCount).toBe(0);
    expect(result.coveredCount).toBe(0);
    expect(result.entries).toHaveLength(0);
  });

  it('handles proof with no AC headings', () => {
    const proof = `# Some proof

This has no AC headings at all.
Just random text.
`;

    const result = parseObservabilityGaps(proof);

    expect(result.totalACs).toBe(0);
    expect(result.gapCount).toBe(0);
    expect(result.coveredCount).toBe(0);
  });

  it('handles case-insensitive AC heading', () => {
    const proof = `## ac 1: lowercase heading

[OBSERVABILITY GAP] No log events detected for this user interaction
`;

    const result = parseObservabilityGaps(proof);

    expect(result.totalACs).toBe(1);
    expect(result.gapCount).toBe(1);
    expect(result.entries[0].acId).toBe('1');
  });

  it('extracts AC number from heading with description', () => {
    const proof = `## AC 42: Complex feature with many parts

All good here.
`;

    const result = parseObservabilityGaps(proof);

    expect(result.entries[0].acId).toBe('42');
  });
});
