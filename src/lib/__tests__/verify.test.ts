import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Mock child_process before importing verify module
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

// Mock output
vi.mock('../output.js', () => ({
  ok: vi.fn(),
  fail: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  jsonOutput: vi.fn(),
}));

// Mock beads
vi.mock('../beads.js', () => ({
  isBeadsInitialized: vi.fn(),
  listIssues: vi.fn(),
  closeIssue: vi.fn(),
}));

// Mock beads-sync
vi.mock('../beads-sync.js', () => ({
  syncClose: vi.fn(),
}));

import { execFileSync } from 'node:child_process';
import { warn } from '../output.js';
import { isBeadsInitialized, listIssues, closeIssue } from '../beads.js';
import { syncClose } from '../beads-sync.js';
import {
  checkPreconditions,
  createProofDocument,
  runShowboatVerify,
  proofHasContent,
  updateVerificationState,
  closeBeadsIssue,
} from '../verify.js';
import type { VerifyResult } from '../verify.js';
import { writeState, readState } from '../state.js';
import { getDefaultState } from '../state.js';

let testDir: string;

beforeEach(() => {
  vi.clearAllMocks();
  testDir = mkdtempSync(join(tmpdir(), 'ch-verify-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function setupState(overrides: Record<string, unknown> = {}): void {
  const state = getDefaultState('node');
  if (overrides.tests_passed !== undefined) {
    state.session_flags.tests_passed = overrides.tests_passed as boolean;
  }
  if (overrides.coverage_met !== undefined) {
    state.session_flags.coverage_met = overrides.coverage_met as boolean;
  }
  if (overrides.verification_run !== undefined) {
    state.session_flags.verification_run = overrides.verification_run as boolean;
  }
  if (overrides.verification_log !== undefined) {
    state.verification_log = overrides.verification_log as string[];
  }
  writeState(state, testDir);
}

// ─── checkPreconditions ─────────────────────────────────────────────────────

describe('checkPreconditions', () => {
  it('returns pass when both flags are true', () => {
    setupState({ tests_passed: true, coverage_met: true });
    const result = checkPreconditions(testDir);
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it('returns failure when tests_passed is false', () => {
    setupState({ tests_passed: false, coverage_met: true });
    const result = checkPreconditions(testDir);
    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain('tests_passed');
  });

  it('returns failure when coverage_met is false', () => {
    setupState({ tests_passed: true, coverage_met: false });
    const result = checkPreconditions(testDir);
    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain('coverage_met');
  });

  it('returns both failures when both flags are false', () => {
    setupState({ tests_passed: false, coverage_met: false });
    const result = checkPreconditions(testDir);
    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(2);
  });
});

// ─── createProofDocument ────────────────────────────────────────────────────

describe('createProofDocument', () => {
  it('creates directories and writes proof file', () => {
    const proofPath = createProofDocument('4-1-test', 'Story 4.1: Test', [
      { id: '1', description: 'First AC', type: 'general' },
    ], testDir);

    expect(existsSync(proofPath)).toBe(true);
    expect(existsSync(join(testDir, 'verification'))).toBe(true);
    expect(existsSync(join(testDir, 'verification', 'screenshots'))).toBe(true);

    const content = readFileSync(proofPath, 'utf-8');
    expect(content).toContain('# Proof: 4-1-test');
    expect(content).toContain('**Story:** Story 4.1: Test');
    expect(content).toContain('## AC 1:');
  });

  it('returns the proof file path', () => {
    const proofPath = createProofDocument('test-id', 'Test', [], testDir);
    expect(proofPath).toBe(join(testDir, 'verification', 'test-id-proof.md'));
  });

  it('handles empty ACs', () => {
    const proofPath = createProofDocument('empty', 'Empty', [], testDir);
    const content = readFileSync(proofPath, 'utf-8');
    expect(content).toContain('Total ACs | 0');
  });
});

// ─── runShowboatVerify ──────────────────────────────────────────────────────

describe('runShowboatVerify', () => {
  it('returns pass when showboat exits with 0', () => {
    vi.mocked(execFileSync).mockReturnValue(Buffer.from('All checks passed'));
    const result = runShowboatVerify('/path/to/proof.md');
    expect(result.passed).toBe(true);
    expect(result.output).toBe('All checks passed');
  });

  it('returns fail when showboat exits with non-zero', () => {
    const error = new Error('Command failed') as Error & { stdout: Buffer; stderr: Buffer };
    error.stdout = Buffer.from('Diff found');
    error.stderr = Buffer.from('');
    vi.mocked(execFileSync).mockImplementation(() => { throw error; });
    const result = runShowboatVerify('/path/to/proof.md');
    expect(result.passed).toBe(false);
    expect(result.output).toBe('Diff found');
  });

  it('handles showboat not installed (ENOENT)', () => {
    const error = new Error('spawn showboat ENOENT');
    vi.mocked(execFileSync).mockImplementation(() => { throw error; });
    const result = runShowboatVerify('/path/to/proof.md');
    expect(result.passed).toBe(false);
    expect(result.output).toBe('showboat not available');
  });
});

// ─── proofHasContent ────────────────────────────────────────────────────────

describe('proofHasContent', () => {
  it('returns false for non-existent file', () => {
    expect(proofHasContent('/nonexistent/proof.md')).toBe(false);
  });

  it('returns false for skeleton without showboat blocks', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, '# Proof\n\n## AC 1\n\n<!-- No evidence -->');
    expect(proofHasContent(path)).toBe(false);
  });

  it('returns true when showboat exec block exists', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, '# Proof\n\n<!-- showboat exec: npm test -->\n```\nok\n```\n<!-- /showboat exec -->');
    expect(proofHasContent(path)).toBe(true);
  });

  it('returns true when showboat image block exists', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, '# Proof\n\n<!-- showboat image: screenshots/test.png -->');
    expect(proofHasContent(path)).toBe(true);
  });
});

