import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { fail, info, ok } from '../lib/output.js';
import { isDockerAvailable } from '../lib/docker/index.js';
import { cleanupContainers } from '../modules/infra/index.js';
import { readSprintStatusFromState, reconcileState } from '../modules/sprint/index.js';
import { countStories, formatElapsed } from '../lib/run-helpers.js';
import { parseWorkflow } from '../lib/workflow-parser.js';
import { resolveAgent, compileSubagentDefinition } from '../lib/agent-resolver.js';
import { executeWorkflow } from '../lib/workflow-engine.js';
import { readWorkflowState, writeWorkflowState } from '../lib/workflow-state.js';
import type { EngineConfig } from '../lib/workflow-engine.js';
import type { SubagentDefinition } from '../lib/agent-resolver.js';

/** Resolves the plugin directory path (.claude/ in project root). */
export function resolvePluginDir(): string {
  return join(process.cwd(), '.claude');
}

// Re-export helpers that tests import from run.ts
export { countStories } from '../lib/run-helpers.js';

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

      // 4. Parse workflow YAML
      const projectDir = process.cwd();
      const projectWorkflowPath = join(projectDir, '.codeharness', 'workflows', 'default.yaml');
      const templateWorkflowPath = join(projectDir, 'templates', 'workflows', 'default.yaml');
      const workflowPath = existsSync(projectWorkflowPath) ? projectWorkflowPath : templateWorkflowPath;

      let parsedWorkflow;
      try {
        parsedWorkflow = parseWorkflow(workflowPath);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        fail(`Failed to parse workflow: ${msg}`, outputOpts);
        process.exitCode = 1;
        return;
      }

      // 5. Resolve agents referenced in workflow
      const agents: Record<string, SubagentDefinition> = {};
      try {
        for (const [, task] of Object.entries(parsedWorkflow.tasks)) {
          if (!agents[task.agent]) {
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

      // 7. Build EngineConfig and execute
      const config: EngineConfig = {
        workflow: parsedWorkflow,
        agents,
        sprintStatusPath: join(projectDir, '_bmad-output', 'implementation-artifacts', 'sprint-status.yaml'),
        issuesPath: join(projectDir, '.codeharness', 'issues.yaml'),
        runId: `run-${Date.now()}`,
        projectDir,
        maxIterations,
      };

      try {
        const result = await executeWorkflow(config);

        if (result.success) {
          ok(`Workflow completed — ${result.storiesProcessed} stories processed, ${result.tasksCompleted} tasks completed in ${formatElapsed(result.durationMs)}`, outputOpts);
        } else {
          fail(`Workflow failed — ${result.storiesProcessed} stories processed, ${result.tasksCompleted} tasks completed, ${result.errors.length} error(s) in ${formatElapsed(result.durationMs)}`, outputOpts);
          for (const err of result.errors) {
            info(`  ${err.taskName}/${err.storyKey}: [${err.code}] ${err.message}`, outputOpts);
          }
          process.exitCode = 1;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        fail(`Workflow engine error: ${msg}`, outputOpts);
        process.exitCode = 1;
      }
    });
}
