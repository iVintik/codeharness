import { Command } from 'commander';
import { stringify } from 'yaml';
import {
  readState,
  readStateWithBody,
  writeState,
  getNestedValue,
  setNestedValue,
  parseValue,
  StateFileNotFoundError,
} from '../lib/state.js';
import { fail, info, jsonOutput } from '../lib/output.js';

export function registerStateCommand(program: Command): void {
  const stateCmd = program
    .command('state')
    .description('Manage harness state');

  stateCmd
    .command('show')
    .description('Display full harness state')
    .action((_, cmd) => {
      const opts = cmd.optsWithGlobals();
      try {
        const state = readState();
        if (opts.json) {
          jsonOutput(state as unknown as Record<string, unknown>);
        } else {
          info('Current state:');
          process.stdout.write(stringify(state, { nullStr: 'null' }));
        }
      } catch (err) {
        if (err instanceof StateFileNotFoundError) {
          fail("No state file found. Run 'codeharness init' first.", { json: opts.json });
          process.exitCode = 1;
        } else {
          throw err;
        }
      }
    });

  stateCmd
    .command('get <key>')
    .description('Get a state value by dot-notation key')
    .action((key: string, _, cmd) => {
      const opts = cmd.optsWithGlobals();
      try {
        const state = readState();
        const value = getNestedValue(state as unknown as Record<string, unknown>, key);
        if (value === undefined) {
          fail(`Key '${key}' not found in state.`, { json: opts.json });
          process.exitCode = 1;
        } else if (opts.json) {
          jsonOutput({ key, value: value as string });
        } else {
          process.stdout.write(`${String(value)}\n`);
        }
      } catch (err) {
        if (err instanceof StateFileNotFoundError) {
          fail("No state file found. Run 'codeharness init' first.", { json: opts.json });
          process.exitCode = 1;
        } else {
          throw err;
        }
      }
    });

  stateCmd
    .command('reset-session')
    .description('Reset all session flags to false')
    .action((_, cmd) => {
      const opts = cmd.optsWithGlobals();
      try {
        const { state, body } = readStateWithBody();
        state.session_flags.tests_passed = false;
        state.session_flags.coverage_met = false;
        state.session_flags.verification_run = false;
        state.session_flags.logs_queried = false;
        writeState(state, undefined, body);
        if (opts.json) {
          jsonOutput({
            status: 'ok',
            reset: {
              tests_passed: false,
              coverage_met: false,
              verification_run: false,
              logs_queried: false,
            },
          });
        } else {
          info('Session flags reset to false: tests_passed, coverage_met, verification_run, logs_queried');
        }
      } catch (err) {
        if (err instanceof StateFileNotFoundError) {
          fail("No state file found. Run 'codeharness init' first.", { json: opts.json });
          process.exitCode = 1;
        } else {
          throw err;
        }
      }
    });

  stateCmd
    .command('set <key> <value>')
    .description('Set a state value by dot-notation key')
    .action((key: string, rawValue: string, _, cmd) => {
      const opts = cmd.optsWithGlobals();
      try {
        const { state, body } = readStateWithBody();
        const parsed = parseValue(rawValue);
        setNestedValue(state as unknown as Record<string, unknown>, key, parsed);
        writeState(state, undefined, body);
        if (opts.json) {
          jsonOutput({ status: 'ok', key, value: parsed as string });
        } else {
          info(`Set ${key} = ${String(parsed)}`);
        }
      } catch (err) {
        if (err instanceof StateFileNotFoundError) {
          fail("No state file found. Run 'codeharness init' first.", { json: opts.json });
          process.exitCode = 1;
        } else {
          throw err;
        }
      }
    });
}
