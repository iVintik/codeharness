import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// Mock dependencies
vi.mock('../../lib/output.js', () => ({
  ok: vi.fn(),
  fail: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  jsonOutput: vi.fn(),
}));

vi.mock('../../lib/onboard-checks.js', () => ({
  runPreconditions: vi.fn(),
}));

vi.mock('../../modules/audit/index.js', () => ({
  runAudit: vi.fn(),
  generateFixStories: vi.fn(),
  addFixStoriesToState: vi.fn(),
  formatAuditHuman: vi.fn(),
  formatAuditJson: vi.fn(),
}));

import { ok as okOutput, fail as failOutput, info, jsonOutput } from '../../lib/output.js';
import { runPreconditions } from '../../lib/onboard-checks.js';
import { runAudit, generateFixStories, addFixStoriesToState, formatAuditHuman, formatAuditJson } from '../../modules/audit/index.js';
import { registerAuditCommand } from '../audit.js';

const mockRunPreconditions = vi.mocked(runPreconditions);
const mockRunAudit = vi.mocked(runAudit);
const mockFormatAuditHuman = vi.mocked(formatAuditHuman);
const mockFormatAuditJson = vi.mocked(formatAuditJson);
const mockFailOutput = vi.mocked(failOutput);
const mockOkOutput = vi.mocked(okOutput);
const mockInfoOutput = vi.mocked(info);
const mockJsonOutput = vi.mocked(jsonOutput);
const mockGenerateFixStories = vi.mocked(generateFixStories);
const mockAddFixStoriesToState = vi.mocked(addFixStoriesToState);

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
});

async function runAuditCmd(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  program.option('--json', 'JSON output');
  registerAuditCommand(program);
  try {
    await program.parseAsync(['node', 'test', 'audit', ...args]);
  } catch {
    // Commander throws on exitOverride — ignore
  }
}

function setupInitialized(): void {
  mockRunPreconditions.mockReturnValue({
    canProceed: true,
    warnings: [],
    initialized: true,
    bmad: true,
    hooks: true,
  });
}

function setupNotInitialized(): void {
  mockRunPreconditions.mockReturnValue({
    canProceed: false,
    warnings: [],
    initialized: false,
    bmad: false,
    hooks: false,
  });
}

