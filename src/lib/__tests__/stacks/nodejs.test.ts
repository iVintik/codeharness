import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodejsProvider } from '../../stacks/nodejs.js';

let testDir: string;
let provider: NodejsProvider;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-nodejs-provider-'));
  provider = new NodejsProvider();
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// ── Static properties ────────────────────────────────────────────────────────

describe('NodejsProvider — static properties', () => {
  it('has correct name', () => {
    expect(provider.name).toBe('nodejs');
  });

  it('has correct markers', () => {
    expect(provider.markers).toEqual(['package.json']);
  });

  it('has correct displayName', () => {
    expect(provider.displayName).toBe('Node.js (package.json)');
  });
});

// ── detectAppType (AC4–AC7) ──────────────────────────────────────────────────

describe('NodejsProvider.detectAppType', () => {
  it('returns "agent" when anthropic is in dependencies (AC4)', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ dependencies: { anthropic: '1.0.0' } }),
    );
    expect(provider.detectAppType(testDir)).toBe('agent');
  });

  it('returns "agent" for @anthropic-ai/sdk', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ dependencies: { '@anthropic-ai/sdk': '1.0.0' } }),
    );
    expect(provider.detectAppType(testDir)).toBe('agent');
  });

  it('returns "agent" for openai', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ dependencies: { openai: '4.0.0' } }),
    );
    expect(provider.detectAppType(testDir)).toBe('agent');
  });

  it('returns "agent" for langchain', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ dependencies: { langchain: '0.1.0' } }),
    );
    expect(provider.detectAppType(testDir)).toBe('agent');
  });

  it('returns "web" when react is in dependencies (AC5)', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ dependencies: { react: '18.0.0' } }),
    );
    expect(provider.detectAppType(testDir)).toBe('web');
  });

  it('returns "web" for vue', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ dependencies: { vue: '3.0.0' } }),
    );
    expect(provider.detectAppType(testDir)).toBe('web');
  });

  it('returns "web" when index.html exists at root', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({}));
    writeFileSync(join(testDir, 'index.html'), '<html></html>');
    expect(provider.detectAppType(testDir)).toBe('web');
  });

  it('returns "web" when public/index.html exists', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({}));
    mkdirSync(join(testDir, 'public'));
    writeFileSync(join(testDir, 'public', 'index.html'), '<html></html>');
    expect(provider.detectAppType(testDir)).toBe('web');
  });

  it('returns "cli" when bin field exists and no start script (AC6)', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ bin: { mycli: './cli.js' } }),
    );
    expect(provider.detectAppType(testDir)).toBe('cli');
  });

  it('returns "server" when start script exists, no agent/web deps (AC7)', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ scripts: { start: 'node server.js' } }),
    );
    expect(provider.detectAppType(testDir)).toBe('server');
  });

  it('returns "server" when both bin and start exist (start takes priority)', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ bin: { mycli: './cli.js' }, scripts: { start: 'node server.js' } }),
    );
    // bin + start => not cli (hasStart is true), falls to server
    expect(provider.detectAppType(testDir)).toBe('server');
  });

  it('returns "generic" for minimal package.json', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'empty' }));
    expect(provider.detectAppType(testDir)).toBe('generic');
  });

  it('returns "generic" when no package.json exists', () => {
    expect(provider.detectAppType(testDir)).toBe('generic');
  });

  it('returns "generic" for malformed package.json', () => {
    writeFileSync(join(testDir, 'package.json'), 'not-json');
    expect(provider.detectAppType(testDir)).toBe('generic');
  });

  it('agent deps take priority over web deps', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ dependencies: { openai: '1.0.0', react: '18.0.0' } }),
    );
    expect(provider.detectAppType(testDir)).toBe('agent');
  });
});

// ── getCoverageTool (AC1) ────────────────────────────────────────────────────

describe('NodejsProvider.getCoverageTool', () => {
  it('returns "c8"', () => {
    expect(provider.getCoverageTool()).toBe('c8');
  });
});

// ── detectCoverageConfig (AC2, AC3) ──────────────────────────────────────────

