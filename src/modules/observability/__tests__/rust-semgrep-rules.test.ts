import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { parseSemgrepOutput, computeSummary } from '../analyzer.js';

const ROOT = resolve(__dirname, '..', '..', '..', '..');
const PATCHES_DIR = resolve(ROOT, 'patches/observability');

// Load all three Rust rule files
interface SemgrepRule {
  id: string;
  patterns?: unknown[];
  message: string;
  languages: string[];
  severity: string;
  metadata?: {
    category?: string;
    cwe?: string;
  };
}

interface SemgrepConfig {
  rules: SemgrepRule[];
}

function loadRule(filename: string): SemgrepConfig {
  const path = resolve(PATCHES_DIR, filename);
  const content = readFileSync(path, 'utf-8');
  return parseYaml(content) as SemgrepConfig;
}

// ============================================================
// rust-function-no-tracing.yaml
// ============================================================

describe('rust-function-no-tracing.yaml', () => {
  let config: SemgrepConfig;

  beforeAll(() => {
    config = loadRule('rust-function-no-tracing.yaml');
  });

  it('file exists', () => {
    expect(existsSync(resolve(PATCHES_DIR, 'rust-function-no-tracing.yaml'))).toBe(true);
  });

  it('has exactly one rule', () => {
    expect(config.rules).toHaveLength(1);
  });

  it('rule id is rust-function-no-tracing', () => {
    expect(config.rules[0].id).toBe('rust-function-no-tracing');
  });

  it('targets Rust language', () => {
    expect(config.rules[0].languages).toEqual(['rust']);
  });

  it('severity is INFO', () => {
    expect(config.rules[0].severity).toBe('INFO');
  });

  it('has observability category metadata', () => {
    expect(config.rules[0].metadata?.category).toBe('observability');
  });

  it('has CWE-778 metadata', () => {
    expect(config.rules[0].metadata?.cwe).toBe('CWE-778: Insufficient Logging');
  });

  it('message mentions observability gap', () => {
    expect(config.rules[0].message).toContain('observability gap');
  });

  it('has patterns array with pattern-either and pattern-not entries', () => {
    const patterns = config.rules[0].patterns;
    expect(patterns).toBeDefined();
    expect(Array.isArray(patterns)).toBe(true);
    expect(patterns!.length).toBeGreaterThan(1);

    // First entry should be pattern-either with fn variants
    const patternEither = patterns![0] as Record<string, unknown>;
    expect(patternEither).toHaveProperty('pattern-either');

    // Should have pattern-not entries for tracing exclusions
    const patternNots = patterns!.filter(
      (p) => typeof p === 'object' && p !== null && 'pattern-not' in (p as Record<string, unknown>),
    );
    expect(patternNots.length).toBeGreaterThan(0);
  });

  it('pattern-either covers fn, pub fn, async fn, pub async fn', () => {
    const patterns = config.rules[0].patterns!;
    const patternEither = (patterns[0] as Record<string, unknown>)['pattern-either'] as string[];
    const allPatterns = patternEither.map((p: unknown) => {
      if (typeof p === 'object' && p !== null && 'pattern' in (p as Record<string, unknown>)) {
        return (p as Record<string, string>).pattern;
      }
      return '';
    });

    const joined = allPatterns.join(' ');
    expect(joined).toContain('fn $FUNC');
    expect(joined).toContain('pub fn $FUNC');
    expect(joined).toContain('async fn $FUNC');
    expect(joined).toContain('pub async fn $FUNC');
  });

  it('pattern-not entries exclude tracing macros (namespaced and bare)', () => {
    const patterns = config.rules[0].patterns!;
    const patternNots = patterns
      .filter(
        (p) => typeof p === 'object' && p !== null && 'pattern-not' in (p as Record<string, unknown>),
      )
      .map((p) => (p as Record<string, string>)['pattern-not']);

    const allExclusions = patternNots.join(' ');

    // Namespaced tracing macros
    expect(allExclusions).toContain('tracing::debug!');
    expect(allExclusions).toContain('tracing::info!');
    expect(allExclusions).toContain('tracing::warn!');
    expect(allExclusions).toContain('tracing::error!');

    // Bare imports
    expect(allExclusions).toContain('debug!(');
    expect(allExclusions).toContain('info!(');
    expect(allExclusions).toContain('warn!(');
    expect(allExclusions).toContain('error!(');

    // #[instrument] attribute exclusions
    expect(allExclusions).toContain('#[tracing::instrument]');
    expect(allExclusions).toContain('#[instrument]');
  });

  it('test fixture file exists', () => {
    expect(existsSync(resolve(PATCHES_DIR, 'rust-function-no-tracing.rs'))).toBe(true);
  });

  it('test fixture has ruleid and ok annotations', () => {
    const fixture = readFileSync(
      resolve(PATCHES_DIR, 'rust-function-no-tracing.rs'),
      'utf-8',
    );
    expect(fixture).toContain('// ruleid: rust-function-no-tracing');
    expect(fixture).toContain('// ok: rust-function-no-tracing');
  });

  it('test fixture covers both namespaced and bare tracing::trace!', () => {
    const fixture = readFileSync(
      resolve(PATCHES_DIR, 'rust-function-no-tracing.rs'),
      'utf-8',
    );
    expect(fixture).toContain('tracing::trace!');
    expect(fixture).toContain('trace!("trace-level log")');
  });

  it('file is under 300 lines (NFR1)', () => {
    const content = readFileSync(
      resolve(PATCHES_DIR, 'rust-function-no-tracing.yaml'),
      'utf-8',
    );
    const lineCount = content.split('\n').length;
    expect(lineCount).toBeLessThan(300);
  });
});

