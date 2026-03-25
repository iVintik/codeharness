/**
 * Template migration tests — verify that static template files produce
 * identical output to the old TypeScript string literals.
 *
 * Story 15-3: Template Migration — All Templates to Static Files.
 * AC3: renderTemplateFile() returns the same content as the former inline functions.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderTemplate, renderTemplateFile } from '../../lib/templates.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..', '..', '..');

// ─── renderTemplate() ────────────────────────────────────────────────────────

describe('renderTemplate', () => {
  it('interpolates simple {{VAR}} placeholders', () => {
    const result = renderTemplate('Hello {{NAME}}!', { NAME: 'World' });
    expect(result).toBe('Hello World!');
  });

  it('leaves unmatched placeholders intact', () => {
    const result = renderTemplate('{{KNOWN}} and {{UNKNOWN}}', { KNOWN: 'yes' });
    expect(result).toBe('yes and {{UNKNOWN}}');
  });

  it('replaces multiple occurrences of same var', () => {
    const result = renderTemplate('{{X}} + {{X}}', { X: '1' });
    expect(result).toBe('1 + 1');
  });

  it('handles empty vars object', () => {
    const result = renderTemplate('no vars {{HERE}}', {});
    expect(result).toBe('no vars {{HERE}}');
  });
});

// ─── renderTemplateFile() ────────────────────────────────────────────────────

describe('renderTemplateFile', () => {
  it('reads and returns a template file without interpolation', () => {
    const content = renderTemplateFile('templates/dockerfiles/Dockerfile.nodejs');
    expect(content).toContain('FROM node:22-slim');
    expect(content).toContain('npm install -g');
  });

  it('reads and interpolates {{VAR}} placeholders from file', () => {
    const content = renderTemplateFile('templates/compose/otel-collector-remote.yaml', {
      LOGS_URL: 'http://logs.example.com',
      METRICS_URL: 'http://metrics.example.com',
      TRACES_URL: 'http://traces.example.com',
    });
    expect(content).toContain('http://logs.example.com/insert/opentelemetry');
    expect(content).toContain('http://metrics.example.com/api/v1/write');
    expect(content).toContain('http://traces.example.com');
    expect(content).not.toContain('{{LOGS_URL}}');
    expect(content).not.toContain('{{METRICS_URL}}');
    expect(content).not.toContain('{{TRACES_URL}}');
  });

  it('throws for non-existent template file', () => {
    expect(() => renderTemplateFile('templates/does-not-exist.txt')).toThrow();
  });
});

// ─── Dockerfile template equivalence ─────────────────────────────────────────

describe('Dockerfile static files match old inline templates', () => {
  it('Dockerfile.nodejs matches old nodejsTemplate() output', () => {
    const content = renderTemplateFile('templates/dockerfiles/Dockerfile.nodejs');
    expect(content).toContain('FROM node:22-slim');
    expect(content).toContain('ARG TARBALL=package.tgz');
    expect(content).toContain('npm install -g');
    expect(content).toContain('USER node');
    expect(content).toContain('WORKDIR /workspace');
  });

  it('Dockerfile.python matches old pythonTemplate() output', () => {
    const content = renderTemplateFile('templates/dockerfiles/Dockerfile.python');
    expect(content).toContain('FROM python:3.12-slim');
    expect(content).toContain('pip install');
    expect(content).toContain('pip cache purge');
    expect(content).toContain('USER nobody');
  });

  it('Dockerfile.rust matches old rustTemplate() output', () => {
    const content = renderTemplateFile('templates/dockerfiles/Dockerfile.rust');
    expect(content).toContain('FROM rust:1.82-slim AS builder');
    expect(content).toContain('cargo build --release');
    expect(content).toContain('FROM debian:bookworm-slim');
    expect(content).toContain('COPY --from=builder');
    expect(content).toContain('USER nobody');
  });

  it('Dockerfile.generic matches old genericTemplate() output', () => {
    const content = renderTemplateFile('templates/dockerfiles/Dockerfile.generic');
    expect(content).toContain('FROM node:22-slim');
    expect(content).toContain('bash');
    expect(content).toContain('git');
    expect(content).toContain('placeholder');
    expect(content).toContain('USER node');
  });

  it('Dockerfile.multi-stage.tmpl has {{BUILD_STAGES}} and {{COPY_DIRECTIVES}} placeholders', () => {
    const raw = readFileSync(resolve(packageRoot, 'templates/dockerfiles/Dockerfile.multi-stage.tmpl'), 'utf-8');
    expect(raw).toContain('{{BUILD_STAGES}}');
    expect(raw).toContain('{{COPY_DIRECTIVES}}');
  });

  it('Dockerfile.multi-stage.tmpl renders with provided build stages and copy directives', () => {
    const content = renderTemplateFile('templates/dockerfiles/Dockerfile.multi-stage.tmpl', {
      BUILD_STAGES: '# === Build stage: nodejs ===\nFROM node:22-slim AS build-nodejs',
      COPY_DIRECTIVES: 'COPY --from=build-nodejs /build/node_modules ./node_modules',
    });
    expect(content).toContain('FROM node:22-slim AS build-nodejs');
    expect(content).toContain('COPY --from=build-nodejs');
    expect(content).toContain('FROM debian:bookworm-slim');
  });
});

// ─── Docker Compose template equivalence ─────────────────────────────────────

describe('Docker Compose static files match old inline templates', () => {
  it('victoria.yml matches old dockerComposeTemplate() output', () => {
    const content = renderTemplateFile('templates/compose/victoria.yml');
    expect(content).toContain('name: codeharness-shared');
    expect(content).toContain('victoria-logs');
    expect(content).toContain('victoria-metrics');
    expect(content).toContain('victoria-traces');
    expect(content).toContain('otel-collector');
    expect(content).toContain('codeharness-shared-net');
  });

  it('collector-only.yml matches old dockerComposeCollectorOnlyTemplate() output', () => {
    const content = renderTemplateFile('templates/compose/collector-only.yml');
    expect(content).toContain('name: codeharness-collector');
    expect(content).toContain('otel-collector');
    expect(content).toContain('codeharness-collector-net');
    expect(content).not.toContain('victoria-logs');
    expect(content).not.toContain('victoria-metrics');
  });
});

// ─── OTel Collector config template equivalence ──────────────────────────────

describe('OTel Collector config static files match old inline templates', () => {
  it('otel-collector-base.yaml matches old otelCollectorConfigTemplate() output', () => {
    const content = renderTemplateFile('templates/compose/otel-collector-base.yaml');
    expect(content).toContain('endpoint: 0.0.0.0:4317');
    expect(content).toContain('endpoint: 0.0.0.0:4318');
    expect(content).toContain('http://victoria-logs:9428/insert/opentelemetry');
    expect(content).toContain('http://victoria-metrics:8428/api/v1/write');
    expect(content).toContain('http://victoria-traces:4318');
    expect(content).toContain('resource/default');
  });

  it('otel-collector-remote.yaml renders with URLs matching old otelCollectorRemoteTemplate()', () => {
    const content = renderTemplateFile('templates/compose/otel-collector-remote.yaml', {
      LOGS_URL: 'https://logs.company.com',
      METRICS_URL: 'https://metrics.company.com',
      TRACES_URL: 'https://traces.company.com:4317',
    });
    expect(content).toContain('https://logs.company.com/insert/opentelemetry');
    expect(content).toContain('https://metrics.company.com/api/v1/write');
    expect(content).toContain('https://traces.company.com:4317');
    expect(content).toContain('resource/default');
  });
});

// ─── Ralph prompt template equivalence ───────────────────────────────────────

describe('Ralph prompt static file matches old PROMPT_TEMPLATE', () => {
  it('ralph-prompt.md contains the expected sections', () => {
    const content = renderTemplateFile('templates/prompts/ralph-prompt.md');
    expect(content).toContain('You are an autonomous coding agent');
    expect(content).toContain('/harness-run');
    expect(content).toContain('{{sprintStatusPath}}');
    expect(content).toContain('{{projectDir}}');
  });

  it('ralph-prompt.md renders with interpolated paths', () => {
    const content = renderTemplateFile('templates/prompts/ralph-prompt.md', {
      projectDir: '/home/user/project',
      sprintStatusPath: '/home/user/project/sprint-status.yaml',
    });
    expect(content).toContain('/home/user/project');
    expect(content).toContain('/home/user/project/sprint-status.yaml');
    expect(content).not.toContain('{{projectDir}}');
    expect(content).not.toContain('{{sprintStatusPath}}');
  });
});

// ─── README template equivalence ─────────────────────────────────────────────

describe('README static file matches old readmeTemplate() structure', () => {
  it('readme.md.tmpl contains expected placeholders', () => {
    const raw = readFileSync(resolve(packageRoot, 'templates/docs/readme.md.tmpl'), 'utf-8');
    expect(raw).toContain('{{PROJECT_NAME}}');
    expect(raw).toContain('{{INSTALL_COMMAND}}');
    expect(raw).toContain('{{CLI_HELP_OUTPUT}}');
  });

  it('readme.md.tmpl renders with project values', () => {
    const content = renderTemplateFile('templates/docs/readme.md.tmpl', {
      PROJECT_NAME: 'my-app',
      INSTALL_COMMAND: 'npm install -g codeharness',
      CLI_HELP_OUTPUT: 'Usage: codeharness [options]',
    });
    expect(content).toContain('# my-app');
    expect(content).toContain('npm install -g codeharness');
    expect(content).toContain('Usage: codeharness [options]');
  });
});

// ─── Template directory structure ────────────────────────────────────────────

describe('Template directory structure (AC1)', () => {
  const templateDir = resolve(packageRoot, 'templates');

  it('templates/dockerfiles/ contains all Dockerfile templates', () => {
    const files = ['Dockerfile.nodejs', 'Dockerfile.python', 'Dockerfile.rust', 'Dockerfile.generic', 'Dockerfile.multi-stage.tmpl'];
    for (const file of files) {
      const content = readFileSync(resolve(templateDir, 'dockerfiles', file), 'utf-8');
      expect(content.length).toBeGreaterThan(0);
    }
  });

  it('templates/compose/ contains compose and otel config templates', () => {
    const files = ['victoria.yml', 'collector-only.yml', 'otel-collector-base.yaml', 'otel-collector-remote.yaml'];
    for (const file of files) {
      const content = readFileSync(resolve(templateDir, 'compose', file), 'utf-8');
      expect(content.length).toBeGreaterThan(0);
    }
  });

  it('templates/prompts/ contains ralph-prompt.md', () => {
    const content = readFileSync(resolve(templateDir, 'prompts', 'ralph-prompt.md'), 'utf-8');
    expect(content.length).toBeGreaterThan(0);
  });

  it('templates/docs/ contains readme.md.tmpl', () => {
    const content = readFileSync(resolve(templateDir, 'docs', 'readme.md.tmpl'), 'utf-8');
    expect(content.length).toBeGreaterThan(0);
  });

  it('templates/otlp/ contains per-stack OTLP docs', () => {
    const files = ['nodejs.md', 'python.md', 'rust.md'];
    for (const file of files) {
      const content = readFileSync(resolve(templateDir, 'otlp', file), 'utf-8');
      expect(content.length).toBeGreaterThan(0);
    }
  });
});

// ─── AC2: TypeScript generators replaced with renderTemplateFile() ───────────

describe('TypeScript generators use renderTemplateFile() (AC2)', () => {
  it('dockerComposeTemplate returns static file content', async () => {
    const { dockerComposeTemplate } = await import('../docker-compose.js');
    const result = dockerComposeTemplate({ shared: true });
    const fileContent = renderTemplateFile('templates/compose/victoria.yml');
    expect(result).toBe(fileContent);
  });

  it('dockerComposeCollectorOnlyTemplate returns static file content', async () => {
    const { dockerComposeCollectorOnlyTemplate } = await import('../docker-compose.js');
    const result = dockerComposeCollectorOnlyTemplate();
    const fileContent = renderTemplateFile('templates/compose/collector-only.yml');
    expect(result).toBe(fileContent);
  });

  it('otelCollectorConfigTemplate returns static file content', async () => {
    const { otelCollectorConfigTemplate } = await import('../otel-config.js');
    const result = otelCollectorConfigTemplate();
    const fileContent = renderTemplateFile('templates/compose/otel-collector-base.yaml');
    expect(result).toBe(fileContent);
  });

  it('otelCollectorRemoteTemplate returns interpolated file content', async () => {
    const { otelCollectorRemoteTemplate } = await import('../otel-config.js');
    const config = {
      logsUrl: 'https://logs.example.com',
      metricsUrl: 'https://metrics.example.com',
      tracesUrl: 'https://traces.example.com',
    };
    const result = otelCollectorRemoteTemplate(config);
    const fileContent = renderTemplateFile('templates/compose/otel-collector-remote.yaml', {
      LOGS_URL: 'https://logs.example.com',
      METRICS_URL: 'https://metrics.example.com',
      TRACES_URL: 'https://traces.example.com',
    });
    expect(result).toBe(fileContent);
  });

  it('readmeTemplate uses static file with interpolation', async () => {
    const { readmeTemplate } = await import('../readme.js');
    const result = readmeTemplate({
      projectName: 'test-app',
      stack: 'nodejs',
      cliHelpOutput: 'Usage: codeharness [options]',
    });
    expect(result).toContain('# test-app');
    expect(result).toContain('npm install -g codeharness');
    expect(result).toContain('Usage: codeharness [options]');
  });
});