// ─── updateVerificationState ────────────────────────────────────────────────

describe('updateVerificationState', () => {
  it('sets verification_run flag to true', () => {
    setupState({ tests_passed: true, coverage_met: true });
    const result: VerifyResult = {
      storyId: '4-1-test',
      success: true,
      totalACs: 1,
      verifiedCount: 1,
      failedCount: 0,
      proofPath: 'verification/4-1-test-proof.md',
      showboatVerifyStatus: 'pass',
      perAC: [{ id: '1', description: 'Test', verified: true, evidencePaths: [] }],
    };

    updateVerificationState('4-1-test', result, testDir);
    const state = readState(testDir);
    expect(state.session_flags.verification_run).toBe(true);
  });

  it('appends entry to verification_log', () => {
    setupState({ tests_passed: true, coverage_met: true });
    const result: VerifyResult = {
      storyId: '4-1-test',
      success: true,
      totalACs: 1,
      verifiedCount: 1,
      failedCount: 0,
      proofPath: 'verification/4-1-test-proof.md',
      showboatVerifyStatus: 'pass',
      perAC: [],
    };

    updateVerificationState('4-1-test', result, testDir);
    const state = readState(testDir);
    expect(state.verification_log).toHaveLength(1);
    expect(state.verification_log[0]).toMatch(/^4-1-test: pass at \d{4}-/);
  });

  it('appends fail entry on failed verification', () => {
    setupState({ tests_passed: true, coverage_met: true });
    const result: VerifyResult = {
      storyId: '4-1-test',
      success: false,
      totalACs: 2,
      verifiedCount: 1,
      failedCount: 1,
      proofPath: 'verification/4-1-test-proof.md',
      showboatVerifyStatus: 'fail',
      perAC: [],
    };

    updateVerificationState('4-1-test', result, testDir);
    const state = readState(testDir);
    expect(state.verification_log[0]).toMatch(/^4-1-test: fail at /);
  });

  it('preserves existing verification_log entries', () => {
    setupState({
      tests_passed: true,
      coverage_met: true,
      verification_log: ['3-1-old: pass at 2026-01-01T00:00:00.000Z'],
    });
    const result: VerifyResult = {
      storyId: '4-1-test',
      success: true,
      totalACs: 1,
      verifiedCount: 1,
      failedCount: 0,
      proofPath: 'verification/4-1-test-proof.md',
      showboatVerifyStatus: 'pass',
      perAC: [],
    };

    updateVerificationState('4-1-test', result, testDir);
    const state = readState(testDir);
    expect(state.verification_log).toHaveLength(2);
    expect(state.verification_log[0]).toContain('3-1-old');
    expect(state.verification_log[1]).toContain('4-1-test');
  });
});

// ─── closeBeadsIssue ────────────────────────────────────────────────────────

describe('closeBeadsIssue', () => {
  it('calls syncClose when beads is initialized and issue exists', () => {
    vi.mocked(isBeadsInitialized).mockReturnValue(true);
    vi.mocked(listIssues).mockReturnValue([
      { id: '42', title: 'Story 4.1', status: 'open', type: 'story', priority: 1, description: '_bmad-output/implementation-artifacts/4-1-test.md' },
    ]);
    vi.mocked(syncClose).mockReturnValue({
      storyKey: '4-1-test',
      beadsId: '42',
      previousStatus: 'open',
      newStatus: 'done',
      synced: true,
    });

    closeBeadsIssue('4-1-test', testDir);

    expect(syncClose).toHaveBeenCalledWith('42', { closeIssue, listIssues }, testDir);
  });

  it('warns and skips when beads is not initialized', () => {
    vi.mocked(isBeadsInitialized).mockReturnValue(false);

    closeBeadsIssue('4-1-test', testDir);

    expect(warn).toHaveBeenCalledWith('Beads not initialized — skipping issue close');
    expect(syncClose).not.toHaveBeenCalled();
  });

  it('warns when no matching issue found', () => {
    vi.mocked(isBeadsInitialized).mockReturnValue(true);
    vi.mocked(listIssues).mockReturnValue([]);

    closeBeadsIssue('4-1-test', testDir);

    expect(warn).toHaveBeenCalledWith('No beads issue found for story 4-1-test — skipping issue close');
    expect(syncClose).not.toHaveBeenCalled();
  });

  it('warns when beads throws an error', () => {
    vi.mocked(isBeadsInitialized).mockReturnValue(true);
    vi.mocked(listIssues).mockImplementation(() => { throw new Error('bd not found'); });

    closeBeadsIssue('4-1-test', testDir);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Failed to close beads issue'));
  });
});