// ============================================================
// rust-catch-without-tracing.yaml
// ============================================================

describe('rust-catch-without-tracing.yaml', () => {
  let config: SemgrepConfig;

  beforeAll(() => {
    config = loadRule('rust-catch-without-tracing.yaml');
  });

  it('file exists', () => {
    expect(existsSync(resolve(PATCHES_DIR, 'rust-catch-without-tracing.yaml'))).toBe(true);
  });

  it('has exactly one rule', () => {
    expect(config.rules).toHaveLength(1);
  });

  it('rule id is rust-catch-without-tracing', () => {
    expect(config.rules[0].id).toBe('rust-catch-without-tracing');
  });

  it('targets Rust language', () => {
    expect(config.rules[0].languages).toEqual(['rust']);
  });

  it('severity is WARNING', () => {
    expect(config.rules[0].severity).toBe('WARNING');
  });

  it('has observability category metadata', () => {
    expect(config.rules[0].metadata?.category).toBe('observability');
  });

  it('has CWE-778 metadata', () => {
    expect(config.rules[0].metadata?.cwe).toBe('CWE-778: Insufficient Logging');
  });

  it('message mentions observability gap', () => {
    expect(config.rules[0].message).toContain('observability gap');
  });

  it('has patterns array matching Err match arms inside match blocks', () => {
    const patterns = config.rules[0].patterns;
    expect(patterns).toBeDefined();
    expect(Array.isArray(patterns)).toBe(true);

    const allText = JSON.stringify(patterns);
    expect(allText).toContain('Err($E)');
    // AC2 fix: match arms must be wrapped in `match $X { ... }` for Semgrep Rust parser
    expect(allText).toContain('match $X');
  });

  it('pattern-not entries exclude tracing::error!, tracing::warn!, error!, warn!', () => {
    const patterns = config.rules[0].patterns!;
    const patternNots = patterns
      .filter(
        (p) => typeof p === 'object' && p !== null && 'pattern-not' in (p as Record<string, unknown>),
      )
      .map((p) => (p as Record<string, string>)['pattern-not']);

    const allExclusions = patternNots.join(' ');

    expect(allExclusions).toContain('tracing::error!');
    expect(allExclusions).toContain('tracing::warn!');
    expect(allExclusions).toContain('error!(');
    expect(allExclusions).toContain('warn!(');

    // AC2 fix: all pattern-not entries must also use match $X wrapper
    for (const patternNot of patternNots) {
      expect(patternNot).toContain('match $X');
    }
  });

  it('test fixture file exists', () => {
    expect(existsSync(resolve(PATCHES_DIR, 'rust-catch-without-tracing.rs'))).toBe(true);
  });

  it('test fixture has ruleid and ok annotations', () => {
    const fixture = readFileSync(
      resolve(PATCHES_DIR, 'rust-catch-without-tracing.rs'),
      'utf-8',
    );
    expect(fixture).toContain('// ruleid: rust-catch-without-tracing');
    expect(fixture).toContain('// ok: rust-catch-without-tracing');
  });

  it('file is under 300 lines (NFR1)', () => {
    const content = readFileSync(
      resolve(PATCHES_DIR, 'rust-catch-without-tracing.yaml'),
      'utf-8',
    );
    const lineCount = content.split('\n').length;
    expect(lineCount).toBeLessThan(300);
  });
});

