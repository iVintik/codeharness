import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Mock child_process before importing verify module
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

// Mock output
vi.mock('../../../lib/output.js', () => ({
  ok: vi.fn(),
  fail: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  jsonOutput: vi.fn(),
}));

// Mock beads
vi.mock('../../../lib/beads.js', () => ({
  isBeadsInitialized: vi.fn(),
  listIssues: vi.fn(),
  closeIssue: vi.fn(),
}));

// Mock beads-sync
vi.mock('../../../lib/beads-sync.js', () => ({
  syncClose: vi.fn(),
}));

// Mock doc-health
vi.mock('../../../lib/doc-health.js', () => ({
  checkStoryDocFreshness: vi.fn(),
}));

import { execFileSync } from 'node:child_process';
import { warn } from '../../../lib/output.js';
import { isBeadsInitialized, listIssues, closeIssue } from '../../../lib/beads.js';
import { syncClose } from '../../../lib/beads-sync.js';
import { checkStoryDocFreshness } from '../../../lib/doc-health.js';
import {
  checkPreconditions,
  createProofDocument,
  runShowboatVerify,
  updateVerificationState,
  closeBeadsIssue,
} from '../orchestrator.js';
import {
  validateProofQuality,
  proofHasContent,
} from '../proof.js';
import type { VerifyResult, ProofQuality } from '../types.js';
import { writeState, readState } from '../../../lib/state.js';
import { getDefaultState } from '../../../lib/state.js';

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

  it('adds failure for stale docs when storyId is provided', () => {
    setupState({ tests_passed: true, coverage_met: true });
    vi.mocked(checkStoryDocFreshness).mockReturnValue({
      passed: false,
      documents: [
        { path: 'AGENTS.md', grade: 'stale', reason: 'AGENTS.md is stale', lastModified: null, codeLastModified: null },
      ],
      summary: { fresh: 0, stale: 1, missing: 0, total: 1 },
      scanDurationMs: 10,
    });

    const result = checkPreconditions(testDir, 'test-story');
    expect(result.passed).toBe(false);
    expect(result.failures).toContain('AGENTS.md is stale');
  });

  it('adds failure for missing docs when storyId is provided', () => {
    setupState({ tests_passed: true, coverage_met: true });
    vi.mocked(checkStoryDocFreshness).mockReturnValue({
      passed: false,
      documents: [
        { path: 'AGENTS.md', grade: 'missing', reason: 'AGENTS.md not found', lastModified: null, codeLastModified: null },
      ],
      summary: { fresh: 0, stale: 0, missing: 1, total: 1 },
      scanDurationMs: 5,
    });

    const result = checkPreconditions(testDir, 'test-story');
    expect(result.passed).toBe(false);
    expect(result.failures).toContain('AGENTS.md not found');
  });

  it('skips non-stale non-missing docs without adding failures', () => {
    setupState({ tests_passed: true, coverage_met: true });
    vi.mocked(checkStoryDocFreshness).mockReturnValue({
      passed: false,
      documents: [
        { path: 'AGENTS.md', grade: 'fresh', reason: '', lastModified: new Date(), codeLastModified: new Date() },
      ],
      summary: { fresh: 1, stale: 0, missing: 0, total: 1 },
      scanDurationMs: 5,
    });

    const result = checkPreconditions(testDir, 'test-story');
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it('passes when doc report passed is true', () => {
    setupState({ tests_passed: true, coverage_met: true });
    vi.mocked(checkStoryDocFreshness).mockReturnValue({
      passed: true,
      documents: [],
      summary: { fresh: 0, stale: 0, missing: 0, total: 0 },
      scanDurationMs: 5,
    });

    const result = checkPreconditions(testDir, 'test-story');
    expect(result.passed).toBe(true);
  });

  it('warns and continues when checkStoryDocFreshness throws', () => {
    setupState({ tests_passed: true, coverage_met: true });
    vi.mocked(checkStoryDocFreshness).mockImplementation(() => {
      throw new Error('git not found');
    });

    const result = checkPreconditions(testDir, 'test-story');
    expect(result.passed).toBe(true);
    expect(warn).toHaveBeenCalledWith('Doc health check failed — skipping');
  });
});

// ─── createProofDocument ────────────────────────────────────────────────────

