import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PythonProvider } from '../../stacks/python.js';
import { getPythonDepsContent, hasPythonDep } from '../../stacks/utils.js';

let testDir: string;
let provider: PythonProvider;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-python-provider-'));
  provider = new PythonProvider();
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// ── Static properties ────────────────────────────────────────────────────────

describe('PythonProvider — static properties', () => {
  it('has correct name', () => {
    expect(provider.name).toBe('python');
  });

  it('has correct markers', () => {
    expect(provider.markers).toEqual(['requirements.txt', 'pyproject.toml', 'setup.py']);
  });

  it('has correct displayName', () => {
    expect(provider.displayName).toBe('Python');
  });
});

// ── detectAppType (AC4–AC9) ──────────────────────────────────────────────────

describe('PythonProvider.detectAppType', () => {
  it('returns "agent" when anthropic is in requirements.txt (AC4)', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'anthropic>=0.18.0\nrequests\n');
    expect(provider.detectAppType(testDir)).toBe('agent');
  });

  it('returns "agent" for openai', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'openai>=1.0\n');
    expect(provider.detectAppType(testDir)).toBe('agent');
  });

  it('returns "agent" for langchain', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'langchain\n');
    expect(provider.detectAppType(testDir)).toBe('agent');
  });

  it('returns "agent" for llama-index', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'llama-index\n');
    expect(provider.detectAppType(testDir)).toBe('agent');
  });

  it('returns "agent" for traceloop-sdk', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'traceloop-sdk\n');
    expect(provider.detectAppType(testDir)).toBe('agent');
  });

  it('returns "web" when flask is in deps AND templates/ exists (AC5)', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'flask\nrequests\n');
    mkdirSync(join(testDir, 'templates'));
    expect(provider.detectAppType(testDir)).toBe('web');
  });

  it('returns "web" when django is in deps AND static/ exists', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'django\n');
    mkdirSync(join(testDir, 'static'));
    expect(provider.detectAppType(testDir)).toBe('web');
  });

  it('returns "server" when fastapi is in deps but no templates/static dirs (AC6)', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'fastapi\nuvicorn\n');
    expect(provider.detectAppType(testDir)).toBe('server');
  });

  it('returns "server" when django is in deps with manage.py but no templates/static (AC7)', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'django\n');
    writeFileSync(join(testDir, 'manage.py'), '#!/usr/bin/env python\n');
    expect(provider.detectAppType(testDir)).toBe('server');
  });

  it('returns "server" when generic deps and app.py exists (AC8)', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'requests\n');
    writeFileSync(join(testDir, 'app.py'), 'print("hello")\n');
    expect(provider.detectAppType(testDir)).toBe('server');
  });

  it('returns "server" when generic deps and main.py exists', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'requests\n');
    writeFileSync(join(testDir, 'main.py'), 'print("hello")\n');
    expect(provider.detectAppType(testDir)).toBe('server');
  });

  it('returns "generic" when generic deps and no entry-point files (AC9)', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'requests\npytest\n');
    expect(provider.detectAppType(testDir)).toBe('generic');
  });

  it('returns "generic" when no Python files exist at all', () => {
    expect(provider.detectAppType(testDir)).toBe('generic');
  });

  it('agent deps take priority over web deps', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'anthropic\nflask\n');
    mkdirSync(join(testDir, 'templates'));
    expect(provider.detectAppType(testDir)).toBe('agent');
  });

  it('reads from pyproject.toml for agent detection', () => {
    writeFileSync(
      join(testDir, 'pyproject.toml'),
      '[project]\nname = "myapp"\ndependencies = [\n  "anthropic>=0.18",\n]\n',
    );
    expect(provider.detectAppType(testDir)).toBe('agent');
  });

  it('reads from setup.py for web detection', () => {
    writeFileSync(
      join(testDir, 'setup.py'),
      "setup(name='myapp', install_requires=['flask'])\n",
    );
    mkdirSync(join(testDir, 'templates'));
    expect(provider.detectAppType(testDir)).toBe('web');
  });

  it('returns "web" with streamlit and templates', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'streamlit\n');
    mkdirSync(join(testDir, 'templates'));
    expect(provider.detectAppType(testDir)).toBe('web');
  });
});