// ============================================================
// rust-error-path-no-tracing.yaml
// ============================================================

describe('rust-error-path-no-tracing.yaml', () => {
  let config: SemgrepConfig;

  beforeAll(() => {
    config = loadRule('rust-error-path-no-tracing.yaml');
  });

  it('file exists', () => {
    expect(existsSync(resolve(PATCHES_DIR, 'rust-error-path-no-tracing.yaml'))).toBe(true);
  });

  it('has exactly one rule', () => {
    expect(config.rules).toHaveLength(1);
  });

  it('rule id is rust-error-path-no-tracing', () => {
    expect(config.rules[0].id).toBe('rust-error-path-no-tracing');
  });

  it('targets Rust language', () => {
    expect(config.rules[0].languages).toEqual(['rust']);
  });

  it('severity is WARNING', () => {
    expect(config.rules[0].severity).toBe('WARNING');
  });

  it('has observability category metadata', () => {
    expect(config.rules[0].metadata?.category).toBe('observability');
  });

  it('has CWE-778 metadata', () => {
    expect(config.rules[0].metadata?.cwe).toBe('CWE-778: Insufficient Logging');
  });

  it('message mentions observability gap', () => {
    expect(config.rules[0].message).toContain('observability gap');
  });

  it('has pattern-either covering map_err and unwrap_or_else', () => {
    const patterns = config.rules[0].patterns!;
    const patternEither = (patterns[0] as Record<string, unknown>)['pattern-either'] as unknown[];

    const allText = JSON.stringify(patternEither);
    expect(allText).toContain('map_err');
    expect(allText).toContain('unwrap_or_else');
  });

  it('pattern-not entries exclude tracing macros for both map_err and unwrap_or_else', () => {
    const patterns = config.rules[0].patterns!;
    const patternNots = patterns
      .filter(
        (p) => typeof p === 'object' && p !== null && 'pattern-not' in (p as Record<string, unknown>),
      )
      .map((p) => (p as Record<string, string>)['pattern-not']);

    const allExclusions = patternNots.join(' ');

    // Must exclude tracing macros in map_err closures
    expect(allExclusions).toContain('map_err');
    expect(allExclusions).toContain('tracing::error!');
    expect(allExclusions).toContain('tracing::warn!');

    // Must exclude tracing macros in unwrap_or_else closures
    expect(allExclusions).toContain('unwrap_or_else');
    expect(allExclusions).toContain('error!(');
    expect(allExclusions).toContain('warn!(');
  });

  it('test fixture file exists', () => {
    expect(existsSync(resolve(PATCHES_DIR, 'rust-error-path-no-tracing.rs'))).toBe(true);
  });

  it('test fixture has ruleid and ok annotations', () => {
    const fixture = readFileSync(
      resolve(PATCHES_DIR, 'rust-error-path-no-tracing.rs'),
      'utf-8',
    );
    expect(fixture).toContain('// ruleid: rust-error-path-no-tracing');
    expect(fixture).toContain('// ok: rust-error-path-no-tracing');
  });

  it('file is under 300 lines (NFR1)', () => {
    const content = readFileSync(
      resolve(PATCHES_DIR, 'rust-error-path-no-tracing.yaml'),
      'utf-8',
    );
    const lineCount = content.split('\n').length;
    expect(lineCount).toBeLessThan(300);
  });
});

// ============================================================
// Cross-rule consistency checks
// ============================================================

