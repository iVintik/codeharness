import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

vi.mock('../../lib/output.js', () => ({
  ok: vi.fn(), fail: vi.fn(), warn: vi.fn(), info: vi.fn(), jsonOutput: vi.fn(),
}));
vi.mock('../../lib/onboard-checks.js', () => ({ runPreconditions: vi.fn() }));
vi.mock('../../modules/audit/index.js', () => ({
  runAudit: vi.fn(), generateFixStories: vi.fn(), addFixStoriesToState: vi.fn(),
  formatAuditHuman: vi.fn(), formatAuditJson: vi.fn(),
}));

import { fail as failOutput, warn as warnOutput, jsonOutput } from '../../lib/output.js';
import { runPreconditions } from '../../lib/onboard-checks.js';
import { runAudit, generateFixStories, addFixStoriesToState, formatAuditHuman, formatAuditJson } from '../../modules/audit/index.js';
import { registerOnboardCommand } from '../onboard.js';
import { registerAuditCommand } from '../audit.js';

const mockRunPreconditions = vi.mocked(runPreconditions);
const mockRunAudit = vi.mocked(runAudit);
const mockFormatAuditHuman = vi.mocked(formatAuditHuman);
const mockFormatAuditJson = vi.mocked(formatAuditJson);
const mockFailOutput = vi.mocked(failOutput);
const mockWarnOutput = vi.mocked(warnOutput);
const mockJsonOutput = vi.mocked(jsonOutput);
const mockGenerateFixStories = vi.mocked(generateFixStories);
const mockAddFixStoriesToState = vi.mocked(addFixStoriesToState);

beforeEach(() => { vi.clearAllMocks(); process.exitCode = undefined; });

async function runOnboardCmd(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  program.option('--json', 'JSON output');
  registerOnboardCommand(program);
  try { await program.parseAsync(['node', 'test', 'onboard', ...args]); } catch { /* Commander exitOverride */ }
}

const GAP = { dimension: 'testing', description: 'Gap', suggestedFix: 'Fix' };

function setupInitialized(): void {
  mockRunPreconditions.mockReturnValue({ canProceed: true, warnings: [], initialized: true, bmad: true, hooks: true });
}
function setupNotInitialized(): void {
  mockRunPreconditions.mockReturnValue({ canProceed: false, warnings: [], initialized: false, bmad: false, hooks: false });
}
function setupPassingAudit(): void {
  setupInitialized();
  mockRunAudit.mockResolvedValue({ success: true, data: { dimensions: {}, overallStatus: 'pass', gapCount: 0, durationMs: 100 } });
  mockFormatAuditHuman.mockReturnValue(['[OK] all good']);
  mockFormatAuditJson.mockReturnValue({ dimensions: {}, overallStatus: 'pass', gapCount: 0, durationMs: 100 });
}
function setupFailingAudit(gapCount = 1) {
  setupInitialized();
  const data = {
    dimensions: { testing: { name: 'testing', status: 'fail' as const, metric: `${gapCount} gap`, gaps: [GAP] } },
    overallStatus: 'fail' as const, gapCount, durationMs: 50,
  };
  mockRunAudit.mockResolvedValue({ success: true, data });
  mockFormatAuditHuman.mockReturnValue(['output']);
  return data;
}

// ─── Core alias behavior ─────────────────────────────────────────────────────

