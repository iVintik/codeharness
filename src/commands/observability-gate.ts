import { Command } from 'commander';
import { ok, fail, jsonOutput } from '../lib/output.js';
import { checkObservabilityCoverageGate } from '../modules/observability/index.js';

export function registerObservabilityGateCommand(program: Command): void {
  program
    .command('observability-gate')
    .description('Check observability coverage against targets (commit gate)')
    .option('--json', 'Machine-readable JSON output')
    .option('--min-static <percent>', 'Override static coverage target')
    .option('--min-runtime <percent>', 'Override runtime coverage target')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const isJson = opts.json === true || globalOpts.json === true;
      const root = process.cwd();

      const overrides: { staticTarget?: number; runtimeTarget?: number } = {};
      if (opts.minStatic !== undefined) {
        const parsed = parseInt(opts.minStatic, 10);
        if (isNaN(parsed) || parsed < 0 || parsed > 100) {
          if (isJson) {
            jsonOutput({ status: 'error', message: '--min-static must be a number between 0 and 100' });
          } else {
            fail('--min-static must be a number between 0 and 100');
          }
          process.exitCode = 1;
          return;
        }
        overrides.staticTarget = parsed;
      }
      if (opts.minRuntime !== undefined) {
        const parsed = parseInt(opts.minRuntime, 10);
        if (isNaN(parsed) || parsed < 0 || parsed > 100) {
          if (isJson) {
            jsonOutput({ status: 'error', message: '--min-runtime must be a number between 0 and 100' });
          } else {
            fail('--min-runtime must be a number between 0 and 100');
          }
          process.exitCode = 1;
          return;
        }
        overrides.runtimeTarget = parsed;
      }

      const result = checkObservabilityCoverageGate(root, overrides);

      if (!result.success) {
        if (isJson) {
          jsonOutput({ status: 'error', message: result.error });
        } else {
          fail(`Observability gate error: ${result.error}`);
        }
        process.exitCode = 1;
        return;
      }

      const gate = result.data;

      if (isJson) {
        jsonOutput({
          status: gate.passed ? 'pass' : 'fail',
          passed: gate.passed,
          static: {
            current: gate.staticResult.current,
            target: gate.staticResult.target,
            met: gate.staticResult.met,
            gap: gate.staticResult.gap,
          },
          runtime: gate.runtimeResult
            ? {
                current: gate.runtimeResult.current,
                target: gate.runtimeResult.target,
                met: gate.runtimeResult.met,
                gap: gate.runtimeResult.gap,
              }
            : null,
          gaps: gate.gapSummary.map(g => ({
            file: g.file,
            line: g.line,
            type: g.type,
            description: g.description,
          })),
        });
      } else {
        const staticLine = `Static: ${gate.staticResult.current}% / ${gate.staticResult.target}% target`;
        if (gate.passed) {
          ok(`Observability gate passed. ${staticLine}`);
          if (gate.runtimeResult) {
            ok(`Runtime: ${gate.runtimeResult.current}% / ${gate.runtimeResult.target}% target`);
          }
        } else {
          fail(`Observability gate failed. ${staticLine}`);
          if (gate.runtimeResult && !gate.runtimeResult.met) {
            fail(`Runtime: ${gate.runtimeResult.current}% / ${gate.runtimeResult.target}% target`);
          }
          if (gate.gapSummary.length > 0) {
            fail('Gaps:');
            const shown = gate.gapSummary.slice(0, 5);
            for (const g of shown) {
              fail(`  ${g.file}:${g.line} — ${g.description}`);
            }
            if (gate.gapSummary.length > 5) {
              fail(`  ... and ${gate.gapSummary.length - 5} more.`);
            }
          }
          fail('Add logging to flagged functions. Run: codeharness observability-gate for details.');
        }
      }

      if (!gate.passed) {
        process.exitCode = 1;
      }
    });
}
