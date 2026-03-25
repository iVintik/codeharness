/**
 * Node.js stack provider — encapsulates all Node.js-specific behavior.
 * Implements every StackProvider method for the nodejs stack.
 *
 * Story 10-2: full implementation replacing stubs from story 10-1.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type {
  AppType,
  CoverageToolInfo,
  CoverageToolName,
  OtlpResult,
  StackProvider,
  TestCounts,
} from './types.js';
import { readJsonSafe, getNodeDeps } from './utils.js';

/** Dependency names that signal an AI/agent project. */
const AGENT_DEPS = [
  'anthropic',
  '@anthropic-ai/sdk',
  'openai',
  'langchain',
  '@langchain/core',
  'llamaindex',
];

/** Dependency names that signal a web frontend project. */
const WEB_FRAMEWORK_DEPS = [
  'react',
  'vue',
  'svelte',
  'angular',
  '@angular/core',
  'next',
  'nuxt',
  'vite',
  'webpack',
];

/** OTLP packages required for Node.js instrumentation. */
const NODE_OTLP_PACKAGES = [
  '@opentelemetry/auto-instrumentations-node',
  '@opentelemetry/sdk-node',
  '@opentelemetry/exporter-trace-otlp-http',
  '@opentelemetry/exporter-metrics-otlp-http',
];

const NODE_REQUIRE_FLAG = '--require @opentelemetry/auto-instrumentations-node/register';

export class NodejsProvider implements StackProvider {
  readonly name = 'nodejs' as const;
  readonly markers = ['package.json'];
  readonly displayName = 'Node.js (package.json)';

  // ── Task 1: detectAppType ──────────────────────────────────────────────

  detectAppType(dir: string): AppType {
    const pkg = readJsonSafe(join(dir, 'package.json'));
    if (!pkg) return 'generic';

    const deps = getNodeDeps(pkg);

    // Priority 1: Agent detection
    if (AGENT_DEPS.some((d) => deps.has(d))) {
      return 'agent';
    }

    // Priority 2: Web detection
    if (WEB_FRAMEWORK_DEPS.some((d) => deps.has(d))) {
      return 'web';
    }
    if (
      existsSync(join(dir, 'index.html')) ||
      existsSync(join(dir, 'public', 'index.html')) ||
      existsSync(join(dir, 'src', 'index.html'))
    ) {
      return 'web';
    }

    // Priority 3: CLI detection
    const bin = pkg['bin'];
    const scripts = pkg['scripts'] as Record<string, string> | undefined;
    const hasStart = scripts?.['start'] !== undefined;
    if (bin && !hasStart) {
      return 'cli';
    }

    // Priority 4: Server detection
    if (hasStart) {
      return 'server';
    }

    return 'generic';
  }

  // ── Task 2: getCoverageTool ────────────────────────────────────────────

  getCoverageTool(): CoverageToolName {
    return 'c8';
  }

  // ── Task 3: detectCoverageConfig ───────────────────────────────────────

  detectCoverageConfig(dir: string): CoverageToolInfo {
    // Check for Vitest config files
    const vitestConfigTs = join(dir, 'vitest.config.ts');
    const vitestConfigJs = join(dir, 'vitest.config.js');
    const hasVitestConfig = existsSync(vitestConfigTs) || existsSync(vitestConfigJs);

    // Check package.json devDependencies
    const pkg = readJsonSafe(join(dir, 'package.json'));
    let hasVitestCoverageV8 = false;
    let hasVitestCoverageIstanbul = false;
    let hasC8 = false;
    let hasJest = false;

    if (pkg) {
      const allDeps = getNodeDeps(pkg);
      hasVitestCoverageV8 = allDeps.has('@vitest/coverage-v8');
      hasVitestCoverageIstanbul = allDeps.has('@vitest/coverage-istanbul');
      hasC8 = allDeps.has('c8');
      hasJest = allDeps.has('jest');
    }

    // Vitest detection
    if (hasVitestConfig || hasVitestCoverageV8 || hasVitestCoverageIstanbul) {
      const configFile = existsSync(vitestConfigTs)
        ? vitestConfigTs
        : existsSync(vitestConfigJs)
          ? vitestConfigJs
          : undefined;
      return { tool: 'c8', configFile };
    }

    // Standalone c8
    if (hasC8) {
      return { tool: 'c8' };
    }

    // Jest (uses c8/istanbul underneath)
    if (hasJest) {
      return { tool: 'c8' };
    }

    return { tool: 'none' };
  }

  // ── Task 4: getOtlpPackages ────────────────────────────────────────────

  getOtlpPackages(): string[] {
    return [...NODE_OTLP_PACKAGES];
  }

  // ── Task 5: installOtlp ───────────────────────────────────────────────

  installOtlp(dir: string): OtlpResult {
    try {
      execFileSync('npm', ['install', ...NODE_OTLP_PACKAGES], {
        cwd: dir,
        stdio: 'pipe',
        timeout: 300_000,
      });
      return {
        success: true,
        packagesInstalled: [...NODE_OTLP_PACKAGES],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        packagesInstalled: [],
        error: `Failed to install Node.js OTLP packages: ${message.length > 200 ? message.slice(0, 200) + '... (truncated)' : message}`,
      };
    }
  }

  // ── Task 6: patchStartScript ──────────────────────────────────────────

