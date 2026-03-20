import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
  existsSync: vi.fn(),
}));

import {
  saveCoverageResult,
  readCoverageState,
  getCoverageTrend,
  checkCoverageTarget,
} from '../coverage.js';
import {
  saveCoverageResult as barrelSave,
  readCoverageState as barrelRead,
  getCoverageTrend as barrelTrend,
  checkCoverageTarget as barrelCheck,
} from '../index.js';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import type { AnalyzerResult } from '../types.js';

const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockRenameSync = vi.mocked(renameSync);
const mockExistsSync = vi.mocked(existsSync);

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-19T14:30:00.000Z'));
});

// -- Helper: build a minimal AnalyzerResult --
function makeAnalyzerResult(coveragePercent: number): AnalyzerResult {
  return {
    tool: 'semgrep',
    gaps: [],
    summary: {
      totalFunctions: 20,
      functionsWithLogs: Math.round((coveragePercent / 100) * 20),
      errorHandlersWithoutLogs: 0,
      coveragePercent,
      levelDistribution: {},
    },
  };
}

function makeStateWithObservability(obs: Record<string, unknown>): string {
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
  it('re-exports saveCoverageResult from index.ts', () => {
    expect(barrelSave).toBe(saveCoverageResult);
  });

  it('re-exports readCoverageState from index.ts', () => {
    expect(barrelRead).toBe(readCoverageState);
  });

  it('re-exports getCoverageTrend from index.ts', () => {
    expect(barrelTrend).toBe(getCoverageTrend);
  });

  it('re-exports checkCoverageTarget from index.ts', () => {
    expect(barrelCheck).toBe(checkCoverageTarget);
  });
});

// ============================================================
// saveCoverageResult
// ============================================================

describe('saveCoverageResult', () => {
  it('writes to sprint-state.json with correct structure', () => {
    mockExistsSync.mockReturnValue(false);

    const result = saveCoverageResult('/project', makeAnalyzerResult(75));
    expect(result.success).toBe(true);

    // Verify atomic write: writeFileSync to tmp, then renameSync
    expect(mockWriteFileSync).toHaveBeenCalledOnce();
    expect(mockRenameSync).toHaveBeenCalledOnce();

    const writtenData = JSON.parse(
      mockWriteFileSync.mock.calls[0][1] as string,
    );
    expect(writtenData.observability.static.coveragePercent).toBe(75);
    expect(writtenData.observability.static.lastScanTimestamp).toBe(
      '2026-03-19T14:30:00.000Z',
    );
    expect(writtenData.observability.static.history).toHaveLength(1);
    expect(writtenData.observability.static.history[0]).toEqual({
      coveragePercent: 75,
      timestamp: '2026-03-19T14:30:00.000Z',
    });
    expect(writtenData.observability.targets.staticTarget).toBe(80);
  });

  it('appends to history array (not replaces)', () => {
    const existingState = makeStateWithObservability({
      static: {
        coveragePercent: 70,
        lastScanTimestamp: '2026-03-18T10:00:00.000Z',
        history: [
          { coveragePercent: 70, timestamp: '2026-03-18T10:00:00.000Z' },
        ],
      },
      targets: { staticTarget: 80 },
    });

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(existingState);

    const result = saveCoverageResult('/project', makeAnalyzerResult(75));
    expect(result.success).toBe(true);

    const writtenData = JSON.parse(
      mockWriteFileSync.mock.calls[0][1] as string,
    );
    expect(writtenData.observability.static.history).toHaveLength(2);
    expect(writtenData.observability.static.history[0]).toEqual({
      coveragePercent: 70,
      timestamp: '2026-03-18T10:00:00.000Z',
    });
    expect(writtenData.observability.static.history[1]).toEqual({
      coveragePercent: 75,
      timestamp: '2026-03-19T14:30:00.000Z',
    });
  });

  it('preserves existing sprint-state.json fields', () => {
    const existingState = JSON.stringify({
      version: 1,
      sprint: { total: 5, done: 2 },
      stories: { 'story-1': { status: 'done' } },
      actionItems: ['fix bug'],
    });

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(existingState);

    const result = saveCoverageResult('/project', makeAnalyzerResult(75));
    expect(result.success).toBe(true);

    const writtenData = JSON.parse(
      mockWriteFileSync.mock.calls[0][1] as string,
    );
    expect(writtenData.version).toBe(1);
    expect(writtenData.sprint).toEqual({ total: 5, done: 2 });
    expect(writtenData.stories).toEqual({ 'story-1': { status: 'done' } });
    expect(writtenData.actionItems).toEqual(['fix bug']);
    expect(writtenData.observability).toBeDefined();
  });

  it('returns fail when readFileSync throws', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => {
      throw new Error('EACCES');
    });

    const result = saveCoverageResult('/project', makeAnalyzerResult(75));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Failed to read sprint-state.json');
    }
  });

  it('returns fail with stringified error when readFileSync throws non-Error', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => {
      throw 'raw string error'; // eslint-disable-line no-throw-literal
    });

    const result = saveCoverageResult('/project', makeAnalyzerResult(75));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('raw string error');
    }
  });

  it('returns fail when writeFileSync throws (atomic write)', () => {
    mockExistsSync.mockReturnValue(false);
    mockWriteFileSync.mockImplementation(() => {
      throw new Error('ENOSPC');
    });

    const result = saveCoverageResult('/project', makeAnalyzerResult(75));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Failed to write sprint-state.json');
    }
  });

  it('returns fail with stringified error when writeFileSync throws non-Error', () => {
    mockExistsSync.mockReturnValue(false);
    mockWriteFileSync.mockImplementation(() => {
      throw 42; // eslint-disable-line no-throw-literal
    });

    const result = saveCoverageResult('/project', makeAnalyzerResult(75));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('42');
    }
  });
});

