import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { existsSync as origExistsSync, readFileSync as origReadFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { Command } from 'commander';
import { resolvePluginDir, countStories } from '../run.js';

// --- Hoisted mocks ---
const {
  getDriverMock, mockDriverInstance,
  existsSyncMock, readSprintStatusMock,
  realExistsSync, startRendererMock,
  rendererUpdateMock, rendererUpdateSprintStateMock, rendererCleanupMock,
  rendererUpdateStoriesMock, rendererAddMessageMock,
  getSprintStateMock, reconcileStateMock,
  isDockerAvailableMock, cleanupContainersMock,
} = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs');
  const realFn = fs.existsSync.bind(fs);

  const childHandlers: Record<string, (...args: unknown[]) => void> = {};
  let stdoutEmitter: EventEmitter | null = null;
  let stderrEmitter: EventEmitter | null = null;

  const rendererUpdateMock = vi.fn();
  const rendererUpdateSprintStateMock = vi.fn();
  const rendererCleanupMock = vi.fn();
  const rendererUpdateStoriesMock = vi.fn();
  const rendererAddMessageMock = vi.fn();

  const mockDriverInstance = {
    name: 'ralph',
    spawn: vi.fn(() => {
      stdoutEmitter = new EventEmitter();
      stderrEmitter = new EventEmitter();
      return {
        on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          childHandlers[event] = handler;
        }),
        kill: vi.fn(),
        stdout: stdoutEmitter,
        stderr: stderrEmitter,
      };
    }),
    parseOutput: vi.fn(() => null),
    getStatusFile: vi.fn(() => 'ralph/status.json'),
    _getChildOnHandlers: () => childHandlers,
    _getStdoutEmitter: () => stdoutEmitter,
    _getStderrEmitter: () => stderrEmitter,
  };

  return {
    getDriverMock: vi.fn(() => mockDriverInstance),
    mockDriverInstance,
    existsSyncMock: vi.fn(realFn),
    readSprintStatusMock: vi.fn(() => ({}) as Record<string, string>),
    realExistsSync: realFn as (path: string) => boolean,
    startRendererMock: vi.fn(() => ({
      update: rendererUpdateMock,
      updateSprintState: rendererUpdateSprintStateMock,
      updateStories: rendererUpdateStoriesMock,
      addMessage: rendererAddMessageMock,
      cleanup: rendererCleanupMock,
    })),
    rendererUpdateMock,
    rendererUpdateSprintStateMock,
    rendererCleanupMock,
    rendererUpdateStoriesMock,
    rendererAddMessageMock,
    getSprintStateMock: vi.fn(() => ({ success: false, error: 'no state' })),
    reconcileStateMock: vi.fn(() => ({ success: true, data: { corrections: [], stateChanged: false } })),
    isDockerAvailableMock: vi.fn(() => true),
    cleanupContainersMock: vi.fn(() => ({ success: true, data: { containersRemoved: 0, names: [] } })),
  };
});

vi.mock('../../lib/agents/index.js', () => ({
  getDriver: (...args: unknown[]) => getDriverMock(...args),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: existsSyncMock };
});

vi.mock('../../lib/agents/ralph-prompt.js', () => ({
  generateRalphPrompt: vi.fn(() => 'mock prompt content'),
}));

vi.mock('../../lib/ink-renderer.js', () => ({
  startRenderer: (...args: unknown[]) => startRendererMock(...args),
}));

vi.mock('../../modules/sprint/index.js', () => ({
  getSprintState: (...args: unknown[]) => getSprintStateMock(...args),
  readSprintStatusFromState: (...args: unknown[]) => readSprintStatusMock(...args),
  reconcileState: (...args: unknown[]) => reconcileStateMock(...args),
}));

vi.mock('../../lib/docker/index.js', () => ({
  isDockerAvailable: (...args: unknown[]) => isDockerAvailableMock(...args),
}));

vi.mock('../../modules/infra/index.js', () => ({
  cleanupContainers: (...args: unknown[]) => cleanupContainersMock(...args),
}));

