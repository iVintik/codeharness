import { describe, it, expect } from 'vitest';
import type {
  AnalyzerResult,
  AnalyzerConfig,
  AnalyzerSummary,
  ObservabilityGap,
  GapSeverity,
} from '../types.js';

/**
 * Type-level tests: these verify that the interfaces compile correctly
 * and can be satisfied by arbitrary implementations (not just Semgrep).
 */

describe('AnalyzerResult interface', () => {
  it('accepts a valid AnalyzerResult object', () => {
    const result: AnalyzerResult = {
      tool: 'semgrep',
      gaps: [],
      summary: {
        totalFunctions: 10,
        functionsWithLogs: 8,
        errorHandlersWithoutLogs: 1,
        coveragePercent: 80,
        levelDistribution: { warning: 1 },
      },
    };
    expect(result.tool).toBe('semgrep');
    expect(result.gaps).toEqual([]);
    expect(result.summary.coveragePercent).toBe(80);
  });

  it('accepts optional skipped fields', () => {
    const result: AnalyzerResult = {
      tool: 'semgrep',
      gaps: [],
      summary: {
        totalFunctions: 0,
        functionsWithLogs: 0,
        errorHandlersWithoutLogs: 0,
        coveragePercent: 0,
        levelDistribution: {},
      },
      skipped: true,
      skipReason: 'tool not available',
    };
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('tool not available');
  });
});

describe('ObservabilityGap interface', () => {
  it('accepts a valid ObservabilityGap object', () => {
    const gap: ObservabilityGap = {
      file: 'src/lib/docker.ts',
      line: 42,
      type: 'catch-without-logging',
      description: 'Catch block without error logging',
      severity: 'warning',
    };
    expect(gap.file).toBe('src/lib/docker.ts');
    expect(gap.line).toBe(42);
    expect(gap.severity).toBe('warning');
  });

  it('accepts all severity values', () => {
    const severities: GapSeverity[] = ['error', 'warning', 'info'];
    for (const severity of severities) {
      const gap: ObservabilityGap = {
        file: 'test.ts',
        line: 1,
        type: 'test-rule',
        description: 'test',
        severity,
      };
      expect(gap.severity).toBe(severity);
    }
  });
});

describe('AnalyzerConfig interface', () => {
  it('accepts an empty config (all fields optional)', () => {
    const config: AnalyzerConfig = {};
    expect(config.tool).toBeUndefined();
    expect(config.rulesDir).toBeUndefined();
    expect(config.timeout).toBeUndefined();
  });

  it('accepts a fully-specified config', () => {
    const config: AnalyzerConfig = {
      tool: 'eslint',
      rulesDir: 'custom/rules/',
      timeout: 30_000,
      totalFunctions: 50,
    };
    expect(config.tool).toBe('eslint');
    expect(config.totalFunctions).toBe(50);
  });
});

describe('AnalyzerSummary interface', () => {
  it('accepts a valid summary', () => {
    const summary: AnalyzerSummary = {
      totalFunctions: 20,
      functionsWithLogs: 15,
      errorHandlersWithoutLogs: 2,
      coveragePercent: 75,
      levelDistribution: { warning: 3, error: 2 },
    };
    expect(summary.coveragePercent).toBe(75);
  });
});

describe('tool-agnostic interface (AC #4)', () => {
  it('alternative tool output conforming to the interface compiles', () => {
    // Simulate a hypothetical ESLint-based analyzer producing the same shape
    const eslintResult: AnalyzerResult = {
      tool: 'eslint',
      gaps: [
        {
          file: 'src/app.ts',
          line: 15,
          type: 'no-console-in-catch',
          description: 'Missing console.error in catch block',
          severity: 'warning',
        },
      ],
      summary: {
        totalFunctions: 50,
        functionsWithLogs: 45,
        errorHandlersWithoutLogs: 3,
        coveragePercent: 90,
        levelDistribution: { warning: 1 },
      },
    };

    // The key assertion: the interface doesn't force tool='semgrep'
    expect(eslintResult.tool).toBe('eslint');
    expect(eslintResult.gaps).toHaveLength(1);
    expect(eslintResult.summary.coveragePercent).toBe(90);
  });
});
