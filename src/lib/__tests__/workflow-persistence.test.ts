/**
 * Tests for workflow-persistence.ts — snapshot save/load/clear.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { saveSnapshot, loadSnapshot, clearSnapshot } from '../workflow-persistence.js';
import type { WorkflowSnapshot } from '../workflow-persistence.js';
import { getDefaultWorkflowState } from '../workflow-state.js';
import { warn } from '../output.js';

// Mock node:fs
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => ''),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

vi.mock('../output.js', () => ({
  warn: vi.fn(),
  info: vi.fn(),
}));

// ─── Tests ──────────────────────────────────��────────────────────────

describe('workflow-persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('saveSnapshot', () => {
    it('writes JSON to .codeharness/workflow-state.json', () => {
      saveSnapshot({
        workflowState: getDefaultWorkflowState(),
        errors: [],
        tasksCompleted: 0,
        storiesProcessed: 0,
      }, '/tmp/project');

      expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp/project/.codeharness', { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/tmp/project/.codeharness/workflow-state.json',
        expect.stringContaining('"savedAt"'),
        'utf-8',
      );
    });

    it('includes savedAt timestamp', () => {
      saveSnapshot({
        workflowState: getDefaultWorkflowState(),
        errors: [],
        tasksCompleted: 5,
        storiesProcessed: 2,
      }, '/tmp/project');

      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
      expect(written.savedAt).toBeTruthy();
      expect(written.tasksCompleted).toBe(5);
      expect(written.storiesProcessed).toBe(2);
    });
  });

  describe('loadSnapshot', () => {
    it('returns null when file does not exist', () => {
      const result = loadSnapshot('/tmp/project');
      expect(result).toBeNull();
    });

    it('loads valid JSON snapshot', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const snapshot: WorkflowSnapshot = {
        workflowState: getDefaultWorkflowState(),
        errors: [],
        tasksCompleted: 3,
        storiesProcessed: 1,
        savedAt: '2026-01-01T00:00:00Z',
      };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(snapshot));

      const result = loadSnapshot('/tmp/project');
      expect(result).not.toBeNull();
      expect(result!.tasksCompleted).toBe(3);
      expect(result!.savedAt).toBe('2026-01-01T00:00:00Z');
    });

    it('returns null for invalid JSON', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('not json');

      const result = loadSnapshot('/tmp/project');
      expect(result).toBeNull();
    });

    it('returns null for invalid shape', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ foo: 'bar' }));

      const result = loadSnapshot('/tmp/project');
      expect(result).toBeNull();
    });

    it('warns about old YAML state file', () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => String(path).endsWith('.yaml'));

      loadSnapshot('/tmp/project');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('old workflow-state.yaml'));
    });
  });

  describe('clearSnapshot', () => {
    it('deletes the snapshot file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      clearSnapshot('/tmp/project');
      expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/project/.codeharness/workflow-state.json');
    });

    it('does nothing when file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      clearSnapshot('/tmp/project');
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });
  });
});
