/**
 * XState v5 Workflow Actors — engine interfaces, dispatch core, null-task actor, and actors.
 * XState v5 actor implementations. No circular import dependencies.
 */

import { fromPromise } from 'xstate';
import { join } from 'node:path';
import { warn } from './output.js';
import { DispatchError } from './agent-dispatch.js';
import type { DispatchErrorCode } from './agent-dispatch.js';
import { getDriver } from './agents/drivers/factory.js';
import { resolveModel } from './agents/model-resolver.js';
import type { OutputContract, DispatchOpts } from './agents/types.js';
import type { StreamEvent, ResultEvent, ToolStartEvent } from './agents/stream-parser.js';
import type { SubagentDefinition } from './agent-resolver.js';
import type { ResolvedWorkflow, ResolvedTask } from './workflow-parser.js';
import { buildPromptWithContractContext, writeOutputContract } from './agents/output-contract.js';
import { createIsolatedWorkspace } from './source-isolation.js';
import { generateTraceId, formatTracePrompt, recordTraceId } from './trace-id.js';
import { resolveSessionId, recordSessionId } from './session-manager.js';
import type { SessionLookupKey } from './session-manager.js';
import { getNullTask, listNullTasks } from './null-task-registry.js';
import type { TaskContext, NullTaskResult } from './null-task-registry.js';
import { readStateWithBody, writeState } from './state.js';
import { formatCoverageContextMessage } from './evaluator.js';
import { writeWorkflowState } from './workflow-state.js';
import type { WorkflowState, TaskCheckpoint } from './workflow-state.js';

// ─── Public Engine Interfaces ─────────────────────────────────────────

