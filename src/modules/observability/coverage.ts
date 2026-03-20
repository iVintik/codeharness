/** Coverage state persistence — tracks observability coverage in sprint-state.json. */

import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ok, fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type {
  AnalyzerResult,
  ObservabilityCoverageState,
  CoverageTrend,
  CoverageTargetResult,
  RuntimeCoverageState,
  ObservabilityGap,
  GapSeverity,
} from './types.js';

const STATE_FILE = 'sprint-state.json';
const TMP_FILE = '.sprint-state.json.tmp';
const DEFAULT_STATIC_TARGET = 80;
const MAX_HISTORY_ENTRIES = 100;

/** Default observability coverage state when none exists. */
function defaultCoverageState(): ObservabilityCoverageState {
  return {
    static: {
      coveragePercent: 0,
      lastScanTimestamp: '',
      history: [],
    },
    targets: {
      staticTarget: DEFAULT_STATIC_TARGET,
    },
  };
}

/** Read the full sprint-state.json as a generic record. */
function readStateFile(projectDir: string): Result<Record<string, unknown>> {
  const fp = join(projectDir, STATE_FILE);
  if (!existsSync(fp)) {
    return ok({});
  }
  try {
    const raw = readFileSync(fp, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return ok(parsed);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Failed to read ${STATE_FILE}: ${msg}`);
  }
}

/** Write sprint-state.json atomically (write to temp, then rename). */
function writeStateAtomic(
  projectDir: string,
  state: Record<string, unknown>,
): Result<void> {
  try {
    const data = JSON.stringify(state, null, 2) + '\n';
    const tmp = join(projectDir, TMP_FILE);
    const final = join(projectDir, STATE_FILE);
    writeFileSync(tmp, data, 'utf-8');
    renameSync(tmp, final);
    return ok(undefined);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Failed to write ${STATE_FILE}: ${msg}`);
  }
}

/** Save coverage result from an analysis run into sprint-state.json. */
export function saveCoverageResult(
  projectDir: string,
  result: AnalyzerResult,
): Result<void> {
  if (!projectDir || typeof projectDir !== 'string') {
    return fail('projectDir is required and must be a non-empty string');
  }

  const stateResult = readStateFile(projectDir);
  if (!stateResult.success) {
    return fail(stateResult.error);
  }

  const state = stateResult.data;
  const existing = extractCoverageState(state);
  const timestamp = new Date().toISOString();

  const fullHistory = [
    ...existing.static.history,
    { coveragePercent: result.summary.coveragePercent, timestamp },
  ];
  // Keep only the most recent entries to prevent unbounded growth
  const trimmedHistory =
    fullHistory.length > MAX_HISTORY_ENTRIES
      ? fullHistory.slice(fullHistory.length - MAX_HISTORY_ENTRIES)
      : fullHistory;

  const updatedStatic = {
    coveragePercent: result.summary.coveragePercent,
    lastScanTimestamp: timestamp,
    history: trimmedHistory,
    gaps: result.gaps.map(({ file, line, type, description, severity }) =>
      ({ file, line, type, description, severity })),
  };

  const updatedObservability: ObservabilityCoverageState = {
    static: updatedStatic,
    targets: existing.targets,
    ...(existing.runtime ? { runtime: existing.runtime } : {}),
  };

  const updatedState = {
    ...state,
    observability: updatedObservability,
  };

  return writeStateAtomic(projectDir, updatedState);
}

/** Read the observability coverage state from sprint-state.json. */
export function readCoverageState(
  projectDir: string,
): Result<ObservabilityCoverageState> {
  if (!projectDir || typeof projectDir !== 'string') {
    return fail('projectDir is required and must be a non-empty string');
  }

  const stateResult = readStateFile(projectDir);
  if (!stateResult.success) {
    return fail(stateResult.error);
  }

  return ok(extractCoverageState(stateResult.data));
}

/** Get coverage trend by comparing latest vs previous history entries. */
export function getCoverageTrend(projectDir: string): Result<CoverageTrend> {
  if (!projectDir || typeof projectDir !== 'string') {
    return fail('projectDir is required and must be a non-empty string');
  }

  const stateResult = readCoverageState(projectDir);
  if (!stateResult.success) {
    return fail(stateResult.error);
  }

  const { history } = stateResult.data.static;

  if (history.length === 0) {
    return ok({
      current: 0,
      previous: null,
      delta: null,
      currentTimestamp: '',
      previousTimestamp: null,
    });
  }

  const latest = history[history.length - 1];

  if (history.length === 1) {
    return ok({
      current: latest.coveragePercent,
      previous: null,
      delta: null,
      currentTimestamp: latest.timestamp,
      previousTimestamp: null,
    });
  }

  const prev = history[history.length - 2];
  return ok({
    current: latest.coveragePercent,
    previous: prev.coveragePercent,
    delta: latest.coveragePercent - prev.coveragePercent,
    currentTimestamp: latest.timestamp,
    previousTimestamp: prev.timestamp,
  });
}

