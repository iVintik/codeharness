/**
 * Verification environment management: Docker image lifecycle, clean workspace,
 * and environment checks for black-box verification.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, cpSync, rmSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { info } from '../../lib/output.js';
import { detectStacks } from '../../lib/stacks/index.js';
import { readStateWithBody, writeState } from '../../lib/state.js';
import { isDockerAvailable } from '../../lib/docker/index.js';
import type { BuildOptions, BuildResult, CheckResult, ProjectType } from './types.js';
import { generateVerifyDockerfile } from './dockerfile-generator.js';

const IMAGE_TAG = 'codeharness-verify';
const STORY_DIR = '_bmad-output/implementation-artifacts';
const TEMP_PREFIX = '/tmp/codeharness-verify-';
const STATE_KEY_DIST_HASH = 'verify_env_dist_hash';

/** Validates that a story key is safe for file paths and container names. */
export function isValidStoryKey(storyKey: string): boolean {
  if (!storyKey || storyKey.includes('..') || storyKey.includes('/') || storyKey.includes('\\')) {
    return false;
  }
  return /^[a-zA-Z0-9_-]+$/.test(storyKey);
}

/** Computes a SHA-256 hash of all files in dist/ for cache invalidation. */
export function computeDistHash(projectDir: string): string | null {
  const distDir = join(projectDir, 'dist');
  if (!existsSync(distDir)) return null;
  const hash = createHash('sha256');
  const files = collectFiles(distDir).sort();
  for (const file of files) {
    hash.update(file.slice(distDir.length));
    hash.update(readFileSync(file));
  }
  return hash.digest('hex');
}

function collectFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) { results.push(...collectFiles(fullPath)); }
    else { results.push(fullPath); }
  }
  return results;
}

function getStoredDistHash(projectDir: string): string | null {
  try {
    const { state } = readStateWithBody(projectDir);
    return ((state as unknown as Record<string, unknown>)[STATE_KEY_DIST_HASH] as string) ?? null;
  } catch { return null; } // IGNORE: state file may not exist
}

function storeDistHash(projectDir: string, hash: string): void {
  try {
    const { state, body } = readStateWithBody(projectDir);
    (state as unknown as Record<string, unknown>)[STATE_KEY_DIST_HASH] = hash;
    writeState(state, projectDir, body);
  } catch {
    // IGNORE: state file may not be initialized yet
    info('Could not persist dist hash to state file — cache will not be available until state is initialized');
  }
}

/** Detects the project type for verification strategy selection. */
/** Stack names that map directly to ProjectType values. */
const STACK_TO_PROJECT_TYPE: Record<string, ProjectType> = {
  nodejs: 'nodejs',
  python: 'python',
  rust: 'rust',
};

export function detectProjectType(projectDir: string): ProjectType {
  // Use detectStacks() (plural) for multi-stack awareness; derive primary from root detection
  const allStacks = detectStacks(projectDir);
  const rootDetection = allStacks.find(s => s.dir === '.');
  const stack = rootDetection ? rootDetection.stack : null;
  // Prefer known stacks when the project has a buildable package — the npm tarball
  // or Python wheel includes all distributable files. Plugin-only detection is the
  // fallback for projects that are purely Claude Code plugins with no build artifact.
  if (stack && STACK_TO_PROJECT_TYPE[stack]) return STACK_TO_PROJECT_TYPE[stack];
  if (existsSync(join(projectDir, '.claude-plugin', 'plugin.json'))) return 'plugin';
  return 'generic';
}

/** Builds the verification Docker image with cache invalidation. */
export function buildVerifyImage(options: BuildOptions = {}): BuildResult {
  const projectDir = options.projectDir ?? process.cwd();
  if (!isDockerAvailable()) {
    throw new Error('Docker is not available. Install Docker and ensure the daemon is running.');
  }
  const projectType = detectProjectType(projectDir);
  const currentHash = computeDistHash(projectDir);
  /** Project types that don't require dist/ for verification image build */
  const NO_DIST_REQUIRED = new Set<ProjectType>(['generic', 'plugin', 'rust']);
  if (NO_DIST_REQUIRED.has(projectType)) {
    // Generic, plugin, and Rust projects may not have dist/ — skip hash check
  } else if (!currentHash) {
    throw new Error('No dist/ directory found. Run your build command first (e.g., npm run build).');
  }
  if (currentHash) {
    const storedHash = getStoredDistHash(projectDir);
    if (storedHash === currentHash && dockerImageExists(IMAGE_TAG)) {
      return { imageTag: IMAGE_TAG, imageSize: getImageSize(IMAGE_TAG), buildTimeMs: 0, cached: true };
    }
  }
  const startTime = Date.now();
  /** Per-project-type Docker image builders (no stack string comparisons). */
  const imageBuilders: Record<ProjectType, () => void> = {
    nodejs: () => buildNodeImage(projectDir),
    python: () => buildPythonImage(projectDir),
    rust: () => buildSimpleImage(projectDir, 300_000),
    plugin: () => buildPluginImage(projectDir),
    generic: () => buildSimpleImage(projectDir),
  };
  imageBuilders[projectType]();
  if (currentHash) { storeDistHash(projectDir, currentHash); }
  return { imageTag: IMAGE_TAG, imageSize: getImageSize(IMAGE_TAG), buildTimeMs: Date.now() - startTime, cached: false };
}

