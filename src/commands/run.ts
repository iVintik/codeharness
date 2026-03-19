import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { fail, info, jsonOutput } from '../lib/output.js';
import { readSprintStatus } from '../lib/beads-sync.js';
import { generateRalphPrompt } from '../templates/ralph-prompt.js';
import { DashboardFormatter } from '../lib/dashboard-formatter.js';

const SPRINT_STATUS_REL = '_bmad-output/implementation-artifacts/sprint-status.yaml';
const STORY_KEY_PATTERN = /^\d+-\d+-/;

/**
 * Resolves the path to ralph/ralph.sh relative to the package root.
 * In the built CLI, __dirname is dist/, so we go up one level.
 */
export function resolveRalphPath(): string {
  // Use import.meta.url to find the package root
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);
  // From dist/ or src/commands/, go up to package root
  // In built mode: dist/index.js -> dist/ -> package root
  // In dev mode: src/commands/run.ts -> src/commands/ -> src/ -> package root
  let root = dirname(currentDir); // up from commands/ or dist/
  if (root.endsWith('/src') || root.endsWith('\\src')) {
    root = dirname(root); // up from src/ to package root
  }
  return join(root, 'ralph', 'ralph.sh');
}

/**
 * Resolves the plugin directory path.
 * The plugin is scaffolded to .claude/ during init.
 */
export function resolvePluginDir(): string {
  return join(process.cwd(), '.claude');
}

/**
 * Counts stories by status from sprint-status.yaml.
 */
export function countStories(statuses: Record<string, string>): {
  total: number;
  ready: number;
  done: number;
  inProgress: number;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  verified: number;
} {
  let total = 0;
  let ready = 0;
  let done = 0;
  let inProgress = 0;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  let verified = 0;

  for (const [key, status] of Object.entries(statuses)) {
    if (!STORY_KEY_PATTERN.test(key)) continue;
    total++;
    if (status === 'backlog' || status === 'ready-for-dev') ready++;
    else if (status === 'done') done++;
    else if (status === 'in-progress' || status === 'review') inProgress++;
    else if (status === 'verifying') verified++;
  }

  return { total, ready, done, inProgress, verified };
}

/**
 * Builds the argument array for spawning Ralph.
 */
export function buildSpawnArgs(opts: {
  ralphPath: string;
  pluginDir: string;
  promptFile: string;
  maxIterations: number;
  timeout: number;
  iterationTimeout: number;
  calls: number;
  quiet: boolean;
  maxStoryRetries?: number;
  reset?: boolean;
}): string[] {
  const args = [
    opts.ralphPath,
    '--plugin-dir', opts.pluginDir,
    '--max-iterations', String(opts.maxIterations),
    '--timeout', String(opts.timeout),
    '--iteration-timeout', String(opts.iterationTimeout),
    '--calls', String(opts.calls),
    '--prompt', opts.promptFile,
  ];

  if (opts.maxStoryRetries !== undefined) {
    args.push('--max-story-retries', String(opts.maxStoryRetries));
  }

  if (opts.reset) {
    args.push('--reset');
  }

  return args;
}