// ── getCoverageTool ──────────────────────────────────────────────────────────

describe('PythonProvider.getCoverageTool', () => {
  it('returns "coverage-py"', () => {
    expect(provider.getCoverageTool()).toBe('coverage-py');
  });
});

// ── detectCoverageConfig (AC2, AC3) ──────────────────────────────────────────

describe('PythonProvider.detectCoverageConfig', () => {
  it('detects pytest-cov in requirements.txt (AC2)', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'pytest\npytest-cov\n');
    const result = provider.detectCoverageConfig(testDir);
    expect(result.tool).toBe('coverage-py');
    expect(result.configFile).toBeDefined();
    expect(result.configFile).toContain('requirements.txt');
  });

  it('detects coverage in requirements.txt (AC2)', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'pytest\ncoverage\n');
    const result = provider.detectCoverageConfig(testDir);
    expect(result.tool).toBe('coverage-py');
    expect(result.configFile).toContain('requirements.txt');
  });

  it('detects coverage in pyproject.toml (AC3)', () => {
    writeFileSync(
      join(testDir, 'pyproject.toml'),
      '[tool.coverage.run]\nsource = ["src"]\n',
    );
    const result = provider.detectCoverageConfig(testDir);
    expect(result.tool).toBe('coverage-py');
    expect(result.configFile).toContain('pyproject.toml');
  });

  it('detects pytest-cov in pyproject.toml (AC3)', () => {
    writeFileSync(
      join(testDir, 'pyproject.toml'),
      '[project.optional-dependencies]\ntest = ["pytest-cov"]\n',
    );
    const result = provider.detectCoverageConfig(testDir);
    expect(result.tool).toBe('coverage-py');
  });

  it('returns none when no coverage tools found', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'requests\n');
    const result = provider.detectCoverageConfig(testDir);
    expect(result.tool).toBe('none');
  });

  it('returns none when no Python files exist', () => {
    const result = provider.detectCoverageConfig(testDir);
    expect(result.tool).toBe('none');
  });

  it('prefers requirements.txt over pyproject.toml', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'pytest-cov\n');
    writeFileSync(join(testDir, 'pyproject.toml'), 'coverage\n');
    const result = provider.detectCoverageConfig(testDir);
    expect(result.configFile).toContain('requirements.txt');
  });
});

// ── getOtlpPackages (AC10) ───────────────────────────────────────────────────

