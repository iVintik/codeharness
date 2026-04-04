import Ajv from 'ajv';
import verdictSchema from '../schemas/verdict.schema.json';

// --- Interfaces ---

/**
 * Evaluator verdict returned by a verify task (AD5).
 */
export interface EvaluatorVerdict {
  verdict: 'pass' | 'fail';
  score: {
    passed: number;
    failed: number;
    unknown: number;
    total: number;
  };
  findings: Array<{
    ac: number;
    description: string;
    status: 'pass' | 'fail' | 'unknown';
    evidence: {
      commands_run: string[];
      output_observed: string;
      reasoning: string;
    };
  }>;
  evaluator_trace_id?: string;
  duration_seconds?: number;
}

/**
 * Result of verdict validation.
 */
export interface VerdictValidationResult {
  valid: boolean;
  errors?: string[];
  verdict?: EvaluatorVerdict;
}

// --- Errors ---

/**
 * Error thrown when verdict parsing fails.
 * `retryable: true` signals the caller should re-dispatch the evaluator.
 * `retryable: false` signals no further retries should be attempted.
 */
export class VerdictParseError extends Error {
  public readonly retryable: boolean;
  public readonly rawOutput: string;
  public readonly validationErrors?: string[];

  constructor(
    message: string,
    retryable: boolean,
    rawOutput: string,
    validationErrors?: string[],
  ) {
    super(message);
    // Restore prototype chain for proper instanceof checks in transpiled output
    Object.setPrototypeOf(this, VerdictParseError.prototype);
    this.name = 'VerdictParseError';
    this.retryable = retryable;
    this.rawOutput = rawOutput;
    this.validationErrors = validationErrors;
  }
}

// --- Schema Validator (compiled once at module load) ---

const ajv = new Ajv({ allErrors: true });
const validateSchema = ajv.compile(verdictSchema);

// --- Functions ---

/**
 * Validate an unknown value against the verdict JSON schema.
 * Returns a VerdictValidationResult with typed verdict on success,
 * or error messages on failure.
 */
export function validateVerdict(data: unknown): VerdictValidationResult {
  const valid = validateSchema(data);

  if (valid) {
    // Return a deep copy to prevent callers from mutating the original input
    const verdict = JSON.parse(JSON.stringify(data)) as EvaluatorVerdict;
    return { valid: true, verdict };
  }

  const errors = (validateSchema.errors ?? []).map((err) => {
    const path = err.instancePath || '/';
    return `${path}: ${err.message ?? 'unknown error'}`;
  });

  return { valid: false, errors };
}

/**
 * Parse raw evaluator output into a typed EvaluatorVerdict.
 *
 * On success: returns a fully typed EvaluatorVerdict with PASS-evidence
 * invariant enforced (PASS findings without commands_run are downgraded
 * to UNKNOWN).
 *
 * On failure: throws VerdictParseError with `retryable: true`.
 * The caller (workflow engine) decides whether to retry. On a second
 * failure, the caller should catch and generate an all-UNKNOWN verdict.
 */
export function parseVerdict(output: string): EvaluatorVerdict {
  // Step 1: JSON.parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch { // IGNORE: invalid JSON — rethrow as VerdictParseError
    throw new VerdictParseError(
      'Failed to parse verdict: invalid JSON',
      true,
      output,
    );
  }

  // Step 2: Schema validation
  const result = validateVerdict(parsed);
  if (!result.valid) {
    throw new VerdictParseError(
      `Failed to parse verdict: schema validation failed`,
      true,
      output,
      result.errors,
    );
  }

  const verdict = result.verdict!;

  // Step 3: Enforce PASS-evidence invariant (AD5 / FR26)
  // If a finding has status 'pass' but empty commands_run, downgrade to 'unknown'.
  let passDowngraded = false;
  for (const finding of verdict.findings) {
    if (
      finding.status === 'pass' &&
      (!finding.evidence.commands_run || finding.evidence.commands_run.length === 0)
    ) {
      finding.status = 'unknown';
      finding.evidence.reasoning +=
        ' [Downgraded from PASS: no commands_run evidence provided]';
      passDowngraded = true;
    }
  }

  // Step 4: Recalculate score if any findings were downgraded
  if (passDowngraded) {
    let passed = 0;
    let failed = 0;
    let unknown = 0;
    for (const finding of verdict.findings) {
      if (finding.status === 'pass') passed++;
      else if (finding.status === 'fail') failed++;
      else unknown++;
    }
    verdict.score = {
      passed,
      failed,
      unknown,
      total: verdict.findings.length,
    };

    // Flip verdict to 'fail' if no PASSes remain
    if (passed === 0) {
      verdict.verdict = 'fail';
    }
  }

  return verdict;
}

/**
 * Lightweight verdict parser for non-evaluator loop tasks (negotiator, reviewer).
 *
 * Extracts a simple `{ "verdict": "pass"|"fail" }` from anywhere in the output.
 * Does NOT require the full EvaluatorVerdict schema. Returns null if no verdict
 * JSON is found — the caller decides how to handle (typically: treat as "no verdict").
 */
export function parseSimpleVerdict(output: string): { verdict: 'pass' | 'fail' } | null {
  // Try to find a JSON object containing a verdict field anywhere in the output
  const jsonPattern = /\{[^{}]*"verdict"\s*:\s*"(pass|fail)"[^{}]*\}/;
  const match = jsonPattern.exec(output);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]) as { verdict?: string };
    if (parsed.verdict === 'pass' || parsed.verdict === 'fail') {
      return { verdict: parsed.verdict };
    }
  } catch { // IGNORE: malformed JSON match — return null
  }
  return null;
}
