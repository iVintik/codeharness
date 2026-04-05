/**
 * XState v5 Workflow Machine.
 *
 * Replaces the ad-hoc state machine in workflow-engine.ts with a proper
 * hierarchical state machine built on XState v5.
 *
 * Architecture:
 *   runWorkflowActor(config) → createActor(runMachine) → Promise<EngineResult>
 *
 * Machines (setup + createMachine):
 *   runMachine → epicMachine (per epic) → storyFlowActor (per story, fromPromise)
 *   loopMachine — retry loops with guards (verdictPass, maxIterations, circuitBreaker)
 *
 * Streaming: sideband callback (AD1) — XState manages transitions,
 *   onStreamEvent delivers real-time events to TUI.
 *
 * @see tech-spec-migrate-engine-to-xstate.md
 */

import { setup, assign, fromPromise, createActor } from 'xstate';
import { readFileSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { warn, info } from './output.js';
import { DispatchError } from './agent-dispatch.js';
import type { DispatchErrorCode } from './agent-dispatch.js';
import { getDriver } from './agents/drivers/factory.js';
import { checkCapabilityConflicts } from './agents/capability-check.js';
import { resolveModel } from './agents/model-resolver.js';
import type { DispatchOpts, DriverHealth, OutputContract } from './agents/types.js';
import type { ResultEvent, ToolStartEvent, StreamEvent } from './agents/stream-parser.js';
import type { SubagentDefinition } from './agent-resolver.js';
import type { ResolvedWorkflow, ResolvedTask, FlowStep, LoopBlock } from './workflow-parser.js';
import { buildPromptWithContractContext, writeOutputContract } from './agents/output-contract.js';
import { createIsolatedWorkspace } from './source-isolation.js';
import { generateTraceId, formatTracePrompt, recordTraceId } from './trace-id.js';
import { resolveSessionId, recordSessionId } from './session-manager.js';
import type { SessionLookupKey } from './session-manager.js';
import { parseVerdict, parseVerdictTag, extractTag, VerdictParseError } from './verdict-parser.js';
import type { EvaluatorVerdict } from './verdict-parser.js';
import { evaluateProgress } from './circuit-breaker.js';
import { getNullTask, listNullTasks } from './null-task-registry.js';
import type { TaskContext, NullTaskResult } from './null-task-registry.js';
import { parse } from 'yaml';
import { readStateWithBody, writeState } from './state.js';
import { formatCoverageContextMessage } from './evaluator.js';
import {
  readWorkflowState,
  writeWorkflowState,
} from './workflow-state.js';
import type { WorkflowState, TaskCheckpoint, EvaluatorScore } from './workflow-state.js';
// Note: workflow-persistence.ts exists for future XState snapshot resume.
// Currently resume works via readWorkflowState (YAML state checkpoints).

// Re-export for downstream consumers
export type { EvaluatorVerdict } from './verdict-parser.js';
export { parseVerdict } from './verdict-parser.js';

// ─── Interfaces ──────────────────────────────────────────────────────

export interface EngineEvent {
  type: 'dispatch-start' | 'dispatch-end' | 'dispatch-error' | 'stream-event' | 'task-skip';
  taskName: string;
  storyKey: string;
  driverName?: string;
  model?: string;
  streamEvent?: StreamEvent;
  error?: { code: string; message: string };
  elapsedMs?: number;
  costUsd?: number;
}

export interface EngineConfig {
  workflow: ResolvedWorkflow;
  agents: Record<string, SubagentDefinition>;
  sprintStatusPath: string;
  issuesPath?: string;
  runId: string;
  projectDir?: string;
  maxIterations?: number;
  onEvent?: (event: EngineEvent) => void;
  abortSignal?: AbortSignal;
}

export interface EngineResult {
  success: boolean;
  tasksCompleted: number;
  storiesProcessed: number;
  errors: EngineError[];
  durationMs: number;
}

export interface EngineError {
  taskName: string;
  storyKey: string;
  code: string;
  message: string;
}

export interface WorkItem {
  key: string;
  title?: string;
  source: 'sprint' | 'issues';
}

// ─── Constants ───────────────────────────────────────────────────────

const HALT_ERROR_CODES = new Set(['RATE_LIMIT', 'NETWORK', 'SDK_INIT']);
const DEFAULT_MAX_ITERATIONS = 5;
const HEALTH_CHECK_TIMEOUT_MS = 5000;

/** Tool names that indicate file writes. */
const FILE_WRITE_TOOL_NAMES = new Set([
  'Write', 'Edit', 'write_to_file', 'edit_file',
  'write', 'edit', 'WriteFile', 'EditFile',
]);



// ─── Dispatch Input/Output ───────────────────────────────────────────

interface DispatchInput {
  task: ResolvedTask;
  taskName: string;
  storyKey: string;
  definition: SubagentDefinition;
  config: EngineConfig;
  workflowState: WorkflowState;
  previousContract: OutputContract | null;
  onStreamEvent?: (event: StreamEvent, driverName?: string) => void;
  storyFiles?: string[];
  customPrompt?: string;
  accumulatedCostUsd?: number;
}

interface DispatchOutput {
  output: string;
  cost: number;
  changedFiles: string[];
  sessionId: string;
  contract: OutputContract | null;
  updatedState: WorkflowState;
}

interface NullTaskInput {
  task: ResolvedTask;
  taskName: string;
  storyKey: string;
  config: EngineConfig;
  workflowState: WorkflowState;
  previousContract: OutputContract | null;
  accumulatedCostUsd: number;
}

// ─── TASK_PROMPTS ────────────────────────────────────────────────────

const TASK_PROMPTS: Record<string, (key: string) => string> = {
  'create-story': (key) => `Create the story spec for ${key}. Read the epic definitions and architecture docs. Write a complete story file with acceptance criteria, tasks, and dev notes. CRITICAL: Every AC must be testable by a blind QA agent using ONLY a user guide + browser/API/CLI access. No AC should reference source code, internal data structures, or implementation details like O(1) complexity. Each AC must describe observable behavior that can be verified through UI interaction (agent-browser), API calls (curl), CLI commands (docker exec), or log inspection (docker logs). Wrap output in <story-spec>...</story-spec> tags.`,
  'implement': (key) => `Implement story ${key}`,
  'check': (key) => `Run automated checks for story ${key}. Execute the project's test suite, linter, and coverage tool. Include <verdict>pass</verdict> or <verdict>fail</verdict> in your response.`,
  'review': (key) => `Review the implementation of story ${key}. Check for correctness, security issues, architecture violations, and AC coverage. Include <verdict>pass</verdict> or <verdict>fail</verdict> in your response. If fail, include <issues>...</issues>.`,
  'document': (key) => `Write user documentation for story ${key}. Describe what was built and how to use it from a user's perspective. No source code. Wrap documentation in <user-docs>...</user-docs> tags.`,
  'deploy': () => `Provision the Docker environment for this project. Check for docker-compose.yml, start containers, verify health. Wrap report in <deploy-report>...</deploy-report> tags with status, containers, URLs, credentials, health.`,
  'verify': () => `Verify the epic's stories using the user docs and deploy info in ./story-files/. For each AC, derive verification steps, run commands, observe output. Include <verdict>pass</verdict> or <verdict>fail</verdict>. Include <evidence ac="N" status="pass|fail|unknown">...</evidence> per AC. Include <quality-scores>...</quality-scores>.`,
  'retro': () => `Run a retrospective for this epic. Analyze what worked, what failed, patterns, and action items for next epic.`,
};

// ─── Coverage Deduplication (Story 16-5) ─────────────────────────────

export function buildCoverageDeduplicationContext(
  contract: OutputContract | null,
  projectDir: string,
): string | null {
  if (!contract?.testResults) return null;
  const { coverage } = contract.testResults;
  if (coverage === null || coverage === undefined) return null;
  try {
    const { state } = readStateWithBody(projectDir);
    if (!state.session_flags.coverage_met) return null;
    const target = state.coverage.target ?? 90;
    return formatCoverageContextMessage(coverage, target);
  } catch { // IGNORE: state unreadable — coverage context is best-effort
    return null;
  }
}

// ─── Verify Flag Propagation (Story 16-4) ────────────────────────────

function propagateVerifyFlags(
  taskName: string,
  contract: OutputContract | null,
  projectDir: string,
): void {
  if (taskName !== 'implement') return;
  if (!contract?.testResults) return;
  const { failed, coverage } = contract.testResults;
  try {
    const { state, body } = readStateWithBody(projectDir);
    if (failed === 0) state.session_flags.tests_passed = true;
    if (coverage !== null && coverage !== undefined && coverage >= state.coverage.target) {
      state.session_flags.coverage_met = true;
    }
    writeState(state, projectDir, body);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`workflow-machine: flag propagation failed for ${taskName}: ${msg}`);
  }
}