describe('createProofDocument', () => {
  it('creates directories and writes proof file', () => {
    const proofPath = createProofDocument('4-1-test', 'Story 4.1: Test', [
      { id: '1', description: 'First AC', type: 'general', verifiability: 'cli-verifiable', strategy: 'docker' },
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

// ─── validateProofQuality ────────────────────────────────────────────────────

describe('validateProofQuality', () => {
  it('returns zeros and passed=false for nonexistent file', () => {
    const result = validateProofQuality('/nonexistent/proof.md');
    expect(result).toMatchObject({ verified: 0, pending: 0, escalated: 0, total: 0, passed: false });
  });

  it('returns all PENDING for skeleton proof (all ACs have no evidence)', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '# Proof: test-story',
      '',
      '## AC 1: PENDING',
      '',
      '> Given something, Then something',
      '',
      '<!-- No evidence captured yet -->',
      '',
      '## AC 2: PENDING',
      '',
      '> Given something else, Then something else',
      '',
      '<!-- No evidence captured yet -->',
      '',
      '## AC 3: PENDING',
      '',
      '> Third AC',
      '',
      '<!-- No evidence captured yet -->',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result).toMatchObject({ verified: 0, pending: 3, escalated: 0, total: 3, passed: false });
  });

  it('returns all verified for fully verified proof (all showboat exec blocks)', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '# Proof: test-story',
      '',
      '## AC 1: PASS',
      '',
      '> First AC',
      '',
      '<!-- showboat exec: codeharness verify --story test -->',
      '```',
      '[OK] verified',
      '```',
      '<!-- /showboat exec -->',
      '',
      '## AC 2: PASS',
      '',
      '> Second AC',
      '',
      '<!-- showboat exec: cat file.txt -->',
      '```',
      'content',
      '```',
      '<!-- /showboat exec -->',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result).toMatchObject({ verified: 2, pending: 0, escalated: 0, total: 2, passed: true });
  });

  it('returns passed=false for mixed proof (some verified, some PENDING)', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '# Proof: test-story',
      '',
      '## AC 1: PASS',
      '',
      '> First AC',
      '',
      '<!-- showboat exec: codeharness verify -->',
      '```',
      'ok',
      '```',
      '<!-- /showboat exec -->',
      '',
      '## AC 2: PENDING',
      '',
      '> Second AC',
      '',
      '<!-- No evidence captured yet -->',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result).toMatchObject({ verified: 1, pending: 1, escalated: 0, total: 2, passed: false });
  });

  it('considers showboat image markers as verified evidence', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '# Proof: test-story',
      '',
      '## AC 1: PASS',
      '',
      '> First AC',
      '',
      '<!-- showboat image: screenshots/test.png -->',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result).toMatchObject({ verified: 1, pending: 0, escalated: 0, total: 1, passed: true });
  });

  it('returns total=0 and passed=false for file with no AC sections', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, '# Proof: test-story\n\nNo AC sections here.');

    const result = validateProofQuality(path);
    expect(result).toMatchObject({ verified: 0, pending: 0, escalated: 0, total: 0, passed: false });
  });

  it('recognises showboat native format (bash + output code blocks) as evidence', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '## AC 1: Evidence via showboat exec',
      '',
      '> AC description',
      '',
      '```bash',
      'node dist/index.js verify --story test',
      '```',
      '',
      '```output',
      '[FAIL] Proof quality check failed',
      '```',
      '',
      '## AC 2: Also showboat native',
      '',
      '```shell',
      'cat file.txt',
      '```',
      '',
      '```output',
      'contents here',
      '```',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result).toMatchObject({ verified: 2, pending: 0, escalated: 0, total: 2, blackBoxPass: false, passed: false });
  });

  it('counts [FAIL] verdict outside code blocks as pending (not verified)', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '## AC 1: Verified',
      '',
      '> First AC',
      '',
      '<!-- showboat exec: codeharness verify -->',
      '```',
      'ok',
      '```',
      '<!-- /showboat exec -->',
      '',
      '## AC 2: Failed',
      '',
      '> Second AC',
      '',
      '[FAIL] Command output did not match expected value',
      '',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result).toMatchObject({ verified: 1, pending: 1, escalated: 0, total: 2, passed: false });
  });

  it('does not treat [FAIL] inside code blocks as a verdict', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '## AC 1: Evidence with FAIL in output',
      '',
      '> AC description',
      '',
      '```bash',
      'docker exec test node verify.js',
      '```',
      '',
      '```output',
      '[FAIL] Some check failed but this is command output not a verdict',
      '```',
      '',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result).toMatchObject({ verified: 1, pending: 0, escalated: 0, total: 1 });
  });

  it('does not treat [FAIL] inside inline code backticks as a verdict', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '## AC 1: Expected failure output',
      '',
      '> AC description',
      '',
      '```bash',
      'docker exec test codeharness status --check-docker',
      '```',
      '',
      '```output',
      '[FAIL] VictoriaMetrics stack: not running',
      '```',
      '',
      'The command correctly reports `[FAIL] VictoriaMetrics stack: not running`.',
      '',
      '**Verdict:** PASS',
      '',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result).toMatchObject({ verified: 1, pending: 0, escalated: 0, total: 1 });
  });

  it('counts [ESCALATE] sections as escalated (not pending)', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '# Proof: test-story',
      '',
      '## AC 1: PASS',
      '',
      '> First AC',
      '',
      '<!-- showboat exec: codeharness verify -->',
      '```',
      'ok',
      '```',
      '<!-- /showboat exec -->',
      '',
      '## AC 2: ESCALATE',
      '',
      '> Second AC — requires integration test',
      '',
      '[ESCALATE] Requires integration test — cannot verify in current session',
      '',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result).toMatchObject({ verified: 1, pending: 0, escalated: 1, total: 2, passed: true });
  });

  it('returns passed=true for mixed verified/escalated ACs with no pending', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '## AC 1: PASS',
      '',
      '> Verified AC',
      '',
      '<!-- showboat exec: echo ok -->',
      '```',
      'ok',
      '```',
      '<!-- /showboat exec -->',
      '',
      '## AC 2: PASS',
      '',
      '> Another verified AC',
      '',
      '<!-- showboat exec: echo ok2 -->',
      '```',
      'ok2',
      '```',
      '<!-- /showboat exec -->',
      '',
      '## AC 3: ESCALATE',
      '',
      '> Integration-required AC',
      '',
      '[ESCALATE] Requires integration test — cannot verify in current session',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result).toMatchObject({ verified: 2, pending: 0, escalated: 1, total: 3, passed: true });
  });

  it('returns passed=false for pending + escalated ACs', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '## AC 1: PENDING',
      '',
      '> Missing evidence',
      '',
      '<!-- No evidence captured yet -->',
      '',
      '## AC 2: ESCALATE',
      '',
      '> Integration-required',
      '',
      '[ESCALATE] Requires integration test',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result).toMatchObject({ verified: 0, pending: 1, escalated: 1, total: 2, passed: false });
  });
});

