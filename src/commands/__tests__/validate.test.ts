import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { readFileSync } from 'node:fs';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockCreateValidationSprint = vi.fn();
const mockRunValidationCycle = vi.fn();
const mockGetValidationProgress = vi.fn();
const mockGetACById = vi.fn();

vi.mock('../../modules/verify/index.js', () => ({
  createValidationSprint: (...args: unknown[]) => mockCreateValidationSprint(...args),
  runValidationCycle: (...args: unknown[]) => mockRunValidationCycle(...args),
  getValidationProgress: (...args: unknown[]) => mockGetValidationProgress(...args),
  getACById: (...args: unknown[]) => mockGetACById(...args),
}));

// Mock validate-schema to isolate self-validation tests
vi.mock('../validate-schema.js', () => ({
  registerValidateSchemaCommand: vi.fn(),
  runSchemaValidation: vi.fn(() => ({ status: 'pass', files: [] })),
}));

import { registerValidateCommand } from '../validate.js';

beforeEach(() => {
  vi.resetAllMocks();
  process.exitCode = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

function createCli(): Command {
  const program = new Command();
  program.exitOverride();
  program.option('--json', 'JSON output');
  registerValidateCommand(program);
  return program;
}

async function runCli(args: string[]): Promise<{ stdout: string }> {
  const logs: string[] = [];
  const consoleSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    logs.push(a.map(String).join(' '));
  });
  const program = createCli();
  await program.parseAsync(['node', 'codeharness', ...args]);
  consoleSpy.mockRestore();
  return { stdout: logs.join('\n') };
}

// Helper: set up mocks for a full successful run (all pass)
function setupAllPass(total = 5, blocked = 2) {
  mockCreateValidationSprint.mockReturnValue({ success: true, data: { acsAdded: total, existingPreserved: 0 } });
  // First call returns a cycle, second returns no-actionable
  mockRunValidationCycle
    .mockReturnValueOnce({ success: true, data: { acId: 1, action: 'passed' } })
    .mockReturnValue({ success: true, data: { acId: 0, action: 'no-actionable-ac' } });
  mockGetValidationProgress.mockReturnValue({
    success: true,
    data: {
      total, passed: total - blocked, failed: 0, blocked, remaining: 0,
      perAC: Array.from({ length: total }, (_, i) => ({
        acId: i + 1,
        status: i < total - blocked ? 'done' : 'blocked',
        attempts: 1,
        lastError: null,
      })),
    },
  });
}

// Helper: set up mocks for a run with failures
function setupWithFailures() {
  mockCreateValidationSprint.mockReturnValue({ success: true, data: { acsAdded: 3, existingPreserved: 0 } });
  mockRunValidationCycle
    .mockReturnValueOnce({ success: true, data: { acId: 1, action: 'passed' } })
    .mockReturnValue({ success: true, data: { acId: 0, action: 'no-actionable-ac' } });
  mockGetValidationProgress.mockReturnValue({
    success: true,
    data: {
      total: 3, passed: 1, failed: 1, blocked: 1, remaining: 0,
      perAC: [
        { acId: 1, status: 'done', attempts: 1, lastError: null },
        { acId: 2, status: 'failed', attempts: 3, lastError: 'command exited with code 1' },
        { acId: 3, status: 'blocked', attempts: 1, lastError: 'blocked' },
      ],
    },
  });
  mockGetACById.mockImplementation((id: number) => {
    if (id === 2) return { id: 2, frRef: 'FR2', description: 'Test AC 2', verificationMethod: 'cli', command: 'echo test', category: 'FR' };
    if (id === 3) return { id: 3, frRef: 'FR3', description: 'Test AC 3', verificationMethod: 'integration', category: 'FR' };
    return null;
  });
}

