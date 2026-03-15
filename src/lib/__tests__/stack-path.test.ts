import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

// Must import after mocks are set up (dynamic)
let getStackDir: () => string;
let getComposeFilePath: () => string;
let getOtelConfigPath: () => string;
let ensureStackDir: () => void;

describe('stack-path', () => {
  const originalXdg = process.env['XDG_DATA_HOME'];

  beforeEach(async () => {
    // Re-import fresh module to pick up env changes
    vi.resetModules();
    const mod = await import('../stack-path.js');
    getStackDir = mod.getStackDir;
    getComposeFilePath = mod.getComposeFilePath;
    getOtelConfigPath = mod.getOtelConfigPath;
    ensureStackDir = mod.ensureStackDir;
  });

  afterEach(() => {
    if (originalXdg !== undefined) {
      process.env['XDG_DATA_HOME'] = originalXdg;
    } else {
      delete process.env['XDG_DATA_HOME'];
    }
  });

  describe('getStackDir', () => {
    it('returns ~/.codeharness/stack/ by default', () => {
      delete process.env['XDG_DATA_HOME'];
      const result = getStackDir();
      expect(result).toBe(join(homedir(), '.codeharness', 'stack'));
    });

    it('uses XDG_DATA_HOME when set', () => {
      process.env['XDG_DATA_HOME'] = '/custom/data';
      const result = getStackDir();
      expect(result).toBe(join('/custom/data', 'codeharness', 'stack'));
    });

    it('ignores empty XDG_DATA_HOME and falls back to default', () => {
      process.env['XDG_DATA_HOME'] = '';
      const result = getStackDir();
      expect(result).toBe(join(homedir(), '.codeharness', 'stack'));
    });

    it('ignores whitespace-only XDG_DATA_HOME and falls back to default', () => {
      process.env['XDG_DATA_HOME'] = '   ';
      const result = getStackDir();
      expect(result).toBe(join(homedir(), '.codeharness', 'stack'));
    });

    it('ignores relative XDG_DATA_HOME and falls back to default', () => {
      process.env['XDG_DATA_HOME'] = './relative/data';
      const result = getStackDir();
      expect(result).toBe(join(homedir(), '.codeharness', 'stack'));
    });
  });

  describe('getComposeFilePath', () => {
    it('returns docker-compose.harness.yml under stack dir', () => {
      delete process.env['XDG_DATA_HOME'];
      const result = getComposeFilePath();
      expect(result).toBe(join(homedir(), '.codeharness', 'stack', 'docker-compose.harness.yml'));
    });
  });

  describe('getOtelConfigPath', () => {
    it('returns otel-collector-config.yaml under stack dir', () => {
      delete process.env['XDG_DATA_HOME'];
      const result = getOtelConfigPath();
      expect(result).toBe(join(homedir(), '.codeharness', 'stack', 'otel-collector-config.yaml'));
    });
  });

  describe('ensureStackDir', () => {
    it('creates directory if it does not exist', () => {
      const tmpBase = mkdtempSync(join(tmpdir(), 'ch-stackpath-test-'));
      process.env['XDG_DATA_HOME'] = tmpBase;

      try {
        const expectedDir = join(tmpBase, 'codeharness', 'stack');
        expect(existsSync(expectedDir)).toBe(false);
        ensureStackDir();
        expect(existsSync(expectedDir)).toBe(true);
      } finally {
        rmSync(tmpBase, { recursive: true, force: true });
      }
    });

    it('does not throw if directory already exists', () => {
      const tmpBase = mkdtempSync(join(tmpdir(), 'ch-stackpath-test-'));
      process.env['XDG_DATA_HOME'] = tmpBase;

      try {
        ensureStackDir();
        expect(() => ensureStackDir()).not.toThrow();
      } finally {
        rmSync(tmpBase, { recursive: true, force: true });
      }
    });
  });
});
