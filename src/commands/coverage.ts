import { Command } from 'commander';
import { ok, fail, info, jsonOutput } from '../lib/output.js';
import {
  detectCoverageTool,
  runCoverage,
  checkOnlyCoverage,
  evaluateCoverage,
  updateCoverageState,
  printCoverageOutput,
  checkPerFileCoverage,
} from '../lib/coverage.js';

export function registerCoverageCommand(program: Command): void {
  program
    .command('coverage')
    .description('Run tests with coverage and evaluate against targets')
    .option('--json', 'Machine-readable JSON output')
    .option('--check-only', 'Evaluate without running tests — reads last coverage report')
    .option('--story <id>', 'Associate coverage delta with a specific story')
    .option('--min-file <percent>', 'Minimum per-file statement coverage', '80')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const isJson = opts.json === true || globalOpts.json === true;
      const checkOnly: boolean = opts.checkOnly === true;
      const storyId: string | undefined = opts.story;
      const minFile = parseInt(opts.minFile, 10) || 0;
      const root = process.cwd();

      // 1. Detect coverage tool
      const toolInfo = detectCoverageTool(root);

      if (toolInfo.tool === 'unknown') {
        if (isJson) {
          jsonOutput({
            status: 'fail',
            message: 'No coverage tool detected',
            tool: 'unknown',
          });
        } else {
          fail('No coverage tool detected. Ensure your project has a test runner configured.');
        }
        process.exitCode = 1;
        return;
      }

      if (!isJson) {
        info(`Detected coverage tool: ${toolInfo.tool} (${toolInfo.runCommand})`);
      }

      // 2. Run coverage or check-only
      const result = checkOnly ? checkOnlyCoverage(root) : runCoverage(root);

      if (!result.success) {
        if (isJson) {
          jsonOutput({
            status: 'fail',
            message: result.rawOutput,
            testsPassed: false,
            passCount: 0,
            failCount: 0,
            coveragePercent: 0,
            target: 100,
            met: false,
            delta: null,
            baseline: null,
            tool: toolInfo.tool,
          });
        } else {
          fail(result.rawOutput);
        }
        process.exitCode = 1;
        return;
      }

      // 3. Evaluate coverage
      const evaluation = evaluateCoverage(result, root);

      // 4. Update state
      try {
        updateCoverageState(result, evaluation, root);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (!isJson) {
          info(`Note: Could not update state file: ${message}`);
        }
      }

      // 5. Per-file coverage floor check
      let perFileResult = null;
      if (minFile > 0) {
        perFileResult = checkPerFileCoverage(minFile, root);
      }

      // 6. Output results
      const perFileOk = !perFileResult || perFileResult.violations.length === 0;
      if (isJson) {
        const status = result.testsPassed && evaluation.met && perFileOk ? 'ok' : 'fail';
        jsonOutput({
          status,
          testsPassed: result.testsPassed,
          passCount: result.passCount,
          failCount: result.failCount,
          coveragePercent: evaluation.actual,
          target: evaluation.target,
          met: evaluation.met,
          delta: evaluation.delta,
          baseline: evaluation.baseline,
          tool: toolInfo.tool,
          ...(storyId ? { story: storyId } : {}),
          ...(perFileResult ? {
            perFile: {
              floor: perFileResult.floor,
              totalFiles: perFileResult.totalFiles,
              violationCount: perFileResult.violations.length,
              violations: perFileResult.violations,
            },
          } : {}),
        });
      } else {
        printCoverageOutput(result, evaluation);
        if (storyId) {
          info(`Story: ${storyId}`);
        }
        if (perFileResult && perFileResult.violations.length > 0) {
          fail(`${perFileResult.violations.length} file(s) below ${minFile}% statement coverage:`);
          for (const v of perFileResult.violations) {
            fail(`  ${v.file}: ${v.statements}% statements, ${v.branches}% branches`);
          }
        } else if (perFileResult) {
          ok(`All ${perFileResult.totalFiles} files above ${minFile}% statement coverage`);
        }
      }

      // 7. Set exit code
      if (!result.testsPassed || !evaluation.met || !perFileOk) {
        process.exitCode = 1;
      }
    });
}
