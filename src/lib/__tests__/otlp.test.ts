import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from 'node:child_process';
import {
  installNodeOtlp,
  patchNodeStartScript,
  installPythonOtlp,
  configureOtlpEnvVars,
  ensureServiceNameEnvVar,
  instrumentProject,
  configureCli,
  configureWeb,
  configureAgent,
  installAgentOtlp,
  WEB_OTLP_PACKAGES,
  AGENT_OTLP_PACKAGES_NODE,
  AGENT_OTLP_PACKAGES_PYTHON,
} from '../otlp.js';
import { writeState, getDefaultState, readState } from '../state.js';

const mockExecFileSync = vi.mocked(execFileSync);

let testDir: string;

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  testDir = mkdtempSync(join(tmpdir(), 'ch-otlp-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function initState(stack: string | null): void {
  const state = getDefaultState(stack);
  state.initialized = true;
  writeState(state, testDir);
}

function initStateWithOtlp(stack: string | null): void {
  const state = getDefaultState(stack);
  state.initialized = true;
  state.otlp = {
    enabled: true,
    endpoint: 'http://localhost:4318',
    service_name: 'test-project',
    mode: 'local-shared',
  };
  writeState(state, testDir);
}

describe('installNodeOtlp', () => {
  it('installs OTLP packages via npm install', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    const result = installNodeOtlp(testDir);
    expect(result.status).toBe('configured');
    expect(result.packages_installed).toBe(true);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'npm',
      expect.arrayContaining(['install', '@opentelemetry/auto-instrumentations-node']),
      expect.objectContaining({ cwd: testDir }),
    );
  });

  it('returns failed when npm install fails', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('npm install failed');
    });
    const result = installNodeOtlp(testDir);
    expect(result.status).toBe('failed');
    expect(result.packages_installed).toBe(false);
    expect(result.error).toContain('Failed to install Node.js OTLP packages');
  });

  it('truncates long error messages from npm install failures', () => {
    const longStderr = 'E'.repeat(500);
    mockExecFileSync.mockImplementation(() => {
      throw new Error(longStderr);
    });
    const result = installNodeOtlp(testDir);
    expect(result.error).toBeDefined();
    expect(result.error!.length).toBeLessThan(500);
    expect(result.error).toContain('(truncated)');
  });

  it('includes all four OTLP packages in install command', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    installNodeOtlp(testDir);
    const args = mockExecFileSync.mock.calls[0][1] as string[];
    expect(args).toContain('@opentelemetry/auto-instrumentations-node');
    expect(args).toContain('@opentelemetry/sdk-node');
    expect(args).toContain('@opentelemetry/exporter-trace-otlp-http');
    expect(args).toContain('@opentelemetry/exporter-metrics-otlp-http');
  });
});

describe('patchNodeStartScript', () => {
  it('patches start script with --require flag', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test',
        scripts: { start: 'node dist/server.js' },
      }),
    );

    const patched = patchNodeStartScript(testDir);
    expect(patched).toBe(true);

    const pkg = JSON.parse(readFileSync(join(testDir, 'package.json'), 'utf-8'));
    expect(pkg.scripts['start:instrumented']).toContain('--require @opentelemetry/auto-instrumentations-node/register');
    expect(pkg.scripts['start:instrumented']).toContain('node dist/server.js');
    // Original start script is preserved
    expect(pkg.scripts.start).toBe('node dist/server.js');
  });

  it('patches dev script when no start script exists', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test',
        scripts: { dev: 'ts-node src/index.ts' },
      }),
    );

    const patched = patchNodeStartScript(testDir);
    expect(patched).toBe(true);

    const pkg = JSON.parse(readFileSync(join(testDir, 'package.json'), 'utf-8'));
    expect(pkg.scripts['dev:instrumented']).toContain('--require');
  });

  it('returns false when already patched (idempotent)', () => {
    // Simulate a previously patched package.json — the instrumented key already exists
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test',
        scripts: {
          start: 'node dist/server.js',
          'start:instrumented': "NODE_OPTIONS='--require @opentelemetry/auto-instrumentations-node/register' node dist/server.js",
        },
      }),
    );

    const patched = patchNodeStartScript(testDir);
    expect(patched).toBe(false);
  });

  it('returns false when no scripts section', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
    const patched = patchNodeStartScript(testDir);
    expect(patched).toBe(false);
  });

  it('returns false when no start or dev script', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'test', scripts: { build: 'tsc' } }),
    );
    const patched = patchNodeStartScript(testDir);
    expect(patched).toBe(false);
  });

  it('returns false when no package.json', () => {
    const patched = patchNodeStartScript(testDir);
    expect(patched).toBe(false);
  });

  it('returns false when package.json is malformed JSON', () => {
    writeFileSync(join(testDir, 'package.json'), '{ invalid json !!!');
    const patched = patchNodeStartScript(testDir);
    expect(patched).toBe(false);
  });
});

