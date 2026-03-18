import { describe, it, expect } from 'vitest';
import { ok, fail, isOk, isFail } from '../result.js';
import type { Result } from '../result.js';

describe('Result type', () => {
  describe('ok()', () => {
    it('returns { success: true, data: <value> }', () => {
      const result = ok(42);
      expect(result).toEqual({ success: true, data: 42 });
    });

    it('preserves complex data types', () => {
      const data = { name: 'test', items: [1, 2, 3] };
      const result = ok(data);
      expect(result).toEqual({ success: true, data });
    });

    it('works with string data', () => {
      const result = ok('hello');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('hello');
      }
    });
  });

  describe('fail()', () => {
    it('returns { success: false, error: <msg> }', () => {
      const result = fail('something broke');
      expect(result).toEqual({ success: false, error: 'something broke' });
    });

    it('returns { success: false, error: <msg>, context: <obj> } with context', () => {
      const ctx = { file: 'test.ts', line: 42 };
      const result = fail('parse error', ctx);
      expect(result).toEqual({
        success: false,
        error: 'parse error',
        context: { file: 'test.ts', line: 42 },
      });
    });

    it('omits context property when not provided', () => {
      const result = fail('no context');
      expect(result).not.toHaveProperty('context');
    });

    it('is assignable to any Result<T>', () => {
      const stringResult: Result<string> = fail('err');
      const numberResult: Result<number> = fail('err');
      expect(stringResult.success).toBe(false);
      expect(numberResult.success).toBe(false);
    });
  });

  describe('TypeScript narrowing', () => {
    it('narrows to data on success branch', () => {
      const result: Result<string> = ok('value');
      if (result.success) {
        // TypeScript should see result.data as string here
        const data: string = result.data;
        expect(data).toBe('value');
      } else {
        // This branch should not execute
        expect.unreachable('should not reach fail branch');
      }
    });

    it('narrows to error on failure branch', () => {
      const result: Result<string> = fail('broken');
      if (!result.success) {
        // TypeScript should see result.error as string here
        const error: string = result.error;
        expect(error).toBe('broken');
      } else {
        expect.unreachable('should not reach success branch');
      }
    });
  });

  describe('isOk()', () => {
    it('returns true for ok results', () => {
      expect(isOk(ok('yes'))).toBe(true);
    });

    it('returns false for fail results', () => {
      expect(isOk(fail('no'))).toBe(false);
    });

    it('narrows the type when used as a guard', () => {
      const result: Result<number> = ok(99);
      if (isOk(result)) {
        const val: number = result.data;
        expect(val).toBe(99);
      }
    });
  });

  describe('isFail()', () => {
    it('returns true for fail results', () => {
      expect(isFail(fail('err'))).toBe(true);
    });

    it('returns false for ok results', () => {
      expect(isFail(ok(1))).toBe(false);
    });

    it('narrows the type when used as a guard', () => {
      const result: Result<number> = fail('bad');
      if (isFail(result)) {
        const msg: string = result.error;
        expect(msg).toBe('bad');
      }
    });
  });
});
