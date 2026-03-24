import { describe, it, expect } from 'vitest';
import {
  parseRetroSections,
  normalizeText,
  wordOverlap,
  isDuplicate,
} from '../retro-parser.js';

// ─── parseRetroSections ─────────────────────────────────────────────────

describe('parseRetroSections', () => {
  it('parses Fix Now items from retro content', () => {
    const content = `
## 6. Action Items

### Fix Now (Before Next Session)
- Fix bare catch blocks in registry.ts (line 73)
- Update init-project to persist multi-stacks
`;
    const items = parseRetroSections(content);
    const fixNow = items.filter(i => i.section === 'fix-now');
    expect(fixNow).toHaveLength(2);
    expect(fixNow[0].text).toBe('Fix bare catch blocks in registry.ts (line 73)');
    expect(fixNow[1].text).toBe('Update init-project to persist multi-stacks');
  });

  it('parses Fix Soon items from retro content', () => {
    const content = `
## 6. Action Items

### Fix Soon (Next Sprint)
1. Add element type checking to isValidState()
2. Unit test recoverCorruptedState() recovery paths
`;
    const items = parseRetroSections(content);
    const fixSoon = items.filter(i => i.section === 'fix-soon');
    expect(fixSoon).toHaveLength(2);
    expect(fixSoon[0].text).toBe('Add element type checking to isValidState()');
    expect(fixSoon[1].text).toBe('Unit test recoverCorruptedState() recovery paths');
  });

  it('parses Backlog items from retro content', () => {
    const content = `
## 6. Action Items

### Backlog (Track But Not Urgent)
- Remove StackDetection type duplication
- Address pre-existing TS compilation errors
`;
    const items = parseRetroSections(content);
    const backlog = items.filter(i => i.section === 'backlog');
    expect(backlog).toHaveLength(2);
    expect(backlog[0].text).toBe('Remove StackDetection type duplication');
  });

  it('handles varying header formats (with/without parenthetical suffixes)', () => {
    const content = `
## 6. Action Items

#### Fix Now
- Item A

### Fix Soon (Next Sprint / Next Session)
- Item B

### Backlog (Escalated Priority)
- Item C
`;
    const items = parseRetroSections(content);
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({ section: 'fix-now', text: 'Item A' });
    expect(items[1]).toEqual({ section: 'fix-soon', text: 'Item B' });
    expect(items[2]).toEqual({ section: 'backlog', text: 'Item C' });
  });

  it('parses all sections together from a complete retro', () => {
    const content = `
## 6. Action Items

### Fix Now (Before Next Session)
- Fix bare catch blocks in registry.ts (line 73)
- Update init-project to persist multi-stacks

### Fix Soon (Next Sprint)
1. Add element type checking to isValidState()

### Backlog (Track But Not Urgent)
- Remove StackDetection type duplication
`;
    const items = parseRetroSections(content);
    expect(items).toHaveLength(4);
    expect(items.filter(i => i.section === 'fix-now')).toHaveLength(2);
    expect(items.filter(i => i.section === 'fix-soon')).toHaveLength(1);
    expect(items.filter(i => i.section === 'backlog')).toHaveLength(1);
  });

  it('returns empty array when no action items section exists', () => {
    const content = `# Retrospective\n\n## What Went Well\n- Everything.\n`;
    expect(parseRetroSections(content)).toEqual([]);
  });

  it('returns empty array for empty content', () => {
    expect(parseRetroSections('')).toEqual([]);
  });

  it('stops parsing at the next ## section', () => {
    const content = `
## 6. Action Items

### Fix Now
- Item A

## 7. Next Steps

### Fix Now
- Should not be parsed
`;
    const items = parseRetroSections(content);
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe('Item A');
  });
});

// ─── normalizeText ──────────────────────────────────────────────────────

describe('normalizeText', () => {
  it('lowercases and splits into words', () => {
    expect(normalizeText('Fix Bare Catch')).toEqual(['fix', 'bare', 'catch']);
  });

  it('removes punctuation', () => {
    expect(normalizeText('registry.ts (line 73)')).toEqual(['registryts', 'line', '73']);
  });

  it('returns empty array for empty string', () => {
    expect(normalizeText('')).toEqual([]);
  });

  it('handles strings with only punctuation', () => {
    expect(normalizeText('...')).toEqual([]);
  });
});

// ─── wordOverlap ────────────────────────────────────────────────────────

describe('wordOverlap', () => {
  it('returns 1 for identical word arrays', () => {
    expect(wordOverlap(['fix', 'catch'], ['fix', 'catch'])).toBe(1);
  });

  it('returns 0 for no overlap', () => {
    expect(wordOverlap(['foo', 'bar'], ['baz', 'qux'])).toBe(0);
  });

  it('returns 0 when either array is empty', () => {
    expect(wordOverlap([], ['a'])).toBe(0);
    expect(wordOverlap(['a'], [])).toBe(0);
  });

  it('uses min denominator for partial overlap', () => {
    // a=[fix, catch, blocks], b=[fix, catch] -> intersection=2, min=2 -> 1.0
    expect(wordOverlap(['fix', 'catch', 'blocks'], ['fix', 'catch'])).toBe(1);
  });

  it('computes fractional overlap correctly', () => {
    // a=[a, b, c, d], b=[a, b, x, y] -> intersection=2, min=4 -> 0.5
    expect(wordOverlap(['a', 'b', 'c', 'd'], ['a', 'b', 'x', 'y'])).toBe(0.5);
  });

  it('handles duplicate words without exceeding 1.0', () => {
    // Duplicate words in input should not inflate overlap beyond 1.0
    expect(wordOverlap(['fix', 'fix', 'fix'], ['fix'])).toBe(1);
    expect(wordOverlap(['fix', 'fix'], ['fix', 'fix'])).toBe(1);
  });

  it('deduplicates words before computing overlap', () => {
    // a=['a','a','b'], b=['a','c'] -> setA={a,b} setB={a,c} -> intersection=1, min=2 -> 0.5
    expect(wordOverlap(['a', 'a', 'b'], ['a', 'c'])).toBe(0.5);
  });
});

// ─── isDuplicate ────────────────────────────────────────────────────────

describe('isDuplicate', () => {
  it('detects exact match (100% overlap)', () => {
    const result = isDuplicate('Fix bare catch blocks', ['fix bare catch blocks']);
    expect(result.duplicate).toBe(true);
    expect(result.matchedTitle).toBe('fix bare catch blocks');
  });

  it('detects slight variation (85%+ overlap)', () => {
    // "Fix bare catch blocks in registry" vs "fix bare catch blocks in registryts"
    // Both normalize similarly; enough overlap
    const result = isDuplicate(
      'Fix bare catch blocks in registry',
      ['fix bare catch blocks in registry ts'],
    );
    expect(result.duplicate).toBe(true);
  });

  it('rejects clearly different items (< 80% overlap)', () => {
    const result = isDuplicate(
      'Add unit tests for scanner module',
      ['Fix bare catch blocks in registry'],
    );
    expect(result.duplicate).toBe(false);
  });

  it('returns false for empty existing titles', () => {
    const result = isDuplicate('Some item', []);
    expect(result.duplicate).toBe(false);
  });

  it('supports custom threshold', () => {
    const result = isDuplicate(
      'Fix catch blocks',
      ['fix catch blocks extra words here'],
      0.5,
    );
    expect(result.duplicate).toBe(true);
  });
});
