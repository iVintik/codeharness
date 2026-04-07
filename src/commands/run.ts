import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { fail, info, ok } from '../lib/output.js';
import { isDockerAvailable } from '../lib/docker/index.js';
import { cleanupContainers } from '../modules/infra/index.js';
import { getSprintState, readSprintStatusFromState, reconcileState, updateStoryStatus } from '../modules/sprint/index.js';
import { countStories, formatElapsed } from '../lib/run-helpers.js';
import { parseWorkflow, resolveWorkflow } from '../lib/workflow-parser.js';
import { resolveAgent, compileSubagentDefinition } from '../lib/agent-resolver.js';
import { runWorkflowActor } from '../lib/workflow-runner.js';
import { readWorkflowState, writeWorkflowState } from '../lib/workflow-state.js';
import { WorktreeManager } from '../lib/worktree-manager.js';
import { LanePool } from '../lib/lane-pool.js';
import { startRenderer } from '../lib/ink-renderer.js';
import type { EpicDescriptor, ExecuteEpicFn, LaneEvent } from '../lib/lane-pool.js';
import type { EngineConfig, EngineEvent } from '../lib/workflow-types.js';
import type { SubagentDefinition } from '../lib/agent-resolver.js';
import type { SprintState } from '../types/state.js';

/** Resolves the plugin directory path (.claude/ in project root). */
export function resolvePluginDir(): string { return join(process.cwd(), '.claude'); }

// Re-export helpers that tests import from run.ts
export { countStories } from '../lib/run-helpers.js';

/** Extract the numeric epic ID prefix from a story key (e.g. "17-1-foo" → "17"). */
export function extractEpicId(storyKey: string): string {
  const match = storyKey.match(/^(\d+)-/);
  return match ? match[1] : storyKey;
}

/** Build EpicDescriptor[] from sprint state, grouped by epic ID, skipping done epics. */
export function buildEpicDescriptors(state: SprintState): EpicDescriptor[] {
  const epicMap = new Map<string, string[]>();
  for (const storyKey of Object.keys(state.stories)) {
    const epicId = extractEpicId(storyKey);
    if (!epicMap.has(epicId)) epicMap.set(epicId, []);
    epicMap.get(epicId)!.push(storyKey);
  }
  return [...epicMap.entries()]
    .filter(([epicId]) => { const s = state.epics[`epic-${epicId}`]; return !s || s.status !== 'done'; })
    .map(([epicId, stories]) => ({ id: epicId, slug: `epic-${epicId}`, stories }));
}

/** Translate sentinel story keys to readable display names. */
function toDisplayKey(storyKey: string): string {
  if (storyKey.startsWith('__epic_')) return `Epic ${storyKey.replace('__epic_', '').replace('__', '')}`;
  if (storyKey === '__run__') return 'Run';
  return storyKey;
}

