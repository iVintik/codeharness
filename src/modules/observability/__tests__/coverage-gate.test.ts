import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
  existsSync: vi.fn(),
}));

import { checkObservabilityCoverageGate } from '../coverage-gate.js';
import {
  checkObservabilityCoverageGate as barrelGate,
  type ObservabilityCoverageGateResult,
} from '../index.js';
import { readFileSync, existsSync } from 'node:fs';

const mockReadFileSync = vi.mocked(readFileSync);
const mockExistsSync = vi.mocked(existsSync);

beforeEach(() => {
  vi.resetAllMocks();
});

function makeState(obs: Record<string, unknown>): string {
  return JSON.stringify({
    version: 1,
    sprint: { total: 0, done: 0 },
    observability: obs,
  });
}

// ============================================================
// Module barrel exports
// ============================================================

describe('module barrel exports', () => {
  it('re-exports checkObservabilityCoverageGate from index.ts', () => {
    expect(barrelGate).toBe(checkObservabilityCoverageGate);
  });
});

// ============================================================
// Gate passes
// ============================================================

describe('checkObservabilityCoverageGate — pass scenarios', () => {
  it('passes when static >= 80% and runtime >= 60%', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      makeState({
        static: { coveragePercent: 85, lastScanTimestamp: '', history: [] },
        runtime: {
          coveragePercent: 65,
          lastValidationTimestamp: '',
          modulesWithTelemetry: 3,
          totalModules: 5,
          telemetryDetected: true,
        },
        targets: { staticTarget: 80, runtimeTarget: 60 },
      }),
    );

    const result = checkObservabilityCoverageGate('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.passed).toBe(true);
      expect(result.data.staticResult.met).toBe(true);
      expect(result.data.staticResult.current).toBe(85);
      expect(result.data.staticResult.target).toBe(80);
      expect(result.data.staticResult.gap).toBe(0);
      expect(result.data.runtimeResult).not.toBeNull();
      expect(result.data.runtimeResult!.met).toBe(true);
      expect(result.data.runtimeResult!.current).toBe(65);
    }
  });

  it('passes when runtime is absent (no verification yet)', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      makeState({
        static: { coveragePercent: 82, lastScanTimestamp: '', history: [] },
        targets: { staticTarget: 80 },
      }),
    );

    const result = checkObservabilityCoverageGate('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.passed).toBe(true);
      expect(result.data.runtimeResult).toBeNull();
    }
  });

  it('passes when coverage equals target exactly', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      makeState({
        static: { coveragePercent: 80, lastScanTimestamp: '', history: [] },
        targets: { staticTarget: 80 },
      }),
    );

    const result = checkObservabilityCoverageGate('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.passed).toBe(true);
      expect(result.data.staticResult.met).toBe(true);
      expect(result.data.staticResult.gap).toBe(0);
    }
  });
});

// ============================================================
// Gate fails
// ============================================================

describe('checkObservabilityCoverageGate — fail scenarios', () => {
  it('fails when static is 72% (below 80% target)', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      makeState({
        static: { coveragePercent: 72, lastScanTimestamp: '', history: [] },
        targets: { staticTarget: 80 },
      }),
    );

    const result = checkObservabilityCoverageGate('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.passed).toBe(false);
      expect(result.data.staticResult.met).toBe(false);
      expect(result.data.staticResult.current).toBe(72);
      expect(result.data.staticResult.target).toBe(80);
      expect(result.data.staticResult.gap).toBe(8);
    }
  });

  it('fails when runtime is 50% (below 60% target)', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      makeState({
        static: { coveragePercent: 85, lastScanTimestamp: '', history: [] },
        runtime: {
          coveragePercent: 50,
          lastValidationTimestamp: '',
          modulesWithTelemetry: 1,
          totalModules: 2,
          telemetryDetected: true,
        },
        targets: { staticTarget: 80, runtimeTarget: 60 },
      }),
    );

    const result = checkObservabilityCoverageGate('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.passed).toBe(false);
      expect(result.data.staticResult.met).toBe(true);
      expect(result.data.runtimeResult).not.toBeNull();
      expect(result.data.runtimeResult!.met).toBe(false);
      expect(result.data.runtimeResult!.current).toBe(50);
      expect(result.data.runtimeResult!.target).toBe(60);
      expect(result.data.runtimeResult!.gap).toBe(10);
    }
  });

  it('fails when both static and runtime are below targets', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      makeState({
        static: { coveragePercent: 70, lastScanTimestamp: '', history: [] },
        runtime: {
          coveragePercent: 40,
          lastValidationTimestamp: '',
          modulesWithTelemetry: 0,
          totalModules: 2,
          telemetryDetected: false,
        },
        targets: { staticTarget: 80, runtimeTarget: 60 },
      }),
    );

    const result = checkObservabilityCoverageGate('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.passed).toBe(false);
      expect(result.data.staticResult.met).toBe(false);
      expect(result.data.runtimeResult!.met).toBe(false);
    }
  });
});