describe('installPythonOtlp', () => {
  it('installs via pip when available', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    const result = installPythonOtlp(testDir);
    expect(result.status).toBe('configured');
    expect(result.packages_installed).toBe(true);
  });

  it('falls back to pipx when pip fails', () => {
    mockExecFileSync.mockImplementation((cmd) => {
      const cmdStr = typeof cmd === 'string' ? cmd : cmd.toString();
      if (cmdStr === 'pip') throw new Error('pip not found');
      // pipx calls succeed (one for each package)
      return Buffer.from('');
    });

    const result = installPythonOtlp(testDir);
    expect(result.status).toBe('configured');
  });

  it('returns failed when all install methods fail', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('command failed');
    });

    const result = installPythonOtlp(testDir);
    expect(result.status).toBe('failed');
    expect(result.packages_installed).toBe(false);
    expect(result.error).toContain('Failed to install Python OTLP packages');
  });
});

describe('configureOtlpEnvVars', () => {
  it('writes OTLP config for Node.js to state', () => {
    initState('nodejs');

    configureOtlpEnvVars(testDir, 'nodejs');

    const state = readState(testDir);
    expect(state.otlp).toBeDefined();
    expect(state.otlp!.enabled).toBe(true);
    expect(state.otlp!.endpoint).toBe('http://localhost:4318');
    expect(state.otlp!.service_name).toBeTruthy();
    expect(state.otlp!.node_require).toContain('--require');
  });

  it('writes OTLP config for Python to state', () => {
    initState('python');

    configureOtlpEnvVars(testDir, 'python');

    const state = readState(testDir);
    expect(state.otlp).toBeDefined();
    expect(state.otlp!.enabled).toBe(true);
    expect(state.otlp!.python_wrapper).toBe('opentelemetry-instrument');
    expect(state.otlp!.node_require).toBeUndefined();
  });

  it('writes OTLP config for unknown stack without stack-specific fields', () => {
    initState(null);

    configureOtlpEnvVars(testDir, null);

    const state = readState(testDir);
    expect(state.otlp).toBeDefined();
    expect(state.otlp!.enabled).toBe(true);
    expect(state.otlp!.node_require).toBeUndefined();
    expect(state.otlp!.python_wrapper).toBeUndefined();
  });

  it('sets resource_attributes in state', () => {
    initState('nodejs');

    configureOtlpEnvVars(testDir, 'nodejs');

    const state = readState(testDir);
    expect(state.otlp!.resource_attributes).toBe('service.instance.id=$(hostname)-$$');
  });

  it('does not set cli_env_vars (cli config is handled by configureCli)', () => {
    initState('nodejs');

    configureOtlpEnvVars(testDir, 'nodejs', { appType: 'cli' });

    const state = readState(testDir);
    // CLI env vars are set by configureCli(), not configureOtlpEnvVars()
    expect(state.otlp!.cli_env_vars).toBeUndefined();
  });
});

describe('configureCli', () => {
  it('sets cli_env_vars with fast flush settings', () => {
    initStateWithOtlp('nodejs');

    configureCli(testDir);

    const state = readState(testDir);
    expect(state.otlp!.cli_env_vars).toEqual({
      OTEL_BSP_SCHEDULE_DELAY: '100',
      OTEL_TRACES_SAMPLER: 'always_on',
      OTEL_BLRP_SCHEDULE_DELAY: '100',
    });
  });

  it('does nothing when otlp is not configured', () => {
    initState('nodejs');

    // No otlp in state — should not throw
    configureCli(testDir);

    const state = readState(testDir);
    expect(state.otlp).toBeUndefined();
  });
});

