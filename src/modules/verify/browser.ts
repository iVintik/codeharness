/**
 * Browser verification via agent-browser inside Docker containers.
 * Provides UI testing with screenshot evidence capture.
 *
 * All public methods return Result<T> and never throw.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { ok, fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type { BrowserActionResult, DiffResult } from './types.js';

const DEFAULT_TIMEOUT = 30_000;
const SCREENSHOT_DIR = '/workspace/verification/screenshots';

/** Only allow safe label characters for screenshot file names. */
const SAFE_LABEL_RE = /^[a-zA-Z0-9_-]+$/;

/** Container names must be non-empty alphanumeric with hyphens/underscores/dots. */
const SAFE_CONTAINER_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

/**
 * Wraps agent-browser CLI invocations via docker exec.
 * Each method catches all errors and returns Result<T>.
 */
export class BrowserVerifier {
  private readonly container: string;
  private readonly timeout: number;

  constructor(container: string, timeout: number = DEFAULT_TIMEOUT) {
    if (!SAFE_CONTAINER_RE.test(container)) {
      throw new Error(`Invalid container name: ${container}`);
    }
    this.container = container;
    this.timeout = timeout;
  }

  /** Navigate the browser to a URL. */
  navigate(url: string): Result<BrowserActionResult> {
    if (!url) {
      return fail('URL must not be empty', { command: 'navigate' });
    }
    return this.exec(['agent-browser', 'navigate', url]);
  }

  /** Capture a screenshot with the given label. */
  screenshot(label: string): Result<BrowserActionResult> {
    if (!SAFE_LABEL_RE.test(label)) {
      return fail(
        `Invalid screenshot label: ${label}. Use only alphanumeric, hyphens, underscores.`,
        { command: 'screenshot' },
      );
    }
    const outputPath = `${SCREENSHOT_DIR}/${label}.png`;
    const result = this.exec([
      'agent-browser', 'screenshot', '--output', outputPath,
    ]);
    if (result.success) {
      return ok({ ...result.data, screenshotPath: outputPath });
    }
    return result;
  }

  /** Click an element matching the given selector. */
  click(selector: string): Result<BrowserActionResult> {
    if (!selector) {
      return fail('Selector must not be empty', { command: 'click' });
    }
    return this.exec(['agent-browser', 'click', selector]);
  }

  /**
   * Click a selector then type text into the focused element.
   * agent-browser `type` operates on the currently focused element,
   * so this first clicks the selector, then types the text.
   */
  type(selector: string, text: string): Result<BrowserActionResult> {
    if (!selector) {
      return fail('Selector must not be empty', { command: 'type' });
    }
    const clickResult = this.exec(['agent-browser', 'click', selector]);
    if (!clickResult.success) {
      return clickResult;
    }
    return this.exec(['agent-browser', 'type', text]);
  }

  /** Evaluate JavaScript in the browser context. */
  evaluate(script: string): Result<BrowserActionResult> {
    if (!script) {
      return fail('Script must not be empty', { command: 'evaluate' });
    }
    return this.exec(['agent-browser', 'evaluate', script]);
  }

  /** Check whether agent-browser is installed in the container. */
  isAvailable(): Result<boolean> {
    try {
      execFileSync('docker', ['exec', this.container, 'which', 'agent-browser'], {
        stdio: 'pipe',
        timeout: this.timeout,
      });
      return ok(true);
    } catch (err: unknown) {
      const exitCode = extractExitCode(err);
      if (exitCode !== undefined) {
        return ok(false);
      }
      const message = err instanceof Error ? err.message : String(err);
      return fail(message, { command: 'which agent-browser' });
    }
  }

  /**
   * Compare two screenshots for visual differences.
   * Uses pixel-level comparison via ImageData in the container.
   */
  diffScreenshots(beforePath: string, afterPath: string): Result<DiffResult> {
    if (!existsSync(beforePath)) {
      return fail(`Before screenshot not found: ${beforePath}`, {
        command: 'diffScreenshots',
        beforePath,
        afterPath,
      });
    }
    if (!existsSync(afterPath)) {
      return fail(`After screenshot not found: ${afterPath}`, {
        command: 'diffScreenshots',
        beforePath,
        afterPath,
      });
    }

    try {
      const beforeBuf = readFileSync(beforePath);
      const afterBuf = readFileSync(afterPath);
      const hasDifferences = !beforeBuf.equals(afterBuf);

      return ok({ hasDifferences, beforePath, afterPath });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return fail(message, { command: 'diffScreenshots', beforePath, afterPath });
    }
  }

  /** Execute an agent-browser command inside the container via docker exec. */
  private exec(args: string[]): Result<BrowserActionResult> {
    const command = ['docker', 'exec', this.container, ...args].join(' ');
    try {
      const output = execFileSync('docker', ['exec', this.container, ...args], {
        stdio: 'pipe',
        timeout: this.timeout,
      }).toString('utf-8').trim();

      return ok({ output, exitCode: 0 });
    } catch (err: unknown) {
      const exitCode = extractExitCode(err);
      const stderr = extractStderr(err);
      const message = stderr || (err instanceof Error ? err.message : String(err));
      return fail(message, { command, exitCode: exitCode ?? undefined });
    }
  }
}

/** Extract exit code from a child_process error. */
function extractExitCode(err: unknown): number | undefined {
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const status = (err as { status: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return undefined;
}

/** Extract stderr string from a child_process error. */
function extractStderr(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'stderr' in err) {
    const stderr = (err as { stderr: unknown }).stderr;
    if (Buffer.isBuffer(stderr)) return stderr.toString('utf-8').trim();
    if (typeof stderr === 'string') return stderr.trim();
  }
  return '';
}
