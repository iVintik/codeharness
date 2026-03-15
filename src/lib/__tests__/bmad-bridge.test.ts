import { describe, it, expect, vi } from 'vitest';
import { importStoriesToBeads } from '../bmad.js';
import type { ParsedStory, BridgeImportResult } from '../bmad.js';
import type { BeadsIssue } from '../beads.js';

function makeStory(overrides: Partial<ParsedStory> = {}): ParsedStory {
  return {
    epicNumber: 1,
    storyNumber: 1,
    key: '1-1-test-story',
    title: 'Test Story',
    userStory: 'As a dev, I want testing, So that quality.',
    acceptanceCriteria: ['**Given** X **When** Y **Then** Z'],
    technicalNotes: null,
    ...overrides,
  };
}

function makeBeadsIssue(overrides: Partial<BeadsIssue> = {}): BeadsIssue {
  return {
    id: 'BEAD-1',
    title: 'Test Story',
    status: 'open',
    type: 'story',
    priority: 1,
    ...overrides,
  };
}

describe('importStoriesToBeads', () => {
  it('creates beads issues with correct args (type=story, priority, description with gap-id)', () => {
    const mockCreate = vi.fn().mockReturnValue(makeBeadsIssue({ id: 'BEAD-42' }));
    const mockList = vi.fn().mockReturnValue([]);

    const stories = [
      makeStory({ key: '1-1-alpha', title: 'Alpha', epicNumber: 1, storyNumber: 1 }),
      makeStory({ key: '1-2-beta', title: 'Beta', epicNumber: 1, storyNumber: 2 }),
    ];

    const results = importStoriesToBeads(stories, {}, {
      listIssues: mockList,
      createIssue: mockCreate,
    });

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate).toHaveBeenCalledWith('Alpha', {
      type: 'story',
      priority: 1,
      description: '_bmad-output/implementation-artifacts/1-1-alpha.md\n[gap:bridge:1.1]',
      deps: undefined,
    });

    // Second story should have priority 2
    expect(mockCreate).toHaveBeenCalledWith('Beta', expect.objectContaining({
      priority: 2,
      description: '_bmad-output/implementation-artifacts/1-2-beta.md\n[gap:bridge:1.2]',
    }));

    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('created');
    expect(results[0].beadsId).toBe('BEAD-42');
    expect(results[1].status).toBe('created');
  });

  it('sets dependencies from previous story in same epic', () => {
    let callCount = 0;
    const mockCreate = vi.fn().mockImplementation(() => {
      callCount++;
      return makeBeadsIssue({ id: `BEAD-${callCount}` });
    });
    const mockList = vi.fn().mockReturnValue([]);

    const stories = [
      makeStory({ key: '1-1-first', title: 'First', epicNumber: 1, storyNumber: 1 }),
      makeStory({ key: '1-2-second', title: 'Second', epicNumber: 1, storyNumber: 2 }),
      makeStory({ key: '1-3-third', title: 'Third', epicNumber: 1, storyNumber: 3 }),
    ];

    importStoriesToBeads(stories, {}, {
      listIssues: mockList,
      createIssue: mockCreate,
    });

    // First story has no deps
    expect(mockCreate.mock.calls[0][1].deps).toBeUndefined();
    // Second depends on first
    expect(mockCreate.mock.calls[1][1].deps).toEqual(['BEAD-1']);
    // Third depends on second
    expect(mockCreate.mock.calls[2][1].deps).toEqual(['BEAD-2']);
  });

  it('does not set cross-epic dependencies', () => {
    let callCount = 0;
    const mockCreate = vi.fn().mockImplementation(() => {
      callCount++;
      return makeBeadsIssue({ id: `BEAD-${callCount}` });
    });
    const mockList = vi.fn().mockReturnValue([]);

    const stories = [
      makeStory({ key: '1-1-a', title: 'A', epicNumber: 1, storyNumber: 1 }),
      makeStory({ key: '2-1-b', title: 'B', epicNumber: 2, storyNumber: 1 }),
    ];

    importStoriesToBeads(stories, {}, {
      listIssues: mockList,
      createIssue: mockCreate,
    });

    // Story B (epic 2) should NOT depend on Story A (epic 1)
    expect(mockCreate.mock.calls[1][1].deps).toBeUndefined();
  });

  it('deduplication: skips existing stories by gap-id with status exists', () => {
    const mockCreate = vi.fn();
    const mockList = vi.fn().mockReturnValue([
      makeBeadsIssue({ id: 'BEAD-EXISTING', title: 'Alpha', description: 'path\n[gap:bridge:1.1]' }),
    ]);

    const stories = [
      makeStory({ key: '1-1-alpha', title: 'Alpha', epicNumber: 1, storyNumber: 1 }),
      makeStory({ key: '1-2-beta', title: 'Beta', epicNumber: 1, storyNumber: 2 }),
    ];

    const results = importStoriesToBeads(stories, {}, {
      listIssues: mockList,
      createIssue: mockCreate.mockReturnValue(makeBeadsIssue({ id: 'BEAD-NEW' })),
    });

    // Alpha should be skipped (exists) with beadsId populated, Beta created
    expect(results[0].status).toBe('exists');
    expect(results[0].beadsId).toBe('BEAD-EXISTING');
    expect(results[1].status).toBe('created');
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith('Beta', expect.anything());
  });

  it('deduplication uses gap-id, not title matching', () => {
    const mockCreate = vi.fn().mockReturnValue(makeBeadsIssue({ id: 'BEAD-NEW' }));
    // Same title but no gap-id match — should NOT dedup
    const mockList = vi.fn().mockReturnValue([
      makeBeadsIssue({ title: 'Alpha', description: 'no gap id here' }),
    ]);

    const stories = [
      makeStory({ key: '1-1-alpha', title: 'Alpha', epicNumber: 1, storyNumber: 1 }),
    ];

    const results = importStoriesToBeads(stories, {}, {
      listIssues: mockList,
      createIssue: mockCreate,
    });

    expect(results[0].status).toBe('created');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('preserves dependency chain through existing (deduped) issues', () => {
    let callCount = 0;
    const mockCreate = vi.fn().mockImplementation(() => {
      callCount++;
      return makeBeadsIssue({ id: `BEAD-NEW-${callCount}` });
    });
    // Story 1.1 already exists, 1.2 and 1.3 are new
    const mockList = vi.fn().mockReturnValue([
      makeBeadsIssue({ id: 'BEAD-EXISTING', description: 'path\n[gap:bridge:1.1]' }),
    ]);

    const stories = [
      makeStory({ key: '1-1-a', title: 'A', epicNumber: 1, storyNumber: 1 }),
      makeStory({ key: '1-2-b', title: 'B', epicNumber: 1, storyNumber: 2 }),
      makeStory({ key: '1-3-c', title: 'C', epicNumber: 1, storyNumber: 3 }),
    ];

    importStoriesToBeads(stories, {}, {
      listIssues: mockList,
      createIssue: mockCreate,
    });

    // Story 1.1 is skipped (exists)
    // Story 1.2 should depend on 1.1's existing ID (BEAD-EXISTING)
    expect(mockCreate.mock.calls[0][1].deps).toEqual(['BEAD-EXISTING']);
    // Story 1.3 should depend on 1.2's new ID (BEAD-NEW-1)
    expect(mockCreate.mock.calls[1][1].deps).toEqual(['BEAD-NEW-1']);
  });

  it('re-import with same stories produces no duplicates', () => {
    const mockCreate = vi.fn();
    // Simulate issues already created with gap-ids
    const mockList = vi.fn().mockReturnValue([
      makeBeadsIssue({ id: 'B-1', title: 'Alpha', description: 'path\n[gap:bridge:1.1]' }),
      makeBeadsIssue({ id: 'B-2', title: 'Beta', description: 'path\n[gap:bridge:1.2]' }),
    ]);

    const stories = [
      makeStory({ key: '1-1-alpha', title: 'Alpha', epicNumber: 1, storyNumber: 1 }),
      makeStory({ key: '1-2-beta', title: 'Beta', epicNumber: 1, storyNumber: 2 }),
    ];

    const results = importStoriesToBeads(stories, {}, {
      listIssues: mockList,
      createIssue: mockCreate,
    });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(results[0].status).toBe('exists');
    expect(results[0].beadsId).toBe('B-1');
    expect(results[1].status).toBe('exists');
    expect(results[1].beadsId).toBe('B-2');
  });

  it('dry run mode: returns results without calling createIssue', () => {
    const mockCreate = vi.fn();
    const mockList = vi.fn().mockReturnValue([]);

    const stories = [
      makeStory({ key: '1-1-alpha', title: 'Alpha' }),
      makeStory({ key: '1-2-beta', title: 'Beta' }),
    ];

    const results = importStoriesToBeads(stories, { dryRun: true }, {
      listIssues: mockList,
      createIssue: mockCreate,
    });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockList).toHaveBeenCalledOnce(); // listIssues called for dedup info even in dry-run
    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('skipped');
    expect(results[0].beadsId).toBeNull();
    expect(results[1].status).toBe('skipped');
  });

  it('dry run mode: shows exists status for stories matching existing beads issues by gap-id', () => {
    const mockCreate = vi.fn();
    const mockList = vi.fn().mockReturnValue([
      makeBeadsIssue({ id: 'B-1', title: 'Alpha', description: 'path\n[gap:bridge:1.1]' }),
    ]);

    const stories = [
      makeStory({ key: '1-1-alpha', title: 'Alpha', epicNumber: 1, storyNumber: 1 }),
      makeStory({ key: '1-2-beta', title: 'Beta', epicNumber: 1, storyNumber: 2 }),
    ];

    const results = importStoriesToBeads(stories, { dryRun: true }, {
      listIssues: mockList,
      createIssue: mockCreate,
    });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(results[0].status).toBe('exists'); // recognized as existing by gap-id
    expect(results[0].beadsId).toBe('B-1');
    expect(results[1].status).toBe('skipped'); // new, would be created
  });

  it('handles createIssue failure gracefully (status failed, continues)', () => {
    let callCount = 0;
    const mockCreate = vi.fn().mockImplementation((title: string) => {
      callCount++;
      if (callCount === 1) {
        throw new Error('bd create failed');
      }
      return makeBeadsIssue({ id: `BEAD-${callCount}` });
    });
    const mockList = vi.fn().mockReturnValue([]);

    const stories = [
      makeStory({ key: '1-1-fail', title: 'Failing', epicNumber: 1, storyNumber: 1 }),
      makeStory({ key: '1-2-ok', title: 'OK', epicNumber: 1, storyNumber: 2 }),
    ];

    const results = importStoriesToBeads(stories, {}, {
      listIssues: mockList,
      createIssue: mockCreate,
    });

    expect(results[0].status).toBe('failed');
    expect(results[0].error).toContain('bd create failed');
    expect(results[1].status).toBe('created');
    expect(results[1].beadsId).toBe('BEAD-2');
  });

  it('handles listIssues failure gracefully (proceeds without dedup)', () => {
    const mockCreate = vi.fn().mockReturnValue(makeBeadsIssue({ id: 'BEAD-1' }));
    const mockList = vi.fn().mockImplementation(() => {
      throw new Error('bd list failed');
    });

    const stories = [
      makeStory({ key: '1-1-alpha', title: 'Alpha' }),
    ];

    const results = importStoriesToBeads(stories, {}, {
      listIssues: mockList,
      createIssue: mockCreate,
    });

    expect(results[0].status).toBe('created');
    expect(mockCreate).toHaveBeenCalled();
  });

  it('sets storyFilePath correctly on all results', () => {
    const mockCreate = vi.fn().mockReturnValue(makeBeadsIssue());
    const mockList = vi.fn().mockReturnValue([]);

    const stories = [
      makeStory({ key: '3-3-bmad-parser' }),
    ];

    const results = importStoriesToBeads(stories, {}, {
      listIssues: mockList,
      createIssue: mockCreate,
    });

    expect(results[0].storyFilePath).toBe(
      '_bmad-output/implementation-artifacts/3-3-bmad-parser.md',
    );
  });

  it('integration: issues created with gap-ids are found on re-import', () => {
    // Simulate first import creating issues with gap-ids in descriptions
    const createdIssues: BeadsIssue[] = [];
    let callCount = 0;
    const mockCreate = vi.fn().mockImplementation((title: string, opts: any) => {
      callCount++;
      const issue = makeBeadsIssue({
        id: `BEAD-${callCount}`,
        title,
        description: opts?.description,
      });
      createdIssues.push(issue);
      return issue;
    });

    const stories = [
      makeStory({ key: '3-1-a', title: 'Story A', epicNumber: 3, storyNumber: 1 }),
      makeStory({ key: '3-2-b', title: 'Story B', epicNumber: 3, storyNumber: 2 }),
    ];

    // First import: no existing issues
    const mockListEmpty = vi.fn().mockReturnValue([]);
    const firstResults = importStoriesToBeads(stories, {}, {
      listIssues: mockListEmpty,
      createIssue: mockCreate,
    });

    expect(firstResults[0].status).toBe('created');
    expect(firstResults[1].status).toBe('created');
    expect(createdIssues).toHaveLength(2);

    // Verify gap-ids are in descriptions
    expect(createdIssues[0].description).toContain('[gap:bridge:3.1]');
    expect(createdIssues[1].description).toContain('[gap:bridge:3.2]');

    // Second import: existing issues returned by listIssues
    mockCreate.mockClear();
    callCount = 0;
    const mockListWithIssues = vi.fn().mockReturnValue(createdIssues);
    const secondResults = importStoriesToBeads(stories, {}, {
      listIssues: mockListWithIssues,
      createIssue: mockCreate,
    });

    // No new issues created
    expect(mockCreate).not.toHaveBeenCalled();
    expect(secondResults[0].status).toBe('exists');
    expect(secondResults[0].beadsId).toBe('BEAD-1');
    expect(secondResults[1].status).toBe('exists');
    expect(secondResults[1].beadsId).toBe('BEAD-2');
  });
});
