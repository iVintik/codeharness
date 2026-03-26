/**
 * codeharness stats — Token consumption and cost analysis.
 * Parses ralph session logs to compute API-equivalent costs by phase, story, tool, and token type.
 * Outputs human-readable report and optionally writes JSON for retro consumption.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { info, ok, fail, jsonOutput } from '../lib/output.js';

// Opus 4.6 pricing per MTok
const RATES = {
  input: 15.0,
  output: 75.0,
  cacheRead: 1.50,
  cacheWrite: 18.75,
};

interface TokenBucket {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  calls: number;
}

function emptyBucket(): TokenBucket {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 };
}

function bucketCost(b: TokenBucket): number {
  return (b.input * RATES.input + b.output * RATES.output +
    b.cacheRead * RATES.cacheRead + b.cacheWrite * RATES.cacheWrite) / 1_000_000;
}

function addToBucket(target: TokenBucket, input: number, output: number, cacheRead: number, cacheWrite: number): void {
  target.input += input;
  target.output += output;
  target.cacheRead += cacheRead;
  target.cacheWrite += cacheWrite;
  target.calls += 1;
}

interface StatsReport {
  totalCost: number;
  totalCalls: number;
  byPhase: Record<string, TokenBucket>;
  byStory: Record<string, TokenBucket>;
  byTool: Record<string, TokenBucket>;
  byDate: Record<string, TokenBucket>;
  tokenBreakdown: TokenBucket;
  avgCostPerStory: number;
  storiesTracked: number;
}

function parseLogFile(filePath: string, report: {
  byPhase: Map<string, TokenBucket>;
  byStory: Map<string, TokenBucket>;
  byTool: Map<string, TokenBucket>;
  byDate: Map<string, TokenBucket>;
  messages: Array<{ input: number; output: number; cacheRead: number; cacheWrite: number; phase: string; story: string; tool: string }>;
}): void {
  const basename = filePath.split('/').pop() ?? '';
  const dateMatch = basename.match(/(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : 'unknown';

  let currentPhase = 'orchestrator';
  let currentStory = 'unknown';
  let currentTool = '';
  let msgInput = 0;
  let msgOutput = 0;
  let msgCacheRead = 0;
  let msgCacheWrite = 0;

  const content = readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    if (!line.startsWith('{')) continue;
    let d: Record<string, unknown>;
    try { d = JSON.parse(line) as Record<string, unknown>; } catch { continue; } // IGNORE: skip malformed JSON lines in logs

    const typ = d.type as string;

    if (typ === 'stream_event') {
      const evt = d.event as Record<string, unknown> | undefined;
      if (!evt) continue;
      const evtType = evt.type as string;

      if (evtType === 'message_start') {
        // Record previous message
        if (msgInput + msgOutput + msgCacheRead + msgCacheWrite > 0) {
          report.messages.push({ input: msgInput, output: msgOutput, cacheRead: msgCacheRead, cacheWrite: msgCacheWrite, phase: currentPhase, story: currentStory, tool: currentTool });
        }
        const usage = ((evt.message as Record<string, unknown>)?.usage ?? {}) as Record<string, number>;
        msgInput = usage.input_tokens ?? 0;
        msgCacheRead = usage.cache_read_input_tokens ?? 0;
        msgCacheWrite = usage.cache_creation_input_tokens ?? 0;
        msgOutput = 0;
      } else if (evtType === 'message_delta') {
        const usage = (evt.usage ?? {}) as Record<string, number>;
        msgOutput += usage.output_tokens ?? 0;
      } else if (evtType === 'content_block_start') {
        const cb = evt.content_block as Record<string, unknown> | undefined;
        if (cb?.type === 'tool_use') currentTool = (cb.name as string) ?? '';
      } else if (evtType === 'content_block_delta') {
        const text = ((evt.delta as Record<string, unknown>)?.text as string) ?? '';
        // Detect phase from harness-run text output
        if (text.includes('Step 3a') || text.toLowerCase().includes('create-story')) currentPhase = 'create-story';
        else if (text.includes('Step 3b') || text.toLowerCase().includes('dev-story')) currentPhase = 'dev-story';
        else if (text.includes('Step 3c') || text.toLowerCase().includes('code-review') || text.toLowerCase().includes('code review')) currentPhase = 'code-review';
        else if (text.includes('Step 3d') || text.toLowerCase().includes('verif')) currentPhase = 'verify';
        else if (text.includes('Step 8') || text.toLowerCase().includes('retro')) currentPhase = 'retro';
        // Detect story
        const sm = text.match(/(\d+-\d+-[a-z][\w-]*)/);
        if (sm) currentStory = sm[1];
      }
    }

    // Detect phase from subagent descriptions
    if (typ === 'system' && (d.subtype as string) === 'task_started') {
      const desc = ((d.description as string) ?? '').toLowerCase();
      if (desc.includes('code review') || desc.includes('code-review')) currentPhase = 'code-review';
      else if (desc.includes('dev-story') || desc.includes('dev story') || desc.includes('implement')) currentPhase = 'dev-story';
      else if (desc.includes('create-story') || desc.includes('create story')) currentPhase = 'create-story';
      else if (desc.includes('verif')) currentPhase = 'verify';
      else if (desc.includes('retro')) currentPhase = 'retro';
    }
  }

  // Record last message
  if (msgInput + msgOutput + msgCacheRead + msgCacheWrite > 0) {
    report.messages.push({ input: msgInput, output: msgOutput, cacheRead: msgCacheRead, cacheWrite: msgCacheWrite, phase: currentPhase, story: currentStory, tool: currentTool });
  }
}

function generateReport(projectDir: string): StatsReport {
  const logsDir = join(projectDir, 'ralph', 'logs');
  const logFiles = readdirSync(logsDir)
    .filter(f => f.startsWith('claude_output_') && f.endsWith('.log'))
    .sort()
    .map(f => join(logsDir, f));

  const report = {
    byPhase: new Map<string, TokenBucket>(),
    byStory: new Map<string, TokenBucket>(),
    byTool: new Map<string, TokenBucket>(),
    byDate: new Map<string, TokenBucket>(),
    messages: [] as Array<{ input: number; output: number; cacheRead: number; cacheWrite: number; phase: string; story: string; tool: string }>,
  };

  for (const logFile of logFiles) {
    parseLogFile(logFile, report);
  }

  // Aggregate messages into buckets
  const byPhase: Record<string, TokenBucket> = {};
  const byStory: Record<string, TokenBucket> = {};
  const byTool: Record<string, TokenBucket> = {};
  const total = emptyBucket();

  for (const msg of report.messages) {
    if (!byPhase[msg.phase]) byPhase[msg.phase] = emptyBucket();
    addToBucket(byPhase[msg.phase], msg.input, msg.output, msg.cacheRead, msg.cacheWrite);
    if (!byStory[msg.story]) byStory[msg.story] = emptyBucket();
    addToBucket(byStory[msg.story], msg.input, msg.output, msg.cacheRead, msg.cacheWrite);
    if (msg.tool) {
      if (!byTool[msg.tool]) byTool[msg.tool] = emptyBucket();
      addToBucket(byTool[msg.tool], msg.input, msg.output, msg.cacheRead, msg.cacheWrite);
    }
    addToBucket(total, msg.input, msg.output, msg.cacheRead, msg.cacheWrite);
  }

  const storyKeys = Object.keys(byStory).filter(k => /^\d+-\d+-/.test(k));
  const totalCost = bucketCost(total);
  const avgCostPerStory = storyKeys.length > 0
    ? storyKeys.reduce((sum, k) => sum + bucketCost(byStory[k]), 0) / storyKeys.length
    : 0;

  return {
    totalCost,
    totalCalls: report.messages.length,
    byPhase,
    byStory,
    byTool,
    byDate: {},
    tokenBreakdown: total,
    avgCostPerStory,
    storiesTracked: storyKeys.length,
  };
}

function formatReport(report: StatsReport): string {
  const lines: string[] = [];
  lines.push('# Harness Cost Report');
  lines.push('');
  lines.push(`Total API-equivalent cost: $${report.totalCost.toFixed(2)}`);
  lines.push(`Total API calls: ${report.totalCalls}`);
  lines.push(`Average cost per story: $${report.avgCostPerStory.toFixed(2)} (${report.storiesTracked} stories)`);
  lines.push('');

  // Token type breakdown
  const tb = report.tokenBreakdown;
  lines.push('## Cost by Token Type');
  lines.push('');
  lines.push(`| Type | Tokens | Rate | Cost | % |`);
  lines.push(`|------|--------|------|------|---|`);
  const crCost = tb.cacheRead * RATES.cacheRead / 1e6;
  const cwCost = tb.cacheWrite * RATES.cacheWrite / 1e6;
  const outCost = tb.output * RATES.output / 1e6;
  const inpCost = tb.input * RATES.input / 1e6;
  lines.push(`| Cache reads | ${tb.cacheRead.toLocaleString()} | $1.50/MTok | $${crCost.toFixed(2)} | ${(crCost / report.totalCost * 100).toFixed(0)}% |`);
  lines.push(`| Cache writes | ${tb.cacheWrite.toLocaleString()} | $18.75/MTok | $${cwCost.toFixed(2)} | ${(cwCost / report.totalCost * 100).toFixed(0)}% |`);
  lines.push(`| Output | ${tb.output.toLocaleString()} | $75/MTok | $${outCost.toFixed(2)} | ${(outCost / report.totalCost * 100).toFixed(0)}% |`);
  lines.push(`| Input | ${tb.input.toLocaleString()} | $15/MTok | $${inpCost.toFixed(2)} | ${(inpCost / report.totalCost * 100).toFixed(0)}% |`);
  lines.push('');

  // By phase
  lines.push('## Cost by Phase');
  lines.push('');
  lines.push(`| Phase | Calls | Cost | % |`);
  lines.push(`|-------|-------|------|---|`);
  const sortedPhases = Object.entries(report.byPhase).sort((a, b) => bucketCost(b[1]) - bucketCost(a[1]));
  for (const [phase, bucket] of sortedPhases) {
    const c = bucketCost(bucket);
    lines.push(`| ${phase} | ${bucket.calls} | $${c.toFixed(2)} | ${(c / report.totalCost * 100).toFixed(1)}% |`);
  }
  lines.push('');

  // By tool
  lines.push('## Cost by Tool');
  lines.push('');
  lines.push(`| Tool | Calls | Cost | % |`);
  lines.push(`|------|-------|------|---|`);
  const sortedTools = Object.entries(report.byTool).sort((a, b) => bucketCost(b[1]) - bucketCost(a[1]));
  for (const [tool, bucket] of sortedTools.slice(0, 10)) {
    const c = bucketCost(bucket);
    lines.push(`| ${tool} | ${bucket.calls} | $${c.toFixed(2)} | ${(c / report.totalCost * 100).toFixed(1)}% |`);
  }
  lines.push('');

  // Top stories
  lines.push('## Top 10 Most Expensive Stories');
  lines.push('');
  lines.push(`| Story | Calls | Cost | % |`);
  lines.push(`|-------|-------|------|---|`);
  const sortedStories = Object.entries(report.byStory).sort((a, b) => bucketCost(b[1]) - bucketCost(a[1]));
  for (const [story, bucket] of sortedStories.slice(0, 10)) {
    const c = bucketCost(bucket);
    lines.push(`| ${story} | ${bucket.calls} | $${c.toFixed(2)} | ${(c / report.totalCost * 100).toFixed(1)}% |`);
  }

  return lines.join('\n');
}

export function registerStatsCommand(program: Command): void {
  program
    .command('stats')
    .description('Analyze token consumption and cost from ralph session logs')
    .option('--save', 'Save report to _bmad-output/implementation-artifacts/cost-report.md')
    .action((options, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const isJson = !!globalOpts.json;
      const projectDir = process.cwd();
      const logsDir = join(projectDir, 'ralph', 'logs');

      if (!existsSync(logsDir)) {
        fail('No ralph/logs/ directory found — run codeharness run first');
        process.exitCode = 1;
        return;
      }

      const report = generateReport(projectDir);

      if (isJson) {
        jsonOutput(report as unknown as Record<string, unknown>);
        return;
      }

      const formatted = formatReport(report);
      console.log(formatted);

      if (options.save) {
        const outPath = join(projectDir, '_bmad-output', 'implementation-artifacts', 'cost-report.md');
        writeFileSync(outPath, formatted, 'utf-8');
        ok(`Report saved to ${outPath}`);
      }
    });
}
