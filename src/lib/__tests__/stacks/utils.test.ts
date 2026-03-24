import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readJsonSafe, readTextSafe, getNodeDeps } from '../../stacks/utils.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-utils-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('readJsonSafe', () => {
  it('returns parsed JSON for valid file', () => {
    writeFileSync(join(testDir, 'test.json'), JSON.stringify({ name: 'foo' }));
    const result = readJsonSafe(join(testDir, 'test.json'));
    expect(result).toEqual({ name: 'foo' });
  });

  it('returns null for non-existent file', () => {
    expect(readJsonSafe(join(testDir, 'missing.json'))).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    writeFileSync(join(testDir, 'bad.json'), '{broken');
    expect(readJsonSafe(join(testDir, 'bad.json'))).toBeNull();
  });
});

describe('readTextSafe', () => {
  it('returns file contents for valid text file', () => {
    writeFileSync(join(testDir, 'hello.txt'), 'hello world');
    expect(readTextSafe(join(testDir, 'hello.txt'))).toBe('hello world');
  });

  it('returns null for non-existent file', () => {
    expect(readTextSafe(join(testDir, 'missing.txt'))).toBeNull();
  });

  it('returns empty string for empty file', () => {
    writeFileSync(join(testDir, 'empty.txt'), '');
    expect(readTextSafe(join(testDir, 'empty.txt'))).toBe('');
  });
});

describe('getNodeDeps', () => {
  it('collects dependencies and devDependencies', () => {
    const pkg = {
      dependencies: { express: '4.0.0' },
      devDependencies: { vitest: '1.0.0' },
    };
    const deps = getNodeDeps(pkg);
    expect(deps.has('express')).toBe(true);
    expect(deps.has('vitest')).toBe(true);
  });

  it('returns empty set for package with no deps', () => {
    expect(getNodeDeps({ name: 'test' }).size).toBe(0);
  });

  it('handles non-object dependencies gracefully', () => {
    const pkg = { dependencies: 'not-an-object' as unknown };
    const deps = getNodeDeps(pkg as Record<string, unknown>);
    expect(deps.size).toBe(0);
  });
});
