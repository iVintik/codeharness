/**
 * Dynamic Dockerfile generator for verification environments.
 * Assembles a Dockerfile from stack provider sections instead of static templates.
 *
 * Architecture Decision 10: Stack-Aware Provisioning.
 */

import { join } from 'node:path';

import { detectStacks, getStackProvider } from '../../lib/stacks/index.js';

/**
 * Generate a complete verification Dockerfile for the given project directory.
 * Detects all stacks present and assembles tooling sections from each provider.
 *
 * Returns the BASE + TOOLING portion. Build-specific steps (tarball copy,
 * project mount) are appended by the caller in env.ts.
 */
export function generateVerifyDockerfile(projectDir: string): string {
  const detections = detectStacks(projectDir);
  const sections: string[] = [];

  // Base image
  sections.push('FROM ubuntu:22.04');
  sections.push('ENV DEBIAN_FRONTEND=noninteractive');
  sections.push('');

  // Common tools
  sections.push('# Common tools');
  sections.push(
    'RUN apt-get update && apt-get install -y --no-install-recommends \\',
    '    curl jq git python3 pipx \\',
    '    && rm -rf /var/lib/apt/lists/*',
  );
  sections.push('');

  // Semgrep via pipx
  sections.push('# Semgrep');
  sections.push('RUN pipx install semgrep && pipx ensurepath');
  sections.push('');

  // Per-stack sections
  for (const detection of detections) {
    const provider = getStackProvider(detection.stack);
    if (!provider) continue;
    const resolvedDir = detection.dir === '.' ? projectDir : join(projectDir, detection.dir);
    const section = provider.getVerifyDockerfileSection(resolvedDir);
    if (section) {
      sections.push(section);
      sections.push('');
    }
  }

  // OTLP env vars
  sections.push('# OpenTelemetry environment');
  sections.push('ENV OTEL_EXPORTER_OTLP_ENDPOINT="http://host.docker.internal:4318"');
  sections.push('ENV OTEL_SERVICE_NAME="codeharness-verify"');
  sections.push('ENV OTEL_TRACES_EXPORTER="otlp"');
  sections.push('ENV OTEL_METRICS_EXPORTER="otlp"');
  sections.push('');

  // Working directory
  sections.push('WORKDIR /workspace');

  return sections.join('\n') + '\n';
}