describe('registerAuditCommand', () => {
  it('registers the audit command', () => {
    const program = new Command();
    registerAuditCommand(program);
    const auditCmd = program.commands.find(c => c.name() === 'audit');
    expect(auditCmd).toBeDefined();
  });

  it('registers --fix option', () => {
    const program = new Command();
    registerAuditCommand(program);
    const auditCmd = program.commands.find(c => c.name() === 'audit');
    const fixOption = auditCmd?.options.find(o => o.long === '--fix');
    expect(fixOption).toBeDefined();
  });

  it('exits with fail when not initialized', async () => {
    setupNotInitialized();

    await runAuditCmd([]);

    expect(mockFailOutput).toHaveBeenCalledWith(
      'Harness not initialized -- run codeharness init first',
    );
    expect(process.exitCode).toBe(1);
  });

  it('exits with JSON fail when not initialized with --json', async () => {
    setupNotInitialized();

    await runAuditCmd(['--json']);

    expect(mockJsonOutput).toHaveBeenCalledWith({
      status: 'fail',
      message: 'Harness not initialized -- run codeharness init first',
    });
    expect(process.exitCode).toBe(1);
  });

  it('produces valid JSON with --json flag', async () => {
    setupInitialized();
    mockRunAudit.mockResolvedValue({
      success: true,
      data: {
        dimensions: {},
        overallStatus: 'pass',
        gapCount: 0,
        durationMs: 100,
      },
    });
    mockFormatAuditJson.mockReturnValue({ dimensions: {}, overallStatus: 'pass', gapCount: 0, durationMs: 100 });

    await runAuditCmd(['--json']);

    expect(mockJsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({ overallStatus: 'pass' }),
    );
  });

  it('formats human output when no --json flag', async () => {
    setupInitialized();
    mockRunAudit.mockResolvedValue({
      success: true,
      data: {
        dimensions: {},
        overallStatus: 'pass',
        gapCount: 0,
        durationMs: 100,
      },
    });
    mockFormatAuditHuman.mockReturnValue(['[OK] all good']);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runAuditCmd([]);
    expect(mockFormatAuditHuman).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('handles runAudit failure with human output', async () => {
    setupInitialized();
    mockRunAudit.mockResolvedValue({
      success: false,
      error: 'Unexpected audit failure',
    });

    await runAuditCmd([]);

    expect(mockFailOutput).toHaveBeenCalledWith('Unexpected audit failure');
    expect(process.exitCode).toBe(1);
  });

  it('handles runAudit failure with --json output', async () => {
    setupInitialized();
    mockRunAudit.mockResolvedValue({
      success: false,
      error: 'Unexpected audit failure',
    });

    await runAuditCmd(['--json']);

    expect(mockJsonOutput).toHaveBeenCalledWith({
      status: 'fail',
      message: 'Unexpected audit failure',
    });
    expect(process.exitCode).toBe(1);
  });

  it('sets exit code 1 when overall status is fail', async () => {
    setupInitialized();
    mockRunAudit.mockResolvedValue({
      success: true,
      data: {
        dimensions: {},
        overallStatus: 'fail',
        gapCount: 2,
        durationMs: 100,
      },
    });
    mockFormatAuditHuman.mockReturnValue(['[FAIL] testing: 30%']);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runAuditCmd([]);
    expect(process.exitCode).toBe(1);
    consoleSpy.mockRestore();
  });
});

// ─── --fix flag tests ────────────────────────────────────────────────────────

describe('audit --fix', () => {
  it('calls generateFixStories when gaps are found', async () => {
    setupInitialized();
    const auditData = {
      dimensions: {
        testing: { name: 'testing', status: 'fail' as const, metric: '1 gap', gaps: [{ dimension: 'testing', description: 'Gap', suggestedFix: 'Fix' }] },
      },
      overallStatus: 'fail' as const,
      gapCount: 1,
      durationMs: 50,
    };
    mockRunAudit.mockResolvedValue({ success: true, data: auditData });
    mockGenerateFixStories.mockReturnValue({
      success: true,
      data: { stories: [], created: 0, skipped: 0 },
    });
    mockAddFixStoriesToState.mockReturnValue({ success: true, data: undefined });
    mockFormatAuditHuman.mockReturnValue(['output']);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runAuditCmd(['--fix']);
    consoleSpy.mockRestore();

    expect(mockGenerateFixStories).toHaveBeenCalledWith(auditData);
  });

  it('prints OK message when no gaps with --fix (AC #4)', async () => {
    setupInitialized();
    mockRunAudit.mockResolvedValue({
      success: true,
      data: {
        dimensions: {},
        overallStatus: 'pass',
        gapCount: 0,
        durationMs: 50,
      },
    });

    await runAuditCmd(['--fix']);

    expect(mockOkOutput).toHaveBeenCalledWith('No gaps found -- nothing to fix');
    expect(mockGenerateFixStories).not.toHaveBeenCalled();
  });

  it('includes fixStories in JSON output when --fix --json (AC #5)', async () => {
    setupInitialized();
    const gap = { dimension: 'testing', description: 'Gap A', suggestedFix: 'Fix A' };
    const auditData = {
      dimensions: {
        testing: { name: 'testing', status: 'fail' as const, metric: '1 gap', gaps: [gap] },
      },
      overallStatus: 'fail' as const,
      gapCount: 1,
      durationMs: 50,
    };
    mockRunAudit.mockResolvedValue({ success: true, data: auditData });
    mockGenerateFixStories.mockReturnValue({
      success: true,
      data: {
        stories: [{ key: 'audit-fix-testing-1', filePath: '/path/file.md', gap, skipped: false }],
        created: 1,
        skipped: 0,
      },
    });
    mockAddFixStoriesToState.mockReturnValue({ success: true, data: undefined });
    mockFormatAuditJson.mockReturnValue(auditData);

    await runAuditCmd(['--fix', '--json']);

    expect(mockJsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        fixStories: expect.arrayContaining([
          expect.objectContaining({ key: 'audit-fix-testing-1' }),
        ]),
      }),
    );
  });

  it('includes empty fixStories in JSON when --fix --json and no gaps', async () => {
    setupInitialized();
    mockRunAudit.mockResolvedValue({
      success: true,
      data: {
        dimensions: {},
        overallStatus: 'pass',
        gapCount: 0,
        durationMs: 50,
      },
    });
    mockFormatAuditJson.mockReturnValue({ dimensions: {}, overallStatus: 'pass', gapCount: 0, durationMs: 50 });

    await runAuditCmd(['--fix', '--json']);

    expect(mockJsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({ fixStories: [] }),
    );
  });

  it('--fix is blocked by precondition check (AC #10)', async () => {
    setupNotInitialized();

    await runAuditCmd(['--fix']);

    expect(mockFailOutput).toHaveBeenCalledWith(
      'Harness not initialized -- run codeharness init first',
    );
    expect(process.exitCode).toBe(1);
    expect(mockGenerateFixStories).not.toHaveBeenCalled();
  });

  it('includes fixError in JSON when generateFixStories fails with --json', async () => {
    setupInitialized();
    const auditData = {
      dimensions: {
        testing: { name: 'testing', status: 'fail' as const, metric: '1 gap', gaps: [{ dimension: 'testing', description: 'Gap', suggestedFix: 'Fix' }] },
      },
      overallStatus: 'fail' as const,
      gapCount: 1,
      durationMs: 50,
    };
    mockRunAudit.mockResolvedValue({ success: true, data: auditData });
    mockGenerateFixStories.mockReturnValue({
      success: false,
      error: 'Permission denied',
    });
    mockFormatAuditJson.mockReturnValue(auditData);

    await runAuditCmd(['--fix', '--json']);

    expect(mockJsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        fixStories: [],
        fixError: 'Permission denied',
      }),
    );
  });

  it('includes fixStateError in JSON when addFixStoriesToState fails with --json', async () => {
    setupInitialized();
    const gap = { dimension: 'testing', description: 'Gap', suggestedFix: 'Fix' };
    const auditData = {
      dimensions: {
        testing: { name: 'testing', status: 'fail' as const, metric: '1 gap', gaps: [gap] },
      },
      overallStatus: 'fail' as const,
      gapCount: 1,
      durationMs: 50,
    };
    mockRunAudit.mockResolvedValue({ success: true, data: auditData });
    mockGenerateFixStories.mockReturnValue({
      success: true,
      data: {
        stories: [{ key: 'audit-fix-testing-1', filePath: '/path/file.md', gap, skipped: false }],
        created: 1,
        skipped: 0,
      },
    });
    mockAddFixStoriesToState.mockReturnValue({ success: false, error: 'State file corrupted' });
    mockFormatAuditJson.mockReturnValue(auditData);

    await runAuditCmd(['--fix', '--json']);

    expect(mockJsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        fixStateError: 'State file corrupted',
      }),
    );
  });

  it('calls addFixStoriesToState after generating stories', async () => {
    setupInitialized();
    const stories = [
      { key: 'audit-fix-testing-1', filePath: '/path/file.md', gap: { dimension: 'testing', description: 'Gap', suggestedFix: 'Fix' }, skipped: false },
    ];
    mockRunAudit.mockResolvedValue({
      success: true,
      data: {
        dimensions: { testing: { name: 'testing', status: 'fail', metric: '1 gap', gaps: [{ dimension: 'testing', description: 'Gap', suggestedFix: 'Fix' }] } },
        overallStatus: 'fail',
        gapCount: 1,
        durationMs: 50,
      },
    });
    mockGenerateFixStories.mockReturnValue({
      success: true,
      data: { stories, created: 1, skipped: 0 },
    });
    mockAddFixStoriesToState.mockReturnValue({ success: true, data: undefined });
    mockFormatAuditHuman.mockReturnValue(['output']);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runAuditCmd(['--fix']);
    consoleSpy.mockRestore();

    expect(mockAddFixStoriesToState).toHaveBeenCalledWith(stories);
  });
});
