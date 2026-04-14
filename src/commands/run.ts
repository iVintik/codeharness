import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { fail, info, ok } from '../lib/output.js';
import { isDockerAvailable } from '../lib/docker/index.js';
import { cleanupContainers } from '../modules/infra/index.js';
import { readSprintStatusFromState, reconcileState, updateStoryStatus } from '../modules/sprint/index.js';
import { countStories, formatElapsed } from '../lib/run-helpers.js';
import { resolveWorkflow } from '../lib/workflow-parser.js';
import { resolveAgent, compileSubagentDefinition } from '../lib/agent-resolver.js';
import { readWorkflowState, writeWorkflowState } from '../lib/workflow-state.js';
import { startRenderer } from '../lib/ink-renderer.js';
import { inferExecutionScope } from '../lib/workflow-target.js';
import { generateFlowWorkflow } from '../lib/workflow-generator.js';
import { runFlowWorkflow } from '../lib/flow-bridge.js';
import type { EngineEvent } from '../lib/workflow-types.js';
import type { SubagentDefinition } from '../lib/agent-resolver.js';

/** Resolves the plugin directory path (.claude/ in project root). */
export function resolvePluginDir(): string { return join(process.cwd(), '.claude'); }

// Re-export helpers that tests import from run.ts
export { countStories } from '../lib/run-helpers.js';

/** Extract the numeric epic ID prefix from a story key (e.g. "17-1-foo" → "17"). */
export function extractEpicId(storyKey: string): string {
  const match = storyKey.match(/^(\d+)-/);
  return match ? match[1] : storyKey;
}

/** Translate sentinel story keys to readable display names. */
function toDisplayKey(storyKey: string, targetScope?: 'story' | 'epic' | 'run'): string {
  const scope = targetScope ?? inferExecutionScope(storyKey);
  if (scope === 'epic' && storyKey.startsWith('__epic_')) return `Epic ${storyKey.replace('__epic_', '').replace('__', '')}`;
  if (scope === 'run') return 'Run';
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
    .option('--timeout <seconds>', 'Total loop timeout in seconds', '43200')
    .option('--quiet', 'Suppress terminal output (background mode)', false)
    .option('--reset', 'Clear retry counters, flagged stories, and circuit breaker before starting', false)
    .option('--resume', 'Resume from last checkpoint', false)
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

      const timeout = parseInt(options.timeout, 10);
      if (isNaN(timeout)) {
        fail('Invalid --timeout value — must be a number', outputOpts);
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
        const msg = err instanceof Error ? err.message : String(err);
        fail(`Failed to resolve workflow: ${msg}`, outputOpts);
        process.exitCode = 1;
        return;
      }

      // Resolve agents for validation (dispatch/gate commands re-resolve at runtime)
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
          writeWorkflowState({ ...currentState, phase: 'idle', circuit_breaker: { ...currentState.circuit_breaker, triggered: false, reason: null } }, projectDir);
          info('Resuming after circuit breaker — previous findings preserved', outputOpts);
        }
      }

      // Generate flow workflow from codeharness DSL + work items
      const runId = `run-${Date.now()}`;
      const sprintStatusPath = join(projectDir, '_bmad-output', 'implementation-artifacts', 'sprint-status.yaml');
      const issuesPath = join(projectDir, '.codeharness', 'issues.yaml');

      const flowWorkflow = generateFlowWorkflow({
        workflow: parsedWorkflow,
        sprintStatusPath,
        issuesPath,
        runId,
        projectDir,
        workflowName,
      });

      info(`Generated ${flowWorkflow.steps.length} flow steps for ${workflowName} workflow`, outputOpts);

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
      const storiesDone = counts.done;

      const cleanupResources = (): void => {
        process.removeListener('SIGINT', onInterrupt);
        process.removeListener('SIGTERM', onInterrupt);
        renderer.cleanup();
      };

      // Build initial story list for renderer
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
        if (event.type === 'dispatch-start') {
          renderer.updateSprintState({ storyKey: toDisplayKey(event.storyKey, event.targetScope), phase: event.taskName, done: storiesDone, total: counts.total, totalCost: totalCostUsd });
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
        }
        if (event.type === 'dispatch-error') {
          const baseErrorKey = toBaseStoryKey(event.storyKey);
          const isGateError = event.storyKey.includes(':');
          renderer.addMessage({ type: isGateError ? 'warn' : 'fail', key: baseErrorKey, message: `[${event.taskName}] ${event.error?.message ?? 'unknown error'}` });
          if (!isGateError) {
            updateStoryStatus(baseErrorKey, 'failed');
            const idx = storyEntries.findIndex(s => s.key === baseErrorKey);
            if (idx >= 0) { storyEntries[idx] = { ...storyEntries[idx], status: 'failed' }; renderer.updateStories([...storyEntries]); }
          }
        }
        if (event.type === 'story-done') {
          updateStoryStatus(event.storyKey, 'checked');
          const idx = storyEntries.findIndex(s => s.key === event.storyKey);
          if (idx >= 0) { storyEntries[idx] = { ...storyEntries[idx], status: 'checked' }; renderer.updateStories([...storyEntries]); }
        }
      };

      try {
        const result = await runFlowWorkflow({
          workflow: flowWorkflow,
          cwd: projectDir,
          onEvent,
          abortSignal: abortController.signal,
          parallelism: parsedWorkflow.execution?.max_parallel ?? 1,
          timeoutMs: timeout * 1000,
        });

        cleanupResources();

        if (interrupted) {
          info(`Interrupted — ${result.tasksCompleted} tasks completed, $${totalCostUsd.toFixed(2)} spent. Flow state preserved — run again to resume.`, outputOpts);
          process.exitCode = 130;
        } else if (result.success) {
          ok(`Workflow completed — ${result.tasksCompleted} tasks completed, $${totalCostUsd.toFixed(2)} spent in ${formatElapsed(result.durationMs)}`, outputOpts);
        } else {
          const haltSuffix = result.haltReason ? ` [${result.haltReason}]` : '';
          fail(`Workflow failed${haltSuffix} — ${result.tasksCompleted} tasks completed, $${totalCostUsd.toFixed(2)} spent, ${result.errors.length} error(s) in ${formatElapsed(result.durationMs)}`, outputOpts);
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
    });
}
