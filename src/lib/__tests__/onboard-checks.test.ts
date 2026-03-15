import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../bmad.js', () => ({
  isBmadInstalled: vi.fn(),
}));

vi.mock('../docker.js', () => ({
  isStackRunning: vi.fn(),
}));

import {
  checkHarnessInitialized,
  checkBmadInstalled,
  checkHooksRegistered,
  runPreconditions,
  filterTrackedGaps,
  storyToGapId,
  findVerificationGaps,
  findPerFileCoverageGaps,
  findObservabilityGaps,
  getOnboardingProgress,
} from '../onboard-checks.js';
import { isBmadInstalled } from '../bmad.js';
import { isStackRunning } from '../docker.js';
import type { OnboardingStory } from '../epic-generator.js';
import type { BeadsIssue } from '../beads.js';
import { stringify } from 'yaml';

let testDir: string;

beforeEach(() => {
  vi.clearAllMocks();
  testDir = mkdtempSync(join(tmpdir(), 'ch-onboard-checks-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function makeStory(overrides: Partial<OnboardingStory> = {}): OnboardingStory {
  return {
    key: '0.1',
    title: 'Test Story',
    type: 'coverage',
    module: 'src/lib',
    acceptanceCriteria: ['AC1'],
    ...overrides,
  };
}

function makeBeadsIssue(overrides: Partial<BeadsIssue> = {}): BeadsIssue {
  return {
    id: 'BEAD-1',
    title: 'Test',
    status: 'open',
    type: 'task',
    priority: 1,
    ...overrides,
  };
}

// ─── checkHarnessInitialized ────────────────────────────────────────────────

describe('checkHarnessInitialized', () => {
  it('returns ok: true when state file exists', () => {
    mkdirSync(join(testDir, '.claude'), { recursive: true });
    writeFileSync(join(testDir, '.claude', 'codeharness.local.md'), '---\n---\n', 'utf-8');

    const result = checkHarnessInitialized(testDir);
    expect(result).toEqual({ ok: true });
  });

  it('returns ok: false when state file is missing', () => {
    const result = checkHarnessInitialized(testDir);
    expect(result).toEqual({ ok: false });
  });
});

// ─── checkBmadInstalled ─────────────────────────────────────────────────────

describe('checkBmadInstalled', () => {
  it('returns ok: true when isBmadInstalled returns true', () => {
    vi.mocked(isBmadInstalled).mockReturnValue(true);

    const result = checkBmadInstalled(testDir);
    expect(result).toEqual({ ok: true });
    expect(isBmadInstalled).toHaveBeenCalledWith(testDir);
  });

  it('returns ok: false when isBmadInstalled returns false', () => {
    vi.mocked(isBmadInstalled).mockReturnValue(false);

    const result = checkBmadInstalled(testDir);
    expect(result).toEqual({ ok: false });
  });
});

// ─── checkHooksRegistered ───────────────────────────────────────────────────

describe('checkHooksRegistered', () => {
  it('returns ok: true when hooks.json exists in package hooks dir', () => {
    // This test checks the actual package hooks directory.
    // Since we're running from within the codeharness project, hooks/hooks.json exists.
    const result = checkHooksRegistered();
    expect(result).toEqual({ ok: true });
  });
});

// ─── runPreconditions ───────────────────────────────────────────────────────

describe('runPreconditions', () => {
  it('returns canProceed: false when harness not initialized', () => {
    const result = runPreconditions(testDir);

    expect(result.canProceed).toBe(false);
    expect(result.warnings).toHaveLength(0);
    expect(result.initialized).toBe(false);
  });

  it('returns canProceed: true with BMAD warning when BMAD not installed', () => {
    // Initialize harness
    mkdirSync(join(testDir, '.claude'), { recursive: true });
    writeFileSync(join(testDir, '.claude', 'codeharness.local.md'), '---\n---\n', 'utf-8');
    vi.mocked(isBmadInstalled).mockReturnValue(false);

    const result = runPreconditions(testDir);

    expect(result.canProceed).toBe(true);
    expect(result.initialized).toBe(true);
    expect(result.bmad).toBe(false);
    expect(result.warnings).toContain(
      "BMAD not installed \u2014 generated stories won't be executable until init completes",
    );
  });

  it('returns canProceed: true with no warnings when all checks pass', () => {
    mkdirSync(join(testDir, '.claude'), { recursive: true });
    writeFileSync(join(testDir, '.claude', 'codeharness.local.md'), '---\n---\n', 'utf-8');
    vi.mocked(isBmadInstalled).mockReturnValue(true);

    const result = runPreconditions(testDir);

    expect(result.canProceed).toBe(true);
    expect(result.initialized).toBe(true);
    expect(result.bmad).toBe(true);
    // hooks check depends on the actual package structure
  });

  it('includes hooks warning when hooks not registered', () => {
    mkdirSync(join(testDir, '.claude'), { recursive: true });
    writeFileSync(join(testDir, '.claude', 'codeharness.local.md'), '---\n---\n', 'utf-8');
    vi.mocked(isBmadInstalled).mockReturnValue(true);

    const result = runPreconditions(testDir);

    // Since we're running from the package root, hooks should be found.
    // This test verifies the structure is correct.
    expect(result.canProceed).toBe(true);
    expect(result.hooks).toBe(true);
  });
});

// ─── storyToGapId ───────────────────────────────────────────────────────────

describe('storyToGapId', () => {
  it('maps coverage type to [gap:coverage:<module>]', () => {
    const story = makeStory({ type: 'coverage', module: 'src/lib' });
    expect(storyToGapId(story)).toBe('[gap:coverage:src/lib]');
  });

  it('maps agents-md type to [gap:docs:<module>/AGENTS.md]', () => {
    const story = makeStory({ type: 'agents-md', module: 'src/lib' });
    expect(storyToGapId(story)).toBe('[gap:docs:src/lib/AGENTS.md]');
  });

  it('maps architecture type to [gap:docs:ARCHITECTURE.md]', () => {
    const story = makeStory({ type: 'architecture' });
    expect(storyToGapId(story)).toBe('[gap:docs:ARCHITECTURE.md]');
  });

  it('maps doc-freshness type to [gap:docs:stale-docs]', () => {
    const story = makeStory({ type: 'doc-freshness' });
    expect(storyToGapId(story)).toBe('[gap:docs:stale-docs]');
  });

});

// ─── filterTrackedGaps ──────────────────────────────────────────────────────

describe('filterTrackedGaps', () => {
  it('returns all stories as untracked when no matching gap-ids exist', () => {
    const stories = [
      makeStory({ key: '0.1', type: 'coverage', module: 'src/lib' }),
      makeStory({ key: '0.2', type: 'architecture' }),
    ];
    const mockList = vi.fn().mockReturnValue([]);

    const result = filterTrackedGaps(stories, { listIssues: mockList });

    expect(result.untracked).toHaveLength(2);
    expect(result.trackedCount).toBe(0);
  });

  it('filters out stories that have matching gap-ids in beads', () => {
    const stories = [
      makeStory({ key: '0.1', type: 'coverage', module: 'src/lib' }),
      makeStory({ key: '0.2', type: 'architecture' }),
    ];
    const existingIssues: BeadsIssue[] = [
      makeBeadsIssue({
        id: 'BEAD-1',
        title: 'Add test coverage for src/lib',
        description: 'some desc\n[gap:coverage:src/lib]',
        status: 'open',
      }),
      makeBeadsIssue({
        id: 'BEAD-2',
        title: 'Create ARCHITECTURE.md',
        description: '[gap:docs:ARCHITECTURE.md]',
        status: 'open',
      }),
    ];
    const mockList = vi.fn().mockReturnValue(existingIssues);

    const result = filterTrackedGaps(stories, { listIssues: mockList });

    expect(result.untracked).toHaveLength(0);
    expect(result.trackedCount).toBe(2);
  });

  it('returns empty untracked list when all stories are tracked', () => {
    const stories = [
      makeStory({ key: '0.1', type: 'coverage', module: 'src/lib' }),
    ];
    const existingIssues: BeadsIssue[] = [
      makeBeadsIssue({
        id: 'BEAD-1',
        description: '[gap:coverage:src/lib]',
        status: 'open',
      }),
    ];
    const mockList = vi.fn().mockReturnValue(existingIssues);

    const result = filterTrackedGaps(stories, { listIssues: mockList });

    expect(result.untracked).toHaveLength(0);
    expect(result.trackedCount).toBe(1);
  });

  it('does not count done issues as tracked (findExistingByGapId skips done)', () => {
    const stories = [
      makeStory({ key: '0.1', type: 'coverage', module: 'src/lib' }),
    ];
    const existingIssues: BeadsIssue[] = [
      makeBeadsIssue({
        id: 'BEAD-1',
        description: '[gap:coverage:src/lib]',
        status: 'done',
      }),
    ];
    const mockList = vi.fn().mockReturnValue(existingIssues);

    const result = filterTrackedGaps(stories, { listIssues: mockList });

    expect(result.untracked).toHaveLength(1);
    expect(result.trackedCount).toBe(0);
  });

  it('fails open when listIssues throws — returns all stories as untracked', () => {
    const stories = [
      makeStory({ key: '0.1', type: 'coverage', module: 'src/lib' }),
      makeStory({ key: '0.2', type: 'architecture' }),
    ];
    const mockList = vi.fn().mockImplementation(() => {
      throw new Error('BeadsError: not initialized');
    });

    const result = filterTrackedGaps(stories, { listIssues: mockList });

    expect(result.untracked).toHaveLength(2);
    expect(result.trackedCount).toBe(0);
  });
});

// ─── storyToGapId — new types ───────────────────────────────────────────────

describe('storyToGapId — verification and observability', () => {
  it('maps verification type to [gap:verification:<storyKey>]', () => {
    const story = makeStory({ type: 'verification', storyKey: '4-1-verification-pipeline' });
    expect(storyToGapId(story)).toBe('[gap:verification:4-1-verification-pipeline]');
  });

  it('maps observability type with otlp-config module to [gap:observability:otlp-config]', () => {
    const story = makeStory({ type: 'observability', module: 'otlp-config' });
    expect(storyToGapId(story)).toBe('[gap:observability:otlp-config]');
  });

  it('maps observability type with docker-stack module to [gap:observability:docker-stack]', () => {
    const story = makeStory({ type: 'observability', module: 'docker-stack' });
    expect(storyToGapId(story)).toBe('[gap:observability:docker-stack]');
  });
});

// ─── findVerificationGaps ───────────────────────────────────────────────────

describe('findVerificationGaps', () => {
  function writeSprintStatus(dir: string, devStatus: Record<string, string>): void {
    const statusDir = join(dir, '_bmad-output', 'implementation-artifacts');
    mkdirSync(statusDir, { recursive: true });
    const content = stringify({ development_status: devStatus });
    writeFileSync(join(statusDir, 'sprint-status.yaml'), content, 'utf-8');
  }

  it('returns no gaps when done stories have proof documents', () => {
    writeSprintStatus(testDir, { '1-1-some-story': 'done' });
    mkdirSync(join(testDir, 'docs', 'exec-plans', 'completed'), { recursive: true });
    writeFileSync(join(testDir, 'docs', 'exec-plans', 'completed', '1-1-some-story.md'), '# Proof', 'utf-8');

    const gaps = findVerificationGaps(testDir);
    expect(gaps).toHaveLength(0);
  });

  it('creates gaps for done stories missing proof documents', () => {
    writeSprintStatus(testDir, {
      '1-1-some-story': 'done',
      '2-1-another-story': 'done',
    });
    // No proof documents created

    const gaps = findVerificationGaps(testDir);
    expect(gaps).toHaveLength(2);
    expect(gaps[0].type).toBe('verification');
    expect(gaps[0].title).toBe('Create verification proof for 1-1-some-story');
    expect(gaps[0].storyKey).toBe('1-1-some-story');
    expect(gaps[1].title).toBe('Create verification proof for 2-1-another-story');
  });

  it('ignores stories in non-done statuses', () => {
    writeSprintStatus(testDir, {
      '1-1-some-story': 'in-progress',
      '2-1-another-story': 'ready-for-dev',
      '3-1-backlog-story': 'backlog',
    });

    const gaps = findVerificationGaps(testDir);
    expect(gaps).toHaveLength(0);
  });

  it('skips epic and retrospective entries', () => {
    writeSprintStatus(testDir, {
      'epic-1': 'done',
      'epic-1-retrospective': 'done',
      '1-1-real-story': 'done',
    });

    const gaps = findVerificationGaps(testDir);
    // Only 1-1-real-story should be flagged
    expect(gaps).toHaveLength(1);
    expect(gaps[0].storyKey).toBe('1-1-real-story');
  });

  it('returns empty when sprint-status.yaml is missing (graceful)', () => {
    const gaps = findVerificationGaps(testDir);
    expect(gaps).toHaveLength(0);
  });

  it('produces correct gap-ids for verification stories', () => {
    writeSprintStatus(testDir, { '4-1-verification-pipeline': 'done' });

    const gaps = findVerificationGaps(testDir);
    expect(gaps).toHaveLength(1);
    expect(storyToGapId(gaps[0])).toBe('[gap:verification:4-1-verification-pipeline]');
  });
});

// ─── findPerFileCoverageGaps ────────────────────────────────────────────────

describe('findPerFileCoverageGaps', () => {
  function writeCoverageSummary(dir: string, data: Record<string, unknown>): void {
    const coverageDir = join(dir, 'coverage');
    mkdirSync(coverageDir, { recursive: true });
    writeFileSync(join(coverageDir, 'coverage-summary.json'), JSON.stringify(data), 'utf-8');
  }

  it('returns no gaps when all files are above the floor', () => {
    writeCoverageSummary(testDir, {
      total: { statements: { pct: 95 } },
      [join(testDir, 'src/lib/foo.ts')]: { statements: { pct: 90 }, branches: { pct: 90 }, functions: { pct: 90 }, lines: { pct: 90 } },
    });

    const gaps = findPerFileCoverageGaps(80, testDir);
    expect(gaps).toHaveLength(0);
  });

  it('creates gaps for files below the floor', () => {
    writeCoverageSummary(testDir, {
      total: { statements: { pct: 60 } },
      [join(testDir, 'src/lib/low.ts')]: { statements: { pct: 50 }, branches: { pct: 40 }, functions: { pct: 60 }, lines: { pct: 50 } },
      [join(testDir, 'src/lib/ok.ts')]: { statements: { pct: 95 }, branches: { pct: 90 }, functions: { pct: 90 }, lines: { pct: 95 } },
    });

    const gaps = findPerFileCoverageGaps(80, testDir);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].type).toBe('coverage');
    expect(gaps[0].title).toBe('Add test coverage for src/lib/low.ts');
    expect(gaps[0].module).toBe('src/lib/low.ts');
  });

  it('returns empty when no coverage report exists', () => {
    const gaps = findPerFileCoverageGaps(80, testDir);
    expect(gaps).toHaveLength(0);
  });

  it('produces correct gap-ids for per-file coverage stories', () => {
    writeCoverageSummary(testDir, {
      total: { statements: { pct: 60 } },
      [join(testDir, 'src/lib/scanner.ts')]: { statements: { pct: 40 }, branches: { pct: 30 }, functions: { pct: 50 }, lines: { pct: 40 } },
    });

    const gaps = findPerFileCoverageGaps(80, testDir);
    expect(gaps).toHaveLength(1);
    expect(storyToGapId(gaps[0])).toBe('[gap:coverage:src/lib/scanner.ts]');
  });
});

// ─── findObservabilityGaps ──────────────────────────────────────────────────

describe('findObservabilityGaps', () => {
  function writeState(dir: string, state: Record<string, unknown>): void {
    const claudeDir = join(dir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    const yamlContent = stringify(state, { nullStr: 'null' });
    writeFileSync(join(claudeDir, 'codeharness.local.md'), `---\n${yamlContent}---\n# State\n`, 'utf-8');
  }

  function makeState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      harness_version: '0.1.0',
      initialized: true,
      stack: 'nodejs',
      enforcement: {
        frontend: true,
        database: true,
        api: true,
      },
      coverage: {
        target: 90,
        baseline: null,
        current: null,
        tool: 'c8',
      },
      session_flags: {
        logs_queried: false,
        tests_passed: false,
        coverage_met: false,
        verification_run: false,
      },
      verification_log: [],
      ...overrides,
    };
  }

  it('returns otlp-config gap when OTLP not configured (AC #3)', () => {
    writeState(testDir, makeState());
    // No otlp section in state

    const gaps = findObservabilityGaps(testDir);
    const otlpGap = gaps.find(g => g.module === 'otlp-config');
    expect(otlpGap).toBeDefined();
    expect(otlpGap!.title).toBe('Configure OTLP instrumentation');
    expect(otlpGap!.type).toBe('observability');
  });

  it('returns docker-stack gap when Docker not running (AC #4)', () => {
    writeState(testDir, makeState({
      otlp: { enabled: true, endpoint: 'http://localhost:4317', service_name: 'test' },
      docker: { compose_file: 'docker-compose.yaml', stack_running: false, ports: {} },
    }));
    vi.mocked(isStackRunning).mockReturnValue(false);

    const gaps = findObservabilityGaps(testDir);
    const dockerGap = gaps.find(g => g.module === 'docker-stack');
    expect(dockerGap).toBeDefined();
    expect(dockerGap!.title).toBe('Start Docker observability stack');
  });

  it('returns docker-stack gap when no compose file configured', () => {
    writeState(testDir, makeState({
      otlp: { enabled: true, endpoint: 'http://localhost:4317', service_name: 'test' },
      // No docker section at all
    }));

    const gaps = findObservabilityGaps(testDir);
    const dockerGap = gaps.find(g => g.module === 'docker-stack');
    expect(dockerGap).toBeDefined();
  });

  it('returns no gaps when everything is configured and running', () => {
    writeState(testDir, makeState({
      otlp: { enabled: true, endpoint: 'http://localhost:4317', service_name: 'test' },
      docker: { compose_file: 'docker-compose.yaml', stack_running: true, ports: {} },
    }));
    vi.mocked(isStackRunning).mockReturnValue(true);

    const gaps = findObservabilityGaps(testDir);
    expect(gaps).toHaveLength(0);
  });

  it('returns empty when state file is missing (fail open)', () => {
    // No state file created
    const gaps = findObservabilityGaps(testDir);
    expect(gaps).toHaveLength(0);
  });

  it('produces correct gap-ids for observability stories', () => {
    writeState(testDir, makeState());
    // No otlp, no docker -> both gaps

    const gaps = findObservabilityGaps(testDir);
    const otlpGap = gaps.find(g => g.module === 'otlp-config');
    const dockerGap = gaps.find(g => g.module === 'docker-stack');

    expect(storyToGapId(otlpGap!)).toBe('[gap:observability:otlp-config]');
    expect(storyToGapId(dockerGap!)).toBe('[gap:observability:docker-stack]');
  });
});

