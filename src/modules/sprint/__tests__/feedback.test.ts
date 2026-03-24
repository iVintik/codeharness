import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node:fs before importing the module under test
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

// Mock the state module
vi.mock('../state.js', () => ({
  getSprintState: vi.fn(),
  updateStoryStatus: vi.fn(),
}));

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseProofForFailures, writeVerificationFindings, processVerifyResult } from '../feedback.js';
import { getSprintState, updateStoryStatus } from '../state.js';

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedGetSprintState = vi.mocked(getSprintState);
const mockedUpdateStoryStatus = vi.mocked(updateStoryStatus);

beforeEach(() => {
  vi.resetAllMocks();
});

// Sample proof with mixed verdicts
const PROOF_WITH_FAILURES = `# Verification Proof: 3-3-test

## AC 1: First criterion passes

\`\`\`bash
npm test
\`\`\`

\`\`\`output
all tests pass
\`\`\`

**Verdict:** PASS

## AC 2: Second criterion fails

\`\`\`bash
npm run check
\`\`\`

\`\`\`output
Error: assertion failed at line 42
Expected: true
Got: false
\`\`\`

**Verdict:** FAIL

## AC 3: Third criterion is escalated

Some investigation text.

**Verdict:** [ESCALATE]

## AC 4: Fourth criterion also fails

\`\`\`bash
curl http://localhost:3000/health
\`\`\`

\`\`\`output
Connection refused
\`\`\`

**Verdict:** FAIL — service not running
`;

const PROOF_ALL_PASS = `# Verification Proof: 3-3-test

## AC 1: First criterion

\`\`\`bash
npm test
\`\`\`

\`\`\`output
ok
\`\`\`

**Verdict:** PASS

## AC 2: Second criterion

\`\`\`bash
npm run lint
\`\`\`

\`\`\`output
ok
\`\`\`

**Verdict:** PASS
`;

const PROOF_ESCALATE_ONLY = `# Verification Proof: 3-3-test

## AC 1: Criterion

**Verdict:** [ESCALATE] — needs integration test

## AC 2: Another

**Verdict:** PASS
`;

const PROOF_NO_VERDICT = `# Verification Proof: test

## AC 1: Criterion with no verdict

Some text but no verdict line at all.

## AC 2: Criterion that fails

**Verdict:** FAIL
`;

const PROOF_FAIL_NO_CODE_BLOCKS = `# Verification Proof: test

## AC 1: Criterion fails without code blocks

Just some text describing the failure.

**Verdict:** FAIL
`;

const PROOF_MULTILINE_VERDICT = `# Verification Proof: test

## AC 1: Criterion with multiline verdict

**Verdict:**
FAIL
`;

describe('parseProofForFailures', () => {
  it('extracts failing ACs from proof markdown', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(PROOF_WITH_FAILURES);

    const result = parseProofForFailures('/tmp/proof.md');
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data).toHaveLength(2);
    expect(result.data[0].acNumber).toBe(2);
    expect(result.data[0].description).toBe('Second criterion fails');
    expect(result.data[0].verdict).toBe('FAIL');
    expect(result.data[0].errorOutput).toContain('assertion failed');

    expect(result.data[1].acNumber).toBe(4);
    expect(result.data[1].description).toBe('Fourth criterion also fails');
    expect(result.data[1].verdict).toContain('FAIL');
    expect(result.data[1].errorOutput).toContain('Connection refused');
  });

  it('returns empty array when all ACs pass', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(PROOF_ALL_PASS);

    const result = parseProofForFailures('/tmp/proof.md');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(0);
  });

  it('skips [ESCALATE] verdicts (not treated as failures)', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(PROOF_ESCALATE_ONLY);

    const result = parseProofForFailures('/tmp/proof.md');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(0);
  });

  it('returns fail() on missing proof file', () => {
    mockedExistsSync.mockReturnValue(false);

    const result = parseProofForFailures('/tmp/nonexistent.md');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('Proof file not found');
  });

  it('skips AC sections with no verdict line', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(PROOF_NO_VERDICT);

    const result = parseProofForFailures('/tmp/proof.md');
    expect(result.success).toBe(true);
    if (!result.success) return;
    // Only AC 2 has a verdict, and it FAILs
    expect(result.data).toHaveLength(1);
    expect(result.data[0].acNumber).toBe(2);
  });

  it('extracts failing AC with empty errorOutput when no code blocks present', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(PROOF_FAIL_NO_CODE_BLOCKS);

    const result = parseProofForFailures('/tmp/proof.md');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].acNumber).toBe(1);
    expect(result.data[0].errorOutput).toBe('');
  });

  it('handles verdict on next line after Verdict: label', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(PROOF_MULTILINE_VERDICT);

    const result = parseProofForFailures('/tmp/proof.md');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].verdict).toBe('FAIL');
  });

  it('returns fail() on read error', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    const result = parseProofForFailures('/tmp/proof.md');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('Failed to parse proof');
    expect(result.error).toContain('EACCES');
  });
});

