import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { fail, info, ok } from '../lib/output.js';
import { isDockerAvailable } from '../lib/docker/index.js';
import { cleanupContainers } from '../modules/infra/index.js';
import { getSprintState, readSprintStatusFromState, reconcileState } from '../modules/sprint/index.js';
import { countStories, formatElapsed } from '../lib/run-helpers.js';
import { parseWorkflow, resolveWorkflow } from '../lib/workflow-parser.js';
import { resolveAgent, compileSubagentDefinition } from '../lib/agent-resolver.js';
import { executeWorkflow } from '../lib/workflow-engine.js';
import { readWorkflowState, writeWorkflowState } from '../lib/workflow-state.js';
import { WorktreeManager } from '../lib/worktree-manager.js';
import { LanePool } from '../lib/lane-pool.js';
import { startRenderer } from '../lib/ink-renderer.js';
import type { EpicDescriptor, ExecuteEpicFn, LaneEvent } from '../lib/lane-pool.js';
import type { EngineConfig, EngineEvent } from '../lib/workflow-engine.js';
import type { SubagentDefinition } from '../lib/agent-resolver.js';
import type { SprintState } from '../types/state.js';

/** Resolves the plugin directory path (.claude/ in project root). */
export function resolvePluginDir(): string {
  return join(process.cwd(), '.claude');
}

// Re-export helpers that tests import from run.ts
export { countStories } from '../lib/run-helpers.js';

/**
 * Extract the epic ID from a story key.
 * Story keys follow the pattern `{epicId}-{storyNum}-{slug}`,
 * e.g. `17-1-foo` -> epic `17`, `17-2-bar` -> epic `17`.
 */
export function extractEpicId(storyKey: string): string {
  const match = storyKey.match(/^(\d+)-/);
  return match ? match[1] : storyKey;
}

/**
 * Build EpicDescriptor[] from sprint state.
 * Groups stories by epic ID, filters out epics with status 'done',
 * and returns descriptors sorted by epic ID.
 */