// ─── Task Completion Check ───────────────────────────────────────────

export function isTaskCompleted(
  state: WorkflowState,
  taskName: string,
  storyKey: string,
): boolean {
  return state.tasks_completed.some(
    (cp) => cp.task_name === taskName && cp.story_key === storyKey && !cp.error,
  );
}

export function isLoopTaskCompleted(
  state: WorkflowState,
  taskName: string,
  storyKey: string,
  iteration: number,
): boolean {
  const count = state.tasks_completed.filter(
    (cp) => cp.task_name === taskName && cp.story_key === storyKey && !cp.error,
  ).length;
  return count >= iteration;
}

// ─── Work Item Loading ───────────────────────────────────────────────

export function loadWorkItems(sprintStatusPath: string, issuesPath?: string): WorkItem[] {
  const items: WorkItem[] = [];

  if (existsSync(sprintStatusPath)) {
    let raw: string;
    try { raw = readFileSync(sprintStatusPath, 'utf-8'); } catch { // IGNORE: unreadable file — return empty work list
      warn(`workflow-machine: could not read sprint-status.yaml at ${sprintStatusPath}`);
      return items;
    }
    let parsed: unknown;
    try { parsed = parse(raw); } catch { // IGNORE: malformed YAML — return empty work list
      warn(`workflow-machine: invalid YAML in sprint-status.yaml at ${sprintStatusPath}`);
      return items;
    }

    if (parsed && typeof parsed === 'object') {
      const data = parsed as Record<string, unknown>;
      const devStatus = data.development_status as Record<string, unknown> | undefined;
      if (devStatus && typeof devStatus === 'object') {
        for (const [key, status] of Object.entries(devStatus)) {
          if (key.startsWith('epic-')) continue;
          if (key.endsWith('-retrospective')) continue;
          if (status === 'backlog' || status === 'ready-for-dev' || status === 'in-progress') {
            items.push({ key, source: 'sprint' });
          }
        }
      }
    }
  }

  if (issuesPath && existsSync(issuesPath)) {
    let raw: string;
    try { raw = readFileSync(issuesPath, 'utf-8'); } catch { // IGNORE: unreadable issues file — return stories collected so far
      warn(`workflow-machine: could not read issues.yaml at ${issuesPath}`);
      return items;
    }
    let parsed: unknown;
    try { parsed = parse(raw); } catch { // IGNORE: malformed issues YAML — return stories collected so far
      warn(`workflow-machine: invalid YAML in issues.yaml at ${issuesPath}`);
      return items;
    }
    if (parsed && typeof parsed === 'object') {
      const data = parsed as Record<string, unknown>;
      const issuesList = data.issues as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(issuesList)) {
        for (const issue of issuesList) {
          if (issue && typeof issue === 'object') {
            const status = issue.status as string | undefined;
            if (status === 'backlog' || status === 'ready-for-dev' || status === 'in-progress') {
              items.push({ key: issue.id as string, title: issue.title as string | undefined, source: 'issues' });
            }
          }
        }
      }
    }
  }

  return items;
}

// ─── Retry Prompt ────────────────────────────────────────────────────

export function buildRetryPrompt(storyKey: string, findings: EvaluatorVerdict['findings']): string {
  const failedFindings = findings.filter((f) => f.status === 'fail' || f.status === 'unknown');
  if (failedFindings.length === 0) return `Implement story ${storyKey}`;
  const formatted = failedFindings
    .map((f) => {
      let entry = `AC #${f.ac} (${f.status.toUpperCase()}): ${f.description}`;
      if (f.evidence?.reasoning) entry += `\n  Evidence: ${f.evidence.reasoning}`;
      return entry;
    })
    .join('\n\n');
  return `Retry story ${storyKey}. Previous evaluator findings:\n\n${formatted}\n\nFocus on fixing the failed criteria above.`;
}

export function buildAllUnknownVerdict(
  workItems: WorkItem[],
  reasoning: string,
): EvaluatorVerdict {
  const findings = workItems.map((_, index) => ({
    ac: index + 1,
    description: `AC #${index + 1}`,
    status: 'unknown' as const,
    evidence: { commands_run: [] as string[], output_observed: '', reasoning },
  }));
  return { verdict: 'fail', score: { passed: 0, failed: 0, unknown: findings.length, total: findings.length }, findings };
}

export function getFailedItems(verdict: EvaluatorVerdict | null, allItems: WorkItem[]): WorkItem[] {
  if (!verdict) return allItems;
  if (verdict.verdict === 'pass') return [];
  return allItems;
}

// ─── Core Dispatch Function ──────────────────────────────────────────

