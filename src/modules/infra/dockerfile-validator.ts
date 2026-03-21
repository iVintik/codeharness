/**
 * Dockerfile validator — checks Dockerfiles against 6 required rule categories.
 * Returns structured gaps for audit integration.
 *
 * FR23 (formalized Dockerfile rules), FR24 (audit validates against rules).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ok, fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';

/** A single gap found during Dockerfile validation */
export interface DockerfileGap {
  readonly rule: string;
  readonly description: string;
  readonly suggestedFix: string;
  readonly line?: number;
}

/** Result of validating a Dockerfile against all rules */
export interface DockerfileValidationResult {
  readonly passed: boolean;
  readonly gaps: DockerfileGap[];
  readonly warnings: string[];
}

/** Internal rules structure */
interface DockerfileRules {
  readonly requirePinnedFrom: boolean;
  readonly requireBinaryOnPath: boolean;
  readonly verificationTools: string[];
  readonly forbidSourceCopy: boolean;
  readonly requireNonRootUser: boolean;
  readonly requireCacheCleanup: boolean;
}

const DEFAULT_RULES: DockerfileRules = {
  requirePinnedFrom: true,
  requireBinaryOnPath: true,
  verificationTools: ['curl', 'jq'],
  forbidSourceCopy: true,
  requireNonRootUser: true,
  requireCacheCleanup: true,
};

function dfGap(rule: string, description: string, suggestedFix: string, line?: number): DockerfileGap {
  const g: DockerfileGap = { rule, description, suggestedFix };
  if (line !== undefined) return { ...g, line };
  return g;
}

/**
 * Load rules from patches/infra/dockerfile-rules.md or fall back to defaults.
 * The markdown is documentation — the actual rules are hardcoded defaults.
 * Returns rules + any warnings about missing file.
 */
export function loadRules(projectDir: string): { rules: DockerfileRules; warnings: string[] } {
  const rulesPath = join(projectDir, 'patches', 'infra', 'dockerfile-rules.md');
  if (!existsSync(rulesPath)) {
    return {
      rules: DEFAULT_RULES,
      warnings: ['dockerfile-rules.md not found -- using defaults.'],
    };
  }
  return { rules: DEFAULT_RULES, warnings: [] };
}

// ─── Rule checkers ──────────────────────────────────────────────────────────

function checkPinnedFrom(lines: string[]): DockerfileGap[] {
  const gaps: DockerfileGap[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*FROM\s+/i.test(lines[i])) continue;
    const ref = lines[i].replace(/^\s*FROM\s+/i, '').split(/\s+/)[0];
    if (ref.endsWith(':latest')) {
      gaps.push(dfGap('pinned-from', `unpinned base image -- use specific version.`, `Pin ${ref} to a specific version tag`, i + 1));
    } else if (!ref.includes(':') && !ref.includes('@')) {
      gaps.push(dfGap('pinned-from', `unpinned base image -- use specific version.`, `Pin ${ref} to a specific version tag (e.g., ${ref}:22-slim)`, i + 1));
    }
  }
  return gaps;
}

function checkBinaryOnPath(lines: string[]): DockerfileGap[] {
  const content = lines.join('\n');
  const hasBinary =
    /npm\s+install\s+(-g|--global)\b/i.test(content) ||
    /pip\s+install\b/i.test(content) ||
    /COPY\s+--from=/i.test(content);
  if (!hasBinary) {
    return [dfGap('binary-on-path', 'project binary not installed.', 'Add npm install -g, pip install, or COPY --from to install the project binary')];
  }
  return [];
}

function checkVerificationTools(lines: string[], tools: string[]): DockerfileGap[] {
  const gaps: DockerfileGap[] = [];
  for (const tool of tools) {
    let found = false;
    for (const line of lines) {
      const lower = line.toLowerCase();
      const isInstallLine = lower.includes('apt-get install') || lower.includes('apk add');
      if (isInstallLine && new RegExp(`\\b${tool.toLowerCase()}\\b`).test(lower)) {
        found = true;
        break;
      }
    }
    if (!found) {
      gaps.push(dfGap('verification-tools', `verification tool missing: ${tool}`, `Install ${tool} via apt-get install or apk add`));
    }
  }
  return gaps;
}

