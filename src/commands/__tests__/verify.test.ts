import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

// Mock the verify library modules
vi.mock('../../lib/verify.js', () => ({
  checkPreconditions: vi.fn(),
  createProofDocument: vi.fn(),
  runShowboatVerify: vi.fn(),
  validateProofQuality: vi.fn(),
  updateVerificationState: vi.fn(),
  closeBeadsIssue: vi.fn(),
}));

vi.mock('../../lib/verify-parser.js', () => ({
  parseStoryACs: vi.fn(),
}));

vi.mock('../../lib/output.js', () => ({
  ok: vi.fn(),
  fail: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  jsonOutput: vi.fn(),
}));

vi.mock('../../lib/beads-sync.js', () => ({
  updateSprintStatus: vi.fn(),
}));

vi.mock('../../lib/doc-health.js', () => ({
  completeExecPlan: vi.fn(),
}));

import { registerVerifyCommand } from '../verify.js';
import {
  checkPreconditions,
  createProofDocument,
  runShowboatVerify,
  validateProofQuality,
  updateVerificationState,
  closeBeadsIssue,
} from '../../lib/verify.js';
import { parseStoryACs } from '../../lib/verify-parser.js';
import { ok, fail, warn, info, jsonOutput } from '../../lib/output.js';
import { updateSprintStatus } from '../../lib/beads-sync.js';

let testDir: string;
let originalCwd: string;

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  testDir = mkdtempSync(join(tmpdir(), 'ch-verify-cmd-test-'));
  originalCwd = process.cwd();
  process.chdir(testDir);
  process.exitCode = undefined;

  // Create default story file
  const storyDir = join(testDir, '_bmad-output', 'implementation-artifacts');
  mkdirSync(storyDir, { recursive: true });
  writeFileSync(
    join(storyDir, '4-1-test.md'),
    '# Story 4.1: Test Story\n\nStatus: ready-for-dev\n\n## Acceptance Criteria\n\n1. **Given** test, **Then** pass.\n',
  );
});

afterEach(() => {
  process.chdir(originalCwd);
  process.exitCode = undefined;
  rmSync(testDir, { recursive: true, force: true });
});

async function runVerify(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  program.option('--json', 'JSON output');
  registerVerifyCommand(program);
  try {
    await program.parseAsync(['node', 'test', 'verify', ...args]);
  } catch {
    // Commander throws on exitOverride — ignore
  }
}

// ─── Story Verification Tests ────────────────────────────────────────────────

