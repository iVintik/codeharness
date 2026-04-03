import { describe, it, expect } from 'vitest';
import {
  parseVerdict,
  validateVerdict,
  VerdictParseError,
} from '../verdict-parser.js';
import type { EvaluatorVerdict, VerdictValidationResult } from '../verdict-parser.js';

// --- Fixtures ---

function makeValidVerdict(overrides?: Partial<EvaluatorVerdict>): EvaluatorVerdict {
  return {
    verdict: 'pass',
    score: { passed: 2, failed: 0, unknown: 0, total: 2 },
    findings: [
      {
        ac: 1,
        description: 'Server starts on port 3000',
        status: 'pass',
        evidence: {
          commands_run: ['curl http://localhost:3000'],
          output_observed: 'HTTP 200 OK',
          reasoning: 'Server responded with 200',
        },
      },
      {
        ac: 2,
        description: 'Database migrated',
        status: 'pass',
        evidence: {
          commands_run: ['npm run migrate:status'],
          output_observed: 'All migrations applied',
          reasoning: 'Migration status confirmed',
        },
      },
    ],
    ...overrides,
  };
}

function makeValidVerdictJSON(overrides?: Partial<EvaluatorVerdict>): string {
  return JSON.stringify(makeValidVerdict(overrides));
}

// --- Schema Validation Tests ---

describe('validateVerdict', () => {
  it('validates a correct verdict object', () => {
    const result = validateVerdict(makeValidVerdict());
    expect(result.valid).toBe(true);
    expect(result.verdict).toBeDefined();
    expect(result.errors).toBeUndefined();
  });

  it('rejects missing verdict field', () => {
    const data = { score: { passed: 0, failed: 0, unknown: 0, total: 0 }, findings: [] };
    const result = validateVerdict(data);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.some((e) => e.includes('verdict'))).toBe(true);
  });

  it('rejects invalid verdict enum value', () => {
    const data = makeValidVerdict();
    (data as Record<string, unknown>).verdict = 'maybe';
    const result = validateVerdict(data);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.some((e) => e.includes('verdict'))).toBe(true);
  });

  it('rejects missing score field', () => {
    const data = { verdict: 'pass', findings: [] };
    const result = validateVerdict(data);
    expect(result.valid).toBe(false);
    expect(result.errors!.some((e) => e.includes('score'))).toBe(true);
  });

  it('rejects missing findings field', () => {
    const data = { verdict: 'pass', score: { passed: 0, failed: 0, unknown: 0, total: 0 } };
    const result = validateVerdict(data);
    expect(result.valid).toBe(false);
    expect(result.errors!.some((e) => e.includes('findings'))).toBe(true);
  });

  it('rejects non-integer score values', () => {
    const data = makeValidVerdict();
    (data.score as Record<string, unknown>).passed = 'one';
    const result = validateVerdict(data);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it('rejects negative score values', () => {
    const data = makeValidVerdict();
    data.score.passed = -1;
    const result = validateVerdict(data);
    expect(result.valid).toBe(false);
  });

  it('rejects invalid finding status enum', () => {
    const data = makeValidVerdict();
    (data.findings[0] as Record<string, unknown>).status = 'partial';
    const result = validateVerdict(data);
    expect(result.valid).toBe(false);
    expect(result.errors!.some((e) => e.includes('status'))).toBe(true);
  });

  it('rejects missing evidence in finding', () => {
    const data = makeValidVerdict();
    delete (data.findings[0] as Record<string, unknown>).evidence;
    const result = validateVerdict(data);
    expect(result.valid).toBe(false);
  });

  it('rejects non-string commands_run items', () => {
    const data = makeValidVerdict();
    (data.findings[0].evidence.commands_run as unknown[]) = [42];
    const result = validateVerdict(data);
    expect(result.valid).toBe(false);
  });

  it('accepts optional evaluator_trace_id', () => {
    const data = makeValidVerdict();
    data.evaluator_trace_id = 'trace-abc-123';
    const result = validateVerdict(data);
    expect(result.valid).toBe(true);
    expect(result.verdict!.evaluator_trace_id).toBe('trace-abc-123');
  });

  it('accepts optional duration_seconds', () => {
    const data = makeValidVerdict();
    data.duration_seconds = 12.5;
    const result = validateVerdict(data);
    expect(result.valid).toBe(true);
    expect(result.verdict!.duration_seconds).toBe(12.5);
  });

  it('returns specific error messages for each violation', () => {
    // Multiple violations at once
    const data = { verdict: 'maybe', score: { passed: 'x' }, findings: 'not-array' };
    const result = validateVerdict(data);
    expect(result.valid).toBe(false);
    expect(result.errors!.length).toBeGreaterThan(1);
  });

  it('returns a deep copy (mutating result does not affect input)', () => {
    const data = makeValidVerdict();
    const result = validateVerdict(data);
    expect(result.valid).toBe(true);
    // Mutate the returned verdict
    result.verdict!.findings[0].status = 'fail';
    // Original should be unaffected
    expect(data.findings[0].status).toBe('pass');
  });

  it('includes instance path in error messages for nested violations', () => {
    const data = makeValidVerdict();
    // Break a nested field to get a non-root instancePath
    (data.findings[0].evidence as Record<string, unknown>).commands_run = 'not-an-array';
    const result = validateVerdict(data);
    expect(result.valid).toBe(false);
    // Error should reference the nested path, not just '/'
    expect(result.errors!.some((e) => e.includes('/findings'))).toBe(true);
  });

  it('tolerates extra fields in score object', () => {
    const data = makeValidVerdict();
    (data.score as Record<string, unknown>).bonus = 42;
    const result = validateVerdict(data);
    expect(result.valid).toBe(true);
  });

  it('tolerates extra fields in evidence object', () => {
    const data = makeValidVerdict();
    (data.findings[0].evidence as Record<string, unknown>).confidence = 0.95;
    const result = validateVerdict(data);
    expect(result.valid).toBe(true);
  });
});

