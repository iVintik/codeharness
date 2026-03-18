import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseEpicsFile, getStoryFilePath } from '../bmad.js';

const FIXTURES_DIR = resolve(__dirname, '../../../test/fixtures');
const SAMPLE_EPICS = join(FIXTURES_DIR, 'sample-epics.md');
const ACTUAL_EPICS = resolve(__dirname, '../../../_bmad-output/planning-artifacts/epics-archive-v1.md');

describe('parseEpicsFile', () => {
  it('correctly extracts epic titles and story count from sample file', () => {
    const epics = parseEpicsFile(SAMPLE_EPICS);
    expect(epics).toHaveLength(3);
    expect(epics[0].number).toBe(1);
    expect(epics[0].title).toBe('Foundation');
    expect(epics[0].stories).toHaveLength(2);
    expect(epics[1].number).toBe(2);
    expect(epics[1].title).toBe('Core Features');
    expect(epics[1].stories).toHaveLength(2);
    expect(epics[2].number).toBe(3);
    expect(epics[2].title).toBe('Polish');
    expect(epics[2].stories).toHaveLength(1);
  });

  it('correctly extracts story titles', () => {
    const epics = parseEpicsFile(SAMPLE_EPICS);
    expect(epics[0].stories[0].title).toBe('Project Setup');
    expect(epics[0].stories[1].title).toBe('Configuration System');
    expect(epics[1].stories[0].title).toBe('Feature Alpha');
    expect(epics[1].stories[1].title).toBe('Feature Beta');
    expect(epics[2].stories[0].title).toBe('Story Without ACs');
  });

  it('correctly extracts story keys', () => {
    const epics = parseEpicsFile(SAMPLE_EPICS);
    expect(epics[0].stories[0].key).toBe('1-1-project-setup');
    expect(epics[0].stories[1].key).toBe('1-2-configuration-system');
    expect(epics[1].stories[0].key).toBe('2-1-feature-alpha');
  });

  it('correctly extracts user stories', () => {
    const epics = parseEpicsFile(SAMPLE_EPICS);
    const story = epics[0].stories[0];
    expect(story.userStory).toContain('As a developer');
    expect(story.userStory).toContain('I want to initialize the project');
    expect(story.userStory).toContain('So that I can start building features.');
  });

  it('correctly extracts acceptance criteria blocks', () => {
    const epics = parseEpicsFile(SAMPLE_EPICS);
    const story = epics[0].stories[0];
    expect(story.acceptanceCriteria).toHaveLength(2);
    expect(story.acceptanceCriteria[0]).toContain('**Given** a developer runs');
    expect(story.acceptanceCriteria[1]).toContain('**Given** a project is already initialized');
  });

  it('correctly extracts technical notes', () => {
    const epics = parseEpicsFile(SAMPLE_EPICS);
    const story = epics[0].stories[0];
    expect(story.technicalNotes).not.toBeNull();
    expect(story.technicalNotes).toContain('Use TypeScript');
    expect(story.technicalNotes).toContain('Target Node.js 18+');
  });

  it('returns null for technicalNotes when not present', () => {
    const epics = parseEpicsFile(SAMPLE_EPICS);
    const story = epics[0].stories[1]; // Configuration System has no tech notes
    expect(story.technicalNotes).toBeNull();
  });

  it('handles stories without acceptance criteria', () => {
    const epics = parseEpicsFile(SAMPLE_EPICS);
    const story = epics[2].stories[0]; // Story Without ACs
    expect(story.title).toBe('Story Without ACs');
    expect(story.acceptanceCriteria).toHaveLength(0);
  });

  it('handles empty file (returns empty array)', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'ch-parser-'));
    const emptyFile = join(tmpDir, 'empty.md');
    writeFileSync(emptyFile, '');
    try {
      const result = parseEpicsFile(emptyFile);
      expect(result).toEqual([]);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('handles non-existent file (returns empty array)', () => {
    const result = parseEpicsFile('/nonexistent/path/epics.md');
    expect(result).toEqual([]);
  });

  it('handles file with no stories (returns epics with empty stories arrays)', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'ch-parser-'));
    const noStoriesFile = join(tmpDir, 'no-stories.md');
    writeFileSync(noStoriesFile, '## Epic 1: Empty Epic\n\nSome description but no stories.\n\n## Epic 2: Another Empty\n\nAlso empty.\n');
    try {
      const result = parseEpicsFile(noStoriesFile);
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Empty Epic');
      expect(result[0].stories).toEqual([]);
      expect(result[1].title).toBe('Another Empty');
      expect(result[1].stories).toEqual([]);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('correctly parses the actual epics.md file', () => {
    const epics = parseEpicsFile(ACTUAL_EPICS);

    // The actual file has 8 epics (0-7)
    expect(epics.length).toBeGreaterThanOrEqual(8);

    // Epic 0: In-Session Sprint Execution Skill
    const epic0 = epics.find(e => e.number === 0);
    expect(epic0).toBeDefined();
    expect(epic0!.title).toBe('In-Session Sprint Execution Skill');
    expect(epic0!.stories).toHaveLength(1);

    // Epic 1: CLI Foundation & Project Initialization
    const epic1 = epics.find(e => e.number === 1);
    expect(epic1).toBeDefined();
    expect(epic1!.title).toBe('CLI Foundation & Project Initialization');
    expect(epic1!.stories).toHaveLength(3);

    // Epic 3: BMAD Integration & Story Bridge
    const epic3 = epics.find(e => e.number === 3);
    expect(epic3).toBeDefined();
    expect(epic3!.stories.length).toBeGreaterThanOrEqual(4);

    // Story 3.3 should be parseable
    const story33 = epic3!.stories.find(s => s.storyNumber === 3);
    expect(story33).toBeDefined();
    expect(story33!.title).toContain('BMAD Parser');
    expect(story33!.acceptanceCriteria.length).toBeGreaterThan(0);
    expect(story33!.userStory).toContain('As a developer');

    // Epic 7 should exist
    const epic7 = epics.find(e => e.number === 7);
    expect(epic7).toBeDefined();
  });

  it('sets epicNumber and storyNumber correctly', () => {
    const epics = parseEpicsFile(SAMPLE_EPICS);
    const story = epics[1].stories[0]; // Story 2.1
    expect(story.epicNumber).toBe(2);
    expect(story.storyNumber).toBe(1);
  });

  it('extracts multiple AC blocks from a single story', () => {
    const epics = parseEpicsFile(SAMPLE_EPICS);
    const story = epics[1].stories[1]; // Feature Beta — has 2 AC blocks
    expect(story.acceptanceCriteria).toHaveLength(2);
  });
});

describe('getStoryFilePath', () => {
  it('returns correct conventional path', () => {
    expect(getStoryFilePath('3-3-bmad-parser-story-bridge-command')).toBe(
      '_bmad-output/implementation-artifacts/3-3-bmad-parser-story-bridge-command.md',
    );
  });

  it('returns correct path for different story keys', () => {
    expect(getStoryFilePath('1-1-project-setup')).toBe(
      '_bmad-output/implementation-artifacts/1-1-project-setup.md',
    );
  });
});