// ============================================================
// readCoverageState
// ============================================================

describe('readCoverageState', () => {
  it('returns typed state from sprint-state.json', () => {
    const stateJson = makeStateWithObservability({
      static: {
        coveragePercent: 75,
        lastScanTimestamp: '2026-03-19T14:30:00.000Z',
        history: [
          { coveragePercent: 75, timestamp: '2026-03-19T14:30:00.000Z' },
        ],
      },
      targets: { staticTarget: 80 },
    });

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(stateJson);

    const result = readCoverageState('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.static.coveragePercent).toBe(75);
      expect(result.data.static.lastScanTimestamp).toBe(
        '2026-03-19T14:30:00.000Z',
      );
      expect(result.data.static.history).toHaveLength(1);
      expect(result.data.targets.staticTarget).toBe(80);
    }
  });

  it('returns default state when no observability section exists', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ version: 1, sprint: {} }),
    );

    const result = readCoverageState('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.static.coveragePercent).toBe(0);
      expect(result.data.static.lastScanTimestamp).toBe('');
      expect(result.data.static.history).toEqual([]);
      expect(result.data.targets.staticTarget).toBe(80);
    }
  });

  it('returns default state when sprint-state.json does not exist', () => {
    mockExistsSync.mockReturnValue(false);

    const result = readCoverageState('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.static.coveragePercent).toBe(0);
      expect(result.data.targets.staticTarget).toBe(80);
    }
  });

  it('returns fail when readFileSync throws', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => {
      throw new Error('EACCES');
    });

    const result = readCoverageState('/project');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Failed to read sprint-state.json');
    }
  });

  it('handles partial observability section gracefully', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ observability: { static: {} } }),
    );

    const result = readCoverageState('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.static.coveragePercent).toBe(0);
      expect(result.data.static.lastScanTimestamp).toBe('');
      expect(result.data.static.history).toEqual([]);
      expect(result.data.targets.staticTarget).toBe(80);
    }
  });
});

// ============================================================
// getCoverageTrend
// ============================================================

describe('getCoverageTrend', () => {
  it('returns correct delta between two entries', () => {
    const stateJson = makeStateWithObservability({
      static: {
        coveragePercent: 75,
        lastScanTimestamp: '2026-03-19T14:30:00.000Z',
        history: [
          { coveragePercent: 70, timestamp: '2026-03-18T10:00:00.000Z' },
          { coveragePercent: 75, timestamp: '2026-03-19T14:30:00.000Z' },
        ],
      },
      targets: { staticTarget: 80 },
    });

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(stateJson);

    const result = getCoverageTrend('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.current).toBe(75);
      expect(result.data.previous).toBe(70);
      expect(result.data.delta).toBe(5);
      expect(result.data.currentTimestamp).toBe('2026-03-19T14:30:00.000Z');
      expect(result.data.previousTimestamp).toBe('2026-03-18T10:00:00.000Z');
    }
  });

  it('handles single entry (no previous)', () => {
    const stateJson = makeStateWithObservability({
      static: {
        coveragePercent: 75,
        lastScanTimestamp: '2026-03-19T14:30:00.000Z',
        history: [
          { coveragePercent: 75, timestamp: '2026-03-19T14:30:00.000Z' },
        ],
      },
      targets: { staticTarget: 80 },
    });

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(stateJson);

    const result = getCoverageTrend('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.current).toBe(75);
      expect(result.data.previous).toBeNull();
      expect(result.data.delta).toBeNull();
      expect(result.data.currentTimestamp).toBe('2026-03-19T14:30:00.000Z');
      expect(result.data.previousTimestamp).toBeNull();
    }
  });

  it('returns fail when state read fails', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => {
      throw new Error('EACCES');
    });

    const result = getCoverageTrend('/project');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Failed to read sprint-state.json');
    }
  });

  it('handles empty history', () => {
    mockExistsSync.mockReturnValue(false);

    const result = getCoverageTrend('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.current).toBe(0);
      expect(result.data.previous).toBeNull();
      expect(result.data.delta).toBeNull();
    }
  });
});

