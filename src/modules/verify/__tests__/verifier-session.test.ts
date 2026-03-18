import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Mock child_process before importing module
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

// Mock verify env for isValidStoryKey and cleanupStaleContainers
vi.mock('../env.js', () => ({
  isValidStoryKey: vi.fn((k: string) => /^[a-zA-Z0-9_-]+$/.test(k)),
  cleanupStaleContainers: vi.fn(),
}));

import { execFileSync } from 'node:child_process';
import { spawnVerifierSession, copyProofToProject } from '../../../lib/verifier-session.js';
import { cleanupStaleContainers } from '../env.js';

const mockExecFileSync = vi.mocked(execFileSync);
const mockCleanupStale = vi.mocked(cleanupStaleContainers);

let testDir: string;

beforeEach(() => {
  vi.restoreAllMocks();
  // Re-apply the module mocks after restoreAllMocks
  vi.mocked(execFileSync).mockReset();
  vi.mocked(cleanupStaleContainers).mockReset();
  testDir = mkdtempSync(join(tmpdir(), 'ch-verifier-session-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// ─── Helper: setup workspace ────────────────────────────────────────────────

function setupWorkspace(storyKey: string, storyContent = '# Story'): string {
  const workspace = `/tmp/codeharness-verify-${storyKey}`;
  mkdirSync(join(workspace, 'verification'), { recursive: true });
  writeFileSync(join(workspace, 'story.md'), storyContent);
  return workspace;
}

// ─── spawnVerifierSession ────────────────────────────────────────────────────

describe('spawnVerifierSession', () => {
  it('returns fail() when workspace does not exist', () => {
    const result = spawnVerifierSession({
      storyKey: 'nonexistent-story-xyz',
      projectDir: testDir,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Clean workspace not found');
    }
  });

  it('returns fail() for story keys with path traversal sequences', () => {
    const result = spawnVerifierSession({
      storyKey: '../../../etc/passwd',
      projectDir: testDir,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Invalid story key');
    }
  });

  it('returns fail() for story keys with slashes', () => {
    const result = spawnVerifierSession({
      storyKey: 'foo/bar',
      projectDir: testDir,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('Invalid story key');
  });

  it('returns fail() for story keys with special characters', () => {
    const result = spawnVerifierSession({
      storyKey: 'story;rm -rf /',
      projectDir: testDir,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('Invalid story key');
  });

  it('returns fail() when story.md missing in workspace', () => {
    const workspace = '/tmp/codeharness-verify-missing-story-md-test';
    mkdirSync(workspace, { recursive: true });
    try {
      const result = spawnVerifierSession({
        storyKey: 'missing-story-md-test',
        projectDir: testDir,
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toContain('story.md not found');
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('calls cleanupStaleContainers() before spawning', () => {
    const storyKey = 'stale-cleanup-test';
    const workspace = setupWorkspace(storyKey);
    mockExecFileSync.mockReturnValue(Buffer.from('ok'));
    try {
      spawnVerifierSession({ storyKey, projectDir: testDir });
      expect(mockCleanupStale).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('constructs correct claude command arguments with --allowedTools', () => {
    const storyKey = 'cmd-args-test';
    const workspace = setupWorkspace(storyKey, '# Test Story\n\n## Acceptance Criteria\n\n1. AC one');
    mockExecFileSync.mockReturnValue(Buffer.from('Verification complete'));
    try {
      spawnVerifierSession({
        storyKey,
        projectDir: testDir,
        maxBudgetUsd: 5,
        timeoutMs: 120_000,
      });
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining([
          '--print',
          '--max-budget-usd', '5',
          '--allowedTools',
          'Bash', 'Read', 'Write', 'Glob', 'Grep', 'Edit',
          '-p',
          expect.stringContaining('black-box verifier'),
        ]),
        expect.objectContaining({ cwd: workspace, timeout: 120_000 }),
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('returns ok() when claude exits 0 and proof exists', () => {
    const storyKey = 'success-test';
    const workspace = setupWorkspace(storyKey, '# Story\n\n## AC\n\n1. First AC');
    writeFileSync(join(workspace, 'verification', `${storyKey}-proof.md`), '## AC 1: Pass');
    mockExecFileSync.mockReturnValue(Buffer.from('All done'));
    try {
      const result = spawnVerifierSession({ storyKey, projectDir: testDir });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(true);
        expect(result.data.proofPath).toBe(join(workspace, 'verification', `${storyKey}-proof.md`));
        expect(result.data.storyId).toBe(storyKey);
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('returns fail() with context when claude exits non-zero', () => {
    const storyKey = 'exit-fail-test';
    const workspace = setupWorkspace(storyKey);
    const error = new Error('Process failed') as Error & { status: number; stdout: Buffer; stderr: Buffer };
    error.status = 1;
    error.stdout = Buffer.from('partial output');
    error.stderr = Buffer.from('');
    mockExecFileSync.mockImplementation(() => { throw error; });
    try {
      const result = spawnVerifierSession({ storyKey, projectDir: testDir });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.context?.exitCode).toBe(1);
        expect(result.context?.output).toContain('partial output');
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('returns fail() when proof file is missing (exit 0)', () => {
    const storyKey = 'no-proof-test';
    const workspace = setupWorkspace(storyKey);
    mockExecFileSync.mockReturnValue(Buffer.from('Done but no proof written'));
    try {
      const result = spawnVerifierSession({ storyKey, projectDir: testDir });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.context?.proofPath).toBeNull();
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('saves partial proof on timeout and returns fail()', () => {
    const storyKey = 'timeout-test';
    const workspace = setupWorkspace(storyKey);
    const error = new Error('Command timed out') as Error & { status: number; stdout: Buffer; killed: boolean };
    error.status = 1;
    error.stdout = Buffer.from('partial verifier output');
    error.killed = true;
    mockExecFileSync.mockImplementation(() => { throw error; });
    try {
      const result = spawnVerifierSession({ storyKey, projectDir: testDir, timeoutMs: 1000 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('timed out');
        expect(result.context?.proofSaved).toBe(true);
        expect(result.context?.exitCode).toBe(124);
        expect(result.context?.duration).toBeGreaterThanOrEqual(0);
        // Verify proof file was written
        const proofPath = join(workspace, 'verification', `${storyKey}-proof.md`);
        expect(existsSync(proofPath)).toBe(true);
        const proofContent = readFileSync(proofPath, 'utf-8');
        expect(proofContent).toContain('Timeout Report');
        expect(proofContent).toContain('partial verifier output');
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('preserves existing partial proof on timeout', () => {
    const storyKey = 'timeout-existing-proof-test';
    const workspace = setupWorkspace(storyKey);
    writeFileSync(join(workspace, 'verification', `${storyKey}-proof.md`), '# Existing partial proof');
    const error = new Error('timed out') as Error & { status: number; stdout: Buffer; killed: boolean };
    error.status = 1;
    error.stdout = Buffer.from('');
    error.killed = true;
    mockExecFileSync.mockImplementation(() => { throw error; });
    try {
      const result = spawnVerifierSession({ storyKey, projectDir: testDir, timeoutMs: 1000 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.context?.proofSaved).toBe(true);
        // Existing proof is preserved, not overwritten
        const proofContent = readFileSync(join(workspace, 'verification', `${storyKey}-proof.md`), 'utf-8');
        expect(proofContent).toBe('# Existing partial proof');
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('guarantees non-empty output even when stdout and stderr are empty', () => {
    const storyKey = 'empty-output-test';
    const workspace = setupWorkspace(storyKey);
    const error = new Error('OOM killed') as Error & { status: number; stdout: Buffer; stderr: Buffer };
    error.status = 137;
    error.stdout = Buffer.from('');
    error.stderr = Buffer.from('');
    mockExecFileSync.mockImplementation(() => { throw error; });
    try {
      const result = spawnVerifierSession({ storyKey, projectDir: testDir });
      expect(result.success).toBe(false);
      if (!result.success) {
        const output = result.context?.output as string;
        expect(output.length).toBeGreaterThan(0);
        expect(output).toContain('OOM killed');
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('never throws — catches unexpected errors and returns fail()', () => {
    // This test forces an unexpected error by mocking cleanupStaleContainers to throw
    mockCleanupStale.mockImplementation(() => { throw new Error('Docker daemon crashed'); });
    const storyKey = 'unexpected-error-test';
    const workspace = setupWorkspace(storyKey);
    try {
      const result = spawnVerifierSession({ storyKey, projectDir: testDir });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Unexpected error');
        expect(result.error).toContain('Docker daemon crashed');
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('uses stderr fallback when stdout is empty but stderr has content', () => {
    const storyKey = 'stderr-fallback-test';
    const workspace = setupWorkspace(storyKey);
    const error = new Error('fail') as Error & { status: number; stdout: Buffer; stderr: Buffer };
    error.status = 1;
    error.stdout = Buffer.from('');
    error.stderr = Buffer.from('Error: permission denied');
    mockExecFileSync.mockImplementation(() => { throw error; });
    try {
      const result = spawnVerifierSession({ storyKey, projectDir: testDir });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.context?.output).toBe('Error: permission denied');
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('detects ETIMEDOUT code as timeout', () => {
    const storyKey = 'etimedout-test';
    const workspace = setupWorkspace(storyKey);
    const error = new Error('connect ETIMEDOUT') as Error & { status: number; stdout: Buffer; code: string };
    error.status = 1;
    error.stdout = Buffer.from('');
    error.code = 'ETIMEDOUT';
    mockExecFileSync.mockImplementation(() => { throw error; });
    try {
      const result = spawnVerifierSession({ storyKey, projectDir: testDir, timeoutMs: 5000 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.context?.exitCode).toBe(124);
        expect(result.error).toContain('timed out');
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('returns proofSaved=false when workspace is read-only on timeout', () => {
    const storyKey = 'readonly-ws-timeout-test';
    const workspace = `/tmp/codeharness-verify-${storyKey}`;
    mkdirSync(workspace, { recursive: true });
    writeFileSync(join(workspace, 'story.md'), '# Story');
    // Make workspace non-writable so savePartialProof fails to create verification/ dir
    const { chmodSync } = require('node:fs');
    chmodSync(workspace, 0o555);
    const error = new Error('timed out') as Error & { status: number; stdout: Buffer; killed: boolean };
    error.status = 1;
    error.stdout = Buffer.from('partial');
    error.killed = true;
    mockExecFileSync.mockImplementation(() => { throw error; });
    try {
      const result = spawnVerifierSession({ storyKey, projectDir: testDir, timeoutMs: 1000 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.context?.proofSaved).toBe(false);
      }
    } finally {
      chmodSync(workspace, 0o755);
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('produces non-empty output even when all error fields are undefined', () => {
    const storyKey = 'all-undefined-test';
    const workspace = setupWorkspace(storyKey);
    // Error with no stdout, no stderr, no message
    const error = { status: 2 };
    mockExecFileSync.mockImplementation(() => { throw error; });
    try {
      const result = spawnVerifierSession({ storyKey, projectDir: testDir });
      expect(result.success).toBe(false);
      if (!result.success) {
        const output = result.context?.output as string;
        expect(output.length).toBeGreaterThan(0);
        expect(output).toContain('exited with code 2');
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('fills in descriptive output when claude returns empty buffer on success', () => {
    const storyKey = 'empty-success-output-test';
    const workspace = setupWorkspace(storyKey);
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    try {
      const result = spawnVerifierSession({ storyKey, projectDir: testDir });
      // No proof file, so it fails — but output should be non-empty
      expect(result.success).toBe(false);
      if (!result.success) {
        const output = result.context?.output as string;
        expect(output.length).toBeGreaterThan(0);
        expect(output).toContain('produced no output');
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('includes story content in the prompt', () => {
    const storyKey = 'prompt-content-test';
    const workspace = setupWorkspace(storyKey, '# My Unique Story Title\n\n## AC\n\n1. Unique AC text 12345');
    mockExecFileSync.mockReturnValue(Buffer.from('ok'));
    try {
      spawnVerifierSession({ storyKey, projectDir: testDir });
      const args = mockExecFileSync.mock.calls[0][1] as string[];
      const pIndex = args.indexOf('-p');
      const promptArg = args[pIndex + 1];
      expect(promptArg).toContain('My Unique Story Title');
      expect(promptArg).toContain('Unique AC text 12345');
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('uses default budget of 3 USD', () => {
    const storyKey = 'default-budget-test';
    const workspace = setupWorkspace(storyKey);
    mockExecFileSync.mockReturnValue(Buffer.from('ok'));
    try {
      spawnVerifierSession({ storyKey, projectDir: testDir });
      const args = mockExecFileSync.mock.calls[0][1] as string[];
      const budgetIdx = args.indexOf('--max-budget-usd');
      expect(args[budgetIdx + 1]).toBe('3');
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('--allowedTools includes all required tools', () => {
    const storyKey = 'allowed-tools-test';
    const workspace = setupWorkspace(storyKey);
    mockExecFileSync.mockReturnValue(Buffer.from('ok'));
    try {
      spawnVerifierSession({ storyKey, projectDir: testDir });
      const args = mockExecFileSync.mock.calls[0][1] as string[];
      const toolIdx = args.indexOf('--allowedTools');
      expect(toolIdx).toBeGreaterThan(-1);
      const toolsSlice = args.slice(toolIdx + 1, args.indexOf('-p'));
      expect(toolsSlice).toContain('Bash');
      expect(toolsSlice).toContain('Read');
      expect(toolsSlice).toContain('Write');
      expect(toolsSlice).toContain('Glob');
      expect(toolsSlice).toContain('Grep');
      expect(toolsSlice).toContain('Edit');
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});

// ─── copyProofToProject ──────────────────────────────────────────────────────

describe('copyProofToProject', () => {
  it('copies proof file to project verification/ directory', () => {
    const storyKey = 'copy-test';
    const workspace = join(testDir, 'workspace');
    mkdirSync(join(workspace, 'verification'), { recursive: true });
    writeFileSync(join(workspace, 'verification', `${storyKey}-proof.md`), '# Proof content here');
    const projectDir = join(testDir, 'project');
    mkdirSync(projectDir, { recursive: true });
    const destPath = copyProofToProject(storyKey, workspace, projectDir);
    expect(destPath).toBe(join(projectDir, 'verification', `${storyKey}-proof.md`));
    expect(existsSync(destPath)).toBe(true);
    expect(readFileSync(destPath, 'utf-8')).toBe('# Proof content here');
  });

  it('creates verification/ directory if it does not exist', () => {
    const storyKey = 'create-dir-test';
    const workspace = join(testDir, 'workspace2');
    mkdirSync(join(workspace, 'verification'), { recursive: true });
    writeFileSync(join(workspace, 'verification', `${storyKey}-proof.md`), '# Proof');
    const projectDir = join(testDir, 'project2');
    mkdirSync(projectDir, { recursive: true });
    const destPath = copyProofToProject(storyKey, workspace, projectDir);
    expect(existsSync(join(projectDir, 'verification'))).toBe(true);
    expect(existsSync(destPath)).toBe(true);
  });

  it('throws when source proof file does not exist', () => {
    const workspace = join(testDir, 'workspace3');
    mkdirSync(join(workspace, 'verification'), { recursive: true });
    expect(() => copyProofToProject('missing-proof', workspace, testDir)).toThrow('Proof file not found');
  });

  it('rejects story keys with path traversal sequences', () => {
    const workspace = join(testDir, 'workspace-traversal');
    mkdirSync(join(workspace, 'verification'), { recursive: true });
    expect(() => copyProofToProject('../../etc/passwd', workspace, testDir)).toThrow('Invalid story key');
  });

  it('rejects story keys with special characters', () => {
    const workspace = join(testDir, 'workspace-special');
    mkdirSync(join(workspace, 'verification'), { recursive: true });
    expect(() => copyProofToProject('key;rm -rf /', workspace, testDir)).toThrow('Invalid story key');
  });

  it('overwrites existing proof in project directory', () => {
    const storyKey = 'overwrite-test';
    const workspace = join(testDir, 'workspace4');
    mkdirSync(join(workspace, 'verification'), { recursive: true });
    writeFileSync(join(workspace, 'verification', `${storyKey}-proof.md`), '# New proof content');
    const projectDir = join(testDir, 'project4');
    mkdirSync(join(projectDir, 'verification'), { recursive: true });
    writeFileSync(join(projectDir, 'verification', `${storyKey}-proof.md`), '# Old proof content');
    copyProofToProject(storyKey, workspace, projectDir);
    const content = readFileSync(join(projectDir, 'verification', `${storyKey}-proof.md`), 'utf-8');
    expect(content).toBe('# New proof content');
  });
});
