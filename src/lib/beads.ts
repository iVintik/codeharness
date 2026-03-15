import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export class BeadsError extends Error {
  constructor(
    public readonly command: string,
    public readonly originalMessage: string,
  ) {
    super(`Beads failed: ${originalMessage}. Command: ${command}`);
    this.name = 'BeadsError';
  }
}

export interface BeadsCreateOpts {
  type?: string;
  priority?: number;
  description?: string;
  deps?: string[];
}

export interface BeadsIssue {
  id: string;
  title: string;
  status: string;
  type: string;
  priority: number;
  description?: string;
}

export interface BeadsHookDetection {
  hasHooks: boolean;
  hookTypes: string[];
}

/**
 * Runs a `bd` command with the given args, appends `--json` when needed,
 * parses JSON output, and wraps errors with context.
 */
export function bdCommand(args: string[]): unknown {
  const cmdStr = `bd ${args.join(' ')}`;
  let text: string;
  try {
    const output = execFileSync('bd', args, {
      stdio: 'pipe',
      timeout: 30_000,
    });
    text = output.toString().trim();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new BeadsError(cmdStr, message);
  }
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new BeadsError(cmdStr, `Invalid JSON output from bd: ${text}`);
  }
}

export function createIssue(title: string, opts?: BeadsCreateOpts): BeadsIssue {
  const args = ['create', title, '--json'];
  if (opts?.type) {
    args.push('--type', opts.type);
  }
  if (opts?.priority !== undefined) {
    args.push('--priority', String(opts.priority));
  }
  if (opts?.description) {
    args.push('--description', opts.description);
  }
  if (opts?.deps && opts.deps.length > 0) {
    for (const dep of opts.deps) {
      args.push('--dep', dep);
    }
  }
  return bdCommand(args) as BeadsIssue;
}

export function getReady(): BeadsIssue[] {
  return bdCommand(['ready', '--json']) as BeadsIssue[];
}

export function closeIssue(id: string): void {
  bdCommand(['close', id, '--json']);
}

export function updateIssue(id: string, opts: { status?: string; priority?: number }): void {
  const args = ['update', id, '--json'];
  if (opts.status !== undefined) {
    args.push('--status', opts.status);
  }
  if (opts.priority !== undefined) {
    args.push('--priority', String(opts.priority));
  }
  bdCommand(args);
}

export function listIssues(): BeadsIssue[] {
  return bdCommand(['list', '--json']) as BeadsIssue[];
}

export function isBeadsInitialized(dir?: string): boolean {
  const beadsDir = join(dir ?? process.cwd(), '.beads');
  return existsSync(beadsDir);
}

export function initBeads(dir?: string): void {
  if (isBeadsInitialized(dir)) {
    return;
  }
  const cmdStr = 'bd init';
  try {
    execFileSync('bd', ['init'], {
      stdio: 'pipe',
      timeout: 30_000,
      cwd: dir ?? process.cwd(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new BeadsError(cmdStr, message);
  }
}

export function detectBeadsHooks(dir?: string): BeadsHookDetection {
  const hooksDir = join(dir ?? process.cwd(), '.beads', 'hooks');
  if (!existsSync(hooksDir)) {
    return { hasHooks: false, hookTypes: [] };
  }

  try {
    const entries = readdirSync(hooksDir);
    const hookTypes = entries.filter(e => !e.startsWith('.'));
    return {
      hasHooks: hookTypes.length > 0,
      hookTypes,
    };
  } catch {
    return { hasHooks: false, hookTypes: [] };
  }
}

/**
 * Builds a gap-id tag string in the format `[gap:<category>:<identifier>]`.
 * Categories: coverage, docs, verification, bridge, test-failure.
 */
export function buildGapId(category: string, identifier: string): string {
  return `[gap:${category}:${identifier}]`;
}

/**
 * Scans an array of beads issues and returns the first non-done issue
 * whose description contains the given gap-id tag.
 */
export function findExistingByGapId(gapId: string, issues: BeadsIssue[]): BeadsIssue | undefined {
  return issues.find(
    issue => issue.status !== 'done' && issue.description?.includes(gapId),
  );
}

/**
 * Appends a gap-id tag to an existing description.
 * If description is empty/undefined, returns just the tag.
 * Uses newline separator.
 */
export function appendGapId(existingDescription: string | undefined, gapId: string): string {
  if (!existingDescription) {
    return gapId;
  }
  return `${existingDescription}\n${gapId}`;
}

/**
 * Creates a new beads issue or finds an existing one by gap-id.
 * Returns the issue and whether it was newly created.
 */
export function createOrFindIssue(
  title: string,
  gapId: string,
  opts?: BeadsCreateOpts,
): { issue: BeadsIssue; created: boolean } {
  const issues = listIssues();
  const existing = findExistingByGapId(gapId, issues);
  if (existing) {
    return { issue: existing, created: false };
  }
  const issue = createIssue(title, {
    ...opts,
    description: appendGapId(opts?.description, gapId),
  });
  return { issue, created: true };
}

export function configureHookCoexistence(dir?: string): void {
  const detection = detectBeadsHooks(dir);
  if (!detection.hasHooks) {
    return;
  }

  // Check if there are existing git hooks that might conflict
  const gitHooksDir = join(dir ?? process.cwd(), '.git', 'hooks');
  if (!existsSync(gitHooksDir)) {
    return;
  }

  // For now, detection and logging is the priority.
  // The actual chaining mechanism is a stretch goal per story notes.
  // The init command handles the logging via output utilities.
}