describe('writeVerificationFindings', () => {
  const STORY_CONTENT = `# Story 3.3

## Acceptance Criteria

1. Some AC

## Tasks / Subtasks

- [ ] Task 1

## Dev Agent Record

### Agent Model Used
`;

  const STORY_WITH_FINDINGS = `# Story 3.3

## Acceptance Criteria

1. Some AC

## Verification Findings

_Last updated: 2026-01-01T00:00:00.000Z_

The following ACs failed black-box verification:

### AC 1: Old finding
**Verdict:** FAIL
**Error output:**
\`\`\`
old error
\`\`\`

## Dev Agent Record

### Agent Model Used
`;

  it('appends findings section to story file before Dev Agent Record', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(STORY_CONTENT);

    const failingAcs = [
      { acNumber: 2, description: 'Test fails', errorOutput: 'Error: boom', verdict: 'FAIL' },
    ];

    const result = writeVerificationFindings('3-3-test', failingAcs);
    expect(result.success).toBe(true);

    expect(mockedWriteFileSync).toHaveBeenCalledTimes(1);
    const written = mockedWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('## Verification Findings');
    expect(written).toContain('### AC 2: Test fails');
    expect(written).toContain('**Verdict:** FAIL');
    expect(written).toContain('Error: boom');
    // Findings should appear before Dev Agent Record
    const findingsIdx = written.indexOf('## Verification Findings');
    const devAgentIdx = written.indexOf('## Dev Agent Record');
    expect(findingsIdx).toBeLessThan(devAgentIdx);
  });

  it('replaces existing findings section', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(STORY_WITH_FINDINGS);

    const failingAcs = [
      { acNumber: 5, description: 'New failure', errorOutput: 'new error', verdict: 'FAIL' },
    ];

    const result = writeVerificationFindings('3-3-test', failingAcs);
    expect(result.success).toBe(true);

    const written = mockedWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('### AC 5: New failure');
    expect(written).not.toContain('Old finding');
    expect(written).not.toContain('old error');
    // Should still have Dev Agent Record
    expect(written).toContain('## Dev Agent Record');
  });

  it('replaces existing findings section when it is the last section (no following heading)', () => {
    const storyFindingsAtEnd = `# Story 3.3

## Acceptance Criteria

1. Some AC

## Verification Findings

_Last updated: 2026-01-01T00:00:00.000Z_

The following ACs failed black-box verification:

### AC 1: Old finding
**Verdict:** FAIL
**Error output:**
\`\`\`
old error
\`\`\`
`;
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(storyFindingsAtEnd);

    const failingAcs = [
      { acNumber: 3, description: 'New fail', errorOutput: 'new err', verdict: 'FAIL' },
    ];

    const result = writeVerificationFindings('3-3-test', failingAcs);
    expect(result.success).toBe(true);

    const written = mockedWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('### AC 3: New fail');
    expect(written).not.toContain('Old finding');
    expect(written).not.toContain('old error');
  });

  it('returns fail() on missing story file', () => {
    mockedExistsSync.mockReturnValue(false);

    const result = writeVerificationFindings('nonexistent', []);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('Story file not found');
  });

  it('returns fail() on write error', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(STORY_CONTENT);
    mockedWriteFileSync.mockImplementation(() => {
      throw new Error('ENOSPC: disk full');
    });

    const result = writeVerificationFindings('3-3-test', [
      { acNumber: 1, description: 'x', errorOutput: 'y', verdict: 'FAIL' },
    ]);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('Failed to write verification findings');
  });

  it('appends at end when no Dev Agent Record section exists', () => {
    const contentNoDevAgent = '# Story\n\n## Tasks\n\n- [ ] Task 1\n';
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(contentNoDevAgent);

    const result = writeVerificationFindings('3-3-test', [
      { acNumber: 1, description: 'Fail', errorOutput: 'err', verdict: 'FAIL' },
    ]);
    expect(result.success).toBe(true);

    const written = mockedWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('## Verification Findings');
    expect(written).toContain('### AC 1: Fail');
  });
});

