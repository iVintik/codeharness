import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { existsSync as origExistsSync, readFileSync as origReadFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { resolveRalphPath, resolvePluginDir, countStories, buildSpawnArgs } from '../run.js';

// --- Hoisted mocks ---
// Capture the real existsSync before vi.mock replaces node:fs
const { spawnMock, getChildOnHandlers, existsSyncMock, readSprintStatusMock, realExistsSync } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs');
  const realFn = fs.existsSync.bind(fs);

  const handlers: Record<string, (...args: unknown[]) => void> = {};
  return {
    spawnMock: vi.fn(() => ({
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        handlers[event] = handler;
      }),
      pid: 12345,
      stdin: null,
      stdout: null,
      stderr: null,
    })),
    getChildOnHandlers: () => handlers,
    existsSyncMock: vi.fn(realFn),
    readSprintStatusMock: vi.fn(() => ({}) as Record<string, string>),
    realExistsSync: realFn as (path: string) => boolean,
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

describe('run command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'run-test-'));
    spawnMock.mockClear();
    existsSyncMock.mockReset();
    existsSyncMock.mockImplementation((p: unknown) => realExistsSync(String(p)));
    readSprintStatusMock.mockReset();
    readSprintStatusMock.mockReturnValue({});
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

    it('counts verified status separately', () => {
      const counts = countStories({
        '1-1-story': 'verified',
        '1-2-story': 'verified',
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
      live: false,
    };

    it('builds basic argument array', () => {
      const args = buildSpawnArgs(baseOpts);
      expect(args).toContain('/path/to/ralph.sh');
      expect(args).toContain('--plugin-dir');
      expect(args).toContain('50');
    });

    it('does not include --live when false', () => {
      expect(buildSpawnArgs(baseOpts)).not.toContain('--live');
    });

    it('includes --live when true', () => {
      expect(buildSpawnArgs({ ...baseOpts, live: true })).toContain('--live');
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
        stdio: 'inherit', cwd: tmpDir,
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
        env: expect.objectContaining({ CLAUDE_OUTPUT_FORMAT: 'json' }),
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
      expect(optionNames).toContain('--live');
      expect(optionNames).toContain('--max-story-retries');
    });

    it('--max-story-retries defaults to 3', async () => {
      const { registerRunCommand } = await import('../run.js');
      const program = new Command();
      program.option('--json', 'JSON output');
      registerRunCommand(program);

      const runCmd = program.commands.find(c => c.name() === 'run');
      const retryOpt = runCmd!.options.find(o => o.long === '--max-story-retries');
      expect(retryOpt!.defaultValue).toBe('3');
    });
  });
});