async function dispatchTaskCore(input: DispatchInput): Promise<DispatchOutput> {
  const { task, taskName, storyKey, definition, config, workflowState, previousContract, onStreamEvent, storyFiles, customPrompt, accumulatedCostUsd } = input;
  const projectDir = config.projectDir ?? process.cwd();

  // 1. Trace ID
  const traceId = generateTraceId(config.runId, workflowState.iteration, taskName);
  const tracePrompt = formatTracePrompt(traceId);

  // 2. Session
  const sessionKey: SessionLookupKey = { taskName, storyKey };
  const sessionId = resolveSessionId(task.session, sessionKey, workflowState);

  // 3. Driver + model
  const driverName = task.driver ?? 'claude-code';
  const driver = getDriver(driverName);
  const model = resolveModel(task, { model: definition.model }, driver);

  // 4. CWD + workspace (source isolation)
  let cwd: string;
  let workspace: Awaited<ReturnType<typeof createIsolatedWorkspace>> | null = null;
  if (task.source_access === false) {
    try {
      workspace = await createIsolatedWorkspace({ runId: config.runId, storyFiles: storyFiles ?? [] });
      cwd = workspace?.toDispatchOptions()?.cwd ?? projectDir;
    } catch { cwd = projectDir; } // IGNORE: workspace creation failed — fall back to projectDir
  } else {
    cwd = projectDir;
  }

  // 5. Prompt construction
  const isEpicSentinel = storyKey.startsWith('__epic_') || storyKey === '__run__';
  let basePrompt: string;
  if (customPrompt) {
    basePrompt = customPrompt;
  } else if (TASK_PROMPTS[taskName]) {
    basePrompt = TASK_PROMPTS[taskName](storyKey);
  } else {
    basePrompt = `Execute task "${taskName}" for story ${storyKey}`;
  }

  let prompt = buildPromptWithContractContext(basePrompt, previousContract);
  const coverageDedup = buildCoverageDeduplicationContext(previousContract, projectDir);
  if (coverageDedup) prompt = `${prompt}\n\n${coverageDedup}`;

  // 6. DispatchOpts
  const dispatchOpts: DispatchOpts = {
    prompt,
    model,
    cwd,
    sourceAccess: task.source_access !== false,
    ...(sessionId ? { sessionId } : {}),
    ...(tracePrompt ? { appendSystemPrompt: tracePrompt } : {}),
    ...((task.plugins ?? definition.plugins) ? { plugins: task.plugins ?? definition.plugins } : {}),
    // Note: max_budget_usd is not mapped to timeout — they have different semantics
  };

  // 7. Emit dispatch-start
  const emit = config.onEvent;
  if (emit) emit({ type: 'dispatch-start', taskName, storyKey, driverName, model });

  // 8. Dispatch and stream
  let output = '';
  let resultSessionId = '';
  let cost = 0;
  let errorEvent: { error: string; errorCategory?: string } | null = null;
  const changedFiles: string[] = [];
  let activeToolName: string | null = null;
  let activeToolInput = '';
  const startMs = Date.now();

  try {
    for await (const event of driver.dispatch(dispatchOpts)) {
      // Sideband: TUI gets real-time events
      if (onStreamEvent) onStreamEvent(event, driverName);
      if (emit) emit({ type: 'stream-event', taskName, storyKey, driverName, streamEvent: event });

      if (event.type === 'text') output += event.text;
      if (event.type === 'tool-start') {
        const ts = event as ToolStartEvent;
        activeToolName = ts.name;
        activeToolInput = '';
      }
      if (event.type === 'tool-input') activeToolInput += event.partial;
      if (event.type === 'tool-complete') {
        if (activeToolName && FILE_WRITE_TOOL_NAMES.has(activeToolName)) {
          try {
            const parsed = JSON.parse(activeToolInput) as Record<string, unknown>;
            const filePath = (parsed.file_path ?? parsed.path ?? parsed.filePath) as string | undefined;
            if (filePath && typeof filePath === 'string') changedFiles.push(filePath);
          } catch { /* IGNORE: tool input not valid JSON — changed-files tracking is best-effort */ }
        }
        activeToolName = null;
        activeToolInput = '';
      }
      if (event.type === 'result') {
        const r = event as ResultEvent;
        resultSessionId = r.sessionId;
        cost = r.cost;
        if (r.error) errorEvent = { error: r.error, errorCategory: r.errorCategory };
      }
    }
  } finally {
    if (workspace) await workspace.cleanup();
  }

  const elapsedMs = Date.now() - startMs;
  if (emit) emit({ type: 'dispatch-end', taskName, storyKey, driverName, elapsedMs, costUsd: cost });

  // 9. Error from driver
  if (errorEvent) {
    const categoryToCode: Record<string, string> = {
      RATE_LIMIT: 'RATE_LIMIT', NETWORK: 'NETWORK', SDK_INIT: 'SDK_INIT',
      AUTH: 'UNKNOWN', TIMEOUT: 'UNKNOWN', UNKNOWN: 'UNKNOWN',
    };
    const code = categoryToCode[errorEvent.errorCategory ?? 'UNKNOWN'] ?? 'UNKNOWN';
    throw new DispatchError(errorEvent.error, code as DispatchErrorCode, definition.name, errorEvent);
  }

  // 10. Record session + trace
  let updatedState = workflowState;
  if (resultSessionId) {
    updatedState = recordSessionId(sessionKey, resultSessionId, updatedState);
  } else {
    const checkpoint: TaskCheckpoint = {
      task_name: taskName,
      story_key: storyKey,
      completed_at: new Date().toISOString(),
    };
    updatedState = { ...updatedState, tasks_completed: [...updatedState.tasks_completed, checkpoint] };
  }
  updatedState = recordTraceId(traceId, updatedState);

  // 11. Output contract
  const durationMs = Date.now() - startMs;
  let contract: OutputContract | null = null;
  try {
    contract = {
      version: 1,
      taskName,
      storyId: storyKey,
      driver: driverName,
      model,
      timestamp: new Date().toISOString(),
      cost_usd: cost > 0 ? cost : null,
      duration_ms: durationMs,
      changedFiles: [...new Set(changedFiles)],
      testResults: null,
      output,
      acceptanceCriteria: [],
    };
    writeOutputContract(contract, join(projectDir, '.codeharness', 'contracts'));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`workflow-machine: failed to write output contract for ${taskName}/${storyKey}: ${msg}`);
    contract = null;
  }

  // 12. Persist state
  writeWorkflowState(updatedState, projectDir);
  propagateVerifyFlags(taskName, contract, projectDir);

  return { output, cost, changedFiles, sessionId: resultSessionId, contract, updatedState };
}

// ─── Core Null Task Function ─────────────────────────────────────────