describe('processVerifyResult', () => {
  function mockState(attempts: number, status: string = 'verifying'): void {
    mockedGetSprintState.mockReturnValue({
      success: true,
      data: {
        version: 2,
        sprint: { total: 1, done: 0, failed: 0, blocked: 0, inProgress: null },
        stories: {
          '3-3-test': {
            status: status as 'verifying',
            attempts,
            lastAttempt: '2026-01-01T00:00:00Z',
            lastError: null,
            proofPath: null,
            acResults: null,
          },
        },
        retries: {},
        flagged: [],
        epics: {},
        session: { active: false, startedAt: null, iteration: 0, elapsedSeconds: 0 },
        observability: { statementCoverage: null, branchCoverage: null, functionCoverage: null, lineCoverage: null },
        run: { active: false, startedAt: null, iteration: 0, cost: 0, completed: [], failed: [], currentStory: null, currentPhase: null, lastAction: null, acProgress: null },
        actionItems: [],
      },
    });
  }

  it('returns action: "return-to-dev" with failing ACs', () => {
    // proof has failures
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync
      .mockReturnValueOnce(PROOF_WITH_FAILURES) // parseProofForFailures
      .mockReturnValueOnce(`# Story\n\n## Dev Agent Record\n`); // writeVerificationFindings
    mockState(2);
    mockedUpdateStoryStatus.mockReturnValue({ success: true, data: undefined });

    const result = processVerifyResult('3-3-test');
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.action).toBe('return-to-dev');
    expect(result.data.storyKey).toBe('3-3-test');
    expect(result.data.failingAcs).toHaveLength(2);
    expect(result.data.attempts).toBe(3); // was 2, incremented to 3

    // Should have called updateStoryStatus with 'in-progress'
    expect(mockedUpdateStoryStatus).toHaveBeenCalledWith('3-3-test', 'in-progress');
  });

  it('returns action: "mark-done" when all pass', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValueOnce(PROOF_ALL_PASS);
    mockState(3);
    mockedUpdateStoryStatus.mockReturnValue({ success: true, data: undefined });

    const result = processVerifyResult('3-3-test');
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.action).toBe('mark-done');
    expect(result.data.failingAcs).toHaveLength(0);
    expect(result.data.attempts).toBe(3);

    expect(mockedUpdateStoryStatus).toHaveBeenCalledWith('3-3-test', 'done');
  });

  it('returns action: "mark-blocked" when attempts >= maxAttempts (default 10)', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValueOnce(PROOF_WITH_FAILURES);
    mockState(10);
    mockedUpdateStoryStatus.mockReturnValue({ success: true, data: undefined });

    const result = processVerifyResult('3-3-test');
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.action).toBe('mark-blocked');
    expect(result.data.attempts).toBe(10);

    expect(mockedUpdateStoryStatus).toHaveBeenCalledWith('3-3-test', 'blocked', {
      error: 'verify-dev-cycle-limit',
    });
  });

  it('returns action: "mark-blocked" with custom maxAttempts', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValueOnce(PROOF_WITH_FAILURES);
    mockState(3);
    mockedUpdateStoryStatus.mockReturnValue({ success: true, data: undefined });

    const result = processVerifyResult('3-3-test', { maxAttempts: 3 });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.action).toBe('mark-blocked');
  });

  it('increments attempt count via updateStoryStatus(key, "in-progress")', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync
      .mockReturnValueOnce(PROOF_WITH_FAILURES)
      .mockReturnValueOnce('# Story\n\n## Dev Agent Record\n');
    mockState(0);
    mockedUpdateStoryStatus.mockReturnValue({ success: true, data: undefined });

    const result = processVerifyResult('3-3-test');
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.action).toBe('return-to-dev');
    expect(result.data.attempts).toBe(1);
    expect(mockedUpdateStoryStatus).toHaveBeenCalledWith('3-3-test', 'in-progress');
  });

  it('reads existing attempt count from state (persistence across sessions)', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync
      .mockReturnValueOnce(PROOF_WITH_FAILURES)
      .mockReturnValueOnce('# Story\n\n## Dev Agent Record\n');
    mockState(7);
    mockedUpdateStoryStatus.mockReturnValue({ success: true, data: undefined });

    const result = processVerifyResult('3-3-test');
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.attempts).toBe(8); // 7 + 1
    expect(result.data.action).toBe('return-to-dev');
  });

  it('returns fail() when proof file is missing', () => {
    mockedExistsSync.mockReturnValue(false);

    const result = processVerifyResult('nonexistent-story');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('Proof file not found');
  });

  it('returns fail() when getSprintState fails', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValueOnce(PROOF_WITH_FAILURES);
    mockedGetSprintState.mockReturnValue({
      success: false,
      error: 'corrupt state file',
    });

    const result = processVerifyResult('3-3-test');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('corrupt state file');
  });

  it('returns fail() when updateStoryStatus fails on mark-done', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValueOnce(PROOF_ALL_PASS);
    mockState(1);
    mockedUpdateStoryStatus.mockReturnValue({
      success: false,
      error: 'write failed',
    });

    const result = processVerifyResult('3-3-test');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('write failed');
  });

  it('returns fail() when updateStoryStatus fails on mark-blocked', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValueOnce(PROOF_WITH_FAILURES);
    mockState(10);
    mockedUpdateStoryStatus.mockReturnValue({
      success: false,
      error: 'blocked write failed',
    });

    const result = processVerifyResult('3-3-test');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('blocked write failed');
  });

  it('returns fail() when writeVerificationFindings fails during return-to-dev', () => {
    // Proof has failures, state is OK, but story file is missing for writeVerificationFindings
    mockedExistsSync
      .mockReturnValueOnce(true) // proof file exists
      .mockReturnValueOnce(false); // story file does NOT exist
    mockedReadFileSync.mockReturnValueOnce(PROOF_WITH_FAILURES);
    mockState(2);
    mockedUpdateStoryStatus.mockReturnValue({ success: true, data: undefined });

    const result = processVerifyResult('3-3-test');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('Story file not found');
  });

  it('returns fail() when updateStoryStatus fails during return-to-dev (before findings write)', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValueOnce(PROOF_WITH_FAILURES);
    mockState(2);
    mockedUpdateStoryStatus.mockReturnValue({
      success: false,
      error: 'disk full during return-to-dev',
    });

    const result = processVerifyResult('3-3-test');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('disk full during return-to-dev');
    // Findings should NOT have been written since state update failed first
    expect(mockedWriteFileSync).not.toHaveBeenCalled();
  });

  it('handles story with no prior state entry (defaults to 0 attempts)', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync
      .mockReturnValueOnce(PROOF_WITH_FAILURES)
      .mockReturnValueOnce('# Story\n\n## Dev Agent Record\n');
    mockedGetSprintState.mockReturnValue({
      success: true,
      data: {
        version: 2,
        sprint: { total: 0, done: 0, failed: 0, blocked: 0, inProgress: null },
        stories: {},
        retries: {},
        flagged: [],
        epics: {},
        session: { active: false, startedAt: null, iteration: 0, elapsedSeconds: 0 },
        observability: { statementCoverage: null, branchCoverage: null, functionCoverage: null, lineCoverage: null },
        run: { active: false, startedAt: null, iteration: 0, cost: 0, completed: [], failed: [], currentStory: null, currentPhase: null, lastAction: null, acProgress: null },
        actionItems: [],
      },
    });
    mockedUpdateStoryStatus.mockReturnValue({ success: true, data: undefined });

    const result = processVerifyResult('3-3-test');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.attempts).toBe(1);
    expect(result.data.action).toBe('return-to-dev');
  });

  it('catches unexpected errors in processVerifyResult outer try/catch', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValueOnce(PROOF_ALL_PASS);
    // Make getSprintState throw instead of returning a Result
    mockedGetSprintState.mockImplementation(() => {
      throw new Error('unexpected kaboom');
    });

    const result = processVerifyResult('3-3-test');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('Failed to process verify result');
    expect(result.error).toContain('unexpected kaboom');
  });
});

