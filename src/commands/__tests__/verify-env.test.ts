import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// Mock verify module
vi.mock('../../modules/verify/index.js', () => ({
  buildVerifyImage: vi.fn(() => ({
    imageTag: 'codeharness-verify',
    imageSize: '250.0MB',
    buildTimeMs: 1500,
    cached: false,
  })),
  prepareVerifyWorkspace: vi.fn(() => '/tmp/codeharness-verify-test-story'),
  checkVerifyEnv: vi.fn(() => ({
    imageExists: true,
    cliWorks: true,
    otelReachable: true,
  })),
  cleanupVerifyEnv: vi.fn(),
  isValidStoryKey: vi.fn((k: string) => /^[a-zA-Z0-9_-]+$/.test(k)),
}));

import { registerVerifyEnvCommand } from '../verify-env.js';
import {
  buildVerifyImage,
  prepareVerifyWorkspace,
  checkVerifyEnv,
  cleanupVerifyEnv,
} from '../../modules/verify/index.js';

const mockBuild = vi.mocked(buildVerifyImage);
const mockPrepare = vi.mocked(prepareVerifyWorkspace);
const mockCheck = vi.mocked(checkVerifyEnv);
const mockCleanup = vi.mocked(cleanupVerifyEnv);

function createCli(): Command {
  const program = new Command();
  program.option('--json', 'JSON output');
  program.exitOverride();
  registerVerifyEnvCommand(program);
  return program;
}

async function runCli(args: string[]): Promise<{ stdout: string; exitCode: number | undefined }> {
  const logs: string[] = [];
  const consoleSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    logs.push(a.map(String).join(' '));
  });

  process.exitCode = undefined;

  try {
    await createCli().parseAsync(['node', 'codeharness', ...args]);
  } catch {
    // Commander exitOverride throws
  }

  consoleSpy.mockRestore();
  return { stdout: logs.join('\n'), exitCode: process.exitCode };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
  // Reset default mock behaviors after clearAllMocks
  mockBuild.mockReturnValue({
    imageTag: 'codeharness-verify',
    imageSize: '250.0MB',
    buildTimeMs: 1500,
    cached: false,
  });
  mockPrepare.mockReturnValue('/tmp/codeharness-verify-test-story');
  mockCheck.mockReturnValue({
    imageExists: true,
    cliWorks: true,
    otelReachable: true,
  });
  mockCleanup.mockImplementation(() => {});
});

describe('verify-env build', () => {
  it('calls buildVerifyImage and reports success', async () => {
    const { stdout } = await runCli(['verify-env', 'build']);
    expect(mockBuild).toHaveBeenCalled();
    expect(stdout).toContain('[OK]');
    expect(stdout).toContain('codeharness-verify');
  });

  it('reports cached result', async () => {
    mockBuild.mockReturnValue({
      imageTag: 'codeharness-verify',
      imageSize: '250.0MB',
      buildTimeMs: 0,
      cached: true,
    });

    const { stdout } = await runCli(['verify-env', 'build']);
    expect(stdout).toContain('cached');
  });

  it('outputs JSON when --json flag is set', async () => {
    const { stdout } = await runCli(['--json', 'verify-env', 'build']);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('ok');
    expect(parsed.imageTag).toBe('codeharness-verify');
    expect(parsed.imageSize).toBe('250.0MB');
    expect(parsed.buildTimeMs).toBe(1500);
    expect(parsed.cached).toBe(false);
  });

  it('reports failure on error', async () => {
    mockBuild.mockImplementation(() => {
      throw new Error('Docker not found');
    });

    const { stdout, exitCode } = await runCli(['verify-env', 'build']);
    expect(stdout).toContain('Docker not found');
    expect(exitCode).toBe(1);
  });

  it('outputs JSON failure on error with --json', async () => {
    mockBuild.mockImplementation(() => {
      throw new Error('Docker not found');
    });

    const { stdout } = await runCli(['--json', 'verify-env', 'build']);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('fail');
    expect(parsed.message).toBe('Docker not found');
  });
});