export interface EngineEvent {
  type: 'dispatch-start' | 'dispatch-end' | 'dispatch-error' | 'stream-event' | 'task-skip' | 'story-done' | 'epic-verified';
  taskName: string;
  storyKey: string;
  /** Whether an epic verification passed (only for type: 'epic-verified'). */
  verdictPassed?: boolean;
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

// ─── Dispatch Input/Output ────────────────────────────────────────────

export interface DispatchInput {
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

export interface DispatchOutput {
  output: string;
  cost: number;
  changedFiles: string[];
  sessionId: string;
  contract: OutputContract | null;
  updatedState: WorkflowState;
}

export interface NullTaskInput {
  task: ResolvedTask;
  taskName: string;
  storyKey: string;
  config: EngineConfig;
  workflowState: WorkflowState;
  previousContract: OutputContract | null;
  accumulatedCostUsd: number;
}

// ─── TASK_PROMPTS ─────────────────────────────────────────────────────

export const TASK_PROMPTS: Record<string, (key: string) => string> = {
  'create-story': (key) => `Create the story spec for ${key}. Read the epic definitions and architecture docs. Write a complete story file with acceptance criteria, tasks, and dev notes. CRITICAL: Every AC must be testable by a blind QA agent using ONLY a user guide + browser/API/CLI access. No AC should reference source code, internal data structures, or implementation details like O(1) complexity. Each AC must describe observable behavior that can be verified through UI interaction (agent-browser), API calls (curl), CLI commands (docker exec), or log inspection (docker logs). Wrap output in <story-spec>...</story-spec> tags.`,
  'implement': (key) => `Implement story ${key}`,
  'check': (key) => `Run automated checks for story ${key}. Execute the project's test suite and linter. Include <verdict>pass</verdict> or <verdict>fail</verdict> in your response.`,
  'review': (key) => `Review the implementation of story ${key}. Check for correctness, security issues, architecture violations, and AC coverage. Include <verdict>pass</verdict> or <verdict>fail</verdict> in your response. If fail, include <issues>...</issues>.`,
  'document': (key) => `Write user documentation for story ${key}. Describe what was built and how to use it from a user's perspective. No source code. Wrap documentation in <user-docs>...</user-docs> tags.`,
  'deploy': () => `Provision the Docker environment for this project. Check for docker-compose.yml, start containers, verify health. Wrap report in <deploy-report>...</deploy-report> tags with status, containers, URLs, credentials, health.`,
  'verify': () => `Verify the epic's stories using the user docs and deploy info in ./story-files/. For each AC, derive verification steps, run commands, observe output. Include <verdict>pass</verdict> or <verdict>fail</verdict>. Include <evidence ac="N" status="pass|fail|unknown">...</evidence> per AC. Include <quality-scores>...</quality-scores>.`,
  'retro': () => `Run a retrospective for this epic. Analyze what worked, what failed, patterns, and action items for next epic.`,
};

/** Tool names that indicate file writes. */
export const FILE_WRITE_TOOL_NAMES = new Set([
  'Write', 'Edit', 'write_to_file', 'edit_file',
  'write', 'edit', 'WriteFile', 'EditFile',
]);

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

// ─── Core Null Task Function ──────────────────────────────────────────

export async function nullTaskCore(input: NullTaskInput): Promise<DispatchOutput> {
  const { task: _task, taskName, storyKey, config, workflowState, previousContract, accumulatedCostUsd } = input;
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
    warn(`workflow-actors: flag propagation failed for ${taskName}: ${msg}`);
  }
}

// ─── Core Dispatch Function ───────────────────────────────────────────

export async function dispatchTaskCore(input: DispatchInput): Promise<DispatchOutput> {
  const { task, taskName, storyKey, definition, config, workflowState, previousContract, onStreamEvent, storyFiles, customPrompt } = input;
  const projectDir = config.projectDir ?? process.cwd();

  const traceId = generateTraceId(config.runId, workflowState.iteration, taskName);
  const tracePrompt = formatTracePrompt(traceId);
  const sessionKey: SessionLookupKey = { taskName, storyKey };
  const sessionId = resolveSessionId(task.session, sessionKey, workflowState);
  const driverName = task.driver ?? 'claude-code';
  const driver = getDriver(driverName);
  const model = resolveModel(task, { model: definition.model }, driver);

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

  const dispatchOpts: DispatchOpts = {
    prompt, model, cwd, sourceAccess: task.source_access !== false,
    ...(sessionId ? { sessionId } : {}),
    ...(tracePrompt ? { appendSystemPrompt: tracePrompt } : {}),
    ...((task.plugins ?? definition.plugins) ? { plugins: task.plugins ?? definition.plugins } : {}),
  };

  const emit = config.onEvent;
  if (emit) emit({ type: 'dispatch-start', taskName, storyKey, driverName, model });

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
      if (onStreamEvent) onStreamEvent(event, driverName);
      if (emit) emit({ type: 'stream-event', taskName, storyKey, driverName, streamEvent: event });
      if (event.type === 'text') output += event.text;
      if (event.type === 'tool-start') { const ts = event as ToolStartEvent; activeToolName = ts.name; activeToolInput = ''; }
      if (event.type === 'tool-input') activeToolInput += event.partial;
      if (event.type === 'tool-complete') {
        if (activeToolName && FILE_WRITE_TOOL_NAMES.has(activeToolName)) {
          try {
            const parsed = JSON.parse(activeToolInput) as Record<string, unknown>;
            const filePath = (parsed.file_path ?? parsed.path ?? parsed.filePath) as string | undefined;
            if (filePath && typeof filePath === 'string') changedFiles.push(filePath);
          } catch { /* IGNORE: tool input not valid JSON — changed-files tracking is best-effort */ }
        }
        activeToolName = null; activeToolInput = '';
      }
      if (event.type === 'result') {
        const r = event as ResultEvent;
        resultSessionId = r.sessionId; cost = r.cost;
        if (r.error) errorEvent = { error: r.error, errorCategory: r.errorCategory };
      }
    }
  } finally {
    if (workspace) await workspace.cleanup();
  }

  const elapsedMs = Date.now() - startMs;
  if (emit) emit({ type: 'dispatch-end', taskName, storyKey, driverName, elapsedMs, costUsd: cost });

  if (errorEvent) {
    const categoryToCode: Record<string, string> = {
      RATE_LIMIT: 'RATE_LIMIT', NETWORK: 'NETWORK', SDK_INIT: 'SDK_INIT',
      AUTH: 'UNKNOWN', TIMEOUT: 'UNKNOWN', UNKNOWN: 'UNKNOWN',
    };
    const code = categoryToCode[errorEvent.errorCategory ?? 'UNKNOWN'] ?? 'UNKNOWN';
    throw new DispatchError(errorEvent.error, code as DispatchErrorCode, definition.name, errorEvent);
  }

  let updatedState = workflowState;
  if (resultSessionId) {
    updatedState = recordSessionId(sessionKey, resultSessionId, updatedState);
  } else {
    const checkpoint: TaskCheckpoint = { task_name: taskName, story_key: storyKey, completed_at: new Date().toISOString() };
    updatedState = { ...updatedState, tasks_completed: [...updatedState.tasks_completed, checkpoint] };
  }
  updatedState = recordTraceId(traceId, updatedState);

  const durationMs = Date.now() - startMs;
  let contract: OutputContract | null = null;
  try {
    contract = {
      version: 1, taskName, storyId: storyKey, driver: driverName, model,
      timestamp: new Date().toISOString(), cost_usd: cost > 0 ? cost : null, duration_ms: durationMs,
      changedFiles: [...new Set(changedFiles)], testResults: null, output, acceptanceCriteria: [],
    };
    writeOutputContract(contract, join(projectDir, '.codeharness', 'contracts'));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`workflow-actors: failed to write output contract for ${taskName}/${storyKey}: ${msg}`);
    contract = null;
  }

  writeWorkflowState(updatedState, projectDir);
  propagateVerifyFlags(taskName, contract, projectDir);

  return { output, cost, changedFiles, sessionId: resultSessionId, contract, updatedState };
}

// ─── XState Dispatch Actors (fromPromise) ─────────────────────────────

export const dispatchActor = fromPromise(async ({ input }: { input: DispatchInput }): Promise<DispatchOutput> => dispatchTaskCore(input));

export const nullTaskDispatchActor = fromPromise(async ({ input }: { input: NullTaskInput }): Promise<DispatchOutput> => {
  return nullTaskCore(input);
});

/**
 * Factory that wraps a dispatch core function in a fromPromise XState actor.
 * Kept for backward compatibility / custom dispatch core overrides.
 */
export function makeDispatchActor(
  core: (input: DispatchInput) => Promise<DispatchOutput>,
) {
  return fromPromise(async ({ input }: { input: DispatchInput }): Promise<DispatchOutput> => core(input));
}