function buildNodeImage(projectDir: string): void {
  const packOutput = execFileSync('npm', ['pack', '--pack-destination', '/tmp'], {
    cwd: projectDir, stdio: 'pipe', timeout: 60_000,
  }).toString().trim();
  const lastLine = packOutput.split('\n').pop()?.trim();
  if (!lastLine) throw new Error('npm pack produced no output — cannot determine tarball filename.');
  const tarballName = basename(lastLine);
  const tarballPath = join('/tmp', tarballName);
  const buildContext = join('/tmp', `codeharness-verify-build-${Date.now()}`);
  mkdirSync(buildContext, { recursive: true });
  try {
    cpSync(tarballPath, join(buildContext, tarballName));
    const dockerfile = generateVerifyDockerfile(projectDir)
      + `\n# Install project from tarball\nARG TARBALL=package.tgz\nCOPY \${TARBALL} /tmp/\${TARBALL}\nRUN npm install -g /tmp/\${TARBALL} && rm /tmp/\${TARBALL}\n`;
    writeFileSync(join(buildContext, 'Dockerfile'), dockerfile);
    execFileSync('docker', ['build', '-t', IMAGE_TAG, '--build-arg', `TARBALL=${tarballName}`, '.'], {
      cwd: buildContext, stdio: 'pipe', timeout: 120_000,
    });
  } finally {
    rmSync(buildContext, { recursive: true, force: true });
    rmSync(tarballPath, { force: true });
  }
}

function buildPythonImage(projectDir: string): void {
  const distDir = join(projectDir, 'dist');
  const distFiles = readdirSync(distDir).filter(f => f.endsWith('.tar.gz') || f.endsWith('.whl'));
  if (distFiles.length === 0) {
    throw new Error('No distribution files found in dist/. Run your build command first (e.g., python -m build).');
  }
  const distFile = distFiles.filter(f => f.endsWith('.tar.gz'))[0] ?? distFiles[0];
  const buildContext = join('/tmp', `codeharness-verify-build-${Date.now()}`);
  mkdirSync(buildContext, { recursive: true });
  try {
    cpSync(join(distDir, distFile), join(buildContext, distFile));
    const dockerfile = generateVerifyDockerfile(projectDir)
      + `\n# Install project from distribution\nCOPY ${distFile} /tmp/${distFile}\nRUN pip install --break-system-packages /tmp/${distFile} && rm /tmp/${distFile}\n`;
    writeFileSync(join(buildContext, 'Dockerfile'), dockerfile);
    execFileSync('docker', ['build', '-t', IMAGE_TAG, '.'], {
      cwd: buildContext, stdio: 'pipe', timeout: 120_000,
    });
  } finally {
    rmSync(buildContext, { recursive: true, force: true });
  }
}

/** Creates a clean temp workspace for verification (no src/, tests/, .git/). */
export function prepareVerifyWorkspace(storyKey: string, projectDir?: string): string {
  const root = projectDir ?? process.cwd();
  if (!isValidStoryKey(storyKey)) {
    throw new Error(`Invalid story key: ${storyKey}. Keys must contain only alphanumeric characters, hyphens, and underscores.`);
  }
  const storyFile = join(root, STORY_DIR, `${storyKey}.md`);
  if (!existsSync(storyFile)) throw new Error(`Story file not found: ${storyFile}`);
  const workspace = `${TEMP_PREFIX}${storyKey}`;
  if (existsSync(workspace)) rmSync(workspace, { recursive: true, force: true });
  mkdirSync(workspace, { recursive: true });
  cpSync(storyFile, join(workspace, 'story.md'));
  const readmePath = join(root, 'README.md');
  if (existsSync(readmePath)) cpSync(readmePath, join(workspace, 'README.md'));
  const docsDir = join(root, 'docs');
  if (existsSync(docsDir) && statSync(docsDir).isDirectory()) {
    cpSync(docsDir, join(workspace, 'docs'), { recursive: true });
  }
  mkdirSync(join(workspace, 'verification'), { recursive: true });
  return workspace;
}