// ============================================================
// Custom target overrides
// ============================================================

describe('checkObservabilityCoverageGate — custom overrides', () => {
  it('uses custom static target override', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      makeState({
        static: { coveragePercent: 72, lastScanTimestamp: '', history: [] },
        targets: { staticTarget: 80 },
      }),
    );

    // 72% passes a 70% target
    const result = checkObservabilityCoverageGate('/project', { staticTarget: 70 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.passed).toBe(true);
      expect(result.data.staticResult.met).toBe(true);
      expect(result.data.staticResult.target).toBe(70);
    }
  });

  it('uses custom runtime target override', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      makeState({
        static: { coveragePercent: 85, lastScanTimestamp: '', history: [] },
        runtime: {
          coveragePercent: 50,
          lastValidationTimestamp: '',
          modulesWithTelemetry: 1,
          totalModules: 2,
          telemetryDetected: true,
        },
        targets: { staticTarget: 80, runtimeTarget: 60 },
      }),
    );

    // 50% passes a 50% target
    const result = checkObservabilityCoverageGate('/project', { runtimeTarget: 50 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.passed).toBe(true);
      expect(result.data.runtimeResult!.met).toBe(true);
      expect(result.data.runtimeResult!.target).toBe(50);
    }
  });
});

// ============================================================
// Gap summary
// ============================================================

describe('checkObservabilityCoverageGate — gap summary', () => {
  it('returns empty gap list when no gaps are cached', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      makeState({
        static: { coveragePercent: 72, lastScanTimestamp: '', history: [] },
        targets: { staticTarget: 80 },
      }),
    );

    const result = checkObservabilityCoverageGate('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.gapSummary).toEqual([]);
    }
  });

  it('returns cached gaps from sprint-state.json', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      makeState({
        static: {
          coveragePercent: 72,
          lastScanTimestamp: '',
          history: [],
          gaps: [
            { file: 'src/foo.ts', line: 10, type: 'catch-without-logging', description: 'Missing log in catch', severity: 'error' },
            { file: 'src/bar.ts', line: 25, type: 'function-no-debug-log', description: 'No debug log', severity: 'warning' },
          ],
        },
        targets: { staticTarget: 80 },
      }),
    );

    const result = checkObservabilityCoverageGate('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.gapSummary).toHaveLength(2);
      expect(result.data.gapSummary[0]).toEqual({
        file: 'src/foo.ts',
        line: 10,
        type: 'catch-without-logging',
        description: 'Missing log in catch',
        severity: 'error',
      });
      expect(result.data.gapSummary[1]).toEqual({
        file: 'src/bar.ts',
        line: 25,
        type: 'function-no-debug-log',
        description: 'No debug log',
        severity: 'warning',
      });
    }
  });

  it('handles malformed gap entries gracefully', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      makeState({
        static: {
          coveragePercent: 72,
          lastScanTimestamp: '',
          history: [],
          gaps: [
            { file: 'src/foo.ts', line: 10, type: 'catch-without-logging', description: 'Valid gap', severity: 'error' },
            { file: 'src/bad.ts' }, // missing required fields
            null,
            'not an object',
          ],
        },
        targets: { staticTarget: 80 },
      }),
    );

    const result = checkObservabilityCoverageGate('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.gapSummary).toHaveLength(1);
      expect(result.data.gapSummary[0].file).toBe('src/foo.ts');
    }
  });
});

// ============================================================
// Error handling
// ============================================================

describe('checkObservabilityCoverageGate — errors', () => {
  it('rejects empty projectDir', () => {
    const result = checkObservabilityCoverageGate('');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('projectDir is required');
    }
  });

  it('propagates state read errors', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => {
      throw new Error('EACCES');
    });

    const result = checkObservabilityCoverageGate('/project');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Failed to read sprint-state.json');
    }
  });

  it('uses default targets when no state file exists', () => {
    mockExistsSync.mockReturnValue(false);

    const result = checkObservabilityCoverageGate('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      // 0% coverage vs 80% default target = fail
      expect(result.data.passed).toBe(false);
      expect(result.data.staticResult.target).toBe(80);
      expect(result.data.staticResult.current).toBe(0);
    }
  });

  it('uses default runtime target (60) when not specified in state', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      makeState({
        static: { coveragePercent: 85, lastScanTimestamp: '', history: [] },
        runtime: {
          coveragePercent: 55,
          lastValidationTimestamp: '',
          modulesWithTelemetry: 1,
          totalModules: 2,
          telemetryDetected: true,
        },
        targets: { staticTarget: 80 },
        // Note: no runtimeTarget in targets
      }),
    );

    const result = checkObservabilityCoverageGate('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.runtimeResult!.target).toBe(60);
      expect(result.data.runtimeResult!.met).toBe(false);
    }
  });
});
