import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  applyPatch,
  removePatch,
  hasPatch,
  getPatchMarkers,
} from '../patch-engine.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-patch-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('getPatchMarkers', () => {
  it('returns correct start and end markers', () => {
    const markers = getPatchMarkers('story-verification');
    expect(markers.start).toBe('<!-- CODEHARNESS-PATCH-START:story-verification -->');
    expect(markers.end).toBe('<!-- CODEHARNESS-PATCH-END:story-verification -->');
  });

  it('uses the patch name in markers', () => {
    const markers = getPatchMarkers('dev-enforcement');
    expect(markers.start).toContain('dev-enforcement');
    expect(markers.end).toContain('dev-enforcement');
  });

  it('rejects patch names with invalid characters', () => {
    expect(() => getPatchMarkers('bad name')).toThrow('Invalid patch name');
    expect(() => getPatchMarkers('bad-->name')).toThrow('Invalid patch name');
    expect(() => getPatchMarkers('../traversal')).toThrow('Invalid patch name');
    expect(() => getPatchMarkers('')).toThrow('Invalid patch name');
    expect(() => getPatchMarkers('UPPERCASE')).toThrow('Invalid patch name');
  });

  it('accepts valid kebab-case patch names', () => {
    expect(() => getPatchMarkers('story-verification')).not.toThrow();
    expect(() => getPatchMarkers('patch-1')).not.toThrow();
    expect(() => getPatchMarkers('simple')).not.toThrow();
  });
});

describe('applyPatch', () => {
  it('applies patch with correct markers to file without existing patch', () => {
    const filePath = join(testDir, 'workflow.md');
    writeFileSync(filePath, '# Workflow\n\nSome content.\n');

    const result = applyPatch(filePath, 'test-patch', 'Patch content here');

    expect(result.applied).toBe(true);
    expect(result.updated).toBe(false);

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('<!-- CODEHARNESS-PATCH-START:test-patch -->');
    expect(content).toContain('Patch content here');
    expect(content).toContain('<!-- CODEHARNESS-PATCH-END:test-patch -->');
  });

  it('updates content between existing markers (idempotent update)', () => {
    const filePath = join(testDir, 'workflow.md');
    writeFileSync(filePath, [
      '# Workflow',
      '',
      '<!-- CODEHARNESS-PATCH-START:test-patch -->',
      'Old content',
      '<!-- CODEHARNESS-PATCH-END:test-patch -->',
      '',
      'After patch.',
    ].join('\n'));

    const result = applyPatch(filePath, 'test-patch', 'New content');

    expect(result.applied).toBe(true);
    expect(result.updated).toBe(true);

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('New content');
    expect(content).not.toContain('Old content');
    expect(content).toContain('After patch.');
  });

  it('applying same patch twice produces identical output (idempotency)', () => {
    const filePath = join(testDir, 'workflow.md');
    writeFileSync(filePath, '# Workflow\n\nSome content.\n');

    applyPatch(filePath, 'test-patch', 'Patch content');
    const afterFirst = readFileSync(filePath, 'utf-8');

    applyPatch(filePath, 'test-patch', 'Patch content');
    const afterSecond = readFileSync(filePath, 'utf-8');

    expect(afterSecond).toBe(afterFirst);
  });

  it('preserves content before and after insertion point', () => {
    const filePath = join(testDir, 'workflow.md');
    writeFileSync(filePath, '# Header\n\nBody content.\n');

    applyPatch(filePath, 'test-patch', 'Injected');

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('# Header');
    expect(content).toContain('Body content.');
    expect(content).toContain('Injected');
  });

  it('throws on corrupted marker ordering (end before start)', () => {
    const filePath = join(testDir, 'workflow.md');
    writeFileSync(filePath, [
      '# Workflow',
      '',
      '<!-- CODEHARNESS-PATCH-END:test-patch -->',
      'Content',
      '<!-- CODEHARNESS-PATCH-START:test-patch -->',
    ].join('\n'));

    expect(() => applyPatch(filePath, 'test-patch', 'New content')).toThrow('Corrupted patch markers');
  });

  it('handles multiple different patches in the same file', () => {
    const filePath = join(testDir, 'workflow.md');
    writeFileSync(filePath, '# Workflow\n');

    applyPatch(filePath, 'patch-a', 'Content A');
    applyPatch(filePath, 'patch-b', 'Content B');

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('<!-- CODEHARNESS-PATCH-START:patch-a -->');
    expect(content).toContain('Content A');
    expect(content).toContain('<!-- CODEHARNESS-PATCH-START:patch-b -->');
    expect(content).toContain('Content B');
  });
});

