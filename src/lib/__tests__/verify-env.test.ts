import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Mock child_process
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

// Mock docker module
vi.mock('../docker.js', () => ({
  isDockerAvailable: vi.fn(() => true),
}));

// Mock state module
vi.mock('../state.js', () => ({
  readStateWithBody: vi.fn(() => ({
    state: {
      harness_version: '0.1.0',
      initialized: true,
      stack: 'nodejs',
      enforcement: { frontend: true, database: true, api: true },
      coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
      session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
      verification_log: [],
    },
    body: '\n# Codeharness State\n',
  })),
  writeState: vi.fn(),
}));

// Mock stack-detect module
vi.mock('../stack-detect.js', () => ({
  detectStack: vi.fn(() => 'nodejs'),
}));

// Mock template module
vi.mock('../../templates/verify-dockerfile.js', () => ({
  verifyDockerfileTemplate: vi.fn(() => 'FROM node:20-slim\nRUN echo "mock"'),
}));

import { execFileSync } from 'node:child_process';
import { isDockerAvailable } from '../docker.js';
import { detectStack } from '../stack-detect.js';
import { readStateWithBody, writeState } from '../state.js';
import { verifyDockerfileTemplate } from '../../templates/verify-dockerfile.js';
import {
  isValidStoryKey,
  computeDistHash,
  buildVerifyImage,
  prepareVerifyWorkspace,
  checkVerifyEnv,
  cleanupVerifyEnv,
} from '../verify-env.js';

const mockExecFileSync = vi.mocked(execFileSync);
const mockIsDockerAvailable = vi.mocked(isDockerAvailable);
const mockDetectStack = vi.mocked(detectStack);
const mockReadStateWithBody = vi.mocked(readStateWithBody);
const mockWriteState = vi.mocked(writeState);
const mockVerifyDockerfileTemplate = vi.mocked(verifyDockerfileTemplate);

let testDir: string;

