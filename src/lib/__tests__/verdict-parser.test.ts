import { describe, it, expect } from 'vitest';
import {
  parseVerdict,
  extractTag,
} from '../verdict-parser.js';
import type { EvaluatorVerdict } from '../verdict-parser.js';

// --- parseVerdict Tests ---

describe('parseVerdict', () => {
  it('parses pass verdict tag', () => {
    const verdict = parseVerdict('All checks passed <verdict>pass</verdict>');
    expect(verdict.verdict).toBe('pass');
    expect(verdict.score.passed).toBe(1);
    expect(verdict.score.failed).toBe(0);
    expect(verdict.score.total).toBe(1);
  });

  it('parses fail verdict tag', () => {
    const verdict = parseVerdict('Tests failed <verdict>fail</verdict>');
    expect(verdict.verdict).toBe('fail');
    expect(verdict.score.failed).toBe(1);
    expect(verdict.score.passed).toBe(0);
    expect(verdict.score.total).toBe(1);
  });

  it('returns fail when no verdict tag present', () => {
    const verdict = parseVerdict('some output with no verdict tag');
    expect(verdict.verdict).toBe('fail');
    expect(verdict.score.failed).toBe(1);
    expect(verdict.score.passed).toBe(0);
    expect(verdict.score.total).toBe(1);
  });

  it('returns fail for empty string', () => {
    const verdict = parseVerdict('');
    expect(verdict.verdict).toBe('fail');
    expect(verdict.score.failed).toBe(1);
  });

  it('never throws', () => {
    // Any input should return a valid verdict, never throw
    expect(() => parseVerdict('')).not.toThrow();
    expect(() => parseVerdict('garbage {{{ [[')).not.toThrow();
    expect(() => parseVerdict('null')).not.toThrow();
    expect(() => parseVerdict('42')).not.toThrow();
    expect(() => parseVerdict('{"verdict":"pass"}')).not.toThrow();
  });

  it('is case-insensitive for verdict tag', () => {
    const verdict = parseVerdict('<VERDICT>PASS</VERDICT>');
    expect(verdict.verdict).toBe('pass');
  });

  it('parses evidence tags', () => {
    const output = [
      '<evidence ac="1" status="pass">ran npm test, all passed</evidence>',
      '<evidence ac="2" status="fail">wc -l shows 300 lines</evidence>',
      '<verdict>fail</verdict>',
    ].join('\n');

    const verdict = parseVerdict(output);
    expect(verdict.verdict).toBe('fail');
    expect(verdict.findings).toHaveLength(2);
    expect(verdict.findings[0].ac).toBe(1);
    expect(verdict.findings[0].status).toBe('pass');
    expect(verdict.findings[0].evidence.output_observed).toBe('ran npm test, all passed');
    expect(verdict.findings[1].ac).toBe(2);
    expect(verdict.findings[1].status).toBe('fail');
    expect(verdict.findings[1].evidence.output_observed).toBe('wc -l shows 300 lines');
  });

  it('calculates score from evidence tags', () => {
    const output = [
      '<evidence ac="1" status="pass">ok</evidence>',
      '<evidence ac="2" status="fail">nope</evidence>',
      '<evidence ac="3" status="unknown">could not verify</evidence>',
      '<verdict>fail</verdict>',
    ].join('\n');

    const verdict = parseVerdict(output);
    expect(verdict.score.passed).toBe(1);
    expect(verdict.score.failed).toBe(1);
    expect(verdict.score.unknown).toBe(1);
    expect(verdict.score.total).toBe(3);
  });

  it('parses issues tag when no evidence tags present', () => {
    const output = 'Tests failed <verdict>fail</verdict> <issues>lint warning in foo.ts</issues>';
    const verdict = parseVerdict(output);
    expect(verdict.verdict).toBe('fail');
    expect(verdict.findings).toHaveLength(1);
    expect(verdict.findings[0].status).toBe('fail');
    expect(verdict.findings[0].evidence.output_observed).toBe('lint warning in foo.ts');
  });

  it('ignores issues tag when evidence tags are present', () => {
    const output = [
      '<evidence ac="1" status="pass">ok</evidence>',
      '<verdict>fail</verdict>',
      '<issues>this should be ignored</issues>',
    ].join('\n');

    const verdict = parseVerdict(output);
    // Only evidence tag findings, not issues
    expect(verdict.findings).toHaveLength(1);
    expect(verdict.findings[0].evidence.output_observed).toBe('ok');
  });

  it('ignores issues tag when verdict is pass', () => {
    const output = '<verdict>pass</verdict> <issues>some issues</issues>';
    const verdict = parseVerdict(output);
    expect(verdict.findings).toHaveLength(0);
    expect(verdict.score.passed).toBe(1);
  });

  it('returns correct score with no findings and pass verdict', () => {
    const verdict = parseVerdict('<verdict>pass</verdict>');
    expect(verdict.score).toEqual({ passed: 1, failed: 0, unknown: 0, total: 1 });
    expect(verdict.findings).toHaveLength(0);
  });

  it('returns correct score with no findings and fail verdict', () => {
    const verdict = parseVerdict('<verdict>fail</verdict>');
    expect(verdict.score).toEqual({ passed: 0, failed: 1, unknown: 0, total: 1 });
    expect(verdict.findings).toHaveLength(0);
  });

  it('handles mixed content with evidence tags', () => {
    const output = [
      'I verified the acceptance criteria.',
      '<evidence ac="1" status="pass">ran npm test, all passed</evidence>',
      'The second AC failed:',
      '<evidence ac="2" status="fail">wc -l shows 300 lines</evidence>',
      'Overall: <verdict>fail</verdict>',
      '<issues>lint warning in foo.ts</issues>',
    ].join('\n');

    const verdict = parseVerdict(output);
    expect(verdict.verdict).toBe('fail');
    expect(verdict.findings).toHaveLength(2);
    expect(verdict.score.passed).toBe(1);
    expect(verdict.score.failed).toBe(1);
    expect(verdict.score.total).toBe(2);
  });

  it('handles JSON input as no-verdict (returns fail)', () => {
    // Old JSON format should not parse as a verdict tag
    const json = JSON.stringify({
      verdict: 'pass',
      score: { passed: 1, failed: 0, unknown: 0, total: 1 },
      findings: [],
    });
    const verdict = parseVerdict(json);
    // No <verdict> tag in JSON string, so it's a fail
    expect(verdict.verdict).toBe('fail');
  });
});

// --- extractTag Tests ---

describe('extractTag', () => {
  it('extracts content from a tag', () => {
    expect(extractTag('<verdict>pass</verdict>', 'verdict')).toBe('pass');
  });

  it('returns null when tag not found', () => {
    expect(extractTag('no tags here', 'verdict')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(extractTag('<VERDICT>PASS</VERDICT>', 'verdict')).toBe('PASS');
  });

  it('extracts multiline content', () => {
    const output = '<issues>\nline 1\nline 2\n</issues>';
    expect(extractTag(output, 'issues')).toBe('line 1\nline 2');
  });

  it('trims whitespace from extracted content', () => {
    expect(extractTag('<verdict>  pass  </verdict>', 'verdict')).toBe('pass');
  });
});