// ─── proofHasContent (deprecated alias) ─────────────────────────────────────

describe('proofHasContent', () => {
  it('returns false for non-existent file', () => {
    expect(proofHasContent('/nonexistent/proof.md')).toBe(false);
  });

  it('returns false for skeleton without showboat blocks in any AC section', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, '# Proof\n\n## AC 1: PENDING\n\n<!-- No evidence -->');
    expect(proofHasContent(path)).toBe(false);
  });

  it('returns true when all AC sections have showboat exec blocks', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, '# Proof\n\n## AC 1: PASS\n\n<!-- showboat exec: npm test -->\n```\nok\n```\n<!-- /showboat exec -->');
    expect(proofHasContent(path)).toBe(true);
  });

  it('returns true when all AC sections have showboat image blocks', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, '# Proof\n\n## AC 1: PASS\n\n<!-- showboat image: screenshots/test.png -->');
    expect(proofHasContent(path)).toBe(true);
  });

  it('returns false when file has no AC sections', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, '# Proof\n\nNo AC sections');
    expect(proofHasContent(path)).toBe(false);
  });
});

describe('validateProofQuality — no-space AC header format', () => {
  it('parses ## ACN: headers (no space between AC and number)', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '## AC1: Binary available',
      '',
      '```bash',
      'codeharness --version',
      '```',
      '',
      '```output',
      '0.10.0',
      '```',
      '',
      '## AC2: Commands listed',
      '',
      '```bash',
      'codeharness --help',
      '```',
      '',
      '```output',
      'Usage: codeharness [command]',
      '```',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result).toMatchObject({ verified: 2, pending: 0, escalated: 0, total: 2, blackBoxPass: false, passed: false });
  });
});

