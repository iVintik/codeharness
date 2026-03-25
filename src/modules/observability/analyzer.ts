/**
 * Observability analyzer module — runs static analysis and produces
 * a standardized gap report.
 *
 * Currently implements Semgrep integration but the AnalyzerResult
 * interface is tool-agnostic: any tool producing the same shape
 * can be used as a drop-in replacement.
 */

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { ok, fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type {
  AnalyzerConfig,
  AnalyzerResult,
  AnalyzerSummary,
  ObservabilityGap,
  GapSeverity,
  SemgrepRawOutput,
} from './types.js';

const DEFAULT_RULES_DIR = 'patches/observability/';
const ADDITIONAL_RULES_DIRS = ['patches/error-handling/'];
const DEFAULT_TIMEOUT = 60_000;
const FUNCTION_NO_LOG_RULE = 'function-no-debug-log';
const CATCH_WITHOUT_LOGGING_RULE = 'catch-without-logging';
const ERROR_PATH_NO_LOG_RULE = 'error-path-no-log';

/**
 * Check if a gap's type (rule ID) matches a known rule name.
 * Semgrep produces path-prefixed check_ids like
 * "tmp.test-ac5c.patches.observability.function-no-debug-log",
 * so we use endsWith() rather than strict equality.
 */
function matchesRule(gapType: string, ruleName: string): boolean {
  return gapType === ruleName || gapType.endsWith(`.${ruleName}`);
}

/**
 * Run observability analysis on a project directory.
 *
 * @param projectDir - Absolute path to the project root
 * @param config - Optional configuration overriding defaults
 * @returns Result containing the analysis report, or a skip result if the tool is not installed
 */
export function analyze(
  projectDir: string,
  config?: AnalyzerConfig,
): Result<AnalyzerResult> {
  if (!projectDir || typeof projectDir !== 'string') {
    return fail('projectDir is required and must be a non-empty string');
  }

  const tool = config?.tool ?? 'semgrep';

  if (tool !== 'semgrep') {
    return fail(`Unsupported analyzer tool: ${tool}`);
  }

  if (!checkSemgrepInstalled()) {
    return ok({
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
      skipReason: 'static analysis skipped -- install semgrep',
    });
  }

  const rulesDir = config?.rulesDir ?? DEFAULT_RULES_DIR;
  const timeout = config?.timeout ?? DEFAULT_TIMEOUT;
  const fullRulesDir = join(projectDir, rulesDir);

  // Collect additional rule directories (e.g., patches/error-handling/)
  const additionalDirs = (config?.additionalRulesDirs ?? ADDITIONAL_RULES_DIRS)
    .map(d => join(projectDir, d));

  const rawResult = runSemgrep(projectDir, fullRulesDir, timeout, additionalDirs);
  if (!rawResult.success) {
    return fail(rawResult.error);
  }

  const gaps = parseSemgrepOutput(rawResult.data);
  const summaryOpts = config?.totalFunctions != null
    ? { totalFunctions: config.totalFunctions }
    : undefined;
  const summary = computeSummary(gaps, summaryOpts);

  return ok({
    tool: 'semgrep',
    gaps,
    summary,
  });
}

/**
 * Check whether Semgrep is installed and available on PATH.
 */
export function checkSemgrepInstalled(): boolean {
  try {
    execFileSync('semgrep', ['--version'], {
      encoding: 'utf-8',
      timeout: 5_000,
      stdio: 'pipe',
    });
    return true;
  } catch {
    // IGNORE: grep check may fail if tool not available
    return false;
  }
}

/**
 * Spawn Semgrep and capture its JSON output.
 */
export function runSemgrep(
  projectDir: string,
  rulesDir: string,
  timeout: number = DEFAULT_TIMEOUT,
  additionalRulesDirs: string[] = [],
): Result<SemgrepRawOutput> {
  try {
    // Build --config args: primary rules dir + any additional dirs that exist
    const configArgs = ['--config', rulesDir];
    for (const dir of additionalRulesDirs) {
      configArgs.push('--config', dir);
    }

    const stdout = execFileSync(
      'semgrep',
      ['scan', ...configArgs, '--json', projectDir],
      { encoding: 'utf-8', timeout, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const parsed: unknown = JSON.parse(stdout);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as Record<string, unknown>).results)
    ) {
      return fail('Semgrep scan returned invalid JSON: missing results array');
    }
    return ok(parsed as SemgrepRawOutput);
  } catch (error) {
    return fail(`Semgrep scan failed: ${String(error)}`);
  }
}

/**
 * Parse Semgrep JSON results into tool-agnostic ObservabilityGap[].
 */
export function parseSemgrepOutput(raw: SemgrepRawOutput): ObservabilityGap[] {
  if (!raw.results || !Array.isArray(raw.results)) {
    return [];
  }
  return raw.results.map((r) => ({
    file: r.path,
    line: r.start.line,
    type: r.check_id,
    description: r.extra.message,
    severity: normalizeSeverity(r.extra.severity),
  }));
}

/**
 * Compute summary statistics from gaps.
 *
 * Coverage formula: functionsWithLogs / totalFunctions * 100.
 *
 * Uses Option 3 from architecture notes: the `function-no-debug-log` rule
 * matches functions WITHOUT logging. Combined with an optional
 * `totalFunctions` override, this gives exact coverage.
 *
 * When totalFunctions is not provided, it equals the count of
 * function-no-debug-log matches (all detected functions lack logs).
 *
 * If totalFunctions is 0, coverage = 100 (no functions = no gaps).
 *
 * @param gaps - Parsed observability gaps
 * @param opts - Optional overrides for function counts (e.g., from external scan)
 */
export function computeSummary(
  gaps: ObservabilityGap[],
  opts?: { totalFunctions?: number },
): AnalyzerSummary {
  const functionsWithoutLogs = gaps.filter(
    (g) => matchesRule(g.type, FUNCTION_NO_LOG_RULE),
  ).length;

  const errorHandlersWithoutLogs = gaps.filter(
    (g) =>
      matchesRule(g.type, CATCH_WITHOUT_LOGGING_RULE) ||
      matchesRule(g.type, ERROR_PATH_NO_LOG_RULE),
  ).length;

  // If totalFunctions is provided externally (e.g., from a complementary
  // function-counting rule or AST scan), use it. Otherwise, we only know
  // about the functions that LACK logs.
  const totalFunctions = opts?.totalFunctions ?? functionsWithoutLogs;
  const functionsWithLogs = totalFunctions - functionsWithoutLogs;
  const coveragePercent =
    totalFunctions === 0
      ? 100
      : Math.round((functionsWithLogs / totalFunctions) * 100 * 100) / 100;

  // Build level distribution from gap severities
  const levelDistribution: Record<string, number> = {};
  for (const gap of gaps) {
    levelDistribution[gap.severity] =
      (levelDistribution[gap.severity] ?? 0) + 1;
  }

  return {
    totalFunctions,
    functionsWithLogs,
    errorHandlersWithoutLogs,
    coveragePercent,
    levelDistribution,
  };
}

/** Normalize Semgrep severity string to our GapSeverity union */
function normalizeSeverity(severity: string): GapSeverity {
  const lower = severity.toLowerCase();
  if (lower === 'error') return 'error';
  if (lower === 'warning') return 'warning';
  return 'info';
}
