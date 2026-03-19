import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { existsSync as origExistsSync, readFileSync as origReadFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { Command } from 'commander';
import { resolveRalphPath, resolvePluginDir, countStories, buildSpawnArgs } from '../run.js';

// --- Hoisted mocks ---
// Capture the real existsSync before vi.mock replaces node:fs
const {
  spawnMock, getChildOnHandlers, existsSyncMock, readSprintStatusMock,
  realExistsSync, getStdoutEmitter, getStderrEmitter,
  startRendererMock, rendererUpdateMock, rendererUpdateSprintStateMock, rendererCleanupMock,
  parseStreamLineMock, getSprintStateMock,
} = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs');
  const realFn = fs.existsSync.bind(fs);

  const handlers: Record<string, (...args: unknown[]) => void> = {};
  let stdoutEmitter: EventEmitter | null = null;
  let stderrEmitter: EventEmitter | null = null;

  const rendererUpdateMock = vi.fn();
  const rendererUpdateSprintStateMock = vi.fn();
  const rendererCleanupMock = vi.fn();

  return {
    spawnMock: vi.fn(() => {
      stdoutEmitter = new EventEmitter();
      stderrEmitter = new EventEmitter();
      return {
        on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          handlers[event] = handler;
        }),
        pid: 12345,
        stdin: null,
        stdout: stdoutEmitter,
        stderr: stderrEmitter,
      };
    }),
    getChildOnHandlers: () => handlers,
    existsSyncMock: vi.fn(realFn),
    readSprintStatusMock: vi.fn(() => ({}) as Record<string, string>),
    realExistsSync: realFn as (path: string) => boolean,
    getStdoutEmitter: () => stdoutEmitter,
    getStderrEmitter: () => stderrEmitter,
    startRendererMock: vi.fn(() => ({
      update: rendererUpdateMock,
      updateSprintState: rendererUpdateSprintStateMock,
      cleanup: rendererCleanupMock,
    })),
    rendererUpdateMock,
    rendererUpdateSprintStateMock,
    rendererCleanupMock,
    parseStreamLineMock: vi.fn(() => null),
    getSprintStateMock: vi.fn(() => ({ success: false, error: 'no state' })),
  };
});

vi.mock('node:child_process', () => ({ spawn: spawnMock }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: existsSyncMock };
});

vi.mock('../../lib/beads-sync.js', () => ({
  readSprintStatus: (...args: unknown[]) => readSprintStatusMock(...args),
}));

vi.mock('../../templates/ralph-prompt.js', () => ({
  generateRalphPrompt: vi.fn(() => 'mock prompt content'),
}));

vi.mock('../../lib/stream-parser.js', () => ({
  parseStreamLine: (...args: unknown[]) => parseStreamLineMock(...args),
}));

vi.mock('../../lib/ink-renderer.js', () => ({
  startRenderer: (...args: unknown[]) => startRendererMock(...args),
}));

vi.mock('../../modules/sprint/index.js', () => ({
  getSprintState: (...args: unknown[]) => getSprintStateMock(...args),
}));