beforeEach(() => {
  vi.clearAllMocks();
  testDir = mkdtempSync(join(tmpdir(), 'ch-verify-env-test-'));
  // Reset default mock behaviors after clearAllMocks
  mockIsDockerAvailable.mockReturnValue(true);
  mockDetectStack.mockReturnValue('nodejs');
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// ─── isValidStoryKey ────────────────────────────────────────────────────────

describe('isValidStoryKey', () => {
  it('accepts valid story keys', () => {
    expect(isValidStoryKey('13-1-verification-dockerfile-generator')).toBe(true);
    expect(isValidStoryKey('story_key_123')).toBe(true);
    expect(isValidStoryKey('abc')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidStoryKey('')).toBe(false);
  });

  it('rejects path traversal', () => {
    expect(isValidStoryKey('../etc/passwd')).toBe(false);
    expect(isValidStoryKey('foo/../bar')).toBe(false);
  });

  it('rejects forward slashes', () => {
    expect(isValidStoryKey('foo/bar')).toBe(false);
  });

  it('rejects backslashes', () => {
    expect(isValidStoryKey('foo\\bar')).toBe(false);
  });

  it('rejects special characters', () => {
    expect(isValidStoryKey('foo bar')).toBe(false);
    expect(isValidStoryKey('foo$bar')).toBe(false);
    expect(isValidStoryKey('foo;bar')).toBe(false);
    expect(isValidStoryKey('foo|bar')).toBe(false);
  });
});

// ─── computeDistHash ────────────────────────────────────────────────────────

describe('computeDistHash', () => {
  it('returns null when dist/ does not exist', () => {
    expect(computeDistHash(testDir)).toBeNull();
  });

  it('computes a hash for dist/ files', () => {
    const distDir = join(testDir, 'dist');
    mkdirSync(distDir);
    writeFileSync(join(distDir, 'index.js'), 'console.log("hello")');
    writeFileSync(join(distDir, 'utils.js'), 'export function foo() {}');

    const hash = computeDistHash(testDir);
    expect(hash).toBeTruthy();
    expect(typeof hash).toBe('string');
    expect(hash!.length).toBe(64); // SHA-256 hex
  });

  it('produces different hashes for different content', () => {
    const distDir = join(testDir, 'dist');
    mkdirSync(distDir);

    writeFileSync(join(distDir, 'index.js'), 'version 1');
    const hash1 = computeDistHash(testDir);

    writeFileSync(join(distDir, 'index.js'), 'version 2');
    const hash2 = computeDistHash(testDir);

    expect(hash1).not.toBe(hash2);
  });

  it('produces same hash for same content', () => {
    const distDir = join(testDir, 'dist');
    mkdirSync(distDir);
    writeFileSync(join(distDir, 'index.js'), 'stable content');

    const hash1 = computeDistHash(testDir);
    const hash2 = computeDistHash(testDir);

    expect(hash1).toBe(hash2);
  });

  it('includes nested files in hash', () => {
    const distDir = join(testDir, 'dist');
    mkdirSync(join(distDir, 'sub'), { recursive: true });
    writeFileSync(join(distDir, 'index.js'), 'main');

    const hash1 = computeDistHash(testDir);

    writeFileSync(join(distDir, 'sub', 'nested.js'), 'nested');
    const hash2 = computeDistHash(testDir);

    expect(hash1).not.toBe(hash2);
  });
});

// ─── buildVerifyImage ───────────────────────────────────────────────────────

describe('buildVerifyImage', () => {
  it('throws when Docker is not available', () => {
    mockIsDockerAvailable.mockReturnValue(false);
    expect(() => buildVerifyImage({ projectDir: testDir })).toThrow('Docker is not available');
  });

  it('throws when stack is not detected', () => {
    mockDetectStack.mockReturnValue(null);
    expect(() => buildVerifyImage({ projectDir: testDir })).toThrow('Cannot detect project stack');
  });

  it('throws when dist/ does not exist', () => {
    expect(() => buildVerifyImage({ projectDir: testDir })).toThrow('No dist/ directory found');
  });

  it('returns cached result when hash matches and image exists', () => {
    // Setup dist/
    const distDir = join(testDir, 'dist');
    mkdirSync(distDir);
    writeFileSync(join(distDir, 'index.js'), 'content');

    const hash = computeDistHash(testDir)!;
    mockReadStateWithBody.mockReturnValue({
      state: { verify_env_dist_hash: hash } as any,
      body: '',
    });

    // Image exists
    mockExecFileSync.mockReturnValue(Buffer.from('[{"Id":"abc"}]'));

    const result = buildVerifyImage({ projectDir: testDir });
    expect(result.cached).toBe(true);
    expect(result.buildTimeMs).toBe(0);
  });

  it('builds when hash differs', () => {
    const distDir = join(testDir, 'dist');
    mkdirSync(distDir);
    writeFileSync(join(distDir, 'index.js'), 'content');

    // Create fake tarball that npm pack would produce
    writeFileSync('/tmp/codeharness-0.13.2.tgz', 'fake-tarball');

    // Return a different hash from state
    mockReadStateWithBody.mockReturnValue({
      state: { verify_env_dist_hash: 'oldhash' } as any,
      body: '',
    });

    // npm pack returns tarball name
    mockExecFileSync
      .mockReturnValueOnce(Buffer.from('codeharness-0.13.2.tgz')) // npm pack
      .mockReturnValueOnce(Buffer.from('')) // docker build
      .mockReturnValueOnce(Buffer.from('250000000')); // docker image inspect (size)

    const result = buildVerifyImage({ projectDir: testDir });
    expect(result.cached).toBe(false);
    expect(result.imageTag).toBe('codeharness-verify');
    expect(result.buildTimeMs).toBeGreaterThanOrEqual(0);

    // Cleanup
    try { rmSync('/tmp/codeharness-0.13.2.tgz', { force: true }); } catch {}
  });

  it('returns cached result regardless of caller context', () => {
    const distDir = join(testDir, 'dist');
    mkdirSync(distDir);
    writeFileSync(join(distDir, 'index.js'), 'content');

    const hash = computeDistHash(testDir)!;
    mockReadStateWithBody.mockReturnValue({
      state: { verify_env_dist_hash: hash } as any,
      body: '',
    });

    mockExecFileSync.mockReturnValue(Buffer.from('[{"Id":"abc"}]'));

    const result = buildVerifyImage({ projectDir: testDir });
    expect(result.cached).toBe(true);
    expect(result.imageTag).toBe('codeharness-verify');
  });

  it('selects correct install strategy for Python stack', () => {
    const distDir = join(testDir, 'dist');
    mkdirSync(distDir);
    writeFileSync(join(distDir, 'mypackage-0.1.0.tar.gz'), 'fake-tarball');

    mockDetectStack.mockReturnValue('python');
    mockReadStateWithBody.mockReturnValue({
      state: { verify_env_dist_hash: 'oldhash' } as any,
      body: '',
    });

    mockExecFileSync
      .mockReturnValueOnce(Buffer.from('')) // docker build
      .mockReturnValueOnce(Buffer.from('100000000')); // docker image inspect (size)

    const result = buildVerifyImage({ projectDir: testDir });
    expect(result.cached).toBe(false);
    expect(result.imageTag).toBe('codeharness-verify');
    expect(mockVerifyDockerfileTemplate).toHaveBeenCalledWith({
      stack: 'python',
      distFileName: 'mypackage-0.1.0.tar.gz',
    });
  });

  it('throws when npm pack produces empty output', () => {
    const distDir = join(testDir, 'dist');
    mkdirSync(distDir);
    writeFileSync(join(distDir, 'index.js'), 'content');

    mockReadStateWithBody.mockReturnValue({
      state: { verify_env_dist_hash: 'oldhash' } as any,
      body: '',
    });

    // npm pack returns empty string
    mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

    expect(() => buildVerifyImage({ projectDir: testDir })).toThrow('npm pack produced no output');
  });
});

// ─── prepareVerifyWorkspace ─────────────────────────────────────────────────

describe('prepareVerifyWorkspace', () => {
  it('creates workspace with correct structure', () => {
    // Setup project structure
    const storyDir = join(testDir, '_bmad-output', 'implementation-artifacts');
    mkdirSync(storyDir, { recursive: true });
    writeFileSync(join(storyDir, 'test-story.md'), '# Test Story');
    writeFileSync(join(testDir, 'README.md'), '# Readme');
    mkdirSync(join(testDir, 'docs'));
    writeFileSync(join(testDir, 'docs', 'guide.md'), '# Guide');

    const workspace = prepareVerifyWorkspace('test-story', testDir);

    expect(existsSync(join(workspace, 'story.md'))).toBe(true);
    expect(existsSync(join(workspace, 'README.md'))).toBe(true);
    expect(existsSync(join(workspace, 'docs', 'guide.md'))).toBe(true);
    expect(existsSync(join(workspace, 'verification'))).toBe(true);

    // Cleanup
    rmSync(workspace, { recursive: true, force: true });
  });

  it('excludes forbidden directories', () => {
    const storyDir = join(testDir, '_bmad-output', 'implementation-artifacts');
    mkdirSync(storyDir, { recursive: true });
    writeFileSync(join(storyDir, 'test-story-2.md'), '# Test Story');

    // Create directories that should NOT be in workspace
    mkdirSync(join(testDir, 'src'));
    writeFileSync(join(testDir, 'src', 'index.ts'), 'export {}');
    mkdirSync(join(testDir, 'tests'));
    mkdirSync(join(testDir, 'node_modules'));

    const workspace = prepareVerifyWorkspace('test-story-2', testDir);

    expect(existsSync(join(workspace, 'src'))).toBe(false);
    expect(existsSync(join(workspace, 'tests'))).toBe(false);
    expect(existsSync(join(workspace, '.git'))).toBe(false);
    expect(existsSync(join(workspace, 'node_modules'))).toBe(false);

    // Cleanup
    rmSync(workspace, { recursive: true, force: true });
  });

  it('throws on invalid story key', () => {
    expect(() => prepareVerifyWorkspace('../etc/passwd', testDir)).toThrow('Invalid story key');
  });

  it('throws when story file does not exist', () => {
    expect(() => prepareVerifyWorkspace('nonexistent-story', testDir)).toThrow('Story file not found');
  });

  it('handles missing README.md gracefully', () => {
    const storyDir = join(testDir, '_bmad-output', 'implementation-artifacts');
    mkdirSync(storyDir, { recursive: true });
    writeFileSync(join(storyDir, 'no-readme-story.md'), '# Story');

    const workspace = prepareVerifyWorkspace('no-readme-story', testDir);
    expect(existsSync(join(workspace, 'story.md'))).toBe(true);
    expect(existsSync(join(workspace, 'README.md'))).toBe(false);

    // Cleanup
    rmSync(workspace, { recursive: true, force: true });
  });

  it('handles missing docs/ gracefully', () => {
    const storyDir = join(testDir, '_bmad-output', 'implementation-artifacts');
    mkdirSync(storyDir, { recursive: true });
    writeFileSync(join(storyDir, 'no-docs-story.md'), '# Story');

    const workspace = prepareVerifyWorkspace('no-docs-story', testDir);
    expect(existsSync(join(workspace, 'story.md'))).toBe(true);
    expect(existsSync(join(workspace, 'docs'))).toBe(false);

    // Cleanup
    rmSync(workspace, { recursive: true, force: true });
  });

  it('replaces existing workspace', () => {
    const storyDir = join(testDir, '_bmad-output', 'implementation-artifacts');
    mkdirSync(storyDir, { recursive: true });
    writeFileSync(join(storyDir, 'replace-story.md'), '# Story');

    const workspace1 = prepareVerifyWorkspace('replace-story', testDir);
    writeFileSync(join(workspace1, 'old-file.txt'), 'old');

    const workspace2 = prepareVerifyWorkspace('replace-story', testDir);
    expect(workspace1).toBe(workspace2);
    expect(existsSync(join(workspace2, 'old-file.txt'))).toBe(false);

    // Cleanup
    rmSync(workspace2, { recursive: true, force: true });
  });
});

// ─── checkVerifyEnv ─────────────────────────────────────────────────────────

describe('checkVerifyEnv', () => {
  it('returns all false when image does not exist', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('No such image');
    });

    const result = checkVerifyEnv();
    expect(result.imageExists).toBe(false);
    expect(result.cliWorks).toBe(false);
    expect(result.otelReachable).toBe(false);
  });

  it('returns imageExists=true, cliWorks=true, otelReachable=false when otel fails', () => {
    mockExecFileSync.mockImplementation((_cmd: unknown, args: unknown) => {
      const argArr = args as string[];
      // image inspect succeeds
      if (argArr.includes('inspect') && argArr.includes('codeharness-verify')) {
        return Buffer.from('[{"Id":"abc"}]');
      }
      // codeharness --version succeeds
      if (argArr.includes('--version')) {
        return Buffer.from('0.13.2');
      }
      // curl to otel fails
      if (argArr.includes('curl')) {
        throw new Error('curl failed');
      }
      return Buffer.from('');
    });

    const result = checkVerifyEnv();
    expect(result.imageExists).toBe(true);
    expect(result.cliWorks).toBe(true);
    expect(result.otelReachable).toBe(false);
  });

  it('returns all true when everything succeeds', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('ok'));

    const result = checkVerifyEnv();
    expect(result.imageExists).toBe(true);
    expect(result.cliWorks).toBe(true);
    expect(result.otelReachable).toBe(true);
  });
});

