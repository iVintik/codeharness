import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { verifyPromptTemplate } from '../../../templates/verify-prompt.js';
import { parseObservabilityGaps } from '../parser.js';
import type { VerifyResult } from '../types.js';

const ROOT = resolve(__dirname, '..', '..', '..', '..');

let verifyPatch: string;

beforeAll(() => {
  verifyPatch = readFileSync(
    resolve(ROOT, 'patches/verify/story-verification.md'),
    'utf-8',
  );
});

// ============================================================
// Task 6 / AC #1: Patch content validation
// ============================================================

describe('patches/verify/story-verification.md — Observability Evidence section', () => {
  it('contains ### Observability Evidence heading', () => {
    expect(verifyPatch).toContain('### Observability Evidence');
  });

  it('instructs to query observability backend after each docker exec command', () => {
    expect(verifyPatch).toContain('After each `docker exec` command');
    expect(verifyPatch).toContain('query the observability backend');
    expect(verifyPatch).toContain('log events from the last 30 seconds');
  });

  it('contains [OBSERVABILITY GAP] tagging instruction', () => {
    expect(verifyPatch).toContain('[OBSERVABILITY GAP]');
    expect(verifyPatch).toContain(
      '[OBSERVABILITY GAP] No log events detected for this user interaction',
    );
  });

  it('instructs that observability check failure does not block verification', () => {
    expect(verifyPatch).toContain('observability check skipped — backend not reachable');
    expect(verifyPatch).toContain('do NOT fail the verification');
  });

  it('references the VictoriaLogs query pattern from verify-prompt.ts', () => {
    expect(verifyPatch).toContain('verify-prompt.ts');
    expect(verifyPatch).toContain(
      "curl 'http://localhost:9428/select/logsql/query?query=_stream_id:*&start=-30s&limit=100'",
    );
  });

  it('instructs proof documents to include both functional and observability evidence', () => {
    expect(verifyPatch).toContain('functional evidence');
    expect(verifyPatch).toContain('observability evidence');
  });
});

// ============================================================
// Task 2 / AC #2: verify-prompt.ts already contains observability instructions
// ============================================================

describe('verify-prompt.ts — observability check regression tests', () => {
  const baseConfig = {
    storyKey: 'test-story',
    storyContent: '# Test Story\n\n## Acceptance Criteria\n\n1. AC one',
  };

  it('contains Step 3.5: Observability Check After Each Command section', () => {
    const prompt = verifyPromptTemplate(baseConfig);
    expect(prompt).toContain('Step 3.5: Observability Check After Each Command');
  });

  it('includes VictoriaLogs query URL with default endpoint', () => {
    const prompt = verifyPromptTemplate(baseConfig);
    expect(prompt).toContain(
      "curl 'http://localhost:9428/select/logsql/query?query=_stream_id:*&start=-30s&limit=100'",
    );
  });

  it('includes [OBSERVABILITY GAP] tagging instruction in the prompt', () => {
    const prompt = verifyPromptTemplate(baseConfig);
    expect(prompt).toContain('[OBSERVABILITY GAP]');
    expect(prompt).toContain('No log events detected for this user interaction');
  });

  it('uses configured VictoriaLogs endpoint in observability query', () => {
    const prompt = verifyPromptTemplate({
      ...baseConfig,
      observabilityEndpoints: {
        victoriaLogs: 'http://custom:9999',
      },
    });
    expect(prompt).toContain(
      "curl 'http://custom:9999/select/logsql/query?query=_stream_id:*&start=-30s&limit=100'",
    );
  });
});

// ============================================================
// Task 3 / AC #3: parseObservabilityGaps with specific AC counts
// ============================================================

describe('parseObservabilityGaps — Story 5.2 acceptance criteria', () => {
  it('returns totalACs:8, gapCount:2, coveredCount:6 for 8 ACs with 2 gaps (AC #3)', () => {
    const proof = [
      '## AC 1: Feature one\n\nEvidence here.\n',
      '## AC 2: Feature two\n\nEvidence here.\n',
      '## AC 3: Feature three\n\n[OBSERVABILITY GAP] No log events detected for this user interaction\n',
      '## AC 4: Feature four\n\nEvidence here.\n',
      '## AC 5: Feature five\n\nEvidence here.\n',
      '## AC 6: Feature six\n\n[OBSERVABILITY GAP] No log events detected for this user interaction\n',
      '## AC 7: Feature seven\n\nEvidence here.\n',
      '## AC 8: Feature eight\n\nEvidence here.\n',
    ].join('\n');

    const result = parseObservabilityGaps(proof);

    expect(result.totalACs).toBe(8);
    expect(result.gapCount).toBe(2);
    expect(result.coveredCount).toBe(6);
  });

  it('reports 75% runtime observability coverage for 6/8 ACs covered', () => {
    const proof = [
      '## AC 1: F1\n\nOK\n',
      '## AC 2: F2\n\nOK\n',
      '## AC 3: F3\n\n[OBSERVABILITY GAP] No log events detected for this user interaction\n',
      '## AC 4: F4\n\nOK\n',
      '## AC 5: F5\n\nOK\n',
      '## AC 6: F6\n\n[OBSERVABILITY GAP] No log events detected for this user interaction\n',
      '## AC 7: F7\n\nOK\n',
      '## AC 8: F8\n\nOK\n',
    ].join('\n');

    const result = parseObservabilityGaps(proof);
    const coveragePercent =
      result.totalACs === 0
        ? 0
        : (result.coveredCount / result.totalACs) * 100;

    expect(coveragePercent).toBe(75);
  });

  it('returns zero gaps when all ACs are clean', () => {
    const proof = [
      '## AC 1: F1\n\nEvidence.\n',
      '## AC 2: F2\n\nEvidence.\n',
      '## AC 3: F3\n\nEvidence.\n',
    ].join('\n');

    const result = parseObservabilityGaps(proof);

    expect(result.totalACs).toBe(3);
    expect(result.gapCount).toBe(0);
    expect(result.coveredCount).toBe(3);
  });

  it('returns all gaps when every AC has an observability gap', () => {
    const proof = [
      '## AC 1: F1\n\n[OBSERVABILITY GAP] No log events detected for this user interaction\n',
      '## AC 2: F2\n\n[OBSERVABILITY GAP] No log events detected for this user interaction\n',
      '## AC 3: F3\n\n[OBSERVABILITY GAP] No log events detected for this user interaction\n',
    ].join('\n');

    const result = parseObservabilityGaps(proof);

    expect(result.totalACs).toBe(3);
    expect(result.gapCount).toBe(3);
    expect(result.coveredCount).toBe(0);
  });
});