// ============================================================
// checkCoverageTarget
// ============================================================

describe('checkCoverageTarget', () => {
  it('returns met: false when 72% vs 80% target', () => {
    const stateJson = makeStateWithObservability({
      static: {
        coveragePercent: 72,
        lastScanTimestamp: '2026-03-19T14:30:00.000Z',
        history: [],
      },
      targets: { staticTarget: 80 },
    });

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(stateJson);

    const result = checkCoverageTarget('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.met).toBe(false);
      expect(result.data.current).toBe(72);
      expect(result.data.target).toBe(80);
      expect(result.data.gap).toBe(8);
    }
  });

  it('returns met: true when 85% vs 80% target', () => {
    const stateJson = makeStateWithObservability({
      static: {
        coveragePercent: 85,
        lastScanTimestamp: '2026-03-19T14:30:00.000Z',
        history: [],
      },
      targets: { staticTarget: 80 },
    });

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(stateJson);

    const result = checkCoverageTarget('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.met).toBe(true);
      expect(result.data.current).toBe(85);
      expect(result.data.target).toBe(80);
      expect(result.data.gap).toBe(0);
    }
  });

  it('uses default 80% when no target provided and no target in state', () => {
    mockExistsSync.mockReturnValue(false);

    const result = checkCoverageTarget('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.target).toBe(80);
      expect(result.data.met).toBe(false);
      expect(result.data.gap).toBe(80);
    }
  });

  it('uses explicit target parameter over state target', () => {
    const stateJson = makeStateWithObservability({
      static: {
        coveragePercent: 75,
        lastScanTimestamp: '2026-03-19T14:30:00.000Z',
        history: [],
      },
      targets: { staticTarget: 80 },
    });

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(stateJson);

    const result = checkCoverageTarget('/project', 70);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.met).toBe(true);
      expect(result.data.target).toBe(70);
      expect(result.data.gap).toBe(0);
    }
  });

  it('returns fail when state read fails', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => {
      throw new Error('EACCES');
    });

    const result = checkCoverageTarget('/project');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Failed to read sprint-state.json');
    }
  });

  it('returns met: true when coverage equals target exactly', () => {
    const stateJson = makeStateWithObservability({
      static: {
        coveragePercent: 80,
        lastScanTimestamp: '2026-03-19T14:30:00.000Z',
        history: [],
      },
      targets: { staticTarget: 80 },
    });

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(stateJson);

    const result = checkCoverageTarget('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.met).toBe(true);
      expect(result.data.gap).toBe(0);
    }
  });
});

// ============================================================
// Input validation
// ============================================================

describe('input validation', () => {
  it('saveCoverageResult rejects empty projectDir', () => {
    const result = saveCoverageResult('', makeAnalyzerResult(75));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('projectDir is required');
    }
  });

  it('readCoverageState rejects empty projectDir', () => {
    const result = readCoverageState('');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('projectDir is required');
    }
  });

  it('getCoverageTrend rejects empty projectDir', () => {
    const result = getCoverageTrend('');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('projectDir is required');
    }
  });

  it('checkCoverageTarget rejects empty projectDir', () => {
    const result = checkCoverageTarget('');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('projectDir is required');
    }
  });
});

// ============================================================
// extractCoverageState edge cases (branch coverage)
// ============================================================

