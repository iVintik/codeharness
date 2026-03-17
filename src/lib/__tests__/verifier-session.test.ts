import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Mock child_process before importing module
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

// Mock verify-env for isValidStoryKey — use real implementation
vi.mock('../verify-env.js', () => ({
  isValidStoryKey: vi.fn((k: string) => /^[a-zA-Z0-9_-]+$/.test(k)),
}));

import { execFileSync } from 'node:child_process';
import { spawnVerifierSession, copyProofToProject } from '../verifier-session.js';

const mockExecFileSync = vi.mocked(execFileSync);

let testDir: string;

beforeEach(() => {
  vi.clearAllMocks();
  testDir = mkdtempSync(join(tmpdir(), 'ch-verifier-session-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// ─── spawnVerifierSession ────────────────────────────────────────────────────

describe('spawnVerifierSession', () => {
  it('throws when workspace does not exist', () => {
    expect(() => spawnVerifierSession({
      storyKey: 'nonexistent-story-xyz',
      projectDir: testDir,
    })).toThrow('Clean workspace not found');
  });

  it('rejects story keys with path traversal sequences', () => {
    expect(() => spawnVerifierSession({
      storyKey: '../../../etc/passwd',
      projectDir: testDir,
    })).toThrow('Invalid story key');
  });

  it('rejects story keys with slashes', () => {
    expect(() => spawnVerifierSession({
      storyKey: 'foo/bar',
      projectDir: testDir,
    })).toThrow('Invalid story key');
  });

  it('rejects story keys with special characters', () => {
    expect(() => spawnVerifierSession({
      storyKey: 'story;rm -rf /',
      projectDir: testDir,
    })).toThrow('Invalid story key');
  });

  it('throws when story.md missing in workspace', () => {
    const workspace = '/tmp/codeharness-verify-missing-story-md-test';
    mkdirSync(workspace, { recursive: true });

    try {
      expect(() => spawnVerifierSession({
        storyKey: 'missing-story-md-test',
        projectDir: testDir,
      })).toThrow('story.md not found');
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('constructs correct claude command arguments', () => {
    const storyKey = 'cmd-args-test';
    const workspace = `/tmp/codeharness-verify-${storyKey}`;
    mkdirSync(workspace, { recursive: true });
    mkdirSync(join(workspace, 'verification'), { recursive: true });
    writeFileSync(join(workspace, 'story.md'), '# Test Story\n\n## Acceptance Criteria\n\n1. AC one');

    // Mock claude returning success
    mockExecFileSync.mockReturnValue(Buffer.from('Verification complete'));

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
        '--max-budget-usd',
        '5',
        '-p',
        expect.stringContaining('black-box verifier'),
      ]),
      expect.objectContaining({
        cwd: workspace,
        timeout: 120_000,
      }),
    );

    rmSync(workspace, { recursive: true, force: true });
  });

  it('returns success=true when claude exits 0 and proof exists', () => {
    const storyKey = 'success-test';
    const workspace = `/tmp/codeharness-verify-${storyKey}`;
    mkdirSync(join(workspace, 'verification'), { recursive: true });
    writeFileSync(join(workspace, 'story.md'), '# Story\n\n## AC\n\n1. First AC');

    // Create the proof file that would be written by the verifier
    writeFileSync(
      join(workspace, 'verification', `${storyKey}-proof.md`),
      '## AC 1: Pass\n\nEvidence here',
    );

    mockExecFileSync.mockReturnValue(Buffer.from('All done'));

    const result = spawnVerifierSession({ storyKey, projectDir: testDir });

    expect(result.success).toBe(true);
    expect(result.proofPath).toBe(join(workspace, 'verification', `${storyKey}-proof.md`));
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe('All done');
    expect(result.duration).toBeGreaterThanOrEqual(0);

    rmSync(workspace, { recursive: true, force: true });
  });

  it('returns success=false when claude exits non-zero', () => {
    const storyKey = 'exit-fail-test';
    const workspace = `/tmp/codeharness-verify-${storyKey}`;
    mkdirSync(join(workspace, 'verification'), { recursive: true });
    writeFileSync(join(workspace, 'story.md'), '# Story');

    const error = new Error('Process failed') as Error & { status: number; stdout: Buffer; stderr: Buffer };
    error.status = 1;
    error.stdout = Buffer.from('partial output');
    error.stderr = Buffer.from('');
    mockExecFileSync.mockImplementation(() => { throw error; });

    const result = spawnVerifierSession({ storyKey, projectDir: testDir });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('partial output');

    rmSync(workspace, { recursive: true, force: true });
  });

  it('returns success=false when proof file is missing', () => {
    const storyKey = 'no-proof-test';
    const workspace = `/tmp/codeharness-verify-${storyKey}`;
    mkdirSync(join(workspace, 'verification'), { recursive: true });
    writeFileSync(join(workspace, 'story.md'), '# Story');

    // Claude exits 0 but produces no proof
    mockExecFileSync.mockReturnValue(Buffer.from('Done but no proof written'));

    const result = spawnVerifierSession({ storyKey, projectDir: testDir });

    expect(result.success).toBe(false);
    expect(result.proofPath).toBeNull();
    expect(result.exitCode).toBe(0);

    rmSync(workspace, { recursive: true, force: true });
  });

  it('handles timeout error', () => {
    const storyKey = 'timeout-test';
    const workspace = `/tmp/codeharness-verify-${storyKey}`;
    mkdirSync(join(workspace, 'verification'), { recursive: true });
    writeFileSync(join(workspace, 'story.md'), '# Story');

    const error = new Error('Command timed out') as Error & { status: number; stdout: Buffer };
    error.status = 1;
    error.stdout = Buffer.from('');
    mockExecFileSync.mockImplementation(() => { throw error; });

    const result = spawnVerifierSession({ storyKey, projectDir: testDir, timeoutMs: 1000 });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);

    rmSync(workspace, { recursive: true, force: true });
  });

  it('includes story content in the prompt', () => {
    const storyKey = 'prompt-content-test';
    const workspace = `/tmp/codeharness-verify-${storyKey}`;
    mkdirSync(join(workspace, 'verification'), { recursive: true });
    writeFileSync(join(workspace, 'story.md'), '# My Unique Story Title\n\n## AC\n\n1. Unique AC text 12345');

    mockExecFileSync.mockReturnValue(Buffer.from('ok'));

    spawnVerifierSession({ storyKey, projectDir: testDir });

    const args = mockExecFileSync.mock.calls[0][1] as string[];
    const pIndex = args.indexOf('-p');
    const promptArg = args[pIndex + 1];
    expect(promptArg).toContain('My Unique Story Title');
    expect(promptArg).toContain('Unique AC text 12345');

    rmSync(workspace, { recursive: true, force: true });
  });

  it('includes container name and observability endpoints in prompt', () => {
    const storyKey = 'endpoints-test';
    const workspace = `/tmp/codeharness-verify-${storyKey}`;
    mkdirSync(join(workspace, 'verification'), { recursive: true });
    writeFileSync(join(workspace, 'story.md'), '# Story');

    mockExecFileSync.mockReturnValue(Buffer.from('ok'));

    spawnVerifierSession({
      storyKey,
      projectDir: testDir,
      containerName: 'my-custom-container',
      observabilityEndpoints: {
        victoriaLogs: 'http://custom:9428',
      },
    });

    const args2 = mockExecFileSync.mock.calls[0][1] as string[];
    const pIdx = args2.indexOf('-p');
    const promptArg = args2[pIdx + 1];
    expect(promptArg).toContain('my-custom-container');
    expect(promptArg).toContain('http://custom:9428');

    rmSync(workspace, { recursive: true, force: true });
  });

  it('uses default budget of 3 USD', () => {
    const storyKey = 'default-budget-test';
    const workspace = `/tmp/codeharness-verify-${storyKey}`;
    mkdirSync(join(workspace, 'verification'), { recursive: true });
    writeFileSync(join(workspace, 'story.md'), '# Story');

    mockExecFileSync.mockReturnValue(Buffer.from('ok'));

    spawnVerifierSession({ storyKey, projectDir: testDir });

    const args = mockExecFileSync.mock.calls[0][1] as string[];
    const budgetIdx = args.indexOf('--max-budget-usd');
    expect(args[budgetIdx + 1]).toBe('3');

    rmSync(workspace, { recursive: true, force: true });
  });
});

// ─── copyProofToProject ──────────────────────────────────────────────────────

describe('copyProofToProject', () => {
  it('copies proof file to project verification/ directory', () => {
    const storyKey = 'copy-test';
    const workspace = join(testDir, 'workspace');
    mkdirSync(join(workspace, 'verification'), { recursive: true });
    writeFileSync(
      join(workspace, 'verification', `${storyKey}-proof.md`),
      '# Proof content here',
    );

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
    writeFileSync(
      join(workspace, 'verification', `${storyKey}-proof.md`),
      '# Proof',
    );

    const projectDir = join(testDir, 'project2');
    mkdirSync(projectDir, { recursive: true });

    const destPath = copyProofToProject(storyKey, workspace, projectDir);
    expect(existsSync(join(projectDir, 'verification'))).toBe(true);
    expect(existsSync(destPath)).toBe(true);
  });

  it('throws when source proof file does not exist', () => {
    const workspace = join(testDir, 'workspace3');
    mkdirSync(join(workspace, 'verification'), { recursive: true });

    expect(() => copyProofToProject('missing-proof', workspace, testDir)).toThrow(
      'Proof file not found',
    );
  });

  it('rejects story keys with path traversal sequences', () => {
    const workspace = join(testDir, 'workspace-traversal');
    mkdirSync(join(workspace, 'verification'), { recursive: true });

    expect(() => copyProofToProject('../../etc/passwd', workspace, testDir)).toThrow(
      'Invalid story key',
    );
  });

  it('rejects story keys with special characters', () => {
    const workspace = join(testDir, 'workspace-special');
    mkdirSync(join(workspace, 'verification'), { recursive: true });

    expect(() => copyProofToProject('key;rm -rf /', workspace, testDir)).toThrow(
      'Invalid story key',
    );
  });

  it('overwrites existing proof in project directory', () => {
    const storyKey = 'overwrite-test';
    const workspace = join(testDir, 'workspace4');
    mkdirSync(join(workspace, 'verification'), { recursive: true });
    writeFileSync(
      join(workspace, 'verification', `${storyKey}-proof.md`),
      '# New proof content',
    );

    const projectDir = join(testDir, 'project4');
    mkdirSync(join(projectDir, 'verification'), { recursive: true });
    writeFileSync(
      join(projectDir, 'verification', `${storyKey}-proof.md`),
      '# Old proof content',
    );

    copyProofToProject(storyKey, workspace, projectDir);

    const content = readFileSync(
      join(projectDir, 'verification', `${storyKey}-proof.md`),
      'utf-8',
    );
    expect(content).toBe('# New proof content');
  });
});
