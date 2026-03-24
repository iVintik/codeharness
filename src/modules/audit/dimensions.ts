/**
 * Audit dimension checkers — each wraps an existing module and maps
 * its output to DimensionResult. Each checker catches its own errors
 * and never throws (AC #6).
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ok, isOk } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type { DimensionResult, AuditGap } from './types.js';
import { analyze, validateRuntime } from '../observability/index.js';
import type { AnalyzerResult, RuntimeValidationResult } from '../observability/index.js';
import { checkOnlyCoverage } from '../../lib/coverage/index.js';
import { scanDocHealth } from '../../lib/doc-health/index.js';
import { parseProof } from '../verify/index.js';
import { validateDockerfile } from '../infra/index.js';

type Status = 'pass' | 'fail' | 'warn';

function gap(dimension: string, description: string, suggestedFix: string): AuditGap {
  return { dimension, description, suggestedFix };
}

function dimOk(name: string, status: Status, metric: string, gaps: AuditGap[] = []): Result<DimensionResult> {
  return ok({ name, status, metric, gaps });
}

function dimCatch(name: string, err: unknown): Result<DimensionResult> {
  const msg = err instanceof Error ? err.message : String(err);
  return dimOk(name, 'warn', 'error', [gap(name, `${name} check failed: ${msg}`, `Check ${name} configuration`)]);
}

function worstStatus(...statuses: Status[]): Status {
  if (statuses.includes('fail')) return 'fail';
  if (statuses.includes('warn')) return 'warn';
  return 'pass';
}

// ─── Observability (Task 2.1) ───────────────────────────────────────────────

export async function checkObservability(projectDir: string): Promise<Result<DimensionResult>> {
  try {
    const gaps: AuditGap[] = [];
    let sStatus: Status = 'pass', sMetric = '';
    const sr = analyze(projectDir);

    if (isOk(sr)) {
      const d: AnalyzerResult = sr.data;
      if (d.skipped) {
        sStatus = 'warn';
        sMetric = `static: skipped (${d.skipReason ?? 'unknown'})`;
        gaps.push(gap('observability', `Static analysis skipped: ${d.skipReason ?? 'Semgrep not installed'}`, 'Install Semgrep: pip install semgrep'));
      } else {
        const n = d.gaps.length;
        sMetric = `static: ${n} gap${n !== 1 ? 's' : ''}`;
        if (n > 0) {
          sStatus = 'warn';
          for (const g of d.gaps) gaps.push(gap('observability', `${g.file}:${g.line} — ${g.message}`, g.fix ?? 'Add observability instrumentation'));
        }
      }
    } else {
      sStatus = 'warn';
      sMetric = 'static: skipped (analysis failed)';
      gaps.push(gap('observability', `Static analysis failed: ${sr.error}`, 'Check Semgrep installation and rules configuration'));
    }

    let rStatus: Status = 'pass', rMetric = '';
    try {
      const rr = await validateRuntime(projectDir);
      if (isOk(rr)) {
        const d: RuntimeValidationResult = rr.data;
        if (d.skipped) {
          rStatus = 'warn';
          rMetric = `runtime: skipped (${d.skipReason ?? 'unknown'})`;
          gaps.push(gap('observability', `Runtime validation skipped: ${d.skipReason ?? 'backend unreachable'}`, 'Start the observability stack: codeharness stack up'));
        } else {
          rMetric = `runtime: ${d.coveragePercent}%`;
          if (d.coveragePercent < 50) {
            rStatus = 'warn';
            gaps.push(gap('observability', `Runtime coverage low: ${d.coveragePercent}%`, 'Add telemetry instrumentation to more modules'));
          }
        }
      } else {
        rStatus = 'warn';
        rMetric = 'runtime: skipped (validation failed)';
        gaps.push(gap('observability', `Runtime validation failed: ${rr.error}`, 'Ensure observability backend is running'));
      }
    } catch {
      rStatus = 'warn';
      rMetric = 'runtime: skipped (error)';
      gaps.push(gap('observability', 'Runtime validation threw an unexpected error', 'Check observability stack health'));
    }

    return dimOk('observability', worstStatus(sStatus, rStatus), `${sMetric}, ${rMetric}`, gaps);
  } catch (err: unknown) { return dimCatch('observability', err); }
}

// ─── Testing (Task 2.2) ────────────────────────────────────────────────────

export function checkTesting(projectDir: string): Result<DimensionResult> {
  try {
    const r = checkOnlyCoverage(projectDir);
    if (!r.success) return dimOk('testing', 'warn', 'no coverage data', [gap('testing', 'No coverage tool detected or coverage data unavailable', 'Run tests with coverage: npm run test:coverage')]);

    const pct = r.coveragePercent;
    const gaps: AuditGap[] = [];
    let status: Status = 'pass';
    if (pct < 50) { status = 'fail'; gaps.push(gap('testing', `Test coverage critically low: ${pct}%`, 'Add unit tests to increase coverage above 50%')); }
    else if (pct < 80) { status = 'warn'; gaps.push(gap('testing', `Test coverage below target: ${pct}%`, 'Add tests to reach 80% coverage target')); }
    return dimOk('testing', status, `${pct}%`, gaps);
  } catch (err: unknown) { return dimCatch('testing', err); }
}

// ─── Documentation (Task 2.3) ──────────────────────────────────────────────

export function checkDocumentation(projectDir: string): Result<DimensionResult> {
  try {
    const report = scanDocHealth(projectDir);
    const gaps: AuditGap[] = [];
    const { fresh, stale, missing } = report.summary;
    let status: Status = 'pass';

    if (missing > 0) {
      status = 'fail';
      for (const doc of report.documents) if (doc.grade === 'missing') gaps.push(gap('documentation', `Missing: ${doc.path} — ${doc.reason}`, `Create ${doc.path}`));
    }
    if (stale > 0) {
      if (status !== 'fail') status = 'warn';
      for (const doc of report.documents) if (doc.grade === 'stale') gaps.push(gap('documentation', `Stale: ${doc.path} — ${doc.reason}`, `Update ${doc.path} to reflect current code`));
    }
    return dimOk('documentation', status, `${fresh} fresh, ${stale} stale, ${missing} missing`, gaps);
  } catch (err: unknown) { return dimCatch('documentation', err); }
}

// ─── Verification (Task 2.4) ───────────────────────────────────────────────

export function checkVerification(projectDir: string): Result<DimensionResult> {
  try {
    const gaps: AuditGap[] = [];
    const sprintPath = join(projectDir, '_bmad-output', 'implementation-artifacts', 'sprint-status.yaml');
    if (!existsSync(sprintPath)) return dimOk('verification', 'warn', 'no sprint data', [gap('verification', 'No sprint-status.yaml found', 'Run sprint planning to create sprint status')]);

    const vDir = join(projectDir, 'verification');
    let proofCount = 0, totalChecked = 0;

    if (existsSync(vDir)) {
      for (const file of readdirSafe(vDir)) {
        if (!file.endsWith('-proof.md')) continue;
        totalChecked++;
        const r = parseProof(join(vDir, file));
        if (isOk(r) && r.data.passed) { proofCount++; }
        else { gaps.push(gap('verification', `Story ${file.replace('-proof.md', '')} proof incomplete or failing`, `Run codeharness verify ${file.replace('-proof.md', '')}`)); }
      }
    }

    let status: Status = 'pass';
    if (totalChecked === 0) { status = 'warn'; gaps.push(gap('verification', 'No verification proofs found', 'Run codeharness verify for completed stories')); }
    else if (proofCount < totalChecked) { status = 'warn'; }

    return dimOk('verification', status, totalChecked > 0 ? `${proofCount}/${totalChecked} verified` : 'no proofs', gaps);
  } catch (err: unknown) { return dimCatch('verification', err); }
}

// ─── Infrastructure (Task 2.5) ─────────────────────────────────────────────

export function checkInfrastructure(projectDir: string): Result<DimensionResult> {
  try {
    const result = validateDockerfile(projectDir);
    if (!result.success) {
      const err = result.error;
      if (err.includes('No Dockerfile')) return dimOk('infrastructure', 'fail', 'no Dockerfile', [gap('infrastructure', 'No Dockerfile found', 'Create a Dockerfile for containerized deployment')]);
      if (err.includes('could not be read')) return dimOk('infrastructure', 'warn', 'Dockerfile unreadable', [gap('infrastructure', 'Dockerfile exists but could not be read', 'Check Dockerfile permissions')]);
      if (err.includes('no FROM')) return dimOk('infrastructure', 'fail', 'invalid Dockerfile', [gap('infrastructure', 'Dockerfile has no FROM instruction', 'Add a FROM instruction with a pinned base image')]);
      return dimOk('infrastructure', 'fail', 'validation failed', [gap('infrastructure', err, 'Fix Dockerfile validation errors')]);
    }

    const gaps: AuditGap[] = result.data.gaps.map(g => gap('infrastructure', g.description, g.suggestedFix));
    for (const w of result.data.warnings) { gaps.push(gap('infrastructure', w, 'Provide the missing configuration file')); }
    const issueCount = gaps.length;
    const status: Status = issueCount > 0 ? 'warn' : 'pass';
    const metric = issueCount > 0 ? `Dockerfile exists (${issueCount} issue${issueCount !== 1 ? 's' : ''})` : 'Dockerfile valid';
    return dimOk('infrastructure', status, metric, gaps);
  } catch (err: unknown) { return dimCatch('infrastructure', err); }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function readdirSafe(dir: string): string[] {
  try { return readdirSync(dir) as string[]; }
  catch { return []; }
}
