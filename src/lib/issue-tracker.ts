/**
 * Issue tracker module — CRUD operations for `.codeharness/issues.yaml`.
 *
 * This is the write side of the issue tracker. The read side lives in
 * `workflow-engine.ts` → `loadWorkItems()`.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Issue {
  id: string;
  title: string;
  source: string;
  priority: string;
  status: string;
  created_at: string;
}

export interface IssuesFile {
  issues: Issue[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const VALID_STATUSES: ReadonlySet<string> = new Set([
  'backlog',
  'ready',
  'in-progress',
  'review',
  'verifying',
  'done',
  'failed',
  'blocked',
]);

export const VALID_PRIORITIES: ReadonlySet<string> = new Set([
  'low',
  'medium',
  'high',
  'critical',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ISSUES_REL_PATH = join('.codeharness', 'issues.yaml');

function issuesPath(dir: string): string {
  return join(dir, ISSUES_REL_PATH);
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Read issues from `.codeharness/issues.yaml`.
 * Returns `{ issues: [] }` if the file does not exist.
 */
export function readIssues(dir: string = process.cwd()): IssuesFile {
  const filePath = issuesPath(dir);
  if (!existsSync(filePath)) {
    return { issues: [] };
  }

  const raw = readFileSync(filePath, 'utf-8');
  const parsed = parse(raw) as Record<string, unknown> | null;

  if (!parsed || !Array.isArray(parsed.issues)) {
    return { issues: [] };
  }

  return { issues: parsed.issues as Issue[] };
}

/**
 * Write issues to `.codeharness/issues.yaml`.
 * Creates the `.codeharness/` directory if it does not exist.
 */
export function writeIssues(data: IssuesFile, dir: string = process.cwd()): void {
  const filePath = issuesPath(dir);
  const dirPath = join(dir, '.codeharness');

  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }

  writeFileSync(filePath, stringify(data, { nullStr: '' }), 'utf-8');
}

/**
 * Generate the next sequential issue ID from existing issues.
 * Format: `issue-NNN` (zero-padded 3 digits). Starts at `issue-001`.
 */
export function nextIssueId(existing: Issue[]): string {
  let max = 0;
  for (const issue of existing) {
    const match = issue.id.match(/^issue-(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > max) max = num;
    }
  }
  return `issue-${String(max + 1).padStart(3, '0')}`;
}

/**
 * Create a new issue and persist it to `.codeharness/issues.yaml`.
 */
/**
 * Create a new issue and persist it to `.codeharness/issues.yaml`.
 * Throws if `priority` is not in VALID_PRIORITIES.
 */
export function createIssue(
  title: string,
  options?: { priority?: string; source?: string },
  dir?: string,
): Issue {
  const baseDir = dir ?? process.cwd();
  const priority = options?.priority ?? 'medium';

  if (!VALID_PRIORITIES.has(priority)) {
    throw new Error(`Invalid priority '${priority}'. Valid values: ${[...VALID_PRIORITIES].join(', ')}`);
  }

  const data = readIssues(baseDir);

  const issue: Issue = {
    id: nextIssueId(data.issues),
    title,
    source: options?.source ?? 'manual',
    priority,
    status: 'backlog',
    created_at: new Date().toISOString(),
  };

  data.issues.push(issue);
  writeIssues(data, baseDir);

  return issue;
}

/**
 * Close an issue by setting its status to `done`.
 * Throws if the issue ID is not found.
 */
export function closeIssue(id: string, dir?: string): Issue {
  const baseDir = dir ?? process.cwd();
  const data = readIssues(baseDir);

  const issue = data.issues.find((i) => i.id === id);
  if (!issue) {
    throw new Error(`Issue '${id}' not found`);
  }

  issue.status = 'done';
  writeIssues(data, baseDir);

  return issue;
}
