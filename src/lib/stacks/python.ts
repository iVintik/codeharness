/**
 * Python stack provider — encapsulates all Python-specific behavior.
 * Implements every StackProvider method for the python stack.
 *
 * Story 10-3: full implementation following NodejsProvider pattern from story 10-2.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type {
  AppType,
  CoverageToolInfo,
  CoverageToolName,
  OtlpResult,
  StackProvider,
  TestCounts,
} from './types.js';
import { readTextSafe, getPythonDepsContent, hasPythonDep } from './utils.js';

/** Dependency names that signal an AI/agent project. */
const AGENT_DEPS = [
  'anthropic',
  'openai',
  'langchain',
  'llama-index',
  'traceloop-sdk',
];

/** Dependency names that signal a web framework project. */
const WEB_FRAMEWORK_DEPS = ['flask', 'django', 'fastapi', 'streamlit'];

/** OTLP packages required for Python instrumentation. */
const PYTHON_OTLP_PACKAGES = [
  'opentelemetry-distro',
  'opentelemetry-exporter-otlp',
];

export class PythonProvider implements StackProvider {
  readonly name = 'python' as const;
  readonly markers = ['requirements.txt', 'pyproject.toml', 'setup.py'];
  readonly displayName = 'Python';

  // ── Task 2: detectAppType ──────────────────────────────────────────────

  detectAppType(dir: string): AppType {
    const content = getPythonDepsContent(dir);

    // Priority 1: Agent detection
    if (AGENT_DEPS.some((d) => hasPythonDep(content, d))) {
      return 'agent';
    }

    // Priority 2: Web detection (framework + templates/static dirs)
    const hasWebFramework = WEB_FRAMEWORK_DEPS.some((d) => hasPythonDep(content, d));
    if (hasWebFramework) {
      const hasTemplates = existsSync(join(dir, 'templates'));
      const hasStatic = existsSync(join(dir, 'static'));
      if (hasTemplates || hasStatic) {
        return 'web';
      }
      // Bare Flask/Django/FastAPI without templates => server
      return 'server';
    }

    // Priority 3: Server detection (has main entry point)
    if (
      existsSync(join(dir, 'app.py')) ||
      existsSync(join(dir, 'main.py')) ||
      existsSync(join(dir, 'manage.py'))
    ) {
      return 'server';
    }

    return 'generic';
  }

  // ── Task 4: getCoverageTool ────────────────────────────────────────────

  getCoverageTool(): CoverageToolName {
    return 'coverage-py';
  }

  // ── Task 5: detectCoverageConfig ───────────────────────────────────────

  detectCoverageConfig(dir: string): CoverageToolInfo {
    // Check requirements.txt
    const reqPath = join(dir, 'requirements.txt');
    const reqContent = readTextSafe(reqPath);
    if (reqContent) {
      if (hasPythonDep(reqContent, 'pytest-cov') || hasPythonDep(reqContent, 'coverage')) {
        return { tool: 'coverage-py', configFile: reqPath };
      }
    }

    // Check pyproject.toml — use includes() here because coverage config sections
    // (e.g. [tool.coverage.run]) are not package deps and won't match hasPythonDep().
    const pyprojectPath = join(dir, 'pyproject.toml');
    const pyprojectContent = readTextSafe(pyprojectPath);
    if (pyprojectContent) {
      if (
        hasPythonDep(pyprojectContent, 'pytest-cov') ||
        hasPythonDep(pyprojectContent, 'coverage') ||
        pyprojectContent.includes('[tool.coverage')
      ) {
        return { tool: 'coverage-py', configFile: pyprojectPath };
      }
    }

    return { tool: 'none' };
  }

  // ── Task 6: getOtlpPackages ────────────────────────────────────────────

  getOtlpPackages(): string[] {
    return [...PYTHON_OTLP_PACKAGES];
  }

  // ── Task 7: installOtlp ───────────────────────────────────────────────

  installOtlp(dir: string): OtlpResult {
    // Primary: pip install both packages in one command
    try {
      execFileSync('pip', ['install', ...PYTHON_OTLP_PACKAGES], {
        cwd: dir,
        stdio: 'pipe',
        timeout: 300_000,
      });
      return {
        success: true,
        packagesInstalled: [...PYTHON_OTLP_PACKAGES],
      };
    } catch {
      // IGNORE: pip install failed, fallback to pipx
    }

    const installed: string[] = [];
    try {
      for (const pkg of PYTHON_OTLP_PACKAGES) {
        execFileSync('pipx', ['install', pkg], {
          cwd: dir,
          stdio: 'pipe',
          timeout: 300_000,
        });
        installed.push(pkg);
      }
      return {
        success: true,
        packagesInstalled: installed,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        packagesInstalled: installed,
        error: `Failed to install Python OTLP packages: ${message.length > 200 ? message.slice(0, 200) + '... (truncated)' : message}`,
      };
    }
  }