describe('configureWeb', () => {
  it('installs web OTLP packages for Node.js', () => {
    initStateWithOtlp('nodejs');
    mockExecFileSync.mockReturnValue(Buffer.from(''));

    configureWeb(testDir, 'nodejs');

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'npm',
      expect.arrayContaining(['install', ...WEB_OTLP_PACKAGES]),
      expect.objectContaining({ cwd: testDir }),
    );
  });

  it('creates otel-web-init.js snippet with endpoint from state', () => {
    initStateWithOtlp('nodejs');
    mockExecFileSync.mockReturnValue(Buffer.from(''));

    configureWeb(testDir, 'nodejs');

    expect(existsSync(join(testDir, 'otel-web-init.js'))).toBe(true);
    const content = readFileSync(join(testDir, 'otel-web-init.js'), 'utf-8');
    expect(content).toContain('WebTracerProvider');
    expect(content).toContain('FetchInstrumentation');
    expect(content).toContain('http://localhost:4318/v1/traces');
  });

  it('uses custom endpoint from state in web snippet', () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    state.otlp = {
      enabled: true,
      endpoint: 'https://otel.company.com:4318',
      service_name: 'test-project',
      mode: 'remote-direct',
    };
    writeState(state, testDir);
    mockExecFileSync.mockReturnValue(Buffer.from(''));

    configureWeb(testDir, 'nodejs');

    const content = readFileSync(join(testDir, 'otel-web-init.js'), 'utf-8');
    expect(content).toContain('https://otel.company.com:4318/v1/traces');
    expect(content).not.toContain('localhost');
  });

  it('sets web_snippet_path in state', () => {
    initStateWithOtlp('nodejs');
    mockExecFileSync.mockReturnValue(Buffer.from(''));

    configureWeb(testDir, 'nodejs');

    const state = readState(testDir);
    expect(state.otlp!.web_snippet_path).toBe('otel-web-init.js');
  });

  it('does not fail when npm install fails for web packages', () => {
    initStateWithOtlp('nodejs');
    mockExecFileSync.mockImplementation(() => {
      throw new Error('npm failed');
    });

    // Should not throw
    configureWeb(testDir, 'nodejs');

    // Snippet should still be created
    expect(existsSync(join(testDir, 'otel-web-init.js'))).toBe(true);
  });

  it('skips npm install for non-nodejs stack but still creates snippet', () => {
    initStateWithOtlp('python');
    mockExecFileSync.mockClear();

    configureWeb(testDir, 'python');

    // npm should not be called for python stack
    expect(mockExecFileSync).not.toHaveBeenCalled();
    // Snippet should still be created
    expect(existsSync(join(testDir, 'otel-web-init.js'))).toBe(true);
  });
});

describe('configureAgent', () => {
  it('installs agent packages for Node.js', () => {
    initStateWithOtlp('nodejs');
    mockExecFileSync.mockReturnValue(Buffer.from(''));

    configureAgent(testDir, 'nodejs');

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'npm',
      expect.arrayContaining(['install', '@traceloop/node-server-sdk']),
      expect.objectContaining({ cwd: testDir }),
    );
  });

  it('installs agent packages for Python', () => {
    initStateWithOtlp('python');
    mockExecFileSync.mockReturnValue(Buffer.from(''));

    configureAgent(testDir, 'python');

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'pip',
      expect.arrayContaining(['install', 'traceloop-sdk']),
      expect.objectContaining({ cwd: testDir }),
    );
  });

  it('sets agent_sdk to traceloop in state', () => {
    initStateWithOtlp('nodejs');
    mockExecFileSync.mockReturnValue(Buffer.from(''));

    configureAgent(testDir, 'nodejs');

    const state = readState(testDir);
    expect(state.otlp!.agent_sdk).toBe('traceloop');
  });

  it('does not fail when agent package install fails for Node.js', () => {
    initStateWithOtlp('nodejs');
    mockExecFileSync.mockImplementation(() => {
      throw new Error('npm failed');
    });

    // Should not throw
    configureAgent(testDir, 'nodejs');

    // State should still be updated
    const state = readState(testDir);
    expect(state.otlp!.agent_sdk).toBe('traceloop');
  });

  it('falls back to pipx when pip fails for Python agent packages', () => {
    initStateWithOtlp('python');
    mockExecFileSync.mockImplementation((cmd) => {
      const cmdStr = typeof cmd === 'string' ? cmd : cmd.toString();
      if (cmdStr === 'pip') throw new Error('pip not found');
      // pipx succeeds
      return Buffer.from('');
    });

    configureAgent(testDir, 'python');

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'pipx',
      expect.arrayContaining(['install', 'traceloop-sdk']),
      expect.objectContaining({ cwd: testDir }),
    );
    const state = readState(testDir);
    expect(state.otlp!.agent_sdk).toBe('traceloop');
  });

  it('does not fail when both pip and pipx fail for Python agent packages', () => {
    initStateWithOtlp('python');
    mockExecFileSync.mockImplementation(() => {
      throw new Error('command not found');
    });

    // Should not throw
    configureAgent(testDir, 'python');

    // State should still be updated
    const state = readState(testDir);
    expect(state.otlp!.agent_sdk).toBe('traceloop');
  });

  it('does nothing for null stack', () => {
    initStateWithOtlp(null);

    configureAgent(testDir, null);

    const state = readState(testDir);
    expect(state.otlp!.agent_sdk).toBe('traceloop');
  });
});