describe('PythonProvider.getOtlpPackages', () => {
  it('returns exact OTLP packages (AC10)', () => {
    expect(provider.getOtlpPackages()).toEqual([
      'opentelemetry-distro',
      'opentelemetry-exporter-otlp',
    ]);
  });

  it('returns a new array each time (not shared reference)', () => {
    const a = provider.getOtlpPackages();
    const b = provider.getOtlpPackages();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

// ── getDockerfileTemplate (AC11) ─────────────────────────────────────────────

describe('PythonProvider.getDockerfileTemplate', () => {
  it('contains FROM python:3.12-slim (AC11)', () => {
    const template = provider.getDockerfileTemplate();
    expect(template).toContain('FROM python:3.12-slim');
  });

  it('contains pip install (AC11)', () => {
    const template = provider.getDockerfileTemplate();
    expect(template).toContain('pip install');
  });

  it('contains USER nobody (AC11)', () => {
    const template = provider.getDockerfileTemplate();
    expect(template).toContain('USER nobody');
  });
});

// ── getDockerBuildStage (AC12) ───────────────────────────────────────────────

describe('PythonProvider.getDockerBuildStage', () => {
  it('contains FROM python:3.12-slim AS build-python (AC12)', () => {
    const stage = provider.getDockerBuildStage();
    expect(stage).toContain('FROM python:3.12-slim AS build-python');
  });

  it('contains pip install --target=/build/dist . (AC12)', () => {
    const stage = provider.getDockerBuildStage();
    expect(stage).toContain('pip install --target=/build/dist .');
  });
});

// ── getRuntimeCopyDirectives (AC13) ──────────────────────────────────────────

describe('PythonProvider.getRuntimeCopyDirectives', () => {
  it('contains COPY --from=build-python (AC13)', () => {
    const directives = provider.getRuntimeCopyDirectives();
    expect(directives).toContain('COPY --from=build-python');
  });

  it('copies to /opt/app/python/', () => {
    const directives = provider.getRuntimeCopyDirectives();
    expect(directives).toContain('/opt/app/python/');
  });
});

// ── parseTestOutput (AC14, AC15) ─────────────────────────────────────────────

describe('PythonProvider.parseTestOutput', () => {
  it('parses pytest format: "12 passed, 3 failed" (AC14)', () => {
    const result = provider.parseTestOutput('12 passed, 3 failed');
    expect(result).toEqual({ passed: 12, failed: 3, skipped: 0, total: 15 });
  });

  it('parses pytest format with only passed: "5 passed" (AC15)', () => {
    const result = provider.parseTestOutput('5 passed');
    expect(result).toEqual({ passed: 5, failed: 0, skipped: 0, total: 5 });
  });

  it('parses pytest format with skipped: "10 passed, 2 skipped"', () => {
    const result = provider.parseTestOutput('10 passed, 2 skipped');
    expect(result).toEqual({ passed: 10, failed: 0, skipped: 2, total: 12 });
  });

  it('parses pytest format with all three: "10 passed, 2 failed, 1 skipped"', () => {
    const result = provider.parseTestOutput('10 passed, 2 failed, 1 skipped');
    expect(result).toEqual({ passed: 10, failed: 2, skipped: 1, total: 13 });
  });

  it('returns zeros for unrecognized output', () => {
    const result = provider.parseTestOutput('some random output');
    expect(result).toEqual({ passed: 0, failed: 0, skipped: 0, total: 0 });
  });

  it('returns zeros for empty string', () => {
    const result = provider.parseTestOutput('');
    expect(result).toEqual({ passed: 0, failed: 0, skipped: 0, total: 0 });
  });

  it('parses pytest output embedded in larger text', () => {
    const output = `
============================= test session starts ==============================
collected 15 items

tests/test_main.py ..........F.F.

====================== 12 passed, 3 failed in 1.23s ==========================
`;
    const result = provider.parseTestOutput(output);
    expect(result).toEqual({ passed: 12, failed: 3, skipped: 0, total: 15 });
  });
});

// ── parseCoverageReport (AC16, AC17) ─────────────────────────────────────────

describe('PythonProvider.parseCoverageReport', () => {
  it('parses coverage.json with totals.percent_covered (AC16)', () => {
    writeFileSync(
      join(testDir, 'coverage.json'),
      JSON.stringify({ totals: { percent_covered: 72.3 } }),
    );
    expect(provider.parseCoverageReport(testDir)).toBe(72.3);
  });

  it('returns 0 when coverage.json does not exist (AC17)', () => {
    expect(provider.parseCoverageReport(testDir)).toBe(0);
  });

  it('returns 0 for malformed JSON', () => {
    writeFileSync(join(testDir, 'coverage.json'), 'not-json');
    expect(provider.parseCoverageReport(testDir)).toBe(0);
  });

  it('returns 0 when totals.percent_covered is missing', () => {
    writeFileSync(join(testDir, 'coverage.json'), JSON.stringify({ totals: {} }));
    expect(provider.parseCoverageReport(testDir)).toBe(0);
  });

  it('returns 0 when totals key is missing', () => {
    writeFileSync(join(testDir, 'coverage.json'), JSON.stringify({ files: {} }));
    expect(provider.parseCoverageReport(testDir)).toBe(0);
  });
});

// ── getProjectName (AC18) ────────────────────────────────────────────────────

describe('PythonProvider.getProjectName', () => {
  it('returns name from pyproject.toml (AC18)', () => {
    writeFileSync(
      join(testDir, 'pyproject.toml'),
      '[project]\nname = "my-python-app"\nversion = "1.0.0"\n',
    );
    expect(provider.getProjectName(testDir)).toBe('my-python-app');
  });

  it('returns name from pyproject.toml with single quotes', () => {
    writeFileSync(
      join(testDir, 'pyproject.toml'),
      "[project]\nname = 'my-app'\n",
    );
    expect(provider.getProjectName(testDir)).toBe('my-app');
  });

  it('returns name from setup.py when no pyproject.toml', () => {
    writeFileSync(
      join(testDir, 'setup.py'),
      "from setuptools import setup\nsetup(name='my-setup-app', version='1.0')\n",
    );
    expect(provider.getProjectName(testDir)).toBe('my-setup-app');
  });

  it('returns null when no name found', () => {
    writeFileSync(join(testDir, 'pyproject.toml'), '[build-system]\n');
    expect(provider.getProjectName(testDir)).toBeNull();
  });

  it('returns null when no Python config files exist', () => {
    expect(provider.getProjectName(testDir)).toBeNull();
  });

  it('prefers pyproject.toml over setup.py', () => {
    writeFileSync(
      join(testDir, 'pyproject.toml'),
      '[project]\nname = "from-pyproject"\n',
    );
    writeFileSync(join(testDir, 'setup.py'), "setup(name='from-setup')\n");
    expect(provider.getProjectName(testDir)).toBe('from-pyproject');
  });

  it('handles pyproject.toml with name not directly after [project]', () => {
    writeFileSync(
      join(testDir, 'pyproject.toml'),
      '[project]\nversion = "1.0.0"\nname = "my-app"\n',
    );
    expect(provider.getProjectName(testDir)).toBe('my-app');
  });

  it('does not pick up name from a different TOML section', () => {
    writeFileSync(
      join(testDir, 'pyproject.toml'),
      '[project]\nversion = "1.0.0"\n\n[tool.poetry]\nname = "wrong-name"\n',
    );
    expect(provider.getProjectName(testDir)).toBeNull();
  });

  it('reads name from [project] when other sections also have name', () => {
    writeFileSync(
      join(testDir, 'pyproject.toml'),
      '[project]\nname = "correct"\nversion = "1.0"\n\n[tool.poetry]\nname = "wrong"\n',
    );
    expect(provider.getProjectName(testDir)).toBe('correct');
  });
});

// ── getSemgrepLanguages (AC19) ───────────────────────────────────────────────

describe('PythonProvider.getSemgrepLanguages', () => {
  it('returns ["python"] (AC19)', () => {
    expect(provider.getSemgrepLanguages()).toEqual(['python']);
  });
});

// ── getBuildCommands / getTestCommands (AC20) ────────────────────────────────

describe('PythonProvider.getBuildCommands and getTestCommands', () => {
  it('getBuildCommands returns ["pip install -r requirements.txt"] (AC20)', () => {
    expect(provider.getBuildCommands()).toEqual(['pip install -r requirements.txt']);
  });

  it('getTestCommands returns ["python -m pytest"] (AC20)', () => {
    expect(provider.getTestCommands()).toEqual(['python -m pytest']);
  });
});

// ── installOtlp ──────────────────────────────────────────────────────────────

describe('PythonProvider.installOtlp', () => {
  it('returns failure result for non-existent directory', () => {
    const result = provider.installOtlp(join(testDir, 'nonexistent'));
    expect(result.success).toBe(false);
    expect(result.packagesInstalled).toEqual([]);
    expect(result.error).toBeDefined();
  });
});

// ── getPythonDepsContent / hasPythonDep (utils) ──────────────────────────────

describe('getPythonDepsContent', () => {
  it('concatenates content from requirements.txt, pyproject.toml, setup.py', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'requests\n');
    writeFileSync(join(testDir, 'pyproject.toml'), '[project]\n');
    writeFileSync(join(testDir, 'setup.py'), 'setup()\n');
    const content = getPythonDepsContent(testDir);
    expect(content).toContain('requests');
    expect(content).toContain('[project]');
    expect(content).toContain('setup()');
  });

  it('returns empty string when no Python files exist', () => {
    expect(getPythonDepsContent(testDir)).toBe('');
  });

  it('handles partial files (only requirements.txt)', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'flask\n');
    const content = getPythonDepsContent(testDir);
    expect(content).toBe('flask\n');
  });
});

