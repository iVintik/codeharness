import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  generateOnboardingEpic,
  writeOnboardingEpic,
  formatEpicSummary,
  promptApproval,
  importOnboardingEpic,
} from '../epic-generator.js';
import type { OnboardingEpic, OnboardingStory, EpicSummary } from '../epic-generator.js';
import type { ScanResult, CoverageGapReport, DocAuditResult } from '../scanner.js';
import type { BeadsIssue } from '../beads.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-epic-gen-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function makeScanResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    modules: [
      { path: 'src/lib', sourceFiles: 5, testFiles: 3 },
      { path: 'src/commands', sourceFiles: 8, testFiles: 4 },
    ],
    totalSourceFiles: 20,
    artifacts: {
      hasBmad: false,
      bmadPath: null,
    },
    ...overrides,
  };
}

function makeCoverageReport(overrides: Partial<CoverageGapReport> = {}): CoverageGapReport {
  return {
    overall: 100,
    modules: [
      { path: 'src/lib', coveragePercent: 100, uncoveredFileCount: 0 },
      { path: 'src/commands', coveragePercent: 100, uncoveredFileCount: 0 },
    ],
    uncoveredFiles: 0,
    ...overrides,
  };
}

function makeAuditResult(overrides: Partial<DocAuditResult> = {}): DocAuditResult {
  return {
    documents: [
      { name: 'README.md', grade: 'present', path: 'README.md' },
      { name: 'AGENTS.md', grade: 'present', path: 'AGENTS.md' },
      { name: 'ARCHITECTURE.md', grade: 'present', path: 'ARCHITECTURE.md' },
    ],
    summary: 'README.md(present) AGENTS.md(present) ARCHITECTURE.md(present)',
    ...overrides,
  };
}

