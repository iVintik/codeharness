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
import type { StackName } from '../stacks/index.js';

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

  it('defaults coverage tool to cargo-tarpaulin for rust stack', () => {
    const state = getDefaultState('rust');
    expect(state.coverage.tool).toBe('cargo-tarpaulin');
  });

  it('defaults coverage tool to coverage.py for python stack', () => {
    const state = getDefaultState('python');
    expect(state.coverage.tool).toBe('coverage.py');
  });

  it('defaults coverage tool to c8 for nodejs stack', () => {
    const state = getDefaultState('nodejs');
    expect(state.coverage.tool).toBe('c8');
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

describe('HarnessState Rust type support', () => {
  it('accepts cargo-tarpaulin as coverage.tool value', () => {
    const state = getDefaultState();
    state.coverage.tool = 'cargo-tarpaulin';
    writeState(state, testDir);

    const read = readState(testDir);
    expect(read.coverage.tool).toBe('cargo-tarpaulin');
  });

  it('round-trips cargo-tarpaulin through YAML write/read', () => {
    const state = getDefaultState();
    state.coverage.tool = 'cargo-tarpaulin';
    writeState(state, testDir);

    const content = readFileSync(getStatePath(testDir), 'utf-8');
    expect(content).toContain('tool: cargo-tarpaulin');

    const { state: read } = readStateWithBody(testDir);
    expect(read.coverage.tool).toBe('cargo-tarpaulin');
  });

  it('accepts rust_env_hint in OTLP state section', () => {
    const state = getDefaultState();
    state.otlp = {
      enabled: true,
      endpoint: 'http://localhost:4318',
      service_name: 'my-rust-service',
      mode: 'local-shared',
      rust_env_hint: 'OTEL_EXPORTER_OTLP_ENDPOINT',
    };
    writeState(state, testDir);

    const read = readState(testDir);
    expect(read.otlp?.rust_env_hint).toBe('OTEL_EXPORTER_OTLP_ENDPOINT');
  });

  it('round-trips rust_env_hint through YAML write/read', () => {
    const state = getDefaultState();
    state.otlp = {
      enabled: true,
      endpoint: 'http://localhost:4318',
      service_name: 'my-rust-service',
      mode: 'local-shared',
      rust_env_hint: 'OTEL_EXPORTER_OTLP_ENDPOINT',
    };
    writeState(state, testDir);

    const content = readFileSync(getStatePath(testDir), 'utf-8');
    expect(content).toContain('rust_env_hint: OTEL_EXPORTER_OTLP_ENDPOINT');

    const { state: read, body } = readStateWithBody(testDir);
    expect(read.otlp?.rust_env_hint).toBe('OTEL_EXPORTER_OTLP_ENDPOINT');

    // Write back and verify round-trip
    writeState(read, testDir, body);
    const final = readState(testDir);
    expect(final.otlp?.rust_env_hint).toBe('OTEL_EXPORTER_OTLP_ENDPOINT');
  });

  it('omits rust_env_hint when not set (optional field)', () => {
    const state = getDefaultState();
    state.otlp = {
      enabled: true,
      endpoint: 'http://localhost:4318',
      service_name: 'my-node-service',
      mode: 'local-shared',
    };
    writeState(state, testDir);

    const read = readState(testDir);
    expect(read.otlp?.rust_env_hint).toBeUndefined();
  });
});

describe('Multi-stack state migration', () => {
  it('migrates old format (stack only, no stacks) to include stacks array', () => {
    // Write a state file in old format (no stacks field)
    const claudeDir = join(testDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    const oldYaml = [
      '---',
      'harness_version: "0.1.0"',
      'initialized: true',
      'stack: nodejs',
      'enforcement:',
      '  frontend: true',
      '  database: true',
      '  api: true',
      'coverage:',
      '  target: 90',
      '  baseline: null',
      '  current: null',
      '  tool: c8',
      'session_flags:',
      '  logs_queried: false',
      '  tests_passed: false',
      '  coverage_met: false',
      '  verification_run: false',
      'verification_log: []',
      '---',
      '',
    ].join('\n');
    writeFileSync(join(claudeDir, 'codeharness.local.md'), oldYaml, 'utf-8');

    const state = readState(testDir);
    expect(state.stacks).toEqual(['nodejs']);
    expect(state.stack).toBe('nodejs');
  });

  it('reads new format (stacks array present) and syncs stack from stacks[0]', () => {
    const claudeDir = join(testDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    const newYaml = [
      '---',
      'harness_version: "0.1.0"',
      'initialized: true',
      'stack: nodejs',
      'stacks:',
      '  - nodejs',
      '  - rust',
      'enforcement:',
      '  frontend: true',
      '  database: true',
      '  api: true',
      'coverage:',
      '  target: 90',
      '  baseline: null',
      '  current: null',
      '  tool: c8',
      'session_flags:',
      '  logs_queried: false',
      '  tests_passed: false',
      '  coverage_met: false',
      '  verification_run: false',
      'verification_log: []',
      '---',
      '',
    ].join('\n');
    writeFileSync(join(claudeDir, 'codeharness.local.md'), newYaml, 'utf-8');

    const state = readState(testDir);
    expect(state.stacks).toEqual(['nodejs', 'rust']);
    expect(state.stack).toBe('nodejs');
  });

  it('handles neither stack nor stacks present — produces stacks: [], stack: null', () => {
    const claudeDir = join(testDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    const emptyStackYaml = [
      '---',
      'harness_version: "0.1.0"',
      'initialized: false',
      'stack: null',
      'enforcement:',
      '  frontend: true',
      '  database: true',
      '  api: true',
      'coverage:',
      '  target: 90',
      '  baseline: null',
      '  current: null',
      '  tool: c8',
      'session_flags:',
      '  logs_queried: false',
      '  tests_passed: false',
      '  coverage_met: false',
      '  verification_run: false',
      'verification_log: []',
      '---',
      '',
    ].join('\n');
    writeFileSync(join(claudeDir, 'codeharness.local.md'), emptyStackYaml, 'utf-8');

    const state = readState(testDir);
    expect(state.stacks).toEqual([]);
    expect(state.stack).toBeNull();
  });

  it('writeState dual-write: both stacks array and stack field appear in YAML output', () => {
    const state = getDefaultState('nodejs');
    state.stacks = ['nodejs', 'rust'] as StackName[];
    writeState(state, testDir);

    const content = readFileSync(getStatePath(testDir), 'utf-8');
    expect(content).toContain('stack: nodejs');
    expect(content).toContain('stacks:');
    expect(content).toContain('- nodejs');
    expect(content).toContain('- rust');
  });

  it('getDefaultState returns consistent stack and stacks fields', () => {
    const withStack = getDefaultState('nodejs');
    expect(withStack.stack).toBe('nodejs');
    expect(withStack.stacks).toEqual(['nodejs']);

    const noStack = getDefaultState();
    expect(noStack.stack).toBeNull();
    expect(noStack.stacks).toEqual([]);

    const nullStack = getDefaultState(null);
    expect(nullStack.stack).toBeNull();
    expect(nullStack.stacks).toEqual([]);
  });

  it('isValidState accepts old-format state (no stacks field)', () => {
    // Old format without stacks should still be valid — migrateState will add it
    const claudeDir = join(testDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    const oldYaml = [
      '---',
      'harness_version: "0.1.0"',
      'initialized: false',
      'stack: nodejs',
      'enforcement:',
      '  frontend: true',
      '  database: true',
      '  api: true',
      'coverage:',
      '  target: 90',
      '  baseline: null',
      '  current: null',
      '  tool: c8',
      'session_flags:',
      '  logs_queried: false',
      '  tests_passed: false',
      '  coverage_met: false',
      '  verification_run: false',
      'verification_log: []',
      '---',
      '',
    ].join('\n');
    writeFileSync(join(claudeDir, 'codeharness.local.md'), oldYaml, 'utf-8');

    // Should not trigger recovery — isValidState should accept this
    const consoleSpy = vi.spyOn(console, 'log');
    const state = readState(testDir);
    // Should not have logged corruption warning
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('State file corrupted'));
    expect(state.stack).toBe('nodejs');
    expect(state.stacks).toEqual(['nodejs']);
    consoleSpy.mockRestore();
  });

  it('isValidState accepts new-format state (with stacks field)', () => {
    const state = getDefaultState('nodejs');
    state.stacks = ['nodejs', 'rust'] as StackName[];
    writeState(state, testDir);

    const consoleSpy = vi.spyOn(console, 'log');
    const read = readState(testDir);
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('State file corrupted'));
    expect(read.stacks).toEqual(['nodejs', 'rust']);
    consoleSpy.mockRestore();
  });

  it('round-trip: write multi-stack state, read back, verify both fields intact', () => {
    const state = getDefaultState('nodejs');
    state.stacks = ['nodejs', 'rust'] as StackName[];
    state.initialized = true;
    writeState(state, testDir);

    const read = readState(testDir);
    expect(read.stack).toBe('nodejs');
    expect(read.stacks).toEqual(['nodejs', 'rust']);
    expect(read.initialized).toBe(true);

    // Write again and read again
    writeState(read, testDir);
    const read2 = readState(testDir);
    expect(read2.stack).toBe('nodejs');
    expect(read2.stacks).toEqual(['nodejs', 'rust']);
  });

  it('readStateWithBody also applies migration for old format', () => {
    const claudeDir = join(testDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    const oldYaml = [
      '---',
      'harness_version: "0.1.0"',
      'initialized: true',
      'stack: python',
      'enforcement:',
      '  frontend: true',
      '  database: true',
      '  api: true',
      'coverage:',
      '  target: 90',
      '  baseline: null',
      '  current: null',
      '  tool: coverage.py',
      'session_flags:',
      '  logs_queried: false',
      '  tests_passed: false',
      '  coverage_met: false',
      '  verification_run: false',
      'verification_log: []',
      '---',
      '# Body',
      '',
    ].join('\n');
    writeFileSync(join(claudeDir, 'codeharness.local.md'), oldYaml, 'utf-8');

    const { state, body } = readStateWithBody(testDir);
    expect(state.stacks).toEqual(['python']);
    expect(state.stack).toBe('python');
    expect(body).toContain('# Body');
  });

  it('writeState syncs stack from stacks[0] even when stack was different', () => {
    const state = getDefaultState('nodejs');
    state.stacks = ['rust', 'nodejs'] as StackName[];
    state.stack = 'nodejs'; // intentionally different from stacks[0]
    writeState(state, testDir);

    // After write, stack should be synced to stacks[0] = 'rust'
    const read = readState(testDir);
    expect(read.stack).toBe('rust');
    expect(read.stacks).toEqual(['rust', 'nodejs']);
  });

  it('writeState does not mutate the input state object', () => {
    const state = getDefaultState('nodejs');
    state.stacks = ['rust', 'nodejs'] as StackName[];
    state.stack = 'nodejs'; // intentionally different from stacks[0]
    writeState(state, testDir);

    // The original state object should not have been mutated
    expect(state.stack).toBe('nodejs');
  });

  it('isValidState rejects stacks array with non-string elements', () => {
    const claudeDir = join(testDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    const badYaml = [
      '---',
      'harness_version: "0.1.0"',
      'initialized: false',
      'stack: null',
      'stacks:',
      '  - 42',
      '  - true',
      'enforcement:',
      '  frontend: true',
      '  database: true',
      '  api: true',
      'coverage:',
      '  target: 90',
      '  baseline: null',
      '  current: null',
      '  tool: c8',
      'session_flags:',
      '  logs_queried: false',
      '  tests_passed: false',
      '  coverage_met: false',
      '  verification_run: false',
      'verification_log: []',
      '---',
      '',
    ].join('\n');
    writeFileSync(join(claudeDir, 'codeharness.local.md'), badYaml, 'utf-8');

    // Should trigger recovery because isValidState rejects non-string stacks elements
    const consoleSpy = vi.spyOn(console, 'log');
    const state = readState(testDir);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('State file corrupted'));
    expect(state.harness_version).toBe('0.1.0');
    consoleSpy.mockRestore();
  });
});