describe('NodejsProvider.detectCoverageConfig', () => {
  it('detects vitest coverage from vitest.config.ts + @vitest/coverage-v8 (AC2)', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ devDependencies: { '@vitest/coverage-v8': '1.0.0' } }),
    );
    writeFileSync(join(testDir, 'vitest.config.ts'), 'export default {}');
    const result = provider.detectCoverageConfig(testDir);
    expect(result.tool).toBe('c8');
    expect(result.configFile).toBeDefined();
    expect(result.configFile).toContain('vitest.config.ts');
  });

  it('detects vitest from vitest.config.js', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({}));
    writeFileSync(join(testDir, 'vitest.config.js'), 'module.exports = {}');
    const result = provider.detectCoverageConfig(testDir);
    expect(result.tool).toBe('c8');
    expect(result.configFile).toContain('vitest.config.js');
  });

  it('detects vitest from @vitest/coverage-istanbul', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ devDependencies: { '@vitest/coverage-istanbul': '1.0.0' } }),
    );
    const result = provider.detectCoverageConfig(testDir);
    expect(result.tool).toBe('c8');
  });

  it('detects jest and returns c8 (AC3)', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ devDependencies: { jest: '29.0.0' } }),
    );
    const result = provider.detectCoverageConfig(testDir);
    expect(result.tool).toBe('c8');
  });

  it('detects standalone c8', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ devDependencies: { c8: '8.0.0' } }),
    );
    const result = provider.detectCoverageConfig(testDir);
    expect(result.tool).toBe('c8');
  });

  it('returns none when no coverage tools found', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ devDependencies: { typescript: '5.0.0' } }),
    );
    const result = provider.detectCoverageConfig(testDir);
    expect(result.tool).toBe('none');
  });

  it('returns none when no package.json exists', () => {
    const result = provider.detectCoverageConfig(testDir);
    expect(result.tool).toBe('none');
  });
});

// ── getOtlpPackages (AC8) ────────────────────────────────────────────────────

