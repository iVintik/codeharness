/**
 * Core logic for `codeharness verify-env` command group.
 * Manages Docker image lifecycle and clean workspace preparation
 * for black-box verification.
 *
 * Architecture Decision 8: CLI orchestrates all verification.
 * Architecture Decision 10: Two-layer isolation.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, cpSync, rmSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { info } from './output.js';
import { detectStack } from './stack-detect.js';
import { readStateWithBody, writeState } from './state.js';
import { isDockerAvailable } from './docker.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BuildOptions {
  projectDir?: string;
}

export interface BuildResult {
  imageTag: string;
  imageSize: string;
  buildTimeMs: number;
  cached: boolean;
}

export interface CheckResult {
  imageExists: boolean;
  cliWorks: boolean;
  otelReachable: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const IMAGE_TAG = 'codeharness-verify';
const STORY_DIR = '_bmad-output/implementation-artifacts';
const TEMP_PREFIX = '/tmp/codeharness-verify-';
const STATE_KEY_DIST_HASH = 'verify_env_dist_hash';

// ─── Story Key Validation ───────────────────────────────────────────────────

/**
 * Validates that a story key is safe for use in file paths and container names.
 * Rejects path traversal sequences and characters that could escape the project directory.
 */
export function isValidStoryKey(storyKey: string): boolean {
  if (!storyKey || storyKey.includes('..') || storyKey.includes('/') || storyKey.includes('\\')) {
    return false;
  }
  return /^[a-zA-Z0-9_-]+$/.test(storyKey);
}

// ─── dist/ Hash Computation ─────────────────────────────────────────────────

/**
 * Computes a SHA-256 hash of all files in the dist/ directory.
 * Used for cache invalidation — if the hash hasn't changed, the Docker
 * image doesn't need to be rebuilt.
 */
export function computeDistHash(projectDir: string): string | null {
  const distDir = join(projectDir, 'dist');
  if (!existsSync(distDir)) {
    return null;
  }

  const hash = createHash('sha256');
  const files = collectFiles(distDir).sort();

  for (const file of files) {
    const content = readFileSync(file);
    hash.update(file.slice(distDir.length)); // relative path
    hash.update(content);
  }

  return hash.digest('hex');
}

/**
 * Recursively collects all file paths under a directory.
 */
function collectFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

// ─── State Helpers ──────────────────────────────────────────────────────────

function getStoredDistHash(projectDir: string): string | null {
  try {
    const { state } = readStateWithBody(projectDir);
    const raw = state as unknown as Record<string, unknown>;
    return (raw[STATE_KEY_DIST_HASH] as string) ?? null;
  } catch {
    return null;
  }
}

function storeDistHash(projectDir: string, hash: string): void {
  try {
    const { state, body } = readStateWithBody(projectDir);
    const raw = state as unknown as Record<string, unknown>;
    raw[STATE_KEY_DIST_HASH] = hash;
    writeState(state, projectDir, body);
  } catch {
    // State file may not exist yet (e.g., before `codeharness init`).
    // Build still succeeds — cache just won't persist until next run.
    info('Could not persist dist hash to state file — cache will not be available until state is initialized');
  }
}

// ─── Build ──────────────────────────────────────────────────────────────────

/**
 * Builds the verification Docker image.
 * Uses npm pack to create a tarball (Node.js) or expects a dist file (Python),
 * then builds a Docker image that installs the project as a user would.
 *
 * Cache invalidation: skips build if dist/ content hash hasn't changed.
 */
export function buildVerifyImage(options: BuildOptions = {}): BuildResult {
  const projectDir = options.projectDir ?? process.cwd();

  // 1. Check Docker availability
  if (!isDockerAvailable()) {
    throw new Error('Docker is not available. Install Docker and ensure the daemon is running.');
  }

  // 2. Detect stack
  const stack = detectStack(projectDir);
  if (!stack) {
    throw new Error('Cannot detect project stack. Ensure package.json (Node.js) or requirements.txt/pyproject.toml (Python) exists.');
  }

  // 3. Check cache — compare dist/ hash
  const currentHash = computeDistHash(projectDir);
  if (!currentHash) {
    throw new Error('No dist/ directory found. Run your build command first (e.g., npm run build).');
  }

  const storedHash = getStoredDistHash(projectDir);
  if (storedHash === currentHash) {
    // Check if image actually exists
    if (dockerImageExists(IMAGE_TAG)) {
      const imageSize = getImageSize(IMAGE_TAG);
      return { imageTag: IMAGE_TAG, imageSize, buildTimeMs: 0, cached: true };
    }
    // Image doesn't exist even though hash matches — force rebuild
  }

  // 4. Build
  const startTime = Date.now();

  if (stack === 'nodejs') {
    buildNodeImage(projectDir);
  } else if (stack === 'python') {
    buildPythonImage(projectDir);
  } else {
    throw new Error(`Unsupported stack for verify-env: ${stack}`);
  }

  const buildTimeMs = Date.now() - startTime;

  // 5. Store hash
  storeDistHash(projectDir, currentHash);

  // 6. Get image size
  const imageSize = getImageSize(IMAGE_TAG);

  return { imageTag: IMAGE_TAG, imageSize, buildTimeMs, cached: false };
}