describe('Rust Semgrep rules — cross-rule consistency', () => {
  it('all three Rust rule files exist in patches/observability/', () => {
    const expected = [
      'rust-function-no-tracing.yaml',
      'rust-catch-without-tracing.yaml',
      'rust-error-path-no-tracing.yaml',
    ];
    for (const filename of expected) {
      expect(existsSync(resolve(PATCHES_DIR, filename))).toBe(true);
    }
  });

  it('all three Rust test fixture files exist', () => {
    const expected = [
      'rust-function-no-tracing.rs',
      'rust-catch-without-tracing.rs',
      'rust-error-path-no-tracing.rs',
    ];
    for (const filename of expected) {
      expect(existsSync(resolve(PATCHES_DIR, filename))).toBe(true);
    }
  });

  it('all rules target only Rust (not JS/TS)', () => {
    const files = [
      'rust-function-no-tracing.yaml',
      'rust-catch-without-tracing.yaml',
      'rust-error-path-no-tracing.yaml',
    ];
    for (const filename of files) {
      const config = loadRule(filename);
      expect(config.rules[0].languages).toEqual(['rust']);
      expect(config.rules[0].languages).not.toContain('typescript');
      expect(config.rules[0].languages).not.toContain('javascript');
    }
  });

  it('all rules share consistent metadata', () => {
    const files = [
      'rust-function-no-tracing.yaml',
      'rust-catch-without-tracing.yaml',
      'rust-error-path-no-tracing.yaml',
    ];
    for (const filename of files) {
      const config = loadRule(filename);
      expect(config.rules[0].metadata?.category).toBe('observability');
      expect(config.rules[0].metadata?.cwe).toBe('CWE-778: Insufficient Logging');
    }
  });

  it('Rust rules use tracing crate patterns only (not log crate or println)', () => {
    const files = [
      'rust-function-no-tracing.yaml',
      'rust-catch-without-tracing.yaml',
      'rust-error-path-no-tracing.yaml',
    ];
    for (const filename of files) {
      const content = readFileSync(resolve(PATCHES_DIR, filename), 'utf-8');
      // Should not reference log crate or println
      expect(content).not.toContain('println!');
      expect(content).not.toContain('log::');
      expect(content).not.toContain('eprintln!');
    }
  });

  it('parseSemgrepOutput correctly handles Rust rule IDs', () => {
    const mockOutput = {
      results: [
        {
          check_id: 'rust-function-no-tracing',
          path: 'src/main.rs',
          start: { line: 10, col: 1 },
          end: { line: 15, col: 2 },
          extra: {
            message: 'Rust function without tracing instrumentation — observability gap',
            severity: 'INFO',
          },
        },
        {
          check_id: 'rust-catch-without-tracing',
          path: 'src/lib.rs',
          start: { line: 42, col: 9 },
          end: { line: 45, col: 10 },
          extra: {
            message: 'Rust error match arm without tracing — observability gap',
            severity: 'WARNING',
          },
        },
        {
          check_id: 'rust-error-path-no-tracing',
          path: 'src/handler.rs',
          start: { line: 88, col: 5 },
          end: { line: 91, col: 6 },
          extra: {
            message: 'Rust error-path closure without tracing — observability gap',
            severity: 'WARNING',
          },
        },
      ],
    };

    const gaps = parseSemgrepOutput(mockOutput);
    expect(gaps).toHaveLength(3);

    expect(gaps[0]).toEqual({
      file: 'src/main.rs',
      line: 10,
      type: 'rust-function-no-tracing',
      description: 'Rust function without tracing instrumentation — observability gap',
      severity: 'info',
    });

    expect(gaps[1]).toEqual({
      file: 'src/lib.rs',
      line: 42,
      type: 'rust-catch-without-tracing',
      description: 'Rust error match arm without tracing — observability gap',
      severity: 'warning',
    });

    expect(gaps[2]).toEqual({
      file: 'src/handler.rs',
      line: 88,
      type: 'rust-error-path-no-tracing',
      description: 'Rust error-path closure without tracing — observability gap',
      severity: 'warning',
    });
  });

  it('computeSummary handles Rust rule IDs in level distribution', () => {
    const gaps = [
      {
        file: 'src/main.rs', line: 10,
        type: 'rust-function-no-tracing',
        description: 'fn', severity: 'info' as const,
      },
      {
        file: 'src/lib.rs', line: 42,
        type: 'rust-catch-without-tracing',
        description: 'catch', severity: 'warning' as const,
      },
      {
        file: 'src/handler.rs', line: 88,
        type: 'rust-error-path-no-tracing',
        description: 'err', severity: 'warning' as const,
      },
    ];

    const summary = computeSummary(gaps);

    // Rust rule IDs are distinct from JS/TS rule IDs — they don't match
    // the hardcoded JS/TS rule names in matchesRule(), so they appear as
    // unrecognized gap types. The level distribution still works correctly.
    expect(summary.levelDistribution).toEqual({ info: 1, warning: 2 });

    // Total gaps are still reported
    expect(summary.totalFunctions).toBe(0); // No JS/TS function gaps matched
    expect(summary.errorHandlersWithoutLogs).toBe(0); // No JS/TS error handler gaps matched
  });
});
