import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Mock child_process
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

// Mock docker module
vi.mock('../../../lib/docker.js', () => ({
  isDockerAvailable: vi.fn(() => true),
}));

// Mock state module
vi.mock('../../../lib/state.js', () => ({
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
vi.mock('../../../lib/stack-detect.js', () => ({
  detectStack: vi.fn(() => 'nodejs'),
}));

import { execFileSync } from 'node:child_process';
import { isDockerAvailable } from '../../../lib/docker.js';
import { detectStack } from '../../../lib/stack-detect.js';
import { readStateWithBody, writeState } from '../../../lib/state.js';
import {
  isValidStoryKey,
  computeDistHash,
  buildVerifyImage,
  detectProjectType,
  prepareVerifyWorkspace,
  checkVerifyEnv,
  cleanupVerifyEnv,
  cleanupStaleContainers,
} from '../env.js';

const mockExecFileSync = vi.mocked(execFileSync);
const mockIsDockerAvailable = vi.mocked(isDockerAvailable);
const mockDetectStack = vi.mocked(detectStack);
const mockReadStateWithBody = vi.mocked(readStateWithBody);
const mockWriteState = vi.mocked(writeState);

let testDir: string;

beforeEach(() => {
  vi.clearAllMocks();
  testDir = mkdtempSync(join(tmpdir(), 'ch-verify-env-test-'));
  // Create templates/Dockerfile.verify so buildVerifyImage can find it
  mkdirSync(join(testDir, 'templates'), { recursive: true });
  writeFileSync(join(testDir, 'templates', 'Dockerfile.verify'), 'FROM node:20-slim\nARG TARBALL=package.tgz\nCOPY ${TARBALL} /tmp/\n');
  writeFileSync(join(testDir, 'templates', 'Dockerfile.verify.generic'), 'FROM node:20-slim\nRUN apt-get update\n');
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

  it('builds generic image when stack is not detected (AC #4, #8)', () => {
    mockDetectStack.mockReturnValue(null);

    mockExecFileSync
      .mockReturnValueOnce(Buffer.from('')) // docker build
      .mockReturnValueOnce(Buffer.from('50000000')); // docker image inspect (size)

    const result = buildVerifyImage({ projectDir: testDir });
    expect(result.cached).toBe(false);
    expect(result.imageTag).toBe('codeharness-verify');

    // Verify docker build was called (no --build-arg for generic)
    const buildCall = mockExecFileSync.mock.calls.find(
      c => (c[1] as string[]).includes('build'),
    );
    expect(buildCall).toBeDefined();
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
      state: { verify_env_dist_hash: hash } as ReturnType<typeof readStateWithBody>['state'],
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
      state: { verify_env_dist_hash: 'oldhash' } as ReturnType<typeof readStateWithBody>['state'],
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
      state: { verify_env_dist_hash: hash } as ReturnType<typeof readStateWithBody>['state'],
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
      state: { verify_env_dist_hash: 'oldhash' } as ReturnType<typeof readStateWithBody>['state'],
      body: '',
    });

    mockExecFileSync
      .mockReturnValueOnce(Buffer.from('')) // docker build
      .mockReturnValueOnce(Buffer.from('100000000')); // docker image inspect (size)

    const result = buildVerifyImage({ projectDir: testDir });
    expect(result.cached).toBe(false);
    expect(result.imageTag).toBe('codeharness-verify');

    // Verify docker build was called with --build-arg TARBALL=mypackage-0.1.0.tar.gz
    const buildCall = mockExecFileSync.mock.calls.find(
      c => (c[1] as string[]).includes('build'),
    );
    expect(buildCall).toBeDefined();
    expect((buildCall![1] as string[])).toContain('--build-arg');
    expect((buildCall![1] as string[]).join(' ')).toContain('TARBALL=mypackage-0.1.0.tar.gz');
  });

  it('throws when Python dist/ has no .tar.gz or .whl files', () => {
    const distDir = join(testDir, 'dist');
    mkdirSync(distDir);
    writeFileSync(join(distDir, 'README.md'), 'not a distribution file');

    mockDetectStack.mockReturnValue('python');
    mockReadStateWithBody.mockReturnValue({
      state: { verify_env_dist_hash: 'oldhash' } as ReturnType<typeof readStateWithBody>['state'],
      body: '',
    });

    expect(() => buildVerifyImage({ projectDir: testDir })).toThrow('No distribution files found');
  });

  it('handles state read failure gracefully (returns null for stored hash)', () => {
    const distDir = join(testDir, 'dist');
    mkdirSync(distDir);
    writeFileSync(join(distDir, 'index.js'), 'content');
    writeFileSync('/tmp/codeharness-0.13.2.tgz', 'fake-tarball');

    // State read throws — should fall back to no cached hash
    mockReadStateWithBody.mockImplementation(() => {
      throw new Error('State file not found');
    });

    mockExecFileSync
      .mockReturnValueOnce(Buffer.from('codeharness-0.13.2.tgz')) // npm pack
      .mockReturnValueOnce(Buffer.from('')) // docker build
      .mockReturnValueOnce(Buffer.from('50000000')); // size

    const result = buildVerifyImage({ projectDir: testDir });
    expect(result.cached).toBe(false);
    try { rmSync('/tmp/codeharness-0.13.2.tgz', { force: true }); } catch {}
  });

  it('handles state write failure gracefully when storing dist hash', () => {
    const distDir = join(testDir, 'dist');
    mkdirSync(distDir);
    writeFileSync(join(distDir, 'index.js'), 'content');
    writeFileSync('/tmp/codeharness-0.13.2.tgz', 'fake-tarball');

    // First call: readStateWithBody for getStoredDistHash — returns different hash
    // Second call: readStateWithBody for storeDistHash — throws
    let readCallCount = 0;
    mockReadStateWithBody.mockImplementation(() => {
      readCallCount++;
      if (readCallCount === 1) {
        return {
          state: { verify_env_dist_hash: 'oldhash' } as ReturnType<typeof readStateWithBody>['state'],
          body: '',
        };
      }
      throw new Error('Cannot write state');
    });

    mockExecFileSync
      .mockReturnValueOnce(Buffer.from('codeharness-0.13.2.tgz')) // npm pack
      .mockReturnValueOnce(Buffer.from('')) // docker build
      .mockReturnValueOnce(Buffer.from('50000000')); // size

    // Should not throw even though state write fails
    const result = buildVerifyImage({ projectDir: testDir });
    expect(result.cached).toBe(false);
    try { rmSync('/tmp/codeharness-0.13.2.tgz', { force: true }); } catch {}
  });

  it('throws when npm pack produces empty output', () => {
    const distDir = join(testDir, 'dist');
    mkdirSync(distDir);
    writeFileSync(join(distDir, 'index.js'), 'content');

    mockReadStateWithBody.mockReturnValue({
      state: { verify_env_dist_hash: 'oldhash' } as ReturnType<typeof readStateWithBody>['state'],
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
    let runCallCount = 0;
    mockExecFileSync.mockImplementation((_cmd: unknown, args: unknown) => {
      const argArr = args as string[];
      // image inspect succeeds
      if (argArr.includes('inspect') && argArr.includes('codeharness-verify')) {
        return Buffer.from('[{"Id":"abc"}]');
      }
      // docker run --rm codeharness-verify codeharness --help succeeds (first run call)
      if (argArr.includes('run') && argArr.includes('--help')) {
        runCallCount++;
        if (runCallCount === 1) {
          return Buffer.from('Usage: codeharness');
        }
      }
      // curl to otel fails (second docker run call)
      if (argArr.includes('run') && argArr.includes('curl')) {
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

  it('returns cliWorks=false when docker run fails (broken CLI inside container)', () => {
    mockExecFileSync.mockImplementation((_cmd: unknown, args: unknown) => {
      const argArr = args as string[];
      // image inspect succeeds
      if (argArr.includes('inspect') && argArr.includes('codeharness-verify')) {
        return Buffer.from('[{"Id":"abc"}]');
      }
      // docker run --rm fails — CLI broken or missing inside image
      if (argArr.includes('run') && argArr.includes('--help')) {
        throw new Error('command not found');
      }
      // otel check — won't reach this since cliWorks failure doesn't short-circuit
      return Buffer.from('ok');
    });

    const result = checkVerifyEnv();
    expect(result.imageExists).toBe(true);
    expect(result.cliWorks).toBe(false);
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

// ─── cleanupStaleContainers ──────────────────────────────────────────────────

describe('cleanupStaleContainers', () => {
  it('removes all matching containers', () => {
    mockExecFileSync.mockImplementation((_cmd: unknown, args: unknown) => {
      const argArr = args as string[];
      if (argArr.includes('ps')) {
        return Buffer.from('codeharness-verify-story-1\ncodeharness-verify-story-2\n');
      }
      // docker rm -f succeeds
      return Buffer.from('');
    });

    cleanupStaleContainers();

    const rmCalls = mockExecFileSync.mock.calls.filter(
      c => (c[1] as string[]).includes('rm'),
    );
    expect(rmCalls.length).toBe(2);
    expect((rmCalls[0][1] as string[])).toContain('codeharness-verify-story-1');
    expect((rmCalls[1][1] as string[])).toContain('codeharness-verify-story-2');
  });

  it('handles no containers gracefully', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));

    // Should not throw
    cleanupStaleContainers();
  });

  it('handles docker not available gracefully', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('Docker not available');
    });

    // Should not throw
    cleanupStaleContainers();
  });

  it('continues removing other containers if one rm fails', () => {
    let rmCallCount = 0;
    mockExecFileSync.mockImplementation((_cmd: unknown, args: unknown) => {
      const argArr = args as string[];
      if (argArr.includes('ps')) {
        return Buffer.from('codeharness-verify-a\ncodeharness-verify-b\n');
      }
      if (argArr.includes('rm')) {
        rmCallCount++;
        if (rmCallCount === 1) throw new Error('container busy');
        return Buffer.from('');
      }
      return Buffer.from('');
    });

    cleanupStaleContainers();
    expect(rmCallCount).toBe(2); // Both attempted
  });
});

// ─── detectProjectType ──────────────────────────────────────────────────────

describe('detectProjectType', () => {
  it('returns plugin when .claude-plugin/plugin.json exists and stack is unknown', () => {
    mockDetectStack.mockReturnValue(null);
    mkdirSync(join(testDir, '.claude-plugin'), { recursive: true });
    writeFileSync(join(testDir, '.claude-plugin', 'plugin.json'), '{}');
    expect(detectProjectType(testDir)).toBe('plugin');
  });

  it('returns nodejs when detectStack returns nodejs', () => {
    mockDetectStack.mockReturnValue('nodejs');
    expect(detectProjectType(testDir)).toBe('nodejs');
  });

  it('returns python when detectStack returns python', () => {
    mockDetectStack.mockReturnValue('python');
    expect(detectProjectType(testDir)).toBe('python');
  });

  it('returns generic when detectStack returns null', () => {
    mockDetectStack.mockReturnValue(null);
    expect(detectProjectType(testDir)).toBe('generic');
  });

  it('returns rust when detectStack returns rust', () => {
    mockDetectStack.mockReturnValue('rust' as ReturnType<typeof detectStack>);
    expect(detectProjectType(testDir)).toBe('rust');
  });

  it('prioritizes nodejs over plugin when both exist', () => {
    mkdirSync(join(testDir, '.claude-plugin'), { recursive: true });
    writeFileSync(join(testDir, '.claude-plugin', 'plugin.json'), '{}');
    mockDetectStack.mockReturnValue('nodejs');
    expect(detectProjectType(testDir)).toBe('nodejs');
  });
});

// ─── buildVerifyImage — plugin and generic paths ────────────────────────────

describe('buildVerifyImage — plugin project (AC #2)', () => {
  it('builds plugin image when .claude-plugin/plugin.json exists and stack is unknown', () => {
    mockDetectStack.mockReturnValue(null);
    mkdirSync(join(testDir, '.claude-plugin'), { recursive: true });
    writeFileSync(join(testDir, '.claude-plugin', 'plugin.json'), '{"name":"test"}');
    mkdirSync(join(testDir, 'commands'), { recursive: true });
    writeFileSync(join(testDir, 'commands', 'test.md'), '# Test command');

    mockExecFileSync
      .mockReturnValueOnce(Buffer.from('')) // docker build
      .mockReturnValueOnce(Buffer.from('80000000')); // docker image inspect (size)

    const result = buildVerifyImage({ projectDir: testDir });
    expect(result.cached).toBe(false);
    expect(result.imageTag).toBe('codeharness-verify');

    const buildCall = mockExecFileSync.mock.calls.find(
      c => (c[1] as string[]).includes('build'),
    );
    expect(buildCall).toBeDefined();
  });

  it('does not throw for plugin projects without dist/', () => {
    mockDetectStack.mockReturnValue(null);
    mkdirSync(join(testDir, '.claude-plugin'), { recursive: true });
    writeFileSync(join(testDir, '.claude-plugin', 'plugin.json'), '{}');

    mockExecFileSync
      .mockReturnValueOnce(Buffer.from('')) // docker build
      .mockReturnValueOnce(Buffer.from('50000000')); // docker image inspect (size)

    expect(() => buildVerifyImage({ projectDir: testDir })).not.toThrow();
  });
});

// ─── buildVerifyImage — Rust project (AC #3, #4, #5, #6) ────────────────────

describe('buildVerifyImage — Rust project', () => {
  it('builds Rust image when detectStack returns rust (AC #4)', () => {
    mockDetectStack.mockReturnValue('rust' as ReturnType<typeof detectStack>);
    writeFileSync(join(testDir, 'templates', 'Dockerfile.verify.rust'), 'FROM rust:1.82-slim\n');

    mockExecFileSync
      .mockReturnValueOnce(Buffer.from('')) // docker build
      .mockReturnValueOnce(Buffer.from('150000000')); // docker image inspect (size)

    const result = buildVerifyImage({ projectDir: testDir });
    expect(result.cached).toBe(false);
    expect(result.imageTag).toBe('codeharness-verify');

    const buildCall = mockExecFileSync.mock.calls.find(
      c => (c[1] as string[]).includes('build'),
    );
    expect(buildCall).toBeDefined();
    // Rust build should NOT have --build-arg TARBALL (no tarball for Rust)
    expect((buildCall![1] as string[])).not.toContain('--build-arg');
  });

  it('does not throw for Rust projects without dist/ (AC #4)', () => {
    mockDetectStack.mockReturnValue('rust' as ReturnType<typeof detectStack>);
    writeFileSync(join(testDir, 'templates', 'Dockerfile.verify.rust'), 'FROM rust:1.82-slim\n');

    mockExecFileSync
      .mockReturnValueOnce(Buffer.from('')) // docker build
      .mockReturnValueOnce(Buffer.from('150000000')); // docker image inspect (size)

    expect(() => buildVerifyImage({ projectDir: testDir })).not.toThrow();
  });

  it('resolves Dockerfile.verify.rust template for rust variant (AC #5)', () => {
    writeFileSync(join(testDir, 'templates', 'Dockerfile.verify.rust'), 'FROM rust:1.82-slim\n');
    mockDetectStack.mockReturnValue('rust' as ReturnType<typeof detectStack>);

    mockExecFileSync
      .mockReturnValueOnce(Buffer.from('')) // docker build
      .mockReturnValueOnce(Buffer.from('150000000')); // docker image inspect (size)

    buildVerifyImage({ projectDir: testDir });

    // Verify docker build was called (proves the Dockerfile was found and used)
    const buildCall = mockExecFileSync.mock.calls.find(
      c => (c[1] as string[]).includes('build'),
    );
    expect(buildCall).toBeDefined();
  });
});

describe('buildVerifyImage — size formatting', () => {
  it('formats GB-range sizes', () => {
    const distDir = join(testDir, 'dist');
    mkdirSync(distDir);
    writeFileSync(join(distDir, 'index.js'), 'content');
    writeFileSync('/tmp/codeharness-0.13.2.tgz', 'fake-tarball');

    mockReadStateWithBody.mockReturnValue({
      state: { verify_env_dist_hash: 'oldhash' } as ReturnType<typeof readStateWithBody>['state'],
      body: '',
    });

    mockExecFileSync
      .mockReturnValueOnce(Buffer.from('codeharness-0.13.2.tgz')) // npm pack
      .mockReturnValueOnce(Buffer.from('')) // docker build
      .mockReturnValueOnce(Buffer.from('2500000000')); // 2.5GB

    const result = buildVerifyImage({ projectDir: testDir });
    expect(result.imageSize).toBe('2.5GB');
    try { rmSync('/tmp/codeharness-0.13.2.tgz', { force: true }); } catch {}
  });

  it('formats KB-range sizes', () => {
    const distDir = join(testDir, 'dist');
    mkdirSync(distDir);
    writeFileSync(join(distDir, 'index.js'), 'content');
    writeFileSync('/tmp/codeharness-0.13.2.tgz', 'fake-tarball');

    mockReadStateWithBody.mockReturnValue({
      state: { verify_env_dist_hash: 'oldhash' } as ReturnType<typeof readStateWithBody>['state'],
      body: '',
    });

    mockExecFileSync
      .mockReturnValueOnce(Buffer.from('codeharness-0.13.2.tgz')) // npm pack
      .mockReturnValueOnce(Buffer.from('')) // docker build
      .mockReturnValueOnce(Buffer.from('5000')); // 5KB

    const result = buildVerifyImage({ projectDir: testDir });
    expect(result.imageSize).toBe('5.0KB');
    try { rmSync('/tmp/codeharness-0.13.2.tgz', { force: true }); } catch {}
  });

  it('formats B-range sizes', () => {
    const distDir = join(testDir, 'dist');
    mkdirSync(distDir);
    writeFileSync(join(distDir, 'index.js'), 'content');
    writeFileSync('/tmp/codeharness-0.13.2.tgz', 'fake-tarball');

    mockReadStateWithBody.mockReturnValue({
      state: { verify_env_dist_hash: 'oldhash' } as ReturnType<typeof readStateWithBody>['state'],
      body: '',
    });

    mockExecFileSync
      .mockReturnValueOnce(Buffer.from('codeharness-0.13.2.tgz')) // npm pack
      .mockReturnValueOnce(Buffer.from('')) // docker build
      .mockReturnValueOnce(Buffer.from('500')); // 500B

    const result = buildVerifyImage({ projectDir: testDir });
    expect(result.imageSize).toBe('500B');
    try { rmSync('/tmp/codeharness-0.13.2.tgz', { force: true }); } catch {}
  });

  it('returns NaN output as-is', () => {
    const distDir = join(testDir, 'dist');
    mkdirSync(distDir);
    writeFileSync(join(distDir, 'index.js'), 'content');
    writeFileSync('/tmp/codeharness-0.13.2.tgz', 'fake-tarball');

    mockReadStateWithBody.mockReturnValue({
      state: { verify_env_dist_hash: 'oldhash' } as ReturnType<typeof readStateWithBody>['state'],
      body: '',
    });

    mockExecFileSync
      .mockReturnValueOnce(Buffer.from('codeharness-0.13.2.tgz')) // npm pack
      .mockReturnValueOnce(Buffer.from('')) // docker build
      .mockReturnValueOnce(Buffer.from('not-a-number')); // NaN

    const result = buildVerifyImage({ projectDir: testDir });
    expect(result.imageSize).toBe('not-a-number');
    try { rmSync('/tmp/codeharness-0.13.2.tgz', { force: true }); } catch {}
  });

  it('returns unknown when docker inspect fails', () => {
    const distDir = join(testDir, 'dist');
    mkdirSync(distDir);
    writeFileSync(join(distDir, 'index.js'), 'content');
    writeFileSync('/tmp/codeharness-0.13.2.tgz', 'fake-tarball');

    mockReadStateWithBody.mockReturnValue({
      state: { verify_env_dist_hash: 'oldhash' } as ReturnType<typeof readStateWithBody>['state'],
      body: '',
    });

    let callCount = 0;
    mockExecFileSync.mockImplementation((_cmd: unknown, args: unknown) => {
      callCount++;
      const argArr = args as string[];
      // npm pack
      if (argArr.includes('pack')) return Buffer.from('codeharness-0.13.2.tgz');
      // docker build
      if (argArr.includes('build')) return Buffer.from('');
      // docker image inspect (size) — fail
      if (argArr.includes('inspect')) throw new Error('inspect failed');
      return Buffer.from('');
    });

    const result = buildVerifyImage({ projectDir: testDir });
    expect(result.imageSize).toBe('unknown');
    try { rmSync('/tmp/codeharness-0.13.2.tgz', { force: true }); } catch {}
  });
});

describe('buildVerifyImage — template resolution', () => {
  it('throws when neither local nor pkg Dockerfile template exists', () => {
    mockDetectStack.mockReturnValue(null);
    // Remove templates from testDir
    rmSync(join(testDir, 'templates'), { recursive: true, force: true });

    mockExecFileSync.mockReturnValue(Buffer.from(''));

    // Generic image build needs Dockerfile.verify.generic — should throw since neither location has it
    expect(() => buildVerifyImage({ projectDir: testDir })).toThrow(
      'Dockerfile.verify.generic not found',
    );
  });
});

describe('buildVerifyImage — generic project (AC #4, #8)', () => {
  it('does not throw for unknown stack without dist/', () => {
    mockDetectStack.mockReturnValue(null);

    mockExecFileSync
      .mockReturnValueOnce(Buffer.from('')) // docker build
      .mockReturnValueOnce(Buffer.from('50000000')); // docker image inspect (size)

    expect(() => buildVerifyImage({ projectDir: testDir })).not.toThrow();
  });

  it('returns success result for generic project', () => {
    mockDetectStack.mockReturnValue(null);

    mockExecFileSync
      .mockReturnValueOnce(Buffer.from('')) // docker build
      .mockReturnValueOnce(Buffer.from('50000000')); // docker image inspect (size)

    const result = buildVerifyImage({ projectDir: testDir });
    expect(result.imageTag).toBe('codeharness-verify');
    expect(result.cached).toBe(false);
    expect(result.buildTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('uses generic Dockerfile template for fallback', () => {
    mockDetectStack.mockReturnValue(null);

    mockExecFileSync
      .mockReturnValueOnce(Buffer.from('')) // docker build
      .mockReturnValueOnce(Buffer.from('50000000')); // docker image inspect (size)

    // Should not throw since templates/Dockerfile.verify.generic exists
    const result = buildVerifyImage({ projectDir: testDir });
    expect(result.imageTag).toBe('codeharness-verify');
  });
});
