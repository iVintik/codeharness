import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { existsSync as origExistsSync, readFileSync as origReadFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { resolvePluginDir, countStories } from '../run.js';

// --- Hoisted mocks ---
const {
  getDriverMock, existsSyncMock, readSprintStatusMock,
  realExistsSync, startRendererMock, rendererCleanupMock,
  getSprintStateMock, reconcileStateMock,
  isDockerAvailableMock, cleanupContainersMock,
} = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs');
  const realFn = fs.existsSync.bind(fs);

  const rendererCleanupMock = vi.fn();

  return {
    getDriverMock: vi.fn(() => { throw new Error('No agent drivers available'); }),
    existsSyncMock: vi.fn(realFn),
    readSprintStatusMock: vi.fn(() => ({}) as Record<string, string>),
    realExistsSync: realFn as (path: string) => boolean,
    startRendererMock: vi.fn(() => ({
      update: vi.fn(),
      updateSprintState: vi.fn(),
      updateStories: vi.fn(),
      addMessage: vi.fn(),
      cleanup: rendererCleanupMock,
    })),
    rendererCleanupMock,
    getSprintStateMock: vi.fn((): { success: boolean; data?: Record<string, unknown>; error?: string } => ({ success: false, error: 'no state' })),
    reconcileStateMock: vi.fn(() => ({ success: true, data: { corrections: [], stateChanged: false } })),
    isDockerAvailableMock: vi.fn(() => true),
    cleanupContainersMock: vi.fn((): { success: boolean; data?: { containersRemoved: number; names: string[] }; error?: string } => ({ success: true, data: { containersRemoved: 0, names: [] } })),
  };
});

vi.mock('../../lib/agents/index.js', () => ({
  getDriver: (...args: unknown[]) => getDriverMock(...(args as Parameters<typeof getDriverMock>)),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: existsSyncMock };
});

vi.mock('../../lib/ink-renderer.js', () => ({
  startRenderer: (...args: unknown[]) => startRendererMock(...(args as Parameters<typeof startRendererMock>)),
}));

vi.mock('../../modules/sprint/index.js', () => ({
  getSprintState: (...args: unknown[]) => getSprintStateMock(...(args as Parameters<typeof getSprintStateMock>)),
  readSprintStatusFromState: (...args: unknown[]) => readSprintStatusMock(...(args as Parameters<typeof readSprintStatusMock>)),
  reconcileState: (...args: unknown[]) => reconcileStateMock(...(args as Parameters<typeof reconcileStateMock>)),
  updateStoryStatus: vi.fn(() => ({ success: true, data: undefined })),
  shouldDeferPhase: vi.fn(() => false),
  getPhaseEstimate: vi.fn(() => 15),
  computeRemainingMinutes: vi.fn(() => 60),
}));

vi.mock('../../lib/docker/index.js', () => ({
  isDockerAvailable: (...args: unknown[]) => isDockerAvailableMock(...(args as Parameters<typeof isDockerAvailableMock>)),
}));

vi.mock('../../modules/infra/index.js', () => ({
  cleanupContainers: (...args: unknown[]) => cleanupContainersMock(...(args as Parameters<typeof cleanupContainersMock>)),
}));