  patchStartScript(dir: string): boolean {
    const pkgPath = join(dir, 'package.json');
    if (!existsSync(pkgPath)) return false;

    let raw: string;
    let pkg: Record<string, unknown>;
    try {
      raw = readFileSync(pkgPath, 'utf-8');
      pkg = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // IGNORE: package.json may not exist or be malformed
      return false;
    }

    const scripts = pkg['scripts'] as Record<string, string> | undefined;
    if (!scripts) return false;

    const targetKey = scripts['start'] ? 'start' : scripts['dev'] ? 'dev' : null;
    if (!targetKey) return false;

    const instrumentedKey = `${targetKey}:instrumented`;

    // Already patched
    if (scripts[instrumentedKey]?.includes(NODE_REQUIRE_FLAG)) {
      return false;
    }

    scripts[instrumentedKey] = `NODE_OPTIONS='${NODE_REQUIRE_FLAG}' ${scripts[targetKey]}`;

    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
    return true;
  }

  // ── Task 7: getDockerfileTemplate ─────────────────────────────────────

  getDockerfileTemplate(): string {
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

  // ── Task 8: getDockerBuildStage ───────────────────────────────────────

  getDockerBuildStage(): string {
    return `# === Build stage: nodejs ===
FROM node:22-slim AS build-nodejs
WORKDIR /build
COPY package*.json ./
RUN npm ci --production
COPY . .
`;
  }

  // ── Task 9: getRuntimeCopyDirectives ──────────────────────────────────

  getRuntimeCopyDirectives(): string {
    return [
      'COPY --from=build-nodejs /build/node_modules ./node_modules',
      'COPY --from=build-nodejs /build/ ./app/',
    ].join('\n');
  }

  // ── Task 10: getBuildCommands ──────────────────────────────────────────

  getBuildCommands(): string[] {
    return ['npm install', 'npm run build'];
  }

  // ── Task 11: getTestCommands ──────────────────────────────────────────

  getTestCommands(): string[] {
    return ['npm test'];
  }

  // ── Task 12: getSemgrepLanguages ──────────────────────────────────────

  getSemgrepLanguages(): string[] {
    return ['javascript', 'typescript'];
  }

  // ── Task 13: parseTestOutput ──────────────────────────────────────────

  parseTestOutput(output: string): TestCounts {
    // Vitest format: "Tests  12 passed | 3 failed | 1 skipped"
    // Each segment (passed/failed/skipped) is optional except passed which triggers the match.
    const vitestMatch = /Tests\s+(\d+)\s+passed(?:\s*\|\s*(\d+)\s+failed)?(?:\s*\|\s*(\d+)\s+skipped)?/i.exec(output);
    if (vitestMatch) {
      const passed = parseInt(vitestMatch[1], 10);
      const failed = vitestMatch[2] ? parseInt(vitestMatch[2], 10) : 0;
      const skipped = vitestMatch[3] ? parseInt(vitestMatch[3], 10) : 0;
      return { passed, failed, skipped, total: passed + failed + skipped };
    }

    // Jest format: "Tests:  3 failed, 12 passed, 2 skipped, 17 total"
    // Extract each field independently since ordering can vary.
    const jestPassedMatch = /Tests:.*?(\d+)\s+passed/i.exec(output);
    if (jestPassedMatch) {
      const passed = parseInt(jestPassedMatch[1], 10);
      const failedMatch = /Tests:.*?(\d+)\s+failed/i.exec(output);
      const skippedMatch = /Tests:.*?(\d+)\s+skipped/i.exec(output);
      const totalMatch = /Tests:.*?(\d+)\s+total/i.exec(output);
      const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;
      const skipped = skippedMatch ? parseInt(skippedMatch[1], 10) : 0;
      const total = totalMatch ? parseInt(totalMatch[1], 10) : passed + failed + skipped;
      return { passed, failed, skipped, total };
    }

    return { passed: 0, failed: 0, skipped: 0, total: 0 };
  }

  // ── Task 14: parseCoverageReport ──────────────────────────────────────

  parseCoverageReport(dir: string): number {
    const candidates = [
      join(dir, 'coverage', 'coverage-summary.json'),
      join(dir, 'src', 'coverage', 'coverage-summary.json'),
    ];

    let reportPath: string | null = null;
    for (const p of candidates) {
      if (existsSync(p)) {
        reportPath = p;
        break;
      }
    }

    if (!reportPath) return 0;

    try {
      const report = JSON.parse(readFileSync(reportPath, 'utf-8')) as {
        total?: {
          statements?: { pct?: number };
        };
      };
      return report.total?.statements?.pct ?? 0;
    } catch {
      // IGNORE: coverage report may be malformed
      return 0;
    }
  }

  // ── Task 15: getProjectName ───────────────────────────────────────────

  // ── getVerifyDockerfileSection ──────────────────────────────────────

  getVerifyDockerfileSection(_projectDir: string): string {
    return [
      '# --- Node.js tooling ---',
      'RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \\',
      '    && apt-get install -y --no-install-recommends nodejs \\',
      '    && rm -rf /var/lib/apt/lists/*',
      'RUN npm install -g showboat @anthropic-ai/claude-code',
    ].join('\n');
  }

  getProjectName(dir: string): string | null {
    const pkg = readJsonSafe(join(dir, 'package.json'));
    if (pkg && typeof pkg.name === 'string') {
      return pkg.name;
    }
    return null;
  }
}