async function nullTaskCore(input: NullTaskInput): Promise<DispatchOutput> {
  const { task, taskName, storyKey, config, workflowState, previousContract, accumulatedCostUsd } = input;
  const projectDir = config.projectDir ?? process.cwd();

  const handler = getNullTask(taskName);
  if (!handler) {
    const registered = listNullTasks();
    throw { taskName, storyKey, code: 'NULL_TASK_NOT_FOUND', message: `No null task handler registered for "${taskName}". Registered: ${registered.join(', ') || '(none)'}` };
  }

  const startMs = Date.now();
  const workflowStartMs = workflowState.started ? new Date(workflowState.started).getTime() : startMs;
  const ctx: TaskContext = {
    storyKey, taskName, cost: accumulatedCostUsd, durationMs: startMs - workflowStartMs,
    outputContract: previousContract, projectDir,
  };

  let result: NullTaskResult;
  try { result = await handler(ctx); } catch (err: unknown) {
    throw { taskName, storyKey, code: 'NULL_TASK_HANDLER_ERROR', message: `Null task handler "${taskName}" threw: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (!result.success) {
    throw { taskName, storyKey, code: 'NULL_TASK_FAILED', message: `Null task handler "${taskName}" returned success=false${result.output ? `: ${result.output}` : ''}` };
  }

  const checkpoint: TaskCheckpoint = { task_name: taskName, story_key: storyKey, completed_at: new Date().toISOString() };
  const updatedState: WorkflowState = { ...workflowState, tasks_completed: [...workflowState.tasks_completed, checkpoint] };
  const durationMs = Date.now() - startMs;
  const contract: OutputContract = {
    version: 1, taskName, storyId: storyKey, driver: 'engine', model: 'null',
    timestamp: new Date().toISOString(), cost_usd: 0, duration_ms: durationMs,
    changedFiles: [], testResults: null, output: result.output ?? '', acceptanceCriteria: [],
  };
  writeWorkflowState(updatedState, projectDir);

  return { output: result.output ?? '', cost: 0, changedFiles: [], sessionId: '', contract, updatedState };
}

// ─── Flow Step Helpers ───────────────────────────────────────────────

function isLoopBlock(step: FlowStep): step is LoopBlock {
  return typeof step === 'object' && step !== null && 'loop' in step;
}

// ─── XState Dispatch Actors (fromPromise) ────────────────────────────

const dispatchActor = fromPromise(async ({ input }: { input: DispatchInput }): Promise<DispatchOutput> => {
  return dispatchTaskCore(input);
});

const nullTaskDispatchActor = fromPromise(async ({ input }: { input: NullTaskInput }): Promise<DispatchOutput> => {
  return nullTaskCore(input);
});

// ─── Loop Block Execution (XState loop machine) ─────────────────────

interface LoopBlockResult {
  state: WorkflowState;
  errors: EngineError[];
  tasksCompleted: number;
  halted: boolean;
  lastContract: OutputContract | null;
}

/**
 * Loop block execution context for the XState loop machine.
 * The loop machine uses fromPromise to run each iteration's tasks,
 * with guards controlling iteration vs termination.
 */
interface LoopMachineContext {
  loopBlock: LoopBlock;
  config: EngineConfig;
  workItems: WorkItem[];
  storyFlowTasks: Set<string> | undefined;
  onStreamEvent?: (event: StreamEvent, driverName?: string) => void;
  maxIterations: number;
  // Mutable state
  currentState: WorkflowState;
  errors: EngineError[];
  tasksCompleted: number;
  halted: boolean;
  lastContract: OutputContract | null;
  lastVerdict: EvaluatorVerdict | null;
  accumulatedCostUsd: number;
}

/** Runs one full iteration of all tasks in a loop block. Returns updated context fields. */
const loopIterationActor = fromPromise(async ({ input }: { input: LoopMachineContext }): Promise<LoopMachineContext> => {
  const { loopBlock, config, workItems, storyFlowTasks, onStreamEvent, maxIterations } = input;
  let { currentState, errors, tasksCompleted, lastContract, lastVerdict, accumulatedCostUsd } = input;
  const projectDir = config.projectDir ?? process.cwd();
  const RUN_SENTINEL = '__run__';

  const lastAgentTaskInLoop = (() => {
    for (let i = loopBlock.loop.length - 1; i >= 0; i--) {
      const tn = loopBlock.loop[i];
      const t = config.workflow.tasks[tn];
      if (t && t.agent !== null) return tn;
    }
    return loopBlock.loop[loopBlock.loop.length - 1];
  })();

  // Advance iteration
  const nextIteration = currentState.iteration + 1;
  const allCurrentIterationDone = currentState.iteration > 0 && loopBlock.loop.every((tn) => {
    const t = config.workflow.tasks[tn];
    if (!t) return true;
    if (storyFlowTasks?.has(tn)) return workItems.every((item) => isLoopTaskCompleted(currentState, tn, item.key, currentState.iteration));
    return isLoopTaskCompleted(currentState, tn, RUN_SENTINEL, currentState.iteration);
  });
  if (currentState.iteration === 0 || allCurrentIterationDone) {
    currentState = { ...currentState, iteration: nextIteration };
    writeWorkflowState(currentState, projectDir);
  }

  let haltedInLoop = false;

  for (const taskName of loopBlock.loop) {
    const task = config.workflow.tasks[taskName];
    if (!task) { warn(`workflow-machine: task "${taskName}" not found in workflow tasks, skipping`); continue; }

    if (task.agent === null) {
      const items = storyFlowTasks?.has(taskName)
        ? (lastVerdict ? getFailedItems(lastVerdict, workItems) : workItems)
        : [{ key: RUN_SENTINEL, source: 'sprint' as const }];
      for (const item of items) {
        if (isLoopTaskCompleted(currentState, taskName, item.key, currentState.iteration)) {
          warn(`workflow-machine: skipping completed task ${taskName} for ${item.key}`);
          continue;
        }
        try {
          const nr = await nullTaskCore({ task, taskName, storyKey: item.key, config, workflowState: currentState, previousContract: lastContract, accumulatedCostUsd });
          currentState = nr.updatedState;
          lastContract = nr.contract;
          tasksCompleted++;
        } catch (err: unknown) { // IGNORE: null task error — record and continue
          const engineError = isEngineError(err) ? err : handleDispatchError(err, taskName, item.key);
          errors.push(engineError);
          currentState = recordErrorInState(currentState, taskName, item.key, engineError);
          writeWorkflowState(currentState, projectDir);
        }
      }
      continue;
    }

    const definition = config.agents[task.agent];
    if (!definition) { warn(`workflow-machine: agent "${task.agent}" not found for task "${taskName}", skipping`); continue; }

    const items = storyFlowTasks?.has(taskName)
      ? (lastVerdict ? getFailedItems(lastVerdict, workItems) : workItems)
      : [{ key: RUN_SENTINEL, source: 'sprint' as const }];

    for (const item of items) {
      if (isLoopTaskCompleted(currentState, taskName, item.key, currentState.iteration)) {
        warn(`workflow-machine: skipping completed task ${taskName} for ${item.key}`);
        continue;
      }
      const prompt = lastVerdict ? buildRetryPrompt(item.key, lastVerdict.findings) : undefined;
      try {
        const dr = await dispatchTaskCore({ task, taskName, storyKey: item.key, definition, config, workflowState: currentState, previousContract: lastContract, onStreamEvent, customPrompt: prompt });
        currentState = dr.updatedState;
        lastContract = dr.contract;
        accumulatedCostUsd += dr.contract?.cost_usd ?? 0;
        tasksCompleted++;

        if (taskName === lastAgentTaskInLoop && !storyFlowTasks?.has(taskName)) {
          let verdict: EvaluatorVerdict | null = null;
          try { verdict = parseVerdict(dr.output); } catch (parseErr: unknown) {
            if (parseErr instanceof VerdictParseError && parseErr.retryable) {
              try {
                const retryResult = await dispatchTaskCore({ task, taskName, storyKey: item.key, definition, config, workflowState: currentState, previousContract: lastContract, onStreamEvent });
                currentState = retryResult.updatedState;
                lastContract = retryResult.contract;
                tasksCompleted++;
                verdict = parseVerdict(retryResult.output);
              } catch { verdict = buildAllUnknownVerdict(workItems, 'Evaluator failed after retry'); } // IGNORE: retry dispatch failed — fall back to all-unknown verdict
            }
          }
          if (!verdict) {
            const tagged = parseVerdictTag(dr.output);
            if (tagged) verdict = { verdict: tagged.verdict, score: { passed: tagged.verdict === 'pass' ? 1 : 0, failed: tagged.verdict === 'fail' ? 1 : 0, unknown: 0, total: 1 }, findings: [] };
          }
          lastVerdict = verdict;
          if (verdict) {
            const score: EvaluatorScore = { iteration: currentState.iteration, passed: verdict.score.passed, failed: verdict.score.failed, unknown: verdict.score.unknown, total: verdict.score.total, timestamp: new Date().toISOString() };
            currentState = { ...currentState, evaluator_scores: [...currentState.evaluator_scores, score] };
          }
          const cbDecision = evaluateProgress(currentState.evaluator_scores);
          if (cbDecision.halt) {
            currentState = { ...currentState, circuit_breaker: { triggered: true, reason: cbDecision.reason, score_history: cbDecision.scoreHistory } };
            writeWorkflowState(currentState, projectDir);
          }
          writeWorkflowState(currentState, projectDir);
        }
      } catch (err: unknown) {
        const engineError = isEngineError(err) ? err : handleDispatchError(err, taskName, item.key);
        errors.push(engineError);
        currentState = recordErrorInState(currentState, taskName, item.key, engineError);
        writeWorkflowState(currentState, projectDir);
        if (err instanceof DispatchError && HALT_ERROR_CODES.has(err.code)) { haltedInLoop = true; break; }
      }
    }
    if (haltedInLoop) break;
  }

  return { ...input, currentState, errors, tasksCompleted, halted: haltedInLoop, lastContract, lastVerdict, accumulatedCostUsd };
});

/**
 * XState loop machine — iterates tasks until pass, max iterations, or circuit breaker.
 *
 * States:
 *   iterating (invoke loopIterationActor)
 *     → onDone → checkTermination
 *   checkTermination
 *     → guard(halted) → halted
 *     → guard(verdictPass) → done
 *     → guard(maxIterations) → maxIterations
 *     → guard(circuitBreaker) → circuitBreaker
 *     → otherwise → iterating (next iteration)
 *   done (final)
 *   halted (final)
 *   maxIterations (final)
 *   circuitBreaker (final)
 */
const loopMachine = setup({
  types: {} as {
    context: LoopMachineContext;
    input: LoopMachineContext;
  },
  actors: { loopIterationActor },
  guards: {
    halted: ({ context }) => context.halted,
    verdictPass: ({ context }) => context.lastVerdict?.verdict === 'pass',
    maxIterations: ({ context }) => context.currentState.iteration >= context.maxIterations,
    circuitBreaker: ({ context }) => context.currentState.circuit_breaker.triggered,
  },
}).createMachine({
  id: 'loopBlock',
  context: ({ input }) => input,
  initial: 'checkEmpty',
  states: {
    checkEmpty: {
      always: [
        { guard: ({ context }) => context.loopBlock.loop.length === 0, target: 'done' },
        { target: 'iterating' },
      ],
    },
    iterating: {
      invoke: {
        src: 'loopIterationActor',
        input: ({ context }) => context,
        onDone: {
          target: 'checkTermination',
          actions: assign(({ event }) => event.output),
        },
        onError: { target: 'halted' },
      },
    },
    checkTermination: {
      always: [
        { guard: 'halted', target: 'halted' },
        { guard: 'verdictPass', target: 'done' },
        { guard: 'maxIterations', target: 'maxIterationsReached' },
        { guard: 'circuitBreaker', target: 'circuitBreakerTriggered' },
        { target: 'iterating' },
      ],
    },
    done: { type: 'final' },
    halted: { type: 'final' },
    maxIterationsReached: {
      type: 'final',
      entry: [
        assign(({ context }) => ({ ...context, currentState: { ...context.currentState, phase: 'max-iterations' } })),
        ({ context }: { context: LoopMachineContext }) => {
          const projectDir = context.config.projectDir ?? process.cwd();
          writeWorkflowState(context.currentState, projectDir);
        },
      ],
    },
    circuitBreakerTriggered: {
      type: 'final',
      entry: [
        assign(({ context }) => ({ ...context, currentState: { ...context.currentState, phase: 'circuit-breaker' } })),
        ({ context }: { context: LoopMachineContext }) => {
          const projectDir = context.config.projectDir ?? process.cwd();
          writeWorkflowState(context.currentState, projectDir);
        },
      ],
    },
  },
});

/**
 * Execute a loop block using the XState loop machine.
 * Creates an actor, runs to completion, returns LoopBlockResult.
 */
export async function executeLoopBlock(
  loopBlock: LoopBlock,
  state: WorkflowState,
  config: EngineConfig,
  workItems: WorkItem[],
  initialContract?: OutputContract | null,
  storyFlowTasks?: Set<string>,
  onStreamEvent?: (event: StreamEvent, driverName?: string) => void,
): Promise<LoopBlockResult> {
  const input: LoopMachineContext = {
    loopBlock, config, workItems, storyFlowTasks, onStreamEvent,
    maxIterations: config.maxIterations ?? DEFAULT_MAX_ITERATIONS,
    currentState: state, errors: [], tasksCompleted: 0, halted: false,
    lastContract: initialContract ?? null, lastVerdict: null, accumulatedCostUsd: 0,
  };

  const actor = createActor(loopMachine, { input });

  return new Promise<LoopBlockResult>((resolve) => {
    actor.subscribe({ complete: () => {
      const snap = actor.getSnapshot();
      const ctx = snap.context;
      resolve({ state: ctx.currentState, errors: ctx.errors, tasksCompleted: ctx.tasksCompleted, halted: ctx.halted, lastContract: ctx.lastContract });
    }});
    actor.start();
  });
}

// ─── Public Dispatch (backward-compat wrapper for tests) ─────────────

export async function dispatchTask(
  task: ResolvedTask,
  taskName: string,
  storyKey: string,
  definition: SubagentDefinition,
  state: WorkflowState,
  config: EngineConfig,
  customPrompt?: string,
  previousOutputContract?: OutputContract,
): Promise<WorkflowState> {
  const result = await dispatchTaskCore({
    task, taskName, storyKey, definition, config, workflowState: state,
    previousContract: previousOutputContract ?? null, customPrompt,
  });
  return result.updatedState;
}



// ─── Driver Health Check ─────────────────────────────────────────────

export async function checkDriverHealth(workflow: ResolvedWorkflow, timeoutMs?: number): Promise<void> {
  const driverNames = new Set<string>();
  for (const task of Object.values(workflow.tasks)) {
    if (task.agent === null) continue;
    driverNames.add(task.driver ?? 'claude-code');
  }
  const drivers = new Map<string, ReturnType<typeof getDriver>>();
  for (const name of driverNames) drivers.set(name, getDriver(name));

  interface HealthResult { name: string; health: DriverHealth }
  const responded = new Set<string>();
  const healthChecks = Promise.all(
    [...drivers.entries()].map(async ([name, driver]): Promise<HealthResult> => {
      const health = await driver.healthCheck();
      responded.add(name);
      return { name, health };
    }),
  );

  const effectiveTimeout = timeoutMs ?? HEALTH_CHECK_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), effectiveTimeout); });
  const result = await Promise.race([healthChecks, timeoutPromise]);

  if (result === 'timeout') {
    const pending = [...driverNames].filter((n) => !responded.has(n));
    throw new Error(`Driver health check timed out after ${effectiveTimeout}ms. Drivers: ${(pending.length > 0 ? pending : [...driverNames]).join(', ')}`);
  }
  clearTimeout(timer!);
  const failures = result.filter((r) => !r.health.available);
  if (failures.length > 0) {
    throw new Error(`Driver health check failed: ${failures.map((f) => `${f.name}: ${f.health.error ?? 'unavailable'}`).join('; ')}`);
  }
}

// ─── Guide Collection (for blind verify tasks) ──────────────────────

function collectGuideFiles(epicItems: WorkItem[], epicSentinel: string, projectDir: string): string[] {
  const guidesDir = join(projectDir, '.codeharness', 'verify-guides');
  const guideFiles: string[] = [];
  try { mkdirSync(guidesDir, { recursive: true }); } catch { return guideFiles; } // IGNORE: can't create guides dir — skip guide collection

  for (const item of epicItems) {
    try {
      const contractPath = join(projectDir, '.codeharness', 'contracts', `document-${item.key}.json`);
      if (existsSync(contractPath)) {
        const contractData = JSON.parse(readFileSync(contractPath, 'utf-8')) as { output?: string };
        const docs = contractData.output ? extractTag(contractData.output, 'user-docs') ?? contractData.output : null;
        if (docs) {
          const guidePath = join(guidesDir, `${item.key}-guide.md`);
          writeFileSync(guidePath, docs, 'utf-8');
          guideFiles.push(guidePath);
        }
      }
    } catch { /* IGNORE: individual guide file read/write failure — continue with other guides */ }
  }

  try {
    const deployContractPath = join(projectDir, '.codeharness', 'contracts', `deploy-${epicSentinel}.json`);
    if (existsSync(deployContractPath)) {
      const deployData = JSON.parse(readFileSync(deployContractPath, 'utf-8')) as { output?: string };
      const report = deployData.output ? extractTag(deployData.output, 'deploy-report') ?? deployData.output : null;
      if (report) {
        const deployPath = join(guidesDir, 'deploy-info.md');
        writeFileSync(deployPath, report, 'utf-8');
        guideFiles.push(deployPath);
      }
    }
  } catch { /* IGNORE: deploy contract read failure — continue without deploy info */ }

  return guideFiles;
}

function cleanupGuideFiles(projectDir: string): void {
  const guidesDir = join(projectDir, '.codeharness', 'verify-guides');
  try { rmSync(guidesDir, { recursive: true, force: true }); } catch { /* IGNORE: guide directory cleanup is best-effort */ }
}

// ─── Story Machine (XState) ─────────────────────────────────────────

/** Runs one story through its storyFlow tasks sequentially via fromPromise. */
const storyFlowActor = fromPromise(async ({ input }: { input: {
  item: WorkItem; config: EngineConfig; workflowState: WorkflowState;
  lastContract: OutputContract | null; accumulatedCostUsd: number;
  storyFlowTasks: Set<string>;
} }): Promise<{
  workflowState: WorkflowState; errors: EngineError[]; tasksCompleted: number;
  lastContract: OutputContract | null; accumulatedCostUsd: number; halted: boolean;
}> => {
  const { item, config, storyFlowTasks } = input;
  let { workflowState: state, lastContract, accumulatedCostUsd } = input;
  const projectDir = config.projectDir ?? process.cwd();
  const errors: EngineError[] = [];
  let tasksCompleted = 0;
  let halted = false;

  for (const storyStep of config.workflow.storyFlow) {
    if (halted || config.abortSignal?.aborted) { halted = true; break; }

    if (isLoopBlock(storyStep)) {
      const loopResult = await executeLoopBlock(storyStep, state, config, [item], lastContract, storyFlowTasks);
      state = loopResult.state;
      errors.push(...loopResult.errors);
      tasksCompleted += loopResult.tasksCompleted;
      lastContract = loopResult.lastContract;
      if (loopResult.halted || state.phase === 'max-iterations' || state.phase === 'circuit-breaker') { halted = true; break; }
      continue;
    }
    if (typeof storyStep !== 'string') continue;

    const taskName = storyStep;
    const task = config.workflow.tasks[taskName];
    if (!task) { warn(`workflow-machine: task "${taskName}" not found in workflow tasks, skipping`); continue; }

    if (task.agent === null) {
      if (isTaskCompleted(state, taskName, item.key)) continue;
      try {
        const nr = await nullTaskCore({ task, taskName, storyKey: item.key, config, workflowState: state, previousContract: lastContract, accumulatedCostUsd });
        state = nr.updatedState;
        lastContract = nr.contract;
        tasksCompleted++;
      } catch (err: unknown) { // IGNORE: null task error — record and continue to next story
        const engineError = isEngineError(err) ? err : handleDispatchError(err, taskName, item.key);
        errors.push(engineError);
        state = recordErrorInState(state, taskName, item.key, engineError);
        writeWorkflowState(state, projectDir);
        break;
      }
      continue;
    }

    const definition = config.agents[task.agent];
    if (!definition) { warn(`workflow-machine: agent "${task.agent}" not found for task "${taskName}", skipping`); continue; }
    if (isTaskCompleted(state, taskName, item.key)) continue;

    try {
      const dr = await dispatchTaskCore({ task, taskName, storyKey: item.key, definition, config, workflowState: state, previousContract: lastContract });
      state = dr.updatedState;
      lastContract = dr.contract;
      accumulatedCostUsd += dr.contract?.cost_usd ?? 0;
      tasksCompleted++;
    } catch (err: unknown) {
      const engineError = handleDispatchError(err, taskName, item.key);
      errors.push(engineError);
      if (config.onEvent) config.onEvent({ type: 'dispatch-error', taskName, storyKey: item.key, error: { code: engineError.code, message: engineError.message } });
      state = recordErrorInState(state, taskName, item.key, engineError);
      writeWorkflowState(state, projectDir);
      if (err instanceof DispatchError && HALT_ERROR_CODES.has(err.code)) halted = true;
      break;
    }
  }

  return { workflowState: state, errors, tasksCompleted, lastContract, accumulatedCostUsd, halted };
});

// ─── Epic Machine (XState) ─────────────────────────────────────────��

interface EpicMachineContext {
  epicId: string;
  epicItems: WorkItem[];
  config: EngineConfig;
  storyFlowTasks: Set<string>;
  // Mutable
  currentStoryIndex: number;
  workflowState: WorkflowState;
  errors: EngineError[];
  tasksCompleted: number;
  storiesProcessed: Set<string>;
  lastContract: OutputContract | null;
  accumulatedCostUsd: number;
  halted: boolean;
  // Epic flow tracking
  currentStepIndex: number;
}

/** Processes one epic-flow step (story_flow, loop block, or epic task). */
const epicStepActor = fromPromise(async ({ input }: { input: EpicMachineContext }): Promise<EpicMachineContext> => {
  const { epicId, epicItems, config, storyFlowTasks } = input;
  let { workflowState: state, errors, tasksCompleted, storiesProcessed, lastContract, accumulatedCostUsd, halted, currentStepIndex } = input;
  const projectDir = config.projectDir ?? process.cwd();
  const step = config.workflow.epicFlow[currentStepIndex];

  if (!step || halted || config.abortSignal?.aborted) {
    if (config.abortSignal?.aborted) { state = { ...state, phase: 'interrupted' }; writeWorkflowState(state, projectDir); }
    return { ...input, workflowState: state, errors, tasksCompleted, storiesProcessed, lastContract, accumulatedCostUsd, halted: true, currentStepIndex };
  }

  // ── story_flow: invoke story machine for each story ──
  if (step === 'story_flow') {
    for (const item of epicItems) {
      if (halted || config.abortSignal?.aborted) { halted = true; break; }
      storiesProcessed.add(item.key);

      const storyResult = await new Promise<{
        workflowState: WorkflowState; errors: EngineError[]; tasksCompleted: number;
        lastContract: OutputContract | null; accumulatedCostUsd: number; halted: boolean;
      }>((resolve, reject) => {
        const a = createActor(storyFlowActor, { input: { item, config, workflowState: state, lastContract, accumulatedCostUsd, storyFlowTasks } });
        a.subscribe({ complete: () => resolve(a.getSnapshot().output!), error: reject });
        a.start();
      });
      state = storyResult.workflowState;
      errors.push(...storyResult.errors);
      tasksCompleted += storyResult.tasksCompleted;
      lastContract = storyResult.lastContract;
      accumulatedCostUsd = storyResult.accumulatedCostUsd;
      if (storyResult.halted) { halted = true; break; }
    }
    return { ...input, workflowState: state, errors, tasksCompleted, storiesProcessed, lastContract, accumulatedCostUsd, halted, currentStepIndex: currentStepIndex + 1 };
  }

  // ── Loop block in epic_flow ──
  if (isLoopBlock(step)) {
    const loopResult = await executeLoopBlock(step, state, config, epicItems, lastContract, storyFlowTasks);
    state = loopResult.state;
    errors.push(...loopResult.errors);
    tasksCompleted += loopResult.tasksCompleted;
    lastContract = loopResult.lastContract;
    for (const item of epicItems) storiesProcessed.add(item.key);
    if (loopResult.halted || state.phase === 'max-iterations' || state.phase === 'circuit-breaker') halted = true;
    return { ...input, workflowState: state, errors, tasksCompleted, storiesProcessed, lastContract, accumulatedCostUsd, halted, currentStepIndex: currentStepIndex + 1 };
  }

  // ── Epic-level task (deploy, verify, retro) ──
  const taskName = step as string;
  const task = config.workflow.tasks[taskName];
  if (!task) { warn(`workflow-machine: task "${taskName}" not found in workflow tasks, skipping`); return { ...input, currentStepIndex: currentStepIndex + 1 }; }

  const epicSentinel = `__epic_${epicId}__`;

  if (task.agent === null) {
    if (!isTaskCompleted(state, taskName, epicSentinel)) {
      try {
        const nr = await nullTaskCore({ task, taskName, storyKey: epicSentinel, config, workflowState: state, previousContract: lastContract, accumulatedCostUsd });
        state = nr.updatedState;
        lastContract = nr.contract;
        tasksCompleted++;
      } catch (err: unknown) { // IGNORE: null task error — record and continue
        const engineError = isEngineError(err) ? err : handleDispatchError(err, taskName, epicSentinel);
        errors.push(engineError);
        state = recordErrorInState(state, taskName, epicSentinel, engineError);
        writeWorkflowState(state, projectDir);
      }
    }
    return { ...input, workflowState: state, errors, tasksCompleted, storiesProcessed, lastContract, accumulatedCostUsd, halted, currentStepIndex: currentStepIndex + 1 };
  }

  const definition = config.agents[task.agent];
  if (!definition) { warn(`workflow-machine: agent "${task.agent}" not found for task "${taskName}", skipping`); return { ...input, currentStepIndex: currentStepIndex + 1 }; }
  if (isTaskCompleted(state, taskName, epicSentinel)) {
    return { ...input, currentStepIndex: currentStepIndex + 1 };
  }

  let guideFiles: string[] = [];
  if (task.source_access === false) guideFiles = collectGuideFiles(epicItems, epicSentinel, projectDir);

  try {
    const dr = await dispatchTaskCore({ task, taskName, storyKey: epicSentinel, definition, config, workflowState: state, previousContract: lastContract, storyFiles: guideFiles });
    state = dr.updatedState;
    lastContract = dr.contract;
    accumulatedCostUsd += dr.contract?.cost_usd ?? 0;
    tasksCompleted++;
  } catch (err: unknown) {
    const engineError = isEngineError(err) ? err : handleDispatchError(err, taskName, epicSentinel);
    errors.push(engineError);
    if (config.onEvent) config.onEvent({ type: 'dispatch-error', taskName, storyKey: epicSentinel, error: { code: engineError.code, message: engineError.message } });
    state = recordErrorInState(state, taskName, epicSentinel, engineError);
    writeWorkflowState(state, projectDir);
    if (err instanceof DispatchError && HALT_ERROR_CODES.has(err.code)) halted = true;
  } finally {
    if (guideFiles.length > 0) cleanupGuideFiles(projectDir);
  }

  return { ...input, workflowState: state, errors, tasksCompleted, storiesProcessed, lastContract, accumulatedCostUsd, halted, currentStepIndex: currentStepIndex + 1 };
});

/**
 * XState epic machine — processes one epic through its epicFlow steps.
 *
 * States:
 *   processingStep (invoke epicStepActor)
 *     → onDone → checkNext
 *   checkNext
 *     → guard(halted || noMoreSteps) → done
 *     → otherwise → processingStep
 *   done (final)
 */
const epicMachine = setup({
  types: {} as {
    context: EpicMachineContext;
    input: EpicMachineContext;
  },
  actors: { epicStepActor },
  guards: {
    epicDone: ({ context }) => context.halted || context.currentStepIndex >= context.config.workflow.epicFlow.length,
  },
}).createMachine({
  id: 'epic',
  context: ({ input }) => input,
  initial: 'processingStep',
  states: {
    processingStep: {
      invoke: {
        src: 'epicStepActor',
        input: ({ context }) => context,
        onDone: {
          target: 'checkNext',
          actions: assign(({ event }) => event.output),
        },
        onError: {
          target: 'done',
          actions: assign(({ context, event }) => {
            const msg = event.error instanceof Error ? event.error.message : String(event.error);
            return { ...context, errors: [...context.errors, { taskName: '__epic_actor__', storyKey: context.epicId, code: 'ACTOR_ERROR', message: msg }], halted: true };
          }),
        },
      },
    },
    checkNext: {
      always: [
        { guard: 'epicDone', target: 'done' },
        { target: 'processingStep' },
      ],
    },
    done: { type: 'final' },
  },
});

// ─── Run Machine (XState — top level) ────────────────────────────────

interface RunMachineContext {
  config: EngineConfig;
  storyFlowTasks: Set<string>;
  epicEntries: Array<[string, WorkItem[]]>;
  currentEpicIndex: number;
  // Mutable
  workflowState: WorkflowState;
  errors: EngineError[];
  tasksCompleted: number;
  storiesProcessed: Set<string>;
  lastContract: OutputContract | null;
  accumulatedCostUsd: number;
  halted: boolean;
}

/** Processes one epic by running the epic machine. */
const runEpicActor = fromPromise(async ({ input }: { input: RunMachineContext }): Promise<RunMachineContext> => {
  const { config, storyFlowTasks, epicEntries, currentEpicIndex } = input;
  let { workflowState: state, errors, tasksCompleted, storiesProcessed, lastContract, accumulatedCostUsd, halted } = input;

  if (currentEpicIndex >= epicEntries.length || halted || config.abortSignal?.aborted) {
    if (config.abortSignal?.aborted) {
      const projectDir = config.projectDir ?? process.cwd();
      state = { ...state, phase: 'interrupted' };
      writeWorkflowState(state, projectDir);
    }
    return { ...input, workflowState: state, halted: true };
  }

  const [epicId, epicItems] = epicEntries[currentEpicIndex];

  if (config.onEvent) {
    config.onEvent({ type: 'dispatch-start', taskName: 'story_flow', storyKey: `__epic_${epicId}__` });
  }

  // Run the epic machine
  const epicInput: EpicMachineContext = {
    epicId, epicItems, config, storyFlowTasks,
    currentStoryIndex: 0, workflowState: state, errors: [], tasksCompleted: 0,
    storiesProcessed: new Set<string>(), lastContract, accumulatedCostUsd, halted: false, currentStepIndex: 0,
  };

  const epicResult = await new Promise<EpicMachineContext>((resolve) => {
    const actor = createActor(epicMachine, { input: epicInput });
    actor.subscribe({ complete: () => resolve(actor.getSnapshot().context) });
    actor.start();
  });

  // Merge epic results
  state = epicResult.workflowState;
  errors.push(...epicResult.errors);
  tasksCompleted += epicResult.tasksCompleted;
  for (const key of epicResult.storiesProcessed) storiesProcessed.add(key);
  lastContract = epicResult.lastContract;
  accumulatedCostUsd = epicResult.accumulatedCostUsd;
  halted = epicResult.halted;

  return { ...input, workflowState: state, errors, tasksCompleted, storiesProcessed, lastContract, accumulatedCostUsd, halted, currentEpicIndex: currentEpicIndex + 1 };
});

/**
 * XState run machine — top-level orchestrator. Iterates epics sequentially.
 *
 * States:
 *   processingEpic (invoke runEpicActor)
 *     → onDone → checkNext
 *   checkNext
 *     → guard(done) → allDone
 *     → otherwise → processingEpic
 *   allDone (final)
 */
const runMachine = setup({
  types: {} as {
    context: RunMachineContext;
    input: RunMachineContext;
  },
  actors: { runEpicActor },
  guards: {
    allEpicsDone: ({ context }) => context.halted || context.currentEpicIndex >= context.epicEntries.length,
  },
}).createMachine({
  id: 'run',
  context: ({ input }) => input,
  initial: 'processingEpic',
  states: {
    processingEpic: {
      invoke: {
        src: 'runEpicActor',
        input: ({ context }) => context,
        onDone: {
          target: 'checkNext',
          actions: assign(({ event }) => event.output),
        },
        onError: {
          target: 'allDone',
          actions: assign(({ context, event }) => {
            const msg = event.error instanceof Error ? event.error.message : String(event.error);
            return { ...context, errors: [...context.errors, { taskName: '__run_actor__', storyKey: '__run__', code: 'ACTOR_ERROR', message: msg }], halted: true };
          }),
        },
      },
    },
    checkNext: {
      always: [
        { guard: 'allEpicsDone', target: 'allDone' },
        { target: 'processingEpic' },
      ],
    },
    allDone: { type: 'final' },
  },
});

// ─── Main Entry Point: runWorkflowActor ──────────────────────────────

/**
 * Execute a workflow using the XState run machine.
 *
 * Pre-flight checks (health, capability) run before the machine starts (AD6).
 * The run machine orchestrates epics → stories → tasks via hierarchical actors.
 * Returns EngineResult compatible with LanePool (AD2).
 */
export async function runWorkflowActor(config: EngineConfig): Promise<EngineResult> {
  const startMs = Date.now();
  const projectDir = config.projectDir ?? process.cwd();

  // 1. Read or initialize workflow state
  let state = readWorkflowState(projectDir);

  if (state.phase === 'completed') {
    return { success: true, tasksCompleted: 0, storiesProcessed: 0, errors: [], durationMs: 0 };
  }

  if (state.phase === 'error' || state.phase === 'failed') {
    const errorCount = state.tasks_completed.filter(t => t.error).length;
    if (!config.onEvent) info(`Resuming from ${state.phase} state — ${errorCount} previous error(s)`);
  }

  state = { ...state, phase: 'executing', started: state.started || new Date().toISOString(), workflow_name: config.workflow.storyFlow.filter((s) => typeof s === 'string').join(' -> ') };
  writeWorkflowState(state, projectDir);

  // 2. Pre-flight: health check (AD6)
  try {
    await checkDriverHealth(config.workflow);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    state = { ...state, phase: 'failed' };
    const errors: EngineError[] = [{ taskName: '__health_check__', storyKey: '__health_check__', code: 'HEALTH_CHECK', message }];
    writeWorkflowState(state, projectDir);
    return { success: false, tasksCompleted: 0, storiesProcessed: 0, errors, durationMs: Date.now() - startMs };
  }

  // 3. Pre-flight: capability check (advisory)
  const capWarnings = checkCapabilityConflicts(config.workflow);
  for (const cw of capWarnings) warn(cw.message);

  // 4. Load work items
  const workItems = loadWorkItems(config.sprintStatusPath, config.issuesPath);

  // Build storyFlowTasks set
  const storyFlowTasks = new Set<string>();
  for (const step of config.workflow.storyFlow) {
    if (typeof step === 'string') storyFlowTasks.add(step);
    if (typeof step === 'object' && 'loop' in step) {
      for (const lt of (step as { loop: string[] }).loop) storyFlowTasks.add(lt);
    }
  }

  // 5. Group by epic
  const epicGroups = new Map<string, WorkItem[]>();
  for (const item of workItems) {
    const epicId = item.key.match(/^(\d+)-/)?.[1] ?? 'unknown';
    if (!epicGroups.has(epicId)) epicGroups.set(epicId, []);
    epicGroups.get(epicId)!.push(item);
  }

  // 6. Create and run the XState run machine
  const runInput: RunMachineContext = {
    config, storyFlowTasks,
    epicEntries: [...epicGroups.entries()],
    currentEpicIndex: 0,
    workflowState: state,
    errors: [],
    tasksCompleted: 0,
    storiesProcessed: new Set<string>(),
    lastContract: null,
    accumulatedCostUsd: 0,
    halted: false,
  };

  const finalContext = await new Promise<RunMachineContext>((resolve) => {
    const actor = createActor(runMachine, { input: runInput });
    actor.subscribe({ complete: () => resolve(actor.getSnapshot().context) });
    actor.start();
  });

  state = finalContext.workflowState;
  const errors = finalContext.errors;
  const tasksCompleted = finalContext.tasksCompleted;
  const storiesProcessed = finalContext.storiesProcessed;


  // 8. Final phase
  if (state.phase === 'interrupted') {
    // keep as-is
  } else if (errors.length === 0 && state.phase !== 'max-iterations' && state.phase !== 'circuit-breaker') {
    state = { ...state, phase: 'completed' };
    writeWorkflowState(state, projectDir);
  }

  const loopTerminated = state.phase === 'max-iterations' || state.phase === 'circuit-breaker';
  return {
    success: errors.length === 0 && !loopTerminated && state.phase !== 'interrupted',
    tasksCompleted,
    storiesProcessed: storiesProcessed.size,
    errors,
    durationMs: Date.now() - startMs,
  };
}

// ─── Error Handling ──────────────────────────────────────────────────

function recordErrorInState(state: WorkflowState, taskName: string, storyKey: string, error: EngineError): WorkflowState {
  const errorCheckpoint: TaskCheckpoint = {
    task_name: taskName, story_key: storyKey, completed_at: new Date().toISOString(),
    error: true, error_message: error.message, error_code: error.code,
  };
  return { ...state, phase: 'error', tasks_completed: [...state.tasks_completed, errorCheckpoint] };
}

function isEngineError(err: unknown): err is EngineError {
  if (!err || typeof err !== 'object') return false;
  const e = err as Record<string, unknown>;
  return typeof e.taskName === 'string' && typeof e.storyKey === 'string' && typeof e.code === 'string' && typeof e.message === 'string';
}

function handleDispatchError(err: unknown, taskName: string, storyKey: string): EngineError {
  if (err instanceof DispatchError) return { taskName, storyKey, code: err.code, message: err.message };
  const message = err instanceof Error ? err.message : String(err);
  return { taskName, storyKey, code: 'UNKNOWN', message };
}

// ─── Sentinel (exported for backward compat) ─────────────────────────

export const PER_RUN_SENTINEL = '__run__';