describe('hasPythonDep', () => {
  it('matches exact package name', () => {
    expect(hasPythonDep('openai>=1.0\n', 'openai')).toBe(true);
  });

  it('does not match substring of another package', () => {
    expect(hasPythonDep('not-openai>=1.0\n', 'openai')).toBe(false);
  });

  it('matches package with extras syntax', () => {
    expect(hasPythonDep('openai[all]>=1.0\n', 'openai')).toBe(true);
  });

  it('matches package in quoted string', () => {
    expect(hasPythonDep('"openai>=1.0"', 'openai')).toBe(true);
  });

  it('does not match partial prefix', () => {
    expect(hasPythonDep('myopenai>=1.0\n', 'openai')).toBe(false);
  });
});

// ── detectCoverageConfig regression tests ────────────────────────────────────

describe('PythonProvider.detectCoverageConfig — edge cases', () => {
  it('does not false-positive on packages with "coverage" as substring', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'coverage-conditional-plugin\nrequests\n');
    const result = provider.detectCoverageConfig(testDir);
    expect(result.tool).toBe('none');
  });

  it('detects [tool.coverage] section in pyproject.toml', () => {
    writeFileSync(
      join(testDir, 'pyproject.toml'),
      '[tool.coverage.run]\nsource = ["src"]\n',
    );
    const result = provider.detectCoverageConfig(testDir);
    expect(result.tool).toBe('coverage-py');
  });

  it('detects standalone coverage package in requirements.txt', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'requests\ncoverage>=7.0\n');
    const result = provider.detectCoverageConfig(testDir);
    expect(result.tool).toBe('coverage-py');
  });
});

// ── StackProvider interface compliance ───────────────────────────────────────

describe('PythonProvider — StackProvider interface compliance', () => {
  it('implements all required StackProvider methods', () => {
    expect(typeof provider.detectAppType).toBe('function');
    expect(typeof provider.getCoverageTool).toBe('function');
    expect(typeof provider.detectCoverageConfig).toBe('function');
    expect(typeof provider.getOtlpPackages).toBe('function');
    expect(typeof provider.installOtlp).toBe('function');
    expect(typeof provider.getDockerfileTemplate).toBe('function');
    expect(typeof provider.getDockerBuildStage).toBe('function');
    expect(typeof provider.getRuntimeCopyDirectives).toBe('function');
    expect(typeof provider.getBuildCommands).toBe('function');
    expect(typeof provider.getTestCommands).toBe('function');
    expect(typeof provider.getSemgrepLanguages).toBe('function');
    expect(typeof provider.parseTestOutput).toBe('function');
    expect(typeof provider.parseCoverageReport).toBe('function');
    expect(typeof provider.getProjectName).toBe('function');
  });

  it('does not implement patchStartScript (not needed for Python)', () => {
    expect((provider as unknown as Record<string, unknown>).patchStartScript).toBeUndefined();
  });
});
