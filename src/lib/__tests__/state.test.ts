import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  writeState,
  readState,
  readStateWithBody,
  getDefaultState,
  getStatePath,
  getNestedValue,
  setNestedValue,
  parseValue,
  StateFileNotFoundError,
  type HarnessState,
} from '../state.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-state-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('getDefaultState', () => {
  it('returns correct defaults with no stack', () => {
    const state = getDefaultState();
    expect(state.harness_version).toBe('0.1.0');
    expect(state.initialized).toBe(false);
    expect(state.stack).toBeNull();
    expect(state.enforcement.frontend).toBe(true);
    expect(state.enforcement.database).toBe(true);
    expect(state.enforcement.api).toBe(true);
    expect(state.coverage.target).toBe(90);
    expect(state.coverage.baseline).toBeNull();
    expect(state.coverage.current).toBeNull();
    expect(state.coverage.tool).toBe('c8');
    expect(state.session_flags.logs_queried).toBe(false);
    expect(state.session_flags.tests_passed).toBe(false);
    expect(state.session_flags.coverage_met).toBe(false);
    expect(state.session_flags.verification_run).toBe(false);
    expect(state.verification_log).toEqual([]);
  });

  it('returns correct defaults with a stack', () => {
    const state = getDefaultState('nodejs');
    expect(state.stack).toBe('nodejs');
  });

  it('treats explicit null as null', () => {
    const state = getDefaultState(null);
    expect(state.stack).toBeNull();
  });
});

describe('writeState', () => {
  it('creates .claude directory if it does not exist', () => {
    const state = getDefaultState('nodejs');
    writeState(state, testDir);
    expect(existsSync(join(testDir, '.claude'))).toBe(true);
  });

  it('creates file with valid YAML frontmatter', () => {
    const state = getDefaultState('nodejs');
    writeState(state, testDir);
    const content = readFileSync(getStatePath(testDir), 'utf-8');
    expect(content.startsWith('---\n')).toBe(true);
    expect(content).toContain('---\n');
    // Should have two --- delimiters
    const parts = content.split('---');
    expect(parts.length).toBeGreaterThanOrEqual(3);
  });

  it('uses snake_case field names', () => {
    const state = getDefaultState('nodejs');
    writeState(state, testDir);
    const content = readFileSync(getStatePath(testDir), 'utf-8');
    expect(content).toContain('harness_version');
    expect(content).toContain('session_flags');
    expect(content).toContain('logs_queried');
    expect(content).toContain('tests_passed');
    expect(content).toContain('coverage_met');
    expect(content).toContain('verification_run');
    expect(content).toContain('verification_log');
    // No camelCase
    expect(content).not.toContain('harnessVersion');
    expect(content).not.toContain('sessionFlags');
  });

  it('writes boolean values as YAML native true/false', () => {
    const state = getDefaultState();
    state.initialized = true;
    writeState(state, testDir);
    const content = readFileSync(getStatePath(testDir), 'utf-8');
    expect(content).toContain('initialized: true');
    expect(content).toContain('logs_queried: false');
    expect(content).not.toContain('"true"');
    expect(content).not.toContain('"false"');
  });

  it('writes null values as YAML null', () => {
    const state = getDefaultState();
    writeState(state, testDir);
    const content = readFileSync(getStatePath(testDir), 'utf-8');
    expect(content).toContain('baseline: null');
    expect(content).toContain('current: null');
    expect(content).toContain('stack: null');
  });

  it('includes default markdown body', () => {
    const state = getDefaultState();
    writeState(state, testDir);
    const content = readFileSync(getStatePath(testDir), 'utf-8');
    expect(content).toContain('# Codeharness State');
    expect(content).toContain('Do not edit manually');
  });

  it('preserves custom body', () => {
    const state = getDefaultState();
    const customBody = '\n# Custom Body\n\nSome custom content.\n';
    writeState(state, testDir, customBody);
    const content = readFileSync(getStatePath(testDir), 'utf-8');
    expect(content).toContain('# Custom Body');
    expect(content).toContain('Some custom content.');
  });
});

describe('readState', () => {
  it('parses YAML frontmatter and returns typed object', () => {
    const original = getDefaultState('nodejs');
    original.initialized = true;
    writeState(original, testDir);
    const read = readState(testDir);
    expect(read.harness_version).toBe('0.1.0');
    expect(read.initialized).toBe(true);
    expect(read.stack).toBe('nodejs');
    expect(read.enforcement.frontend).toBe(true);
    expect(read.coverage.target).toBe(90);
    expect(read.coverage.baseline).toBeNull();
    expect(read.session_flags.tests_passed).toBe(false);
    expect(read.verification_log).toEqual([]);
  });

  it('throws StateFileNotFoundError when file does not exist', () => {
    expect(() => readState(testDir)).toThrow(StateFileNotFoundError);
  });

  it('preserves markdown body on round-trip', () => {
    const state = getDefaultState('nodejs');
    const body = '\n# My Custom Notes\n\nSome important info.\n';
    writeState(state, testDir, body);

    const { state: readBack, body: readBody } = readStateWithBody(testDir);
    expect(readBack.stack).toBe('nodejs');
    expect(readBody).toContain('# My Custom Notes');
    expect(readBody).toContain('Some important info.');

    // Write back with preserved body
    readBack.initialized = true;
    writeState(readBack, testDir, readBody);

    const final = readFileSync(getStatePath(testDir), 'utf-8');
    expect(final).toContain('initialized: true');
    expect(final).toContain('# My Custom Notes');
  });

  it('recovers from corrupted YAML', () => {
    const claudeDir = join(testDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, 'codeharness.local.md'), '---\n{invalid yaml: [[\n---\n', 'utf-8');

    const consoleSpy = vi.spyOn(console, 'log');
    const state = readState(testDir);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('State file corrupted'));
    expect(state.harness_version).toBe('0.1.0');
    consoleSpy.mockRestore();
  });

  it('recovers from file with no frontmatter delimiters', () => {
    const claudeDir = join(testDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, 'codeharness.local.md'), 'just some text', 'utf-8');

    const consoleSpy = vi.spyOn(console, 'log');
    const state = readState(testDir);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('State file corrupted'));
    expect(state.initialized).toBe(false);
    consoleSpy.mockRestore();
  });

  it('recovers when YAML parses to non-object', () => {
    const claudeDir = join(testDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, 'codeharness.local.md'), '---\njust a string\n---\n', 'utf-8');

    const consoleSpy = vi.spyOn(console, 'log');
    const state = readState(testDir);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('State file corrupted'));
    consoleSpy.mockRestore();
  });

  it('recovers when YAML is valid but does not match HarnessState schema', () => {
    const claudeDir = join(testDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    // Valid YAML object but missing required fields
    writeFileSync(join(claudeDir, 'codeharness.local.md'), '---\nfoo: bar\nbaz: 42\n---\n', 'utf-8');

    const consoleSpy = vi.spyOn(console, 'log');
    const state = readState(testDir);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('State file corrupted'));
    expect(state.harness_version).toBe('0.1.0');
    consoleSpy.mockRestore();
  });
});