describe('all functions return Result<T> — never throw', () => {
  it('parseProofForFailures never throws', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockImplementation(() => { throw new Error('crash'); });
    expect(() => parseProofForFailures('/tmp/proof.md')).not.toThrow();
    const result = parseProofForFailures('/tmp/proof.md');
    expect(result.success).toBe(false);
  });

  it('parseProofForFailures handles non-Error thrown values', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockImplementation(() => { throw 'string error'; });
    const result = parseProofForFailures('/tmp/proof.md');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('string error');
    }
  });

  it('writeVerificationFindings never throws', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockImplementation(() => { throw new Error('crash'); });
    expect(() => writeVerificationFindings('key', [])).not.toThrow();
    const result = writeVerificationFindings('key', []);
    expect(result.success).toBe(false);
  });

  it('writeVerificationFindings handles non-Error thrown values', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockImplementation(() => { throw 42; });
    const result = writeVerificationFindings('key', []);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('42');
    }
  });

  it('processVerifyResult never throws', () => {
    mockedExistsSync.mockImplementation(() => { throw new Error('crash'); });
    expect(() => processVerifyResult('key')).not.toThrow();
    const result = processVerifyResult('key');
    expect(result.success).toBe(false);
  });

  it('processVerifyResult handles non-Error thrown values in outer catch', () => {
    // Make existsSync and readFileSync work for parseProofForFailures,
    // then make getSprintState throw a non-Error value
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValueOnce(PROOF_ALL_PASS);
    mockedGetSprintState.mockImplementation(() => { throw 'non-error string'; });
    const result = processVerifyResult('key');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Failed to process verify result');
      expect(result.error).toContain('non-error string');
    }
  });
});
