import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { registerStatsCommand } from '../stats.js';

let testDir: string;
let originalCwd: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-cmd-stats-'));
  originalCwd = process.cwd();
  process.chdir(testDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(testDir, { recursive: true, force: true });
});

function createCli(): Command {
  const program = new Command();
  program.option('--json', 'JSON output');
  registerStatsCommand(program);
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

function createLogDir(): string {
  const logsDir = join(testDir, 'session-logs');
  mkdirSync(logsDir, { recursive: true });
  return logsDir;
}

/** Build a minimal JSONL log with stream events that mimic real Claude API output */
function buildLogContent(opts: {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  phaseText?: string;
  storyText?: string;
  toolName?: string;
}): string {
  const lines: string[] = [];

  // message_start event
  lines.push(JSON.stringify({
    type: 'stream_event',
    event: {
      type: 'message_start',
      message: {
        usage: {
          input_tokens: opts.inputTokens ?? 100,
          cache_read_input_tokens: opts.cacheReadTokens ?? 50,
          cache_creation_input_tokens: opts.cacheWriteTokens ?? 25,
        },
      },
    },
  }));

  // content_block_delta with phase detection text
  if (opts.phaseText) {
    lines.push(JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        delta: { text: opts.phaseText },
      },
    }));
  }

  // content_block_delta with story detection text
  if (opts.storyText) {
    lines.push(JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        delta: { text: opts.storyText },
      },
    }));
  }

  // tool_use content block
  if (opts.toolName) {
    lines.push(JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_start',
        content_block: { type: 'tool_use', name: opts.toolName },
      },
    }));
  }

  // message_delta with output tokens
  lines.push(JSON.stringify({
    type: 'stream_event',
    event: {
      type: 'message_delta',
      usage: { output_tokens: opts.outputTokens ?? 200 },
    },
  }));

  return lines.join('\n');
}

