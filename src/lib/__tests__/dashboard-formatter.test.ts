import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DashboardFormatter, formatElapsed } from '../dashboard-formatter.js';

describe('formatElapsed', () => {
  it('formats seconds only when under 1 minute', () => {
    expect(formatElapsed(0)).toBe('0s');
    expect(formatElapsed(5000)).toBe('5s');
    expect(formatElapsed(59000)).toBe('59s');
  });

  it('formats minutes and seconds', () => {
    expect(formatElapsed(60000)).toBe('1m 0s');
    expect(formatElapsed(90000)).toBe('1m 30s');
    expect(formatElapsed(125000)).toBe('2m 5s');
  });

  it('handles large values', () => {
    expect(formatElapsed(3600000)).toBe('60m 0s');
  });

  it('clamps negative values to 0s', () => {
    expect(formatElapsed(-5000)).toBe('0s');
    expect(formatElapsed(-1)).toBe('0s');
  });
});

describe('DashboardFormatter', () => {
  let formatter: DashboardFormatter;

  beforeEach(() => {
    formatter = new DashboardFormatter();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('formatLine', () => {
    // --- Suppression ---

    it('suppresses [DEBUG] lines', () => {
      expect(formatter.formatLine('[2025-01-15 10:30:00] [DEBUG] Loading config...')).toBeNull();
    });

    it('suppresses empty lines', () => {
      expect(formatter.formatLine('')).toBeNull();
      expect(formatter.formatLine('   ')).toBeNull();
    });

    it('suppresses [INFO] Plugin: noise', () => {
      expect(formatter.formatLine('[2025-01-15 10:30:00] [INFO] Plugin: /path/to/.claude')).toBeNull();
    });

    it('suppresses [INFO] Starting ... noise', () => {
      expect(formatter.formatLine('[2025-01-15 10:30:00] [INFO] Starting claude (timeout: 30m)...')).toBeNull();
    });

    it('suppresses [INFO] Sleeping noise', () => {
      expect(formatter.formatLine('[2025-01-15 10:30:00] [INFO] Sleeping for 60 seconds until next hour...')).toBeNull();
    });

    // --- Story completion (AC #2) ---

    it('formats [SUCCESS] Story DONE as checkmark line', () => {
      const line = '[2025-01-15 10:30:00] [SUCCESS] Story 1-1-foo: DONE';
      expect(formatter.formatLine(line)).toBe('\u2713 Story 1-1-foo: DONE');
    });

    it('formats [SUCCESS] Story DONE with title', () => {
      const line = '[2025-01-15 10:30:00] [SUCCESS] Story 1-1-foo: DONE — Some Title [proof: verification/1-1-foo-proof.md]';
      expect(formatter.formatLine(line)).toBe('\u2713 Story 1-1-foo: DONE (Some Title [proof: verification/1-1-foo-proof.md])');
    });

    it('formats [SUCCESS] Story DONE with proof only', () => {
      const line = '[2025-01-15 10:30:00] [SUCCESS] Story 1-1-foo: DONE [proof: verification/1-1-foo-proof.md]';
      expect(formatter.formatLine(line)).toBe('\u2713 Story 1-1-foo: DONE ([proof: verification/1-1-foo-proof.md])');
    });

    it('clears current story state on completion', () => {
      // Set up state first
      formatter.formatLine('[2025-01-15 10:30:00] [INFO] Story 1-1-foo: dev (coding)');
      expect(formatter.getCurrentStory()).toBe('1-1-foo');

      // Complete story
      formatter.formatLine('[2025-01-15 10:30:00] [SUCCESS] Story 1-1-foo: DONE');
      expect(formatter.getCurrentStory()).toBeNull();
      expect(formatter.getCurrentPhase()).toBeNull();
    });

    // --- Story failure (AC #3) ---

    it('formats [ERROR] with story failure icon', () => {
      const line = '[2025-01-15 10:30:00] [ERROR] \u2717 1-1-foo';
      const result = formatter.formatLine(line);
      expect(result).toBe('\u2717 1-1-foo');
    });

    it('formats [WARN] Story exceeded retry limit as failure', () => {
      const line = '[2025-01-15 10:30:00] [WARN] Story 1-1-foo exceeded retry limit (3) \u2014 flagging and moving on';
      expect(formatter.formatLine(line)).toBe('\u2717 Story 1-1-foo: FAIL \u2014 exceeded retry limit');
    });

    it('formats [WARN] Story retry as progress', () => {
      const line = '[2025-01-15 10:30:00] [WARN] Story 1-1-foo \u2014 retry 2/3';
      expect(formatter.formatLine(line)).toBe('\u25c6 Story 1-1-foo: retry 2/3');
    });

    // --- Sprint summary (AC #1) ---

    it('formats [INFO] Sprint: as diamond line', () => {
      const line = '[2025-01-15 10:30:00] [INFO] Sprint: 5/12 done, 7 remaining \u2014 next: 1-2-bar (backlog)';
      expect(formatter.formatLine(line)).toBe('\u25c6 Sprint: 5/12 done, 7 remaining \u2014 next: 1-2-bar (backlog)');
    });

    it('formats [INFO] Progress: as diamond line', () => {
      const line = '[2025-01-15 10:30:00] [INFO] Progress: 3/10 done, 7 remaining (iterations: 5, elapsed: 1h 23m, cost: $4.52)';
      expect(formatter.formatLine(line)).toBe('\u25c6 Progress: 3/10 done, 7 remaining (iterations: 5, elapsed: 1h 23m, cost: $4.52)');
    });

    it('formats [INFO] Next up: as diamond line', () => {
      const line = '[2025-01-15 10:30:00] [INFO] Next up: 1-2-bar';
      expect(formatter.formatLine(line)).toBe('\u25c6 Next: 1-2-bar');
    });

    // --- Phase tracking (internal state for ticker) ---

    it('suppresses [INFO] Story phase lines but updates state', () => {
      const line = '[2025-01-15 10:30:00] [INFO] Story 1-1-foo: dev (coding)';
      expect(formatter.formatLine(line)).toBeNull();
      expect(formatter.getCurrentStory()).toBe('1-1-foo');
      expect(formatter.getCurrentPhase()).toBe('dev (coding)');
    });

    it('suppresses [INFO] Story AC progress lines but updates state', () => {
      const line = '[2025-01-15 10:30:00] [INFO] Story 1-1-foo: verify (AC 3/5)';
      expect(formatter.formatLine(line)).toBeNull();
      expect(formatter.getCurrentStory()).toBe('1-1-foo');
      expect(formatter.getCurrentPhase()).toBe('verify (AC 3/5)');
    });

    it('updates phase without detail', () => {
      const line = '[2025-01-15 10:30:00] [INFO] Story 1-1-foo: create';
      expect(formatter.formatLine(line)).toBeNull();
      expect(formatter.getCurrentPhase()).toBe('create');
    });

    // --- Pass-through lines ---

    it('formats [LOOP] lines as diamond', () => {
      const line = '[2025-01-15 10:30:00] [LOOP] Iteration 3 \u2014 Task: harness-run';
      expect(formatter.formatLine(line)).toBe('\u25c6 Iteration 3 \u2014 Task: harness-run');
    });

    it('formats [WARN] generic lines with ! prefix', () => {
      const line = '[2025-01-15 10:30:00] [WARN] Circuit breaker opened \u2014 halting execution';
      expect(formatter.formatLine(line)).toBe('! Circuit breaker opened \u2014 halting execution');
    });

    it('formats [SUCCESS] Ralph loop starting', () => {
      const line = '[2025-01-15 10:30:00] [SUCCESS] Ralph loop starting';
      expect(formatter.formatLine(line)).toBe('--- Ralph loop starting ---');
    });

    it('formats [SUCCESS] All stories complete', () => {
      const line = '[2025-01-15 10:30:00] [SUCCESS] All stories complete. 10 stories verified in 5 iterations.';
      expect(formatter.formatLine(line)).toBe('\u2713 All stories complete. 10 stories verified in 5 iterations.');
    });

    it('formats [ERROR] generic lines with cross', () => {
      const line = '[2025-01-15 10:30:00] [ERROR] claude execution failed (exit code: 1)';
      expect(formatter.formatLine(line)).toBe('\u2717 claude execution failed (exit code: 1)');
    });

    it('passes through session markers', () => {
      const line = '[2025-01-15 10:30:00] [INFO] \u2501\u2501\u2501 Session Issues (3 entries) \u2501\u2501\u2501';
      expect(formatter.formatLine(line)).toBe('\u2501\u2501\u2501 Session Issues (3 entries) \u2501\u2501\u2501');
    });

    // --- ANSI stripping ---

    it('strips ANSI color codes before parsing', () => {
      const line = '\x1b[32m[2025-01-15 10:30:00] [SUCCESS] Story 1-1-foo: DONE\x1b[0m';
      expect(formatter.formatLine(line)).toBe('\u2713 Story 1-1-foo: DONE');
    });

    // --- Backward compatibility ---

    it('passes through unrecognized bracketed lines unchanged', () => {
      const line = '[CUSTOM] Something unexpected';
      expect(formatter.formatLine(line)).toBe('[CUSTOM] Something unexpected');
    });

    it('passes through raw text without level prefix', () => {
      const line = 'Some raw output from ralph';
      expect(formatter.formatLine(line)).toBe('Some raw output from ralph');
    });
  });

  describe('getTickerLine', () => {
    it('returns null when no story is active', () => {
      expect(formatter.getTickerLine()).toBeNull();
    });

    it('returns formatted ticker line when story is active (AC #5)', () => {
      vi.setSystemTime(new Date('2025-01-15T10:30:00Z'));

      // Set up story phase
      formatter.formatLine('[2025-01-15 10:30:00] [INFO] Story 1-1-foo: dev (coding)');

      // Advance time by 35 seconds
      vi.setSystemTime(new Date('2025-01-15T10:30:35Z'));

      const ticker = formatter.getTickerLine();
      expect(ticker).toBe('\u25c6 1-1-foo \u2014 dev (coding) (elapsed 35s)');
    });

    it('shows minutes and seconds for longer elapsed', () => {
      vi.setSystemTime(new Date('2025-01-15T10:30:00Z'));

      formatter.formatLine('[2025-01-15 10:30:00] [INFO] Story 1-1-foo: verify');

      // Advance time by 2 minutes 15 seconds
      vi.setSystemTime(new Date('2025-01-15T10:32:15Z'));

      const ticker = formatter.getTickerLine();
      expect(ticker).toBe('\u25c6 1-1-foo \u2014 verify (elapsed 2m 15s)');
    });

    it('returns null after story completion', () => {
      vi.setSystemTime(new Date('2025-01-15T10:30:00Z'));

      formatter.formatLine('[2025-01-15 10:30:00] [INFO] Story 1-1-foo: dev');
      expect(formatter.getTickerLine()).not.toBeNull();

      formatter.formatLine('[2025-01-15 10:30:00] [SUCCESS] Story 1-1-foo: DONE');
      expect(formatter.getTickerLine()).toBeNull();
    });

    it('resets timer when story changes', () => {
      vi.setSystemTime(new Date('2025-01-15T10:30:00Z'));
      formatter.formatLine('[2025-01-15 10:30:00] [INFO] Story 1-1-foo: dev');

      vi.setSystemTime(new Date('2025-01-15T10:31:00Z'));
      formatter.formatLine('[2025-01-15 10:31:00] [INFO] Story 1-2-bar: create');

      vi.setSystemTime(new Date('2025-01-15T10:31:10Z'));

      const ticker = formatter.getTickerLine();
      expect(ticker).toBe('\u25c6 1-2-bar \u2014 create (elapsed 10s)');
    });

    it('resets timer when phase changes within same story', () => {
      vi.setSystemTime(new Date('2025-01-15T10:30:00Z'));
      formatter.formatLine('[2025-01-15 10:30:00] [INFO] Story 1-1-foo: dev');

      vi.setSystemTime(new Date('2025-01-15T10:31:00Z'));
      formatter.formatLine('[2025-01-15 10:31:00] [INFO] Story 1-1-foo: verify');

      vi.setSystemTime(new Date('2025-01-15T10:31:05Z'));

      const ticker = formatter.getTickerLine();
      expect(ticker).toBe('\u25c6 1-1-foo \u2014 verify (elapsed 5s)');
    });
  });

  describe('reset', () => {
    it('clears all internal state', () => {
      vi.setSystemTime(new Date('2025-01-15T10:30:00Z'));
      formatter.formatLine('[2025-01-15 10:30:00] [INFO] Story 1-1-foo: dev');
      expect(formatter.getCurrentStory()).toBe('1-1-foo');

      formatter.reset();
      expect(formatter.getCurrentStory()).toBeNull();
      expect(formatter.getCurrentPhase()).toBeNull();
      expect(formatter.getTickerLine()).toBeNull();
    });
  });
});
