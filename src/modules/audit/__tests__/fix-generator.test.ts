import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node:fs
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// Mock sprint state module
vi.mock('../../sprint/index.js', () => ({
  getSprintState: vi.fn(),
  writeStateAtomic: vi.fn(),
  computeSprintCounts: vi.fn(),
}));

import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import {
  getSprintState,
  writeStateAtomic,
  computeSprintCounts,
} from '../../sprint/index.js';
import {
  generateFixStories,
  addFixStoriesToState,
  buildStoryKey,
  buildStoryMarkdown,
} from '../fix-generator.js';
import type { AuditResult, AuditGap } from '../types.js';

const mockExistsSync = vi.mocked(existsSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockGetSprintState = vi.mocked(getSprintState);
const mockWriteStateAtomic = vi.mocked(writeStateAtomic);
const mockComputeSprintCounts = vi.mocked(computeSprintCounts);

function makeGap(dimension: string, description: string, suggestedFix: string): AuditGap {
  return { dimension, description, suggestedFix };
}

function makeAuditResult(gaps: Record<string, AuditGap[]>): AuditResult {
  const dimensions: AuditResult['dimensions'] = {};
  let gapCount = 0;

  for (const [name, dimGaps] of Object.entries(gaps)) {
    gapCount += dimGaps.length;
    dimensions[name] = {
      name,
      status: dimGaps.length > 0 ? 'fail' : 'pass',
      metric: `${dimGaps.length} gaps`,
      gaps: dimGaps,
    };
  }

  return {
    dimensions,
    overallStatus: gapCount > 0 ? 'fail' : 'pass',
    gapCount,
    durationMs: 42,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExistsSync.mockReturnValue(false);
});

// ─── buildStoryKey ──────────────────────────────────────────────────────────

describe('buildStoryKey', () => {
  it('generates deterministic key from dimension and index', () => {
    const gap = makeGap('observability', 'Missing logs', 'Add logs');
    expect(buildStoryKey(gap, 1)).toBe('audit-fix-observability-1');
  });

  it('sanitizes dimension name for filesystem safety', () => {
    const gap = makeGap('Code Quality', 'Issue', 'Fix');
    expect(buildStoryKey(gap, 2)).toBe('audit-fix-code-quality-2');
  });

  it('produces same key for same input', () => {
    const gap = makeGap('testing', 'Low coverage', 'Add tests');
    const k1 = buildStoryKey(gap, 1);
    const k2 = buildStoryKey(gap, 1);
    expect(k1).toBe(k2);
  });
});

// ─── buildStoryMarkdown ─────────────────────────────────────────────────────

describe('buildStoryMarkdown', () => {
  it('follows BMAD format with Status: backlog header', () => {
    const gap = makeGap('testing', 'Low coverage in src/lib/docker.ts', 'Add unit tests');
    const md = buildStoryMarkdown(gap, 'audit-fix-testing-1');
    expect(md).toContain('# Fix: testing — Low coverage in src/lib/docker.ts');
    expect(md).toContain('Status: backlog');
  });

  it('includes user story section', () => {
    const gap = makeGap('testing', 'Missing tests', 'Write tests');
    const md = buildStoryMarkdown(gap, 'key');
    expect(md).toContain('## Story');
    expect(md).toContain('As an operator, I need Missing tests fixed so that audit compliance improves.');
  });

  it('includes Given/When/Then acceptance criteria', () => {
    const gap = makeGap('observability', 'No logging', 'Add structured logs');
    const md = buildStoryMarkdown(gap, 'key');
    expect(md).toContain('## Acceptance Criteria');
    expect(md).toContain('**Given**');
    expect(md).toContain('**When**');
    expect(md).toContain('**Then**');
  });

  it('references specific file path from gap description (AC #3)', () => {
    const gap = makeGap(
      'observability',
      'src/lib/docker.ts:42 — Missing error logging',
      'Add error logging at line 42',
    );
    const md = buildStoryMarkdown(gap, 'key');
    expect(md).toContain('src/lib/docker.ts:42 — Missing error logging');
  });

  it('includes Dev Notes with audit gap details', () => {
    const gap = makeGap('testing', 'Low coverage', 'Add tests');
    const md = buildStoryMarkdown(gap, 'key');
    expect(md).toContain('## Dev Notes');
    expect(md).toContain('auto-generated fix story created by `codeharness audit --fix`');
    expect(md).toContain('**Audit Gap:** testing: Low coverage');
    expect(md).toContain('**Suggested Fix:** Add tests');
  });
});

// ─── generateFixStories ────────────────────────────────────────────────────

describe('generateFixStories', () => {
  it('returns empty result with 0 gaps (AC #4)', () => {
    const auditResult = makeAuditResult({ testing: [] });
    const result = generateFixStories(auditResult);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stories).toHaveLength(0);
      expect(result.data.created).toBe(0);
      expect(result.data.skipped).toBe(0);
    }
  });

  it('creates 3 story files for 3 gaps', () => {
    const auditResult = makeAuditResult({
      observability: [
        makeGap('observability', 'Gap A', 'Fix A'),
        makeGap('observability', 'Gap B', 'Fix B'),
      ],
      testing: [
        makeGap('testing', 'Gap C', 'Fix C'),
      ],
    });

    const result = generateFixStories(auditResult);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stories).toHaveLength(3);
      expect(result.data.created).toBe(3);
      expect(result.data.skipped).toBe(0);
      expect(mockWriteFileSync).toHaveBeenCalledTimes(3);
    }
  });

  it('writes story files with BMAD markdown content', () => {
    const auditResult = makeAuditResult({
      testing: [makeGap('testing', 'Low coverage', 'Add tests')],
    });

    generateFixStories(auditResult);

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
    expect(writtenContent).toContain('# Fix: testing — Low coverage');
    expect(writtenContent).toContain('Status: backlog');
  });

  it('creates parent directory before writing', () => {
    const auditResult = makeAuditResult({
      testing: [makeGap('testing', 'Gap', 'Fix')],
    });

    generateFixStories(auditResult);

    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('implementation-artifacts'),
      { recursive: true },
    );
  });

  it('skips existing story files and returns skipped: true (AC #6)', () => {
    mockExistsSync.mockReturnValue(true);

    const auditResult = makeAuditResult({
      testing: [makeGap('testing', 'Gap', 'Fix')],
    });

    const result = generateFixStories(auditResult);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stories).toHaveLength(1);
      expect(result.data.stories[0].skipped).toBe(true);
      expect(result.data.stories[0].skipReason).toBe('Story file already exists');
      expect(result.data.created).toBe(0);
      expect(result.data.skipped).toBe(1);
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    }
  });

  it('story key is deterministic for same gap', () => {
    const auditResult = makeAuditResult({
      testing: [makeGap('testing', 'Gap A', 'Fix A')],
    });

    const r1 = generateFixStories(auditResult);
    const r2 = generateFixStories(auditResult);

    expect(r1.success && r2.success).toBe(true);
    if (r1.success && r2.success) {
      expect(r1.data.stories[0].key).toBe(r2.data.stories[0].key);
    }
  });

  it('returns fail result when writeFileSync throws', () => {
    mockWriteFileSync.mockImplementationOnce(() => {
      throw new Error('EACCES: permission denied');
    });

    const auditResult = makeAuditResult({
      testing: [makeGap('testing', 'Gap', 'Fix')],
    });

    const result = generateFixStories(auditResult);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Failed to generate fix stories');
      expect(result.error).toContain('EACCES: permission denied');
    }
  });

  it('returns fail result when non-Error is thrown', () => {
    mockWriteFileSync.mockImplementationOnce(() => {
      throw 'string error';
    });

    const auditResult = makeAuditResult({
      testing: [makeGap('testing', 'Gap', 'Fix')],
    });

    const result = generateFixStories(auditResult);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('string error');
    }
  });

  it('handles mixed created and skipped stories', () => {
    // First gap file exists, second does not
    mockExistsSync
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    const auditResult = makeAuditResult({
      testing: [
        makeGap('testing', 'Gap A', 'Fix A'),
        makeGap('testing', 'Gap B', 'Fix B'),
      ],
    });

    const result = generateFixStories(auditResult);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.created).toBe(1);
      expect(result.data.skipped).toBe(1);
      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    }
  });
});