function buildNodeImage(projectDir: string): void {
  // Run npm pack to create a tarball
  const packOutput = execFileSync('npm', ['pack', '--pack-destination', '/tmp'], {
    cwd: projectDir,
    stdio: 'pipe',
    timeout: 60_000,
  }).toString().trim();

  // npm pack outputs the tarball filename on the last line
  const lastLine = packOutput.split('\n').pop()?.trim();
  if (!lastLine) {
    throw new Error('npm pack produced no output — cannot determine tarball filename.');
  }
  const tarballName = basename(lastLine);
  const tarballPath = join('/tmp', tarballName);

  // Create a temp build context directory
  const buildContext = join('/tmp', `codeharness-verify-build-${Date.now()}`);
  mkdirSync(buildContext, { recursive: true });

  try {
    // Copy tarball to build context
    cpSync(tarballPath, join(buildContext, tarballName));

    // Copy static Dockerfile from templates/
    const dockerfileSrc = resolveDockerfileTemplate(projectDir);
    cpSync(dockerfileSrc, join(buildContext, 'Dockerfile'));

    // Build image with tarball name as build arg
    execFileSync('docker', [
      'build', '-t', IMAGE_TAG,
      '--build-arg', `TARBALL=${tarballName}`,
      '.',
    ], {
      cwd: buildContext,
      stdio: 'pipe',
      timeout: 120_000,
    });
  } finally {
    // Clean up build context
    rmSync(buildContext, { recursive: true, force: true });
    // Clean up tarball
    rmSync(tarballPath, { force: true });
  }
}

function buildPythonImage(projectDir: string): void {
  // Find the dist file
  const distDir = join(projectDir, 'dist');
  const distFiles = readdirSync(distDir).filter(
    f => f.endsWith('.tar.gz') || f.endsWith('.whl'),
  );

  if (distFiles.length === 0) {
    throw new Error('No distribution files found in dist/. Run your build command first (e.g., python -m build).');
  }

  // Prefer .tar.gz over .whl, take the latest by name
  const distFile = distFiles.filter(f => f.endsWith('.tar.gz'))[0] ?? distFiles[0];

  // Create a temp build context directory
  const buildContext = join('/tmp', `codeharness-verify-build-${Date.now()}`);
  mkdirSync(buildContext, { recursive: true });

  try {
    // Copy dist file to build context
    cpSync(join(distDir, distFile), join(buildContext, distFile));

    // Copy static Dockerfile from templates/
    const dockerfileSrc = resolveDockerfileTemplate(projectDir);
    cpSync(dockerfileSrc, join(buildContext, 'Dockerfile'));

    // Build image with tarball name as build arg
    execFileSync('docker', [
      'build', '-t', IMAGE_TAG,
      '--build-arg', `TARBALL=${distFile}`,
      '.',
    ], {
      cwd: buildContext,
      stdio: 'pipe',
      timeout: 120_000,
    });
  } finally {
    // Clean up build context
    rmSync(buildContext, { recursive: true, force: true });
  }
}

// ─── Prepare ────────────────────────────────────────────────────────────────

/**
 * Creates a clean temp workspace for black-box verification.
 * Contains ONLY: story.md, README.md, docs/, verification/ (empty).
 * NO src/, tests/, .git/, node_modules/.
 */
