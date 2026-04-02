import { mkdirSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { warn } from './output.js';
import type { DispatchOptions } from './agent-dispatch.js';

// --- Interfaces ---

/**
 * Options for creating an isolated workspace.
 */
export interface IsolationOptions {
  /** Unique run identifier used in the temp directory name. */
  runId: string;
  /** Absolute paths to story files to copy into the workspace. */
  storyFiles: string[];
}

/**
 * An isolated workspace with no source code — only story files and a verdict directory.
 */
export interface IsolatedWorkspace {
  /** Root directory of the isolated workspace. */
  dir: string;
  /** Directory containing copied story files. */
  storyFilesDir: string;
  /** Directory where the evaluator writes its verdict. */
  verdictDir: string;
  /** Returns DispatchOptions with cwd set to this workspace. */
  toDispatchOptions(): DispatchOptions;
  /** Remove the workspace from disk. Idempotent — safe to call multiple times. */
  cleanup(): Promise<void>;
}

// --- Helpers ---

/** Sanitize runId to prevent path traversal — allow only alphanumeric, dash, underscore, dot. */
function sanitizeRunId(runId: string): string {
  // Replace disallowed characters with underscores
  let sanitized = runId.replace(/[^a-zA-Z0-9._-]/g, '_');
  // Strip leading dots to prevent ".." path traversal
  sanitized = sanitized.replace(/^\.+/, '');
  if (sanitized.length === 0) {
    throw new Error('Source isolation: runId is empty after sanitization');
  }
  return sanitized;
}

/** Deduplicate a filename within a directory by appending a numeric suffix. */
function deduplicateFilename(dir: string, name: string): string {
  if (!existsSync(join(dir, name))) {
    return name;
  }
  const dotIdx = name.lastIndexOf('.');
  const stem = dotIdx > 0 ? name.slice(0, dotIdx) : name;
  const ext = dotIdx > 0 ? name.slice(dotIdx) : '';
  let counter = 1;
  let candidate: string;
  do {
    candidate = `${stem}-${counter}${ext}`;
    counter++;
  } while (existsSync(join(dir, candidate)));
  return candidate;
}

// --- Implementation ---

/**
 * Create an isolated workspace at /tmp/codeharness-verify-{runId}/.
 *
 * The workspace contains only:
 *   - story-files/  — copies of the provided story files
 *   - verdict/      — empty directory for evaluator output
 *
 * No source code, node_modules, package.json, or .git is present.
 * Missing story files are skipped with a warning (no throw).
 */
export async function createIsolatedWorkspace(
  options: IsolationOptions,
): Promise<IsolatedWorkspace> {
  const safeRunId = sanitizeRunId(options.runId);
  const dir = `/tmp/codeharness-verify-${safeRunId}`;
  const storyFilesDir = join(dir, 'story-files');
  const verdictDir = join(dir, 'verdict');

  // If workspace already exists from a previous crashed run, clean it first
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }

  // Create directory structure
  mkdirSync(storyFilesDir, { recursive: true });
  mkdirSync(verdictDir, { recursive: true });

  // Copy story files, skipping missing ones; deduplicate basenames
  for (const filePath of options.storyFiles) {
    if (!existsSync(filePath)) {
      warn(`Source isolation: story file not found, skipping: ${filePath}`);
      continue;
    }
    const name = deduplicateFilename(storyFilesDir, basename(filePath));
    const dest = join(storyFilesDir, name);
    copyFileSync(filePath, dest);
  }

  const workspace: IsolatedWorkspace = {
    dir,
    storyFilesDir,
    verdictDir,

    toDispatchOptions(): DispatchOptions {
      return { cwd: dir };
    },

    async cleanup(): Promise<void> {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };

  return workspace;
}