describe('verify command — story mode', () => {
  it('fails when no --story and no --retro provided', async () => {
    await runVerify([]);
    expect(fail).toHaveBeenCalledWith(
      expect.stringContaining('--story is required when --retro is not set'),
      expect.any(Object),
    );
    expect(process.exitCode).toBe(1);
  });

  it('fails when story file not found', async () => {
    await runVerify(['--story', 'nonexistent-story']);
    expect(fail).toHaveBeenCalledWith(
      expect.stringContaining('Story file not found'),
      expect.any(Object),
    );
    expect(process.exitCode).toBe(1);
  });

  it('fails with precondition error when flags are false', async () => {
    vi.mocked(checkPreconditions).mockReturnValue({
      passed: false,
      failures: ['tests_passed is false — run tests first'],
    });

    await runVerify(['--story', '4-1-test']);

    expect(fail).toHaveBeenCalledWith('Preconditions not met:');
    expect(process.exitCode).toBe(1);
  });

  it('fails when proof quality check fails (skeleton proof)', async () => {
    vi.mocked(checkPreconditions).mockReturnValue({ passed: true, failures: [] });
    vi.mocked(parseStoryACs).mockReturnValue([
      { id: '1', description: 'Test AC', type: 'general', verifiability: 'cli-verifiable' as const },
    ]);
    vi.mocked(createProofDocument).mockReturnValue(join(testDir, 'verification', '4-1-test-proof.md'));
    vi.mocked(validateProofQuality).mockReturnValue({ verified: 0, pending: 1, escalated: 0, total: 1, passed: false });

    await runVerify(['--story', '4-1-test']);

    expect(fail).toHaveBeenCalledWith('Proof quality check failed: 0/1 ACs verified');
    expect(process.exitCode).toBe(1);
  });

  it('succeeds and prints OK when proof quality passes', async () => {
    vi.mocked(checkPreconditions).mockReturnValue({ passed: true, failures: [] });
    vi.mocked(parseStoryACs).mockReturnValue([
      { id: '1', description: 'Test AC', type: 'general', verifiability: 'cli-verifiable' as const },
    ]);
    vi.mocked(createProofDocument).mockReturnValue(join(testDir, 'verification', '4-1-test-proof.md'));
    vi.mocked(validateProofQuality).mockReturnValue({ verified: 1, pending: 0, escalated: 0, total: 1, passed: true });
    vi.mocked(runShowboatVerify).mockReturnValue({ passed: false, output: 'showboat not available' });
    vi.mocked(updateVerificationState).mockImplementation(() => {});
    vi.mocked(closeBeadsIssue).mockImplementation(() => {});

    await runVerify(['--story', '4-1-test']);

    expect(ok).toHaveBeenCalledWith('Story 4-1-test: verified — proof at verification/4-1-test-proof.md');
    expect(process.exitCode).toBeUndefined();
  });

  it('outputs JSON with proofQuality when --json flag is set', async () => {
    vi.mocked(checkPreconditions).mockReturnValue({ passed: true, failures: [] });
    vi.mocked(parseStoryACs).mockReturnValue([
      { id: '1', description: 'Test AC', type: 'general', verifiability: 'cli-verifiable' as const },
    ]);
    vi.mocked(createProofDocument).mockReturnValue(join(testDir, 'verification', '4-1-test-proof.md'));
    vi.mocked(validateProofQuality).mockReturnValue({ verified: 1, pending: 0, escalated: 0, total: 1, passed: true });
    vi.mocked(runShowboatVerify).mockReturnValue({ passed: false, output: 'showboat not available' });
    vi.mocked(updateVerificationState).mockImplementation(() => {});
    vi.mocked(closeBeadsIssue).mockImplementation(() => {});

    await runVerify(['--story', '4-1-test', '--json']);

    expect(jsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        storyId: '4-1-test',
        success: true,
        totalACs: 1,
        verifiedCount: 1,
        failedCount: 0,
        proofPath: 'verification/4-1-test-proof.md',
        proofQuality: { verified: 1, pending: 0, escalated: 0, total: 1 },
      }),
    );
  });

  it('outputs JSON with proofQuality on failure when --json flag is set', async () => {
    vi.mocked(checkPreconditions).mockReturnValue({ passed: true, failures: [] });
    vi.mocked(parseStoryACs).mockReturnValue([
      { id: '1', description: 'AC 1', type: 'general', verifiability: 'cli-verifiable' as const },
      { id: '2', description: 'AC 2', type: 'general', verifiability: 'cli-verifiable' as const },
    ]);
    vi.mocked(createProofDocument).mockReturnValue(join(testDir, 'verification', '4-1-test-proof.md'));
    vi.mocked(validateProofQuality).mockReturnValue({ verified: 1, pending: 1, escalated: 0, total: 2, passed: false });

    await runVerify(['--story', '4-1-test', '--json']);

    expect(jsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'fail',
        proofQuality: { verified: 1, pending: 1, escalated: 0, total: 2 },
      }),
    );
    expect(process.exitCode).toBe(1);
  });

  it('handles missing story file gracefully', async () => {
    await runVerify(['--story', 'does-not-exist']);
    expect(fail).toHaveBeenCalledWith(
      expect.stringContaining('Story file not found'),
      expect.any(Object),
    );
    expect(process.exitCode).toBe(1);
  });

  it('continues when showboat is unavailable', async () => {
    vi.mocked(checkPreconditions).mockReturnValue({ passed: true, failures: [] });
    vi.mocked(parseStoryACs).mockReturnValue([
      { id: '1', description: 'Test', type: 'general', verifiability: 'cli-verifiable' as const },
    ]);
    vi.mocked(createProofDocument).mockReturnValue(join(testDir, 'verification', '4-1-test-proof.md'));
    vi.mocked(validateProofQuality).mockReturnValue({ verified: 1, pending: 0, escalated: 0, total: 1, passed: true });
    vi.mocked(runShowboatVerify).mockReturnValue({ passed: false, output: 'showboat not available' });
    vi.mocked(updateVerificationState).mockImplementation(() => {});
    vi.mocked(closeBeadsIssue).mockImplementation(() => {});

    await runVerify(['--story', '4-1-test']);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Showboat not installed'));
    expect(ok).toHaveBeenCalled();
  });

  it('continues when beads is unavailable', async () => {
    vi.mocked(checkPreconditions).mockReturnValue({ passed: true, failures: [] });
    vi.mocked(parseStoryACs).mockReturnValue([
      { id: '1', description: 'Test', type: 'general', verifiability: 'cli-verifiable' as const },
    ]);
    vi.mocked(createProofDocument).mockReturnValue(join(testDir, 'verification', '4-1-test-proof.md'));
    vi.mocked(validateProofQuality).mockReturnValue({ verified: 1, pending: 0, escalated: 0, total: 1, passed: true });
    vi.mocked(runShowboatVerify).mockReturnValue({ passed: false, output: 'showboat not available' });
    vi.mocked(updateVerificationState).mockImplementation(() => {});
    vi.mocked(closeBeadsIssue).mockImplementation(() => {
      throw new Error('beads not initialized');
    });

    await runVerify(['--story', '4-1-test']);

    // Should warn but continue
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Failed to close beads issue'));
    expect(ok).toHaveBeenCalled();
  });

  it('fails when checkPreconditions throws', async () => {
    vi.mocked(checkPreconditions).mockImplementation(() => {
      throw new Error('No state file found');
    });

    await runVerify(['--story', '4-1-test']);

    expect(fail).toHaveBeenCalledWith(
      expect.stringContaining('Precondition check failed'),
      expect.any(Object),
    );
    expect(process.exitCode).toBe(1);
  });

  it('fails when parseStoryACs throws', async () => {
    vi.mocked(checkPreconditions).mockReturnValue({ passed: true, failures: [] });
    vi.mocked(parseStoryACs).mockImplementation(() => {
      throw new Error('Malformed file');
    });

    await runVerify(['--story', '4-1-test']);

    expect(fail).toHaveBeenCalledWith(
      expect.stringContaining('Failed to parse story file'),
      expect.any(Object),
    );
    expect(process.exitCode).toBe(1);
  });

  it('runs showboat verify when proof quality passes and showboat passes', async () => {
    vi.mocked(checkPreconditions).mockReturnValue({ passed: true, failures: [] });
    vi.mocked(parseStoryACs).mockReturnValue([
      { id: '1', description: 'Test', type: 'general', verifiability: 'cli-verifiable' as const },
    ]);
    vi.mocked(createProofDocument).mockReturnValue(join(testDir, 'verification', '4-1-test-proof.md'));
    vi.mocked(validateProofQuality).mockReturnValue({ verified: 1, pending: 0, escalated: 0, total: 1, passed: true });
    vi.mocked(runShowboatVerify).mockReturnValue({ passed: true, output: 'All passed' });
    vi.mocked(updateVerificationState).mockImplementation(() => {});
    vi.mocked(closeBeadsIssue).mockImplementation(() => {});

    await runVerify(['--story', '4-1-test']);

    expect(ok).toHaveBeenCalled();
  });

  it('fails when showboat verify reports failure', async () => {
    vi.mocked(checkPreconditions).mockReturnValue({ passed: true, failures: [] });
    vi.mocked(parseStoryACs).mockReturnValue([
      { id: '1', description: 'Test', type: 'general', verifiability: 'cli-verifiable' as const },
    ]);
    vi.mocked(createProofDocument).mockReturnValue(join(testDir, 'verification', '4-1-test-proof.md'));
    vi.mocked(validateProofQuality).mockReturnValue({ verified: 1, pending: 0, escalated: 0, total: 1, passed: true });
    vi.mocked(runShowboatVerify).mockReturnValue({ passed: false, output: 'Diff found' });

    await runVerify(['--story', '4-1-test']);

    expect(fail).toHaveBeenCalledWith(
      expect.stringContaining('Showboat verify failed'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('skips showboat verify when showboat not available', async () => {
    vi.mocked(checkPreconditions).mockReturnValue({ passed: true, failures: [] });
    vi.mocked(parseStoryACs).mockReturnValue([
      { id: '1', description: 'Test', type: 'general', verifiability: 'cli-verifiable' as const },
    ]);
    vi.mocked(createProofDocument).mockReturnValue(join(testDir, 'verification', '4-1-test-proof.md'));
    vi.mocked(validateProofQuality).mockReturnValue({ verified: 1, pending: 0, escalated: 0, total: 1, passed: true });
    vi.mocked(runShowboatVerify).mockReturnValue({ passed: false, output: 'showboat not available' });
    vi.mocked(updateVerificationState).mockImplementation(() => {});
    vi.mocked(closeBeadsIssue).mockImplementation(() => {});

    await runVerify(['--story', '4-1-test']);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Showboat not installed'));
    expect(ok).toHaveBeenCalled();
  });

  it('warns when updateVerificationState throws', async () => {
    vi.mocked(checkPreconditions).mockReturnValue({ passed: true, failures: [] });
    vi.mocked(parseStoryACs).mockReturnValue([
      { id: '1', description: 'Test', type: 'general', verifiability: 'cli-verifiable' as const },
    ]);
    vi.mocked(createProofDocument).mockReturnValue(join(testDir, 'verification', '4-1-test-proof.md'));
    vi.mocked(validateProofQuality).mockReturnValue({ verified: 1, pending: 0, escalated: 0, total: 1, passed: true });
    vi.mocked(runShowboatVerify).mockReturnValue({ passed: false, output: 'showboat not available' });
    vi.mocked(updateVerificationState).mockImplementation(() => {
      throw new Error('state write failed');
    });
    vi.mocked(closeBeadsIssue).mockImplementation(() => {});

    await runVerify(['--story', '4-1-test']);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Failed to update state'));
    expect(ok).toHaveBeenCalled();
  });

  it('does NOT mark story as verified when proof quality fails', async () => {
    vi.mocked(checkPreconditions).mockReturnValue({ passed: true, failures: [] });
    vi.mocked(parseStoryACs).mockReturnValue([
      { id: '1', description: 'Test', type: 'general', verifiability: 'cli-verifiable' as const },
    ]);
    vi.mocked(createProofDocument).mockReturnValue(join(testDir, 'verification', '4-1-test-proof.md'));
    vi.mocked(validateProofQuality).mockReturnValue({ verified: 0, pending: 1, escalated: 0, total: 1, passed: false });

    await runVerify(['--story', '4-1-test']);

    expect(updateVerificationState).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('rejects story IDs with path traversal sequences', async () => {
    await runVerify(['--story', '../../etc/passwd']);
    expect(fail).toHaveBeenCalledWith(
      expect.stringContaining('Invalid story ID'),
      expect.any(Object),
    );
    expect(process.exitCode).toBe(1);
  });

  it('rejects story IDs with slashes', async () => {
    await runVerify(['--story', 'foo/bar']);
    expect(fail).toHaveBeenCalledWith(
      expect.stringContaining('Invalid story ID'),
      expect.any(Object),
    );
    expect(process.exitCode).toBe(1);
  });

  it('rejects story IDs with special characters', async () => {
    await runVerify(['--story', 'story;rm -rf /']);
    expect(fail).toHaveBeenCalledWith(
      expect.stringContaining('Invalid story ID'),
      expect.any(Object),
    );
    expect(process.exitCode).toBe(1);
  });

  it('warns about escalated ACs when proof passes with escalations', async () => {
    vi.mocked(checkPreconditions).mockReturnValue({ passed: true, failures: [] });
    vi.mocked(parseStoryACs).mockReturnValue([
      { id: '1', description: 'CLI test', type: 'general', verifiability: 'cli-verifiable' as const },
      { id: '2', description: 'Needs integration', type: 'general', verifiability: 'integration-required' as const },
    ]);
    vi.mocked(createProofDocument).mockReturnValue(join(testDir, 'verification', '4-1-test-proof.md'));
    vi.mocked(validateProofQuality).mockReturnValue({ verified: 1, pending: 0, escalated: 1, total: 2, passed: true });
    vi.mocked(runShowboatVerify).mockReturnValue({ passed: false, output: 'showboat not available' });
    vi.mocked(updateVerificationState).mockImplementation(() => {});
    vi.mocked(closeBeadsIssue).mockImplementation(() => {});

    await runVerify(['--story', '4-1-test']);

    expect(warn).toHaveBeenCalledWith('Story 4-1-test has 1 ACs requiring integration verification');
    expect(info).toHaveBeenCalledWith('Run these ACs manually or in a dedicated verification session');
    expect(ok).toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('includes escalatedCount in JSON output', async () => {
    vi.mocked(checkPreconditions).mockReturnValue({ passed: true, failures: [] });
    vi.mocked(parseStoryACs).mockReturnValue([
      { id: '1', description: 'CLI test', type: 'general', verifiability: 'cli-verifiable' as const },
      { id: '2', description: 'Integration AC', type: 'general', verifiability: 'integration-required' as const },
    ]);
    vi.mocked(createProofDocument).mockReturnValue(join(testDir, 'verification', '4-1-test-proof.md'));
    vi.mocked(validateProofQuality).mockReturnValue({ verified: 1, pending: 0, escalated: 1, total: 2, passed: true });
    vi.mocked(runShowboatVerify).mockReturnValue({ passed: false, output: 'showboat not available' });
    vi.mocked(updateVerificationState).mockImplementation(() => {});
    vi.mocked(closeBeadsIssue).mockImplementation(() => {});

    await runVerify(['--story', '4-1-test', '--json']);

    expect(jsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        storyId: '4-1-test',
        success: true,
        escalatedCount: 1,
        proofQuality: { verified: 1, pending: 0, escalated: 1, total: 2 },
      }),
    );
  });

  it('outputs JSON precondition failures when --json is set', async () => {
    vi.mocked(checkPreconditions).mockReturnValue({
      passed: false,
      failures: ['tests_passed is false — run tests first'],
    });

    await runVerify(['--story', '4-1-test', '--json']);

    expect(jsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'fail',
        message: 'Preconditions not met',
        failures: ['tests_passed is false — run tests first'],
      }),
    );
    expect(process.exitCode).toBe(1);
  });
});

// ─── Retro Verification Tests ───────────────────────────────────────────────

describe('verify command — retro mode', () => {
  it('succeeds when retro file exists and updates sprint status', async () => {
    // Create retro file
    const storyDir = join(testDir, '_bmad-output', 'implementation-artifacts');
    writeFileSync(
      join(storyDir, 'epic-5-retrospective.md'),
      '# Epic 5 Retrospective\n\n## Action Items\n\n| Item | Status |\n|------|--------|\n| Fix tests | Done |\n',
    );

    await runVerify(['--retro', '--epic', '5']);

    expect(updateSprintStatus).toHaveBeenCalledWith('epic-5-retrospective', 'done', expect.any(String));
    expect(ok).toHaveBeenCalledWith('Epic 5 retrospective: marked done');
    expect(process.exitCode).toBeUndefined();
  });

  it('fails when retro file does not exist', async () => {
    await runVerify(['--retro', '--epic', '99']);

    expect(fail).toHaveBeenCalledWith(expect.stringContaining('epic-99-retrospective.md not found'));
    expect(process.exitCode).toBe(1);
    expect(updateSprintStatus).not.toHaveBeenCalled();
  });

  it('outputs JSON when retro file exists and --json is set', async () => {
    const storyDir = join(testDir, '_bmad-output', 'implementation-artifacts');
    writeFileSync(
      join(storyDir, 'epic-3-retrospective.md'),
      '# Epic 3 Retrospective\n',
    );

    await runVerify(['--retro', '--epic', '3', '--json']);

    expect(jsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        epic: 3,
        retroFile: expect.stringContaining('epic-3-retrospective.md'),
      }),
    );
  });

  it('outputs JSON when retro file is missing and --json is set', async () => {
    await runVerify(['--retro', '--epic', '99', '--json']);

    expect(jsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'fail',
        epic: 99,
        retroFile: 'epic-99-retrospective.md',
        message: expect.stringContaining('not found'),
      }),
    );
    expect(process.exitCode).toBe(1);
  });

  it('fails when --retro is set but --epic is missing', async () => {
    await runVerify(['--retro']);

    expect(fail).toHaveBeenCalledWith(
      expect.stringContaining('--epic is required with --retro'),
      expect.any(Object),
    );
    expect(process.exitCode).toBe(1);
  });

  it('fails when --epic is not a valid number', async () => {
    await runVerify(['--retro', '--epic', 'abc']);

    expect(fail).toHaveBeenCalledWith(
      expect.stringContaining('Invalid epic number'),
      expect.any(Object),
    );
    expect(process.exitCode).toBe(1);
  });

  it('fails when --epic is 0 (invalid epic number)', async () => {
    await runVerify(['--retro', '--epic', '0']);

    expect(fail).toHaveBeenCalledWith(
      expect.stringContaining('Invalid epic number'),
      expect.any(Object),
    );
    expect(process.exitCode).toBe(1);
  });

  it('warns but succeeds when updateSprintStatus throws', async () => {
    const storyDir = join(testDir, '_bmad-output', 'implementation-artifacts');
    writeFileSync(
      join(storyDir, 'epic-7-retrospective.md'),
      '# Epic 7 Retrospective\n',
    );

    vi.mocked(updateSprintStatus).mockImplementation(() => {
      throw new Error('disk full');
    });

    await runVerify(['--retro', '--epic', '7']);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Failed to update sprint status'));
    expect(ok).toHaveBeenCalledWith('Epic 7 retrospective: marked done');
    expect(process.exitCode).toBeUndefined();
  });
});
