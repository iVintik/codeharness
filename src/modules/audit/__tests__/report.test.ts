import { describe, it, expect } from 'vitest';
import { formatAuditHuman, formatAuditJson } from '../report.js';
import type { AuditResult } from '../types.js';

function makeAuditResult(overrides?: Partial<AuditResult>): AuditResult {
  return {
    dimensions: {
      observability: {
        name: 'observability',
        status: 'pass',
        metric: 'static: 0 gaps, runtime: 100%',
        gaps: [],
      },
      testing: {
        name: 'testing',
        status: 'pass',
        metric: '95%',
        gaps: [],
      },
      documentation: {
        name: 'documentation',
        status: 'pass',
        metric: '5 fresh, 0 stale, 0 missing',
        gaps: [],
      },
      verification: {
        name: 'verification',
        status: 'pass',
        metric: '3/3 verified',
        gaps: [],
      },
      infrastructure: {
        name: 'infrastructure',
        status: 'pass',
        metric: 'Dockerfile valid',
        gaps: [],
      },
    },
    overallStatus: 'pass',
    gapCount: 0,
    durationMs: 150,
    ...overrides,
  };
}

describe('formatAuditHuman', () => {
  it('includes [OK] prefix for passing dimensions', () => {
    const result = makeAuditResult();
    const lines = formatAuditHuman(result);

    expect(lines.some(l => l.startsWith('[OK] observability:'))).toBe(true);
    expect(lines.some(l => l.startsWith('[OK] testing:'))).toBe(true);
  });

  it('includes [FAIL] prefix for failing dimensions', () => {
    const result = makeAuditResult({
      dimensions: {
        ...makeAuditResult().dimensions,
        testing: {
          name: 'testing',
          status: 'fail',
          metric: '30%',
          gaps: [{ dimension: 'testing', description: 'Coverage low', suggestedFix: 'Add tests' }],
        },
      },
      overallStatus: 'fail',
      gapCount: 1,
    });
    const lines = formatAuditHuman(result);

    expect(lines.some(l => l.startsWith('[FAIL] testing:'))).toBe(true);
  });

  it('includes [WARN] prefix for warning dimensions', () => {
    const result = makeAuditResult({
      dimensions: {
        ...makeAuditResult().dimensions,
        observability: {
          name: 'observability',
          status: 'warn',
          metric: 'static: skipped',
          gaps: [],
        },
      },
      overallStatus: 'warn',
    });
    const lines = formatAuditHuman(result);

    expect(lines.some(l => l.startsWith('[WARN] observability:'))).toBe(true);
  });

  it('lists gaps with suggested fixes', () => {
    const result = makeAuditResult({
      dimensions: {
        ...makeAuditResult().dimensions,
        infrastructure: {
          name: 'infrastructure',
          status: 'warn',
          metric: 'Dockerfile exists (1 issue)',
          gaps: [{
            dimension: 'infrastructure',
            description: 'Unpinned base image: node:latest',
            suggestedFix: 'Pin to a specific version',
          }],
        },
      },
      overallStatus: 'warn',
      gapCount: 1,
    });
    const lines = formatAuditHuman(result);

    expect(lines.some(l => l.includes('[WARN] Unpinned base image'))).toBe(true);
    expect(lines.some(l => l.includes('-- fix: Pin to a specific version'))).toBe(true);
  });

  it('includes summary line with gap count and duration', () => {
    const result = makeAuditResult({ gapCount: 3, durationMs: 200 });
    const lines = formatAuditHuman(result);

    const summaryLine = lines.find(l => l.includes('Audit complete'));
    expect(summaryLine).toBeDefined();
    expect(summaryLine).toContain('3 gaps');
    expect(summaryLine).toContain('200ms');
  });

  it('uses singular "gap" for 1 gap', () => {
    const result = makeAuditResult({ gapCount: 1, durationMs: 100 });
    const lines = formatAuditHuman(result);
    const summaryLine = lines.find(l => l.includes('Audit complete'));
    expect(summaryLine).toContain('1 gap found');
  });
});

describe('formatAuditJson', () => {
  it('returns object matching AuditResult structure', () => {
    const result = makeAuditResult();
    const json = formatAuditJson(result);

    expect(json).toHaveProperty('dimensions');
    expect(json).toHaveProperty('overallStatus', 'pass');
    expect(json).toHaveProperty('gapCount', 0);
    expect(json).toHaveProperty('durationMs', 150);
  });

  it('includes all dimension results in JSON', () => {
    const result = makeAuditResult();
    const json = formatAuditJson(result) as { dimensions: Record<string, unknown> };

    expect(Object.keys(json.dimensions)).toHaveLength(5);
    expect(json.dimensions).toHaveProperty('observability');
    expect(json.dimensions).toHaveProperty('testing');
    expect(json.dimensions).toHaveProperty('documentation');
    expect(json.dimensions).toHaveProperty('verification');
    expect(json.dimensions).toHaveProperty('infrastructure');
  });

  it('includes gaps array in each dimension', () => {
    const result = makeAuditResult({
      dimensions: {
        ...makeAuditResult().dimensions,
        testing: {
          name: 'testing',
          status: 'fail',
          metric: '30%',
          gaps: [{ dimension: 'testing', description: 'Low coverage', suggestedFix: 'Add tests' }],
        },
      },
      overallStatus: 'fail',
      gapCount: 1,
    });
    const json = formatAuditJson(result) as {
      dimensions: Record<string, { status: string; metric: string; gaps: unknown[] }>;
    };

    expect(json.dimensions.testing.status).toBe('fail');
    expect(json.dimensions.testing.gaps).toHaveLength(1);
  });
});