  // ── Task 8: getDockerfileTemplate ─────────────────────────────────────

  getDockerfileTemplate(): string {
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

  // ── Task 9: getDockerBuildStage ───────────────────────────────────────

  getDockerBuildStage(): string {
    return `# === Build stage: python ===
FROM python:3.12-slim AS build-python
WORKDIR /build
COPY . .
RUN pip install --target=/build/dist .
`;
  }

  // ── Task 10: getRuntimeCopyDirectives ──────────────────────────────────

  getRuntimeCopyDirectives(): string {
    return 'COPY --from=build-python /build/dist /opt/app/python/';
  }

  // ── Task 11: getBuildCommands ──────────────────────────────────────────

  getBuildCommands(): string[] {
    return ['pip install -r requirements.txt'];
  }

  // ── Task 12: getTestCommands ──────────────────────────────────────────

  getTestCommands(): string[] {
    return ['python -m pytest'];
  }

  // ── Task 13: getSemgrepLanguages ──────────────────────────────────────

  getSemgrepLanguages(): string[] {
    return ['python'];
  }

  // ── Task 14: parseTestOutput ──────────────────────────────────────────

  parseTestOutput(output: string): TestCounts {
    // Pytest format: "12 passed, 3 failed" or "5 passed" or "12 passed, 3 failed, 1 skipped"
    const passedMatch = /(\d+)\s+passed/i.exec(output);
    if (passedMatch) {
      const passed = parseInt(passedMatch[1], 10);
      const failedMatch = /(\d+)\s+failed/i.exec(output);
      const skippedMatch = /(\d+)\s+skipped/i.exec(output);
      const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;
      const skipped = skippedMatch ? parseInt(skippedMatch[1], 10) : 0;
      return { passed, failed, skipped, total: passed + failed + skipped };
    }

    return { passed: 0, failed: 0, skipped: 0, total: 0 };
  }

  // ── Task 15: parseCoverageReport ──────────────────────────────────────

  parseCoverageReport(dir: string): number {
    const reportPath = join(dir, 'coverage.json');
    if (!existsSync(reportPath)) return 0;

    try {
      const report = JSON.parse(readFileSync(reportPath, 'utf-8')) as {
        totals?: { percent_covered?: number };
      };
      return report.totals?.percent_covered ?? 0;
    } catch {
      // IGNORE: Python coverage report may be malformed
      return 0;
    }
  }

  // ── Task 16: getProjectName ───────────────────────────────────────────

  // ── getVerifyDockerfileSection ──────────────────────────────────────

  getVerifyDockerfileSection(_projectDir: string): string {
    return [
      '# --- Python tooling ---',
      'RUN apt-get update && apt-get install -y --no-install-recommends \\',
      '    python3-pip python3-venv \\',
      '    && rm -rf /var/lib/apt/lists/*',
      'RUN pip install --break-system-packages coverage pytest',
    ].join('\n');
  }

  getProjectName(dir: string): string | null {
    // Try pyproject.toml first
    const pyprojectContent = readTextSafe(join(dir, 'pyproject.toml'));
    if (pyprojectContent) {
      // Extract the [project] section (up to the next section header or EOF)
      const projectIdx = pyprojectContent.search(/^\[project\]\s*$/m);
      if (projectIdx !== -1) {
        const afterHeader = pyprojectContent.slice(
          projectIdx + pyprojectContent.slice(projectIdx).indexOf('\n') + 1,
        );
        // Find where next section starts (line beginning with '[')
        const nextSectionIdx = afterHeader.search(/^\[/m);
        const section = nextSectionIdx === -1 ? afterHeader : afterHeader.slice(0, nextSectionIdx);
        // Match name = "..." or name = '...' within the [project] section only
        const nameMatch = /^\s*name\s*=\s*["']([^"']+)["']/m.exec(section);
        if (nameMatch) return nameMatch[1];
      }
    }

    // Try setup.py
    const setupContent = readTextSafe(join(dir, 'setup.py'));
    if (setupContent) {
      const match = /name\s*=\s*['"]([^'"]+)['"]/m.exec(setupContent);
      if (match) return match[1];
    }

    return null;
  }
}
