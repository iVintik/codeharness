/**
 * Dockerfile template generator — creates stack-appropriate Dockerfiles for user projects.
 * Returns Result<DockerfileTemplateResult> following the project's Result<T> pattern.
 *
 * FR22 (Dockerfile template based on project type).
 */

import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ok, fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';

/** Result returned by generateDockerfileTemplate */
export interface DockerfileTemplateResult {
  readonly path: string;
  readonly stack: string;
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

// ─── Main generator ─────────────────────────────────────────────────────────

/**
 * Generate a Dockerfile template based on detected stack type.
 * Returns fail() if a Dockerfile already exists — caller handles messaging.
 */
export function generateDockerfileTemplate(
  projectDir: string,
  stack: string | null,
): Result<DockerfileTemplateResult> {
  if (!projectDir) {
    return fail('projectDir is required');
  }

  const dockerfilePath = join(projectDir, 'Dockerfile');

  if (existsSync(dockerfilePath)) {
    return fail('Dockerfile already exists');
  }

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

  return ok({ path: dockerfilePath, stack: resolvedStack });
}
