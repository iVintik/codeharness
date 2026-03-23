/**
 * Dockerfile template generator — creates stack-appropriate Dockerfiles for user projects.
 * Returns Result<DockerfileTemplateResult> following the project's Result<T> pattern.
 *
 * FR22 (Dockerfile template based on project type).
 * Supports single-stack and multi-stage (multi-stack) Dockerfile generation.
 */

import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ok, fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type { StackDetection } from '../../lib/stack-detect.js';

/** Result returned by generateDockerfileTemplate */
export interface DockerfileTemplateResult {
  readonly path: string;
  readonly stack: string;
  readonly stacks: string[];
}

// ─── Template content generators ────────────────────────────────────────────

function nodejsTemplate(): string {
  return `# Base image — pinned version for reproducibility
FROM node:22-slim

ARG TARBALL=package.tgz

# System utilities for verification
RUN apt-get update && apt-get install -y --no-install-recommends curl jq && rm -rf /var/lib/apt/lists/*

# Install project from tarball (black-box: no source code)
COPY \${TARBALL} /tmp/\${TARBALL}
RUN npm install -g /tmp/\${TARBALL} && rm /tmp/\${TARBALL}

# Run as non-root user
USER node

WORKDIR /workspace
`;
}

function pythonTemplate(): string {
  return `# Base image — pinned version for reproducibility
FROM python:3.12-slim

# System utilities for verification
RUN apt-get update && apt-get install -y --no-install-recommends curl jq && rm -rf /var/lib/apt/lists/*

# Install project from wheel or sdist
COPY dist/ /tmp/dist/
RUN pip install /tmp/dist/*.whl && rm -rf /tmp/dist/ && pip cache purge

# Run as non-root user
USER nobody

WORKDIR /workspace
`;
}

function rustTemplate(): string {
  return `# === Builder stage ===
FROM rust:1.82-slim AS builder

WORKDIR /build

# Copy project files
COPY . .

# Build release binary
RUN cargo build --release

# === Runtime stage ===
FROM debian:bookworm-slim

# System utilities for verification
RUN apt-get update && apt-get install -y --no-install-recommends curl jq && rm -rf /var/lib/apt/lists/*

# Install compiled binary from builder (update 'myapp' to your binary name)
COPY --from=builder /build/target/release/myapp /usr/local/bin/myapp

# Run as non-root user
USER nobody

WORKDIR /workspace
`;
}

function genericTemplate(): string {
  return `# Base image — pinned version for reproducibility
FROM node:22-slim

# System utilities for verification
RUN apt-get update && apt-get install -y --no-install-recommends bash curl jq git && rm -rf /var/lib/apt/lists/*

# Install project binary (update this for your project)
RUN npm install -g placeholder && npm cache clean --force

# Run as non-root user
USER node

WORKDIR /workspace
`;
}

// ─── Multi-stage build-stage content extractors ─────────────────────────────

/** Build-stage content for nodejs in a multi-stage Dockerfile */
function nodejsBuildStage(): string {
  return `# === Build stage: nodejs ===
FROM node:22-slim AS build-nodejs
WORKDIR /build
COPY package*.json ./
RUN npm ci --production
COPY . .
`;
}

/** Build-stage content for python in a multi-stage Dockerfile */
function pythonBuildStage(): string {
  return `# === Build stage: python ===
FROM python:3.12-slim AS build-python
WORKDIR /build
COPY . .
RUN pip install --target=/build/dist .
`;
}

/** Build-stage content for rust in a multi-stage Dockerfile */
function rustBuildStage(): string {
  return `# === Build stage: rust ===
FROM rust:1.82-slim AS build-rust
WORKDIR /build
COPY . .
RUN cargo build --release
`;
}

/** COPY directives for each stack in the runtime stage */
function runtimeCopyDirectives(stacks: string[]): string {
  const lines: string[] = [];
  for (const stack of stacks) {
    if (stack === 'nodejs') {
      lines.push('COPY --from=build-nodejs /build/node_modules ./node_modules');
      lines.push('COPY --from=build-nodejs /build/ ./app/');
    } else if (stack === 'python') {
      lines.push('COPY --from=build-python /build/dist /opt/app/python/');
    } else if (stack === 'rust') {
      lines.push('COPY --from=build-rust /build/target/release/myapp /usr/local/bin/myapp');
    }
  }
  return lines.join('\n');
}

/** Stacks that have multi-stage build support */
const MULTI_STAGE_STACKS = new Set(['nodejs', 'python', 'rust']);

/** Compose a multi-stage Dockerfile from multiple stack detections */
function multiStageTemplate(detections: StackDetection[]): string {
  // Filter to only stacks with known build-stage support
  const supported = detections.filter(d => MULTI_STAGE_STACKS.has(d.stack));
  if (supported.length === 0) {
    // All stacks unknown — fall back to generic-like runtime-only Dockerfile
    return genericTemplate();
  }
  const buildStages: string[] = [];
  const stacks = supported.map(d => d.stack);

  for (const stack of stacks) {
    if (stack === 'nodejs') buildStages.push(nodejsBuildStage());
    else if (stack === 'python') buildStages.push(pythonBuildStage());
    else if (stack === 'rust') buildStages.push(rustBuildStage());
  }

  const copyLines = runtimeCopyDirectives(stacks);

  return `# NOTE: Customize COPY paths for your monorepo layout. Each build stage should only copy its own sources.
${buildStages.join('\n')}
# === Runtime stage ===
FROM debian:bookworm-slim

# System utilities for verification
RUN apt-get update && apt-get install -y --no-install-recommends curl jq && rm -rf /var/lib/apt/lists/*

# Install artifacts from build stages
${copyLines}

# Run as non-root user
USER nobody

WORKDIR /workspace
`;
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

  if (stack === 'nodejs') {
    content = nodejsTemplate();
    resolvedStack = 'nodejs';
  } else if (stack === 'python') {
    content = pythonTemplate();
    resolvedStack = 'python';
  } else if (stack === 'rust') {
    content = rustTemplate();
    resolvedStack = 'rust';
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
