import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateFile, renderTemplate } from '../templates.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-tmpl-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('generateFile', () => {
  it('writes content to target path', () => {
    const target = join(testDir, 'output.txt');
    generateFile(target, 'hello world');
    expect(readFileSync(target, 'utf-8')).toBe('hello world');
  });

  it('creates parent directories', () => {
    const target = join(testDir, 'deep', 'nested', 'dir', 'file.txt');
    generateFile(target, 'nested content');
    expect(existsSync(target)).toBe(true);
    expect(readFileSync(target, 'utf-8')).toBe('nested content');
  });
});

describe('renderTemplate', () => {
  it('interpolates variables', () => {
    const result = renderTemplate('Hello {{name}}, you are {{age}} years old.', {
      name: 'Alice',
      age: '30',
    });
    expect(result).toBe('Hello Alice, you are 30 years old.');
  });

  it('handles missing variables gracefully by leaving placeholder', () => {
    const result = renderTemplate('Hello {{name}}, welcome to {{place}}.', {
      name: 'Bob',
    });
    expect(result).toBe('Hello Bob, welcome to {{place}}.');
  });

  it('handles template with no variables', () => {
    const result = renderTemplate('No variables here.', { key: 'value' });
    expect(result).toBe('No variables here.');
  });

  it('handles empty vars object', () => {
    const result = renderTemplate('{{a}} and {{b}}', {});
    expect(result).toBe('{{a}} and {{b}}');
  });
});
