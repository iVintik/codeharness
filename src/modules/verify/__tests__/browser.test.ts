import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process before imports
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

// Mock node:fs for diffScreenshots
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => Buffer.from('fake-image-data')),
}));

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { BrowserVerifier } from '../browser.js';

const mockExecFileSync = vi.mocked(execFileSync);
const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

describe('BrowserVerifier', () => {
  const CONTAINER = 'codeharness-verify-test';
  let verifier: BrowserVerifier;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(Buffer.from('fake-image-data'));
    verifier = new BrowserVerifier(CONTAINER);
  });

  // ─── constructor ────────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('accepts valid container names', () => {
      expect(() => new BrowserVerifier('my-container')).not.toThrow();
      expect(() => new BrowserVerifier('container_1')).not.toThrow();
      expect(() => new BrowserVerifier('a.b.c')).not.toThrow();
      expect(() => new BrowserVerifier('Container123')).not.toThrow();
    });

    it('rejects empty container name', () => {
      expect(() => new BrowserVerifier('')).toThrow('Invalid container name');
    });

    it('rejects container name starting with special char', () => {
      expect(() => new BrowserVerifier('-bad')).toThrow('Invalid container name');
      expect(() => new BrowserVerifier('.bad')).toThrow('Invalid container name');
    });

    it('rejects container name with spaces', () => {
      expect(() => new BrowserVerifier('bad name')).toThrow('Invalid container name');
    });

    it('rejects container name with shell metacharacters', () => {
      expect(() => new BrowserVerifier('bad;rm -rf /')).toThrow('Invalid container name');
    });
  });

  // ─── navigate ──────────────────────────────────────────────────────────────

  describe('navigate', () => {
    it('executes docker exec agent-browser navigate with URL', () => {
      mockExecFileSync.mockReturnValue(Buffer.from('Navigated to http://localhost:3000'));
      const result = verifier.navigate('http://localhost:3000');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.output).toBe('Navigated to http://localhost:3000');
        expect(result.data.exitCode).toBe(0);
      }
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'docker',
        ['exec', CONTAINER, 'agent-browser', 'navigate', 'http://localhost:3000'],
        expect.objectContaining({ stdio: 'pipe' }),
      );
    });

    it('returns fail on non-zero exit code', () => {
      const error = Object.assign(new Error('Command failed'), {
        status: 1,
        stderr: Buffer.from('Navigation error: timeout'),
      });
      mockExecFileSync.mockImplementation(() => { throw error; });

      const result = verifier.navigate('http://localhost:9999');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Navigation error: timeout');
        expect(result.context).toHaveProperty('exitCode', 1);
      }
    });

    it('returns fail when container is not running', () => {
      const error = new Error('Error: No such container: test-container');
      mockExecFileSync.mockImplementation(() => { throw error; });

      const result = verifier.navigate('http://localhost:3000');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('No such container');
      }
    });

    it('returns fail when URL is empty', () => {
      const result = verifier.navigate('');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('URL must not be empty');
      }
      expect(mockExecFileSync).not.toHaveBeenCalled();
    });
  });

  // ─── screenshot ────────────────────────────────────────────────────────────

  describe('screenshot', () => {
    it('captures screenshot with label-to-path mapping', () => {
      mockExecFileSync.mockReturnValue(Buffer.from('Screenshot saved'));
      const result = verifier.screenshot('login-page');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.screenshotPath).toBe(
          '/workspace/verification/screenshots/login-page.png',
        );
        expect(result.data.exitCode).toBe(0);
      }
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'docker',
        [
          'exec', CONTAINER,
          'agent-browser', 'screenshot',
          '--output', '/workspace/verification/screenshots/login-page.png',
        ],
        expect.objectContaining({ stdio: 'pipe' }),
      );
    });

    it('returns fail when screenshot command fails', () => {
      const error = Object.assign(new Error('Command failed'), {
        status: 1,
        stderr: Buffer.from('Browser not ready'),
      });
      mockExecFileSync.mockImplementation(() => { throw error; });

      const result = verifier.screenshot('fail-page');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Browser not ready');
      }
    });

    it('rejects label with path traversal characters', () => {
      const result = verifier.screenshot('../../etc/passwd');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid screenshot label');
      }
      expect(mockExecFileSync).not.toHaveBeenCalled();
    });

    it('rejects label with spaces', () => {
      const result = verifier.screenshot('bad label');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid screenshot label');
      }
    });

    it('rejects empty label', () => {
      const result = verifier.screenshot('');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid screenshot label');
      }
    });

    it('accepts label with underscores and hyphens', () => {
      mockExecFileSync.mockReturnValue(Buffer.from('ok'));
      const result = verifier.screenshot('my_screenshot-01');
      expect(result.success).toBe(true);
    });
  });

  // ─── click ─────────────────────────────────────────────────────────────────

  describe('click', () => {
    it('executes click with selector', () => {
      mockExecFileSync.mockReturnValue(Buffer.from('Clicked element'));
      const result = verifier.click('[ref=submit-btn]');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.output).toBe('Clicked element');
      }
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'docker',
        ['exec', CONTAINER, 'agent-browser', 'click', '[ref=submit-btn]'],
        expect.objectContaining({ stdio: 'pipe' }),
      );
    });

    it('returns fail when element not found', () => {
      const error = Object.assign(new Error('Element not found'), {
        status: 1,
        stderr: Buffer.from('No element matching selector'),
      });
      mockExecFileSync.mockImplementation(() => { throw error; });

      const result = verifier.click('.nonexistent');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('No element matching selector');
      }
    });

    it('returns fail when selector is empty', () => {
      const result = verifier.click('');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Selector must not be empty');
      }
      expect(mockExecFileSync).not.toHaveBeenCalled();
    });
  });

  // ─── type ──────────────────────────────────────────────────────────────────

  describe('type', () => {
    it('clicks selector then types text', () => {
      mockExecFileSync.mockReturnValue(Buffer.from('Typed text'));
      const result = verifier.type('#email', 'test@example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.output).toBe('Typed text');
      }
      // Should call click first, then type
      expect(mockExecFileSync).toHaveBeenCalledTimes(2);
      expect(mockExecFileSync).toHaveBeenNthCalledWith(
        1,
        'docker',
        ['exec', CONTAINER, 'agent-browser', 'click', '#email'],
        expect.objectContaining({ stdio: 'pipe' }),
      );
      expect(mockExecFileSync).toHaveBeenNthCalledWith(
        2,
        'docker',
        ['exec', CONTAINER, 'agent-browser', 'type', 'test@example.com'],
        expect.objectContaining({ stdio: 'pipe' }),
      );
    });

    it('returns fail on type error', () => {
      const error = Object.assign(new Error('Failed'), {
        status: 1,
        stderr: Buffer.from('No focused element'),
      });
      // First call (click) succeeds, second call (type) fails
      mockExecFileSync
        .mockReturnValueOnce(Buffer.from('Clicked'))
        .mockImplementationOnce(() => { throw error; });

      const result = verifier.type('#input', 'hello');
      expect(result.success).toBe(false);
    });

    it('returns fail when click step fails', () => {
      const error = Object.assign(new Error('Element not found'), {
        status: 1,
        stderr: Buffer.from('No element matching selector'),
      });
      mockExecFileSync.mockImplementation(() => { throw error; });

      const result = verifier.type('#missing', 'hello');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('No element matching selector');
      }
      // Should only call once (click failed, type not attempted)
      expect(mockExecFileSync).toHaveBeenCalledTimes(1);
    });

    it('returns fail when selector is empty', () => {
      const result = verifier.type('', 'hello');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Selector must not be empty');
      }
      expect(mockExecFileSync).not.toHaveBeenCalled();
    });
  });

  // ─── evaluate ──────────────────────────────────────────────────────────────

  describe('evaluate', () => {
    it('passes script to agent-browser evaluate', () => {
      mockExecFileSync.mockReturnValue(Buffer.from('My Page Title'));
      const result = verifier.evaluate('document.title');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.output).toBe('My Page Title');
      }
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'docker',
        ['exec', CONTAINER, 'agent-browser', 'evaluate', 'document.title'],
        expect.objectContaining({ stdio: 'pipe' }),
      );
    });

    it('returns fail when script throws', () => {
      const error = Object.assign(new Error('eval error'), {
        status: 1,
        stderr: Buffer.from('ReferenceError: foo is not defined'),
      });
      mockExecFileSync.mockImplementation(() => { throw error; });

      const result = verifier.evaluate('foo.bar()');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('ReferenceError');
      }
    });

    it('returns fail when script is empty', () => {
      const result = verifier.evaluate('');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Script must not be empty');
      }
      expect(mockExecFileSync).not.toHaveBeenCalled();
    });
  });

  // ─── isAvailable ───────────────────────────────────────────────────────────

  describe('isAvailable', () => {
    it('returns true when agent-browser is on PATH', () => {
      mockExecFileSync.mockReturnValue(Buffer.from('/usr/local/bin/agent-browser'));
      const result = verifier.isAvailable();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'docker',
        ['exec', CONTAINER, 'which', 'agent-browser'],
        expect.objectContaining({ stdio: 'pipe' }),
      );
    });

    it('returns false when agent-browser is not installed', () => {
      const error = Object.assign(new Error('not found'), { status: 1 });
      mockExecFileSync.mockImplementation(() => { throw error; });

      const result = verifier.isAvailable();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });

    it('returns fail on unexpected error (no exit code)', () => {
      const error = new Error('Docker daemon not running');
      mockExecFileSync.mockImplementation(() => { throw error; });

      const result = verifier.isAvailable();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Docker daemon not running');
      }
    });
  });

  // ─── diffScreenshots ───────────────────────────────────────────────────────

  describe('diffScreenshots', () => {
    it('detects no differences when files are identical', () => {
      mockReadFileSync.mockReturnValue(Buffer.from('identical-data'));
      const result = verifier.diffScreenshots('/tmp/before.png', '/tmp/after.png');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.hasDifferences).toBe(false);
        expect(result.data.beforePath).toBe('/tmp/before.png');
        expect(result.data.afterPath).toBe('/tmp/after.png');
      }
    });

    it('detects differences when files differ', () => {
      mockReadFileSync
        .mockReturnValueOnce(Buffer.from('before-data'))
        .mockReturnValueOnce(Buffer.from('after-data'));

      const result = verifier.diffScreenshots('/tmp/before.png', '/tmp/after.png');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.hasDifferences).toBe(true);
      }
    });

    it('returns fail when before file does not exist', () => {
      mockExistsSync.mockImplementation((p) => p !== '/tmp/missing-before.png');
      const result = verifier.diffScreenshots('/tmp/missing-before.png', '/tmp/after.png');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Before screenshot not found');
      }
    });

    it('returns fail when after file does not exist', () => {
      mockExistsSync.mockImplementation((p) => p !== '/tmp/missing-after.png');
      const result = verifier.diffScreenshots('/tmp/before.png', '/tmp/missing-after.png');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('After screenshot not found');
      }
    });

    it('returns fail on file read error', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = verifier.diffScreenshots('/tmp/before.png', '/tmp/after.png');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Permission denied');
      }
    });
  });

  // ─── Error handling edge cases ─────────────────────────────────────────────

  describe('error handling', () => {
    it('handles timeout errors', () => {
      const error = Object.assign(new Error('ETIMEDOUT'), {
        killed: true,
        signal: 'SIGTERM',
      });
      mockExecFileSync.mockImplementation(() => { throw error; });

      const result = verifier.navigate('http://localhost:3000');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('ETIMEDOUT');
      }
    });

    it('handles errors with no stderr', () => {
      const error = new Error('Unknown error');
      mockExecFileSync.mockImplementation(() => { throw error; });

      const result = verifier.click('#btn');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Unknown error');
      }
    });

    it('handles errors with string stderr', () => {
      const error = Object.assign(new Error('Command failed'), {
        status: 1,
        stderr: 'string stderr message',
      });
      mockExecFileSync.mockImplementation(() => { throw error; });

      const result = verifier.click('#btn');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('string stderr message');
      }
    });

    it('never throws from any method', () => {
      const error = new Error('Catastrophic failure');
      mockExecFileSync.mockImplementation(() => { throw error; });

      // None of these should throw
      expect(() => verifier.navigate('url')).not.toThrow();
      expect(() => verifier.screenshot('label')).not.toThrow();
      expect(() => verifier.click('sel')).not.toThrow();
      expect(() => verifier.type('sel', 'text')).not.toThrow();
      expect(() => verifier.evaluate('script')).not.toThrow();
      expect(() => verifier.isAvailable()).not.toThrow();
    });

    it('uses custom timeout when provided', () => {
      const customVerifier = new BrowserVerifier(CONTAINER, 5000);
      mockExecFileSync.mockReturnValue(Buffer.from('ok'));

      customVerifier.navigate('http://localhost:3000');
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'docker',
        expect.any(Array),
        expect.objectContaining({ timeout: 5000 }),
      );
    });
  });
});