describe('installAgentOtlp', () => {
  it('installs Node.js agent packages', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    const result = installAgentOtlp(testDir, 'nodejs');
    expect(result.status).toBe('configured');
    expect(result.packages_installed).toBe(true);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'npm',
      expect.arrayContaining(['install', '@traceloop/node-server-sdk']),
      expect.objectContaining({ cwd: testDir }),
    );
  });

  it('installs Python agent packages', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    const result = installAgentOtlp(testDir, 'python');
    expect(result.status).toBe('configured');
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'pip',
      expect.arrayContaining(['install', 'traceloop-sdk']),
      expect.objectContaining({ cwd: testDir }),
    );
  });

  it('returns failed when install fails', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('install failed');
    });
    const result = installAgentOtlp(testDir, 'nodejs');
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Failed to install agent OTLP packages');
  });

  it('truncates long error messages from install failures', () => {
    const longStderr = 'E'.repeat(500);
    mockExecFileSync.mockImplementation(() => {
      throw new Error(longStderr);
    });
    const result = installAgentOtlp(testDir, 'nodejs');
    expect(result.error).toBeDefined();
    expect(result.error!.length).toBeLessThan(500);
    expect(result.error).toContain('(truncated)');
  });
});

describe('instrumentProject', () => {
  it('instruments Node.js project end-to-end', () => {
    initState('nodejs');
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'test', scripts: { start: 'node server.js' } }),
    );
    mockExecFileSync.mockReturnValue(Buffer.from(''));

    const result = instrumentProject(testDir, 'nodejs');
    expect(result.status).toBe('configured');
    expect(result.packages_installed).toBe(true);
    expect(result.start_script_patched).toBe(true);
    expect(result.env_vars_configured).toBe(true);
  });

  it('instruments Python project end-to-end', () => {
    initState('python');
    mockExecFileSync.mockReturnValue(Buffer.from(''));

    const result = instrumentProject(testDir, 'python');
    expect(result.status).toBe('configured');
    expect(result.packages_installed).toBe(true);
    expect(result.env_vars_configured).toBe(true);
  });

  it('skips for unsupported stack', () => {
    initState(null);

    const result = instrumentProject(testDir, null);
    expect(result.status).toBe('skipped');
    expect(result.packages_installed).toBe(false);
  });

  it('handles Node.js install failure gracefully — env vars still configured', () => {
    initState('nodejs');
    mockExecFileSync.mockImplementation(() => {
      throw new Error('npm failed');
    });

    const result = instrumentProject(testDir, 'nodejs');
    expect(result.status).toBe('failed');
    // Env vars are always configured even when package install fails
    expect(result.env_vars_configured).toBe(true);

    // State should have node_require set
    const state = readState(testDir);
    expect(state.otlp).toBeDefined();
    expect(state.otlp!.node_require).toContain('--require');
  });

  it('handles Python install failure gracefully — env vars still configured', () => {
    initState('python');
    mockExecFileSync.mockImplementation(() => {
      throw new Error('pip failed');
    });

    const result = instrumentProject(testDir, 'python');
    expect(result.status).toBe('failed');
    // Env vars are always configured even when package install fails
    expect(result.env_vars_configured).toBe(true);

    // State should have python_wrapper set
    const state = readState(testDir);
    expect(state.otlp).toBeDefined();
    expect(state.otlp!.python_wrapper).toBe('opentelemetry-instrument');
  });

  it('prints messages in non-json mode for Node.js', () => {
    initState('nodejs');
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'test', scripts: { start: 'node server.js' } }),
    );
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    const logSpy = vi.spyOn(console, 'log');

    instrumentProject(testDir, 'nodejs', { json: false });

    const calls = logSpy.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('OTLP: Node.js packages installed'))).toBe(true);
    expect(calls.some(c => c.includes('OTLP: start script patched'))).toBe(true);
    expect(calls.some(c => c.includes('OTLP: environment variables configured'))).toBe(true);
  });

  it('prints info message when no start script to patch', () => {
    initState('nodejs');
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'test' }),
    );
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    const logSpy = vi.spyOn(console, 'log');

    instrumentProject(testDir, 'nodejs', { json: false });

    const calls = logSpy.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('no start/dev script found or already patched'))).toBe(true);
  });

  it('suppresses output in json mode', () => {
    initState('nodejs');
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    const logSpy = vi.spyOn(console, 'log');

    instrumentProject(testDir, 'nodejs', { json: true });

    const calls = logSpy.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => typeof c === 'string' && c.includes('[OK]'))).toBe(false);
  });

  it('prints Python wrapper instruction in non-json mode', () => {
    initState('python');
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    const logSpy = vi.spyOn(console, 'log');

    instrumentProject(testDir, 'python', { json: false });

    const calls = logSpy.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('opentelemetry-instrument'))).toBe(true);
  });

  it('prints error info in non-json mode when install fails', () => {
    initState('nodejs');
    mockExecFileSync.mockImplementation(() => { throw new Error('fail'); });
    const logSpy = vi.spyOn(console, 'log');

    instrumentProject(testDir, 'nodejs', { json: false });

    const calls = logSpy.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('OTLP:'))).toBe(true);
  });

  // --- App-type dispatch tests ---

  it('dispatches to CLI configuration when appType is cli', () => {
    initState('nodejs');
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
    mockExecFileSync.mockReturnValue(Buffer.from(''));

    const result = instrumentProject(testDir, 'nodejs', { appType: 'cli' });
    expect(result.status).toBe('configured');

    const state = readState(testDir);
    expect(state.otlp!.cli_env_vars).toBeDefined();
    expect(state.otlp!.cli_env_vars!.OTEL_BSP_SCHEDULE_DELAY).toBe('100');
  });

  it('dispatches to web configuration when appType is web', () => {
    initState('nodejs');
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
    mockExecFileSync.mockReturnValue(Buffer.from(''));

    const result = instrumentProject(testDir, 'nodejs', { appType: 'web' });
    expect(result.status).toBe('configured');

    const state = readState(testDir);
    expect(state.otlp!.web_snippet_path).toBe('otel-web-init.js');
    expect(existsSync(join(testDir, 'otel-web-init.js'))).toBe(true);
  });

  it('dispatches to agent configuration when appType is agent', () => {
    initState('nodejs');
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
    mockExecFileSync.mockReturnValue(Buffer.from(''));

    const result = instrumentProject(testDir, 'nodejs', { appType: 'agent' });
    expect(result.status).toBe('configured');

    const state = readState(testDir);
    expect(state.otlp!.agent_sdk).toBe('traceloop');
  });

  it('prints generic info message when appType is generic', () => {
    initState('nodejs');
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    const logSpy = vi.spyOn(console, 'log');

    instrumentProject(testDir, 'nodejs', { json: false, appType: 'generic' });

    const calls = logSpy.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('App type: generic (manual OTLP setup may be needed)'))).toBe(true);
  });

  it('does not print generic message in json mode', () => {
    initState('nodejs');
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    const logSpy = vi.spyOn(console, 'log');

    instrumentProject(testDir, 'nodejs', { json: true, appType: 'generic' });

    const calls = logSpy.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('generic'))).toBe(false);
  });

  it('calls ensureServiceNameEnvVar when configuring env vars', () => {
    initState('nodejs');
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
    mockExecFileSync.mockReturnValue(Buffer.from(''));

    instrumentProject(testDir, 'nodejs');

    // .env.codeharness should be created with the service name
    expect(existsSync(join(testDir, '.env.codeharness'))).toBe(true);
    const content = readFileSync(join(testDir, '.env.codeharness'), 'utf-8');
    expect(content).toContain('OTEL_SERVICE_NAME=');
  });

  it('no additional config for server appType', () => {
    initState('nodejs');
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'test', scripts: { start: 'node server.js' } }),
    );
    mockExecFileSync.mockReturnValue(Buffer.from(''));

    const result = instrumentProject(testDir, 'nodejs', { appType: 'server' });
    expect(result.status).toBe('configured');

    const state = readState(testDir);
    expect(state.otlp!.cli_env_vars).toBeUndefined();
    expect(state.otlp!.web_snippet_path).toBeUndefined();
    expect(state.otlp!.agent_sdk).toBeUndefined();
  });

  it('prints CLI instrumentation message in non-json mode', () => {
    initState('nodejs');
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    const logSpy = vi.spyOn(console, 'log');

    instrumentProject(testDir, 'nodejs', { json: false, appType: 'cli' });

    const calls = logSpy.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('CLI instrumentation configured'))).toBe(true);
  });

  it('prints web instrumentation message in non-json mode', () => {
    initState('nodejs');
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    const logSpy = vi.spyOn(console, 'log');

    instrumentProject(testDir, 'nodejs', { json: false, appType: 'web' });

    const calls = logSpy.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('Web instrumentation configured'))).toBe(true);
  });

  it('prints agent instrumentation message in non-json mode', () => {
    initState('nodejs');
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    const logSpy = vi.spyOn(console, 'log');

    instrumentProject(testDir, 'nodejs', { json: false, appType: 'agent' });

    const calls = logSpy.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('Agent/LLM instrumentation configured'))).toBe(true);
  });
});

