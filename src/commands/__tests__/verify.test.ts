import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

// Mock the verify library modules
vi.mock('../../lib/verify.js', () => ({
  checkPreconditions: vi.fn(),
  createProofDocument: vi.fn(),
  runShowboatVerify: vi.fn(),
  proofHasContent: vi.fn(),
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

import { registerVerifyCommand } from '../verify.js';
import {
  checkPreconditions,
  createProofDocument,
  runShowboatVerify,
  proofHasContent,
  updateVerificationState,
  closeBeadsIssue,
} from '../../lib/verify.js';
import { parseStoryACs } from '../../lib/verify-parser.js';
import { ok, fail, warn, jsonOutput } from '../../lib/output.js';

let testDir: string;
let originalCwd: string;

beforeEach(() => {
  vi.restoreAllMocks();
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

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('verify command', () => {
  it('requires --story argument', async () => {
    await runVerify([]);
    // Commander enforces requiredOption — will throw or fail
    // The command won't run without --story, so no mocks should be called
    expect(checkPreconditions).not.toHaveBeenCalled();
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

  it('succeeds and prints OK when verification passes', async () => {
    vi.mocked(checkPreconditions).mockReturnValue({ passed: true, failures: [] });
    vi.mocked(parseStoryACs).mockReturnValue([
      { id: '1', description: 'Test AC', type: 'general' },
    ]);
    vi.mocked(createProofDocument).mockReturnValue(join(testDir, 'verification', '4-1-test-proof.md'));
    vi.mocked(proofHasContent).mockReturnValue(false);
    vi.mocked(updateVerificationState).mockImplementation(() => {});
    vi.mocked(closeBeadsIssue).mockImplementation(() => {});

    await runVerify(['--story', '4-1-test']);

    expect(ok).toHaveBeenCalledWith('Story 4-1-test: verified — proof at verification/4-1-test-proof.md');
    expect(process.exitCode).toBeUndefined();
  });

  it('outputs JSON when --json flag is set', async () => {
    vi.mocked(checkPreconditions).mockReturnValue({ passed: true, failures: [] });
    vi.mocked(parseStoryACs).mockReturnValue([
      { id: '1', description: 'Test AC', type: 'general' },
    ]);
    vi.mocked(createProofDocument).mockReturnValue(join(testDir, 'verification', '4-1-test-proof.md'));
    vi.mocked(proofHasContent).mockReturnValue(false);
    vi.mocked(updateVerificationState).mockImplementation(() => {});
    vi.mocked(closeBeadsIssue).mockImplementation(() => {});

    await runVerify(['--story', '4-1-test', '--json']);

    expect(jsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        storyId: '4-1-test',
        success: true,
        totalACs: 1,
        verifiedCount: 0,
        failedCount: 1,
        proofPath: 'verification/4-1-test-proof.md',
        showboatVerifyStatus: 'skipped',
        perAC: expect.any(Array),
      }),
    );
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
    vi.mocked(parseStoryACs).mockReturnValue([]);
    vi.mocked(createProofDocument).mockReturnValue(join(testDir, 'verification', '4-1-test-proof.md'));
    vi.mocked(proofHasContent).mockReturnValue(false);
    vi.mocked(updateVerificationState).mockImplementation(() => {});
    vi.mocked(closeBeadsIssue).mockImplementation(() => {});

    await runVerify(['--story', '4-1-test']);

    // Should succeed without showboat
    expect(ok).toHaveBeenCalled();
  });

  it('continues when beads is unavailable', async () => {
    vi.mocked(checkPreconditions).mockReturnValue({ passed: true, failures: [] });
    vi.mocked(parseStoryACs).mockReturnValue([]);
    vi.mocked(createProofDocument).mockReturnValue(join(testDir, 'verification', '4-1-test-proof.md'));
    vi.mocked(proofHasContent).mockReturnValue(false);
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

  it('runs showboat verify when proof has content and passes', async () => {
    vi.mocked(checkPreconditions).mockReturnValue({ passed: true, failures: [] });
    vi.mocked(parseStoryACs).mockReturnValue([
      { id: '1', description: 'Test', type: 'general' },
    ]);
    vi.mocked(createProofDocument).mockReturnValue(join(testDir, 'verification', '4-1-test-proof.md'));
    vi.mocked(proofHasContent).mockReturnValue(true);
    vi.mocked(runShowboatVerify).mockReturnValue({ passed: true, output: 'All passed' });
    vi.mocked(updateVerificationState).mockImplementation(() => {});
    vi.mocked(closeBeadsIssue).mockImplementation(() => {});

    await runVerify(['--story', '4-1-test']);

    expect(ok).toHaveBeenCalled();
  });

  it('fails when showboat verify reports failure', async () => {
    vi.mocked(checkPreconditions).mockReturnValue({ passed: true, failures: [] });
    vi.mocked(parseStoryACs).mockReturnValue([
      { id: '1', description: 'Test', type: 'general' },
    ]);
    vi.mocked(createProofDocument).mockReturnValue(join(testDir, 'verification', '4-1-test-proof.md'));
    vi.mocked(proofHasContent).mockReturnValue(true);
    vi.mocked(runShowboatVerify).mockReturnValue({ passed: false, output: 'Diff found' });

    await runVerify(['--story', '4-1-test']);

    expect(fail).toHaveBeenCalledWith(
      expect.stringContaining('Showboat verify failed'),
      expect.any(Object),
    );
    expect(process.exitCode).toBe(1);
  });

  it('skips showboat verify when showboat not available', async () => {
    vi.mocked(checkPreconditions).mockReturnValue({ passed: true, failures: [] });
    vi.mocked(parseStoryACs).mockReturnValue([]);
    vi.mocked(createProofDocument).mockReturnValue(join(testDir, 'verification', '4-1-test-proof.md'));
    vi.mocked(proofHasContent).mockReturnValue(true);
    vi.mocked(runShowboatVerify).mockReturnValue({ passed: false, output: 'showboat not available' });
    vi.mocked(updateVerificationState).mockImplementation(() => {});
    vi.mocked(closeBeadsIssue).mockImplementation(() => {});

    await runVerify(['--story', '4-1-test']);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Showboat not installed'));
    expect(ok).toHaveBeenCalled();
  });

  it('warns when updateVerificationState throws', async () => {
    vi.mocked(checkPreconditions).mockReturnValue({ passed: true, failures: [] });
    vi.mocked(parseStoryACs).mockReturnValue([]);
    vi.mocked(createProofDocument).mockReturnValue(join(testDir, 'verification', '4-1-test-proof.md'));
    vi.mocked(proofHasContent).mockReturnValue(false);
    vi.mocked(updateVerificationState).mockImplementation(() => {
      throw new Error('state write failed');
    });
    vi.mocked(closeBeadsIssue).mockImplementation(() => {});

    await runVerify(['--story', '4-1-test']);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Failed to update state'));
    expect(ok).toHaveBeenCalled();
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
