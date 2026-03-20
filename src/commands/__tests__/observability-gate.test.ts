import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

vi.mock('../../modules/observability/index.js', () => ({
  checkObservabilityCoverageGate: vi.fn(),
}));

vi.mock('../../lib/output.js', () => ({
  ok: vi.fn(),
  fail: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  jsonOutput: vi.fn(),
}));

import { registerObservabilityGateCommand } from '../observability-gate.js';
import { checkObservabilityCoverageGate } from '../../modules/observability/index.js';
import { ok, fail, jsonOutput } from '../../lib/output.js';

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
});

afterEach(() => {
  process.exitCode = undefined;
});

async function runGateCmd(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  program.option('--json', 'JSON output');
  registerObservabilityGateCommand(program);
  try {
    await program.parseAsync(['node', 'test', 'observability-gate', ...args]);
  } catch {
    // Commander throws on exitOverride — ignore
  }
}

// ============================================================
// JSON output format
// ============================================================

describe('observability-gate --json output', () => {
  it('outputs expected schema on pass', async () => {
    vi.mocked(checkObservabilityCoverageGate).mockReturnValue({
      success: true,
      data: {
        passed: true,
        staticResult: { met: true, current: 85, target: 80, gap: 0 },
        runtimeResult: null,
        gapSummary: [],
      },
    });

    await runGateCmd(['--json']);

    expect(jsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'pass',
        passed: true,
        static: { current: 85, target: 80, met: true, gap: 0 },
        runtime: null,
        gaps: [],
      }),
    );
  });

  it('outputs expected schema on fail', async () => {
    vi.mocked(checkObservabilityCoverageGate).mockReturnValue({
      success: true,
      data: {
        passed: false,
        staticResult: { met: false, current: 72, target: 80, gap: 8 },
        runtimeResult: null,
        gapSummary: [],
      },
    });

    await runGateCmd(['--json']);

    expect(jsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'fail',
        passed: false,
        static: { current: 72, target: 80, met: false, gap: 8 },
      }),
    );
    expect(process.exitCode).toBe(1);
  });

  it('includes runtime in JSON when present', async () => {
    vi.mocked(checkObservabilityCoverageGate).mockReturnValue({
      success: true,
      data: {
        passed: true,
        staticResult: { met: true, current: 85, target: 80, gap: 0 },
        runtimeResult: { met: true, current: 65, target: 60, gap: 0 },
        gapSummary: [],
      },
    });

    await runGateCmd(['--json']);

    expect(jsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        runtime: { current: 65, target: 60, met: true, gap: 0 },
      }),
    );
  });
});

// ============================================================
// Exit codes
// ============================================================

describe('observability-gate exit codes', () => {
  it('exit code 0 on pass', async () => {
    vi.mocked(checkObservabilityCoverageGate).mockReturnValue({
      success: true,
      data: {
        passed: true,
        staticResult: { met: true, current: 85, target: 80, gap: 0 },
        runtimeResult: null,
        gapSummary: [],
      },
    });

    await runGateCmd([]);

    expect(process.exitCode).toBeUndefined();
  });

  it('exit code 1 on fail', async () => {
    vi.mocked(checkObservabilityCoverageGate).mockReturnValue({
      success: true,
      data: {
        passed: false,
        staticResult: { met: false, current: 72, target: 80, gap: 8 },
        runtimeResult: null,
        gapSummary: [],
      },
    });

    await runGateCmd([]);

    expect(process.exitCode).toBe(1);
  });

  it('exit code 1 on error', async () => {
    vi.mocked(checkObservabilityCoverageGate).mockReturnValue({
      success: false,
      error: 'Failed to read state',
    });

    await runGateCmd([]);

    expect(process.exitCode).toBe(1);
  });
});

// ============================================================
// --min-static override
// ============================================================

describe('observability-gate --min-static', () => {
  it('passes custom static target to gate function', async () => {
    vi.mocked(checkObservabilityCoverageGate).mockReturnValue({
      success: true,
      data: {
        passed: true,
        staticResult: { met: true, current: 72, target: 70, gap: 0 },
        runtimeResult: null,
        gapSummary: [],
      },
    });

    await runGateCmd(['--min-static', '70']);

    expect(checkObservabilityCoverageGate).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ staticTarget: 70 }),
    );
  });

  it('passes custom runtime target to gate function', async () => {
    vi.mocked(checkObservabilityCoverageGate).mockReturnValue({
      success: true,
      data: {
        passed: true,
        staticResult: { met: true, current: 85, target: 80, gap: 0 },
        runtimeResult: { met: true, current: 50, target: 50, gap: 0 },
        gapSummary: [],
      },
    });

    await runGateCmd(['--min-runtime', '50']);

    expect(checkObservabilityCoverageGate).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ runtimeTarget: 50 }),
    );
  });
});

// ============================================================
// Text output
// ============================================================