function checkNoSourceCopy(lines: string[]): DockerfileGap[] {
  const gaps: DockerfileGap[] = [];
  const sourcePatterns = [/COPY\s+(?:--\S+\s+)*src\//i, /COPY\s+(?:--\S+\s+)*lib\//i, /COPY\s+(?:--\S+\s+)*test\//i];
  for (let i = 0; i < lines.length; i++) {
    for (const pattern of sourcePatterns) {
      if (pattern.test(lines[i])) {
        gaps.push(dfGap('no-source-copy', 'source code copied into container -- use build artifact instead.', 'Use COPY --from=builder or COPY dist/ instead of copying source', i + 1));
      }
    }
  }
  return gaps;
}

function checkNonRootUser(lines: string[]): DockerfileGap[] {
  const userLines = lines.filter(l => /^\s*USER\s+/i.test(l));
  if (userLines.length === 0) {
    return [dfGap('non-root-user', 'no non-root USER instruction found.', 'Add USER <non-root-user> instruction (e.g., USER node)')];
  }
  const hasNonRoot = userLines.some(l => {
    const user = l.replace(/^\s*USER\s+/i, '').trim().split(/\s+/)[0];
    return user.toLowerCase() !== 'root';
  });
  if (!hasNonRoot) {
    return [dfGap('non-root-user', 'no non-root USER instruction found.', 'Add USER <non-root-user> instruction (e.g., USER node)')];
  }
  return [];
}

function checkCacheCleanup(lines: string[]): DockerfileGap[] {
  const content = lines.join('\n');
  const hasCleanup =
    /rm\s+-rf\s+\/var\/lib\/apt\/lists/i.test(content) ||
    /rm\s+-rf\s+\/var\/cache\/apk/i.test(content) ||
    /npm\s+cache\s+clean/i.test(content) ||
    /pip\s+cache\s+purge/i.test(content);
  if (!hasCleanup) {
    return [dfGap('cache-cleanup', 'no cache cleanup detected.', 'Add cache cleanup: rm -rf /var/lib/apt/lists/*, npm cache clean --force, or pip cache purge')];
  }
  return [];
}

// ─── Main validator ─────────────────────────────────────────────────────────

/**
 * Validate a Dockerfile against all 6 rule categories.
 * Returns Result<DockerfileValidationResult>.
 */
export function validateDockerfile(projectDir: string): Result<DockerfileValidationResult> {
  const dfPath = join(projectDir, 'Dockerfile');

  if (!existsSync(dfPath)) {
    return fail('No Dockerfile found');
  }

  let content: string;
  try {
    content = readFileSync(dfPath, 'utf-8');
  } catch {
    return fail('Dockerfile exists but could not be read');
  }

  const lines = content.split('\n');
  const fromLines = lines.filter(l => /^\s*FROM\s+/i.test(l));
  if (fromLines.length === 0) {
    return fail('Dockerfile has no FROM instruction');
  }

  const { rules, warnings } = loadRules(projectDir);
  const gaps: DockerfileGap[] = [];

  if (rules.requirePinnedFrom) gaps.push(...checkPinnedFrom(lines));
  if (rules.requireBinaryOnPath) gaps.push(...checkBinaryOnPath(lines));
  gaps.push(...checkVerificationTools(lines, rules.verificationTools));
  if (rules.forbidSourceCopy) gaps.push(...checkNoSourceCopy(lines));
  if (rules.requireNonRootUser) gaps.push(...checkNonRootUser(lines));
  if (rules.requireCacheCleanup) gaps.push(...checkCacheCleanup(lines));

  return ok({
    passed: gaps.length === 0,
    gaps,
    warnings,
  });
}
