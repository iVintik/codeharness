import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'yaml';
import type { SprintState } from '../../../types/state.js';

// Mock migration so tests are isolated from real project files
vi.mock('../migration.js', () => ({
  migrateFromOldFormat: vi.fn(() => ({
    success: false,
    error: 'No old format files found for migration',
  })),
  migrateV1ToV2: vi.fn((v1: Record<string, unknown>) => ({
    ...v1,
    version: 2,
    retries: {},
    flagged: [],
    epics: {},
    session: { active: false, startedAt: null, iteration: 0, elapsedSeconds: 0 },
    observability: { statementCoverage: null, branchCoverage: null, functionCoverage: null, lineCoverage: null },
  })),
}));

// Import functions under test
const {
  generateSprintStatusYaml,
  getStoryStatusesFromState,
  writeStateAtomic,
  defaultState,
  sprintStatusYamlPath,
} = await import('../state.js');

function mkStory(status: string): SprintState['stories'][string] {
  return {
    status: status as 'done',
    attempts: 0,
    lastAttempt: null,
    lastError: null,
    proofPath: null,
    acResults: null,
  };
}

// ─── getStoryStatusesFromState ──────────────────────────────────────────────

describe('getStoryStatusesFromState', () => {
  it('returns empty map for empty state', () => {
    const state = defaultState();
    const result = getStoryStatusesFromState(state);
    expect(result).toEqual({});
  });

  it('returns flat key->status map from state stories', () => {
    const state: SprintState = {
      ...defaultState(),
      stories: {
        '1-1-first-story': mkStory('done'),
        '1-2-second-story': mkStory('in-progress'),
        '2-1-third-story': mkStory('backlog'),
      },
    };
    const result = getStoryStatusesFromState(state);
    expect(result).toEqual({
      '1-1-first-story': 'done',
      '1-2-second-story': 'in-progress',
      '2-1-third-story': 'backlog',
    });
  });

  it('preserves all status types', () => {
    const state: SprintState = {
      ...defaultState(),
      stories: {
        '1-1-a': mkStory('done'),
        '1-2-b': mkStory('failed'),
        '1-3-c': mkStory('blocked'),
        '2-1-d': mkStory('verifying'),
        '2-2-e': mkStory('review'),
        '2-3-f': mkStory('ready'),
      },
    };
    const result = getStoryStatusesFromState(state);
    expect(result['1-1-a']).toBe('done');
    expect(result['1-2-b']).toBe('failed');
    expect(result['1-3-c']).toBe('blocked');
    expect(result['2-1-d']).toBe('verifying');
    expect(result['2-2-e']).toBe('review');
    expect(result['2-3-f']).toBe('ready');
  });
});

// ─── generateSprintStatusYaml ───────────────────────────────────────────────