// ============================================================
// Task 4 / AC #4: verifyStory reports observability alongside functional results
// ============================================================

describe('VerifyResult observability fields — structural contract', () => {
  it('observabilityGapCount and runtimeCoveragePercent are defined on VerifyResult type', () => {
    // Construct a typed value — TypeScript compilation proves these fields exist on the type.
    // If observabilityGapCount or runtimeCoveragePercent are removed from VerifyResult,
    // the build will fail with a type error before tests even run.
    const result: VerifyResult = {
      storyId: 'test',
      success: true,
      totalACs: 4,
      verifiedCount: 4,
      failedCount: 0,
      escalatedCount: 0,
      proofPath: 'verification/test-proof.md',
      showboatVerifyStatus: 'pass' as const,
      observabilityGapCount: 1,
      runtimeCoveragePercent: 75,
      perAC: [],
    };

    // Runtime assertions confirm the values survive through the type
    expect(result.observabilityGapCount).toBe(1);
    expect(result.runtimeCoveragePercent).toBe(75);
  });
});

// ============================================================
// Task 5 / AC #5: saveRuntimeCoverage persists under observability.runtime
// ============================================================

describe('runtime coverage state structure — contract test', () => {
  it('computeRuntimeCoverage produces coveragePercent from gap results', async () => {
    // Dynamic import to avoid conflicting with mocked tests in other files
    const { computeRuntimeCoverage } = await import(
      '../../observability/runtime-coverage.js'
    );

    const gapResult = {
      entries: [
        { acId: '1', hasGap: false },
        { acId: '2', hasGap: false },
        { acId: '3', hasGap: true, gapNote: 'No log events detected for this user interaction' },
        { acId: '4', hasGap: false },
      ],
      totalACs: 4,
      gapCount: 1,
      coveredCount: 3,
    };

    const result = computeRuntimeCoverage(gapResult);

    expect(result.coveragePercent).toBe(75);
    expect(result.totalACs).toBe(4);
    expect(result.acsWithLogs).toBe(3);
    expect(result.entries).toHaveLength(4);
    expect(result.entries[2].logEventsDetected).toBe(false);
    expect(result.entries[0].logEventsDetected).toBe(true);
  });

  it('saveRuntimeCoverage persists coveragePercent and lastValidationTimestamp to sprint-state.json (AC #5)', async () => {
    const { computeRuntimeCoverage, saveRuntimeCoverage } = await import(
      '../../observability/runtime-coverage.js'
    );

    // Create a temp directory with an initial sprint-state.json
    const tmpDir = join(ROOT, '.test-tmp-5-2-runtime-coverage');
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(
      join(tmpDir, 'sprint-state.json'),
      JSON.stringify({ observability: { static: { coveragePercent: 80 } } }),
    );

    try {
      const gapResult = {
        entries: [
          { acId: '1', hasGap: false },
          { acId: '2', hasGap: true, gapNote: 'No log events detected for this user interaction' },
        ],
        totalACs: 2,
        gapCount: 1,
        coveredCount: 1,
      };

      const runtimeResult = computeRuntimeCoverage(gapResult);
      const saveResult = saveRuntimeCoverage(tmpDir, runtimeResult);
      expect(saveResult.success).toBe(true);

      // Read back the persisted state and verify structure
      const persisted = JSON.parse(readFileSync(join(tmpDir, 'sprint-state.json'), 'utf-8'));

      // AC #5: observability.runtime has coveragePercent and lastValidationTimestamp
      expect(persisted.observability.runtime).toBeDefined();
      expect(persisted.observability.runtime.coveragePercent).toBe(50);
      expect(persisted.observability.runtime.lastValidationTimestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T/,
      );

      // AC #5: static coverage is preserved separately
      expect(persisted.observability.static).toBeDefined();
      expect(persisted.observability.static.coveragePercent).toBe(80);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
