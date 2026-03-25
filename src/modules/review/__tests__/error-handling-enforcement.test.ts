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

describe('hooks/post-write-check.sh — Python bare-except detection', () => {
  let hookContent: string;

  beforeAll(() => {
    hookContent = readFileSync(
      resolve(ROOT, 'hooks/post-write-check.sh'),
      'utf-8',
    );
  });

  it('checks for .py file extension', () => {
    expect(hookContent).toContain('*.py');
  });

  it('uses awk to detect except Exception followed by pass or ellipsis on next line', () => {
    expect(hookContent).toContain('except');
    expect(hookContent).toContain('Exception');
    expect(hookContent).toContain('pass');
    expect(hookContent).toContain('\\.\\.\\.');
  });

  it('emits WARN message for bare except detection', () => {
    expect(hookContent).toContain("[WARN] Bare 'except Exception: pass/...' detected");
  });

  it('suggests handling the error or adding IGNORE comment', () => {
    expect(hookContent).toContain('Handle the error or add a # IGNORE: comment');
  });
});