describe('generateSprintStatusYaml', () => {
  it('produces valid YAML for empty state', () => {
    const state = defaultState();
    const yaml = generateSprintStatusYaml(state);
    expect(yaml).toContain('development_status:');
    // Should parse without error
    const parsed = parse(yaml);
    expect(parsed).toBeDefined();
  });

  it('groups stories by epic and sorts by epic/story number', () => {
    const state: SprintState = {
      ...defaultState(),
      stories: {
        '2-1-beta': mkStory('backlog'),
        '1-2-second': mkStory('done'),
        '1-1-first': mkStory('done'),
        '2-2-gamma': mkStory('in-progress'),
      },
    };
    const yaml = generateSprintStatusYaml(state);

    // Epic 1 should appear before Epic 2
    const epic1Pos = yaml.indexOf('# Epic 1');
    const epic2Pos = yaml.indexOf('# Epic 2');
    expect(epic1Pos).toBeLessThan(epic2Pos);

    // Within Epic 1, story 1-1 should appear before 1-2
    const story11Pos = yaml.indexOf('1-1-first');
    const story12Pos = yaml.indexOf('1-2-second');
    expect(story11Pos).toBeLessThan(story12Pos);
  });

  it('computes epic status as done when all stories done', () => {
    const state: SprintState = {
      ...defaultState(),
      stories: {
        '1-1-first': mkStory('done'),
        '1-2-second': mkStory('done'),
      },
    };
    const yaml = generateSprintStatusYaml(state);
    expect(yaml).toContain('epic-1: done');
  });

  it('computes epic status as backlog when not all stories done', () => {
    const state: SprintState = {
      ...defaultState(),
      stories: {
        '1-1-first': mkStory('done'),
        '1-2-second': mkStory('in-progress'),
      },
    };
    const yaml = generateSprintStatusYaml(state);
    expect(yaml).toContain('epic-1: backlog');
  });

  it('maps "ready" status to "ready-for-dev" in YAML', () => {
    const state: SprintState = {
      ...defaultState(),
      stories: {
        '3-1-some-story': mkStory('ready'),
      },
    };
    const yaml = generateSprintStatusYaml(state);
    expect(yaml).toContain('3-1-some-story: ready-for-dev');
  });

  it('produces parseable YAML with correct development_status', () => {
    const state: SprintState = {
      ...defaultState(),
      stories: {
        '1-1-alpha': mkStory('done'),
        '2-1-beta': mkStory('backlog'),
      },
    };
    const yaml = generateSprintStatusYaml(state);
    const parsed = parse(yaml) as Record<string, unknown>;
    expect(parsed.development_status).toBeDefined();

    const devStatus = parsed.development_status as Record<string, string>;
    expect(devStatus['1-1-alpha']).toBe('done');
    expect(devStatus['2-1-beta']).toBe('backlog');
    expect(devStatus['epic-1']).toBe('done');
    expect(devStatus['epic-2']).toBe('backlog');
  });

  it('includes auto-generated header comment', () => {
    const state = defaultState();
    const yaml = generateSprintStatusYaml(state);
    expect(yaml).toContain('auto-generated from sprint-state.json');
    expect(yaml).toContain('do NOT edit manually');
  });

  it('handles multiple epics with mixed statuses', () => {
    const state: SprintState = {
      ...defaultState(),
      stories: {
        '1-1-a': mkStory('done'),
        '1-2-b': mkStory('done'),
        '2-1-c': mkStory('done'),
        '2-2-d': mkStory('failed'),
        '3-1-e': mkStory('backlog'),
      },
    };
    const yaml = generateSprintStatusYaml(state);
    expect(yaml).toContain('epic-1: done');
    expect(yaml).toContain('epic-2: backlog'); // 2-2-d is failed, not done
    expect(yaml).toContain('epic-3: backlog');
  });

  it('handles stories with non-standard keys gracefully (sorted last)', () => {
    const state: SprintState = {
      ...defaultState(),
      stories: {
        '1-1-normal': mkStory('done'),
        'no-match-key': mkStory('backlog'),
      },
    };
    // Should not throw
    const yaml = generateSprintStatusYaml(state);
    expect(yaml).toContain('1-1-normal: done');
    expect(yaml).toContain('no-match-key: backlog');
  });

  it('always shows epic-TD as in-progress even when all TD stories are done', () => {
    const state: SprintState = {
      ...defaultState(),
      stories: {
        '1-1-normal': mkStory('done'),
        'TD-1-fix-catch-blocks': mkStory('done'),
        'TD-2-add-tests': mkStory('done'),
      },
    };
    const yaml = generateSprintStatusYaml(state);
    expect(yaml).toContain('epic-TD: in-progress');
    // Normal epic should still be done
    expect(yaml).toContain('epic-1: done');
  });

  it('groups TD stories under Epic TD section', () => {
    const state: SprintState = {
      ...defaultState(),
      stories: {
        'TD-1-some-fix': mkStory('backlog'),
        '1-1-normal': mkStory('done'),
      },
    };
    const yaml = generateSprintStatusYaml(state);
    expect(yaml).toContain('# Epic TD');
    expect(yaml).toContain('TD-1-some-fix: backlog');
  });

  it('handles state with epics field populated (ignored — epics derived from stories)', () => {
    const state: SprintState = {
      ...defaultState(),
      epics: {
        '1': { status: 'done', storiesTotal: 2, storiesDone: 2 },
      },
      stories: {
        '1-1-a': mkStory('done'),
        '1-2-b': mkStory('backlog'),
      },
    };
    const yaml = generateSprintStatusYaml(state);
    // Epic status should be derived from stories, not from epics field
    expect(yaml).toContain('epic-1: backlog');
  });
});