describe('validateProofQuality — narrative === AC N: format', () => {
  it('parses === AC N: markers inside code block output', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '# Verification Proof',
      '',
      '```bash',
      'some-command',
      '```',
      '',
      '```output',
      '=== AC1: writeState creates YAML ===',
      'harness_version: 0.1.0',
      '```',
      '',
      '```bash',
      'another-command',
      '```',
      '',
      '```output',
      '=== AC2: readState parses YAML ===',
      'stack: nodejs',
      '```',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result).toMatchObject({ verified: 2, pending: 0, escalated: 0, total: 2, passed: true });
  });

  it('detects escalated ACs in narrative format', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '# Proof',
      '',
      '```output',
      '=== AC1: verified thing ===',
      'result: ok',
      '```',
      '',
      '=== AC2: unverifiable thing ===',
      '[ESCALATE] Requires hardware',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result).toMatchObject({ verified: 1, pending: 0, escalated: 1, total: 2, passed: true });
  });

  it('detects pending ACs in narrative format (no output block)', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '# Proof',
      '',
      '```output',
      '=== AC1: has evidence ===',
      'data here',
      '```',
      '',
      '=== AC2: missing evidence ===',
      'No output block follows.',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result).toMatchObject({ verified: 1, pending: 1, escalated: 0, total: 2, passed: false });
  });

  it('parses bullet-list AC format with evidence', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '# Proof',
      '',
      '```bash',
      'some command',
      '```',
      '',
      '```output',
      'some output',
      '```',
      '',
      '### AC Evidence Summary:',
      '- AC1: Verified install commands',
      '- AC2: OTLP packages configured',
      '- AC3: Python support verified',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result).toMatchObject({ verified: 3, pending: 0, escalated: 0, total: 3, passed: true });
  });

  it('detects N/A and superseded ACs in bullet-list format', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '# Proof',
      '',
      '```output',
      'evidence here',
      '```',
      '',
      '- AC1: Verified thing',
      '- AC2: N/A — superseded by architecture decision',
      '- AC3: Escalated — requires hardware',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result).toMatchObject({ verified: 1, pending: 0, escalated: 2, total: 3, passed: true });
  });

  it('parses bullet-list AC format with PASS/FAIL qualifiers', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '# Proof',
      '',
      '```output',
      'evidence here',
      '```',
      '',
      '- AC1 PASS: Verified install commands',
      '- AC2 PASS (evolved): OTLP configured',
      '- AC3 FAIL: Something broken',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result).toMatchObject({ verified: 3, pending: 0, escalated: 0, total: 3, passed: true });
  });

  it('marks all as pending in bullet-list format when no evidence blocks exist', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '# Proof',
      '',
      '- AC1: Claimed verification',
      '- AC2: Also claimed',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result).toMatchObject({ verified: 0, pending: 2, escalated: 0, total: 2, passed: false });
  });
});

describe('validateProofQuality — inline --- AC N: format', () => {
  it('parses --- AC N: markers with output blocks', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '# Proof',
      '',
      '--- AC1: First check',
      '',
      '```output',
      'verified data',
      '```',
      '',
      '--- AC2: Second check',
      '',
      '```output',
      'more data',
      '```',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result).toMatchObject({ verified: 2, pending: 0, escalated: 0, total: 2 });
  });

  it('detects ESCALATE in inline AC format', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '--- AC1: First check',
      '',
      '```output',
      'verified data',
      '```',
      '',
      '--- AC2: Second check',
      '',
      '[ESCALATE] Requires hardware',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result).toMatchObject({ verified: 1, pending: 0, escalated: 1, total: 2 });
  });

  it('detects FAIL in inline AC format', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '--- AC1: First check',
      '',
      '```output',
      'verified data',
      '```',
      '',
      '--- AC2: Second check',
      '',
      '[FAIL] Something broke',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result).toMatchObject({ verified: 1, pending: 1, escalated: 0, total: 2 });
  });

  it('marks pending when no output in inline AC format', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '--- AC1: First check',
      '',
      '```output',
      'verified',
      '```',
      '',
      '--- AC2: Missing evidence',
      '',
      'No evidence here.',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result).toMatchObject({ verified: 1, pending: 1, escalated: 0, total: 2 });
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
      escalatedCount: 0,
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
      escalatedCount: 0,
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
      escalatedCount: 0,
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
      escalatedCount: 0,
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