/** Validates verification environment: image, CLI, observability. */
export function checkVerifyEnv(): CheckResult {
  let imageExists = false;
  let cliWorks = false;
  let otelReachable = false;

  imageExists = dockerImageExists(IMAGE_TAG);
  if (!imageExists) return { imageExists, cliWorks, otelReachable };
  try {
    execFileSync('docker', ['run', '--rm', IMAGE_TAG, 'codeharness', '--help'], {
      stdio: 'pipe', timeout: 30_000,
    });
    cliWorks = true;
  } catch { cliWorks = false; } // IGNORE: CLI check failed in container
  try {
    execFileSync('docker', [
      'run', '--rm', '--add-host=host.docker.internal:host-gateway', IMAGE_TAG,
      'curl', '-sf', '--max-time', '5', 'http://host.docker.internal:4318/v1/status',
    ], { stdio: 'pipe', timeout: 30_000 });
    otelReachable = true;
  } catch { otelReachable = false; } // IGNORE: OTEL endpoint unreachable in container
  return { imageExists, cliWorks, otelReachable };
}

/** Cleans up all stale containers matching `codeharness-verify-*` pattern. Idempotent. */
export function cleanupStaleContainers(): void {
  try {
    const output = execFileSync(
      'docker', ['ps', '-a', '--filter', 'name=codeharness-verify-', '--format', '{{.Names}}'],
      { stdio: 'pipe', timeout: 15_000 },
    ).toString('utf-8').trim();
    if (output.length === 0) return;
    const containers = output.split('\n').filter(name => name.length > 0);
    for (const name of containers) {
      try {
        execFileSync('docker', ['rm', '-f', name], { stdio: 'pipe', timeout: 15_000 });
      } catch { /* IGNORE: container may already be removed */ }
    }
  } catch { /* IGNORE: docker not available or no containers */ }
}

/** Removes temp workspace and stops/removes the container. Idempotent. */
export function cleanupVerifyEnv(storyKey: string): void {
  if (!isValidStoryKey(storyKey)) {
    throw new Error(`Invalid story key: ${storyKey}. Keys must contain only alphanumeric characters, hyphens, and underscores.`);
  }
  const workspace = `${TEMP_PREFIX}${storyKey}`;
  const containerName = `codeharness-verify-${storyKey}`;
  if (existsSync(workspace)) rmSync(workspace, { recursive: true, force: true });
  try { execFileSync('docker', ['stop', containerName], { stdio: 'pipe', timeout: 15_000 }); }
  catch { /* IGNORE: container may not exist */ }
  try { execFileSync('docker', ['rm', '-f', containerName], { stdio: 'pipe', timeout: 15_000 }); }
  catch { /* IGNORE: container may not exist */ }
}

function buildPluginImage(projectDir: string): void {
  const buildContext = join('/tmp', `codeharness-verify-build-${Date.now()}`);
  mkdirSync(buildContext, { recursive: true });
  try {
    // Copy plugin source into build context
    const pluginDir = join(projectDir, '.claude-plugin');
    cpSync(pluginDir, join(buildContext, '.claude-plugin'), { recursive: true });
    // Copy any commands, hooks, knowledge, skills directories if they exist
    for (const dir of ['commands', 'hooks', 'knowledge', 'skills']) {
      const src = join(projectDir, dir);
      if (existsSync(src) && statSync(src).isDirectory()) {
        cpSync(src, join(buildContext, dir), { recursive: true });
      }
    }
    writeFileSync(join(buildContext, 'Dockerfile'), generateVerifyDockerfile(projectDir));
    execFileSync('docker', ['build', '-t', IMAGE_TAG, '.'], {
      cwd: buildContext, stdio: 'pipe', timeout: 120_000,
    });
  } finally {
    rmSync(buildContext, { recursive: true, force: true });
  }
}

function buildSimpleImage(projectDir: string, timeout = 120_000): void {
  const buildContext = join('/tmp', `codeharness-verify-build-${Date.now()}`);
  mkdirSync(buildContext, { recursive: true });
  try {
    writeFileSync(join(buildContext, 'Dockerfile'), generateVerifyDockerfile(projectDir));
    execFileSync('docker', ['build', '-t', IMAGE_TAG, '.'], {
      cwd: buildContext, stdio: 'pipe', timeout,
    });
  } finally {
    rmSync(buildContext, { recursive: true, force: true });
  }
}


function dockerImageExists(tag: string): boolean {
  try {
    execFileSync('docker', ['image', 'inspect', tag], { stdio: 'pipe', timeout: 10_000 });
    return true;
  } catch { return false; } // IGNORE: docker image inspect may fail
}

function getImageSize(tag: string): string {
  try {
    const output = execFileSync('docker', ['image', 'inspect', tag, '--format', '{{.Size}}'], {
      stdio: 'pipe', timeout: 10_000,
    }).toString().trim();
    const bytes = parseInt(output, 10);
    if (isNaN(bytes)) return output;
    if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)}GB`;
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)}MB`;
    if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)}KB`;
    return `${bytes}B`;
  } catch { return 'unknown'; } // IGNORE: docker inspect may fail
}