describe('ensureServiceNameEnvVar', () => {
  it('creates .env.codeharness with OTEL_SERVICE_NAME', () => {
    ensureServiceNameEnvVar(testDir, 'my-project');

    const content = readFileSync(join(testDir, '.env.codeharness'), 'utf-8');
    expect(content).toBe('OTEL_SERVICE_NAME=my-project\n');
  });

  it('updates existing file without clobbering other entries', () => {
    writeFileSync(join(testDir, '.env.codeharness'), 'OTHER_VAR=value\nOTEL_SERVICE_NAME=old-name\n', 'utf-8');

    ensureServiceNameEnvVar(testDir, 'new-name');

    const content = readFileSync(join(testDir, '.env.codeharness'), 'utf-8');
    expect(content).toContain('OTHER_VAR=value');
    expect(content).toContain('OTEL_SERVICE_NAME=new-name');
    expect(content).not.toContain('old-name');
  });

  it('appends to existing file when OTEL_SERVICE_NAME is not present', () => {
    writeFileSync(join(testDir, '.env.codeharness'), 'OTHER_VAR=value\n', 'utf-8');

    ensureServiceNameEnvVar(testDir, 'my-project');

    const content = readFileSync(join(testDir, '.env.codeharness'), 'utf-8');
    expect(content).toContain('OTHER_VAR=value');
    expect(content).toContain('OTEL_SERVICE_NAME=my-project');
  });

  it('handles project names with hyphens', () => {
    ensureServiceNameEnvVar(testDir, 'my-cool-project');

    const content = readFileSync(join(testDir, '.env.codeharness'), 'utf-8');
    expect(content).toBe('OTEL_SERVICE_NAME=my-cool-project\n');
  });

  it('handles project names with underscores', () => {
    ensureServiceNameEnvVar(testDir, 'my_project_v2');

    const content = readFileSync(join(testDir, '.env.codeharness'), 'utf-8');
    expect(content).toBe('OTEL_SERVICE_NAME=my_project_v2\n');
  });

  it('sanitizes project names with spaces and special characters', () => {
    ensureServiceNameEnvVar(testDir, 'my project&name=bad');

    const content = readFileSync(join(testDir, '.env.codeharness'), 'utf-8');
    expect(content).toBe('OTEL_SERVICE_NAME=my-project-name-bad\n');
  });

  it('does not introduce blank lines when appending to file ending with newline', () => {
    writeFileSync(join(testDir, '.env.codeharness'), 'OTHER_VAR=value\n', 'utf-8');

    ensureServiceNameEnvVar(testDir, 'my-project');

    const content = readFileSync(join(testDir, '.env.codeharness'), 'utf-8');
    expect(content).toBe('OTHER_VAR=value\nOTEL_SERVICE_NAME=my-project\n');
    expect(content).not.toContain('\n\n');
  });
});

describe('configureOtlpEnvVars creates .env.codeharness', () => {
  it('writes .env.codeharness when configuring OTLP env vars', () => {
    initState('nodejs');

    configureOtlpEnvVars(testDir, 'nodejs');

    expect(existsSync(join(testDir, '.env.codeharness'))).toBe(true);
    const content = readFileSync(join(testDir, '.env.codeharness'), 'utf-8');
    expect(content).toContain('OTEL_SERVICE_NAME=');
  });
});
