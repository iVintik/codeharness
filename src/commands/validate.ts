/**
 * CLI command: codeharness validate
 * Runs self-validation cycle and produces a release gate report.
 * Story 10-3: Self-Validation Run
 */
import { Command } from 'commander';
import { ok, fail, jsonOutput } from '../lib/output.js';
import {
  createValidationSprint, runValidationCycle,
  getValidationProgress, getACById,
} from '../modules/verify/index.js';
import type { ValidationProgress } from '../modules/verify/index.js';

export function registerValidateCommand(program: Command): void {
  program
    .command('validate')
    .description('Run self-validation cycle and produce release gate report')
    .option('--ci', 'CI mode: minimal output, exit code 0 on pass / 1 on fail')
    .action((options: { ci?: boolean }, cmd: Command) => {
      const isJson = (cmd.optsWithGlobals() as { json?: boolean }).json === true;
      const isCi = options.ci === true;
      const initResult = createValidationSprint();
      if (!initResult.success) {
        reportError(initResult.error, isJson);
        return;
      }
      let cycles = 0;
      let cycle: ReturnType<typeof runValidationCycle>;
      do {
        cycle = runValidationCycle();
        if (!cycle.success) { reportError(cycle.error, isJson); return; }
        if (cycle.data.action !== 'no-actionable-ac') cycles++;
      } while (cycle.data.action !== 'no-actionable-ac');
      const progressResult = getValidationProgress();
      if (!progressResult.success) { reportError(progressResult.error, isJson); return; }
      const p = progressResult.data;
      const allPassed = p.failed === 0 && p.remaining === 0;
      if (isJson) outputJson(p, cycles, allPassed);
      else if (isCi) outputCi(p, allPassed);
      else outputHuman(p, cycles, allPassed);
      process.exitCode = allPassed ? 0 : 1;
    });
}

function reportError(msg: string, isJson: boolean): void {
  if (isJson) jsonOutput({ status: 'fail', message: msg });
  else fail(msg);
  process.exitCode = 1;
}

function getFailures(p: ValidationProgress) {
  return p.perAC
    .filter(a => a.status === 'failed' || a.status === 'blocked')
    .map(a => {
      const ac = getACById(a.acId);
      return {
        acId: a.acId, description: ac?.description ?? 'unknown',
        command: ac?.command, output: a.lastError ?? '',
        attempts: a.attempts,
        blocker: a.status === 'blocked' ? 'blocked' : 'failed',
      };
    });
}

function outputJson(p: ValidationProgress, cycles: number, allPassed: boolean): void {
  jsonOutput({
    status: allPassed ? 'pass' : 'fail',
    total: p.total, passed: p.passed, failed: p.failed,
    blocked: p.blocked, remaining: p.remaining, cycles,
    gate: allPassed ? 'RELEASE GATE: PASS -- v1.0 ready' : 'RELEASE GATE: FAIL',
    failures: getFailures(p),
  });
}

function outputCi(p: ValidationProgress, allPassed: boolean): void {
  if (allPassed) console.log('RELEASE GATE: PASS -- v1.0 ready');
  else console.log(`RELEASE GATE: FAIL (${p.passed}/${p.total} passed, ${p.failed} failed, ${p.blocked} blocked)`);
}

function outputHuman(p: ValidationProgress, cycles: number, allPassed: boolean): void {
  console.log(`Total: ${p.total} | Passed: ${p.passed} | Failed: ${p.failed} | Blocked: ${p.blocked} | Cycles: ${cycles}`);
  if (allPassed) { ok('RELEASE GATE: PASS -- v1.0 ready'); return; }
  for (const f of getFailures(p)) {
    console.log(`  AC ${f.acId}: ${f.description}`);
    if (f.command) console.log(`    Command: ${f.command}`);
    if (f.output) console.log(`    Output: ${f.output}`);
    console.log(`    Attempts: ${f.attempts}`);
    console.log(`    Blocker: ${f.blocker}`);
  }
  fail('RELEASE GATE: FAIL');
}
