import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

import { buildLogsQuery, injectServiceNameIntoPromQL, registerQueryCommand } from '../query.js';
import { writeState, getDefaultState } from '../../lib/state.js';
import type { HarnessState } from '../../lib/state.js';

let testDir: string;
let originalCwd: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-query-test-'));
  originalCwd = process.cwd();
  process.chdir(testDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(testDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

function createCli(): Command {
  const program = new Command();
  program.option('--json', 'JSON output');
  registerQueryCommand(program);
  return program;
}

async function runCli(args: string[]): Promise<{ stdout: string; exitCode: number | undefined }> {
  const logs: string[] = [];
  const consoleSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    logs.push(a.map(String).join(' '));
  });
  process.exitCode = undefined;

  const program = createCli();
  await program.parseAsync(['node', 'codeharness', ...args]);

  consoleSpy.mockRestore();
  const exitCode = process.exitCode;
  process.exitCode = undefined;

  return { stdout: logs.join('\n'), exitCode };
}

// ─── buildLogsQuery unit tests ──────────────────────────────────────────────

describe('buildLogsQuery', () => {
  it('adds service_name filter to query', () => {
    const result = buildLogsQuery('level:error', 'my-api', false);
    expect(result).toBe('level:error AND service_name:my-api');
  });

  it('returns raw query when raw=true', () => {
    const result = buildLogsQuery('level:error', 'my-api', true);
    expect(result).toBe('level:error');
  });

  it('preserves complex filter expressions', () => {
    const result = buildLogsQuery('level:error AND _msg:"timeout"', 'my-api', false);
    expect(result).toBe('level:error AND _msg:"timeout" AND service_name:my-api');
  });
});

// ─── injectServiceNameIntoPromQL unit tests ─────────────────────────────────

describe('injectServiceNameIntoPromQL', () => {
  it('injects service_name into bare metric name', () => {
    const result = injectServiceNameIntoPromQL('http_requests_total', 'my-api');
    expect(result).toContain('service_name="my-api"');
    expect(result).toContain('http_requests_total');
  });

  it('adds service_name to existing label selector', () => {
    const result = injectServiceNameIntoPromQL('http_requests_total{status="200"}', 'my-api');
    expect(result).toContain('status="200"');
    expect(result).toContain('service_name="my-api"');
  });

  it('does not double-inject if service_name already present', () => {
    const input = 'http_requests_total{service_name="other"}';
    const result = injectServiceNameIntoPromQL(input, 'my-api');
    expect(result).toBe(input);
  });

  it('handles rate() wrapped metrics', () => {
    const result = injectServiceNameIntoPromQL('rate(http_requests_total[5m])', 'my-api');
    expect(result).toContain('service_name="my-api"');
    expect(result).toContain('http_requests_total');
  });

  it('handles rate() with existing labels', () => {
    const result = injectServiceNameIntoPromQL('rate(http_requests_total{status="200"}[5m])', 'my-api');
    expect(result).toContain('status="200"');
    expect(result).toContain('service_name="my-api"');
  });
});

// ─── CLI integration tests ──────────────────────────────────────────────────

describe('query logs command', () => {
  it('fails with helpful message when state file is missing', async () => {
    // No state file
    const { stdout, exitCode } = await runCli(['query', 'logs', 'error']);
    expect(stdout).toContain('Harness not initialized');
    expect(exitCode).toBe(1);
  });

  it('fails when no service_name is configured', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    // otlp without service_name is not possible via the interface,
    // but otlp being undefined means no service_name
    writeState(state, testDir);

    const { stdout, exitCode } = await runCli(['query', 'logs', 'error']);
    expect(stdout).toContain('No service_name configured');
    expect(exitCode).toBe(1);
  });
});

describe('query metrics command', () => {
  it('fails with helpful message when state file is missing', async () => {
    const { stdout, exitCode } = await runCli(['query', 'metrics', 'http_requests_total']);
    expect(stdout).toContain('Harness not initialized');
    expect(exitCode).toBe(1);
  });
});

describe('query traces command', () => {
  it('fails with helpful message when state file is missing', async () => {
    const { stdout, exitCode } = await runCli(['query', 'traces']);
    expect(stdout).toContain('Harness not initialized');
    expect(exitCode).toBe(1);
  });
});

describe('query logs --json', () => {
  it('outputs JSON with query details when fetch fails', async () => {
    const state = getDefaultState('nodejs') as HarnessState;
    state.initialized = true;
    state.otlp = {
      enabled: true,
      endpoint: 'http://localhost:4318',
      service_name: 'my-api',
      mode: 'local-shared',
    };
    writeState(state, testDir);

    // fetch will fail since no server is running, but JSON output should still work
    const { stdout } = await runCli(['--json', 'query', 'logs', 'error']);
    const parsed = JSON.parse(stdout);
    expect(parsed.query).toContain('service_name:my-api');
    expect(parsed.url).toContain('localhost:9428');
  });
});

describe('query logs --raw', () => {
  it('omits service_name filter in JSON output', async () => {
    const state = getDefaultState('nodejs') as HarnessState;
    state.initialized = true;
    state.otlp = {
      enabled: true,
      endpoint: 'http://localhost:4318',
      service_name: 'my-api',
      mode: 'local-shared',
    };
    writeState(state, testDir);

    const { stdout } = await runCli(['--json', 'query', 'logs', 'error', '--raw']);
    const parsed = JSON.parse(stdout);
    expect(parsed.query).toBe('error');
    expect(parsed.query).not.toContain('service_name');
  });
});

describe('query metrics --json', () => {
  it('outputs JSON with injected service_name', async () => {
    const state = getDefaultState('nodejs') as HarnessState;
    state.initialized = true;
    state.otlp = {
      enabled: true,
      endpoint: 'http://localhost:4318',
      service_name: 'my-api',
      mode: 'local-shared',
    };
    writeState(state, testDir);

    const { stdout } = await runCli(['--json', 'query', 'metrics', 'http_requests_total']);
    const parsed = JSON.parse(stdout);
    expect(parsed.query).toContain('service_name="my-api"');
  });
});

describe('query traces --json', () => {
  it('outputs JSON with service name from state', async () => {
    const state = getDefaultState('nodejs') as HarnessState;
    state.initialized = true;
    state.otlp = {
      enabled: true,
      endpoint: 'http://localhost:4318',
      service_name: 'my-api',
      mode: 'local-shared',
    };
    writeState(state, testDir);

    const { stdout } = await runCli(['--json', 'query', 'traces']);
    const parsed = JSON.parse(stdout);
    expect(parsed.service).toBe('my-api');
    expect(parsed.url).toContain('service=my-api');
  });
});