// ─── writeStateAtomic regenerates YAML (filesystem-isolated) ─────────────────

describe('writeStateAtomic regenerates sprint-status.yaml', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'ch-yaml-'));
    originalCwd = process.cwd();
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(testDir, { recursive: true, force: true });
  });

  it('writes sprint-status.yaml when directory exists', () => {
    const yamlDir = join(testDir, '_bmad-output', 'implementation-artifacts');
    mkdirSync(yamlDir, { recursive: true });

    const state: SprintState = {
      ...defaultState(),
      stories: {
        '1-1-test-story': mkStory('done'),
      },
    };
    const result = writeStateAtomic(state);
    expect(result.success).toBe(true);

    // Verify sprint-status.yaml was written
    const yamlFile = join(yamlDir, 'sprint-status.yaml');
    expect(existsSync(yamlFile)).toBe(true);
    const yamlContent = readFileSync(yamlFile, 'utf-8');
    expect(yamlContent).toContain('1-1-test-story: done');
    expect(yamlContent).toContain('auto-generated');
  });

  it('YAML updates on every state write', () => {
    const yamlDir = join(testDir, '_bmad-output', 'implementation-artifacts');
    mkdirSync(yamlDir, { recursive: true });

    // First write
    const state1: SprintState = {
      ...defaultState(),
      stories: {
        '1-1-story': mkStory('backlog'),
      },
    };
    writeStateAtomic(state1);
    const yamlFile = join(yamlDir, 'sprint-status.yaml');
    const yaml1 = readFileSync(yamlFile, 'utf-8');
    expect(yaml1).toContain('1-1-story: backlog');

    // Second write with updated status
    const state2: SprintState = {
      ...defaultState(),
      stories: {
        '1-1-story': mkStory('done'),
      },
    };
    writeStateAtomic(state2);
    const yaml2 = readFileSync(yamlFile, 'utf-8');
    expect(yaml2).toContain('1-1-story: done');
    expect(yaml2).not.toContain('1-1-story: backlog');
  });

  it('skips YAML write when output directory does not exist', () => {
    // No _bmad-output dir created — should not throw
    const state: SprintState = {
      ...defaultState(),
      stories: {
        '1-1-test': mkStory('done'),
      },
    };
    const result = writeStateAtomic(state);
    expect(result.success).toBe(true);

    // YAML file should not exist
    const yamlFile = join(testDir, '_bmad-output', 'implementation-artifacts', 'sprint-status.yaml');
    expect(existsSync(yamlFile)).toBe(false);
  });

  it('YAML write failure does not fail the state write', () => {
    // Create directory as a file to force YAML write failure
    const yamlDir = join(testDir, '_bmad-output', 'implementation-artifacts');
    mkdirSync(join(testDir, '_bmad-output'), { recursive: true });
    // Create a file where the yaml file should go, making writeFileSync fail
    mkdirSync(yamlDir, { recursive: true });
    const yamlFile = join(yamlDir, 'sprint-status.yaml');
    mkdirSync(yamlFile); // directory instead of file — writeFileSync will fail

    const state: SprintState = {
      ...defaultState(),
      stories: { '1-1-x': mkStory('done') },
    };
    const result = writeStateAtomic(state);
    // State write should succeed even though YAML write fails
    expect(result.success).toBe(true);

    // Verify JSON state was written
    const stateFile = join(testDir, 'sprint-state.json');
    expect(existsSync(stateFile)).toBe(true);
  });
});

// ─── sprintStatusYamlPath ───────────────────────────────────────────────────

describe('sprintStatusYamlPath', () => {
  it('returns expected path', () => {
    const path = sprintStatusYamlPath();
    expect(path).toContain('_bmad-output');
    expect(path).toContain('implementation-artifacts');
    expect(path).toContain('sprint-status.yaml');
  });
});