// ─── cleanupVerifyEnv ───────────────────────────────────────────────────────

describe('cleanupVerifyEnv', () => {
  it('throws on invalid story key', () => {
    expect(() => cleanupVerifyEnv('../etc/passwd')).toThrow('Invalid story key');
  });

  it('is idempotent when workspace does not exist', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('No such container');
    });

    // Should not throw
    cleanupVerifyEnv('nonexistent-story');
  });

  it('removes workspace if it exists', () => {
    const workspace = `/tmp/codeharness-verify-cleanup-test-ws`;
    mkdirSync(workspace, { recursive: true });
    writeFileSync(join(workspace, 'test.txt'), 'test');

    mockExecFileSync.mockImplementation(() => {
      throw new Error('No such container');
    });

    cleanupVerifyEnv('cleanup-test-ws');
    expect(existsSync(workspace)).toBe(false);
  });

  it('calls docker stop and docker rm', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));

    cleanupVerifyEnv('my-story');

    const calls = mockExecFileSync.mock.calls;
    const stopCall = calls.find(c => (c[1] as string[]).includes('stop'));
    const rmCall = calls.find(c => (c[1] as string[]).includes('rm'));

    expect(stopCall).toBeDefined();
    expect((stopCall![1] as string[])).toContain('codeharness-verify-my-story');
    expect(rmCall).toBeDefined();
    expect((rmCall![1] as string[])).toContain('codeharness-verify-my-story');
  });
});
