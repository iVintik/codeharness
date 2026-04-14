/**
 * `codeharness gate` — run a single gate evaluation iteration.
 *
 * Called by flow: `codeharness gate --name quality --key 17-1-foo`
 *
 * One invocation = one check→evaluate→fix cycle. Flow's outer `retry:`
 * handles re-invocation for retry attempts.
 *
 * Execution model:
 * - The gate builds an ephemeral flow workflow containing the check tasks
 *   as native `agent:` steps, invokes flow's executeWorkflow via library
 *   import, reads each check's stdout from the captured outputs, evaluates
 *   consensus, and (on fail) runs the fix tasks the same way.
 *
 * Exit codes:
 *   0 — gate passed
 *   1 — gate failed, fix tasks ran (flow will retry)
 *   2 — circuit breaker triggered (non-retryable, but flow will still retry)
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { fail, info, warn } from '../lib/output.js';
import { resolveWorkflow } from '../lib/workflow-parser.js';
import { resolveAgent, compileSubagentDefinition } from '../lib/agent-resolver.js';
import { readWorkflowState, writeWorkflowState } from '../lib/workflow-state.js';
import { parseVerdict } from '../lib/verdict-parser.js';
import { evaluateMetricsProgress } from '../lib/circuit-breaker.js';
import { isGateConfig } from '../lib/workflow-types.js';
import { runFlowWorkflow, type CapturedStepOutput } from '../lib/flow-bridge.js';
import { normalizeExecutionTarget } from '../lib/workflow-target.js';
import { buildTaskPrompt } from '../lib/workflow-constants.js';
import type { GateConfig, FlowStep, ResolvedWorkflow, ResolvedTask } from '../lib/workflow-types.js';
import type { GeneratedWorkflow, GeneratedStep, FlowAgentSpec } from '../lib/workflow-generator.js';
import type { EvaluatorScore } from '../lib/workflow-state.js';
import type { VerdictMetrics } from '../lib/verdict-parser.js';
import type { SubagentDefinition } from '../lib/agent-resolver.js';

// ─── Helpers ────────────────────────────────────────────────────────

/** Gate key = namespaced story key for correlation (e.g. "17-1-foo:quality"). */
function resolveGateKey(storyKey: string, gateName: string): string {
  return storyKey.startsWith('__') ? gateName : `${storyKey}:${gateName}`;
}

function computeScore(verdicts: Record<string, string>, iteration: number): EvaluatorScore {
  let passed = 0; let failed = 0; let unknown = 0;
  for (const v of Object.values(verdicts)) {
    const p = parseVerdict(v);
    passed += p.score.passed;
    failed += p.score.failed;
    unknown += p.score.unknown;
  }
  return { iteration, passed, failed, unknown, total: (passed + failed + unknown) || 1, timestamp: new Date().toISOString() };
}

function mergeMetrics(verdicts: Record<string, string>): VerdictMetrics | null {
  let hasAny = false;
  let testsPassed = 0;
  let testsFailed = 0;
  let lintWarnings = 0;
  let issues = 0;
  for (const output of Object.values(verdicts)) {
    const parsed = parseVerdict(output);
    if (parsed.metrics) {
      hasAny = true;
      testsPassed = Math.max(testsPassed, parsed.metrics.testsPassed);
      testsFailed = Math.max(testsFailed, parsed.metrics.testsFailed);
      lintWarnings += parsed.metrics.lintWarnings;
      issues += parsed.metrics.issues;
    }
  }
  return hasAny ? { testsPassed, testsFailed, lintWarnings, issues } : null;
}

function allPassed(verdicts: Record<string, string>, expectedCount: number): boolean {
  const entries = Object.values(verdicts);
  if (entries.length === 0 || entries.length < expectedCount) return false;
  return entries.every((v) => parseVerdict(v).verdict === 'pass');
}

/** Resolve and cache an agent definition (for append_system_prompt). */
function resolveInstructions(agentName: string | null, projectDir: string, cache: Map<string, string | null>): string | null {
  if (agentName === null) return null;
  if (cache.has(agentName)) return cache.get(agentName) ?? null;
  try {
    const resolved = resolveAgent(agentName, { cwd: projectDir });
    const compiled = compileSubagentDefinition(resolved);
    cache.set(agentName, compiled.instructions);
    return compiled.instructions;
  } catch { // IGNORE: agent may be missing or malformed — fall back to no system prompt
    cache.set(agentName, null);
    return null;
  }
}

