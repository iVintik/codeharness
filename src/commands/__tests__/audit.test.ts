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
}));

vi.mock('../../modules/audit/report.js', () => ({
  formatAuditHuman: vi.fn(),
  formatAuditJson: vi.fn(),
}));

import { fail as failOutput, jsonOutput } from '../../lib/output.js';
import { runPreconditions } from '../../lib/onboard-checks.js';
import { runAudit } from '../../modules/audit/index.js';
import { formatAuditHuman, formatAuditJson } from '../../modules/audit/report.js';
import { registerAuditCommand } from '../audit.js';

const mockRunPreconditions = vi.mocked(runPreconditions);
const mockRunAudit = vi.mocked(runAudit);
const mockFormatAuditHuman = vi.mocked(formatAuditHuman);
const mockFormatAuditJson = vi.mocked(formatAuditJson);
const mockFailOutput = vi.mocked(failOutput);
const mockJsonOutput = vi.mocked(jsonOutput);

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

describe('registerAuditCommand', () => {
  it('registers the audit command', () => {
    const program = new Command();
    registerAuditCommand(program);
    const auditCmd = program.commands.find(c => c.name() === 'audit');
    expect(auditCmd).toBeDefined();
  });

  it('exits with fail when not initialized', async () => {
    mockRunPreconditions.mockReturnValue({
      canProceed: false,
      warnings: [],
      initialized: false,
      bmad: false,
      hooks: false,
    });

    await runAuditCmd([]);

    expect(mockFailOutput).toHaveBeenCalledWith(
      'Harness not initialized -- run codeharness init first',
    );
    expect(process.exitCode).toBe(1);
  });

  it('exits with JSON fail when not initialized with --json', async () => {
    mockRunPreconditions.mockReturnValue({
      canProceed: false,
      warnings: [],
      initialized: false,
      bmad: false,
      hooks: false,
    });

    await runAuditCmd(['--json']);

    expect(mockJsonOutput).toHaveBeenCalledWith({
      status: 'fail',
      message: 'Harness not initialized -- run codeharness init first',
    });
    expect(process.exitCode).toBe(1);
  });

  it('produces valid JSON with --json flag', async () => {
    mockRunPreconditions.mockReturnValue({
      canProceed: true,
      warnings: [],
      initialized: true,
      bmad: true,
      hooks: true,
    });
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
    mockRunPreconditions.mockReturnValue({
      canProceed: true,
      warnings: [],
      initialized: true,
      bmad: true,
      hooks: true,
    });
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
    mockRunPreconditions.mockReturnValue({
      canProceed: true,
      warnings: [],
      initialized: true,
      bmad: true,
      hooks: true,
    });
    mockRunAudit.mockResolvedValue({
      success: false,
      error: 'Unexpected audit failure',
    });

    await runAuditCmd([]);

    expect(mockFailOutput).toHaveBeenCalledWith('Unexpected audit failure');
    expect(process.exitCode).toBe(1);
  });

  it('handles runAudit failure with --json output', async () => {
    mockRunPreconditions.mockReturnValue({
      canProceed: true,
      warnings: [],
      initialized: true,
      bmad: true,
      hooks: true,
    });
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
    mockRunPreconditions.mockReturnValue({
      canProceed: true,
      warnings: [],
      initialized: true,
      bmad: true,
      hooks: true,
    });
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