describe('observability-gate text output', () => {
  it('prints pass message in text mode', async () => {
    vi.mocked(checkObservabilityCoverageGate).mockReturnValue({
      success: true,
      data: {
        passed: true,
        staticResult: { met: true, current: 85, target: 80, gap: 0 },
        runtimeResult: null,
        gapSummary: [],
      },
    });

    await runGateCmd([]);

    expect(ok).toHaveBeenCalledWith(expect.stringContaining('passed'));
    expect(ok).toHaveBeenCalledWith(expect.stringContaining('85%'));
  });

  it('prints fail message with fix suggestion in text mode', async () => {
    vi.mocked(checkObservabilityCoverageGate).mockReturnValue({
      success: true,
      data: {
        passed: false,
        staticResult: { met: false, current: 72, target: 80, gap: 8 },
        runtimeResult: null,
        gapSummary: [],
      },
    });

    await runGateCmd([]);

    expect(fail).toHaveBeenCalledWith(expect.stringContaining('failed'));
    expect(fail).toHaveBeenCalledWith(expect.stringContaining('Add logging to flagged functions. Run: codeharness observability-gate'));
  });

  it('prints gap details in text mode when gaps exist', async () => {
    vi.mocked(checkObservabilityCoverageGate).mockReturnValue({
      success: true,
      data: {
        passed: false,
        staticResult: { met: false, current: 72, target: 80, gap: 8 },
        runtimeResult: null,
        gapSummary: [
          { file: 'src/foo.ts', line: 10, type: 'catch-without-logging', description: 'Missing log in catch', severity: 'error' },
          { file: 'src/bar.ts', line: 25, type: 'function-no-debug-log', description: 'No debug log', severity: 'warning' },
        ],
      },
    });

    await runGateCmd([]);

    expect(fail).toHaveBeenCalledWith('Gaps:');
    expect(fail).toHaveBeenCalledWith('  src/foo.ts:10 — Missing log in catch');
    expect(fail).toHaveBeenCalledWith('  src/bar.ts:25 — No debug log');
  });

  it('prints error message on gate error', async () => {
    vi.mocked(checkObservabilityCoverageGate).mockReturnValue({
      success: false,
      error: 'File not found',
    });

    await runGateCmd([]);

    expect(fail).toHaveBeenCalledWith(expect.stringContaining('File not found'));
  });

  it('prints error JSON on gate error with --json', async () => {
    vi.mocked(checkObservabilityCoverageGate).mockReturnValue({
      success: false,
      error: 'File not found',
    });

    await runGateCmd(['--json']);

    expect(jsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error', message: 'File not found' }),
    );
  });

  it('prints runtime info in text mode when runtime passes', async () => {
    vi.mocked(checkObservabilityCoverageGate).mockReturnValue({
      success: true,
      data: {
        passed: true,
        staticResult: { met: true, current: 85, target: 80, gap: 0 },
        runtimeResult: { met: true, current: 65, target: 60, gap: 0 },
        gapSummary: [],
      },
    });

    await runGateCmd([]);

    expect(ok).toHaveBeenCalledWith(expect.stringContaining('Runtime'));
    expect(ok).toHaveBeenCalledWith(expect.stringContaining('65%'));
  });

  it('prints runtime fail in text mode when runtime fails', async () => {
    vi.mocked(checkObservabilityCoverageGate).mockReturnValue({
      success: true,
      data: {
        passed: false,
        staticResult: { met: true, current: 85, target: 80, gap: 0 },
        runtimeResult: { met: false, current: 50, target: 60, gap: 10 },
        gapSummary: [],
      },
    });

    await runGateCmd([]);

    expect(fail).toHaveBeenCalledWith(expect.stringContaining('Runtime'));
    expect(fail).toHaveBeenCalledWith(expect.stringContaining('50%'));
  });
});

// ============================================================
// Input validation
// ============================================================

describe('observability-gate input validation', () => {
  it('rejects non-numeric --min-static', async () => {
    await runGateCmd(['--min-static', 'abc']);

    expect(fail).toHaveBeenCalledWith(expect.stringContaining('--min-static must be a number'));
    expect(process.exitCode).toBe(1);
    expect(checkObservabilityCoverageGate).not.toHaveBeenCalled();
  });

  it('rejects --min-static > 100', async () => {
    await runGateCmd(['--min-static', '150']);

    expect(fail).toHaveBeenCalledWith(expect.stringContaining('--min-static must be a number'));
    expect(process.exitCode).toBe(1);
  });

  it('rejects negative --min-static', async () => {
    await runGateCmd(['--min-static', '-5']);

    expect(fail).toHaveBeenCalledWith(expect.stringContaining('--min-static must be a number'));
    expect(process.exitCode).toBe(1);
  });

  it('rejects non-numeric --min-runtime', async () => {
    await runGateCmd(['--min-runtime', 'xyz']);

    expect(fail).toHaveBeenCalledWith(expect.stringContaining('--min-runtime must be a number'));
    expect(process.exitCode).toBe(1);
    expect(checkObservabilityCoverageGate).not.toHaveBeenCalled();
  });

  it('rejects invalid --min-static with --json flag', async () => {
    await runGateCmd(['--json', '--min-static', 'abc']);

    expect(jsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error', message: '--min-static must be a number between 0 and 100' }),
    );
    expect(process.exitCode).toBe(1);
  });
});

// ============================================================
// JSON output with gaps
// ============================================================

describe('observability-gate --json with gap data', () => {
  it('maps gapSummary into JSON gaps array', async () => {
    vi.mocked(checkObservabilityCoverageGate).mockReturnValue({
      success: true,
      data: {
        passed: false,
        staticResult: { met: false, current: 72, target: 80, gap: 8 },
        runtimeResult: null,
        gapSummary: [
          { file: 'src/foo.ts', line: 10, type: 'catch-without-logging', description: 'Missing log in catch', severity: 'error' },
          { file: 'src/bar.ts', line: 25, type: 'function-no-debug-log', description: 'No debug log', severity: 'warning' },
        ],
      },
    });

    await runGateCmd(['--json']);

    expect(jsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        gaps: [
          { file: 'src/foo.ts', line: 10, type: 'catch-without-logging', description: 'Missing log in catch' },
          { file: 'src/bar.ts', line: 25, type: 'function-no-debug-log', description: 'No debug log' },
        ],
      }),
    );
  });
});
