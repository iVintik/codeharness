/**
 * Flow Bridge — thin adapter between codeharness and flow's executeWorkflow().
 *
 * Responsibilities:
 * - Serialize GeneratedWorkflow → YAML and hand off to flow's parser
 * - Invoke flow's executeWorkflow() via library import
 * - Wire stdout/stderr to codeharness event system
 * - Handle cancellation (AbortSignal → flow's cancellation controller)
 */

// @ts-expect-error — lilflow is a plain JS package without type declarations
import { executeWorkflow as flowExecuteWorkflow, parseWorkflowContent } from 'lilflow/src/run-workflow.js';
import { stringify as yamlStringify } from 'yaml';
import { join } from 'node:path';
import type { GeneratedWorkflow } from './workflow-generator.js';
import type { EngineEvent, EngineResult, EngineError } from './workflow-types.js';

/** Output captured from a completed flow step. */
export interface CapturedStepOutput {
  stepIndex: number;
  name: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Options for running a workflow through flow. */
export interface FlowBridgeOptions {
  workflow: GeneratedWorkflow;
  cwd: string;
  env?: Record<string, string | undefined>;
  onEvent?: (event: EngineEvent) => void;
  abortSignal?: AbortSignal;
  parallelism?: number;
  timeoutMs?: number;
  persist?: boolean;
  /**
   * If provided, flow will push each completed step's output into this array
   * during execution. Used by the gate command to inspect check task outputs.
   */
  capturedOutputs?: CapturedStepOutput[];
}

/**
 * Serialize a GeneratedWorkflow into a YAML string that flow's parser accepts.
 * This avoids the need to mirror flow's internal normalization logic.
 */
export function generatedWorkflowToYaml(workflow: GeneratedWorkflow): string {
  const doc: Record<string, unknown> = {
    name: workflow.name,
    ...(workflow.version ? { version: workflow.version } : {}),
    steps: workflow.steps.map((step) => {
      const out: Record<string, unknown> = { name: step.name };
      if (step.run !== undefined) out.run = step.run;
      if (step.agent !== undefined) out.agent = step.agent;
      if (step.retry !== undefined) out.retry = step.retry;
      if (step.retry_delay !== undefined) out.retry_delay = step.retry_delay;
      if (step.timeout !== undefined) out.timeout = step.timeout;
      return out;
    }),
  };
  return yamlStringify(doc);
}

/**
 * Execute a generated workflow through flow's engine.
 */
export async function runFlowWorkflow(options: FlowBridgeOptions): Promise<EngineResult> {
  const {
    workflow,
    cwd,
    env = process.env as Record<string, string | undefined>,
    onEvent,
    abortSignal,
    parallelism = 1,
    timeoutMs,
    persist = true,
    capturedOutputs,
  } = options;

  const startMs = Date.now();
  const errors: EngineError[] = [];
  let tasksCompleted = 0;

  // Serialize + parse through flow's own parser so we get the fully normalized
  // shape (stepType field, loopContext, etc.) without duplicating validation.
  const yaml = generatedWorkflowToYaml(workflow);
  let flowWorkflow;
  try {
    flowWorkflow = parseWorkflowContent(yaml, `generated:${workflow.name}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      tasksCompleted: 0,
      storiesProcessed: 0,
      errors: [{ taskName: 'flow', storyKey: '', code: 'WORKFLOW_PARSE_ERROR', message }],
      durationMs: Date.now() - startMs,
      finalPhase: 'failed',
      haltReason: message,
    };
  }

  // Route flow's stdout/stderr to our event system
  const stdout = (message: string): void => {
    if (onEvent) {
      if (message.includes('✓') || message.includes('completed')) {
        tasksCompleted++;
      }
      onEvent({
        type: 'stream-event',
        taskName: 'flow',
        storyKey: '',
        streamEvent: { type: 'text', text: message + '\n' },
      });
    }
  };

  const stderr = (message: string): void => {
    if (onEvent) {
      onEvent({
        type: 'dispatch-error',
        taskName: 'flow',
        storyKey: '',
        error: { code: 'FLOW_STDERR', message },
      });
    }
  };

  // No-op colorizer — codeharness handles its own colors
  const colorize = {
    success: (t: string) => t,
    start: (t: string) => t,
    error: (t: string) => t,
  };

  // Build cancellation controller from AbortSignal
  let cancellation: {
    cancel: (reason: string) => void;
    isCancelled: () => boolean;
    getReason: () => string | null;
    trackChild: (child: unknown) => () => void;
  } | null = null;

  if (abortSignal) {
    let cancelled = false;
    let reason: string | null = null;
    const children = new Set<{ kill: (signal: string) => void }>();

    cancellation = {
      cancel(r: string) {
        if (cancelled) return;
        cancelled = true;
        reason = r;
        for (const child of children) {
          child.kill('SIGTERM');
        }
      },
      isCancelled: () => cancelled,
      getReason: () => reason,
      trackChild(child: unknown) {
        const c = child as { kill: (signal: string) => void };
        children.add(c);
        return () => { children.delete(c); };
      },
    };

    if (abortSignal.aborted) {
      cancellation.cancel('Aborted before start');
    } else {
      abortSignal.addEventListener('abort', () => cancellation!.cancel('AbortSignal triggered'), { once: true });
    }
  }

  try {
    await flowExecuteWorkflow({
      workflow: flowWorkflow,
      // workflowPath is used for subflow path resolution; pass cwd/generated.yaml
      // so relative subflow references resolve from the project directory.
      workflowPath: join(cwd, 'generated.yaml'),
      cwd,
      env,
      stdout,
      stderr,
      colorize,
      parallelism,
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      eventLogger: persist ? undefined : null,
      cancellation,
      attachSignalHandlers: false,
      ...(capturedOutputs ? { completedStepOutputs: capturedOutputs } : {}),
    });

    const durationMs = Date.now() - startMs;
    return {
      success: true,
      tasksCompleted,
      storiesProcessed: 0,
      errors,
      durationMs,
      finalPhase: 'completed',
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - startMs;
    const message = err instanceof Error ? err.message : String(err);

    if (cancellation?.isCancelled()) {
      return {
        success: false,
        tasksCompleted,
        storiesProcessed: 0,
        errors,
        durationMs,
        finalPhase: 'interrupted',
        haltReason: cancellation.getReason() ?? 'cancelled',
        persistenceState: 'preserved',
      };
    }

    errors.push({
      taskName: 'flow',
      storyKey: '',
      code: 'FLOW_ERROR',
      message,
    });

    return {
      success: false,
      tasksCompleted,
      storiesProcessed: 0,
      errors,
      durationMs,
      finalPhase: 'failed',
      haltReason: message,
    };
  }
}