describe('NodejsProvider.getOtlpPackages', () => {
  it('returns exact OTLP packages (AC8)', () => {
    expect(provider.getOtlpPackages()).toEqual([
      '@opentelemetry/auto-instrumentations-node',
      '@opentelemetry/sdk-node',
      '@opentelemetry/exporter-trace-otlp-http',
      '@opentelemetry/exporter-metrics-otlp-http',
    ]);
  });

  it('returns a new array each time (not shared reference)', () => {
    const a = provider.getOtlpPackages();
    const b = provider.getOtlpPackages();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

// ── getDockerfileTemplate (AC9) ──────────────────────────────────────────────

describe('NodejsProvider.getDockerfileTemplate', () => {
  it('contains FROM node:22-slim (AC9)', () => {
    const template = provider.getDockerfileTemplate();
    expect(template).toContain('FROM node:22-slim');
  });

  it('contains npm install -g (AC9)', () => {
    const template = provider.getDockerfileTemplate();
    expect(template).toContain('npm install -g');
  });

  it('contains USER node (AC9)', () => {
    const template = provider.getDockerfileTemplate();
    expect(template).toContain('USER node');
  });
});

// ── getDockerBuildStage (AC10) ───────────────────────────────────────────────

describe('NodejsProvider.getDockerBuildStage', () => {
  it('contains FROM node:22-slim AS build-nodejs (AC10)', () => {
    const stage = provider.getDockerBuildStage();
    expect(stage).toContain('FROM node:22-slim AS build-nodejs');
  });

  it('contains npm ci --production (AC10)', () => {
    const stage = provider.getDockerBuildStage();
    expect(stage).toContain('npm ci --production');
  });
});

// ── getRuntimeCopyDirectives (AC11) ──────────────────────────────────────────

describe('NodejsProvider.getRuntimeCopyDirectives', () => {
  it('contains COPY --from=build-nodejs (AC11)', () => {
    const directives = provider.getRuntimeCopyDirectives();
    expect(directives).toContain('COPY --from=build-nodejs');
  });

  it('copies node_modules and app', () => {
    const directives = provider.getRuntimeCopyDirectives();
    expect(directives).toContain('node_modules');
    expect(directives).toContain('./app/');
  });
});

// ── parseTestOutput (AC12, AC13) ─────────────────────────────────────────────

describe('NodejsProvider.parseTestOutput', () => {
  it('parses vitest format: "Tests  12 passed | 3 failed" (AC12)', () => {
    const result = provider.parseTestOutput('Tests  12 passed | 3 failed');
    expect(result).toEqual({ passed: 12, failed: 3, skipped: 0, total: 15 });
  });

  it('parses vitest format with only passed', () => {
    const result = provider.parseTestOutput('Tests  5 passed');
    expect(result).toEqual({ passed: 5, failed: 0, skipped: 0, total: 5 });
  });

  it('parses jest format: "Tests:  3 failed, 12 passed, 15 total" (AC13)', () => {
    const result = provider.parseTestOutput('Tests:  3 failed, 12 passed, 15 total');
    expect(result).toEqual({ passed: 12, failed: 3, skipped: 0, total: 15 });
  });

  it('parses jest format with only passed', () => {
    const result = provider.parseTestOutput('Tests:  12 passed, 12 total');
    expect(result).toEqual({ passed: 12, failed: 0, skipped: 0, total: 12 });
  });

  it('returns zeros for unrecognized output', () => {
    const result = provider.parseTestOutput('some random output');
    expect(result).toEqual({ passed: 0, failed: 0, skipped: 0, total: 0 });
  });

  it('returns zeros for empty string', () => {
    const result = provider.parseTestOutput('');
    expect(result).toEqual({ passed: 0, failed: 0, skipped: 0, total: 0 });
  });

  it('parses vitest output embedded in larger text', () => {
    const output = `
 ✓ src/lib/__tests__/foo.test.ts (3)
 ✗ src/lib/__tests__/bar.test.ts (2)

 Tests  12 passed | 3 failed
 Duration  2.50s
`;
    const result = provider.parseTestOutput(output);
    expect(result).toEqual({ passed: 12, failed: 3, skipped: 0, total: 15 });
  });

  it('parses vitest format with skipped: "Tests  12 passed | 3 failed | 1 skipped"', () => {
    const result = provider.parseTestOutput('Tests  12 passed | 3 failed | 1 skipped');
    expect(result).toEqual({ passed: 12, failed: 3, skipped: 1, total: 16 });
  });

  it('parses vitest format with skipped and no failed', () => {
    const result = provider.parseTestOutput('Tests  5 passed | 2 skipped');
    expect(result).toEqual({ passed: 5, failed: 0, skipped: 2, total: 7 });
  });

  it('parses jest format with skipped: "Tests:  3 failed, 12 passed, 2 skipped, 17 total"', () => {
    const result = provider.parseTestOutput('Tests:  3 failed, 12 passed, 2 skipped, 17 total');
    expect(result).toEqual({ passed: 12, failed: 3, skipped: 2, total: 17 });
  });

  it('parses jest format with only passed and total', () => {
    const result = provider.parseTestOutput('Tests:  10 passed, 10 total');
    expect(result).toEqual({ passed: 10, failed: 0, skipped: 0, total: 10 });
  });
});

// ── parseCoverageReport (AC14) ───────────────────────────────────────────────

describe('NodejsProvider.parseCoverageReport', () => {
  it('parses coverage-summary.json with total.statements.pct (AC14)', () => {
    mkdirSync(join(testDir, 'coverage'));
    writeFileSync(
      join(testDir, 'coverage', 'coverage-summary.json'),
      JSON.stringify({ total: { statements: { pct: 85.5 } } }),
    );
    expect(provider.parseCoverageReport(testDir)).toBe(85.5);
  });

  it('returns 0 when coverage file does not exist', () => {
    expect(provider.parseCoverageReport(testDir)).toBe(0);
  });

  it('returns 0 for malformed JSON', () => {
    mkdirSync(join(testDir, 'coverage'));
    writeFileSync(join(testDir, 'coverage', 'coverage-summary.json'), 'not-json');
    expect(provider.parseCoverageReport(testDir)).toBe(0);
  });

  it('returns 0 when total.statements.pct is missing', () => {
    mkdirSync(join(testDir, 'coverage'));
    writeFileSync(
      join(testDir, 'coverage', 'coverage-summary.json'),
      JSON.stringify({ total: {} }),
    );
    expect(provider.parseCoverageReport(testDir)).toBe(0);
  });

  it('reads from src/coverage/ as fallback', () => {
    mkdirSync(join(testDir, 'src', 'coverage'), { recursive: true });
    writeFileSync(
      join(testDir, 'src', 'coverage', 'coverage-summary.json'),
      JSON.stringify({ total: { statements: { pct: 72.3 } } }),
    );
    expect(provider.parseCoverageReport(testDir)).toBe(72.3);
  });

  it('prefers coverage/ over src/coverage/', () => {
    mkdirSync(join(testDir, 'coverage'));
    writeFileSync(
      join(testDir, 'coverage', 'coverage-summary.json'),
      JSON.stringify({ total: { statements: { pct: 90 } } }),
    );
    mkdirSync(join(testDir, 'src', 'coverage'), { recursive: true });
    writeFileSync(
      join(testDir, 'src', 'coverage', 'coverage-summary.json'),
      JSON.stringify({ total: { statements: { pct: 50 } } }),
    );
    expect(provider.parseCoverageReport(testDir)).toBe(90);
  });
});

// ── getProjectName (AC15) ────────────────────────────────────────────────────

describe('NodejsProvider.getProjectName', () => {
  it('returns name from package.json (AC15)', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'my-app' }),
    );
    expect(provider.getProjectName(testDir)).toBe('my-app');
  });

  it('returns null when no package.json', () => {
    expect(provider.getProjectName(testDir)).toBeNull();
  });

  it('returns null when package.json has no name field', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ version: '1.0.0' }));
    expect(provider.getProjectName(testDir)).toBeNull();
  });

  it('returns null for malformed package.json', () => {
    writeFileSync(join(testDir, 'package.json'), '{broken');
    expect(provider.getProjectName(testDir)).toBeNull();
  });
});