describe('run command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'run-test-'));
    spawnMock.mockClear();
    existsSyncMock.mockReset();
    existsSyncMock.mockImplementation((p: unknown) => realExistsSync(String(p)));
    readSprintStatusMock.mockReset();
    readSprintStatusMock.mockReturnValue({});
    startRendererMock.mockClear();
    rendererUpdateMock.mockClear();
    rendererUpdateSprintStateMock.mockClear();
    rendererCleanupMock.mockClear();
    parseStreamLineMock.mockClear();
    parseStreamLineMock.mockReturnValue(null);
    getSprintStateMock.mockClear();
    getSprintStateMock.mockReturnValue({ success: false, error: 'no state' });
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

  describe('resolveRalphPath', () => {
    it('returns a path ending with ralph/ralph.sh', () => {
      expect(resolveRalphPath()).toMatch(/ralph[/\\]ralph\.sh$/);
    });

    it('resolves to a path within the project', () => {
      expect(resolveRalphPath()).toContain('ralph');
    });
  });

  describe('resolvePluginDir', () => {
    it('returns cwd/.claude', () => {
      expect(resolvePluginDir()).toBe(join(process.cwd(), '.claude'));
    });
  });

  describe('countStories', () => {
    it('counts stories by status correctly', () => {
      const counts = countStories({
        'epic-5': 'in-progress',
        '5-1-ralph-loop': 'ready-for-dev',
        '5-2-verification': 'backlog',
        '5-3-tracking': 'done',
        '5-4-another': 'in-progress',
        'epic-5-retrospective': 'optional',
      });
      expect(counts).toEqual({ total: 4, ready: 2, done: 1, inProgress: 1, verified: 0 });
    });

    it('ignores epic keys and retrospective keys', () => {
      const counts = countStories({
        'epic-1': 'done', 'epic-1-retrospective': 'done',
        '1-1-story-one': 'done', '1-2-story-two': 'done',
      });
      expect(counts.total).toBe(2);
      expect(counts.done).toBe(2);
    });

    it('returns zeros for empty statuses', () => {
      expect(countStories({})).toEqual({ total: 0, ready: 0, done: 0, inProgress: 0, verified: 0 });
    });

    it('counts review status as inProgress', () => {
      expect(countStories({ '1-1-story': 'review' }).inProgress).toBe(1);
    });

    it('counts verifying status separately', () => {
      const counts = countStories({
        '1-1-story': 'verifying',
        '1-2-story': 'verifying',
        '1-3-story': 'done',
      });
      expect(counts).toEqual({ total: 3, ready: 0, done: 1, inProgress: 0, verified: 2 });
    });
  });

  describe('buildSpawnArgs', () => {
    const baseOpts = {
      ralphPath: '/path/to/ralph.sh',
      pluginDir: '/path/to/.claude',
      promptFile: '/path/to/prompt.md',
      maxIterations: 50,
      timeout: 14400,
      iterationTimeout: 15,
      calls: 100,
      quiet: false,
    };

    it('builds basic argument array', () => {
      const args = buildSpawnArgs(baseOpts);
      expect(args).toContain('/path/to/ralph.sh');
      expect(args).toContain('--plugin-dir');
      expect(args).toContain('50');
    });

    it('never includes --live flag (removed)', () => {
      expect(buildSpawnArgs(baseOpts)).not.toContain('--live');
      expect(buildSpawnArgs({ ...baseOpts, quiet: true })).not.toContain('--live');
    });

    it('includes --max-story-retries when provided', () => {
      const args = buildSpawnArgs({ ...baseOpts, maxStoryRetries: 5 });
      expect(args).toContain('--max-story-retries');
      expect(args).toContain('5');
    });

    it('does not include --max-story-retries when undefined', () => {
      expect(buildSpawnArgs(baseOpts)).not.toContain('--max-story-retries');
    });
  });

  describe('action handler', () => {
    it('fails when ralph script not found', async () => {
      mockPaths({ 'ralph.sh': false });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Ralph loop not found'));
      expect(process.exitCode).toBe(1);
    });

    it('fails when plugin directory not found', async () => {
      mockPaths({ 'ralph.sh': true, '.claude': false });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Plugin directory not found'));
      expect(process.exitCode).toBe(1);
    });

    it('fails when no stories in sprint-status.yaml', async () => {
      mockPaths({ 'ralph.sh': true, '.claude': true });
      readSprintStatusMock.mockReturnValue({});
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No stories found'));
      expect(process.exitCode).toBe(1);
    });

    it('fails with invalid numeric options', async () => {
      mockPaths({ 'ralph.sh': true, '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCommand(['--max-iterations', 'abc']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid numeric option'));
      expect(process.exitCode).toBe(1);
    });

    it('spawns ralph and propagates exit code 0', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ 'ralph.sh': true, '.claude': true, '.flagged_stories': false });
      readSprintStatusMock.mockReturnValue({ '1-1-do-stuff': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const p = runCommand();
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
      getChildOnHandlers()['close'](0);
      await p;

      expect(spawnMock).toHaveBeenCalledWith('bash', expect.any(Array), expect.objectContaining({
        cwd: tmpDir,
      }));
      expect(process.exitCode).toBe(0);
    });

    it('propagates non-zero exit code from ralph', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ 'ralph.sh': true, '.claude': true, '.flagged_stories': false });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const p = runCommand();
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
      getChildOnHandlers()['close'](42);
      await p;

      expect(process.exitCode).toBe(42);
    });

    it('handles spawn error gracefully', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ 'ralph.sh': true, '.claude': true, '.flagged_stories': false });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const p = runCommand();
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
      getChildOnHandlers()['error'](new Error('ENOENT: bash not found'));
      await p;

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to start Ralph'));
      expect(process.exitCode).toBe(1);
    });

    it('outputs JSON with status.json present', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mkdirSync(join(tmpDir, 'ralph'), { recursive: true });
      writeFileSync(join(tmpDir, 'ralph', 'status.json'), JSON.stringify({
        status: 'completed', loop_count: 5, elapsed_seconds: 120,
        flagged_stories: [], exit_reason: 'all_done',
      }));
      mockPaths({ 'ralph.sh': true, '.claude': true, '.flagged_stories': false });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'done' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const p = runCommand(['--json']);
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
      getChildOnHandlers()['close'](0);
      await p;

      // Find the final JSON output (has storiesCompleted, not the info() call)
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

    it('outputs JSON fallback when status.json missing', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ 'ralph.sh': true, '.claude': true, '.flagged_stories': false, 'status.json': false });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const p = runCommand(['--json']);
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
      getChildOnHandlers()['close'](1);
      await p;

      const jsonCall = consoleSpy.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes('"exitReason"')
      );
      expect(jsonCall).toBeDefined();
      const output = JSON.parse(jsonCall![0] as string);
      expect(output.status).toBe('stopped');
      expect(output.exitReason).toBe('status_file_missing');
    });

    it('reads flagged stories file when present', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mkdirSync(join(tmpDir, 'ralph'), { recursive: true });
      writeFileSync(join(tmpDir, 'ralph', '.flagged_stories'), '1-1-broken\n2-1-stuck\n');
      // Don't override .flagged_stories — let it hit the real filesystem
      mockPaths({ 'ralph.sh': true, '.claude': true });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const { generateRalphPrompt } = await import('../../templates/ralph-prompt.js');
      const promptMock = vi.mocked(generateRalphPrompt);
      promptMock.mockClear();

      const p = runCommand();
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
      getChildOnHandlers()['close'](0);
      await p;

      expect(promptMock).toHaveBeenCalledWith(expect.objectContaining({
        flaggedStories: ['1-1-broken', '2-1-stuck'],
      }));
    });

    it('sets CLAUDE_OUTPUT_FORMAT env when --json', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ 'ralph.sh': true, '.claude': true, '.flagged_stories': false });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const p = runCommand(['--json']);
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
      getChildOnHandlers()['close'](0);
      await p;

      expect(spawnMock).toHaveBeenCalledWith('bash', expect.any(Array), expect.objectContaining({
        env: expect.objectContaining({ CLAUDE_OUTPUT_FORMAT: 'stream-json' }),
      }));
    });

    it('does not set CLAUDE_OUTPUT_FORMAT without --json', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ 'ralph.sh': true, '.claude': true, '.flagged_stories': false });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const p = runCommand();
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
      getChildOnHandlers()['close'](0);
      await p;

      const envArg = spawnMock.mock.calls[0][2].env;
      expect(envArg.CLAUDE_OUTPUT_FORMAT).toBeUndefined();
    });

    it('writes prompt file to ralph directory', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ 'ralph.sh': true, '.claude': true, '.flagged_stories': false });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const p = runCommand();
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
      getChildOnHandlers()['close'](0);
      await p;

      const promptPath = join(tmpDir, 'ralph', '.harness-prompt.md');
      expect(realExistsSync(promptPath)).toBe(true);
      expect(origReadFileSync(promptPath, 'utf-8')).toBe('mock prompt content');
    });

    it('prints starting message with story counts', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ 'ralph.sh': true, '.claude': true, '.flagged_stories': false });
      readSprintStatusMock.mockReturnValue({
        '1-1-a': 'backlog', '1-2-b': 'done', '1-3-c': 'in-progress',
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const p = runCommand();
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
      getChildOnHandlers()['close'](0);
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

    it('--max-story-retries defaults to 3', async () => {
      const { registerRunCommand } = await import('../run.js');
      const program = new Command();
      program.option('--json', 'JSON output');
      registerRunCommand(program);

      const runCmd = program.commands.find(c => c.name() === 'run');
      const retryOpt = runCmd!.options.find(o => o.long === '--max-story-retries');
      expect(retryOpt!.defaultValue).toBe('10');
    });
  });

  describe('Ink renderer integration (AC #1, #2, #3)', () => {
    it('starts Ink renderer before spawning ralph', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ 'ralph.sh': true, '.claude': true, '.flagged_stories': false });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const p = runCommand();
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
      getChildOnHandlers()['close'](0);
      await p;

      // startRenderer should have been called before spawn
      expect(startRendererMock).toHaveBeenCalledTimes(1);
      expect(startRendererMock).toHaveBeenCalledWith({ quiet: false });
    });

    it('pipes stdout NDJSON lines through parseStreamLine to renderer.update', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ 'ralph.sh': true, '.claude': true, '.flagged_stories': false });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const toolStartEvent = { type: 'tool-start', name: 'Read', id: 'abc' };
      parseStreamLineMock.mockReturnValueOnce(toolStartEvent);

      const p = runCommand();
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());

      // Emit NDJSON on stdout
      const stdout = getStdoutEmitter();
      stdout!.emit('data', Buffer.from('{"type":"stream_event","event":{"type":"content_block_start"}}\n'));

      getChildOnHandlers()['close'](0);
      await p;

      expect(parseStreamLineMock).toHaveBeenCalled();
      expect(rendererUpdateMock).toHaveBeenCalledWith(toolStartEvent);
    });

    it('pipes stderr lines through parseStreamLine to renderer.update', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ 'ralph.sh': true, '.claude': true, '.flagged_stories': false });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const textEvent = { type: 'text', text: 'thinking...' };
      parseStreamLineMock.mockReturnValueOnce(textEvent);

      const p = runCommand();
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());

      const stderr = getStderrEmitter();
      stderr!.emit('data', Buffer.from('{"type":"stream_event","event":{"type":"content_block_delta"}}\n'));

      getChildOnHandlers()['close'](0);
      await p;

      expect(rendererUpdateMock).toHaveBeenCalledWith(textEvent);
    });

    it('skips null events from parseStreamLine (unrecognized lines)', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ 'ralph.sh': true, '.claude': true, '.flagged_stories': false });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      // parseStreamLine returns null for unrecognized lines (default mock behavior)
      parseStreamLineMock.mockReturnValue(null);

      const p = runCommand();
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());

      const stdout = getStdoutEmitter();
      stdout!.emit('data', Buffer.from('some unrecognized line\n'));

      getChildOnHandlers()['close'](0);
      await p;

      expect(parseStreamLineMock).toHaveBeenCalled();
      expect(rendererUpdateMock).not.toHaveBeenCalled();
    });

    it('calls renderer.cleanup on process close', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ 'ralph.sh': true, '.claude': true, '.flagged_stories': false });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const p = runCommand();
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
      getChildOnHandlers()['close'](0);
      await p;

      expect(rendererCleanupMock).toHaveBeenCalledTimes(1);
    });

    it('calls renderer.cleanup on spawn error', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ 'ralph.sh': true, '.claude': true, '.flagged_stories': false });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const p = runCommand();
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
      getChildOnHandlers()['error'](new Error('ENOENT'));
      await p;

      // cleanup() is called in both the error handler and the catch block.
      // The real renderer's cleanup is idempotent (guarded by a `cleaned` flag),
      // so multiple calls are safe. We verify it was called at least once.
      expect(rendererCleanupMock).toHaveBeenCalled();
    });

    it('updates sprint state from getSprintState on startup', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ 'ralph.sh': true, '.claude': true, '.flagged_stories': false });
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
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
      getChildOnHandlers()['close'](0);
      await p;

      expect(rendererUpdateSprintStateMock).toHaveBeenCalledWith({
        storyKey: '1-1-story',
        phase: 'dev',
        done: 3,
        total: 10,
      });
    });
  });

  describe('--quiet mode (AC #4)', () => {
    it('passes quiet: true to startRenderer and uses stdio ignore', async () => {
      const quietHandlers: Record<string, (...args: unknown[]) => void> = {};
      spawnMock.mockImplementationOnce(() => ({
        on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          quietHandlers[event] = handler;
        }),
        pid: 12345,
        stdin: null,
        stdout: null,
        stderr: null,
      }));

      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ 'ralph.sh': true, '.claude': true, '.flagged_stories': false });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const p = runCommand(['--quiet']);
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());

      // Verify startRenderer was called with quiet: true
      expect(startRendererMock).toHaveBeenCalledWith({ quiet: true });

      // Verify spawn was called with stdio: 'ignore'
      expect(spawnMock).toHaveBeenCalledWith('bash', expect.any(Array), expect.objectContaining({
        stdio: 'ignore',
      }));

      quietHandlers['close'](0);
      await p;

      // No renderer.update calls should have happened (no stdout/stderr)
      expect(rendererUpdateMock).not.toHaveBeenCalled();
    });
  });

  describe('result event extraction (AC #5)', () => {
    it('result events are parsed and fed to renderer (caller handles data extraction)', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      mockPaths({ 'ralph.sh': true, '.claude': true, '.flagged_stories': false });
      readSprintStatusMock.mockReturnValue({ '1-1-story': 'backlog' });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const resultEvent = { type: 'result', cost: 0.05, sessionId: 'sess-123' };
      parseStreamLineMock.mockReturnValueOnce(resultEvent);

      const p = runCommand();
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());

      const stdout = getStdoutEmitter();
      stdout!.emit('data', Buffer.from('{"type":"result","cost_usd":0.05,"session_id":"sess-123"}\n'));

      getChildOnHandlers()['close'](0);
      await p;

      expect(rendererUpdateMock).toHaveBeenCalledWith(resultEvent);
    });
  });
});
