import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { Command } from 'commander';
import { fail, info, jsonOutput } from '../lib/output.js';
import { readSprintStatusFromState, reconcileState } from '../modules/sprint/index.js';
import { generateRalphPrompt } from '../lib/agents/ralph-prompt.js';
import { startRenderer, type SprintInfo } from '../lib/ink-renderer.js';
import { getSprintState } from '../modules/sprint/index.js';
import { formatElapsed, mapSprintStatuses, countStories } from '../lib/run-helpers.js';
import { getDriver } from '../lib/agents/index.js';
import type { AgentDriver, AgentEvent } from '../lib/agents/types.js';
import type { RendererHandle } from '../lib/ink-renderer.js';

/** Resolves the plugin directory path (.claude/ in project root). */
export function resolvePluginDir(): string {
  return join(process.cwd(), '.claude');
}

// Re-export helpers that tests import from run.ts
export { countStories } from '../lib/run-helpers.js';

/** Dispatches an AgentEvent to the appropriate renderer method. */
function handleAgentEvent(
  event: AgentEvent,
  rendererHandle: RendererHandle,
  state: { currentIterationCount: number },
): void {
  switch (event.type) {
    case 'tool-start':
    case 'tool-complete':
    case 'text':
    case 'result':
    case 'retry':
      // These AgentEvent types match StreamEvent shapes — pass through to renderer
      rendererHandle.update(event as Parameters<RendererHandle['update']>[0]);
      break;
    case 'story-complete':
      rendererHandle.addMessage({ type: 'ok', key: event.key, message: event.details });
      break;
    case 'story-failed':
      rendererHandle.addMessage({ type: 'fail', key: event.key, message: event.reason });
      break;
    case 'iteration':
      state.currentIterationCount = event.count;
      break;
  }
}

/** Line splitter: buffers partial lines, calls driver.parseOutput(), dispatches via handleAgentEvent(). */
function createDriverLineHandler(
  driver: AgentDriver,
  rendererHandle: RendererHandle,
  state: { currentIterationCount: number },
): (data: Buffer) => void {
  let partial = '';
  const decoder = new StringDecoder('utf8');
  return (data: Buffer): void => {
    const text = partial + decoder.write(data);
    const parts = text.split('\n');
    partial = parts.pop() ?? '';
    for (const line of parts) {
      if (line.trim().length === 0) continue;
      const event = driver.parseOutput(line);
      if (event) {
        handleAgentEvent(event, rendererHandle, state);
      }
    }
  };
}

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

      // 1. Resolve plugin directory
      const pluginDir = resolvePluginDir();
      if (!existsSync(pluginDir)) {
        fail('Plugin directory not found — run codeharness init first', outputOpts);
        process.exitCode = 1;
        return;
      }

      // 1b. Reconcile state (best-effort — failures warn but don't abort)
      const reconciliation = reconcileState();
      if (reconciliation.success && reconciliation.data.corrections.length > 0) {
        for (const correction of reconciliation.data.corrections) {
          info(`[INFO] Reconciled: ${correction}`, outputOpts);
        }
      } else if (!reconciliation.success) {
        info(`[WARN] State reconciliation failed: ${reconciliation.error}`, outputOpts);
      }

      // 2. Read sprint status for story count (from sprint-state.json)
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

      // 3. Parse and validate numeric options
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

      // 4. Generate prompt file (with flagged stories context if available)
      const promptFile = join(projectDir, 'ralph', '.harness-prompt.md');
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

      // 5. Create driver with ralph-specific configuration
      const quiet = options.quiet;
      const driver = getDriver('ralph', {
        pluginDir,
        maxIterations,
        iterationTimeout,
        calls,
        quiet,
        maxStoryRetries,
        reset: options.reset,
      });

      // 6. Set environment — stream-json is always the output format
      const env: Record<string, string> = {};
      if (isJson) {
        env.CLAUDE_OUTPUT_FORMAT = 'stream-json';
      }

      // 7. Spawn agent — pipe stdout/stderr through driver.parseOutput() → Ink renderer
      const rendererHandle = startRenderer({ quiet });
      let sprintStateInterval: ReturnType<typeof setInterval> | null = null;
      const sessionStartTime = Date.now();
      const eventState = { currentIterationCount: 0 };

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
            iterationCount: eventState.currentIterationCount,
          };
          rendererHandle.updateSprintState(sprintInfo);
        }

        // Feed initial per-story statuses to the renderer
        const initialStatuses = readSprintStatusFromState();
        const initialStories = mapSprintStatuses(initialStatuses);
        if (initialStories.length > 0) {
          rendererHandle.updateStories(initialStories);
        }

        const child = driver.spawn({
          storyKey: '',
          prompt: promptFile,
          workDir: projectDir,
          timeout,
          env,
        });

        if (!quiet && child.stdout && child.stderr) {
          const lineHandler = createDriverLineHandler(driver, rendererHandle, eventState);
          child.stdout.on('data', lineHandler);
          child.stderr.on('data', lineHandler);

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
                  iterationCount: eventState.currentIterationCount,
                };
                rendererHandle.updateSprintState(sprintInfo);
              }
              // Refresh per-story statuses
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

        // 8. Handle JSON output on exit
        if (isJson) {
          const statusFile = join(projectDir, driver.getStatusFile());
          let statusData: Record<string, unknown> | null = null;
          let exitReason = 'status_file_missing';
          if (existsSync(statusFile)) {
            try {
              statusData = JSON.parse(readFileSync(statusFile, 'utf-8'));
              exitReason = '';
            } catch { exitReason = 'status_file_unreadable'; }
          }
          const fc = statusData ? countStories(readSprintStatusFromState()) : counts;
          jsonOutput({
            status: statusData?.status ?? (exitCode === 0 ? 'completed' : 'stopped'),
            iterations: (statusData?.loop_count as number) ?? 0,
            storiesCompleted: statusData ? fc.done : 0,
            storiesTotal: fc.total,
            storiesRemaining: statusData ? fc.total - fc.done : fc.total,
            elapsedSeconds: (statusData?.elapsed_seconds as number) ?? 0,
            flaggedStories: (statusData?.flagged_stories as string[]) ?? [],
            exitReason: (statusData?.exit_reason as string) ?? exitReason,
          });
        }

        process.exitCode = exitCode;
      } catch (err) {
        if (sprintStateInterval) clearInterval(sprintStateInterval);
        rendererHandle.cleanup();
        const message = err instanceof Error ? err.message : String(err);
        fail(`Failed to start agent: ${message}`, outputOpts);
        process.exitCode = 1;
      }
    });
}
