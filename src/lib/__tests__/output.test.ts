import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, fail, warn, info, jsonOutput } from '../output.js';

describe('output utilities', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('ok()', () => {
    it('prints [OK] prefix', () => {
      ok('success');
      expect(consoleSpy).toHaveBeenCalledWith('[OK] success');
    });

    it('outputs JSON when json option is set', () => {
      ok('success', { json: true });
      expect(consoleSpy).toHaveBeenCalledWith(
        JSON.stringify({ status: 'ok', message: 'success' })
      );
    });
  });

  describe('fail()', () => {
    it('prints [FAIL] prefix', () => {
      fail('error');
      expect(consoleSpy).toHaveBeenCalledWith('[FAIL] error');
    });

    it('outputs JSON when json option is set', () => {
      fail('error', { json: true });
      expect(consoleSpy).toHaveBeenCalledWith(
        JSON.stringify({ status: 'fail', message: 'error' })
      );
    });
  });

  describe('warn()', () => {
    it('prints [WARN] prefix', () => {
      warn('caution');
      expect(consoleSpy).toHaveBeenCalledWith('[WARN] caution');
    });

    it('outputs JSON when json option is set', () => {
      warn('caution', { json: true });
      expect(consoleSpy).toHaveBeenCalledWith(
        JSON.stringify({ status: 'warn', message: 'caution' })
      );
    });
  });

  describe('info()', () => {
    it('prints [INFO] prefix', () => {
      info('note');
      expect(consoleSpy).toHaveBeenCalledWith('[INFO] note');
    });

    it('outputs JSON when json option is set', () => {
      info('note', { json: true });
      expect(consoleSpy).toHaveBeenCalledWith(
        JSON.stringify({ status: 'info', message: 'note' })
      );
    });
  });

  describe('jsonOutput()', () => {
    it('outputs JSON string', () => {
      jsonOutput({ key: 'value', num: 42 });
      expect(consoleSpy).toHaveBeenCalledWith(
        JSON.stringify({ key: 'value', num: 42 })
      );
    });
  });
});