describe('run command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'run-test-'));
    getDriverMock.mockClear();
    existsSyncMock.mockReset();
    existsSyncMock.mockImplementation((p: unknown) => realExistsSync(String(p)));
    readSprintStatusMock.mockReset();
    readSprintStatusMock.mockReturnValue({});
    startRendererMock.mockClear();
    rendererCleanupMock.mockClear();
    getSprintStateMock.mockClear();
    getSprintStateMock.mockReturnValue({ success: false, error: 'no state' });
    reconcileStateMock.mockClear();
    reconcileStateMock.mockReturnValue({ success: true, data: { corrections: [], stateChanged: false } });
    isDockerAvailableMock.mockClear();
    isDockerAvailableMock.mockReturnValue(true);
    cleanupContainersMock.mockClear();
    cleanupContainersMock.mockReturnValue({ success: true, data: { containersRemoved: 0, names: [] } });
    process.exitCode = undefined;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  function mockPaths(overrides: Record<string, boolean>) {
    existsSyncMock.mockImplementation((p: unknown) => {
      const path = String(p);
      for (const [pattern, value] of Object.entries(overrides)) {
        if (path.includes(pattern)) return value;
      }
      return realExistsSync(path);
    });
  }

  async function runCommand(args: string[] = []) {
    const { registerRunCommand } = await import('../run.js');
    const program = new Command();
    program.exitOverride();
    program.option('--json', 'JSON output');
    registerRunCommand(program);
    await program.parseAsync(['node', 'codeharness', 'run', ...args]);
  }

  describe('resolvePluginDir', () => {
    it('returns cwd/.claude', () => {
      expect(resolvePluginDir()).toBe(join(process.cwd(), '.claude'));
    });
  });

  describe('countStories (re-export)', () => {
    it('re-exports countStories from run-helpers.ts', () => {
      const counts = countStories({ '1-1-story': 'done', '1-2-story': 'backlog' });
      expect(counts.total).toBe(2);
      expect(counts.done).toBe(1);
    });
  });

  describe('action handler', () => {
    it('fails when plugin directory not found', async () => {
      mockPaths({ '.claude': false });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Plugin directory not found'));
      expect(process.exitCode).toBe(1);
    });

    // Run command now exits early with "temporarily unavailable" since Ralph was removed (Story 1.2).
    // All tests that depend on driver spawn are removed — they'll return when Epic 5 rebuilds the command.

    it('exits with temporarily unavailable message (Ralph removed)', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('temporarily unavailable'));
      expect(process.exitCode).toBe(1);
    });

    it('fails when Docker is unavailable', async () => {
      mockPaths({ '.claude': true });
      isDockerAvailableMock.mockReturnValue(false);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Docker not available'));
      expect(process.exitCode).toBe(1);
    });

    it('fails when no stories found in sprint state', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({});
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No stories found'));
      expect(process.exitCode).toBe(1);
    });

    it('logs reconciliation corrections when present', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      reconcileStateMock.mockReturnValue({
        success: true,
        data: { corrections: ['Fixed story-a status'], stateChanged: true },
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Reconciled: Fixed story-a status'));
    });

    it('warns when state reconciliation fails', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      reconcileStateMock.mockReturnValue({ success: false, error: 'state file corrupt' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('State reconciliation failed'));
    });

    it('logs container cleanup when containers removed', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      cleanupContainersMock.mockReturnValue({
        success: true,
        data: { containersRemoved: 2, names: ['harness-a', 'harness-b'] },
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Cleaned up 2 orphaned container(s)'));
    });

    it('warns when container cleanup fails', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      cleanupContainersMock.mockReturnValue({ success: false, error: 'docker socket error' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Container cleanup failed'));
    });

    it('fails with invalid numeric option', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand(['--max-iterations', 'abc']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid numeric option'));
      expect(process.exitCode).toBe(1);
    });
  });

  describe('run command registration', () => {
    it('registers the run command with correct options', async () => {
      const { registerRunCommand } = await import('../run.js');
      const program = new Command();
      program.option('--json', 'JSON output');
      registerRunCommand(program);

      const runCmd = program.commands.find(c => c.name() === 'run');
      expect(runCmd).toBeDefined();
      expect(runCmd!.description()).toBe('Execute the autonomous coding loop');

      const optionNames = runCmd!.options.map(o => o.long);
      expect(optionNames).toContain('--max-iterations');
      expect(optionNames).toContain('--timeout');
      expect(optionNames).toContain('--quiet');
      expect(optionNames).toContain('--max-story-retries');
    });

    it('--max-story-retries defaults to 10', async () => {
      const { registerRunCommand } = await import('../run.js');
      const program = new Command();
      program.option('--json', 'JSON output');
      registerRunCommand(program);

      const runCmd = program.commands.find(c => c.name() === 'run');
      const retryOpt = runCmd!.options.find(o => o.long === '--max-story-retries');
      expect(retryOpt!.defaultValue).toBe('10');
    });
  });

  describe('source code verification', () => {
    it('run.ts does not import spawn from node:child_process', () => {
      const runSource = origReadFileSync(
        join(process.cwd(), 'src', 'commands', 'run.ts'),
        'utf-8',
      );
      expect(runSource).not.toContain("from 'node:child_process'");
    });

    it('run.ts does not import buildSpawnArgs or resolveRalphPath', () => {
      const runSource = origReadFileSync(
        join(process.cwd(), 'src', 'commands', 'run.ts'),
        'utf-8',
      );
      expect(runSource).not.toContain('buildSpawnArgs');
      expect(runSource).not.toContain('resolveRalphPath');
    });

    it('run.ts does not import or use createLineProcessor', () => {
      const runSource = origReadFileSync(
        join(process.cwd(), 'src', 'commands', 'run.ts'),
        'utf-8',
      );
      expect(runSource).not.toContain('createLineProcessor');
    });

    it('run.ts does not import getDriver (Ralph spawn removed in Story 1.2)', () => {
      const runSource = origReadFileSync(
        join(process.cwd(), 'src', 'commands', 'run.ts'),
        'utf-8',
      );
      expect(runSource).not.toContain('getDriver');
    });

    it('run.ts does not import DashboardFormatter', () => {
      const runSource = origReadFileSync(
        join(process.cwd(), 'src', 'commands', 'run.ts'),
        'utf-8',
      );
      expect(runSource).not.toContain('DashboardFormatter');
    });

    it('run.ts does not import generateRalphPrompt', () => {
      const runSource = origReadFileSync(
        join(process.cwd(), 'src', 'commands', 'run.ts'),
        'utf-8',
      );
      expect(runSource).not.toContain('generateRalphPrompt');
    });
  });
});