describe('extractCoverageState edge cases', () => {
  it('handles observability section with non-number coveragePercent', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        observability: {
          static: { coveragePercent: 'not-a-number', lastScanTimestamp: 123 },
        },
      }),
    );

    const result = readCoverageState('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.static.coveragePercent).toBe(0);
      expect(result.data.static.lastScanTimestamp).toBe('');
    }
  });

  it('filters out invalid history entries', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        observability: {
          static: {
            coveragePercent: 75,
            lastScanTimestamp: '2026-03-19T14:30:00.000Z',
            history: [
              { coveragePercent: 70, timestamp: '2026-03-18T10:00:00.000Z' },
              { coveragePercent: 'bad', timestamp: '2026-03-19T14:30:00.000Z' },
              null,
              'string-entry',
              { coveragePercent: 80 },
              { coveragePercent: 75, timestamp: '2026-03-19T14:30:00.000Z' },
            ],
          },
          targets: { staticTarget: 80 },
        },
      }),
    );

    const result = readCoverageState('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      // Only 2 valid entries should remain
      expect(result.data.static.history).toHaveLength(2);
      expect(result.data.static.history[0].coveragePercent).toBe(70);
      expect(result.data.static.history[1].coveragePercent).toBe(75);
    }
  });

  it('handles observability with non-number staticTarget', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        observability: {
          static: {
            coveragePercent: 75,
            lastScanTimestamp: '2026-03-19T14:30:00.000Z',
            history: [],
          },
          targets: { staticTarget: 'not-a-number' },
        },
      }),
    );

    const result = readCoverageState('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.targets.staticTarget).toBe(80);
    }
  });
});

// ============================================================
// History truncation
// ============================================================

describe('history truncation', () => {
  it('truncates history to MAX_HISTORY_ENTRIES when exceeding limit', () => {
    const longHistory = Array.from({ length: 100 }, (_, i) => ({
      coveragePercent: i,
      timestamp: `2026-03-19T14:30:00.${String(i).padStart(3, '0')}Z`,
    }));

    const existingState = JSON.stringify({
      version: 1,
      observability: {
        static: {
          coveragePercent: 99,
          lastScanTimestamp: '2026-03-19T00:00:00.000Z',
          history: longHistory,
        },
        targets: { staticTarget: 80 },
      },
    });

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(existingState);

    const result = saveCoverageResult('/project', makeAnalyzerResult(100));
    expect(result.success).toBe(true);

    const writtenData = JSON.parse(
      mockWriteFileSync.mock.calls[0][1] as string,
    );
    // 100 existing + 1 new = 101, truncated to 100
    expect(writtenData.observability.static.history).toHaveLength(100);
    // First entry should be dropped (index 0), so first is index 1
    expect(writtenData.observability.static.history[0].coveragePercent).toBe(1);
    // Last entry is the newly appended one
    expect(
      writtenData.observability.static.history[99].coveragePercent,
    ).toBe(100);
  });
});

// ============================================================
// Atomic write safety
// ============================================================

describe('atomic write safety', () => {
  it('partial write does not corrupt existing state when renameSync fails', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ version: 1, sprint: {} }),
    );
    mockRenameSync.mockImplementation(() => {
      throw new Error('EXDEV: cross-device link');
    });

    const result = saveCoverageResult('/project', makeAnalyzerResult(75));
    expect(result.success).toBe(false);

    // The original file should NOT have been directly written to
    // writeFileSync writes to tmp file, not the main file
    const writeCall = mockWriteFileSync.mock.calls[0];
    expect(writeCall[0]).toContain('.sprint-state.json.tmp');
  });
});

// ============================================================
// saveCoverageResult preserves runtime data
// ============================================================

describe('saveCoverageResult — runtime preservation', () => {
  it('preserves existing runtime coverage when saving static results', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        version: 1,
        sprint: {},
        observability: {
          static: { coveragePercent: 70, lastScanTimestamp: '2026-03-19T10:00:00.000Z', history: [] },
          targets: { staticTarget: 80, runtimeTarget: 60 },
          runtime: {
            coveragePercent: 65,
            lastValidationTimestamp: '2026-03-19T12:00:00.000Z',
            modulesWithTelemetry: 3,
            totalModules: 5,
            telemetryDetected: true,
          },
        },
      }),
    );

    const result = saveCoverageResult('/project', makeAnalyzerResult(85));
    expect(result.success).toBe(true);

    // Verify the written state includes runtime
    const writeCall = mockWriteFileSync.mock.calls[0];
    const written = JSON.parse(writeCall[1] as string);
    expect(written.observability.runtime).toBeDefined();
    expect(written.observability.runtime.coveragePercent).toBe(65);
    expect(written.observability.runtime.lastValidationTimestamp).toBe('2026-03-19T12:00:00.000Z');
    expect(written.observability.runtime.modulesWithTelemetry).toBe(3);
  });

  it('does not add runtime field when no runtime data exists', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        version: 1,
        sprint: {},
        observability: {
          static: { coveragePercent: 70, lastScanTimestamp: '2026-03-19T10:00:00.000Z', history: [] },
          targets: { staticTarget: 80 },
        },
      }),
    );

    const result = saveCoverageResult('/project', makeAnalyzerResult(85));
    expect(result.success).toBe(true);

    const writeCall = mockWriteFileSync.mock.calls[0];
    const written = JSON.parse(writeCall[1] as string);
    expect(written.observability.runtime).toBeUndefined();
  });
});
