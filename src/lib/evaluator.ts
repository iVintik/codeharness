import type { SubagentDefinition } from './agent-resolver.js';
import type { DispatchResult } from './agent-dispatch.js';
import { dispatchAgent } from './agent-dispatch.js';
import { createIsolatedWorkspace } from './source-isolation.js';
import type { IsolatedWorkspace } from './source-isolation.js';
import { isDockerAvailable } from './docker/index.js';
import { formatTracePrompt } from './trace-id.js';

// --- Interfaces ---

/**
 * Options for running the blind evaluator.
 */
export interface EvaluatorOptions {
  /** Unique run identifier — used in workspace path and tracing. */
  runId: string;
  /** Absolute paths to story files containing acceptance criteria. */
  storyFiles: string[];
  /** Pre-compiled subagent definition for the evaluator agent. */
  agentDefinition: SubagentDefinition;
  /** Timeout in milliseconds for the evaluator dispatch. Default: 300000 (5 minutes). */
  timeoutMs?: number;
  /** Optional trace ID for correlation in logs/metrics. */
  traceId?: string;
}

/**
 * Result of an evaluator run.
 */
export interface EvaluatorResult {
  /** Raw agent output (or synthesized JSON for fallback cases). */
  output: string;
  /** Whether the evaluator completed successfully. */
  success: boolean;
  /** Wall-clock duration of the evaluator run in milliseconds. */
  durationMs: number;
  /** Whether Docker was available at the time of the run. */
  dockerAvailable: boolean;
  /** Whether the evaluator timed out. */
  timedOut: boolean;
}

// --- Constants ---

const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes

/**
 * Build the evaluator dispatch prompt from the compiled agent definition instructions.
 * The compiled SubagentDefinition.instructions already contain the prompt_template
 * from evaluator.yaml (appended by compileSubagentDefinition). This function adds
 * the minimal task-kick context that varies per dispatch — story file location and
 * output directory. The full anti-leniency prompt, evidence requirements, and output
 * format are in the instructions (system prompt), not duplicated here.
 */
function buildEvaluatorPrompt(): string {
  const parts: string[] = [];

  parts.push('Verify the acceptance criteria for this story.');
  parts.push('Story files are available in ./story-files/. Read each file to find the ACs.');
  parts.push('Write your verdict JSON output to ./verdict/verdict.json.');

  return parts.join('\n');
}

// --- Helpers ---

/**
 * Build a fallback output JSON string with all ACs scored UNKNOWN.
 */
function buildUnknownOutput(storyFiles: string[], reasoning: string): string {
  // We don't know how many ACs each story file has, so we produce
  // a single finding per story file with status unknown.
  const findings = storyFiles.map((_, index) => ({
    ac: index + 1,
    description: `AC #${index + 1}`,
    status: 'unknown' as const,
    evidence: {
      commands_run: [],
      output_observed: '',
      reasoning,
    },
  }));

  return JSON.stringify({
    verdict: 'fail',
    score: {
      passed: 0,
      failed: 0,
      unknown: findings.length,
      total: findings.length,
    },
    findings,
  });
}

// --- Main Function ---

/**
 * Run the blind evaluator lifecycle:
 *   1. Check Docker availability
 *   2. Create isolated workspace
 *   3. Dispatch evaluator agent (with timeout)
 *   4. Collect result
 *   5. Cleanup workspace
 *
 * Returns raw output for downstream parsing (story 6-2).
 * Does NOT throw on Docker unavailability or timeout — returns graceful UNKNOWN results.
 */
export async function runEvaluator(options: EvaluatorOptions): Promise<EvaluatorResult> {
  const startMs = Date.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Step 1: Check Docker availability
  const dockerAvailable = isDockerAvailable();
  if (!dockerAvailable) {
    return {
      output: buildUnknownOutput(
        options.storyFiles,
        'Docker is not available — cannot run verification commands.',
      ),
      success: false,
      durationMs: Date.now() - startMs,
      dockerAvailable: false,
      timedOut: false,
    };
  }

  // Step 2: Create isolated workspace
  let workspace: IsolatedWorkspace | undefined;
  try {
    workspace = await createIsolatedWorkspace({
      runId: options.runId,
      storyFiles: options.storyFiles,
    });

    // Step 3: Build dispatch options
    const dispatchOptions = workspace.toDispatchOptions();
    if (options.traceId) {
      dispatchOptions.appendSystemPrompt = formatTracePrompt(options.traceId);
    }

    // Step 4: Race dispatch against timeout
    const evaluatorPrompt = buildEvaluatorPrompt();
    const dispatchPromise = dispatchAgent(
      options.agentDefinition,
      evaluatorPrompt,
      dispatchOptions,
    );

    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutTimer = setTimeout(() => reject(new Error('Evaluator timeout')), timeoutMs);
    });

    let result: DispatchResult;
    try {
      result = await Promise.race([dispatchPromise, timeoutPromise]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'Evaluator timeout') {
        return {
          output: buildUnknownOutput(
            options.storyFiles,
            `Evaluator timed out after ${timeoutMs}ms.`,
          ),
          success: false,
          durationMs: Date.now() - startMs,
          dockerAvailable: true,
          timedOut: true,
        };
      }
      // Re-throw non-timeout errors
      throw err;
    } finally {
      // Clear the timeout timer to prevent Node.js process from hanging
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
      }
    }

    return {
      output: result.output,
      success: result.success,
      durationMs: Date.now() - startMs,
      dockerAvailable: true,
      timedOut: false,
    };
  } finally {
    // Step 5: Cleanup workspace (always)
    if (workspace) {
      await workspace.cleanup();
    }
  }
}