export function registerRunCommand(program: Command): void {
  program
    .command('run')
    .description('Execute the autonomous coding loop')
    .option('--max-iterations <n>', 'Maximum loop iterations', '50')
    .option('--timeout <seconds>', 'Total loop timeout in seconds', '43200')
    .option('--iteration-timeout <minutes>', 'Per-iteration timeout in minutes', '30')
    .option('--quiet', 'Suppress terminal output (background mode)', false)
    .option('--calls <n>', 'Max API calls per hour', '100')
    .option('--max-story-retries <n>', 'Max retries per story before flagging', '10')
    .option('--reset', 'Clear retry counters, flagged stories, and circuit breaker before starting', false)
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const isJson = !!globalOpts.json;
      const outputOpts = { json: isJson };

      // 1. Resolve Ralph script path
      const ralphPath = resolveRalphPath();
      if (!existsSync(ralphPath)) {
        fail('Ralph loop not found — reinstall codeharness', outputOpts);
        process.exitCode = 1;
        return;
      }

      // 2. Resolve plugin directory
      const pluginDir = resolvePluginDir();
      if (!existsSync(pluginDir)) {
        fail('Plugin directory not found — run codeharness init first', outputOpts);
        process.exitCode = 1;
        return;
      }

      // 3. Read sprint status for story count
      const projectDir = process.cwd();
      const sprintStatusPath = join(projectDir, SPRINT_STATUS_REL);
      const statuses = readSprintStatus(projectDir);
      const counts = countStories(statuses);

      if (counts.total === 0) {
        fail('No stories found in sprint-status.yaml — nothing to execute', outputOpts);
        process.exitCode = 1;
        return;
      }

      info(`Starting autonomous execution — ${counts.ready} ready, ${counts.inProgress} in progress, ${counts.verified} verified, ${counts.done}/${counts.total} done`, outputOpts);

      // 4. Parse and validate numeric options
      const maxIterations = parseInt(options.maxIterations, 10);
      const timeout = parseInt(options.timeout, 10);
      const iterationTimeout = parseInt(options.iterationTimeout, 10);
      const calls = parseInt(options.calls, 10);
      const maxStoryRetries = parseInt(options.maxStoryRetries, 10);

      if (isNaN(maxIterations) || isNaN(timeout) || isNaN(iterationTimeout) || isNaN(calls) || isNaN(maxStoryRetries)) {
        fail('Invalid numeric option — --max-iterations, --timeout, --iteration-timeout, --calls, and --max-story-retries must be numbers', outputOpts);
        process.exitCode = 1;
        return;
      }

      // 5. Generate prompt file (with flagged stories context if available)
      const promptFile = join(projectDir, 'ralph', '.harness-prompt.md');

      // Read flagged stories file if it exists (retry counts are managed by ralph.sh)
      const flaggedFilePath = join(projectDir, 'ralph', '.flagged_stories');

      let flaggedStories: string[] | undefined;

      if (existsSync(flaggedFilePath)) {
        try {
          const flaggedContent = readFileSync(flaggedFilePath, 'utf-8');
          flaggedStories = flaggedContent.split('\n').filter(s => s.trim().length > 0);
        } catch {
          // Ignore read errors
        }
      }

      const promptContent = generateRalphPrompt({
        projectDir,
        sprintStatusPath,
        flaggedStories,
      });
      try {
        mkdirSync(dirname(promptFile), { recursive: true });
        writeFileSync(promptFile, promptContent, 'utf-8');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        fail(`Failed to write prompt file: ${message}`, outputOpts);
        process.exitCode = 1;
        return;
      }

      // 6. Build spawn arguments
      const args = buildSpawnArgs({
        ralphPath,
        pluginDir,
        promptFile,
        maxIterations,
        timeout,
        iterationTimeout,
        calls,
        quiet: options.quiet,
        maxStoryRetries,
        reset: options.reset,
      });

      // 7. Set environment for JSON mode
      const env = { ...process.env };
      if (isJson) {
        env.CLAUDE_OUTPUT_FORMAT = 'json';
      }

      // 8. Spawn Ralph — filter output to show only structured progress lines
      try {
        const quiet = options.quiet;
        const child = spawn('bash', args, {
          stdio: quiet ? 'ignore' : ['inherit', 'pipe', 'pipe'],
          cwd: projectDir,
          env,
        });

        let tickerInterval: ReturnType<typeof setInterval> | null = null;

        if (!quiet && child.stdout && child.stderr) {
          const formatter = new DashboardFormatter();

          // Buffer partial lines across data events
          const makeFilterOutput = (): ((data: Buffer) => void) => {
            let partial = '';
            return (data: Buffer): void => {
              const text = partial + data.toString();
              const parts = text.split('\n');
              // Last element is either '' (line ended with \n) or a partial line
              partial = parts.pop() ?? '';
              for (const line of parts) {
                if (line.trim().length === 0) continue;
                const formatted = formatter.formatLine(line);
                if (formatted !== null) {
                  // Clear any ticker line before printing a real event
                  process.stdout.write(`\r\x1b[K${formatted}\n`);
                }
              }
            };
          };
          child.stdout.on('data', makeFilterOutput());
          child.stderr.on('data', makeFilterOutput());

          // Start 10-second ticker for live progress when ralph is silent
          tickerInterval = setInterval(() => {
            const tickerLine = formatter.getTickerLine();
            if (tickerLine) {
              process.stdout.write(`\r\x1b[K${tickerLine}`);
            }
          }, 10_000);
        }

        const exitCode = await new Promise<number>((resolve, reject) => {
          child.on('error', (err) => {
            if (tickerInterval) clearInterval(tickerInterval);
            reject(err);
          });
          child.on('close', (code) => {
            if (tickerInterval) clearInterval(tickerInterval);
            resolve(code ?? 1);
          });
        });

        // 9. Handle JSON output on exit
        if (isJson) {
          const statusFile = join(projectDir, 'ralph', 'status.json');
          if (existsSync(statusFile)) {
            try {
              const statusData = JSON.parse(readFileSync(statusFile, 'utf-8'));
              const finalStatuses = readSprintStatus(projectDir);
              const finalCounts = countStories(finalStatuses);
              jsonOutput({
                status: statusData.status ?? (exitCode === 0 ? 'completed' : 'stopped'),
                iterations: statusData.loop_count ?? 0,
                storiesCompleted: finalCounts.done,
                storiesTotal: finalCounts.total,
                storiesRemaining: finalCounts.total - finalCounts.done,
                elapsedSeconds: statusData.elapsed_seconds ?? 0,
                flaggedStories: statusData.flagged_stories ?? [],
                exitReason: statusData.exit_reason ?? '',
              });
            } catch {
              jsonOutput({
                status: exitCode === 0 ? 'completed' : 'stopped',
                iterations: 0,
                storiesCompleted: 0,
                storiesTotal: counts.total,
                storiesRemaining: counts.total,
                elapsedSeconds: 0,
                flaggedStories: [],
                exitReason: 'status_file_unreadable',
              });
            }
          } else {
            // status.json not created (Ralph crashed early or never started)
            const finalStatuses = readSprintStatus(projectDir);
            const finalCounts = countStories(finalStatuses);
            jsonOutput({
              status: exitCode === 0 ? 'completed' : 'stopped',
              iterations: 0,
              storiesCompleted: finalCounts.done,
              storiesTotal: finalCounts.total,
              storiesRemaining: finalCounts.total - finalCounts.done,
              elapsedSeconds: 0,
              flaggedStories: [],
              exitReason: 'status_file_missing',
            });
          }
        }

        process.exitCode = exitCode;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        fail(`Failed to start Ralph: ${message}`, outputOpts);
        process.exitCode = 1;
      }
    });
}