// --- parseVerdict Tests ---

describe('parseVerdict', () => {
  it('parses valid verdict JSON and returns typed object', () => {
    const verdict = parseVerdict(makeValidVerdictJSON());
    expect(verdict.verdict).toBe('pass');
    expect(verdict.score.passed).toBe(2);
    expect(verdict.score.failed).toBe(0);
    expect(verdict.findings).toHaveLength(2);
    expect(verdict.findings[0].ac).toBe(1);
    expect(verdict.findings[0].evidence.commands_run).toContain('curl http://localhost:3000');
  });

  it('parses verdict with all optional fields', () => {
    const verdict = parseVerdict(makeValidVerdictJSON({
      evaluator_trace_id: 'trace-xyz',
      duration_seconds: 45.2,
    }));
    expect(verdict.evaluator_trace_id).toBe('trace-xyz');
    expect(verdict.duration_seconds).toBe(45.2);
  });

  it('tolerates extra fields in verdict (not rejected)', () => {
    const input = {
      ...makeValidVerdict(),
      custom_metadata: { foo: 'bar' },
      extra_field: true,
    };
    const verdict = parseVerdict(JSON.stringify(input));
    expect(verdict.verdict).toBe('pass');
  });

  // --- PASS-evidence downgrade tests ---

  it('downgrades PASS finding with empty commands_run to UNKNOWN', () => {
    const input = makeValidVerdict();
    input.findings[0].status = 'pass';
    input.findings[0].evidence.commands_run = [];
    input.findings[0].evidence.reasoning = 'Looked good';

    const verdict = parseVerdict(JSON.stringify(input));
    expect(verdict.findings[0].status).toBe('unknown');
    expect(verdict.findings[0].evidence.reasoning).toContain(
      '[Downgraded from PASS: no commands_run evidence provided]',
    );
  });

  it('recalculates score after PASS-evidence downgrade', () => {
    const input = makeValidVerdict();
    // Both findings are PASS but first has empty commands_run
    input.findings[0].evidence.commands_run = [];
    input.score = { passed: 2, failed: 0, unknown: 0, total: 2 };

    const verdict = parseVerdict(JSON.stringify(input));
    expect(verdict.score.passed).toBe(1);
    expect(verdict.score.unknown).toBe(1);
    expect(verdict.score.total).toBe(2);
  });

  it('flips verdict to fail when all PASSes are downgraded', () => {
    const input = makeValidVerdict();
    // Both findings have empty commands_run
    input.findings[0].evidence.commands_run = [];
    input.findings[1].evidence.commands_run = [];

    const verdict = parseVerdict(JSON.stringify(input));
    expect(verdict.verdict).toBe('fail');
    expect(verdict.score.passed).toBe(0);
    expect(verdict.score.unknown).toBe(2);
  });

  it('recalculates score with mixed statuses after downgrade', () => {
    const input = makeValidVerdict();
    // First finding: pass with empty commands_run (will be downgraded to unknown)
    input.findings[0].evidence.commands_run = [];
    // Add a third finding that is 'fail'
    input.findings.push({
      ac: 3,
      description: 'Third check',
      status: 'fail',
      evidence: {
        commands_run: ['npm test'],
        output_observed: 'FAIL',
        reasoning: 'Tests failed',
      },
    });
    input.score = { passed: 2, failed: 1, unknown: 0, total: 3 };

    const verdict = parseVerdict(JSON.stringify(input));
    expect(verdict.score.passed).toBe(1);
    expect(verdict.score.failed).toBe(1);
    expect(verdict.score.unknown).toBe(1);
    expect(verdict.score.total).toBe(3);
    // Verdict should NOT flip to fail because one PASS remains
    expect(verdict.verdict).toBe('pass');
  });

  it('keeps PASS finding with non-empty commands_run', () => {
    const verdict = parseVerdict(makeValidVerdictJSON());
    expect(verdict.findings[0].status).toBe('pass');
    expect(verdict.findings[1].status).toBe('pass');
  });

  // --- Error cases ---

  it('throws VerdictParseError with retryable=true for invalid JSON', () => {
    try {
      parseVerdict('not json at all');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(VerdictParseError);
      const vpe = err as VerdictParseError;
      expect(vpe.retryable).toBe(true);
      expect(vpe.rawOutput).toBe('not json at all');
    }
  });

  it('throws VerdictParseError with retryable=true for empty string', () => {
    try {
      parseVerdict('');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(VerdictParseError);
      const vpe = err as VerdictParseError;
      expect(vpe.retryable).toBe(true);
      expect(vpe.rawOutput).toBe('');
    }
  });

  it('throws VerdictParseError with retryable=true for partial JSON', () => {
    try {
      parseVerdict('{"verdict": "pass", "score":');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(VerdictParseError);
      const vpe = err as VerdictParseError;
      expect(vpe.retryable).toBe(true);
    }
  });

  it('throws VerdictParseError with retryable=true for schema-invalid JSON', () => {
    try {
      parseVerdict(JSON.stringify({ verdict: 'maybe', score: {}, findings: [] }));
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(VerdictParseError);
      const vpe = err as VerdictParseError;
      expect(vpe.retryable).toBe(true);
      expect(vpe.validationErrors).toBeDefined();
      expect(vpe.validationErrors!.length).toBeGreaterThan(0);
    }
  });

  it('throws VerdictParseError for non-object JSON values', () => {
    expect(() => parseVerdict('"just a string"')).toThrow(VerdictParseError);
    expect(() => parseVerdict('42')).toThrow(VerdictParseError);
    expect(() => parseVerdict('null')).toThrow(VerdictParseError);
    expect(() => parseVerdict('true')).toThrow(VerdictParseError);
  });
});

// --- VerdictParseError shape tests ---

describe('VerdictParseError', () => {
  it('extends Error', () => {
    const err = new VerdictParseError('test', true, 'raw');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('VerdictParseError');
  });

  it('has retryable, rawOutput, and optional validationErrors', () => {
    const err = new VerdictParseError('msg', true, 'raw-output', ['err1', 'err2']);
    expect(err.retryable).toBe(true);
    expect(err.rawOutput).toBe('raw-output');
    expect(err.validationErrors).toEqual(['err1', 'err2']);
    expect(err.message).toBe('msg');
  });

  it('validationErrors is undefined when not provided', () => {
    const err = new VerdictParseError('msg', false, 'raw');
    expect(err.retryable).toBe(false);
    expect(err.validationErrors).toBeUndefined();
  });
});
