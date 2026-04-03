import { describe, it, expect } from 'vitest';
import { resolveModel } from '../model-resolver.js';
import { resolveModel as barrelResolveModel } from '../index.js';

describe('agents/model-resolver — resolveModel()', () => {
  const driver = { defaultModel: 'claude-haiku-3-20250514' };

  // --- 3-level cascade ---

  describe('cascade priority', () => {
    it('task model takes highest priority (AC #2)', () => {
      const result = resolveModel(
        { model: 'claude-opus-4-20250514' },
        { model: 'claude-sonnet-4-20250514' },
        { defaultModel: 'claude-haiku-3-20250514' },
      );
      expect(result).toBe('claude-opus-4-20250514');
    });

    it('agent model used when task has no model (AC #3)', () => {
      const result = resolveModel(
        {},
        { model: 'claude-sonnet-4-20250514' },
        { defaultModel: 'claude-haiku-3-20250514' },
      );
      expect(result).toBe('claude-sonnet-4-20250514');
    });

    it('driver default used when neither task nor agent specify one (AC #4)', () => {
      const result = resolveModel(
        {},
        {},
        { defaultModel: 'claude-sonnet-4-20250514' },
      );
      expect(result).toBe('claude-sonnet-4-20250514');
    });
  });

  // --- undefined fields ---

  describe('undefined fields fall through correctly', () => {
    it('task.model undefined, agent.model undefined → driver default (AC #5)', () => {
      const result = resolveModel(
        { model: undefined },
        { model: undefined },
        { defaultModel: 'codex-mini' },
      );
      expect(result).toBe('codex-mini');
    });

    it('task.model undefined falls to agent', () => {
      const result = resolveModel(
        { model: undefined },
        { model: 'claude-sonnet-4-20250514' },
        driver,
      );
      expect(result).toBe('claude-sonnet-4-20250514');
    });
  });

  // --- null fields ---

  describe('null fields fall through correctly', () => {
    it('task.model null falls to agent', () => {
      const result = resolveModel(
        { model: null },
        { model: 'claude-sonnet-4-20250514' },
        driver,
      );
      expect(result).toBe('claude-sonnet-4-20250514');
    });

    it('task.model null and agent.model null falls to driver', () => {
      const result = resolveModel(
        { model: null },
        { model: null },
        driver,
      );
      expect(result).toBe('claude-haiku-3-20250514');
    });
  });

  // --- empty string treated as unset ---

  describe('empty string treated as unset', () => {
    it('empty string at task level falls to agent (AC #6)', () => {
      const result = resolveModel(
        { model: '' },
        { model: 'claude-sonnet-4-20250514' },
        driver,
      );
      expect(result).toBe('claude-sonnet-4-20250514');
    });

    it('empty string at agent level falls to driver', () => {
      const result = resolveModel(
        {},
        { model: '' },
        driver,
      );
      expect(result).toBe('claude-haiku-3-20250514');
    });

    it('empty strings at both task and agent levels fall to driver', () => {
      const result = resolveModel(
        { model: '' },
        { model: '' },
        driver,
      );
      expect(result).toBe('claude-haiku-3-20250514');
    });

    it('whitespace-only task model falls to agent', () => {
      const result = resolveModel(
        { model: '   ' },
        { model: 'claude-sonnet-4-20250514' },
        driver,
      );
      expect(result).toBe('claude-sonnet-4-20250514');
    });

    it('whitespace-only agent model falls to driver', () => {
      const result = resolveModel(
        {},
        { model: '  \t  ' },
        driver,
      );
      expect(result).toBe('claude-haiku-3-20250514');
    });

    it('whitespace-only at both levels falls to driver', () => {
      const result = resolveModel(
        { model: ' ' },
        { model: ' ' },
        driver,
      );
      expect(result).toBe('claude-haiku-3-20250514');
    });

    it('model strings are trimmed', () => {
      const result = resolveModel(
        { model: '  claude-opus-4-20250514  ' },
        {},
        driver,
      );
      expect(result).toBe('claude-opus-4-20250514');
    });
  });

  // --- driver default empty string throws ---

  describe('driver default validation (AC #7)', () => {
    it('throws when driver.defaultModel is empty string', () => {
      expect(() => resolveModel({}, {}, { defaultModel: '' })).toThrow(
        'Driver has no default model',
      );
    });

    it('error message is descriptive', () => {
      expect(() => resolveModel({}, {}, { defaultModel: '' })).toThrow(
        /driver\.defaultModel must be a non-empty string/,
      );
    });

    it('throws when driver.defaultModel is whitespace-only', () => {
      expect(() => resolveModel({}, {}, { defaultModel: '   ' })).toThrow(
        'Driver has no default model',
      );
    });

    it('does NOT throw when task provides a model (even with empty driver default)', () => {
      // Per architecture Decision 4: task.model ?? agent.model ?? driver.defaultModel
      // Driver validation only happens when actually falling through to driver default.
      const result = resolveModel({ model: 'x' }, {}, { defaultModel: '' });
      expect(result).toBe('x');
    });

    it('does NOT throw when agent provides a model (even with empty driver default)', () => {
      const result = resolveModel({}, { model: 'y' }, { defaultModel: '' });
      expect(result).toBe('y');
    });
  });

  // --- return type ---

  describe('return type', () => {
    it('always returns a string', () => {
      const r1 = resolveModel({ model: 'a' }, {}, driver);
      const r2 = resolveModel({}, { model: 'b' }, driver);
      const r3 = resolveModel({}, {}, driver);
      expect(typeof r1).toBe('string');
      expect(typeof r2).toBe('string');
      expect(typeof r3).toBe('string');
    });
  });

  // --- barrel re-export (AC #8) ---

  describe('barrel re-export', () => {
    it('resolveModel is re-exported from agents/index.ts', () => {
      expect(barrelResolveModel).toBe(resolveModel);
    });

    it('barrel re-export works correctly', () => {
      const result = barrelResolveModel(
        { model: 'opus' },
        { model: 'sonnet' },
        { defaultModel: 'haiku' },
      );
      expect(result).toBe('opus');
    });
  });
});