function makeEpic(overrides: Partial<OnboardingEpic> = {}): OnboardingEpic {
  return {
    title: 'Onboarding Epic: Bring Project to Harness Compliance',
    generatedAt: '2026-03-15T10:00:00Z',
    stories: [],
    summary: { totalStories: 0, coverageStories: 0, docStories: 0, verificationStories: 0, observabilityStories: 0 },
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

// ─── generateOnboardingEpic ─────────────────────────────────────────────────

describe('generateOnboardingEpic', () => {
  it('generates no stories when all modules at 100% coverage and all docs present', () => {
    // Create AGENTS.md for each module so they are not flagged
    mkdirSync(join(testDir, 'src/lib'), { recursive: true });
    mkdirSync(join(testDir, 'src/commands'), { recursive: true });
    writeFileSync(join(testDir, 'src/lib/AGENTS.md'), '# Agents', 'utf-8');
    writeFileSync(join(testDir, 'src/commands/AGENTS.md'), '# Agents', 'utf-8');

    const scan = makeScanResult();
    const coverage = makeCoverageReport();
    const audit = makeAuditResult();

    const epic = generateOnboardingEpic(scan, coverage, audit, testDir);

    expect(epic.stories).toHaveLength(0);
    expect(epic.summary.totalStories).toBe(0);
    expect(epic.summary.coverageStories).toBe(0);
    expect(epic.summary.docStories).toBe(0);
  });

  it('generates coverage stories for modules below 100%', () => {
    // Create AGENTS.md to avoid agents-md stories
    mkdirSync(join(testDir, 'src/lib'), { recursive: true });
    mkdirSync(join(testDir, 'src/commands'), { recursive: true });
    writeFileSync(join(testDir, 'src/lib/AGENTS.md'), '# Agents', 'utf-8');
    writeFileSync(join(testDir, 'src/commands/AGENTS.md'), '# Agents', 'utf-8');

    const scan = makeScanResult();
    const coverage = makeCoverageReport({
      modules: [
        { path: 'src/lib', coveragePercent: 90, uncoveredFileCount: 1 },
        { path: 'src/commands', coveragePercent: 80, uncoveredFileCount: 2 },
      ],
    });
    const audit = makeAuditResult();

    const epic = generateOnboardingEpic(scan, coverage, audit, testDir);

    const coverageStories = epic.stories.filter(s => s.type === 'coverage');
    expect(coverageStories).toHaveLength(2);
    expect(coverageStories[0].title).toBe('Add test coverage for src/lib');
    expect(coverageStories[1].title).toBe('Add test coverage for src/commands');
    expect(epic.summary.coverageStories).toBe(2);
  });

  it('generates architecture story when ARCHITECTURE.md missing', () => {
    mkdirSync(join(testDir, 'src/lib'), { recursive: true });
    mkdirSync(join(testDir, 'src/commands'), { recursive: true });
    writeFileSync(join(testDir, 'src/lib/AGENTS.md'), '# Agents', 'utf-8');
    writeFileSync(join(testDir, 'src/commands/AGENTS.md'), '# Agents', 'utf-8');

    const scan = makeScanResult();
    const coverage = makeCoverageReport();
    const audit = makeAuditResult({
      documents: [
        { name: 'README.md', grade: 'present', path: 'README.md' },
        { name: 'AGENTS.md', grade: 'present', path: 'AGENTS.md' },
        { name: 'ARCHITECTURE.md', grade: 'missing', path: null },
      ],
    });

    const epic = generateOnboardingEpic(scan, coverage, audit, testDir);

    const archStories = epic.stories.filter(s => s.type === 'architecture');
    expect(archStories).toHaveLength(1);
    expect(archStories[0].title).toBe('Create ARCHITECTURE.md');
    expect(archStories[0].key).toBe('0.1');
    expect(epic.summary.docStories).toBe(1);
  });

  it('generates doc-freshness story when stale documents detected', () => {
    mkdirSync(join(testDir, 'src/lib'), { recursive: true });
    mkdirSync(join(testDir, 'src/commands'), { recursive: true });
    writeFileSync(join(testDir, 'src/lib/AGENTS.md'), '# Agents', 'utf-8');
    writeFileSync(join(testDir, 'src/commands/AGENTS.md'), '# Agents', 'utf-8');

    const scan = makeScanResult();
    const coverage = makeCoverageReport();
    const audit = makeAuditResult({
      documents: [
        { name: 'README.md', grade: 'stale', path: 'README.md' },
        { name: 'AGENTS.md', grade: 'present', path: 'AGENTS.md' },
        { name: 'ARCHITECTURE.md', grade: 'present', path: 'ARCHITECTURE.md' },
      ],
    });

    const epic = generateOnboardingEpic(scan, coverage, audit, testDir);

    const freshStories = epic.stories.filter(s => s.type === 'doc-freshness');
    expect(freshStories).toHaveLength(1);
    expect(freshStories[0].title).toBe('Update stale documentation');
    expect(freshStories[0].acceptanceCriteria[0]).toContain('README.md');
    expect(epic.summary.docStories).toBe(1);
  });

  it('generates agents-md stories for modules missing AGENTS.md', () => {
    // Only create AGENTS.md for src/commands, not src/lib
    mkdirSync(join(testDir, 'src/lib'), { recursive: true });
    mkdirSync(join(testDir, 'src/commands'), { recursive: true });
    writeFileSync(join(testDir, 'src/commands/AGENTS.md'), '# Agents', 'utf-8');

    const scan = makeScanResult();
    const coverage = makeCoverageReport();
    const audit = makeAuditResult();

    const epic = generateOnboardingEpic(scan, coverage, audit, testDir);

    const agentsStories = epic.stories.filter(s => s.type === 'agents-md');
    expect(agentsStories).toHaveLength(1);
    expect(agentsStories[0].title).toBe('Create src/lib/AGENTS.md');
    expect(agentsStories[0].module).toBe('src/lib');
  });

  it('generates full combination with correct total and categorization', () => {
    // No AGENTS.md anywhere
    mkdirSync(join(testDir, 'src/lib'), { recursive: true });
    mkdirSync(join(testDir, 'src/commands'), { recursive: true });

    const scan = makeScanResult({
      artifacts: {
        hasBmad: true,
        bmadPath: '_bmad',
      },
    });
    const coverage = makeCoverageReport({
      modules: [
        { path: 'src/lib', coveragePercent: 90, uncoveredFileCount: 1 },
        { path: 'src/commands', coveragePercent: 100, uncoveredFileCount: 0 },
      ],
    });
    const audit = makeAuditResult({
      documents: [
        { name: 'README.md', grade: 'stale', path: 'README.md' },
        { name: 'AGENTS.md', grade: 'present', path: 'AGENTS.md' },
        { name: 'ARCHITECTURE.md', grade: 'missing', path: null },
      ],
    });

    const epic = generateOnboardingEpic(scan, coverage, audit, testDir);

    // Expected: 1 architecture + 2 agents-md + 1 coverage + 1 doc-freshness = 5
    expect(epic.summary.totalStories).toBe(5);
    expect(epic.summary.coverageStories).toBe(1);
    expect(epic.summary.docStories).toBe(4); // 1 architecture + 2 agents-md + 1 doc-freshness

    // Verify sequential numbering
    const keys = epic.stories.map(s => s.key);
    expect(keys).toEqual(['0.1', '0.2', '0.3', '0.4', '0.5']);
  });

  it('sets generatedAt timestamp', () => {
    mkdirSync(join(testDir, 'src/lib'), { recursive: true });
    mkdirSync(join(testDir, 'src/commands'), { recursive: true });
    writeFileSync(join(testDir, 'src/lib/AGENTS.md'), '# Agents', 'utf-8');
    writeFileSync(join(testDir, 'src/commands/AGENTS.md'), '# Agents', 'utf-8');

    const scan = makeScanResult();
    const coverage = makeCoverageReport();
    const audit = makeAuditResult();

    const epic = generateOnboardingEpic(scan, coverage, audit, testDir);

    // Should be a valid ISO timestamp ending with Z (no milliseconds)
    expect(epic.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });
});

// ─── writeOnboardingEpic ────────────────────────────────────────────────────

describe('writeOnboardingEpic', () => {
  it('writes markdown with correct format', () => {
    const epic = makeEpic({
      stories: [
        {
          key: '0.1',
          title: 'Create ARCHITECTURE.md',
          type: 'architecture',
          acceptanceCriteria: [
            '**Given** no ARCHITECTURE.md exists\n**When** the agent analyzes the codebase\n**Then** ARCHITECTURE.md is created with module overview and dependencies',
          ],
        },
        {
          key: '0.2',
          title: 'Add test coverage for src/lib',
          type: 'coverage',
          module: 'src/lib',
          acceptanceCriteria: [
            '**Given** src/lib has 1 uncovered files at 90% coverage\n**When** the agent writes tests\n**Then** src/lib has 100% test coverage',
          ],
        },
      ],
      summary: { totalStories: 2, coverageStories: 1, docStories: 1, verificationStories: 0, observabilityStories: 0 },
    });

    const outputPath = join(testDir, 'ralph', 'onboarding-epic.md');
    writeOnboardingEpic(epic, outputPath);

    expect(existsSync(outputPath)).toBe(true);

    const content = readFileSync(outputPath, 'utf-8');

    // Check header
    expect(content).toContain('# Onboarding Epic: Bring Project to Harness Compliance');
    expect(content).toContain('Generated: 2026-03-15T10:00:00Z');
    expect(content).toContain('## Epic 0: Onboarding');

    // Check story headers
    expect(content).toContain('### Story 0.1: Create ARCHITECTURE.md');
    expect(content).toContain('### Story 0.2: Add test coverage for src/lib');

    // Check user stories
    expect(content).toContain("As a developer, I want an ARCHITECTURE.md documenting the project's architecture.");
    expect(content).toContain('As a developer, I want tests for src/lib to ensure correctness.');

    // Check acceptance criteria
    expect(content).toContain('**Given** no ARCHITECTURE.md exists');
    expect(content).toContain('**Then** ARCHITECTURE.md is created with module overview and dependencies');

    // Check footer
    expect(content).toContain('**Total stories:** 2');
    expect(content).toContain('Review and approve before execution.');
  });

  it('creates parent directories if they do not exist', () => {
    const epic = makeEpic({ stories: [] });
    const outputPath = join(testDir, 'deep', 'nested', 'epic.md');

    writeOnboardingEpic(epic, outputPath);

    expect(existsSync(outputPath)).toBe(true);
  });

  it('writes correct user story for agents-md type', () => {
    const epic = makeEpic({
      stories: [{
        key: '0.1',
        title: 'Create src/lib/AGENTS.md',
        type: 'agents-md',
        module: 'src/lib',
        acceptanceCriteria: ['**Given** src/lib has 5 source files and no AGENTS.md\n**When** the agent reads the module\n**Then** src/lib/AGENTS.md is created with module purpose and key files'],
      }],
      summary: { totalStories: 1, coverageStories: 0, docStories: 1, verificationStories: 0, observabilityStories: 0 },
    });

    const outputPath = join(testDir, 'epic.md');
    writeOnboardingEpic(epic, outputPath);

    const content = readFileSync(outputPath, 'utf-8');
    expect(content).toContain('As an agent, I want AGENTS.md for src/lib so I have local context.');
  });

  it('writes correct user story for doc-freshness type', () => {
    const epic = makeEpic({
      stories: [{
        key: '0.1',
        title: 'Update stale documentation',
        type: 'doc-freshness',
        acceptanceCriteria: ['**Given** the following documents are stale: README.md\n**When** the agent reviews them\n**Then** all stale documents are updated'],
      }],
      summary: { totalStories: 1, coverageStories: 0, docStories: 1, verificationStories: 0, observabilityStories: 0 },
    });

    const outputPath = join(testDir, 'epic.md');
    writeOnboardingEpic(epic, outputPath);

    const content = readFileSync(outputPath, 'utf-8');
    expect(content).toContain('As a developer, I want up-to-date documentation reflecting the current codebase.');
  });

});

// ─── formatEpicSummary ──────────────────────────────────────────────────────

describe('formatEpicSummary', () => {
  it('formats summary with known inputs', () => {
    const epic = makeEpic({
      summary: { totalStories: 5, coverageStories: 2, docStories: 2, verificationStories: 1, observabilityStories: 0 },
    });

    expect(formatEpicSummary(epic)).toBe(
      'Onboarding plan: 5 stories (2 coverage, 2 documentation, 1 verification, 0 observability)',
    );
  });

  it('formats summary with zero stories', () => {
    const epic = makeEpic({
      summary: { totalStories: 0, coverageStories: 0, docStories: 0, verificationStories: 0, observabilityStories: 0 },
    });

    expect(formatEpicSummary(epic)).toBe(
      'Onboarding plan: 0 stories (0 coverage, 0 documentation, 0 verification, 0 observability)',
    );
  });

  it('formats summary with only coverage stories', () => {
    const epic = makeEpic({
      summary: { totalStories: 3, coverageStories: 3, docStories: 0, verificationStories: 0, observabilityStories: 0 },
    });

    expect(formatEpicSummary(epic)).toBe(
      'Onboarding plan: 3 stories (3 coverage, 0 documentation, 0 verification, 0 observability)',
    );
  });

  it('formats summary with verification and observability stories', () => {
    const epic = makeEpic({
      summary: { totalStories: 4, coverageStories: 0, docStories: 0, verificationStories: 2, observabilityStories: 2 },
    });

    expect(formatEpicSummary(epic)).toBe(
      'Onboarding plan: 4 stories (0 coverage, 0 documentation, 2 verification, 2 observability)',
    );
  });
});

// ─── promptApproval ─────────────────────────────────────────────────────────

// promptApproval uses node:readline which can't be spied on in ESM.
// We test by replacing process.stdin with a Readable that provides input,
// and suppress process.stdout to avoid polluting test output.

describe('promptApproval', () => {
  async function runPromptWith(input: string): Promise<boolean> {
    const { Readable, Writable } = await import('node:stream');
    const fakeInput = new Readable({ read() { this.push(input); this.push(null); } });
    const devNull = new Writable({ write(_chunk, _enc, cb) { cb(); } });
    const originalStdin = process.stdin;
    const originalStdout = process.stdout;
    Object.defineProperty(process, 'stdin', { value: fakeInput, writable: true });
    Object.defineProperty(process, 'stdout', { value: devNull, writable: true });
    try {
      return await promptApproval();
    } finally {
      Object.defineProperty(process, 'stdin', { value: originalStdin, writable: true });
      Object.defineProperty(process, 'stdout', { value: originalStdout, writable: true });
    }
  }

  it('returns true on "Y" input via stdin', async () => {
    expect(await runPromptWith('Y\n')).toBe(true);
  });

  it('returns true on "y" input via stdin', async () => {
    expect(await runPromptWith('y\n')).toBe(true);
  });

  it('returns true on empty input (default yes)', async () => {
    expect(await runPromptWith('\n')).toBe(true);
  });

  it('returns false on "n" input', async () => {
    expect(await runPromptWith('n\n')).toBe(false);
  });

  it('returns false on "N" input', async () => {
    expect(await runPromptWith('N\n')).toBe(false);
  });

  it('returns false on EOF (stdin closed without input)', async () => {
    const { Readable, Writable } = await import('node:stream');
    const fakeInput = new Readable({ read() { this.push(null); } });
    const devNull = new Writable({ write(_chunk, _enc, cb) { cb(); } });
    const originalStdin = process.stdin;
    const originalStdout = process.stdout;
    Object.defineProperty(process, 'stdin', { value: fakeInput, writable: true });
    Object.defineProperty(process, 'stdout', { value: devNull, writable: true });
    try {
      expect(await promptApproval()).toBe(false);
    } finally {
      Object.defineProperty(process, 'stdin', { value: originalStdin, writable: true });
      Object.defineProperty(process, 'stdout', { value: originalStdout, writable: true });
    }
  });
});

// ─── importOnboardingEpic ───────────────────────────────────────────────────

describe('importOnboardingEpic', () => {
  it('parses the epic file and imports stories with type=task', () => {
    // Write a valid onboarding epic markdown
    const epicPath = join(testDir, 'ralph', 'onboarding-epic.md');
    mkdirSync(join(testDir, 'ralph'), { recursive: true });
    writeFileSync(epicPath, [
      '## Epic 0: Onboarding',
      '',
      '### Story 0.1: Create ARCHITECTURE.md',
      '',
      'As a developer,',
      'I want an ARCHITECTURE.md,',
      'So that the project is documented.',
      '',
      '**Given** no ARCHITECTURE.md exists',
      '**When** the agent creates it',
      '**Then** ARCHITECTURE.md exists',
      '',
      '### Story 0.2: Add test coverage for src/lib',
      '',
      'As a developer,',
      'I want tests for src/lib,',
      'So that quality improves.',
      '',
      '**Given** src/lib has low coverage',
      '**When** the agent writes tests',
      '**Then** coverage reaches 100%',
      '',
    ].join('\n'), 'utf-8');

    let createCallCount = 0;
    const mockCreate = vi.fn().mockImplementation((title: string, opts: any) => {
      createCallCount++;
      return makeBeadsIssue({ id: `BEAD-${createCallCount}`, title, type: opts?.type });
    });
    const mockList = vi.fn().mockReturnValue([]);

    const results = importOnboardingEpic(epicPath, {
      listIssues: mockList,
      createIssue: mockCreate,
    });

    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('created');
    expect(results[1].status).toBe('created');

    // Verify type='task' was passed
    expect(mockCreate.mock.calls[0][1].type).toBe('task');
    expect(mockCreate.mock.calls[1][1].type).toBe('task');
  });

  it('sets correct priority by story type pattern', () => {
    const epicPath = join(testDir, 'epic.md');
    writeFileSync(epicPath, [
      '## Epic 0: Onboarding',
      '',
      '### Story 0.1: Create ARCHITECTURE.md',
      '',
      'As a developer,',
      'I want docs,',
      'So that things are documented.',
      '',
      '**Given** X **When** Y **Then** Z',
      '',
      '### Story 0.2: Add test coverage for src/lib',
      '',
      'As a developer,',
      'I want tests,',
      'So that quality.',
      '',
      '**Given** A **When** B **Then** C',
      '',
    ].join('\n'), 'utf-8');

    const mockCreate = vi.fn().mockImplementation((_title: string, opts: any) => {
      return makeBeadsIssue({ id: 'BEAD-X', type: opts?.type, priority: opts?.priority });
    });
    const mockList = vi.fn().mockReturnValue([]);

    importOnboardingEpic(epicPath, {
      listIssues: mockList,
      createIssue: mockCreate,
    });

    // ARCHITECTURE.md -> priority 3
    expect(mockCreate.mock.calls[0][1].priority).toBe(3);
    // coverage -> priority 2
    expect(mockCreate.mock.calls[1][1].priority).toBe(2);
  });

  it('returns empty array for non-existent file', () => {
    const results = importOnboardingEpic(join(testDir, 'nope.md'), {
      listIssues: vi.fn().mockReturnValue([]),
      createIssue: vi.fn(),
    });

    expect(results).toHaveLength(0);
  });

  it('returns empty array for empty file', () => {
    const epicPath = join(testDir, 'empty.md');
    writeFileSync(epicPath, '', 'utf-8');

    const results = importOnboardingEpic(epicPath, {
      listIssues: vi.fn().mockReturnValue([]),
      createIssue: vi.fn(),
    });

    expect(results).toHaveLength(0);
  });

  it('appends gap-id tags to created issues for coverage stories', () => {
    const epicPath = join(testDir, 'epic-gapid.md');
    writeFileSync(epicPath, [
      '## Epic 0: Onboarding',
      '',
      '### Story 0.1: Add test coverage for src/lib',
      '',
      'As a developer,',
      'I want tests,',
      'So that quality.',
      '',
      '**Given** X **When** Y **Then** Z',
      '',
    ].join('\n'), 'utf-8');

    const mockCreate = vi.fn().mockImplementation((title: string, opts: any) => {
      return makeBeadsIssue({ id: 'BEAD-1', title, description: opts?.description });
    });
    const mockList = vi.fn().mockReturnValue([]);

    importOnboardingEpic(epicPath, {
      listIssues: mockList,
      createIssue: mockCreate,
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const desc = mockCreate.mock.calls[0][1].description;
    expect(desc).toContain('[gap:coverage:src/lib]');
  });

  it('appends gap-id tags to created issues for architecture stories', () => {
    const epicPath = join(testDir, 'epic-arch.md');
    writeFileSync(epicPath, [
      '## Epic 0: Onboarding',
      '',
      '### Story 0.1: Create ARCHITECTURE.md',
      '',
      'As a developer,',
      'I want docs,',
      'So that documented.',
      '',
      '**Given** X **When** Y **Then** Z',
      '',
    ].join('\n'), 'utf-8');

    const mockCreate = vi.fn().mockImplementation((title: string, opts: any) => {
      return makeBeadsIssue({ id: 'BEAD-1', title, description: opts?.description });
    });
    const mockList = vi.fn().mockReturnValue([]);

    importOnboardingEpic(epicPath, {
      listIssues: mockList,
      createIssue: mockCreate,
    });

    const desc = mockCreate.mock.calls[0][1].description;
    expect(desc).toContain('[gap:docs:ARCHITECTURE.md]');
  });

  it('appends gap-id tags for agents-md stories', () => {
    const epicPath = join(testDir, 'epic-agents.md');
    writeFileSync(epicPath, [
      '## Epic 0: Onboarding',
      '',
      '### Story 0.1: Create src/lib/AGENTS.md',
      '',
      'As an agent,',
      'I want AGENTS.md for src/lib,',
      'So that context.',
      '',
      '**Given** X **When** Y **Then** Z',
      '',
    ].join('\n'), 'utf-8');

    const mockCreate = vi.fn().mockImplementation((title: string, opts: any) => {
      return makeBeadsIssue({ id: 'BEAD-1', title, description: opts?.description });
    });
    const mockList = vi.fn().mockReturnValue([]);

    importOnboardingEpic(epicPath, {
      listIssues: mockList,
      createIssue: mockCreate,
    });

    const desc = mockCreate.mock.calls[0][1].description;
    expect(desc).toContain('[gap:docs:src/lib/AGENTS.md]');
  });

  it('appends gap-id tags for doc-freshness stories', () => {
    const epicPath = join(testDir, 'epic-stale.md');
    writeFileSync(epicPath, [
      '## Epic 0: Onboarding',
      '',
      '### Story 0.1: Update stale documentation',
      '',
      'As a developer,',
      'I want fresh docs,',
      'So that accuracy.',
      '',
      '**Given** X **When** Y **Then** Z',
      '',
    ].join('\n'), 'utf-8');

    const mockCreate = vi.fn().mockImplementation((title: string, opts: any) => {
      return makeBeadsIssue({ id: 'BEAD-1', title, description: opts?.description });
    });
    const mockList = vi.fn().mockReturnValue([]);

    importOnboardingEpic(epicPath, {
      listIssues: mockList,
      createIssue: mockCreate,
    });

    const desc = mockCreate.mock.calls[0][1].description;
    expect(desc).toContain('[gap:docs:stale-docs]');
  });

  it('sets correct priority for verification stories', () => {
    const epicPath = join(testDir, 'epic-verify.md');
    writeFileSync(epicPath, [
      '## Epic 0: Onboarding',
      '',
      '### Story 0.1: Create verification proof for 4-1-verification-pipeline',
      '',
      'As a developer,',
      'I want verification proof,',
      'So that documentation exists.',
      '',
      '**Given** X **When** Y **Then** Z',
      '',
    ].join('\n'), 'utf-8');

    const mockCreate = vi.fn().mockImplementation((_title: string, opts: any) => {
      return makeBeadsIssue({ id: 'BEAD-1', priority: opts?.priority });
    });
    const mockList = vi.fn().mockReturnValue([]);

    importOnboardingEpic(epicPath, {
      listIssues: mockList,
      createIssue: mockCreate,
    });

    // verification -> priority 2
    expect(mockCreate.mock.calls[0][1].priority).toBe(2);
  });

  it('sets correct priority for observability stories', () => {
    const epicPath = join(testDir, 'epic-obs.md');
    writeFileSync(epicPath, [
      '## Epic 0: Onboarding',
      '',
      '### Story 0.1: Configure OTLP instrumentation',
      '',
      'As a developer,',
      'I want observability,',
      'So that monitoring works.',
      '',
      '**Given** X **When** Y **Then** Z',
      '',
      '### Story 0.2: Start Docker observability stack',
      '',
      'As a developer,',
      'I want Docker running,',
      'So that telemetry flows.',
      '',
      '**Given** X **When** Y **Then** Z',
      '',
    ].join('\n'), 'utf-8');

    const mockCreate = vi.fn().mockImplementation((_title: string, opts: any) => {
      return makeBeadsIssue({ id: 'BEAD-1', priority: opts?.priority });
    });
    const mockList = vi.fn().mockReturnValue([]);

    importOnboardingEpic(epicPath, {
      listIssues: mockList,
      createIssue: mockCreate,
    });

    // observability -> priority 1 (highest)
    expect(mockCreate.mock.calls[0][1].priority).toBe(1);
    expect(mockCreate.mock.calls[1][1].priority).toBe(1);
  });

  it('appends gap-id tags for verification stories', () => {
    const epicPath = join(testDir, 'epic-verify-gap.md');
    writeFileSync(epicPath, [
      '## Epic 0: Onboarding',
      '',
      '### Story 0.1: Create verification proof for 4-1-verification-pipeline',
      '',
      'As a developer,',
      'I want verification proof,',
      'So that.',
      '',
      '**Given** X **When** Y **Then** Z',
      '',
    ].join('\n'), 'utf-8');

    const mockCreate = vi.fn().mockImplementation((title: string, opts: any) => {
      return makeBeadsIssue({ id: 'BEAD-1', title, description: opts?.description });
    });
    const mockList = vi.fn().mockReturnValue([]);

    importOnboardingEpic(epicPath, {
      listIssues: mockList,
      createIssue: mockCreate,
    });

    const desc = mockCreate.mock.calls[0][1].description;
    expect(desc).toContain('[gap:verification:4-1-verification-pipeline]');
  });

  it('appends gap-id tags for observability stories', () => {
    const epicPath = join(testDir, 'epic-obs-gap.md');
    writeFileSync(epicPath, [
      '## Epic 0: Onboarding',
      '',
      '### Story 0.1: Configure OTLP instrumentation',
      '',
      'As a developer,',
      'I want observability,',
      'So that.',
      '',
      '**Given** X **When** Y **Then** Z',
      '',
      '### Story 0.2: Start Docker observability stack',
      '',
      'As a developer,',
      'I want Docker,',
      'So that.',
      '',
      '**Given** X **When** Y **Then** Z',
      '',
    ].join('\n'), 'utf-8');

    const mockCreate = vi.fn().mockImplementation((title: string, opts: any) => {
      return makeBeadsIssue({ id: 'BEAD-1', title, description: opts?.description });
    });
    const mockList = vi.fn().mockReturnValue([]);

    importOnboardingEpic(epicPath, {
      listIssues: mockList,
      createIssue: mockCreate,
    });

    expect(mockCreate.mock.calls[0][1].description).toContain('[gap:observability:otlp-config]');
    expect(mockCreate.mock.calls[1][1].description).toContain('[gap:observability:docker-stack]');
  });
});

// ─── writeOnboardingEpic — new story types ──────────────────────────────────

describe('writeOnboardingEpic — new story types', () => {
  it('writes correct user story for verification type', () => {
    const epic = makeEpic({
      stories: [{
        key: '0.v1',
        title: 'Create verification proof for 4-1-verification-pipeline',
        type: 'verification',
        storyKey: '4-1-verification-pipeline',
        acceptanceCriteria: ['**Given** story 4-1 is done **When** no proof **Then** create proof'],
      }],
      summary: { totalStories: 1, coverageStories: 0, docStories: 0, verificationStories: 1, observabilityStories: 0 },
    });

    const outputPath = join(testDir, 'epic.md');
    writeOnboardingEpic(epic, outputPath);

    const content = readFileSync(outputPath, 'utf-8');
    expect(content).toContain("As a developer, I want verification proof for 4-1-verification-pipeline to ensure it's properly documented.");
  });

  it('writes correct user story for observability type', () => {
    const epic = makeEpic({
      stories: [{
        key: '0.o1',
        title: 'Configure OTLP instrumentation',
        type: 'observability',
        module: 'otlp-config',
        acceptanceCriteria: ['**Given** OTLP not configured **When** onboard **Then** configure'],
      }],
      summary: { totalStories: 1, coverageStories: 0, docStories: 0, verificationStories: 0, observabilityStories: 1 },
    });

    const outputPath = join(testDir, 'epic.md');
    writeOnboardingEpic(epic, outputPath);

    const content = readFileSync(outputPath, 'utf-8');
    expect(content).toContain('As a developer, I want observability infrastructure configured so the harness can monitor runtime behavior.');
  });

  it('includes new story types in summary counts', () => {
    mkdirSync(join(testDir, 'src/lib'), { recursive: true });
    mkdirSync(join(testDir, 'src/commands'), { recursive: true });
    writeFileSync(join(testDir, 'src/lib/AGENTS.md'), '# Agents', 'utf-8');
    writeFileSync(join(testDir, 'src/commands/AGENTS.md'), '# Agents', 'utf-8');

    const scan = makeScanResult();
    const coverage = makeCoverageReport();
    const audit = makeAuditResult();

    const epic = generateOnboardingEpic(scan, coverage, audit, testDir);
    expect(epic.summary.verificationStories).toBe(0);
    expect(epic.summary.observabilityStories).toBe(0);
  });
});