describe('onboard command (alias for audit)', () => {
  it('registers with correct description', () => {
    const program = new Command();
    registerOnboardCommand(program);
    const cmd = program.commands.find(c => c.name() === 'onboard');
    expect(cmd).toBeDefined();
    expect(cmd!.description()).toBe('Alias for audit \u2014 check all compliance dimensions');
  });

  it('delegates to audit logic with no flags', async () => {
    setupPassingAudit();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runOnboardCmd([]);
    spy.mockRestore();
    expect(mockRunAudit).toHaveBeenCalledWith(process.cwd());
    expect(mockFormatAuditHuman).toHaveBeenCalled();
  });

  it('delegates to audit --fix logic', async () => {
    const auditData = setupFailingAudit();
    mockGenerateFixStories.mockReturnValue({ success: true, data: { stories: [], created: 0, skipped: 0 } });
    mockAddFixStoriesToState.mockReturnValue({ success: true, data: undefined });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runOnboardCmd(['--fix']);
    spy.mockRestore();
    expect(mockGenerateFixStories).toHaveBeenCalledWith(auditData);
  });

  it('produces same JSON output as audit --json', async () => {
    setupPassingAudit();
    await runOnboardCmd(['--json']);
    expect(mockJsonOutput).toHaveBeenCalledWith(expect.objectContaining({ overallStatus: 'pass' }));
  });

  it('reports state error in human output with --fix', async () => {
    setupFailingAudit();
    mockGenerateFixStories.mockReturnValue({
      success: true, data: { stories: [{ key: 'k', filePath: '/p', gap: GAP, skipped: false }], created: 1, skipped: 0 },
    });
    mockAddFixStoriesToState.mockReturnValue({ success: false, error: 'State file corrupted' });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runOnboardCmd(['--fix']);
    spy.mockRestore();
    expect(mockFailOutput).toHaveBeenCalledWith('Failed to update sprint state: State file corrupted');
  });

  it('reports fix generation failure in human output with --fix', async () => {
    setupFailingAudit();
    mockGenerateFixStories.mockReturnValue({ success: false, error: 'Permission denied' });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runOnboardCmd(['--fix']);
    spy.mockRestore();
    expect(mockFailOutput).toHaveBeenCalledWith('Permission denied');
  });

  it('produces same JSON output as audit --fix --json', async () => {
    setupFailingAudit();
    mockGenerateFixStories.mockReturnValue({
      success: true,
      data: { stories: [{ key: 'audit-fix-testing-1', filePath: '/path/file.md', gap: GAP, skipped: false }], created: 1, skipped: 0 },
    });
    mockAddFixStoriesToState.mockReturnValue({ success: true, data: undefined });
    mockFormatAuditJson.mockReturnValue({ dimensions: {}, overallStatus: 'fail', gapCount: 1, durationMs: 50 });
    await runOnboardCmd(['--fix', '--json']);
    expect(mockJsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({ fixStories: expect.arrayContaining([expect.objectContaining({ key: 'audit-fix-testing-1' })]) }),
    );
  });

  it('includes skipped flag in JSON fix output for skipped stories', async () => {
    setupFailingAudit();
    mockGenerateFixStories.mockReturnValue({
      success: true,
      data: { stories: [{ key: 'audit-fix-testing-1', filePath: '/path/file.md', gap: GAP, skipped: true }], created: 0, skipped: 1 },
    });
    mockAddFixStoriesToState.mockReturnValue({ success: true, data: undefined });
    mockFormatAuditJson.mockReturnValue({ dimensions: {}, overallStatus: 'fail', gapCount: 1, durationMs: 50 });
    await runOnboardCmd(['--fix', '--json']);
    expect(mockJsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({ fixStories: [expect.objectContaining({ key: 'audit-fix-testing-1', skipped: true })] }),
    );
  });

  it('includes fixError in JSON when generateFixStories fails with --json', async () => {
    setupFailingAudit();
    mockGenerateFixStories.mockReturnValue({ success: false, error: 'Permission denied' });
    mockFormatAuditJson.mockReturnValue({ dimensions: {}, overallStatus: 'fail', gapCount: 1, durationMs: 50 });
    await runOnboardCmd(['--fix', '--json']);
    expect(mockJsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({ fixStories: [], fixError: 'Permission denied' }),
    );
  });
});

// ─── Precondition failure ────────────────────────────────────────────────────

describe('onboard precondition failure (same as audit)', () => {
  it('exits with fail when harness not initialized', async () => {
    setupNotInitialized();
    await runOnboardCmd([]);
    expect(mockFailOutput).toHaveBeenCalledWith('Harness not initialized -- run codeharness init first');
    expect(process.exitCode).toBe(1);
  });

  it('exits with JSON fail when not initialized with --json', async () => {
    setupNotInitialized();
    await runOnboardCmd(['--json']);
    expect(mockJsonOutput).toHaveBeenCalledWith({ status: 'fail', message: 'Harness not initialized -- run codeharness init first' });
    expect(process.exitCode).toBe(1);
  });
});

// ─── Deprecated scan subcommand ──────────────────────────────────────────────

describe('onboard scan (deprecated subcommand)', () => {
  it('prints deprecation warning and runs audit', async () => {
    setupPassingAudit();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runOnboardCmd(['scan']);
    spy.mockRestore();
    expect(mockWarnOutput).toHaveBeenCalledWith("'onboard scan' is deprecated \u2014 use 'codeharness audit' instead");
    expect(mockRunAudit).toHaveBeenCalledWith(process.cwd());
  });

  it('prints deprecation warning even with precondition failure', async () => {
    setupNotInitialized();
    await runOnboardCmd(['scan']);
    expect(mockWarnOutput).toHaveBeenCalledWith("'onboard scan' is deprecated \u2014 use 'codeharness audit' instead");
    expect(process.exitCode).toBe(1);
  });
});

// ─── Help output ─────────────────────────────────────────────────────────────

describe('help output includes both audit and onboard', () => {
  it('--help shows both audit and onboard commands', () => {
    const program = new Command();
    program.option('--json', 'JSON output');
    registerAuditCommand(program);
    registerOnboardCommand(program);
    const helpInfo = program.helpInformation();
    expect(helpInfo).toContain('audit');
    expect(helpInfo).toContain('onboard');
  });

  it('onboard has --json and --fix options', () => {
    const program = new Command();
    registerOnboardCommand(program);
    const cmd = program.commands.find(c => c.name() === 'onboard');
    expect(cmd).toBeDefined();
    const helpInfo = cmd!.helpInformation();
    expect(helpInfo).toContain('--json');
    expect(helpInfo).toContain('--fix');
  });

  it('onboard description is "Alias for audit"', () => {
    const program = new Command();
    registerOnboardCommand(program);
    const cmd = program.commands.find(c => c.name() === 'onboard');
    expect(cmd!.description()).toContain('Alias for audit');
  });
});
