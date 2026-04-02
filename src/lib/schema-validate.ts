import Ajv from 'ajv';
import workflowSchema from '../schemas/workflow.schema.json';

// --- Interfaces ---

export interface ValidationError {
  path: string;
  message: string;
  keyword: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// --- Validation ---

const ajv = new Ajv({ allErrors: true });
const validateWorkflow = ajv.compile(workflowSchema);

/**
 * Validate data against a JSON schema.
 * Schema-agnostic: pass any compiled Ajv ValidateFunction.
 */
export function validateAgainstSchema(
  data: unknown,
  validate: ReturnType<typeof ajv.compile>,
): ValidationResult {
  const valid = validate(data);

  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors: ValidationError[] = (validate.errors ?? []).map((err) => ({
    path: err.instancePath || '/',
    message: err.message ?? 'Unknown validation error',
    keyword: err.keyword,
  }));

  return { valid: false, errors };
}

/**
 * Validate data against the workflow YAML schema.
 * Primary entry point for workflow validation.
 */
export function validateWorkflowSchema(data: unknown): ValidationResult {
  return validateAgainstSchema(data, validateWorkflow);
}
