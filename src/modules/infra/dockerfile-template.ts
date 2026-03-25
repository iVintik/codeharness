/**
 * Dockerfile template generator — creates stack-appropriate Dockerfiles for user projects.
 * Returns Result<DockerfileTemplateResult> following the project's Result<T> pattern.
 *
 * FR22 (Dockerfile template based on project type).
 * Supports single-stack and multi-stage (multi-stack) Dockerfile generation.
 *
 * Templates are read from static files in templates/dockerfiles/ via renderTemplateFile().
 */

import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ok, fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type { StackDetection } from '../../lib/stacks/index.js';
import { getStackProvider } from '../../lib/stacks/index.js';
import type { StackName } from '../../lib/stacks/index.js';
import { renderTemplateFile } from '../../lib/templates.js';

/** Result returned by generateDockerfileTemplate */
export interface DockerfileTemplateResult {
  readonly path: string;
  readonly stack: string;
  readonly stacks: string[];
}

// ─── Template content generators ────────────────────────────────────────────

function genericTemplate(): string {
  return renderTemplateFile('templates/dockerfiles/Dockerfile.generic');
}

// ─── Multi-stage build-stage content extractors ─────────────────────────────

/** COPY directives for each stack in the runtime stage */
function runtimeCopyDirectives(stacks: string[]): string {
  const lines: string[] = [];
  for (const stack of stacks) {
    const provider = getStackProvider(stack as StackName);
    if (provider) {
      lines.push(provider.getRuntimeCopyDirectives());
    }
  }
  return lines.join('\n');
}

/** Compose a multi-stage Dockerfile from multiple stack detections */
function multiStageTemplate(detections: StackDetection[]): string {
  // Filter to only stacks with a registered provider (all registered providers support multi-stage)
  const supported = detections.filter(d => getStackProvider(d.stack) !== undefined);
  if (supported.length === 0) {
    // All stacks unknown — fall back to generic-like runtime-only Dockerfile
    return genericTemplate();
  }
  const stacks = supported.map(d => d.stack);

  const buildStages: string[] = [];
  for (const stack of stacks) {
    const provider = getStackProvider(stack as StackName);
    if (provider) {
      buildStages.push(provider.getDockerBuildStage());
    }
  }

  const copyLines = runtimeCopyDirectives(stacks);

  return renderTemplateFile('templates/dockerfiles/Dockerfile.multi-stage.tmpl', {
    BUILD_STAGES: buildStages.join('\n'),
    COPY_DIRECTIVES: copyLines,
  });
}

// ─── Main generator ─────────────────────────────────────────────────────────

/**
 * Generate a Dockerfile template based on detected stack type.
 * Accepts either a string stack name (backward compat) or StackDetection[] for multi-stack.
 * Returns fail() if a Dockerfile already exists — caller handles messaging.
 */
export function generateDockerfileTemplate(
  projectDir: string,
  stackOrDetections: string | null | StackDetection[],
): Result<DockerfileTemplateResult> {
  if (!projectDir) {
    return fail('projectDir is required');
  }

  const dockerfilePath = join(projectDir, 'Dockerfile');

  if (existsSync(dockerfilePath)) {
    return fail('Dockerfile already exists');
  }

  // Multi-stack path: StackDetection[] with >1 entry
  if (Array.isArray(stackOrDetections) && stackOrDetections.length > 1) {
    const content = multiStageTemplate(stackOrDetections);
    const stacks = stackOrDetections.map(d => d.stack);
    try {
      writeFileSync(dockerfilePath, content, 'utf-8');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return fail(`Failed to write Dockerfile: ${message}`);
    }
    return ok({ path: dockerfilePath, stack: stacks[0], stacks });
  }

  // Resolve single stack from StackDetection[] or string
  const stack: string | null = Array.isArray(stackOrDetections)
    ? (stackOrDetections.length === 1 ? stackOrDetections[0].stack : null)
    : stackOrDetections;

  let content: string;
  let resolvedStack: string;

  const provider = stack ? getStackProvider(stack as StackName) : undefined;
  if (provider) {
    content = provider.getDockerfileTemplate();
    resolvedStack = provider.name;
  } else {
    content = genericTemplate();
    resolvedStack = 'generic';
  }

  try {
    writeFileSync(dockerfilePath, content, 'utf-8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(`Failed to write Dockerfile: ${message}`);
  }

  return ok({ path: dockerfilePath, stack: resolvedStack, stacks: [resolvedStack] });
}
