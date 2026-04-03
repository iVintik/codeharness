/**
 * Cross-Worktree Validator.
 *
 * Encapsulates the test-run-after-merge logic extracted from
 * worktree-manager.ts and merge-agent.ts. Both modules delegate
 * to validateMerge() instead of maintaining their own runTestSuite
 * and parseTestOutput implementations.
 *
 * @see Story 18-3: Cross-Worktree Test Validation
 */

import { exec } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

import type { TelemetryEntry } from './telemetry-writer.js';

const execAsync = promisify(exec);

/** 10 MB — generous buffer for verbose test + coverage output. */
const MAX_BUFFER = 10 * 1024 * 1024;

// --- Interfaces ---

/**
 * Options for running post-merge test validation.
 */
export interface ValidateMergeOptions {
  /** Command to run for test validation. */
  readonly testCommand: string;
  /** Working directory to run the test command in. */
  readonly cwd: string;
  /** Epic identifier for telemetry. */
  readonly epicId: string;
  /** Optional story key override for telemetry (defaults to `merge-{epicId}`). */
  readonly storyKey?: string;
  /** Whether to write a telemetry entry after the test suite completes. */
  readonly writeTelemetry: boolean;
}

/**
 * Result of a post-merge test validation.
 */
export interface ValidationResult {
  /** Whether all tests passed (passed > 0 and failed === 0). */
  readonly valid: boolean;
  /** Parsed test results: pass/fail counts and coverage (null if not reported). */
  readonly testResults: { passed: number; failed: number; coverage: number | null };
  /** Raw test command stdout+stderr for retry context. */
  readonly output: string;
  /** Wall-clock duration of the test run in milliseconds. */
  readonly durationMs: number;
}

// --- Constants ---

const TELEMETRY_DIR = '.codeharness';
const TELEMETRY_FILE = 'telemetry.jsonl';
const TEST_TIMEOUT_MS = 300_000; // 5 minutes

// --- Test Output Parsing ---

/**
 * Parse test output to extract pass/fail counts and optional coverage.
 * Supports vitest/jest output patterns.
 */
export function parseTestOutput(stdout: string): { passed: number; failed: number; coverage: number | null } {
  let passed = 0;
  let failed = 0;
  let coverage: number | null = null;

  const passMatch = stdout.match(/(\d+)\s+passed/);
  const failMatch = stdout.match(/(\d+)\s+failed/);
  if (passMatch) passed = parseInt(passMatch[1], 10);
  if (failMatch) failed = parseInt(failMatch[1], 10);

  const covMatch = stdout.match(/All files[^|]*\|\s*([\d.]+)/);
  if (covMatch) coverage = parseFloat(covMatch[1]);

  return { passed, failed, coverage };
}

// --- Telemetry ---

/**
 * Write a merge validation telemetry entry to the NDJSON telemetry file.
 * Failures are silently caught — telemetry must never break validation.
 *
 * Exported so callers (e.g., merge-agent) can defer telemetry writes
 * until they know whether the validation is final (success or last attempt).
 */
export function writeMergeTelemetry(opts: ValidateMergeOptions, result: ValidationResult): void {
  try {
    const entry: TelemetryEntry = {
      version: 1,
      timestamp: new Date().toISOString(),
      storyKey: opts.storyKey ?? `merge-${opts.epicId}`,
      epicId: opts.epicId,
      duration_ms: result.durationMs,
      cost_usd: null,
      attempts: null,
      acResults: null,
      filesChanged: [],
      testResults: result.testResults,
      errors: result.valid ? [] : ['Test suite failed after merge'],
    };

    const dir = join(opts.cwd, TELEMETRY_DIR);
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, TELEMETRY_FILE), JSON.stringify(entry) + '\n');
  } catch { // IGNORE: telemetry write failure must not break validation
  }
}

// --- Main Entry Point ---

/**
 * Run test validation after a merge and optionally write telemetry.
 *
 * Executes the configured test command, parses the output for
 * pass/fail/coverage, and returns a ValidationResult. When
 * writeTelemetry is true, appends an NDJSON entry to the
 * telemetry file.
 *
 * @param opts  Validation options including test command and cwd.
 * @returns Validation result with test results and raw output.
 */
export async function validateMerge(opts: ValidateMergeOptions): Promise<ValidationResult> {
  const start = Date.now();

  try {
    const { stdout, stderr } = await execAsync(opts.testCommand, {
      cwd: opts.cwd,
      timeout: TEST_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
    });

    const combined = stdout + (stderr ? '\n' + stderr : '');
    const testResults = parseTestOutput(combined);
    const result: ValidationResult = {
      valid: testResults.failed === 0 && testResults.passed > 0,
      testResults,
      output: combined,
      durationMs: Date.now() - start,
    };

    if (opts.writeTelemetry) {
      writeMergeTelemetry(opts, result);
    }

    return result;
  } catch (err: unknown) {
    const stdout = (err as { stdout?: string })?.stdout ?? '';
    const stderr = (err as { stderr?: string })?.stderr ?? '';
    const combined = stdout + (stderr ? '\n' + stderr : '');
    const testResults = parseTestOutput(combined);

    // If we couldn't parse anything, report 1 failure
    if (testResults.passed === 0 && testResults.failed === 0) {
      const result: ValidationResult = {
        valid: false,
        testResults: { passed: 0, failed: 1, coverage: null },
        output: combined || 'Test command failed with no output',
        durationMs: Date.now() - start,
      };

      if (opts.writeTelemetry) {
        writeMergeTelemetry(opts, result);
      }

      return result;
    }

    const result: ValidationResult = {
      valid: false,
      testResults,
      output: combined,
      durationMs: Date.now() - start,
    };

    if (opts.writeTelemetry) {
      writeMergeTelemetry(opts, result);
    }

    return result;
  }
}