describe('validate self subcommand', () => {
  it('produces report with correct counts (AC 1)', async () => {
    setupAllPass(10, 3);
    const { stdout } = await runCli(['validate', 'self']);
    expect(stdout).toContain('Total: 10');
    expect(stdout).toContain('Passed: 7');
    expect(stdout).toContain('Failed: 0');
    expect(stdout).toContain('Blocked: 3');
    expect(stdout).toContain('Cycles: 1');
  });

  it('outputs RELEASE GATE: PASS on all-pass scenario (AC 2)', async () => {
    setupAllPass(5, 2);
    const { stdout } = await runCli(['validate', 'self']);
    expect(stdout).toContain('RELEASE GATE: PASS -- v1.0 ready');
    expect(process.exitCode).toBe(0);
  });

  it('includes per-failure detail on failure scenario (AC 3)', async () => {
    setupWithFailures();
    const { stdout } = await runCli(['validate', 'self']);
    expect(stdout).toContain('RELEASE GATE: FAIL');
    expect(stdout).toContain('AC 2');
    expect(stdout).toContain('Test AC 2');
    expect(stdout).toContain('Command: echo test');
    expect(stdout).toContain('Output: command exited with code 1');
    expect(stdout).toContain('Attempts: 3');
    expect(stdout).toContain('Blocker: failed');
    expect(process.exitCode).toBe(1);
  });

  it('--ci sets exit code 0 on pass (AC 5)', async () => {
    setupAllPass();
    const { stdout } = await runCli(['validate', 'self', '--ci']);
    expect(stdout).toContain('RELEASE GATE: PASS -- v1.0 ready');
    expect(process.exitCode).toBe(0);
  });

  it('--ci sets exit code 1 on fail (AC 5)', async () => {
    setupWithFailures();
    const { stdout } = await runCli(['validate', 'self', '--ci']);
    expect(stdout).toContain('RELEASE GATE: FAIL');
    expect(process.exitCode).toBe(1);
  });

  it('--json outputs machine-readable JSON', async () => {
    setupAllPass(5, 2);
    const { stdout } = await runCli(['--json', 'validate', 'self']);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('pass');
    expect(parsed.total).toBe(5);
    expect(parsed.passed).toBe(3);
    expect(parsed.blocked).toBe(2);
    expect(parsed.cycles).toBe(1);
    expect(parsed.gate).toBe('RELEASE GATE: PASS -- v1.0 ready');
    expect(parsed.failures).toBeDefined();
  });

  it('--json includes failure details', async () => {
    setupWithFailures();
    const { stdout } = await runCli(['--json', 'validate', 'self']);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('fail');
    expect(parsed.gate).toBe('RELEASE GATE: FAIL');
    expect(parsed.failures.length).toBeGreaterThan(0);
    const failedAc = parsed.failures.find((f: { acId: number }) => f.acId === 2);
    expect(failedAc).toBeDefined();
    expect(failedAc.description).toBe('Test AC 2');
    expect(failedAc.command).toBe('echo test');
    expect(failedAc.output).toBe('command exited with code 1');
  });

  it('reports error when createValidationSprint fails', async () => {
    mockCreateValidationSprint.mockReturnValue({ success: false, error: 'state not found' });
    const { stdout } = await runCli(['validate', 'self']);
    expect(stdout).toContain('state not found');
    expect(process.exitCode).toBe(1);
  });

  it('reports error when runValidationCycle fails', async () => {
    mockCreateValidationSprint.mockReturnValue({ success: true, data: { acsAdded: 1, existingPreserved: 0 } });
    mockRunValidationCycle.mockReturnValue({ success: false, error: 'cycle error' });
    const { stdout } = await runCli(['validate', 'self']);
    expect(stdout).toContain('cycle error');
    expect(process.exitCode).toBe(1);
  });

  it('reports error when getValidationProgress fails', async () => {
    mockCreateValidationSprint.mockReturnValue({ success: true, data: { acsAdded: 1, existingPreserved: 0 } });
    mockRunValidationCycle.mockReturnValue({ success: true, data: { acId: 0, action: 'no-actionable-ac' } });
    mockGetValidationProgress.mockReturnValue({ success: false, error: 'progress error' });
    const { stdout } = await runCli(['validate', 'self']);
    expect(stdout).toContain('progress error');
    expect(process.exitCode).toBe(1);
  });

  it('validate-self.ts is under 100 lines (FR40)', () => {
    const source = readFileSync(
      new URL('../validate-self.ts', import.meta.url).pathname,
      'utf-8',
    );
    const lineCount = source.split('\n').length;
    expect(lineCount).toBeLessThan(100);
  });
});