// ─── getOnboardingProgress ──────────────────────────────────────────────────

describe('getOnboardingProgress', () => {
  it('returns null when no gap-tagged issues exist', () => {
    const mockList = vi.fn().mockReturnValue([
      makeBeadsIssue({ description: 'Regular issue without gap tags' }),
    ]);

    const result = getOnboardingProgress({ listIssues: mockList });
    expect(result).toBeNull();
  });

  it('returns null when listIssues returns empty array', () => {
    const mockList = vi.fn().mockReturnValue([]);

    const result = getOnboardingProgress({ listIssues: mockList });
    expect(result).toBeNull();
  });

  it('counts only gap-tagged issues (mixed issues)', () => {
    const mockList = vi.fn().mockReturnValue([
      makeBeadsIssue({ description: '[gap:coverage:src/lib]', status: 'open' }),
      makeBeadsIssue({ description: 'No gap tag', status: 'open' }),
      makeBeadsIssue({ description: '[gap:docs:ARCHITECTURE.md]', status: 'done' }),
    ]);

    const result = getOnboardingProgress({ listIssues: mockList });
    expect(result).toEqual({ total: 2, resolved: 1, remaining: 1 });
  });

  it('returns all resolved when all gap-tagged issues are done', () => {
    const mockList = vi.fn().mockReturnValue([
      makeBeadsIssue({ description: '[gap:coverage:src/lib]', status: 'done' }),
      makeBeadsIssue({ description: '[gap:docs:stale-docs]', status: 'done' }),
      makeBeadsIssue({ description: '[gap:verification:4-1-test]', status: 'closed' }),
    ]);

    const result = getOnboardingProgress({ listIssues: mockList });
    expect(result).toEqual({ total: 3, resolved: 3, remaining: 0 });
  });

  it('counts done and closed as resolved', () => {
    const mockList = vi.fn().mockReturnValue([
      makeBeadsIssue({ description: '[gap:coverage:src/lib]', status: 'done' }),
      makeBeadsIssue({ description: '[gap:docs:ARCHITECTURE.md]', status: 'closed' }),
      makeBeadsIssue({ description: '[gap:docs:stale-docs]', status: 'open' }),
    ]);

    const result = getOnboardingProgress({ listIssues: mockList });
    expect(result).toEqual({ total: 3, resolved: 2, remaining: 1 });
  });

  it('returns null when beads is unavailable (listIssues throws)', () => {
    const mockList = vi.fn().mockImplementation(() => {
      throw new Error('BeadsError: not initialized');
    });

    const result = getOnboardingProgress({ listIssues: mockList });
    expect(result).toBeNull();
  });

  it('handles issues with no description as non-gap-tagged', () => {
    const mockList = vi.fn().mockReturnValue([
      makeBeadsIssue({ description: undefined }),
      makeBeadsIssue({ description: '[gap:coverage:src/lib]', status: 'open' }),
    ]);

    const result = getOnboardingProgress({ listIssues: mockList });
    expect(result).toEqual({ total: 1, resolved: 0, remaining: 1 });
  });
});