describe('verify-env prepare', () => {
  it('requires --story option', async () => {
    // Commander with exitOverride throws CommanderError for missing required option
    let threw = false;
    try {
      await createCli().parseAsync(['node', 'codeharness', 'verify-env', 'prepare']);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it('calls prepareVerifyWorkspace with story key', async () => {
    const { stdout } = await runCli(['verify-env', 'prepare', '--story', 'test-story']);
    expect(mockPrepare).toHaveBeenCalledWith('test-story');
    expect(stdout).toContain('[OK]');
  });

  it('outputs JSON on success with --json', async () => {
    const { stdout } = await runCli(['--json', 'verify-env', 'prepare', '--story', 'test-story']);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('ok');
    expect(parsed.workspace).toBe('/tmp/codeharness-verify-test-story');
    expect(parsed.storyKey).toBe('test-story');
  });

  it('reports failure on error', async () => {
    mockPrepare.mockImplementation(() => {
      throw new Error('Story file not found');
    });

    const { stdout, exitCode } = await runCli(['verify-env', 'prepare', '--story', 'bad-story']);
    expect(stdout).toContain('Story file not found');
    expect(exitCode).toBe(1);
  });
});

describe('verify-env check', () => {
  it('reports all checks passing', async () => {
    const { stdout } = await runCli(['verify-env', 'check']);
    expect(mockCheck).toHaveBeenCalled();
    expect(stdout).toContain('[OK]');
    expect(stdout).toContain('ready');
  });

  it('reports failures when checks fail', async () => {
    mockCheck.mockReturnValue({
      imageExists: false,
      cliWorks: false,
      otelReachable: false,
    });

    const { stdout, exitCode } = await runCli(['verify-env', 'check']);
    expect(stdout).toContain('not ready');
    expect(exitCode).toBe(1);
  });

  it('reports CLI packaging error when image exists but CLI broken', async () => {
    mockCheck.mockReturnValue({
      imageExists: true,
      cliWorks: false,
      otelReachable: true,
    });

    const { stdout, exitCode } = await runCli(['verify-env', 'check']);
    expect(stdout).toContain('CLI does not work inside verification container — build or packaging is broken');
    expect(exitCode).toBe(1);
  });

  it('outputs JSON with CLI packaging error when image exists but CLI broken', async () => {
    mockCheck.mockReturnValue({
      imageExists: true,
      cliWorks: false,
      otelReachable: true,
    });

    const { stdout, exitCode } = await runCli(['--json', 'verify-env', 'check']);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('fail');
    expect(parsed.cliWorks).toBe(false);
    expect(parsed.message).toBe('CLI does not work inside verification container — build or packaging is broken');
    expect(exitCode).toBe(1);
  });

  it('outputs JSON', async () => {
    const { stdout } = await runCli(['--json', 'verify-env', 'check']);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('ok');
    expect(parsed.imageExists).toBe(true);
    expect(parsed.cliWorks).toBe(true);
    expect(parsed.otelReachable).toBe(true);
  });
});

describe('verify-env cleanup', () => {
  it('requires --story option', async () => {
    let threw = false;
    try {
      await createCli().parseAsync(['node', 'codeharness', 'verify-env', 'cleanup']);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it('calls cleanupVerifyEnv with story key', async () => {
    const { stdout } = await runCli(['verify-env', 'cleanup', '--story', 'test-story']);
    expect(mockCleanup).toHaveBeenCalledWith('test-story');
    expect(stdout).toContain('[OK]');
  });

  it('outputs JSON on success with --json', async () => {
    const { stdout } = await runCli(['--json', 'verify-env', 'cleanup', '--story', 'test-story']);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('ok');
    expect(parsed.storyKey).toBe('test-story');
  });

  it('reports failure on error', async () => {
    mockCleanup.mockImplementation(() => {
      throw new Error('Invalid story key');
    });

    const { stdout, exitCode } = await runCli(['verify-env', 'cleanup', '--story', 'bad']);
    expect(stdout).toContain('Invalid story key');
    expect(exitCode).toBe(1);
  });
});