export function prepareVerifyWorkspace(storyKey: string, projectDir?: string): string {
  const root = projectDir ?? process.cwd();

  if (!isValidStoryKey(storyKey)) {
    throw new Error(`Invalid story key: ${storyKey}. Keys must contain only alphanumeric characters, hyphens, and underscores.`);
  }

  // Resolve story file
  const storyFile = join(root, STORY_DIR, `${storyKey}.md`);
  if (!existsSync(storyFile)) {
    throw new Error(`Story file not found: ${storyFile}`);
  }

  // Create workspace
  const workspace = `${TEMP_PREFIX}${storyKey}`;

  // Remove existing workspace if any
  if (existsSync(workspace)) {
    rmSync(workspace, { recursive: true, force: true });
  }

  mkdirSync(workspace, { recursive: true });

  // Copy story file as story.md
  cpSync(storyFile, join(workspace, 'story.md'));

  // Copy README.md if exists
  const readmePath = join(root, 'README.md');
  if (existsSync(readmePath)) {
    cpSync(readmePath, join(workspace, 'README.md'));
  }

  // Copy docs/ if exists
  const docsDir = join(root, 'docs');
  if (existsSync(docsDir) && statSync(docsDir).isDirectory()) {
    cpSync(docsDir, join(workspace, 'docs'), { recursive: true });
  }

  // Create empty verification/ directory
  mkdirSync(join(workspace, 'verification'), { recursive: true });

  return workspace;
}

// ─── Check ──────────────────────────────────────────────────────────────────

/**
 * Validates the verification environment:
 * - Docker image exists
 * - CLI works inside the container
 * - Observability endpoints reachable from container
 */
export function checkVerifyEnv(): CheckResult {
  const result: CheckResult = {
    imageExists: false,
    cliWorks: false,
    otelReachable: false,
  };

  // 1. Check Docker image exists
  result.imageExists = dockerImageExists(IMAGE_TAG);

  if (!result.imageExists) {
    return result;
  }

  // 2. Check CLI works inside container
  try {
    execFileSync('docker', ['run', '--rm', IMAGE_TAG, 'codeharness', '--version'], {
      stdio: 'pipe',
      timeout: 30_000,
    });
    result.cliWorks = true;
  } catch {
    result.cliWorks = false;
  }

  // 3. Check observability endpoints reachable from container
  try {
    execFileSync('docker', [
      'run', '--rm',
      '--add-host=host.docker.internal:host-gateway',
      IMAGE_TAG,
      'curl', '-sf', '--max-time', '5',
      'http://host.docker.internal:4318/v1/status',
    ], {
      stdio: 'pipe',
      timeout: 30_000,
    });
    result.otelReachable = true;
  } catch {
    result.otelReachable = false;
  }

  return result;
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

/**
 * Removes the temp workspace and stops/removes the container for a story.
 * Idempotent — no error if workspace or container doesn't exist.
 */
export function cleanupVerifyEnv(storyKey: string): void {
  if (!isValidStoryKey(storyKey)) {
    throw new Error(`Invalid story key: ${storyKey}. Keys must contain only alphanumeric characters, hyphens, and underscores.`);
  }

  const workspace = `${TEMP_PREFIX}${storyKey}`;
  const containerName = `codeharness-verify-${storyKey}`;

  // Remove temp workspace
  if (existsSync(workspace)) {
    rmSync(workspace, { recursive: true, force: true });
  }

  // Stop and remove container if running
  try {
    execFileSync('docker', ['stop', containerName], {
      stdio: 'pipe',
      timeout: 15_000,
    });
  } catch {
    // Container may not exist — that's fine
  }

  try {
    execFileSync('docker', ['rm', '-f', containerName], {
      stdio: 'pipe',
      timeout: 15_000,
    });
  } catch {
    // Container may not exist — that's fine
  }
}

// ─── Dockerfile Resolution ──────────────────────────────────────────────────

/**
 * Finds the static Dockerfile.verify template.
 * Checks project templates/ first, then falls back to the installed package.
 */
function resolveDockerfileTemplate(projectDir: string): string {
  // Project-local template (allows customization)
  const local = join(projectDir, 'templates', 'Dockerfile.verify');
  if (existsSync(local)) return local;

  // Installed package template (npm global install path)
  const pkgDir = new URL('../../', import.meta.url).pathname;
  const pkg = join(pkgDir, 'templates', 'Dockerfile.verify');
  if (existsSync(pkg)) return pkg;

  throw new Error('Dockerfile.verify not found. Ensure templates/Dockerfile.verify exists in the project or installed package.');
}

// ─── Docker Helpers ─────────────────────────────────────────────────────────

function dockerImageExists(tag: string): boolean {
  try {
    execFileSync('docker', ['image', 'inspect', tag], {
      stdio: 'pipe',
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}

function getImageSize(tag: string): string {
  try {
    const output = execFileSync('docker', ['image', 'inspect', tag, '--format', '{{.Size}}'], {
      stdio: 'pipe',
      timeout: 10_000,
    }).toString().trim();

    const bytes = parseInt(output, 10);
    if (isNaN(bytes)) return output;

    // Format as human-readable
    if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)}GB`;
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)}MB`;
    if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)}KB`;
    return `${bytes}B`;
  } catch {
    return 'unknown';
  }
}
