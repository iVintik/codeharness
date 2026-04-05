/**
 * CLI command: codeharness validate
 * Parent command with subcommands: schema, self
 * - validate schema: validate workflow YAML files against JSON schemas (Story 2-5)
 * - validate self: run self-validation cycle and produce release gate report (Story 10-3)
 * - validate (no subcommand): defaults to schema validation
 */
import { Command } from 'commander';
import { registerValidateSchemaCommand, runSchemaValidation, runSchemaValidationOnFile, renderSchemaResult } from './validate-schema.js';
import { registerValidateSelfCommand } from './validate-self.js';

export function registerValidateCommand(program: Command): void {
  const validateCmd = program
    .command('validate [file]')
    .description('Validate workflow YAML files (default) or run self-validation. Pass a file path to validate a single file.')
    .action((file: string | undefined, _opts: Record<string, unknown>, cmd: Command) => {
      // Default action when no subcommand given: run schema validation
      const isJson = (cmd.optsWithGlobals() as { json?: boolean }).json === true;
      const result = file
        ? runSchemaValidationOnFile(file)
        : runSchemaValidation(process.cwd());
      renderSchemaResult(result, isJson);
    });

  registerValidateSchemaCommand(validateCmd);
  registerValidateSelfCommand(validateCmd);
}