describe('removePatch', () => {
  it('removes patch and markers from file', () => {
    const filePath = join(testDir, 'workflow.md');
    writeFileSync(filePath, [
      '# Workflow',
      '',
      '<!-- CODEHARNESS-PATCH-START:test-patch -->',
      'Patch content',
      '<!-- CODEHARNESS-PATCH-END:test-patch -->',
      '',
      'After.',
    ].join('\n'));

    const result = removePatch(filePath, 'test-patch');

    expect(result).toBe(true);
    const content = readFileSync(filePath, 'utf-8');
    expect(content).not.toContain('CODEHARNESS-PATCH');
    expect(content).not.toContain('Patch content');
    expect(content).toContain('# Workflow');
    expect(content).toContain('After.');
  });

  it('returns false when patch does not exist', () => {
    const filePath = join(testDir, 'workflow.md');
    writeFileSync(filePath, '# No patches here.\n');

    const result = removePatch(filePath, 'nonexistent');
    expect(result).toBe(false);
  });

  it('returns false when only start marker exists', () => {
    const filePath = join(testDir, 'workflow.md');
    writeFileSync(filePath, '<!-- CODEHARNESS-PATCH-START:broken -->\nContent\n');

    const result = removePatch(filePath, 'broken');
    expect(result).toBe(false);
  });

  it('throws on corrupted marker ordering (end before start)', () => {
    const filePath = join(testDir, 'workflow.md');
    writeFileSync(filePath, [
      '<!-- CODEHARNESS-PATCH-END:test-patch -->',
      'Content',
      '<!-- CODEHARNESS-PATCH-START:test-patch -->',
    ].join('\n'));

    expect(() => removePatch(filePath, 'test-patch')).toThrow('Corrupted patch markers');
  });
});

describe('hasPatch', () => {
  it('returns true when markers exist', () => {
    const filePath = join(testDir, 'workflow.md');
    writeFileSync(filePath, [
      '<!-- CODEHARNESS-PATCH-START:test-patch -->',
      'content',
      '<!-- CODEHARNESS-PATCH-END:test-patch -->',
    ].join('\n'));

    expect(hasPatch(filePath, 'test-patch')).toBe(true);
  });

  it('returns false when markers do not exist', () => {
    const filePath = join(testDir, 'workflow.md');
    writeFileSync(filePath, '# Just a file\n');

    expect(hasPatch(filePath, 'test-patch')).toBe(false);
  });

  it('returns false when only start marker exists', () => {
    const filePath = join(testDir, 'workflow.md');
    writeFileSync(filePath, '<!-- CODEHARNESS-PATCH-START:test-patch -->\nContent\n');

    expect(hasPatch(filePath, 'test-patch')).toBe(false);
  });

  it('correctly distinguishes between different patch names', () => {
    const filePath = join(testDir, 'workflow.md');
    writeFileSync(filePath, [
      '<!-- CODEHARNESS-PATCH-START:patch-a -->',
      'A',
      '<!-- CODEHARNESS-PATCH-END:patch-a -->',
    ].join('\n'));

    expect(hasPatch(filePath, 'patch-a')).toBe(true);
    expect(hasPatch(filePath, 'patch-b')).toBe(false);
  });
});