export function buildEpicDescriptors(state: SprintState): EpicDescriptor[] {
  const epicMap = new Map<string, string[]>();
  for (const storyKey of Object.keys(state.stories)) {
    const epicId = extractEpicId(storyKey);
    if (!epicMap.has(epicId)) epicMap.set(epicId, []);
    epicMap.get(epicId)!.push(storyKey);
  }

  return [...epicMap.entries()]
    .filter(([epicId]) => {
      const epicState = state.epics[`epic-${epicId}`];
      return !epicState || epicState.status !== 'done';
    })
    .map(([epicId, stories]) => ({
      id: epicId,
      slug: `epic-${epicId}`,
      stories,
    }));
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

      // 1c. Docker pre-flight: fail fast if Docker unavailable
      if (!isDockerAvailable()) {
        fail('[FAIL] Docker not available — install Docker or start the daemon', outputOpts);
        process.exitCode = 1;
        return;
      }
      // 1d. Orphan container cleanup (best-effort — failures warn but don't abort)
      const cleanup = cleanupContainers();
      if (cleanup.success && cleanup.data.containersRemoved > 0) {
        info(`[INFO] Cleaned up ${cleanup.data.containersRemoved} orphaned container(s): ${cleanup.data.names.join(', ')}`, outputOpts);
      } else if (!cleanup.success) {
        info(`[WARN] Container cleanup failed: ${cleanup.error}`, outputOpts);
      }
      // 2. Read sprint status for story count (from sprint-state.json)
      const statuses = readSprintStatusFromState();
      const counts = countStories(statuses);

      if (counts.total === 0) {
        fail('No stories found in sprint-state.json — nothing to execute', outputOpts);
        process.exitCode = 1;
        return;
      }

      if (counts.ready === 0) {
        fail('No stories ready for execution', outputOpts);
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

      // 4. Resolve workflow (embedded -> user patch -> project patch)
      const projectDir = process.cwd();
      const workflowName = options.workflow ?? 'default';

      // Validate workflow name: only alphanumeric, hyphens, underscores allowed
      if (!/^[a-zA-Z0-9_-]+$/.test(workflowName)) {
        fail(`Invalid workflow name "${workflowName}" — only alphanumeric characters, hyphens, and underscores are allowed`, outputOpts);
        process.exitCode = 1;
        return;
      }

      let parsedWorkflow;
      try {
        parsedWorkflow = resolveWorkflow({ cwd: projectDir, name: workflowName });
      } catch (err: unknown) {
        // Fallback: try direct file parsing for backward compatibility (only for default)
        if (workflowName !== 'default') {
          const msg = err instanceof Error ? err.message : String(err);
          fail(`Failed to resolve workflow: ${msg}`, outputOpts);
          process.exitCode = 1;
          return;
        }
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

      // 5. Resolve agents referenced in workflow
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

      // 6. Handle --resume: reset completed or circuit-breaker state so the engine re-enters execution
      if (options.resume) {
        const currentState = readWorkflowState(projectDir);
        if (currentState.phase === 'completed') {
          writeWorkflowState({ ...currentState, phase: 'idle' }, projectDir);
          info('Resuming from completed state — phase reset to idle', outputOpts);
        } else if (currentState.phase === 'circuit-breaker') {
          writeWorkflowState({
            ...currentState,
            phase: 'idle',
            circuit_breaker: {
              ...currentState.circuit_breaker,
              triggered: false,
              reason: null,
              // score_history is PRESERVED
            },
          }, projectDir);
          info('Resuming after circuit breaker — previous findings preserved', outputOpts);
        }
      }

      // 7. Start TUI renderer and abort controller for graceful shutdown
      const abortController = new AbortController();
      let interrupted = false;
      let renderer: ReturnType<typeof startRenderer>;

      const onInterrupt = () => {
        if (interrupted) {
          process.exit(1); // Second interrupt: force exit
        }
        interrupted = true;
        renderer.cleanup();
        abortController.abort();
        info('Interrupted — waiting for current task to finish...', outputOpts);
      };

      renderer = startRenderer({
        quiet: !!options.quiet || isJson,
        sprintState: {
          storyKey: '',
          phase: 'executing',
          done: counts.done,
          total: counts.total,
          totalCost: 0,
        },
        onQuit: () => onInterrupt(),
      });

      process.on('SIGINT', onInterrupt);
      process.on('SIGTERM', onInterrupt);


      // 7b. Build TUI event bridge — tracks cumulative state across dispatches
      const sessionStartMs = Date.now();
      let totalCostUsd = 0;
      let storiesDone = counts.done;
      let currentStoryKey = '';
      let currentTaskName = '';

      // Periodic header refresh (elapsed time, story status) — like the old 5s interval
      const headerRefresh = setInterval(() => {
        if (interrupted) return;
        const epicId = currentStoryKey ? extractEpicId(currentStoryKey) : '';
        const epic = epicId ? epicData[epicId] : undefined;
        renderer.updateSprintState({
          storyKey: currentStoryKey,
          phase: currentTaskName,
          done: storiesDone,
          total: counts.total,
          totalCost: totalCostUsd,
          elapsed: formatElapsed(Date.now() - sessionStartMs),
          epicId: epicId || undefined,
          epicStoriesDone: epic?.storiesDone,
          epicStoriesTotal: epic?.storiesTotal,
        });
      }, 2_000);
      // Load epic data for TUI context
      const epicData: Record<string, { title?: string; storiesDone: number; storiesTotal: number }> = {};
      const sprintStateResult = getSprintState();
      if (sprintStateResult.success) {
        for (const [epicKey, epic] of Object.entries(sprintStateResult.data.epics ?? {})) {
          const epicId = epicKey.replace('epic-', '');
          epicData[epicId] = { storiesDone: (epic as { storiesDone?: number }).storiesDone ?? 0, storiesTotal: (epic as { storiesTotal?: number }).storiesTotal ?? 0 };
        }
      }

      // Track task states with flow-position awareness.
      // Pre-loop tasks use their name directly. Loop tasks use 'loop:taskName'.
      // This prevents loop iterations from overwriting pre-loop completion status.
      const preLoopTasks = new Set<string>();
      const loopTasks = new Set<string>();
      for (const step of parsedWorkflow.flow) {
        if (typeof step === 'string') {
          preLoopTasks.add(step);
        } else if (typeof step === 'object' && 'loop' in step) {
          for (const lt of (step as { loop: string[] }).loop) loopTasks.add(lt);
        }
      }
      // Post-loop tasks (like retro) are treated as pre-loop for state purposes
      let pastLoop = false;
      for (const step of parsedWorkflow.flow) {
        if (typeof step === 'object' && 'loop' in step) { pastLoop = true; continue; }
        if (pastLoop && typeof step === 'string') preLoopTasks.add(step);
      }

      let inLoop = false; // tracks whether engine is inside the loop
      const taskStates: Record<string, 'pending' | 'active' | 'done' | 'failed'> = {};
      const taskMeta: Record<string, { driver?: string; costUsd?: number | null; elapsedMs?: number | null }> = {};
      // Initialize all flow positions as pending
      for (const [tn, task] of Object.entries(parsedWorkflow.tasks)) {
        taskStates[tn] = 'pending';
        if (loopTasks.has(tn)) taskStates[`loop:${tn}`] = 'pending';
        const driverLabel = task.model ?? task.driver ?? 'claude-code';
        taskMeta[tn] = { driver: driverLabel };
        if (loopTasks.has(tn)) taskMeta[`loop:${tn}`] = { driver: driverLabel };
      }
      // Build initial story list from sprint status (Record<string, string>: key → status)
      const storyEntries: Array<{ key: string; status: 'done' | 'in-progress' | 'pending' | 'failed' }> = [];
      for (const [key, status] of Object.entries(statuses)) {
        if (key.startsWith('epic-')) continue; // skip epic-level entries
        if (status === 'done') storyEntries.push({ key, status: 'done' });
        else if (status === 'in-progress') storyEntries.push({ key, status: 'in-progress' });
        else if (status === 'backlog' || status === 'ready-for-dev') storyEntries.push({ key, status: 'pending' });
        else if (status === 'failed') storyEntries.push({ key, status: 'failed' });
      }
      renderer.updateStories(storyEntries);

      const onEvent = (event: EngineEvent): void => {
        if (event.type === 'stream-event' && event.streamEvent) {
          renderer.update(event.streamEvent, event.driverName);
        }
        if (event.type === 'dispatch-start') {
          // Detect new story: reset all task states for fresh pipeline display
          if (event.storyKey !== currentStoryKey && preLoopTasks.has(event.taskName)) {
            inLoop = false;
            for (const tn of Object.keys(taskStates)) {
              taskStates[tn] = 'pending';
            }
          }
          currentStoryKey = event.storyKey;
          currentTaskName = event.taskName;
          // Detect loop entry: if task is in loopTasks and pre-loop version is done
          if (loopTasks.has(event.taskName) && taskStates[event.taskName] === 'done') {
            inLoop = true;
          }
          const stateKey = inLoop && loopTasks.has(event.taskName) ? `loop:${event.taskName}` : event.taskName;
          const epicId = extractEpicId(event.storyKey);
          const epic = epicData[epicId];
          renderer.updateSprintState({
            storyKey: event.storyKey,
            phase: event.taskName,
            done: storiesDone,
            total: counts.total,
            totalCost: totalCostUsd,
            elapsed: formatElapsed(Date.now() - sessionStartMs),
            epicId,
            epicStoriesDone: epic?.storiesDone ?? 0,
            epicStoriesTotal: epic?.storiesTotal ?? 0,
          });
          taskStates[stateKey] = 'active';
          renderer.updateWorkflowState(parsedWorkflow.flow, event.taskName, { ...taskStates }, { ...taskMeta });
          // Mark story as in-progress
          const idx = storyEntries.findIndex(s => s.key === event.storyKey);
          if (idx >= 0 && storyEntries[idx].status === 'pending') {
            storyEntries[idx] = { ...storyEntries[idx], status: 'in-progress' };
            renderer.updateStories([...storyEntries]);
          }
        }
        if (event.type === 'dispatch-end') {
          totalCostUsd += event.costUsd ?? 0;
          const stateKey = inLoop && loopTasks.has(event.taskName) ? `loop:${event.taskName}` : event.taskName;
          taskStates[stateKey] = 'done';
          taskMeta[stateKey] = {
            ...taskMeta[stateKey],
            costUsd: (taskMeta[stateKey]?.costUsd ?? 0) + (event.costUsd ?? 0),
            elapsedMs: (taskMeta[stateKey]?.elapsedMs ?? 0) + (event.elapsedMs ?? 0),
          };
          renderer.updateWorkflowState(parsedWorkflow.flow, event.taskName, { ...taskStates }, { ...taskMeta });
          // Update header cost
          renderer.updateSprintState({
            storyKey: event.storyKey,
            phase: event.taskName,
            done: storiesDone,
            total: counts.total,
            totalCost: totalCostUsd,
          });
        }
        if (event.type === 'dispatch-error') {
          const stateKey = inLoop && loopTasks.has(event.taskName) ? `loop:${event.taskName}` : event.taskName;
          taskStates[stateKey] = 'failed';
          renderer.updateWorkflowState(parsedWorkflow.flow, event.taskName, { ...taskStates }, { ...taskMeta });
          renderer.addMessage({
            type: 'fail',
            key: event.storyKey,
            message: `[${event.taskName}] ${event.error?.message ?? 'unknown error'}`,
          });
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
        storyPipeline: true,
        maxIterations,
        onEvent,
      };

      // 8. Branch: parallel vs sequential execution
      const execution = parsedWorkflow.execution;
      const isParallel = execution?.epic_strategy === 'parallel';

      if (isParallel) {
        // --- Parallel execution path (AC #1, #2, #4, #5, #9, #12) ---
        try {
          const maxParallel = execution.max_parallel ?? 1;

          // Get sprint state for epic discovery (AC #3)
          const stateResult = getSprintState();
          if (!stateResult.success) {
            fail(`Failed to read sprint state for epic discovery: ${stateResult.error}`, outputOpts);
            process.exitCode = 1;
            return;
          }

          const epics = buildEpicDescriptors(stateResult.data);
          if (epics.length === 0) {
            info('No pending epics found — nothing to execute in parallel mode', outputOpts);
            return;
          }

          // Create worktree manager and lane pool (AC #2, #12)
          // Parallel mode always uses worktree isolation regardless of execution.isolation
          const worktreeManager = new WorktreeManager();
          const pool = new LanePool(worktreeManager, maxParallel);

          // Register lane event logging (AC #10)
          pool.onEvent((event: LaneEvent) => {
            switch (event.type) {
              case 'lane-started':
                info(`[LANE] Started epic ${event.epicId} in lane ${event.laneIndex}`, outputOpts);
                break;
              case 'lane-completed':
                ok(`[LANE] Epic ${event.epicId} completed in lane ${event.laneIndex}`, outputOpts);
                break;
              case 'lane-failed':
                fail(`[LANE] Epic ${event.epicId} failed in lane ${event.laneIndex}: ${event.error}`, outputOpts);
                break;
              case 'epic-queued':
                info(`[LANE] Epic ${event.epicId} queued for execution`, outputOpts);
                break;
            }
          });

          // Define executeFn: runs engine in worktree (AC #4, #5)
          const executeFn: ExecuteEpicFn = async (_epicId: string, worktreePath: string) => {
            const epicConfig: EngineConfig = {
              ...config,
              projectDir: worktreePath,
            };
            return executeWorkflow(epicConfig);
          };

          // Start the pool (AC #9: max_parallel=1 still runs through pool)
          const poolResult = await pool.startPool(epics, executeFn);

          // Safety net: check for remaining worktrees (AC #11)
          const remainingWorktrees = worktreeManager.listWorktrees();
          if (remainingWorktrees.length > 0) {
            info(`[WARN] ${remainingWorktrees.length} worktree(s) still exist after pool completion`, outputOpts);
            for (const wt of remainingWorktrees) {
              info(`  - ${wt.path} (epic ${wt.epicId})`, outputOpts);
            }
          }

          // Report results (AC #7)
          let totalStories = 0;
          for (const [, epicResult] of poolResult.epicResults) {
            if (epicResult.engineResult) {
              totalStories += epicResult.engineResult.storiesProcessed;
            }
          }

          const succeeded = [...poolResult.epicResults.values()].filter(r => r.status === 'completed').length;
          const failed = [...poolResult.epicResults.values()].filter(r => r.status === 'failed').length;

          if (poolResult.success) {
            ok(`Parallel execution completed — ${poolResult.epicsProcessed} epics (${succeeded} succeeded), ${totalStories} stories processed in ${formatElapsed(poolResult.durationMs)}`, outputOpts);
          } else {
            fail(`Parallel execution failed — ${poolResult.epicsProcessed} epics (${succeeded} succeeded, ${failed} failed), ${totalStories} stories processed in ${formatElapsed(poolResult.durationMs)}`, outputOpts);
            for (const [epicId, epicResult] of poolResult.epicResults) {
              if (epicResult.status === 'failed') {
                info(`  Epic ${epicId}: ${epicResult.error}`, outputOpts);
              }
            }
            process.exitCode = 1;
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          fail(`Parallel execution error: ${msg}`, outputOpts);
          process.exitCode = 1;
        }
      } else {
        // --- Sequential execution path (AC #8) — existing single-engine behavior ---
        try {
          const result = await executeWorkflow(config);
          clearInterval(headerRefresh);
          process.removeListener('SIGINT', onInterrupt);
          process.removeListener('SIGTERM', onInterrupt);
          renderer.cleanup();

          if (interrupted) {
            info(`Interrupted — ${result.storiesProcessed} stories processed, ${result.tasksCompleted} tasks completed. State saved — run again to resume.`, outputOpts);
            process.exitCode = 130;
          } else if (result.success) {
            ok(`Workflow completed — ${result.storiesProcessed} stories processed, ${result.tasksCompleted} tasks completed in ${formatElapsed(result.durationMs)}`, outputOpts);
          } else {
            fail(`Workflow failed — ${result.storiesProcessed} stories processed, ${result.tasksCompleted} tasks completed, ${result.errors.length} error(s) in ${formatElapsed(result.durationMs)}`, outputOpts);
            for (const err of result.errors) {
              info(`  ${err.taskName}/${err.storyKey}: [${err.code}] ${err.message}`, outputOpts);
            }
            process.exitCode = 1;
          }
        } catch (err: unknown) {
          clearInterval(headerRefresh);
          renderer.cleanup();
          const msg = err instanceof Error ? err.message : String(err);
          fail(`Workflow engine error: ${msg}`, outputOpts);
          process.exitCode = 1;
        }
      }
    });
}
