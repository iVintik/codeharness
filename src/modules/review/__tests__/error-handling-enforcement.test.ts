import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..', '..', '..');

let reviewPatch: string;
let devPatch: string;

beforeAll(() => {
  reviewPatch = readFileSync(
    resolve(ROOT, 'patches/review/enforcement.md'),
    'utf-8',
  );
  devPatch = readFileSync(
    resolve(ROOT, 'patches/dev/enforcement.md'),
    'utf-8',
  );
});

describe('patches/review/enforcement.md — error-handling rules', () => {
  it('includes --config patches/error-handling/ in semgrep command', () => {
    expect(reviewPatch).toContain('--config patches/error-handling/');
  });

  it('still includes --config patches/observability/ in semgrep command', () => {
    expect(reviewPatch).toContain('--config patches/observability/');
  });
});

describe('patches/dev/enforcement.md — error-handling rules', () => {
  it('includes --config patches/error-handling/ in semgrep command', () => {
    expect(devPatch).toContain('--config patches/error-handling/');
  });

  it('still includes --config patches/observability/ in semgrep command', () => {
    expect(devPatch).toContain('--config patches/observability/');
  });
});

describe('patches/error-handling/no-bare-except.yaml — file exists', () => {
  it('Semgrep rule file exists', () => {
    const rulePath = resolve(ROOT, 'patches/error-handling/no-bare-except.yaml');
    expect(existsSync(rulePath)).toBe(true);
  });

  it('rule file contains no-bare-except-pass rule id', () => {
    const ruleContent = readFileSync(
      resolve(ROOT, 'patches/error-handling/no-bare-except.yaml'),
      'utf-8',
    );
    expect(ruleContent).toContain('id: no-bare-except-pass');
  });

  it('rule file contains no-bare-except-ellipsis rule id', () => {
    const ruleContent = readFileSync(
      resolve(ROOT, 'patches/error-handling/no-bare-except.yaml'),
      'utf-8',
    );
    expect(ruleContent).toContain('id: no-bare-except-ellipsis');
  });

  it('rule file targets Python language', () => {
    const ruleContent = readFileSync(
      resolve(ROOT, 'patches/error-handling/no-bare-except.yaml'),
      'utf-8',
    );
    expect(ruleContent).toContain('languages: [python]');
  });

  it('rules have ERROR severity', () => {
    const ruleContent = readFileSync(
      resolve(ROOT, 'patches/error-handling/no-bare-except.yaml'),
      'utf-8',
    );
    expect(ruleContent).toContain('severity: ERROR');
  });

  it('test fixture file exists', () => {
    const testPath = resolve(
      ROOT,
      'patches/error-handling/__tests__/no-bare-except.py',
    );
    expect(existsSync(testPath)).toBe(true);
  });
});

// hooks/post-write-check.sh tests removed — hooks/ directory deleted (Story 1.2)
