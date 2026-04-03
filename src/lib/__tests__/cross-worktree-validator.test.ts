import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create controllable mocks — must use vi.hoisted so they're available in vi.mock factories
const { mockExecAsync, mockAppendFileSync, mockMkdirSync } = vi.hoisted(() => ({
  mockExecAsync: vi.fn(),
  mockAppendFileSync: vi.fn(),
  mockMkdirSync: vi.fn(),
}));

// Mock node:child_process
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

// Mock node:util to return our controllable mockExecAsync
vi.mock('node:util', () => ({
  promisify: () => mockExecAsync,
}));

// Mock node:fs
vi.mock('node:fs', () => ({
  appendFileSync: mockAppendFileSync,
  mkdirSync: mockMkdirSync,
}));

import {
  validateMerge,
  parseTestOutput,
  writeMergeTelemetry,
  type ValidateMergeOptions,
  type ValidationResult,
} from '../cross-worktree-validator.js';

describe('cross-worktree-validator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Interface Shape Tests (AC #7, #8) ---

  describe('ValidateMergeOptions interface shape (AC #8)', () => {
    it('has all required fields', () => {
      const opts: ValidateMergeOptions = {
        testCommand: 'npm test',
        cwd: '/repo',
        epicId: '18',
        writeTelemetry: true,
      };
      expect(opts).toHaveProperty('testCommand');
      expect(opts).toHaveProperty('cwd');
      expect(opts).toHaveProperty('epicId');
      expect(opts).toHaveProperty('writeTelemetry');
    });

    it('accepts optional storyKey', () => {
      const opts: ValidateMergeOptions = {
        testCommand: 'npm test',
        cwd: '/repo',
        epicId: '18',
        storyKey: 'merge-18-custom',
        writeTelemetry: false,
      };
      expect(opts.storyKey).toBe('merge-18-custom');
    });
  });

  describe('ValidationResult interface shape (AC #7)', () => {
    it('has all required fields', () => {
      const result: ValidationResult = {
        valid: true,
        testResults: { passed: 10, failed: 0, coverage: 95.5 },
        output: '10 passed',
        durationMs: 1234,
      };
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('testResults');
      expect(result).toHaveProperty('output');
      expect(result).toHaveProperty('durationMs');
    });

    it('testResults includes passed, failed, and optional coverage', () => {
      const withCov: ValidationResult = {
        valid: true,
        testResults: { passed: 5, failed: 0, coverage: 88.2 },
        output: '',
        durationMs: 100,
      };
      expect(withCov.testResults.passed).toBe(5);
      expect(withCov.testResults.failed).toBe(0);
      expect(withCov.testResults.coverage).toBe(88.2);

      const withoutCov: ValidationResult = {
        valid: false,
        testResults: { passed: 3, failed: 2, coverage: null },
        output: '',
        durationMs: 200,
      };
      expect(withoutCov.testResults.coverage).toBeNull();
    });
  });

  // --- parseTestOutput Tests ---

  describe('parseTestOutput (AC #1)', () => {
    it('parses passed and failed counts', () => {
      const result = parseTestOutput('10 passed\n2 failed');
      expect(result.passed).toBe(10);
      expect(result.failed).toBe(2);
    });

    it('parses passed only', () => {
      const result = parseTestOutput('5 passed');
      expect(result.passed).toBe(5);
      expect(result.failed).toBe(0);
    });

    it('parses coverage from "All files" pattern', () => {
      const result = parseTestOutput('10 passed\n0 failed\nAll files | 95.5');
      expect(result.coverage).toBe(95.5);
    });

    it('returns 0/0 for unparseable output', () => {
      const result = parseTestOutput('Build completed successfully.');
      expect(result.passed).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.coverage).toBeNull();
    });

    it('handles empty string', () => {
      const result = parseTestOutput('');
      expect(result.passed).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  // --- validateMerge Tests ---

  describe('validateMerge — success path (AC #1)', () => {
    it('returns valid: true when tests pass', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '10 passed\n0 failed' });

      const result = await validateMerge({
        testCommand: 'npm test',
        cwd: '/repo',
        epicId: '18',
        writeTelemetry: false,
      });

      expect(result.valid).toBe(true);
      expect(result.testResults).toEqual({ passed: 10, failed: 0, coverage: null });
      expect(result.output).toBe('10 passed\n0 failed');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('includes coverage in test results when available', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '10 passed\nAll files | 95.5' });

      const result = await validateMerge({
        testCommand: 'npm test',
        cwd: '/repo',
        epicId: '18',
        writeTelemetry: false,
      });

      expect(result.valid).toBe(true);
      expect(result.testResults.coverage).toBe(95.5);
    });
  });

  describe('validateMerge — failure path (AC #2)', () => {
    it('returns valid: false when tests fail', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '5 passed\n3 failed' });

      const result = await validateMerge({
        testCommand: 'npm test',
        cwd: '/repo',
        epicId: '18',
        writeTelemetry: false,
      });

      expect(result.valid).toBe(false);
      expect(result.testResults).toEqual({ passed: 5, failed: 3, coverage: null });
      expect(result.output).toBe('5 passed\n3 failed');
    });

    it('returns valid: false when test command exits non-zero with parseable output', async () => {
      const err = new Error('Command failed') as Error & { stdout: string };
      err.stdout = '3 passed\n2 failed\nError: some test error';
      mockExecAsync.mockRejectedValue(err);

      const result = await validateMerge({
        testCommand: 'npm test',
        cwd: '/repo',
        epicId: '18',
        writeTelemetry: false,
      });

      expect(result.valid).toBe(false);
      expect(result.testResults).toEqual({ passed: 3, failed: 2, coverage: null });
      expect(result.output).toContain('3 passed');
    });

    it('returns failed: 1 when test command exits with no parseable output', async () => {
      const err = new Error('Command failed') as Error & { stdout: string };
      err.stdout = '';
      mockExecAsync.mockRejectedValue(err);

      const result = await validateMerge({
        testCommand: 'npm test',
        cwd: '/repo',
        epicId: '18',
        writeTelemetry: false,
      });

      expect(result.valid).toBe(false);
      expect(result.testResults).toEqual({ passed: 0, failed: 1, coverage: null });
      expect(result.output).toBe('Test command failed with no output');
    });

    it('handles error with no stdout property', async () => {
      mockExecAsync.mockRejectedValue(new Error('SIGTERM'));

      const result = await validateMerge({
        testCommand: 'npm test',
        cwd: '/repo',
        epicId: '18',
        writeTelemetry: false,
      });

      expect(result.valid).toBe(false);
      expect(result.testResults).toEqual({ passed: 0, failed: 1, coverage: null });
    });

    it('treats 0 passed 0 failed as failure (edge case)', async () => {
      mockExecAsync.mockResolvedValue({ stdout: 'Build completed successfully.' });

      const result = await validateMerge({
        testCommand: 'npm test',
        cwd: '/repo',
        epicId: '18',
        writeTelemetry: false,
      });

      // 0 passed && 0 failed => valid = false (passed must be > 0)
      expect(result.valid).toBe(false);
    });
  });

  describe('validateMerge — timeout (AC #5)', () => {
    it('respects 5-minute timeout', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '5 passed' });

      await validateMerge({
        testCommand: 'npm test',
        cwd: '/repo',
        epicId: '18',
        writeTelemetry: false,
      });

      expect(mockExecAsync).toHaveBeenCalledWith('npm test', {
        cwd: '/repo',
        timeout: 300_000,
        maxBuffer: 10 * 1024 * 1024,
      });
    });

    it('handles timeout error as failure', async () => {
      const err = new Error('Process timed out') as Error & { stdout: string };
      err.stdout = '';
      mockExecAsync.mockRejectedValue(err);

      const result = await validateMerge({
        testCommand: 'npm test',
        cwd: '/repo',
        epicId: '18',
        writeTelemetry: false,
      });

      expect(result.valid).toBe(false);
      expect(result.testResults).toEqual({ passed: 0, failed: 1, coverage: null });
    });
  });

  // --- Telemetry Tests (AC #4, #9) ---

  describe('validateMerge — telemetry integration (AC #4, #9)', () => {
    it('writes telemetry when writeTelemetry is true', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '10 passed\n0 failed' });

      await validateMerge({
        testCommand: 'npm test',
        cwd: '/repo',
        epicId: '18',
        writeTelemetry: true,
      });

      expect(mockMkdirSync).toHaveBeenCalledWith('/repo/.codeharness', { recursive: true });
      expect(mockAppendFileSync).toHaveBeenCalledOnce();
      const written = mockAppendFileSync.mock.calls[0][1] as string;
      const entry = JSON.parse(written.trim());
      expect(entry.version).toBe(1);
      expect(entry.storyKey).toBe('merge-18');
      expect(entry.epicId).toBe('18');
      expect(entry.testResults.passed).toBe(10);
      expect(entry.testResults.failed).toBe(0);
      expect(entry.errors).toEqual([]);
    });

    it('skips telemetry when writeTelemetry is false', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '10 passed' });

      await validateMerge({
        testCommand: 'npm test',
        cwd: '/repo',
        epicId: '18',
        writeTelemetry: false,
      });

      expect(mockAppendFileSync).not.toHaveBeenCalled();
    });

    it('writes telemetry on failure with error message', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '5 passed\n2 failed' });

      await validateMerge({
        testCommand: 'npm test',
        cwd: '/repo',
        epicId: '18',
        writeTelemetry: true,
      });

      expect(mockAppendFileSync).toHaveBeenCalledOnce();
      const written = mockAppendFileSync.mock.calls[0][1] as string;
      const entry = JSON.parse(written.trim());
      expect(entry.errors).toEqual(['Test suite failed after merge']);
      expect(entry.testResults.failed).toBe(2);
    });

    it('telemetry entry has storyKey: merge-{epicId} format (AC #9)', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '5 passed' });

      await validateMerge({
        testCommand: 'npm test',
        cwd: '/repo',
        epicId: '42',
        writeTelemetry: true,
      });

      const written = mockAppendFileSync.mock.calls[0][1] as string;
      const entry = JSON.parse(written.trim());
      expect(entry.storyKey).toBe('merge-42');
    });

    it('uses custom storyKey when provided (AC #9)', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '5 passed' });

      await validateMerge({
        testCommand: 'npm test',
        cwd: '/repo',
        epicId: '42',
        storyKey: 'custom-key',
        writeTelemetry: true,
      });

      const written = mockAppendFileSync.mock.calls[0][1] as string;
      const entry = JSON.parse(written.trim());
      expect(entry.storyKey).toBe('custom-key');
    });

    it('telemetry entry includes duration_ms and timestamp', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '5 passed' });

      await validateMerge({
        testCommand: 'npm test',
        cwd: '/repo',
        epicId: '18',
        writeTelemetry: true,
      });

      const written = mockAppendFileSync.mock.calls[0][1] as string;
      const entry = JSON.parse(written.trim());
      expect(typeof entry.duration_ms).toBe('number');
      expect(entry.duration_ms).toBeGreaterThanOrEqual(0);
      expect(typeof entry.timestamp).toBe('string');
      expect(entry.cost_usd).toBeNull();
      expect(entry.attempts).toBeNull();
      expect(entry.acResults).toBeNull();
      expect(entry.filesChanged).toEqual([]);
    });

    it('telemetry write failure does not break validation', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '10 passed\n0 failed' });
      mockAppendFileSync.mockImplementation(() => {
        throw new Error('ENOSPC: no space left on device');
      });

      const result = await validateMerge({
        testCommand: 'npm test',
        cwd: '/repo',
        epicId: '18',
        writeTelemetry: true,
      });

      // Validation should still succeed despite telemetry failure
      expect(result.valid).toBe(true);
      expect(result.testResults).toEqual({ passed: 10, failed: 0, coverage: null });
    });

    it('writes telemetry on test command error when writeTelemetry is true', async () => {
      const err = new Error('Command failed') as Error & { stdout: string };
      err.stdout = '2 passed\n3 failed';
      mockExecAsync.mockRejectedValue(err);

      await validateMerge({
        testCommand: 'npm test',
        cwd: '/repo',
        epicId: '18',
        writeTelemetry: true,
      });

      expect(mockAppendFileSync).toHaveBeenCalledOnce();
      const written = mockAppendFileSync.mock.calls[0][1] as string;
      const entry = JSON.parse(written.trim());
      expect(entry.testResults.passed).toBe(2);
      expect(entry.testResults.failed).toBe(3);
    });

    it('writes telemetry on no-output error when writeTelemetry is true', async () => {
      const err = new Error('Command failed') as Error & { stdout: string };
      err.stdout = '';
      mockExecAsync.mockRejectedValue(err);

      await validateMerge({
        testCommand: 'npm test',
        cwd: '/repo',
        epicId: '18',
        writeTelemetry: true,
      });

      expect(mockAppendFileSync).toHaveBeenCalledOnce();
      const written = mockAppendFileSync.mock.calls[0][1] as string;
      const entry = JSON.parse(written.trim());
      expect(entry.testResults).toEqual({ passed: 0, failed: 1, coverage: null });
      expect(entry.errors).toEqual(['Test suite failed after merge']);
    });
  });

  // --- writeMergeTelemetry Tests ---

  describe('writeMergeTelemetry (exported helper)', () => {
    it('writes NDJSON entry to .codeharness/telemetry.jsonl', () => {
      const opts: ValidateMergeOptions = {
        testCommand: 'npm test',
        cwd: '/repo',
        epicId: '18',
        writeTelemetry: true,
      };
      const result: ValidationResult = {
        valid: true,
        testResults: { passed: 10, failed: 0, coverage: null },
        output: '10 passed',
        durationMs: 500,
      };

      writeMergeTelemetry(opts, result);

      expect(mockMkdirSync).toHaveBeenCalledWith('/repo/.codeharness', { recursive: true });
      expect(mockAppendFileSync).toHaveBeenCalledWith(
        '/repo/.codeharness/telemetry.jsonl',
        expect.stringContaining('"storyKey":"merge-18"'),
      );
    });

    it('silently catches write failures', () => {
      mockAppendFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const opts: ValidateMergeOptions = {
        testCommand: 'npm test',
        cwd: '/repo',
        epicId: '18',
        writeTelemetry: true,
      };
      const result: ValidationResult = {
        valid: true,
        testResults: { passed: 5, failed: 0, coverage: null },
        output: '',
        durationMs: 100,
      };

      // Should not throw
      expect(() => writeMergeTelemetry(opts, result)).not.toThrow();
    });
  });

  // --- Uses configured test command (AC #5) ---

  describe('validateMerge — test command configuration (AC #5)', () => {
    it('uses the configured test command', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '5 passed' });

      await validateMerge({
        testCommand: './node_modules/.bin/vitest run',
        cwd: '/my-project',
        epicId: '18',
        writeTelemetry: false,
      });

      expect(mockExecAsync).toHaveBeenCalledWith('./node_modules/.bin/vitest run', {
        cwd: '/my-project',
        timeout: 300_000,
        maxBuffer: 10 * 1024 * 1024,
      });
    });
  });

  // --- Regression: existing module tests still pass (AC #10) ---

  describe('exports (AC #6)', () => {
    it('exports validateMerge function', () => {
      expect(typeof validateMerge).toBe('function');
    });

    it('exports parseTestOutput function', () => {
      expect(typeof parseTestOutput).toBe('function');
    });

    it('exports writeMergeTelemetry function', () => {
      expect(typeof writeMergeTelemetry).toBe('function');
    });
  });
});
