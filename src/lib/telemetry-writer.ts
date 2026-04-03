/**
 * Telemetry Writer.
 *
 * Writes structured NDJSON telemetry entries after each story completes.
 * Entries are appended to `.codeharness/telemetry.jsonl` for later analysis
 * by epic retros — no per-session LLM cost.
 *
 * @see Story 16-3: Telemetry Writer
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ACStatus, TestResults } from './agents/types.js';
import type { TaskContext, NullTaskResult } from './null-task-registry.js';

// --- Interfaces ---

/**
 * Re-export TestResults as TestResultsSummary for backward compatibility.
 * Telemetry entries use the same shape as the agent driver's TestResults.
 */
export type TestResultsSummary = TestResults;

/**
 * Acceptance criteria result stored in telemetry.
 */
export interface ACResult {
  readonly id: string;
  readonly description: string;
  readonly status: string;
}

/**
 * A single telemetry entry written as one NDJSON line.
 */
export interface TelemetryEntry {
  version: 1;
  timestamp: string;
  storyKey: string;
  epicId: string;
  duration_ms: number;
  cost_usd: number | null;
  attempts: number | null;
  acResults: ACResult[] | null;
  filesChanged: string[];
  testResults: TestResultsSummary | null;
  errors: string[];
}

// --- Constants ---

const TELEMETRY_DIR = '.codeharness';
const TELEMETRY_FILE = 'telemetry.jsonl';

// --- Functions ---

/**
 * Extract epicId from a storyKey.
 * Pattern: `{epicNum}-{storyNum}-{slug}` -> `{epicNum}`.
 * Sentinel `__run__` -> `"unknown"`.
 */
function extractEpicId(storyKey: string): string {
  if (storyKey === '__run__') return 'unknown';
  const dash = storyKey.indexOf('-');
  if (dash === -1) return storyKey;
  return storyKey.slice(0, dash);
}

/**
 * Write a telemetry entry after a story completes.
 *
 * Appends one NDJSON line to `.codeharness/telemetry.jsonl`.
 * Creates the `.codeharness/` directory if it does not exist.
 */
export async function writeTelemetryEntry(ctx: TaskContext): Promise<NullTaskResult> {
  const epicId = extractEpicId(ctx.storyKey);
  const contract = ctx.outputContract;

  const entry: TelemetryEntry = {
    version: 1,
    timestamp: new Date().toISOString(),
    storyKey: ctx.storyKey,
    epicId,
    duration_ms: ctx.durationMs,
    cost_usd: ctx.cost ?? null,
    attempts: null,
    acResults: contract?.acceptanceCriteria
      ? (contract.acceptanceCriteria as readonly ACStatus[]).map((ac) => ({
          id: ac.id,
          description: ac.description,
          status: ac.status,
        }))
      : null,
    filesChanged: contract?.changedFiles ? [...contract.changedFiles] : [],
    testResults: contract?.testResults
      ? {
          passed: contract.testResults.passed,
          failed: contract.testResults.failed,
          coverage: contract.testResults.coverage,
        }
      : null,
    errors: [],
  };

  const dir = join(ctx.projectDir, TELEMETRY_DIR);
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, TELEMETRY_FILE), JSON.stringify(entry) + '\n');

  return { success: true, output: `telemetry: entry written for ${ctx.storyKey}` };
}

/**
 * Read telemetry entries for a specific epic.
 *
 * Returns entries whose `epicId` matches, in insertion order.
 * Returns `[]` if the file does not exist.
 * Skips corrupted (non-JSON) lines silently.
 */
export function readTelemetryForEpic(epicId: string, projectDir: string): TelemetryEntry[] {
  const filePath = join(projectDir, TELEMETRY_DIR, TELEMETRY_FILE);

  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim() !== '');
  const entries: TelemetryEntry[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as TelemetryEntry;
      if (parsed.epicId === epicId) {
        entries.push(parsed);
      }
    } catch { // IGNORE: corrupted NDJSON lines are expected and safely skipped per AC #10
      continue;
    }
  }

  return entries;
}