/** Build an agent spec from a task definition. */
function buildAgentSpec(
  task: ResolvedTask,
  taskName: string,
  storyKey: string,
  instructions: string | null,
): FlowAgentSpec {
  const provider = task.driver ?? 'opencode';
  if (provider !== 'opencode' && provider !== 'claude-code') {
    throw new Error(`Unsupported provider "${provider}" for gate task "${taskName}"`);
  }
  const target = normalizeExecutionTarget(storyKey);
  const spec: FlowAgentSpec = {
    provider,
    prompt: buildTaskPrompt(taskName, target),
    session: task.session ?? 'fresh',
  };
  if (task.model) spec.model = task.model;
  if (task.source_access !== undefined) spec.source_access = task.source_access;
  if (task.plugins && task.plugins.length > 0) {
    if (provider === 'opencode') spec.plugins = [...task.plugins];
    else spec.allow_tools = [...task.plugins];
  }
  if (instructions) spec.append_system_prompt = instructions;
  return spec;
}

/** Build an ephemeral flow workflow containing a sequence of task steps. */
function buildEphemeralWorkflow(
  name: string,
  taskNames: string[],
  workflow: ResolvedWorkflow,
  storyKey: string,
  projectDir: string,
  instructionsCache: Map<string, string | null>,
): GeneratedWorkflow {
  const steps: GeneratedStep[] = [];

  for (const taskName of taskNames) {
    const task = workflow.tasks[taskName];
    if (!task) {
      warn(`gate: task "${taskName}" not found in workflow, skipping`);
      continue;
    }
    const instructions = resolveInstructions(task.agent, projectDir, instructionsCache);
    const step: GeneratedStep = {
      name: taskName,
      agent: buildAgentSpec(task, taskName, storyKey, instructions),
    };
    if (task.timeout_minutes) step.timeout = `${task.timeout_minutes}m`;
    steps.push(step);
  }

  // Flow requires at least one step
  if (steps.length === 0) {
    steps.push({ name: 'noop', run: 'echo "No tasks configured"' });
  }

  return { name, version: '1.0', steps };
}

/** Recursively find a GateConfig by name in the workflow steps tree. */
function findGateConfig(steps: FlowStep[], gateName: string): GateConfig | null {
  for (const step of steps) {
    if (typeof step === 'object' && step !== null) {
      if (isGateConfig(step) && step.gate === gateName) return step;
      if ('steps' in step && Array.isArray((step as unknown as Record<string, unknown>).steps)) {
        const found = findGateConfig((step as unknown as Record<string, unknown>).steps as FlowStep[], gateName);
        if (found) return found;
      }
    }
  }
  return null;
}

// ─── Command ────────────────────────────────────────────────────────

