import { describe, it, expect } from 'vitest';
import {
  parseRetroActionItems,
  classifyFinding,
  derivePriority,
} from '../retro-parser.js';
import type { RetroActionItem } from '../retro-parser.js';

// ─── parseRetroActionItems ──────────────────────────────────────────────

describe('parseRetroActionItems', () => {
  it('parses action items from a real retro table format', () => {
    const content = `
## Epic 8 Retro Action Item Status

| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Cover run.ts action handler (lines 110-276) | Not done | Permanent technical debt. |
| A2 | Raise scanner.ts branch coverage from 74.1% to 90%+ | Not done | Permanent technical debt. |
| A3 | Raise overall branch coverage from 82.32% to 85%+ | Regressed | Was at 85.09% after Epic 8, dropped to 81.20% after Epic 9. |

**Summary:** 0 of 3 action items resolved.
`;

    const items = parseRetroActionItems(content);
    expect(items).toHaveLength(3);

    expect(items[0]).toEqual({
      number: 'A1',
      description: 'Cover run.ts action handler (lines 110-276)',
      status: 'Not done',
      notes: 'Permanent technical debt.',
    });

    expect(items[1]).toEqual({
      number: 'A2',
      description: 'Raise scanner.ts branch coverage from 74.1% to 90%+',
      status: 'Not done',
      notes: 'Permanent technical debt.',
    });

    expect(items[2]).toEqual({
      number: 'A3',
      description: 'Raise overall branch coverage from 82.32% to 85%+',
      status: 'Regressed',
      notes: 'Was at 85.09% after Epic 8, dropped to 81.20% after Epic 9.',
    });
  });

  it('returns empty array when no action items table exists', () => {
    const content = `
# Epic 5 Retrospective

## What Went Well

Everything was great.

## Lessons Learned

We learned a lot.
`;
    const items = parseRetroActionItems(content);
    expect(items).toEqual([]);
  });

  it('returns empty array for empty content', () => {
    expect(parseRetroActionItems('')).toEqual([]);
  });

  it('handles table with only header and separator (no data rows)', () => {
    const content = `
| # | Action | Status | Notes |
|---|--------|--------|-------|
`;
    const items = parseRetroActionItems(content);
    expect(items).toEqual([]);
  });

  it('skips rows with fewer than 4 columns', () => {
    const content = `
| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Valid item | Done | Works. |
| A2 | Only two cols |
| A3 | Another valid | Not done | Keep. |
`;
    const items = parseRetroActionItems(content);
    expect(items).toHaveLength(2);
    expect(items[0].number).toBe('A1');
    expect(items[1].number).toBe('A3');
  });

  it('ignores rows with non-alphanumeric item numbers', () => {
    const content = `
| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Valid item | Done | Works. |
| -- | Invalid row | N/A | Skip this. |
| A2 | Another valid | Not done | Keep. |
`;
    const items = parseRetroActionItems(content);
    expect(items).toHaveLength(2);
    expect(items[0].number).toBe('A1');
    expect(items[1].number).toBe('A2');
  });

  it('handles a single action item', () => {
    const content = `
| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Single item | Done | Only one. |
`;
    const items = parseRetroActionItems(content);
    expect(items).toHaveLength(1);
    expect(items[0].number).toBe('A1');
    expect(items[0].description).toBe('Single item');
  });
});

// ─── classifyFinding ────────────────────────────────────────────────────

describe('classifyFinding', () => {
  function makeItem(description: string): RetroActionItem {
    return { number: 'A1', description, status: 'Not done', notes: '' };
  }

  it('classifies items mentioning "harness" as harness', () => {
    const result = classifyFinding(makeItem('Fix harness initialization bug'));
    expect(result).toEqual({ type: 'harness' });
  });

  it('classifies items mentioning "codeharness" as harness', () => {
    const result = classifyFinding(makeItem('Run codeharness sync after completion'));
    expect(result).toEqual({ type: 'harness' });
  });

  it('classifies items mentioning "harness" case-insensitively', () => {
    const result = classifyFinding(makeItem('Update HARNESS config'));
    expect(result).toEqual({ type: 'harness' });
  });

  it('classifies items mentioning "showboat" as tool:showboat', () => {
    const result = classifyFinding(makeItem('Fix showboat verification flow'));
    expect(result).toEqual({ type: 'tool', name: 'showboat' });
  });

  it('classifies items mentioning "ralph" as tool:ralph', () => {
    const result = classifyFinding(makeItem('Improve ralph loop timing'));
    expect(result).toEqual({ type: 'tool', name: 'ralph' });
  });

  it('classifies items mentioning "beads" as tool:beads', () => {
    const result = classifyFinding(makeItem('Wire beads issue sync'));
    expect(result).toEqual({ type: 'tool', name: 'beads' });
  });

  it('classifies items mentioning "bmad" as tool:bmad', () => {
    const result = classifyFinding(makeItem('Update bmad workflow patches'));
    expect(result).toEqual({ type: 'tool', name: 'bmad' });
  });

  it('classifies generic items as project', () => {
    const result = classifyFinding(makeItem('Cover run.ts action handler (lines 110-276)'));
    expect(result).toEqual({ type: 'project' });
  });

  it('classifies coverage items without tool names as project', () => {
    const result = classifyFinding(makeItem('Raise scanner.ts branch coverage from 74.1% to 90%+'));
    expect(result).toEqual({ type: 'project' });
  });

  it('prioritizes harness over tool matches', () => {
    // "codeharness" contains "harness" and should match first
    const result = classifyFinding(makeItem('Fix codeharness beads integration'));
    expect(result).toEqual({ type: 'harness' });
  });
});

// ─── derivePriority ─────────────────────────────────────────────────────

describe('derivePriority', () => {
  it('returns priority 1 for regressed items', () => {
    const item: RetroActionItem = {
      number: 'A3',
      description: 'Coverage target',
      status: 'Regressed',
      notes: 'Dropped below target.',
    };
    expect(derivePriority(item)).toBe(1);
  });

  it('returns priority 1 for urgent items', () => {
    const item: RetroActionItem = {
      number: 'A1',
      description: 'Something',
      status: 'Not done',
      notes: 'Urgent fix needed.',
    };
    expect(derivePriority(item)).toBe(1);
  });

  it('returns priority 1 for critical items', () => {
    const item: RetroActionItem = {
      number: 'A1',
      description: 'Something',
      status: 'Not done',
      notes: 'Critical path blocker.',
    };
    expect(derivePriority(item)).toBe(1);
  });

  it('returns priority 2 for standard not-done items', () => {
    const item: RetroActionItem = {
      number: 'A1',
      description: 'Standard item',
      status: 'Not done',
      notes: 'Permanent technical debt.',
    };
    expect(derivePriority(item)).toBe(2);
  });

  it('returns priority 2 for done items', () => {
    const item: RetroActionItem = {
      number: 'A1',
      description: 'Completed item',
      status: 'Done',
      notes: 'Finished.',
    };
    expect(derivePriority(item)).toBe(2);
  });
});
