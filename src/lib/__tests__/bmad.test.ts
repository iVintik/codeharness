import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from 'node:child_process';
import {
  isBmadInstalled,
  installBmad,
  detectBmadVersion,
  detectBmalph,
  applyAllPatches,
  BmadError,
  PATCH_TARGETS,
} from '../bmad.js';

const mockExecFileSync = vi.mocked(execFileSync);

let testDir: string;

beforeEach(() => {
  vi.restoreAllMocks();
  testDir = mkdtempSync(join(tmpdir(), 'ch-bmad-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('BmadError', () => {
  it('includes command and original message in error message', () => {
    const err = new BmadError('npx bmad-method install', 'command not found');
    expect(err.message).toBe('BMAD failed: command not found. Command: npx bmad-method install');
    expect(err.name).toBe('BmadError');
    expect(err.command).toBe('npx bmad-method install');
    expect(err.originalMessage).toBe('command not found');
  });

  it('is an instance of Error', () => {
    const err = new BmadError('npx bmad-method install', 'failed');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('isBmadInstalled', () => {
  it('returns true when _bmad/ directory exists', () => {
    mkdirSync(join(testDir, '_bmad'), { recursive: true });
    expect(isBmadInstalled(testDir)).toBe(true);
  });

  it('returns false when _bmad/ directory does not exist', () => {
    expect(isBmadInstalled(testDir)).toBe(false);
  });
});

describe('detectBmadVersion', () => {
  it('extracts version from core/module.yaml', () => {
    const moduleDir = join(testDir, '_bmad', 'core');
    mkdirSync(moduleDir, { recursive: true });
    writeFileSync(join(moduleDir, 'module.yaml'), 'name: bmad-method\nversion: "6.2.0"\n');

    expect(detectBmadVersion(testDir)).toBe('6.2.0');
  });

  it('extracts unquoted version from core/module.yaml', () => {
    const moduleDir = join(testDir, '_bmad', 'core');
    mkdirSync(moduleDir, { recursive: true });
    writeFileSync(join(moduleDir, 'module.yaml'), 'name: bmad\nversion: 7.0.1\n');

    expect(detectBmadVersion(testDir)).toBe('7.0.1');
  });

  it('reads VERSION file when module.yaml not present', () => {
    mkdirSync(join(testDir, '_bmad'), { recursive: true });
    writeFileSync(join(testDir, '_bmad', 'VERSION'), '5.1.0\n');

    expect(detectBmadVersion(testDir)).toBe('5.1.0');
  });

  it('reads package.json version when other files not present', () => {
    mkdirSync(join(testDir, '_bmad'), { recursive: true });
    writeFileSync(join(testDir, '_bmad', 'package.json'), JSON.stringify({ version: '4.0.0' }));

    expect(detectBmadVersion(testDir)).toBe('4.0.0');
  });

  it('returns null when no version files exist', () => {
    mkdirSync(join(testDir, '_bmad'), { recursive: true });

    expect(detectBmadVersion(testDir)).toBeNull();
  });

  it('returns null when _bmad does not exist', () => {
    expect(detectBmadVersion(testDir)).toBeNull();
  });

  it('returns null for empty VERSION file', () => {
    mkdirSync(join(testDir, '_bmad'), { recursive: true });
    writeFileSync(join(testDir, '_bmad', 'VERSION'), '');

    expect(detectBmadVersion(testDir)).toBeNull();
  });

  it('returns null for invalid module.yaml content', () => {
    const moduleDir = join(testDir, '_bmad', 'core');
    mkdirSync(moduleDir, { recursive: true });
    writeFileSync(join(moduleDir, 'module.yaml'), 'no version here');

    // Falls through to VERSION file check, then package.json, then null
    expect(detectBmadVersion(testDir)).toBeNull();
  });

  it('returns null for invalid package.json', () => {
    mkdirSync(join(testDir, '_bmad'), { recursive: true });
    writeFileSync(join(testDir, '_bmad', 'package.json'), 'not json');

    expect(detectBmadVersion(testDir)).toBeNull();
  });

  it('returns null for package.json without version field', () => {
    mkdirSync(join(testDir, '_bmad'), { recursive: true });
    writeFileSync(join(testDir, '_bmad', 'package.json'), JSON.stringify({ name: 'bmad' }));

    expect(detectBmadVersion(testDir)).toBeNull();
  });
});

describe('installBmad', () => {
  it('runs npx bmad-method install with claude-code by default when _bmad/ does not exist', () => {
    // Simulate npx bmad-method install creating the _bmad/ directory
    mockExecFileSync.mockImplementation(() => {
      mkdirSync(join(testDir, '_bmad'), { recursive: true });
      return Buffer.from('');
    });

    const result = installBmad(testDir);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'npx',
      ['bmad-method', 'install', '--yes', '--directory', testDir, '--modules', 'bmm', '--tools', 'claude-code'],
      expect.objectContaining({ cwd: testDir, stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000 }),
    );
    expect(result.status).toBe('installed');
  });

  it('uses --tools none for opencode installs', () => {
    mockExecFileSync.mockImplementation(() => {
      mkdirSync(join(testDir, '_bmad'), { recursive: true });
      return Buffer.from('');
    });

    installBmad(testDir, 'opencode');
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'npx',
      ['bmad-method', 'install', '--yes', '--directory', testDir, '--modules', 'bmm', '--tools', 'none'],
      expect.objectContaining({ cwd: testDir, stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000 }),
    );
  });

  it('skips when _bmad/ already exists and returns already-installed', () => {
    mkdirSync(join(testDir, '_bmad'), { recursive: true });
    mockExecFileSync.mockClear();

    const result = installBmad(testDir);
    expect(mockExecFileSync).not.toHaveBeenCalled();
    expect(result.status).toBe('already-installed');
  });

  it('returns version when detectable after install', () => {
    mkdirSync(join(testDir, '_bmad', 'core'), { recursive: true });
    writeFileSync(join(testDir, '_bmad', 'core', 'module.yaml'), 'version: "6.0.0"');

    const result = installBmad(testDir);
    expect(result.status).toBe('already-installed');
    expect(result.version).toBe('6.0.0');
  });

  it('throws BmadError when npx bmad-method install fails', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('npx not found');
    });

    expect(() => installBmad(testDir)).toThrow(BmadError);
    try {
      installBmad(testDir);
    } catch (err) {
      const bmadErr = err as BmadError;
      expect(bmadErr.command).toContain('npx bmad-method install --yes --directory');
      expect(bmadErr.originalMessage).toBe('npx not found');
    }
  });

  it('wraps non-Error throws with BmadError', () => {
    mockExecFileSync.mockImplementation(() => {
      throw 'string error';
    });

    expect(() => installBmad(testDir)).toThrow(BmadError);
    try {
      installBmad(testDir);
    } catch (err) {
      expect((err as BmadError).originalMessage).toBe('string error');
    }
  });

  it('throws BmadError when npx succeeds but _bmad/ is not created', () => {
    // npx exits successfully but doesn't create _bmad/
    mockExecFileSync.mockReturnValue(Buffer.from(''));

    expect(() => installBmad(testDir)).toThrow(BmadError);
    try {
      installBmad(testDir);
    } catch (err) {
      const bmadErr = err as BmadError;
      expect(bmadErr.originalMessage).toContain('_bmad/ directory was not created');
    }
  });
});

describe('detectBmalph', () => {
  it('detects .ralph/.ralphrc file', () => {
    mkdirSync(join(testDir, '.ralph'), { recursive: true });
    writeFileSync(join(testDir, '.ralph', '.ralphrc'), 'bmalph config');

    const result = detectBmalph(testDir);
    expect(result.detected).toBe(true);
    expect(result.files).toContain('.ralph/.ralphrc');
  });

  it('detects .ralph/ directory without .ralphrc', () => {
    mkdirSync(join(testDir, '.ralph'), { recursive: true });

    const result = detectBmalph(testDir);
    expect(result.detected).toBe(true);
    expect(result.files).toContain('.ralph/');
  });

  it('returns detected: false when no bmalph artifacts exist', () => {
    const result = detectBmalph(testDir);
    expect(result.detected).toBe(false);
    expect(result.files).toEqual([]);
  });
});

describe('applyAllPatches', () => {
  function createBmadWorkflowFiles(dir: string): void {
    for (const relativePath of Object.values(PATCH_TARGETS)) {
      const fullPath = join(dir, '_bmad', relativePath);
      const parentDir = fullPath.replace(/\/[^/]+$/, '');
      mkdirSync(parentDir, { recursive: true });
      writeFileSync(fullPath, `# Workflow file\n\nSome existing content.\n`);
    }
  }

  // Patch engine removed (Story 1.2) — applyAllPatches now returns applied:false for all patches.
  // These tests verify the no-op behavior.

  it('returns applied:false with removal message for all patches (patch engine removed)', () => {
    createBmadWorkflowFiles(testDir);

    const results = applyAllPatches(testDir);
    expect(results).toHaveLength(7);
    for (const r of results) {
      expect(r.applied).toBe(false);
      expect(r.error).toContain('Patch engine removed');
    }
  });

  it('handles missing target files gracefully with warning', () => {
    mkdirSync(join(testDir, '_bmad'), { recursive: true });
    // Don't create any workflow files

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const results = applyAllPatches(testDir);
    consoleSpy.mockRestore();

    expect(results).toHaveLength(7);
    for (const r of results) {
      expect(r.applied).toBe(false);
      expect(r.error).toContain('File not found');
    }
  });

  it('returns correct patchName and targetFile for each result', () => {
    createBmadWorkflowFiles(testDir);

    const results = applyAllPatches(testDir);
    for (const r of results) {
      expect(PATCH_TARGETS).toHaveProperty(r.patchName);
      expect(r.targetFile).toContain(PATCH_TARGETS[r.patchName]);
    }
  });

  it('suppresses warn() output when silent option is true', () => {
    mkdirSync(join(testDir, '_bmad'), { recursive: true });
    // Don't create workflow files — triggers warn() for missing targets

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    applyAllPatches(testDir, { silent: true });
    const warnCalls = consoleSpy.mock.calls.filter(args =>
      typeof args[0] === 'string' && args[0].includes('Patch target not found'),
    );
    consoleSpy.mockRestore();

    expect(warnCalls).toHaveLength(0);
  });
});