export function registerGateCommand(program: Command): void {
  program
    .command('gate')
    .description('Run a gate evaluation cycle (called by flow engine)')
    .requiredOption('--name <gate-name>', 'Gate name from workflow definition (e.g. quality, verification)')
    .requiredOption('--key <story-key>', 'Story key or sentinel (__sprint__, __epic_N__)')
    .option('--run-id <id>', 'Parent workflow run ID for correlation', `gate-${Date.now()}`)
    .option('--workflow <name>', 'Workflow name to load', 'default')
    .option('--project-dir <path>', 'Project directory', process.cwd())
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const isJson = !!globalOpts.json;
      const outputOpts = { json: isJson };

      const { name: gateName, key: storyKey, workflow: workflowName, projectDir } = options;

      const pluginDir = join(projectDir, '.claude');
      if (!existsSync(pluginDir)) {
        fail('Plugin directory not found — run codeharness init first', outputOpts);
        process.exitCode = 1;
        return;
      }

      // Load workflow
      let parsedWorkflow;
      try {
        parsedWorkflow = resolveWorkflow({ cwd: projectDir, name: workflowName });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        fail(`Failed to resolve workflow: ${msg}`, outputOpts);
        process.exitCode = 1;
        return;
      }

      // Find gate config across all flow arrays
      const gateConfig = findGateConfig(parsedWorkflow.workflow?.steps ?? [], gateName)
        ?? findGateConfig(parsedWorkflow.storyFlow, gateName)
        ?? findGateConfig(parsedWorkflow.epicFlow, gateName)
        ?? findGateConfig(parsedWorkflow.sprintFlow, gateName);

      if (!gateConfig) {
        fail(`Gate "${gateName}" not found in workflow`, outputOpts);
        process.exitCode = 1;
        return;
      }

      let workflowState = readWorkflowState(projectDir);
      const gateKey = resolveGateKey(storyKey, gateName);
      const instructionsCache = new Map<string, string | null>();

      // ── Phase 1: Run check tasks via ephemeral flow workflow ─────
      const checkWorkflow = buildEphemeralWorkflow(
        `gate-${gateName}-check`,
        gateConfig.check,
        parsedWorkflow,
        gateKey,
        projectDir,
        instructionsCache,
      );

      const checkOutputs: CapturedStepOutput[] = [];
      let checkResult;
      try {
        checkResult = await runFlowWorkflow({
          workflow: checkWorkflow,
          cwd: projectDir,
          parallelism: 1,
          persist: true,
          capturedOutputs: checkOutputs,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        fail(`Gate "${gateName}" check phase failed: ${msg}`, outputOpts);
        process.exitCode = 1;
        return;
      }

      // Build verdicts map from captured step outputs
      const verdicts: Record<string, string> = {};
      for (const out of checkOutputs) {
        verdicts[out.name] = out.stdout ?? '';
      }

      if (!checkResult.success && Object.keys(verdicts).length === 0) {
        fail(`Gate "${gateName}" check phase failed before any task produced output`, outputOpts);
        process.exitCode = 1;
        return;
      }

      // ── Phase 2: Evaluate verdicts + circuit breaker ─────────────
      const newIteration = workflowState.iteration + 1;
      const score = computeScore(verdicts, newIteration);
      const newScores = [...workflowState.evaluator_scores, score];

      const iterationMetrics = mergeMetrics(verdicts);
      const metricsHistory: Array<VerdictMetrics | null> = [
        ...workflowState.evaluator_scores.map(() => null),
        iterationMetrics,
      ];
      const cbDecision = evaluateMetricsProgress(metricsHistory);

      workflowState = {
        ...workflowState,
        iteration: newIteration,
        evaluator_scores: newScores,
        circuit_breaker: cbDecision.halt
          ? { triggered: true, reason: cbDecision.reason, score_history: newScores.map((s) => s.passed) }
          : workflowState.circuit_breaker,
      };
      writeWorkflowState(workflowState, projectDir);

      // Pass?
      if (allPassed(verdicts, gateConfig.check.length)) {
        if (isJson) {
          info(JSON.stringify({ status: 'passed', gate: gateName, key: storyKey, iteration: newIteration, score }), outputOpts);
        } else {
          info(`Gate "${gateName}" passed (iteration ${newIteration})`, outputOpts);
        }
        process.exitCode = 0;
        return;
      }

      // Circuit breaker → non-retryable failure
      if (cbDecision.halt) {
        fail(`Gate "${gateName}" halted by circuit breaker: ${cbDecision.reason}`, outputOpts);
        process.exitCode = 2;
        return;
      }

      // ── Phase 3: Run fix tasks via ephemeral flow workflow ───────
      if (gateConfig.fix.length > 0) {
        const fixWorkflow = buildEphemeralWorkflow(
          `gate-${gateName}-fix`,
          gateConfig.fix,
          parsedWorkflow,
          gateKey,
          projectDir,
          instructionsCache,
        );

        try {
          await runFlowWorkflow({
            workflow: fixWorkflow,
            cwd: projectDir,
            parallelism: 1,
            persist: true,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          warn(`Gate "${gateName}" fix phase failed: ${msg}`);
        }
      }

      if (isJson) {
        info(JSON.stringify({ status: 'failed', gate: gateName, key: storyKey, iteration: newIteration, score }), outputOpts);
      } else {
        fail(`Gate "${gateName}" failed (iteration ${newIteration}) — fix tasks executed`, outputOpts);
      }
      process.exitCode = 1;
    });
}