describe('readStateWithBody', () => {
  it('throws StateFileNotFoundError when file does not exist', () => {
    expect(() => readStateWithBody(testDir)).toThrow(StateFileNotFoundError);
  });

  it('returns default body on corrupted file', () => {
    const claudeDir = join(testDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, 'codeharness.local.md'), '---\n{bad\n---\n', 'utf-8');

    const consoleSpy = vi.spyOn(console, 'log');
    const { body } = readStateWithBody(testDir);
    expect(body).toContain('Codeharness State');
    consoleSpy.mockRestore();
  });

  it('returns default body when YAML parses to non-object', () => {
    const claudeDir = join(testDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, 'codeharness.local.md'), '---\n42\n---\n', 'utf-8');

    const consoleSpy = vi.spyOn(console, 'log');
    const { body } = readStateWithBody(testDir);
    expect(body).toContain('Codeharness State');
    consoleSpy.mockRestore();
  });

  it('returns default body on missing frontmatter delimiters', () => {
    const claudeDir = join(testDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, 'codeharness.local.md'), 'no delimiters here', 'utf-8');

    const consoleSpy = vi.spyOn(console, 'log');
    const { body } = readStateWithBody(testDir);
    expect(body).toContain('Codeharness State');
    consoleSpy.mockRestore();
  });
});

describe('getNestedValue', () => {
  it('gets top-level value', () => {
    expect(getNestedValue({ a: 1 }, 'a')).toBe(1);
  });

  it('gets nested value', () => {
    expect(getNestedValue({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42);
  });

  it('returns undefined for missing key', () => {
    expect(getNestedValue({ a: 1 }, 'b')).toBeUndefined();
  });

  it('returns undefined for path through non-object', () => {
    expect(getNestedValue({ a: 'string' }, 'a.b')).toBeUndefined();
  });

  it('returns undefined for path through null', () => {
    expect(getNestedValue({ a: null }, 'a.b')).toBeUndefined();
  });

  it('rejects __proto__ key path', () => {
    expect(() => getNestedValue({ a: 1 }, '__proto__.polluted')).toThrow('not allowed');
  });

  it('rejects constructor key path', () => {
    expect(() => getNestedValue({ a: 1 }, 'constructor.prototype')).toThrow('not allowed');
  });

  it('rejects prototype key path', () => {
    expect(() => getNestedValue({ a: 1 }, 'a.prototype')).toThrow('not allowed');
  });
});

describe('setNestedValue', () => {
  it('sets top-level value', () => {
    const obj: Record<string, unknown> = { a: 1 };
    setNestedValue(obj, 'a', 2);
    expect(obj.a).toBe(2);
  });

  it('sets nested value', () => {
    const obj: Record<string, unknown> = { a: { b: 1 } };
    setNestedValue(obj, 'a.b', 42);
    expect((obj.a as Record<string, unknown>).b).toBe(42);
  });

  it('creates intermediate objects for missing path', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'a.b.c', 'value');
    expect((((obj.a as Record<string, unknown>).b) as Record<string, unknown>).c).toBe('value');
  });

  it('creates intermediate objects when path goes through null', () => {
    const obj: Record<string, unknown> = { a: null };
    setNestedValue(obj, 'a.b', 'value');
    expect((obj.a as Record<string, unknown>).b).toBe('value');
  });

  it('rejects __proto__ key path', () => {
    const obj: Record<string, unknown> = {};
    expect(() => setNestedValue(obj, '__proto__.polluted', true)).toThrow('not allowed');
  });

  it('rejects constructor key path', () => {
    const obj: Record<string, unknown> = {};
    expect(() => setNestedValue(obj, 'constructor.prototype', true)).toThrow('not allowed');
  });
});

describe('parseValue', () => {
  it('parses "true" as boolean', () => {
    expect(parseValue('true')).toBe(true);
  });

  it('parses "false" as boolean', () => {
    expect(parseValue('false')).toBe(false);
  });

  it('parses "null" as null', () => {
    expect(parseValue('null')).toBeNull();
  });

  it('parses numbers', () => {
    expect(parseValue('42')).toBe(42);
    expect(parseValue('3.14')).toBe(3.14);
  });

  it('keeps strings as strings', () => {
    expect(parseValue('hello')).toBe('hello');
  });
});