// ── getSemgrepLanguages (AC16) ───────────────────────────────────────────────

describe('NodejsProvider.getSemgrepLanguages', () => {
  it('returns javascript and typescript (AC16)', () => {
    expect(provider.getSemgrepLanguages()).toEqual(['javascript', 'typescript']);
  });
});

// ── getBuildCommands / getTestCommands (AC17) ────────────────────────────────

describe('NodejsProvider.getBuildCommands and getTestCommands', () => {
  it('getBuildCommands returns ["npm install", "npm run build"] (AC17)', () => {
    expect(provider.getBuildCommands()).toEqual(['npm install', 'npm run build']);
  });

  it('getTestCommands returns ["npm test"] (AC17)', () => {
    expect(provider.getTestCommands()).toEqual(['npm test']);
  });
});

// ── patchStartScript ─────────────────────────────────────────────────────────

describe('NodejsProvider.patchStartScript', () => {
  it('patches start script with --require flag', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ scripts: { start: 'node server.js' } }, null, 2),
    );
    const result = provider.patchStartScript!(testDir);
    expect(result).toBe(true);

    const pkg = JSON.parse(readFileSync(join(testDir, 'package.json'), 'utf-8'));
    expect(pkg.scripts['start:instrumented']).toContain('--require');
    expect(pkg.scripts['start:instrumented']).toContain('node server.js');
  });

  it('patches dev script when no start script', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ scripts: { dev: 'ts-node src/index.ts' } }, null, 2),
    );
    const result = provider.patchStartScript!(testDir);
    expect(result).toBe(true);

    const pkg = JSON.parse(readFileSync(join(testDir, 'package.json'), 'utf-8'));
    expect(pkg.scripts['dev:instrumented']).toContain('--require');
  });

  it('returns false when already patched', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({
        scripts: {
          start: 'node server.js',
          'start:instrumented':
            "NODE_OPTIONS='--require @opentelemetry/auto-instrumentations-node/register' node server.js",
        },
      }, null, 2),
    );
    expect(provider.patchStartScript!(testDir)).toBe(false);
  });

  it('returns false when no scripts', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
    expect(provider.patchStartScript!(testDir)).toBe(false);
  });

  it('returns false when no package.json', () => {
    expect(provider.patchStartScript!(testDir)).toBe(false);
  });

  it('returns false when no start or dev script', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest' } }),
    );
    expect(provider.patchStartScript!(testDir)).toBe(false);
  });

  it('returns false for malformed package.json', () => {
    writeFileSync(join(testDir, 'package.json'), 'not valid json {{{');
    expect(provider.patchStartScript!(testDir)).toBe(false);
  });
});

// ── installOtlp ──────────────────────────────────────────────────────────────

describe('NodejsProvider.installOtlp', () => {
  it('returns failure result for non-existent directory', () => {
    const result = provider.installOtlp(join(testDir, 'nonexistent'));
    expect(result.success).toBe(false);
    expect(result.packagesInstalled).toEqual([]);
    expect(result.error).toBeDefined();
  });
});

// ── StackProvider interface compliance ───────────────────────────────────────

describe('NodejsProvider — StackProvider interface compliance', () => {
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

  it('implements optional patchStartScript method', () => {
    expect(typeof provider.patchStartScript).toBe('function');
  });
});
