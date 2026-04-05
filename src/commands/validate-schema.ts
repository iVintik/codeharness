/**
 * CLI subcommand: codeharness validate schema
 * Validates workflow YAML files against JSON schemas using parseWorkflow().
 * Story 2-5: Validate Command
 */
import { readdirSync, existsSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';
import { Command } from 'commander';
import { ok, fail, jsonOutput } from '../lib/output.js';
import { parseWorkflow, WorkflowParseError } from '../lib/workflow-parser.js';

export interface ValidateSchemaFileResult {
  path: string;
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
}

export interface ValidateSchemaResult {
  status: 'pass' | 'fail';
  files: ValidateSchemaFileResult[];
}

/**
 * Render schema validation result to console output or JSON.
 * Shared between default `validate` action and explicit `validate schema`.
 */
export function renderSchemaResult(result: ValidateSchemaResult, isJson: boolean): void {
  if (isJson) {
    jsonOutput(result as unknown as Record<string, unknown>);
    process.exitCode = result.status === 'pass' ? 0 : 1;
    return;
  }

  for (const file of result.files) {
    if (file.valid) {
      ok(`Schema: ${file.path}`);
    } else {
      fail(`Schema: ${file.path}`);
      for (const error of file.errors) {
        process.stderr.write(`  ${error.path}: ${error.message}\n`);
      }
    }
  }

  process.exitCode = result.status === 'pass' ? 0 : 1;
}

/**
 * Validate a single workflow file by explicit path.
 */
export function runSchemaValidationOnFile(filePath: string): ValidateSchemaResult {
  const absPath = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
  try {
    parseWorkflow(absPath);
    return { status: 'pass', files: [{ path: absPath, valid: true, errors: [] }] };
  } catch (err: unknown) {
    if (err instanceof WorkflowParseError) {
      return { status: 'fail', files: [{ path: absPath, valid: false, errors: err.errors }] };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'fail', files: [{ path: absPath, valid: false, errors: [{ path: absPath, message: msg }] }] };
  }
}

export function runSchemaValidation(projectDir: string): ValidateSchemaResult {
  const workflowsDir = join(projectDir, '.codeharness', 'workflows');

  if (!existsSync(workflowsDir)) {
    return {
      status: 'fail',
      files: [{
        path: workflowsDir,
        valid: false,
        errors: [{ path: workflowsDir, message: 'No workflow files found' }],
      }],
    };
  }

  let entries: string[];
  try {
    entries = readdirSync(workflowsDir)
      .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  } catch { // IGNORE: graceful fallback — treat unreadable dir as empty
    entries = [];
  }

  if (entries.length === 0) {
    return {
      status: 'fail',
      files: [{
        path: workflowsDir,
        valid: false,
        errors: [{ path: workflowsDir, message: 'No workflow files found' }],
      }],
    };
  }

  const fileResults: ValidateSchemaFileResult[] = [];
  let allValid = true;

  for (const entry of entries) {
    const filePath = resolve(workflowsDir, entry);
    try {
      parseWorkflow(filePath);
      fileResults.push({ path: filePath, valid: true, errors: [] });
    } catch (err: unknown) {
      allValid = false;
      if (err instanceof WorkflowParseError) {
        fileResults.push({ path: filePath, valid: false, errors: err.errors });
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        fileResults.push({ path: filePath, valid: false, errors: [{ path: filePath, message: msg }] });
      }
    }
  }

  return { status: allValid ? 'pass' : 'fail', files: fileResults };
}

export function registerValidateSchemaCommand(parent: Command): void {
  parent
    .command('schema [file]')
    .description('Validate workflow YAML files against JSON schemas. Pass a file path to validate a single file.')
    .action((file: string | undefined, _opts: Record<string, unknown>, cmd: Command) => {
      const isJson = (cmd.optsWithGlobals() as { json?: boolean }).json === true;
      const result = file
        ? runSchemaValidationOnFile(file)
        : runSchemaValidation(process.cwd());
      renderSchemaResult(result, isJson);
    });
}