describe('codeharness stats', () => {
  it('fails when session-logs/ does not exist', async () => {
    const { stdout, exitCode } = await runCli(['stats']);
    expect(exitCode).toBe(1);
    expect(stdout).toContain('No logs directory found');
  });

  it('produces a report with valid log data', async () => {
    const logsDir = createLogDir();
    writeFileSync(
      join(logsDir, 'claude_output_2026-03-27_10-00-00.log'),
      buildLogContent({
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 2000,
        cacheWriteTokens: 300,
        phaseText: 'Step 3b dev-story',
        storyText: '14-5-stack-aware-verify-dockerfile',
        toolName: 'Bash',
      }),
    );

    const { stdout, exitCode } = await runCli(['stats']);
    expect(exitCode).toBeUndefined();
    expect(stdout).toContain('Harness Cost Report');
    expect(stdout).toContain('Total API-equivalent cost');
    expect(stdout).toContain('Cost by Token Type');
    expect(stdout).toContain('Cost by Phase');
    expect(stdout).toContain('Cost by Tool');
    expect(stdout).toContain('Top 10 Most Expensive Stories');
  });

  it('detects create-story phase from text', async () => {
    const logsDir = createLogDir();
    writeFileSync(
      join(logsDir, 'claude_output_2026-03-27_10-00-00.log'),
      buildLogContent({
        phaseText: 'Step 3a create-story',
        storyText: '1-1-test-story',
      }),
    );

    const { stdout, exitCode } = await runCli(['--json', 'stats']);
    expect(exitCode).toBeUndefined();
    const parsed = JSON.parse(stdout);
    expect(parsed.byPhase).toHaveProperty('create-story');
  });

  it('detects code-review phase from text', async () => {
    const logsDir = createLogDir();
    writeFileSync(
      join(logsDir, 'claude_output_2026-03-27_10-00-00.log'),
      buildLogContent({
        phaseText: 'Step 3c code-review check',
        storyText: '2-1-some-story',
      }),
    );

    const { stdout, exitCode } = await runCli(['--json', 'stats']);
    expect(exitCode).toBeUndefined();
    const parsed = JSON.parse(stdout);
    expect(parsed.byPhase).toHaveProperty('code-review');
  });

  it('detects verify phase from text', async () => {
    const logsDir = createLogDir();
    writeFileSync(
      join(logsDir, 'claude_output_2026-03-27_10-00-00.log'),
      buildLogContent({
        phaseText: 'Step 3d verification',
        storyText: '3-1-verify-story',
      }),
    );

    const { stdout, exitCode } = await runCli(['--json', 'stats']);
    expect(exitCode).toBeUndefined();
    const parsed = JSON.parse(stdout);
    expect(parsed.byPhase).toHaveProperty('verify');
  });

  it('detects retro phase from text', async () => {
    const logsDir = createLogDir();
    writeFileSync(
      join(logsDir, 'claude_output_2026-03-27_10-00-00.log'),
      buildLogContent({
        phaseText: 'Step 8 retrospective',
        storyText: '4-1-retro-story',
      }),
    );

    const { stdout, exitCode } = await runCli(['--json', 'stats']);
    expect(exitCode).toBeUndefined();
    const parsed = JSON.parse(stdout);
    expect(parsed.byPhase).toHaveProperty('retro');
  });

  it('detects phase from subagent task_started events', async () => {
    const logsDir = createLogDir();
    const lines = [
      JSON.stringify({
        type: 'system',
        subtype: 'task_started',
        description: 'Running code review for story',
      }),
      JSON.stringify({
        type: 'stream_event',
        event: {
          type: 'message_start',
          message: { usage: { input_tokens: 500, cache_read_input_tokens: 100, cache_creation_input_tokens: 50 } },
        },
      }),
      JSON.stringify({
        type: 'stream_event',
        event: { type: 'message_delta', usage: { output_tokens: 300 } },
      }),
    ];
    writeFileSync(
      join(logsDir, 'claude_output_2026-03-27_10-00-00.log'),
      lines.join('\n'),
    );

    const { stdout, exitCode } = await runCli(['--json', 'stats']);
    expect(exitCode).toBeUndefined();
    const parsed = JSON.parse(stdout);
    expect(parsed.byPhase).toHaveProperty('code-review');
  });

  it('handles multiple log files', async () => {
    const logsDir = createLogDir();
    writeFileSync(
      join(logsDir, 'claude_output_2026-03-26_10-00-00.log'),
      buildLogContent({ inputTokens: 500, outputTokens: 200, storyText: '1-1-first-story' }),
    );
    writeFileSync(
      join(logsDir, 'claude_output_2026-03-27_10-00-00.log'),
      buildLogContent({ inputTokens: 800, outputTokens: 400, storyText: '2-1-second-story' }),
    );

    const { stdout, exitCode } = await runCli(['--json', 'stats']);
    expect(exitCode).toBeUndefined();
    const parsed = JSON.parse(stdout);
    expect(parsed.storiesTracked).toBe(2);
    expect(parsed.totalCalls).toBe(2);
  });

  it('computes cost correctly using Opus 4.6 rates', async () => {
    const logsDir = createLogDir();
    // 1M input tokens at $15/MTok = $15.00
    // 1M output tokens at $75/MTok = $75.00
    // 1M cache read tokens at $1.50/MTok = $1.50
    // 1M cache write tokens at $18.75/MTok = $18.75
    // Total = $110.25
    writeFileSync(
      join(logsDir, 'claude_output_2026-03-27_10-00-00.log'),
      buildLogContent({
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheReadTokens: 1_000_000,
        cacheWriteTokens: 1_000_000,
        storyText: '1-1-cost-test',
      }),
    );

    const { stdout, exitCode } = await runCli(['--json', 'stats']);
    expect(exitCode).toBeUndefined();
    const parsed = JSON.parse(stdout);
    expect(parsed.totalCost).toBeCloseTo(110.25, 2);
  });

  it('handles empty log files gracefully', async () => {
    const logsDir = createLogDir();
    writeFileSync(join(logsDir, 'claude_output_2026-03-27_10-00-00.log'), '');

    const { stdout, exitCode } = await runCli(['stats']);
    expect(exitCode).toBeUndefined();
    expect(stdout).toContain('Harness Cost Report');
    expect(stdout).toContain('Total API calls: 0');
  });

  it('skips malformed JSON lines', async () => {
    const logsDir = createLogDir();
    const content = [
      'not json at all',
      '{ broken json',
      buildLogContent({ inputTokens: 100, outputTokens: 50, storyText: '1-1-good' }),
    ].join('\n');
    writeFileSync(join(logsDir, 'claude_output_2026-03-27_10-00-00.log'), content);

    const { stdout, exitCode } = await runCli(['--json', 'stats']);
    expect(exitCode).toBeUndefined();
    const parsed = JSON.parse(stdout);
    expect(parsed.totalCalls).toBe(1);
  });

  it('saves report with --save flag', async () => {
    const logsDir = createLogDir();
    mkdirSync(join(testDir, '_bmad-output', 'implementation-artifacts'), { recursive: true });
    writeFileSync(
      join(logsDir, 'claude_output_2026-03-27_10-00-00.log'),
      buildLogContent({ storyText: '1-1-save-test' }),
    );

    const { stdout, exitCode } = await runCli(['stats', '--save']);
    expect(exitCode).toBeUndefined();
    expect(stdout).toContain('Report saved');

    const reportPath = join(testDir, '_bmad-output', 'implementation-artifacts', 'cost-report.md');
    expect(existsSync(reportPath)).toBe(true);
  });

  it('returns JSON output with --json flag', async () => {
    const logsDir = createLogDir();
    writeFileSync(
      join(logsDir, 'claude_output_2026-03-27_10-00-00.log'),
      buildLogContent({ storyText: '5-1-json-test' }),
    );

    const { stdout, exitCode } = await runCli(['--json', 'stats']);
    expect(exitCode).toBeUndefined();
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('totalCost');
    expect(parsed).toHaveProperty('totalCalls');
    expect(parsed).toHaveProperty('byPhase');
    expect(parsed).toHaveProperty('byStory');
    expect(parsed).toHaveProperty('byTool');
    expect(parsed).toHaveProperty('tokenBreakdown');
    expect(parsed).toHaveProperty('avgCostPerStory');
    expect(parsed).toHaveProperty('storiesTracked');
  });

  it('tracks tool usage in byTool breakdown', async () => {
    const logsDir = createLogDir();
    writeFileSync(
      join(logsDir, 'claude_output_2026-03-27_10-00-00.log'),
      buildLogContent({ toolName: 'Read', storyText: '1-1-tool-test' }),
    );

    const { stdout, exitCode } = await runCli(['--json', 'stats']);
    expect(exitCode).toBeUndefined();
    const parsed = JSON.parse(stdout);
    expect(parsed.byTool).toHaveProperty('Read');
  });

  it('ignores non-log files in the logs directory', async () => {
    const logsDir = createLogDir();
    writeFileSync(join(logsDir, 'random.txt'), 'not a log file');
    writeFileSync(join(logsDir, 'notes.md'), 'also not a log file');
    writeFileSync(
      join(logsDir, 'claude_output_2026-03-27_10-00-00.log'),
      buildLogContent({ storyText: '1-1-filter-test' }),
    );

    const { stdout, exitCode } = await runCli(['--json', 'stats']);
    expect(exitCode).toBeUndefined();
    const parsed = JSON.parse(stdout);
    expect(parsed.totalCalls).toBe(1);
  });

  it('computes avgCostPerStory correctly across multiple stories', async () => {
    const logsDir = createLogDir();
    // Two separate messages in one log file, each for a different story
    const lines = [
      // Story 1 message
      ...buildLogContent({ inputTokens: 1000, outputTokens: 500, storyText: '1-1-story-a' }).split('\n'),
      // Story 2 message — need a new message_start to record the previous one
      ...buildLogContent({ inputTokens: 2000, outputTokens: 1000, storyText: '2-1-story-b' }).split('\n'),
    ];
    writeFileSync(
      join(logsDir, 'claude_output_2026-03-27_10-00-00.log'),
      lines.join('\n'),
    );

    const { stdout, exitCode } = await runCli(['--json', 'stats']);
    expect(exitCode).toBeUndefined();
    const parsed = JSON.parse(stdout);
    expect(parsed.storiesTracked).toBe(2);
    expect(parsed.avgCostPerStory).toBeGreaterThan(0);
  });

  it('handles log file with only non-JSON lines', async () => {
    const logsDir = createLogDir();
    writeFileSync(
      join(logsDir, 'claude_output_2026-03-27_10-00-00.log'),
      'plain text line 1\nplain text line 2\n',
    );

    const { stdout, exitCode } = await runCli(['stats']);
    expect(exitCode).toBeUndefined();
    expect(stdout).toContain('Total API calls: 0');
  });

  it('formats report with correct table headers', async () => {
    const logsDir = createLogDir();
    writeFileSync(
      join(logsDir, 'claude_output_2026-03-27_10-00-00.log'),
      buildLogContent({ storyText: '1-1-fmt-test' }),
    );

    const { stdout, exitCode } = await runCli(['stats']);
    expect(exitCode).toBeUndefined();
    expect(stdout).toContain('| Type | Tokens | Rate | Cost | % |');
    expect(stdout).toContain('| Phase | Calls | Cost | % |');
    expect(stdout).toContain('| Tool | Calls | Cost | % |');
    expect(stdout).toContain('| Story | Calls | Cost | % |');
  });
});
