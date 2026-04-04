import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all module internals
vi.mock('../orchestrator.js', () => ({
  checkPreconditions: vi.fn(),
  createProofDocument: vi.fn(),
  runShowboatVerify: vi.fn(),
  updateVerificationState: vi.fn(),
  closeBeadsIssue: vi.fn(),
}));

vi.mock('../proof.js', () => ({
  validateProofQuality: vi.fn(),
  proofHasContent: vi.fn(),
  classifyEvidenceCommands: vi.fn(),
  checkBlackBoxEnforcement: vi.fn(),
}));

vi.mock('../parser.js', () => ({
  parseStoryACs: vi.fn(),
  classifyAC: vi.fn(),
}));

vi.mock('../env.js', () => ({
  buildVerifyImage: vi.fn(),
  prepareVerifyWorkspace: vi.fn(),
  checkVerifyEnv: vi.fn(),
  cleanupVerifyEnv: vi.fn(),
  isValidStoryKey: vi.fn(),
  computeDistHash: vi.fn(),
}));

// Mock output to suppress warnings
vi.mock('../../../lib/output.js', () => ({
  ok: vi.fn(),
  fail: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  jsonOutput: vi.fn(),
}));

import { verifyStory, parseProof } from '../index.js';
import { checkPreconditions } from '../orchestrator.js';
import { validateProofQuality } from '../proof.js';
import { parseStoryACs } from '../parser.js';
import { runShowboatVerify, updateVerificationState, closeBeadsIssue } from '../orchestrator.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('verifyStory', () => {
  it('returns fail when preconditions not met', () => {
    vi.mocked(checkPreconditions).mockReturnValue({
      passed: false,
      failures: ['tests_passed is false'],
    });

    const result = verifyStory('4-1-test');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Preconditions not met');
    }
  });

  it('returns fail when proof quality check fails', () => {
    vi.mocked(checkPreconditions).mockReturnValue({ passed: true, failures: [] });
    vi.mocked(parseStoryACs).mockReturnValue([]);
    vi.mocked(validateProofQuality).mockReturnValue({
      verified: 0, pending: 1, escalated: 0, total: 1, passed: false,
      grepSrcCount: 0, dockerExecCount: 0, observabilityCount: 0, otherCount: 0, blackBoxPass: false,
    });

    const result = verifyStory('4-1-test');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Proof quality check failed');
    }
  });

  it('returns ok with VerifyResult on success', () => {
    vi.mocked(checkPreconditions).mockReturnValue({ passed: true, failures: [] });
    vi.mocked(parseStoryACs).mockReturnValue([
      { id: '1', description: 'Test AC', type: 'general' },
    ]);
    vi.mocked(validateProofQuality).mockReturnValue({
      verified: 1, pending: 0, escalated: 0, total: 1, passed: true,
      grepSrcCount: 0, dockerExecCount: 1, observabilityCount: 0, otherCount: 0, blackBoxPass: true,
    });
    vi.mocked(runShowboatVerify).mockReturnValue({ passed: false, output: 'showboat not available' });
    vi.mocked(updateVerificationState).mockImplementation(() => {});
    vi.mocked(closeBeadsIssue).mockImplementation(() => {});

    const result = verifyStory('4-1-test');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.storyId).toBe('4-1-test');
      expect(result.data.success).toBe(true);
      expect(result.data.totalACs).toBe(1);
      expect(result.data.verifiedCount).toBe(1);
      expect(result.data.proofPath).toContain('4-1-test');
      expect(result.data.perAC).toHaveLength(1);
    }
  });

  it('returns fail when an unexpected error is thrown', () => {
    vi.mocked(checkPreconditions).mockImplementation(() => {
      throw new Error('unexpected crash');
    });

    const result = verifyStory('4-1-test');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('unexpected crash');
    }
  });
});

describe('parseProof', () => {
  it('returns ok with ProofQuality on success', () => {
    vi.mocked(validateProofQuality).mockReturnValue({
      verified: 2, pending: 0, escalated: 1, total: 3, passed: true,
      grepSrcCount: 0, dockerExecCount: 2, observabilityCount: 0, otherCount: 0, blackBoxPass: true,
    });

    const result = parseProof('/path/to/proof.md');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.verified).toBe(2);
      expect(result.data.pending).toBe(0);
      expect(result.data.escalated).toBe(1);
      expect(result.data.total).toBe(3);
      expect(result.data.passed).toBe(true);
    }
  });

  it('returns fail when validateProofQuality throws', () => {
    vi.mocked(validateProofQuality).mockImplementation(() => {
      throw new Error('file read error');
    });

    const result = parseProof('/bad/path');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('file read error');
    }
  });

  it('returns ok with FAIL detection metrics', () => {
    vi.mocked(validateProofQuality).mockReturnValue({
      verified: 1, pending: 2, escalated: 0, total: 3, passed: false,
      grepSrcCount: 0, dockerExecCount: 1, observabilityCount: 0, otherCount: 0, blackBoxPass: true,
    });

    const result = parseProof('/path/to/proof.md');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pending).toBe(2);
      expect(result.data.passed).toBe(false);
    }
  });

  it('returns ok with ESCALATE detection metrics', () => {
    vi.mocked(validateProofQuality).mockReturnValue({
      verified: 1, pending: 0, escalated: 2, total: 3, passed: true,
      grepSrcCount: 0, dockerExecCount: 1, observabilityCount: 0, otherCount: 0, blackBoxPass: true,
    });

    const result = parseProof('/path/to/proof.md');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.escalated).toBe(2);
    }
  });

  it('returns ok with black-box enforcement metrics', () => {
    vi.mocked(validateProofQuality).mockReturnValue({
      verified: 1, pending: 0, escalated: 0, total: 1, passed: false,
      grepSrcCount: 3, dockerExecCount: 0, observabilityCount: 0, otherCount: 0, blackBoxPass: false,
    });

    const result = parseProof('/path/to/proof.md');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.blackBoxPass).toBe(false);
      expect(result.data.grepSrcCount).toBe(3);
    }
  });
});