/** Check current coverage against a target threshold. */
export function checkCoverageTarget(
  projectDir: string,
  target?: number,
): Result<CoverageTargetResult> {
  if (!projectDir || typeof projectDir !== 'string') {
    return fail('projectDir is required and must be a non-empty string');
  }

  const stateResult = readCoverageState(projectDir);
  if (!stateResult.success) {
    return fail(stateResult.error);
  }

  const effectiveTarget = target ?? stateResult.data.targets.staticTarget;
  const current = stateResult.data.static.coveragePercent;
  const met = current >= effectiveTarget;
  const gap = met ? 0 : effectiveTarget - current;

  return ok({ met, current, target: effectiveTarget, gap });
}

/** Extract typed ObservabilityCoverageState from raw sprint-state.json data. */
function extractCoverageState(
  state: Record<string, unknown>,
): ObservabilityCoverageState {
  const obs = state.observability as Record<string, unknown> | undefined;
  if (!obs) {
    return defaultCoverageState();
  }

  const staticSection = obs.static as Record<string, unknown> | undefined;
  const targets = obs.targets as Record<string, unknown> | undefined;
  const runtimeSection = obs.runtime as Record<string, unknown> | undefined;

  const runtime: RuntimeCoverageState | undefined =
    runtimeSection && typeof runtimeSection.coveragePercent === 'number'
      ? {
          coveragePercent: runtimeSection.coveragePercent,
          lastValidationTimestamp:
            typeof runtimeSection.lastValidationTimestamp === 'string'
              ? runtimeSection.lastValidationTimestamp : '',
          modulesWithTelemetry:
            typeof runtimeSection.modulesWithTelemetry === 'number'
              ? runtimeSection.modulesWithTelemetry : 0,
          totalModules:
            typeof runtimeSection.totalModules === 'number'
              ? runtimeSection.totalModules : 0,
          telemetryDetected:
            typeof runtimeSection.telemetryDetected === 'boolean'
              ? runtimeSection.telemetryDetected : false,
        }
      : undefined;

  // Parse cached gaps from static section
  const parsedGaps = parseGapArray(staticSection?.gaps);

  const result: ObservabilityCoverageState = {
    static: {
      coveragePercent:
        typeof staticSection?.coveragePercent === 'number'
          ? staticSection.coveragePercent
          : 0,
      lastScanTimestamp:
        typeof staticSection?.lastScanTimestamp === 'string'
          ? staticSection.lastScanTimestamp
          : '',
      history: Array.isArray(staticSection?.history)
        ? (staticSection.history as unknown[]).filter(
            (entry): entry is { coveragePercent: number; timestamp: string } =>
              typeof entry === 'object' &&
              entry !== null &&
              typeof (entry as Record<string, unknown>).coveragePercent ===
                'number' &&
              typeof (entry as Record<string, unknown>).timestamp === 'string',
          )
        : [],
      ...(parsedGaps.length > 0 ? { gaps: parsedGaps } : {}),
    },
    targets: {
      staticTarget:
        typeof targets?.staticTarget === 'number'
          ? targets.staticTarget
          : DEFAULT_STATIC_TARGET,
      ...(typeof targets?.runtimeTarget === 'number'
        ? { runtimeTarget: targets.runtimeTarget }
        : {}),
    },
    ...(runtime ? { runtime } : {}),
  };

  return result;
}

/** Parse and validate an array of gap objects from raw JSON. */
function parseGapArray(raw: unknown): ObservabilityGap[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((g): g is Record<string, unknown> => {
      if (typeof g !== 'object' || g === null) return false;
      const r = g as Record<string, unknown>;
      return typeof r.file === 'string' && typeof r.line === 'number'
        && typeof r.type === 'string' && typeof r.description === 'string';
    })
    .map(g => ({
      file: g.file as string, line: g.line as number,
      type: g.type as string, description: g.description as string,
      severity: (g.severity === 'error' || g.severity === 'warning' ? g.severity : 'info') as GapSeverity,
    }));
}
