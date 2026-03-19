import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
  existsSync: vi.fn(),
}));

import { computeRuntimeCoverage, saveRuntimeCoverage } from '../runtime-coverage.js';
import {
  computeRuntimeCoverage as barrelCompute,
  saveRuntimeCoverage as barrelSave,
} from '../index.js';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import type { ObservabilityGapResult } from '../../verify/types.js';

const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockRenameSync = vi.mocked(renameSync);
const mockExistsSync = vi.mocked(existsSync);

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-19T15:00:00.000Z'));
});

// ─── Helper ──────────────────────────────────────────────────────────────

function makeGapResult(
  totalACs: number,
  gapCount: number,
): ObservabilityGapResult {
  const entries = Array.from({ length: totalACs }, (_, i) => ({
    acId: String(i + 1),
    hasGap: i >= totalACs - gapCount,
    gapNote: i >= totalACs - gapCount
      ? 'No log events detected for this user interaction'
      : undefined,
  }));
  return {
    entries,
    totalACs,
    gapCount,
    coveredCount: totalACs - gapCount,
  };
}

// ============================================================
// Module barrel exports
// ============================================================

describe('module barrel exports', () => {
  it('re-exports computeRuntimeCoverage from index.ts', () => {
    expect(barrelCompute).toBe(computeRuntimeCoverage);
  });

  it('re-exports saveRuntimeCoverage from index.ts', () => {
    expect(barrelSave).toBe(saveRuntimeCoverage);
  });
});

// ============================================================
// computeRuntimeCoverage
// ============================================================

describe('computeRuntimeCoverage', () => {
  it('computes 70% coverage with 10 ACs and 7 with logs', () => {
    const gapResult = makeGapResult(10, 3); // 10 ACs, 3 gaps => 7 with logs
    const result = computeRuntimeCoverage(gapResult);

    expect(result.totalACs).toBe(10);
    expect(result.acsWithLogs).toBe(7);
    expect(result.coveragePercent).toBe(70);
    expect(result.entries).toHaveLength(10);
  });

  it('handles 0 ACs without division by zero', () => {
    const gapResult: ObservabilityGapResult = {
      entries: [],
      totalACs: 0,
      gapCount: 0,
      coveredCount: 0,
    };
    const result = computeRuntimeCoverage(gapResult);

    expect(result.totalACs).toBe(0);
    expect(result.acsWithLogs).toBe(0);
    expect(result.coveragePercent).toBe(0);
    expect(result.entries).toHaveLength(0);
  });

  it('computes 100% coverage when all ACs have logs', () => {
    const gapResult = makeGapResult(5, 0); // 5 ACs, 0 gaps
    const result = computeRuntimeCoverage(gapResult);

    expect(result.totalACs).toBe(5);
    expect(result.acsWithLogs).toBe(5);
    expect(result.coveragePercent).toBe(100);
  });

  it('computes 0% coverage when no ACs have logs', () => {
    const gapResult = makeGapResult(5, 5); // 5 ACs, all gaps
    const result = computeRuntimeCoverage(gapResult);

    expect(result.totalACs).toBe(5);
    expect(result.acsWithLogs).toBe(0);
    expect(result.coveragePercent).toBe(0);
  });

  it('sets logEventsDetected correctly per entry', () => {
    const gapResult = makeGapResult(3, 1); // 3 ACs, 1 gap (last one)
    const result = computeRuntimeCoverage(gapResult);

    expect(result.entries[0].logEventsDetected).toBe(true);
    expect(result.entries[0].logEventCount).toBe(1);
    expect(result.entries[0].gapNote).toBeUndefined();

    expect(result.entries[2].logEventsDetected).toBe(false);
    expect(result.entries[2].logEventCount).toBe(0);
    expect(result.entries[2].gapNote).toBe(
      'No log events detected for this user interaction',
    );
  });
});

// ============================================================
// saveRuntimeCoverage
// ============================================================

