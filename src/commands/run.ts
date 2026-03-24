import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { fail, info, jsonOutput } from '../lib/output.js';
import { readSprintStatusFromState, reconcileState } from '../modules/sprint/index.js';
import { generateRalphPrompt } from '../templates/ralph-prompt.js';
import { startRenderer, type SprintInfo } from '../lib/ink-renderer.js';
import { getSprintState } from '../modules/sprint/index.js';
import { formatElapsed, mapSprintStatuses, countStories, buildSpawnArgs, createLineProcessor } from '../lib/run-helpers.js';

/** Resolves the path to ralph/ralph.sh relative to the package root. */
export function resolveRalphPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);
  let root = dirname(currentDir);
  if (root.endsWith('/src') || root.endsWith('\\src')) {
    root = dirname(root);
  }
  return join(root, 'ralph', 'ralph.sh');
}

/** Resolves the plugin directory path (.claude/ in project root). */
export function resolvePluginDir(): string {
  return join(process.cwd(), '.claude');
}

// Re-export helpers that tests import from run.ts
export { countStories, buildSpawnArgs } from '../lib/run-helpers.js';

export function registerRunCommand(program: Command): void {
  program
    .command('run')
    .description('Execute the autonomous coding loop')
    .option('--max-iterations <n>', 'Maximum loop iterations', '50')
    .option('--timeout <seconds>', 'Total loop timeout in seconds', '43200')
    .option('--iteration-timeout <minutes>', 'Per-iteration timeout in minutes', '30')
    .option('--quiet', 'Suppress terminal output (background mode)', false)
    .option('--calls <n>', 'Max API calls per hour', '100')
    .option('--max-story-retries <n>', 'Max retries per story before flagging', '10')
    .option('--reset', 'Clear retry counters, flagged stories, and circuit breaker before starting', false)
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const isJson = !!globalOpts.json;
      const outputOpts = { json: isJson };

      // 1. Resolve Ralph script path
      const ralphPath = resolveRalphPath();
      if (!existsSync(ralphPath)) {
        fail('Ralph loop not found — reinstall codeharness', outputOpts);
        process.exitCode = 1;
        return;
      }

      // 2. Resolve plugin directory
      const pluginDir = resolvePluginDir();
      if (!existsSync(pluginDir)) {
        fail('Plugin directory not found — run codeharness init first', outputOpts);
        process.exitCode = 1;
        return;
      }

      // 2b. Reconcile state (best-effort — failures warn but don't abort)
      const reconciliation = reconcileState();
      if (reconciliation.success && reconciliation.data.corrections.length > 0) {
        for (const correction of reconciliation.data.corrections) {
          info(`[INFO] Reconciled: ${correction}`, outputOpts);
        }
      } else if (!reconciliation.success) {
        info(`[WARN] State reconciliation failed: ${reconciliation.error}`, outputOpts);
      }

      // 3. Read sprint status for story count (from sprint-state.json)
      const projectDir = process.cwd();
      const sprintStatusPath = join(projectDir, '_bmad-output', 'implementation-artifacts', 'sprint-status.yaml');
      const statuses = readSprintStatusFromState();
      const counts = countStories(statuses);

      if (counts.total === 0) {
        fail('No stories found in sprint-state.json — nothing to execute', outputOpts);
        process.exitCode = 1;
        return;
      }

      info(`Starting autonomous execution — ${counts.ready} ready, ${counts.inProgress} in progress, ${counts.verified} verified, ${counts.done}/${counts.total} done`, outputOpts);

      // 4. Parse and validate numeric options
      const maxIterations = parseInt(options.maxIterations, 10);
      const timeout = parseInt(options.timeout, 10);
      const iterationTimeout = parseInt(options.iterationTimeout, 10);
      const calls = parseInt(options.calls, 10);
      const maxStoryRetries = parseInt(options.maxStoryRetries, 10);

      if (isNaN(maxIterations) || isNaN(timeout) || isNaN(iterationTimeout) || isNaN(calls) || isNaN(maxStoryRetries)) {
        fail('Invalid numeric option — --max-iterations, --timeout, --iteration-timeout, --calls, and --max-story-retries must be numbers', outputOpts);
        process.exitCode = 1;
        return;
      }

      // 5. Generate prompt file (with flagged stories context if available)
      const promptFile = join(projectDir, 'ralph', '.harness-prompt.md');
      // Read flagged stories from sprint-state.json (reconcileState may have
      // already deleted the orphan .flagged_stories file, so read from state)
      let flaggedStories: string[] | undefined;
      const flaggedState = getSprintState();
      if (flaggedState.success && flaggedState.data.flagged?.length > 0) {
        flaggedStories = flaggedState.data.flagged;
      }
      const promptContent = generateRalphPrompt({
        projectDir,
        sprintStatusPath,
        flaggedStories,
      });
      try {
        mkdirSync(dirname(promptFile), { recursive: true });
        writeFileSync(promptFile, promptContent, 'utf-8');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        fail(`Failed to write prompt file: ${message}`, outputOpts);
        process.exitCode = 1;
        return;
      }

      // 6. Build spawn arguments
      const args = buildSpawnArgs({
        ralphPath,
        pluginDir,
        promptFile,
        maxIterations,
        timeout,
        iterationTimeout,
        calls,
        quiet: options.quiet,
        maxStoryRetries,
        reset: options.reset,
      });

      // 7. Set environment — stream-json is always the output format
      const env = { ...process.env };
      if (isJson) {
        env.CLAUDE_OUTPUT_FORMAT = 'stream-json';
      }

      // 8. Spawn Ralph — pipe stdout/stderr through stream parser → Ink renderer
      // Declare renderer handle outside try so cleanup is always reachable
      const quiet = options.quiet;
      const rendererHandle = startRenderer({ quiet });
      let sprintStateInterval: ReturnType<typeof setInterval> | null = null;
      const sessionStartTime = Date.now();
      let currentIterationCount = 0;

      try {
        // Read initial sprint state for the renderer header
        const initialState = getSprintState();
        if (initialState.success) {
          const s = initialState.data;
          const sprintInfo: SprintInfo = {
            storyKey: s.run.currentStory ?? '',
            phase: s.run.currentPhase ?? '',
            done: s.sprint.done,
            total: s.sprint.total,
            elapsed: formatElapsed(Date.now() - sessionStartTime),
            iterationCount: currentIterationCount,
          };
          rendererHandle.updateSprintState(sprintInfo);
        }

        // Feed initial per-story statuses to the renderer
        const initialStatuses = readSprintStatusFromState();
        const initialStories = mapSprintStatuses(initialStatuses);
        if (initialStories.length > 0) {
          rendererHandle.updateStories(initialStories);
        }

        const child = spawn('bash', args, {
          stdio: quiet ? 'ignore' : ['inherit', 'pipe', 'pipe'],
          cwd: projectDir,
          env,
        });

        if (!quiet && child.stdout && child.stderr) {
          // Wire up stream parser → Ink renderer via extracted createLineProcessor.
          const stdoutHandler = createLineProcessor({
            onEvent: (event) => rendererHandle.update(event),
          });
          const stderrHandler = createLineProcessor({
            onEvent: (event) => rendererHandle.update(event),
            onMessage: (msg) => rendererHandle.addMessage(msg),
            onIteration: (iteration) => { currentIterationCount = iteration; },
          }, { parseRalph: true });
          child.stdout.on('data', stdoutHandler);
          child.stderr.on('data', stderrHandler);

          // Periodically refresh sprint state for the header display
          sprintStateInterval = setInterval(() => {
            try {
              const stateResult = getSprintState();
              if (stateResult.success) {
                const s = stateResult.data;
                const sprintInfo: SprintInfo = {
                  storyKey: s.run.currentStory ?? '',
                  phase: s.run.currentPhase ?? '',
                  done: s.sprint.done,
                  total: s.sprint.total,
                  elapsed: formatElapsed(Date.now() - sessionStartTime),
                  iterationCount: currentIterationCount,
                };
                rendererHandle.updateSprintState(sprintInfo);
              }
              // Refresh per-story statuses (AC #7)
              const currentStatuses = readSprintStatusFromState();
              const storyEntries = mapSprintStatuses(currentStatuses);
              rendererHandle.updateStories(storyEntries);
            } catch {
              // Ignore read errors during polling
            }
          }, 5_000);
        }

        const exitCode = await new Promise<number>((resolve, reject) => {
          child.on('error', (err) => {
            if (sprintStateInterval) clearInterval(sprintStateInterval);
            rendererHandle.cleanup();
            reject(err);
          });
          child.on('close', (code) => {
            if (sprintStateInterval) clearInterval(sprintStateInterval);
            rendererHandle.cleanup();
            resolve(code ?? 1);
          });
        });

        // 9. Handle JSON output on exit
        if (isJson) {
          const statusFile = join(projectDir, 'ralph', 'status.json');
          if (existsSync(statusFile)) {
            try {
              const statusData = JSON.parse(readFileSync(statusFile, 'utf-8'));
              const finalStatuses = readSprintStatusFromState();
              const finalCounts = countStories(finalStatuses);
              jsonOutput({
                status: statusData.status ?? (exitCode === 0 ? 'completed' : 'stopped'),
                iterations: statusData.loop_count ?? 0,
                storiesCompleted: finalCounts.done,
                storiesTotal: finalCounts.total,
                storiesRemaining: finalCounts.total - finalCounts.done,
                elapsedSeconds: statusData.elapsed_seconds ?? 0,
                flaggedStories: statusData.flagged_stories ?? [],
                exitReason: statusData.exit_reason ?? '',
              });
            } catch {
              jsonOutput({
                status: exitCode === 0 ? 'completed' : 'stopped',
                iterations: 0,
                storiesCompleted: 0,
                storiesTotal: counts.total,
                storiesRemaining: counts.total,
                elapsedSeconds: 0,
                flaggedStories: [],
                exitReason: 'status_file_unreadable',
              });
            }
          } else {
            // status.json not created (Ralph crashed early or never started)
            const finalStatuses = readSprintStatusFromState();
            const finalCounts = countStories(finalStatuses);
            jsonOutput({
              status: exitCode === 0 ? 'completed' : 'stopped',
              iterations: 0,
              storiesCompleted: finalCounts.done,
              storiesTotal: finalCounts.total,
              storiesRemaining: finalCounts.total - finalCounts.done,
              elapsedSeconds: 0,
              flaggedStories: [],
              exitReason: 'status_file_missing',
            });
          }
        }

        process.exitCode = exitCode;
      } catch (err) {
        if (sprintStateInterval) clearInterval(sprintStateInterval);
        rendererHandle.cleanup();
        const message = err instanceof Error ? err.message : String(err);
        fail(`Failed to start Ralph: ${message}`, outputOpts);
        process.exitCode = 1;
      }
    });
}