describe('run command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'run-test-'));
    getDriverMock.mockClear();
    mockDriverInstance.spawn.mockClear();
    mockDriverInstance.parseOutput.mockClear();
    mockDriverInstance.parseOutput.mockReturnValue(null);
    mockDriverInstance.getStatusFile.mockClear();
    mockDriverInstance.getStatusFile.mockReturnValue('ralph/status.json');
    existsSyncMock.mockReset();
    existsSyncMock.mockImplementation((p: unknown) => realExistsSync(String(p)));
    readSprintStatusMock.mockReset();
    readSprintStatusMock.mockReturnValue({});
    startRendererMock.mockClear();
    rendererUpdateMock.mockClear();
    rendererUpdateSprintStateMock.mockClear();
    rendererCleanupMock.mockClear();
    rendererUpdateStoriesMock.mockClear();
    rendererAddMessageMock.mockClear();
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

  // Helper to control existsSync per path pattern
  function mockPaths(overrides: Record<string, boolean>) {
    existsSyncMock.mockImplementation((p: unknown) => {
      const path = String(p);
      for (const [pattern, value] of Object.entries(overrides)) {
        if (path.includes(pattern)) return value;
      }
      return realExistsSync(path);
    });
  }

  // Helper to invoke the run command via Commander
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

    it('fails when no stories in sprint-state.json', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({});
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No stories found'));
      expect(process.exitCode).toBe(1);
    });

    it('fails when Docker is not available (AC#1, AC#2)', async () => {
      mockPaths({ '.claude': true });
      isDockerAvailableMock.mockReturnValue(false);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Docker not available'));
      expect(process.exitCode).toBe(1);
      expect(mockDriverInstance.spawn).not.toHaveBeenCalled();
    });

    it('continues normally when Docker available and no orphans (AC#5)', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const p = runCommand();
      await vi.waitFor(() => expect(mockDriverInstance.spawn).toHaveBeenCalled());
      mockDriverInstance._getChildOnHandlers()['close'](0);
      await p;

      expect(isDockerAvailableMock).toHaveBeenCalled();
      expect(cleanupContainersMock).toHaveBeenCalled();
    });

    it('logs info when orphaned containers are cleaned up (AC#3)', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      cleanupContainersMock.mockReturnValue({
        success: true,
        data: { containersRemoved: 2, names: ['codeharness-verify-abc', 'codeharness-shared-xyz'] },
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const p = runCommand();
      await vi.waitFor(() => expect(mockDriverInstance.spawn).toHaveBeenCalled());
      mockDriverInstance._getChildOnHandlers()['close'](0);
      await p;

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Cleaned up 2 orphaned container(s)'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('codeharness-verify-abc'));
    });

    it('warns but continues when cleanup fails (AC#6)', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      cleanupContainersMock.mockReturnValue({
        success: false,
        error: 'Docker daemon unreachable',
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const p = runCommand();
      await vi.waitFor(() => expect(mockDriverInstance.spawn).toHaveBeenCalled());
      mockDriverInstance._getChildOnHandlers()['close'](0);
      await p;

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Container cleanup failed'));
      expect(mockDriverInstance.spawn).toHaveBeenCalled();
    });

    it('fails with invalid numeric options', async () => {
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand(['--max-iterations', 'abc']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid numeric option'));
      expect(process.exitCode).toBe(1);
    });

    it('calls getDriver and driver.spawn with correct opts', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-do-stuff': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const p = runCommand();
      await vi.waitFor(() => expect(mockDriverInstance.spawn).toHaveBeenCalled());
      mockDriverInstance._getChildOnHandlers()['close'](0);
      await p;

      // getDriver called with 'ralph' and config containing pluginDir
      expect(getDriverMock).toHaveBeenCalledWith('ralph', expect.objectContaining({
        pluginDir: expect.stringContaining('.claude'),
        maxIterations: 50,
        iterationTimeout: 30,
        calls: 100,
        quiet: false,
        maxStoryRetries: 10,
      }));

      // driver.spawn called with SpawnOpts
      expect(mockDriverInstance.spawn).toHaveBeenCalledWith(expect.objectContaining({
        storyKey: '',
        prompt: expect.stringContaining('.harness-prompt.md'),
        workDir: tmpDir,
        timeout: 43200,
      }));

      expect(process.exitCode).toBe(0);
    });

    it('propagates non-zero exit code from agent', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const p = runCommand();
      await vi.waitFor(() => expect(mockDriverInstance.spawn).toHaveBeenCalled());
      mockDriverInstance._getChildOnHandlers()['close'](42);
      await p;

      expect(process.exitCode).toBe(42);
    });

    it('handles spawn error gracefully', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const p = runCommand();
      await vi.waitFor(() => expect(mockDriverInstance.spawn).toHaveBeenCalled());
      mockDriverInstance._getChildOnHandlers()['error'](new Error('ENOENT: bash not found'));
      await p;

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to start agent'));
      expect(process.exitCode).toBe(1);
    });

    it('outputs JSON with status.json present', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mkdirSync(join(tmpDir, 'ralph'), { recursive: true });
      writeFileSync(join(tmpDir, 'ralph', 'status.json'), JSON.stringify({
        status: 'completed', loop_count: 5, elapsed_seconds: 120,
        flagged_stories: [], exit_reason: 'all_done',
      }));
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'done' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const p = runCommand(['--json']);
      await vi.waitFor(() => expect(mockDriverInstance.spawn).toHaveBeenCalled());
      mockDriverInstance._getChildOnHandlers()['close'](0);
      await p;

      const jsonCall = consoleSpy.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes('"storiesCompleted"')
      );
      expect(jsonCall).toBeDefined();
      const output = JSON.parse(jsonCall![0] as string);
      expect(output.status).toBe('completed');
      expect(output.iterations).toBe(5);
      expect(output.storiesCompleted).toBe(1);
      expect(output.exitReason).toBe('all_done');
    });

    it('uses driver.getStatusFile() for status file path', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockDriverInstance.getStatusFile.mockReturnValue('ralph/status.json');
      mkdirSync(join(tmpDir, 'ralph'), { recursive: true });
      writeFileSync(join(tmpDir, 'ralph', 'status.json'), JSON.stringify({ status: 'completed' }));
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'done' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const p = runCommand(['--json']);
      await vi.waitFor(() => expect(mockDriverInstance.spawn).toHaveBeenCalled());
      mockDriverInstance._getChildOnHandlers()['close'](0);
      await p;

      expect(mockDriverInstance.getStatusFile).toHaveBeenCalled();
    });

    it('outputs JSON fallback when status.json missing', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ '.claude': true, 'status.json': false });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const p = runCommand(['--json']);
      await vi.waitFor(() => expect(mockDriverInstance.spawn).toHaveBeenCalled());
      mockDriverInstance._getChildOnHandlers()['close'](1);
      await p;

      const jsonCall = consoleSpy.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes('"exitReason"')
      );
      expect(jsonCall).toBeDefined();
      const output = JSON.parse(jsonCall![0] as string);
      expect(output.status).toBe('stopped');
      expect(output.exitReason).toBe('status_file_missing');
    });

    it('reads flagged stories from sprint-state.json', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mkdirSync(join(tmpDir, 'ralph'), { recursive: true });
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});
      getSprintStateMock.mockReturnValue({
        success: true,
        data: {
          sprint: { total: 1, done: 0, failed: 0, blocked: 0, inProgress: null },
          run: { currentStory: null, currentPhase: null, active: false },
          stories: {},
          actionItems: [],
          flagged: ['1-1-broken', '2-1-stuck'],
        },
      });

      const { generateRalphPrompt } = await import('../../lib/agents/ralph-prompt.js');
      const promptMock = vi.mocked(generateRalphPrompt);
      promptMock.mockClear();

      const p = runCommand();
      await vi.waitFor(() => expect(mockDriverInstance.spawn).toHaveBeenCalled());
      mockDriverInstance._getChildOnHandlers()['close'](0);
      await p;

      expect(promptMock).toHaveBeenCalledWith(expect.objectContaining({
        flaggedStories: ['1-1-broken', '2-1-stuck'],
      }));
    });

    it('passes env with CLAUDE_OUTPUT_FORMAT when --json', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const p = runCommand(['--json']);
      await vi.waitFor(() => expect(mockDriverInstance.spawn).toHaveBeenCalled());
      mockDriverInstance._getChildOnHandlers()['close'](0);
      await p;

      expect(mockDriverInstance.spawn).toHaveBeenCalledWith(expect.objectContaining({
        env: expect.objectContaining({ CLAUDE_OUTPUT_FORMAT: 'stream-json' }),
      }));
    });

    it('does not set CLAUDE_OUTPUT_FORMAT without --json', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const p = runCommand();
      await vi.waitFor(() => expect(mockDriverInstance.spawn).toHaveBeenCalled());
      mockDriverInstance._getChildOnHandlers()['close'](0);
      await p;

      const spawnCall = mockDriverInstance.spawn.mock.calls[0][0];
      expect(spawnCall.env.CLAUDE_OUTPUT_FORMAT).toBeUndefined();
    });

    it('writes prompt file to ralph directory', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const p = runCommand();
      await vi.waitFor(() => expect(mockDriverInstance.spawn).toHaveBeenCalled());
      mockDriverInstance._getChildOnHandlers()['close'](0);
      await p;

      const promptPath = join(tmpDir, 'ralph', '.harness-prompt.md');
      expect(realExistsSync(promptPath)).toBe(true);
      expect(origReadFileSync(promptPath, 'utf-8')).toBe('mock prompt content');
    });

    it('prints starting message with story counts', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({
        '1-1-a': 'backlog', '1-2-b': 'done', '1-3-c': 'in-progress',
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const p = runCommand();
      await vi.waitFor(() => expect(mockDriverInstance.spawn).toHaveBeenCalled());
      mockDriverInstance._getChildOnHandlers()['close'](0);
      await p;

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('1 ready'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('1/3 done'));
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

  describe('AgentDriver integration', () => {
    it('starts Ink renderer before spawning agent', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const p = runCommand();
      await vi.waitFor(() => expect(mockDriverInstance.spawn).toHaveBeenCalled());
      mockDriverInstance._getChildOnHandlers()['close'](0);
      await p;

      expect(startRendererMock).toHaveBeenCalledTimes(1);
      expect(startRendererMock).toHaveBeenCalledWith({ quiet: false });
    });

    it('calls driver.parseOutput for stdout lines and dispatches events to renderer', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const toolStartEvent = { type: 'tool-start' as const, name: 'Read' };
      mockDriverInstance.parseOutput.mockReturnValueOnce(toolStartEvent);

      const p = runCommand();
      await vi.waitFor(() => expect(mockDriverInstance.spawn).toHaveBeenCalled());

      const stdout = mockDriverInstance._getStdoutEmitter();
      stdout!.emit('data', Buffer.from('{"type":"stream_event"}\n'));

      mockDriverInstance._getChildOnHandlers()['close'](0);
      await p;

      expect(mockDriverInstance.parseOutput).toHaveBeenCalled();
      expect(rendererUpdateMock).toHaveBeenCalledWith(toolStartEvent);
    });

    it('calls driver.parseOutput for stderr lines', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const textEvent = { type: 'text' as const, text: 'thinking...' };
      mockDriverInstance.parseOutput.mockReturnValueOnce(textEvent);

      const p = runCommand();
      await vi.waitFor(() => expect(mockDriverInstance.spawn).toHaveBeenCalled());

      const stderr = mockDriverInstance._getStderrEmitter();
      stderr!.emit('data', Buffer.from('some stderr line\n'));

      mockDriverInstance._getChildOnHandlers()['close'](0);
      await p;

      expect(mockDriverInstance.parseOutput).toHaveBeenCalled();
      expect(rendererUpdateMock).toHaveBeenCalledWith(textEvent);
    });

    it('dispatches story-complete events to renderer.addMessage', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const storyCompleteEvent = { type: 'story-complete' as const, key: '1-1-foo', details: 'DONE — verified' };
      mockDriverInstance.parseOutput.mockReturnValueOnce(storyCompleteEvent);

      const p = runCommand();
      await vi.waitFor(() => expect(mockDriverInstance.spawn).toHaveBeenCalled());

      const stderr = mockDriverInstance._getStderrEmitter();
      stderr!.emit('data', Buffer.from('[SUCCESS] Story 1-1-foo: DONE — verified\n'));

      mockDriverInstance._getChildOnHandlers()['close'](0);
      await p;

      expect(rendererAddMessageMock).toHaveBeenCalledWith({
        type: 'ok',
        key: '1-1-foo',
        message: 'DONE — verified',
      });
    });

    it('dispatches story-failed events to renderer.addMessage', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const storyFailedEvent = { type: 'story-failed' as const, key: '2-1-bar', reason: 'exceeded retry limit' };
      mockDriverInstance.parseOutput.mockReturnValueOnce(storyFailedEvent);

      const p = runCommand();
      await vi.waitFor(() => expect(mockDriverInstance.spawn).toHaveBeenCalled());

      const stderr = mockDriverInstance._getStderrEmitter();
      stderr!.emit('data', Buffer.from('[WARN] Story 2-1-bar exceeded retry limit\n'));

      mockDriverInstance._getChildOnHandlers()['close'](0);
      await p;

      expect(rendererAddMessageMock).toHaveBeenCalledWith({
        type: 'fail',
        key: '2-1-bar',
        message: 'exceeded retry limit',
      });
    });

    it('dispatches iteration events to state tracker', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const iterationEvent = { type: 'iteration' as const, count: 5 };
      mockDriverInstance.parseOutput.mockReturnValueOnce(iterationEvent);

      const p = runCommand();
      await vi.waitFor(() => expect(mockDriverInstance.spawn).toHaveBeenCalled());

      const stderr = mockDriverInstance._getStderrEmitter();
      stderr!.emit('data', Buffer.from('[LOOP] iteration 5\n'));

      mockDriverInstance._getChildOnHandlers()['close'](0);
      await p;

      // Iteration events don't call renderer.update or addMessage
      // They update internal state used by the polling interval
      expect(rendererUpdateMock).not.toHaveBeenCalled();
      expect(rendererAddMessageMock).not.toHaveBeenCalled();
    });

    it('skips null events from driver.parseOutput (unrecognized lines)', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      mockDriverInstance.parseOutput.mockReturnValue(null);

      const p = runCommand();
      await vi.waitFor(() => expect(mockDriverInstance.spawn).toHaveBeenCalled());

      const stdout = mockDriverInstance._getStdoutEmitter();
      stdout!.emit('data', Buffer.from('some unrecognized line\n'));

      mockDriverInstance._getChildOnHandlers()['close'](0);
      await p;

      expect(mockDriverInstance.parseOutput).toHaveBeenCalled();
      expect(rendererUpdateMock).not.toHaveBeenCalled();
    });

    it('calls renderer.cleanup on process close', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const p = runCommand();
      await vi.waitFor(() => expect(mockDriverInstance.spawn).toHaveBeenCalled());
      mockDriverInstance._getChildOnHandlers()['close'](0);
      await p;

      expect(rendererCleanupMock).toHaveBeenCalledTimes(1);
    });

    it('calls renderer.cleanup on spawn error', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const p = runCommand();
      await vi.waitFor(() => expect(mockDriverInstance.spawn).toHaveBeenCalled());
      mockDriverInstance._getChildOnHandlers()['error'](new Error('ENOENT'));
      await p;

      expect(rendererCleanupMock).toHaveBeenCalled();
    });

    it('updates sprint state from getSprintState on startup', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      getSprintStateMock.mockReturnValue({
        success: true,
        data: {
          sprint: { total: 10, done: 3, failed: 0, blocked: 0, inProgress: '1-1-story' },
          run: { currentStory: '1-1-story', currentPhase: 'dev', active: true },
          stories: {},
          actionItems: [],
        },
      });

      const p = runCommand();
      await vi.waitFor(() => expect(mockDriverInstance.spawn).toHaveBeenCalled());
      mockDriverInstance._getChildOnHandlers()['close'](0);
      await p;

      expect(rendererUpdateSprintStateMock).toHaveBeenCalledWith(expect.objectContaining({
        storyKey: '1-1-story',
        phase: 'dev',
        done: 3,
        total: 10,
        elapsed: expect.stringMatching(/^\d+m$|^\d+h\d+m$/),
      }));
    });
  });

  describe('elapsed time tracking', () => {
    it('passes elapsed field in sprint info on startup', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      getSprintStateMock.mockReturnValue({
        success: true,
        data: {
          sprint: { total: 5, done: 1, failed: 0, blocked: 0, inProgress: '1-1-story' },
          run: { currentStory: '1-1-story', currentPhase: 'dev', active: true },
          stories: {},
          actionItems: [],
        },
      });

      const p = runCommand();
      await vi.waitFor(() => expect(mockDriverInstance.spawn).toHaveBeenCalled());
      mockDriverInstance._getChildOnHandlers()['close'](0);
      await p;

      const call = rendererUpdateSprintStateMock.mock.calls[0][0];
      expect(call).toHaveProperty('elapsed');
      expect(typeof call.elapsed).toBe('string');
      expect(call.elapsed).toMatch(/^\d+m$|^\d+h\d+m$/);
    });
  });

  describe('per-story status feeding', () => {
    it('feeds initial story statuses to renderer.updateStories', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({
        'epic-1': 'done',
        '1-1-story-a': 'done',
        '1-2-story-b': 'in-progress',
        '1-3-story-c': 'backlog',
      });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const p = runCommand();
      await vi.waitFor(() => expect(mockDriverInstance.spawn).toHaveBeenCalled());
      mockDriverInstance._getChildOnHandlers()['close'](0);
      await p;

      expect(rendererUpdateStoriesMock).toHaveBeenCalledWith([
        { key: '1-1-story-a', status: 'done' },
        { key: '1-2-story-b', status: 'in-progress' },
        { key: '1-3-story-c', status: 'pending' },
      ]);
    });
  });

  describe('polling interval refreshes sprint state and stories', () => {
    it('updates sprint state and stories on polling interval tick', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      getSprintStateMock.mockReturnValue({
        success: true,
        data: {
          sprint: { total: 5, done: 2, failed: 0, blocked: 0, inProgress: '1-1-story' },
          run: { currentStory: '1-1-story', currentPhase: 'dev', active: true },
          stories: {},
          actionItems: [],
        },
      });

      const p = runCommand();
      await vi.waitFor(() => expect(mockDriverInstance.spawn).toHaveBeenCalled());

      rendererUpdateSprintStateMock.mockClear();
      rendererUpdateStoriesMock.mockClear();

      vi.advanceTimersByTime(5_000);

      expect(rendererUpdateSprintStateMock).toHaveBeenCalledTimes(1);
      expect(rendererUpdateSprintStateMock).toHaveBeenCalledWith(expect.objectContaining({
        elapsed: expect.stringMatching(/^\d+m$|^\d+h\d+m$/),
      }));
      expect(rendererUpdateStoriesMock).toHaveBeenCalledTimes(1);

      mockDriverInstance._getChildOnHandlers()['close'](0);
      await p;

      vi.useRealTimers();
    });
  });

  describe('result event extraction', () => {
    it('result events are parsed and fed to renderer', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const resultEvent = { type: 'result' as const, cost: 0.05, sessionId: 'sess-123' };
      mockDriverInstance.parseOutput.mockReturnValueOnce(resultEvent);

      const p = runCommand();
      await vi.waitFor(() => expect(mockDriverInstance.spawn).toHaveBeenCalled());

      const stdout = mockDriverInstance._getStdoutEmitter();
      stdout!.emit('data', Buffer.from('{"type":"result","cost_usd":0.05,"session_id":"sess-123"}\n'));

      mockDriverInstance._getChildOnHandlers()['close'](0);
      await p;

      expect(rendererUpdateMock).toHaveBeenCalledWith(resultEvent);
    });
  });

  describe('--quiet mode', () => {
    it('passes quiet: true to startRenderer and config', async () => {
      // For quiet mode, mock spawn to return null stdout/stderr
      const quietHandlers: Record<string, (...args: unknown[]) => void> = {};
      mockDriverInstance.spawn.mockImplementationOnce(() => ({
        on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          quietHandlers[event] = handler;
        }),
        kill: vi.fn(),
        stdout: null,
        stderr: null,
      }));

      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const p = runCommand(['--quiet']);
      await vi.waitFor(() => expect(mockDriverInstance.spawn).toHaveBeenCalled());

      expect(startRendererMock).toHaveBeenCalledWith({ quiet: true });
      expect(getDriverMock).toHaveBeenCalledWith('ralph', expect.objectContaining({
        quiet: true,
      }));

      quietHandlers['close'](0);
      await p;

      expect(rendererUpdateMock).not.toHaveBeenCalled();
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

    it('run.ts imports getDriver from agents/index', () => {
      const runSource = origReadFileSync(
        join(process.cwd(), 'src', 'commands', 'run.ts'),
        'utf-8',
      );
      expect(runSource).toContain("import { getDriver } from '../lib/agents/index.js'");
    });

    it('run.ts imports AgentDriver and AgentEvent types', () => {
      const runSource = origReadFileSync(
        join(process.cwd(), 'src', 'commands', 'run.ts'),
        'utf-8',
      );
      expect(runSource).toContain('AgentDriver');
      expect(runSource).toContain('AgentEvent');
    });

    it('run.ts does not import DashboardFormatter', () => {
      const runSource = origReadFileSync(
        join(process.cwd(), 'src', 'commands', 'run.ts'),
        'utf-8',
      );
      expect(runSource).not.toContain('DashboardFormatter');
    });
  });
});