describe('saveRuntimeCoverage', () => {
  it('writes to sprint-state.json with correct runtime structure', () => {
    mockExistsSync.mockReturnValue(false);

    const coverageResult = computeRuntimeCoverage(makeGapResult(10, 3));
    const result = saveRuntimeCoverage('/project', coverageResult);

    expect(result.success).toBe(true);
    expect(mockWriteFileSync).toHaveBeenCalledOnce();
    expect(mockRenameSync).toHaveBeenCalledOnce();

    const writtenData = JSON.parse(
      mockWriteFileSync.mock.calls[0][1] as string,
    );
    expect(writtenData.observability.runtime.coveragePercent).toBe(70);
    expect(writtenData.observability.runtime.lastValidationTimestamp).toBe(
      '2026-03-19T15:00:00.000Z',
    );
    expect(writtenData.observability.runtime.modulesWithTelemetry).toBe(7);
    expect(writtenData.observability.runtime.totalModules).toBe(10);
    expect(writtenData.observability.runtime.telemetryDetected).toBe(true);
    expect(writtenData.observability.targets.runtimeTarget).toBe(60);
  });

  it('preserves existing static coverage data', () => {
    const existingState = JSON.stringify({
      version: 1,
      sprint: { total: 5, done: 2 },
      observability: {
        static: {
          coveragePercent: 75,
          lastScanTimestamp: '2026-03-19T14:30:00.000Z',
          history: [
            { coveragePercent: 75, timestamp: '2026-03-19T14:30:00.000Z' },
          ],
        },
        targets: { staticTarget: 80 },
      },
    });

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(existingState);

    const coverageResult = computeRuntimeCoverage(makeGapResult(10, 3));
    const result = saveRuntimeCoverage('/project', coverageResult);

    expect(result.success).toBe(true);
    const writtenData = JSON.parse(
      mockWriteFileSync.mock.calls[0][1] as string,
    );

    // Static coverage preserved
    expect(writtenData.observability.static.coveragePercent).toBe(75);
    expect(writtenData.observability.static.lastScanTimestamp).toBe(
      '2026-03-19T14:30:00.000Z',
    );
    expect(writtenData.observability.static.history).toHaveLength(1);

    // Runtime coverage added
    expect(writtenData.observability.runtime.coveragePercent).toBe(70);

    // Existing targets preserved, runtimeTarget added
    expect(writtenData.observability.targets.staticTarget).toBe(80);
    expect(writtenData.observability.targets.runtimeTarget).toBe(60);

    // Other state fields preserved
    expect(writtenData.version).toBe(1);
    expect(writtenData.sprint).toEqual({ total: 5, done: 2 });
  });

  it('preserves custom runtimeTarget when already set', () => {
    const existingState = JSON.stringify({
      observability: {
        targets: { staticTarget: 80, runtimeTarget: 75 },
      },
    });

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(existingState);

    const coverageResult = computeRuntimeCoverage(makeGapResult(5, 0));
    const result = saveRuntimeCoverage('/project', coverageResult);

    expect(result.success).toBe(true);
    const writtenData = JSON.parse(
      mockWriteFileSync.mock.calls[0][1] as string,
    );
    expect(writtenData.observability.targets.runtimeTarget).toBe(75);
  });

  it('sets telemetryDetected false when acsWithLogs is 0', () => {
    mockExistsSync.mockReturnValue(false);

    const coverageResult = computeRuntimeCoverage(makeGapResult(5, 5));
    const result = saveRuntimeCoverage('/project', coverageResult);

    expect(result.success).toBe(true);
    const writtenData = JSON.parse(
      mockWriteFileSync.mock.calls[0][1] as string,
    );
    expect(writtenData.observability.runtime.telemetryDetected).toBe(false);
  });

  it('returns fail when readFileSync throws', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => {
      throw new Error('EACCES');
    });

    const coverageResult = computeRuntimeCoverage(makeGapResult(5, 0));
    const result = saveRuntimeCoverage('/project', coverageResult);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Failed to read sprint-state.json');
    }
  });

  it('returns fail when writeFileSync throws', () => {
    mockExistsSync.mockReturnValue(false);
    mockWriteFileSync.mockImplementation(() => {
      throw new Error('ENOSPC');
    });

    const coverageResult = computeRuntimeCoverage(makeGapResult(5, 0));
    const result = saveRuntimeCoverage('/project', coverageResult);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Failed to write sprint-state.json');
    }
  });

  it('rejects empty projectDir', () => {
    const coverageResult = computeRuntimeCoverage(makeGapResult(5, 0));
    const result = saveRuntimeCoverage('', coverageResult);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('projectDir is required');
    }
  });

  it('returns fail with stringified error when readFileSync throws non-Error', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => {
      throw 'raw string error'; // eslint-disable-line no-throw-literal
    });

    const coverageResult = computeRuntimeCoverage(makeGapResult(5, 0));
    const result = saveRuntimeCoverage('/project', coverageResult);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('raw string error');
    }
  });

  it('returns fail with stringified error when writeFileSync throws non-Error', () => {
    mockExistsSync.mockReturnValue(false);
    mockWriteFileSync.mockImplementation(() => {
      throw 42; // eslint-disable-line no-throw-literal
    });

    const coverageResult = computeRuntimeCoverage(makeGapResult(5, 0));
    const result = saveRuntimeCoverage('/project', coverageResult);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('42');
    }
  });
});