// ─── addFixStoriesToState ───────────────────────────────────────────────────

describe('addFixStoriesToState', () => {
  const defaultState = {
    version: 1 as const,
    sprint: { total: 0, done: 0, failed: 0, blocked: 0, inProgress: null },
    stories: {},
    run: {
      active: false,
      startedAt: null,
      iteration: 0,
      cost: 0,
      completed: [],
      failed: [],
      currentStory: null,
      currentPhase: null,
      lastAction: null,
      acProgress: null,
    },
    actionItems: [],
  };

  beforeEach(() => {
    mockGetSprintState.mockReturnValue({ success: true, data: { ...defaultState } });
    mockWriteStateAtomic.mockReturnValue({ success: true, data: undefined });
    mockComputeSprintCounts.mockReturnValue({
      total: 2, done: 0, failed: 0, blocked: 0, inProgress: null,
    });
  });

  it('adds stories to sprint-state.json as backlog entries (AC #2)', () => {
    const stories = [
      {
        key: 'audit-fix-testing-1',
        filePath: '/path/to/audit-fix-testing-1.md',
        gap: makeGap('testing', 'Gap', 'Fix'),
        skipped: false,
      },
    ];

    const result = addFixStoriesToState(stories);
    expect(result.success).toBe(true);
    expect(mockWriteStateAtomic).toHaveBeenCalledTimes(1);

    const writtenState = mockWriteStateAtomic.mock.calls[0][0];
    expect(writtenState.stories['audit-fix-testing-1']).toEqual({
      status: 'backlog',
      attempts: 0,
      lastAttempt: null,
      lastError: null,
      proofPath: null,
      acResults: null,
    });
  });

  it('creates default state when sprint-state.json is missing (AC #9)', () => {
    mockGetSprintState.mockReturnValue({ success: true, data: { ...defaultState } });

    const stories = [
      {
        key: 'audit-fix-testing-1',
        filePath: '/path/file.md',
        gap: makeGap('testing', 'Gap', 'Fix'),
        skipped: false,
      },
    ];

    const result = addFixStoriesToState(stories);
    expect(result.success).toBe(true);
    expect(mockGetSprintState).toHaveBeenCalled();
  });

  it('uses atomic write via writeStateAtomic (AC #8)', () => {
    const stories = [
      {
        key: 'audit-fix-testing-1',
        filePath: '/path/file.md',
        gap: makeGap('testing', 'Gap', 'Fix'),
        skipped: false,
      },
    ];

    addFixStoriesToState(stories);
    expect(mockWriteStateAtomic).toHaveBeenCalledTimes(1);
  });

  it('recomputes sprint counts after adding stories', () => {
    const stories = [
      {
        key: 'audit-fix-testing-1',
        filePath: '/path/file.md',
        gap: makeGap('testing', 'Gap', 'Fix'),
        skipped: false,
      },
    ];

    addFixStoriesToState(stories);
    expect(mockComputeSprintCounts).toHaveBeenCalledTimes(1);
    // Verify the recomputed counts are used in the written state
    const writtenState = mockWriteStateAtomic.mock.calls[0][0];
    expect(writtenState.sprint.total).toBe(2);
  });

  it('skips writing when all stories are skipped', () => {
    const stories = [
      {
        key: 'audit-fix-testing-1',
        filePath: '/path/file.md',
        gap: makeGap('testing', 'Gap', 'Fix'),
        skipped: true,
        skipReason: 'Already exists',
      },
    ];

    const result = addFixStoriesToState(stories);
    expect(result.success).toBe(true);
    expect(mockGetSprintState).not.toHaveBeenCalled();
    expect(mockWriteStateAtomic).not.toHaveBeenCalled();
  });

  it('handles getSprintState failure', () => {
    mockGetSprintState.mockReturnValue({
      success: false,
      error: 'File corrupted',
    });

    const stories = [
      {
        key: 'audit-fix-testing-1',
        filePath: '/path/file.md',
        gap: makeGap('testing', 'Gap', 'Fix'),
        skipped: false,
      },
    ];

    const result = addFixStoriesToState(stories);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('File corrupted');
    }
  });

  it('preserves existing stories when adding new ones', () => {
    const existingStories = {
      'existing-story': {
        status: 'done' as const,
        attempts: 2,
        lastAttempt: '2026-01-01',
        lastError: null,
        proofPath: null,
        acResults: null,
      },
    };

    mockGetSprintState.mockReturnValue({
      success: true,
      data: { ...defaultState, stories: existingStories },
    });

    const stories = [
      {
        key: 'audit-fix-testing-1',
        filePath: '/path/file.md',
        gap: makeGap('testing', 'Gap', 'Fix'),
        skipped: false,
      },
    ];

    addFixStoriesToState(stories);
    const writtenState = mockWriteStateAtomic.mock.calls[0][0];
    expect(writtenState.stories['existing-story']).toEqual(existingStories['existing-story']);
    expect(writtenState.stories['audit-fix-testing-1']).toBeDefined();
  });
});