/** Strip gate suffix from namespaced key (e.g. "27-4-foo:quality" → "27-4-foo"). */
function toBaseStoryKey(storyKey: string): string {
  const colonIdx = storyKey.indexOf(':');
  return colonIdx >= 0 ? storyKey.slice(0, colonIdx) : storyKey;
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
    .option('--resume', 'Resume from last checkpoint (engine resumes by default)', false)
    .option('--workflow <name>', 'Workflow name to load (default: "default")')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const isJson = !!globalOpts.json;
      const outputOpts = { json: isJson };

      const pluginDir = resolvePluginDir();
      if (!existsSync(pluginDir)) {
        fail('Plugin directory not found — run codeharness init first', outputOpts);
        process.exitCode = 1;
        return;
      }

      const reconciliation = reconcileState();
      if (reconciliation.success && reconciliation.data.corrections.length > 0) {
        for (const correction of reconciliation.data.corrections) {
          info(`[INFO] Reconciled: ${correction}`, outputOpts);
        }
      } else if (!reconciliation.success) {
        info(`[WARN] State reconciliation failed: ${reconciliation.error}`, outputOpts);
      }

      if (!isDockerAvailable()) {
        fail('[FAIL] Docker not available — install Docker or start the daemon', outputOpts);
        process.exitCode = 1;
        return;
      }

      const cleanup = cleanupContainers();
      if (cleanup.success && cleanup.data.containersRemoved > 0) {
        info(`[INFO] Cleaned up ${cleanup.data.containersRemoved} orphaned container(s): ${cleanup.data.names.join(', ')}`, outputOpts);
      } else if (!cleanup.success) {
        info(`[WARN] Container cleanup failed: ${cleanup.error}`, outputOpts);
      }

      const statuses = readSprintStatusFromState();
      const counts = countStories(statuses);

      if (counts.total === 0) {
        fail('No stories found in sprint-state.json — nothing to execute', outputOpts);
        process.exitCode = 1;
        return;
      }

      if (counts.ready === 0 && counts.inProgress === 0 && counts.checked === 0) {
        fail('No stories ready for execution', outputOpts);
        process.exitCode = 1;
        return;
      }

      info(`Starting autonomous execution — ${counts.ready} ready, ${counts.inProgress} in progress, ${counts.checked} checked, ${counts.done}/${counts.total} done`, outputOpts);

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

      const projectDir = process.cwd();
      const workflowName = options.workflow ?? 'default';

      if (!/^[a-zA-Z0-9_-]+$/.test(workflowName)) {
        fail(`Invalid workflow name "${workflowName}" — only alphanumeric characters, hyphens, and underscores are allowed`, outputOpts);
        process.exitCode = 1;
        return;
      }

      let parsedWorkflow;
      try {
        parsedWorkflow = resolveWorkflow({ cwd: projectDir, name: workflowName });
      } catch (err: unknown) {
        if (workflowName !== 'default') {
          const msg = err instanceof Error ? err.message : String(err);
          fail(`Failed to resolve workflow: ${msg}`, outputOpts);
          process.exitCode = 1;
          return;
        }
        // Fallback: try direct file parsing for default workflow (backward compatibility)
        const projectWorkflowPath = join(projectDir, '.codeharness', 'workflows', 'default.yaml');
        const templateWorkflowPath = join(projectDir, 'templates', 'workflows', 'default.yaml');
        const workflowPath = existsSync(projectWorkflowPath) ? projectWorkflowPath : templateWorkflowPath;
        try {
          parsedWorkflow = parseWorkflow(workflowPath);
        } catch (fallbackErr: unknown) {
          const msg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
          fail(`Failed to resolve workflow: ${msg}`, outputOpts);
          process.exitCode = 1;
          return;
        }
      }

      const agents: Record<string, SubagentDefinition> = {};
      try {
        for (const [, task] of Object.entries(parsedWorkflow.tasks)) {
          if (task.agent != null && !agents[task.agent]) {
            const resolved = resolveAgent(task.agent, { cwd: projectDir });
            agents[task.agent] = compileSubagentDefinition(resolved);
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        fail(`Failed to resolve agents: ${msg}`, outputOpts);
        process.exitCode = 1;
        return;
      }

      if (options.resume) {
        const currentState = readWorkflowState(projectDir);
        if (currentState.phase === 'completed') {
          writeWorkflowState({ ...currentState, phase: 'idle' }, projectDir);
          info('Resuming from completed state — phase reset to idle', outputOpts);
        } else if (currentState.phase === 'circuit-breaker') {
          // score_history is preserved; only triggered/reason/phase are reset
          writeWorkflowState({ ...currentState, phase: 'idle', circuit_breaker: { ...currentState.circuit_breaker, triggered: false, reason: null } }, projectDir);
          info('Resuming after circuit breaker — previous findings preserved', outputOpts);
        }
      }

      const abortController = new AbortController();
      let interrupted = false;
      // eslint-disable-next-line prefer-const
      let renderer: ReturnType<typeof startRenderer>;

      const onInterrupt = () => {
        if (interrupted) process.exit(1);
        interrupted = true;
        renderer.cleanup();
        abortController.abort();
        info('Interrupted — waiting for current task to finish...', outputOpts);
      };

      const sessionStartMs = Date.now();

      renderer = startRenderer({
        quiet: !!options.quiet || isJson,
        sprintState: { storyKey: '', phase: 'executing', done: counts.done, total: counts.total, totalCost: 0 },
        sessionStartMs,
        onQuit: () => onInterrupt(),
      });

      process.on('SIGINT', onInterrupt);
      process.on('SIGTERM', onInterrupt);

      let totalCostUsd = 0;
      let storiesDone = counts.done;

      const cleanupResources = (): void => {
        process.removeListener('SIGINT', onInterrupt);
        process.removeListener('SIGTERM', onInterrupt);
        renderer.cleanup();
      };

      // Build initial story list from sprint status
      const storyEntries: Array<{ key: string; status: 'done' | 'in-progress' | 'pending' | 'failed' | 'checked' }> = [];
      for (const [key, status] of Object.entries(statuses)) {
        if (key.startsWith('epic-')) continue;
        if (status === 'done') storyEntries.push({ key, status: 'done' });
        else if (status === 'checked') storyEntries.push({ key, status: 'checked' });
        else if (status === 'in-progress') storyEntries.push({ key, status: 'in-progress' });
        else if (status === 'backlog' || status === 'ready-for-dev') storyEntries.push({ key, status: 'pending' });
        else if (status === 'failed') storyEntries.push({ key, status: 'failed' });
      }
      renderer.updateStories(storyEntries);

      const onEvent = (event: EngineEvent): void => {
        if (event.type === 'stream-event' && event.streamEvent) {
          renderer.update(event.streamEvent, event.driverName);
        }
        if (event.type === 'workflow-viz' && event.vizString !== undefined) {
          renderer.updateWorkflowRow(event.vizString);
        }
        if (event.type === 'dispatch-start') {
          renderer.updateSprintState({ storyKey: toDisplayKey(event.storyKey), phase: event.taskName, done: storiesDone, total: counts.total, totalCost: totalCostUsd });
          // Gate tasks use namespaced keys like "27-4-foo:quality" — resolve to base for story list
          const baseKey = toBaseStoryKey(event.storyKey);
          const idx = storyEntries.findIndex(s => s.key === baseKey);
          if (idx >= 0 && storyEntries[idx].status === 'pending') {
            storyEntries[idx] = { ...storyEntries[idx], status: 'in-progress' };
            updateStoryStatus(baseKey, 'in-progress');
            renderer.updateStories([...storyEntries]);
          }
        }
        if (event.type === 'dispatch-end') {
          totalCostUsd += event.costUsd ?? 0;
          renderer.updateSprintState({ totalCost: totalCostUsd });
          if (event.taskName === 'verify' && event.storyKey.startsWith('__epic_')) {
            renderer.addMessage({ type: 'ok', key: event.storyKey.replace('__epic_', 'Epic ').replace('__', ''), message: `verification complete (cost: $${(event.costUsd ?? 0).toFixed(2)})` });
          }
        }
        if (event.type === 'dispatch-error') {
          const baseErrorKey = toBaseStoryKey(event.storyKey);
          const isGateError = event.storyKey.includes(':'); // gate errors are recoverable
          renderer.addMessage({ type: isGateError ? 'warn' : 'fail', key: baseErrorKey, message: `[${event.taskName}] ${event.error?.message ?? 'unknown error'}` });
          if (!isGateError) {
            updateStoryStatus(baseErrorKey, 'failed');
            const idx = storyEntries.findIndex(s => s.key === baseErrorKey);
            if (idx >= 0) { storyEntries[idx] = { ...storyEntries[idx], status: 'failed' }; renderer.updateStories([...storyEntries]); }
          }
        }
        if (event.type === 'story-done') {
          // Mark as 'checked' (passed quality gate) — sprint-level verify promotes to 'done'
          updateStoryStatus(event.storyKey, 'checked');
          const idx = storyEntries.findIndex(s => s.key === event.storyKey);
          if (idx >= 0) { storyEntries[idx] = { ...storyEntries[idx], status: 'checked' }; renderer.updateStories([...storyEntries]); }
        }
      };

      const config: EngineConfig = {
        workflow: parsedWorkflow,
        agents,
        sprintStatusPath: join(projectDir, '_bmad-output', 'implementation-artifacts', 'sprint-status.yaml'),
        issuesPath: join(projectDir, '.codeharness', 'issues.yaml'),
        runId: `run-${Date.now()}`,
        projectDir,
        abortSignal: abortController.signal,
        maxIterations,
        onEvent,
      };

      const execution = parsedWorkflow.execution;
      const isParallel = execution?.epic_strategy === 'parallel';

      if (isParallel) {
        try {
          const maxParallel = execution.max_parallel ?? 1;
          const stateResult = getSprintState();
          if (!stateResult.success) {
            cleanupResources();
            fail(`Failed to read sprint state for epic discovery: ${stateResult.error}`, outputOpts);
            process.exitCode = 1;
            return;
          }
          const epics = buildEpicDescriptors(stateResult.data);
          if (epics.length === 0) {
            cleanupResources();
            info('No pending epics found — nothing to execute in parallel mode', outputOpts);
            return;
          }
          const worktreeManager = new WorktreeManager();
          const pool = new LanePool(worktreeManager, maxParallel);

          pool.onEvent((event: LaneEvent) => {
            if (event.type === 'lane-started') info(`[LANE] Started epic ${event.epicId} in lane ${event.laneIndex}`, outputOpts);
            else if (event.type === 'lane-completed') ok(`[LANE] Epic ${event.epicId} completed in lane ${event.laneIndex}`, outputOpts);
            else if (event.type === 'lane-failed') fail(`[LANE] Epic ${event.epicId} failed in lane ${event.laneIndex}: ${event.error}`, outputOpts);
            else if (event.type === 'epic-queued') info(`[LANE] Epic ${event.epicId} queued for execution`, outputOpts);
          });

          const executeFn: ExecuteEpicFn = async (_epicId: string, worktreePath: string) =>
            runWorkflowActor({ ...config, projectDir: worktreePath });

          const poolResult = await pool.startPool(epics, executeFn);

          const remainingWorktrees = worktreeManager.listWorktrees();
          if (remainingWorktrees.length > 0) {
            info(`[WARN] ${remainingWorktrees.length} worktree(s) still exist after pool completion`, outputOpts);
            for (const wt of remainingWorktrees) {
              info(`  - ${wt.path} (epic ${wt.epicId})`, outputOpts);
            }
          }

          let totalStories = 0;
          for (const [, epicResult] of poolResult.epicResults) {
            if (epicResult.engineResult) totalStories += epicResult.engineResult.storiesProcessed;
          }

          const succeeded = [...poolResult.epicResults.values()].filter(r => r.status === 'completed').length;
          const failed = [...poolResult.epicResults.values()].filter(r => r.status === 'failed').length;

          cleanupResources();

          if (poolResult.success) {
            ok(`Parallel execution completed — ${poolResult.epicsProcessed} epics (${succeeded} succeeded), ${totalStories} stories processed in ${formatElapsed(poolResult.durationMs)}`, outputOpts);
          } else {
            fail(`Parallel execution failed — ${poolResult.epicsProcessed} epics (${succeeded} succeeded, ${failed} failed), ${totalStories} stories processed in ${formatElapsed(poolResult.durationMs)}`, outputOpts);
            for (const [epicId, epicResult] of poolResult.epicResults) {
              if (epicResult.status === 'failed') info(`  Epic ${epicId}: ${epicResult.error}`, outputOpts);
            }
            process.exitCode = 1;
          }
        } catch (err: unknown) {
          cleanupResources();
          const msg = err instanceof Error ? err.message : String(err);
          fail(`Parallel execution error: ${msg}`, outputOpts);
          process.exitCode = 1;
        }
      } else {
        try {
          const result = await runWorkflowActor(config);
          cleanupResources();

          if (interrupted) {
            info(`Interrupted — ${result.storiesProcessed} stories processed, ${result.tasksCompleted} tasks completed, $${totalCostUsd.toFixed(2)} spent. State saved — run again to resume.`, outputOpts);
            process.exitCode = 130;
          } else if (result.success) {
            ok(`Workflow completed — ${result.storiesProcessed} stories processed, ${result.tasksCompleted} tasks completed, $${totalCostUsd.toFixed(2)} spent in ${formatElapsed(result.durationMs)}`, outputOpts);
          } else {
            fail(`Workflow failed — ${result.storiesProcessed} stories processed, ${result.tasksCompleted} tasks completed, $${totalCostUsd.toFixed(2)} spent, ${result.errors.length} error(s) in ${formatElapsed(result.durationMs)}`, outputOpts);
            for (const err of result.errors) {
              info(`  ${err.taskName}/${err.storyKey}: [${err.code}] ${err.message}`, outputOpts);
            }
            process.exitCode = 1;
          }
        } catch (err: unknown) {
          cleanupResources();
          const msg = err instanceof Error ? err.message : String(err);
          fail(`Workflow engine error: ${msg}`, outputOpts);
          process.exitCode = 1;
        }
      }
    });
}
