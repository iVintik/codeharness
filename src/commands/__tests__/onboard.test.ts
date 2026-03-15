import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

// Mock the scanner library
vi.mock('../../lib/scanner.js', () => ({
  scanCodebase: vi.fn(),
  analyzeCoverageGaps: vi.fn(),
  auditDocumentation: vi.fn(),
}));

vi.mock('../../lib/output.js', () => ({
  ok: vi.fn(),
  fail: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  jsonOutput: vi.fn(),
}));

vi.mock('../../lib/epic-generator.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    generateOnboardingEpic: vi.fn().mockReturnValue({
      title: 'Onboarding Epic: Bring Project to Harness Compliance',
      generatedAt: '2026-03-15T10:00:00Z',
      stories: [
        { key: '0.1', title: 'Create ARCHITECTURE.md', type: 'architecture', acceptanceCriteria: ['AC1'] },
        { key: '0.2', title: 'Add test coverage for src/lib', type: 'coverage', module: 'src/lib', acceptanceCriteria: ['AC2'] },
      ],
      summary: { totalStories: 2, coverageStories: 1, docStories: 1, cleanupStories: 0, verificationStories: 0, observabilityStories: 0 },
    }),
    writeOnboardingEpic: vi.fn(),
    formatEpicSummary: vi.fn().mockReturnValue('Onboarding plan: 2 stories (1 coverage, 1 documentation, 0 cleanup)'),
    promptApproval: vi.fn().mockResolvedValue(true),
    importOnboardingEpic: vi.fn().mockReturnValue([
      { storyKey: '0.1', title: 'Create ARCHITECTURE.md', beadsId: 'BEAD-1', status: 'created', storyFilePath: 'path1' },
      { storyKey: '0.2', title: 'Add test coverage for src/lib', beadsId: 'BEAD-2', status: 'created', storyFilePath: 'path2' },
    ]),
  };
});

vi.mock('../../lib/beads.js', () => ({
  listIssues: vi.fn().mockReturnValue([]),
  createIssue: vi.fn(),
}));

vi.mock('../../lib/onboard-checks.js', () => ({
  runPreconditions: vi.fn().mockReturnValue({
    canProceed: true,
    warnings: [],
    initialized: true,
    bmad: true,
    hooks: true,
  }),
  filterTrackedGaps: vi.fn().mockImplementation((stories: any[]) => ({
    untracked: stories,
    trackedCount: 0,
  })),
  findVerificationGaps: vi.fn().mockReturnValue([]),
  findPerFileCoverageGaps: vi.fn().mockReturnValue([]),
  findObservabilityGaps: vi.fn().mockReturnValue([]),
  getOnboardingProgress: vi.fn().mockReturnValue(null),
}));

vi.mock('../../lib/scan-cache.js', () => ({
  saveScanCache: vi.fn(),
  loadValidCache: vi.fn().mockReturnValue(null),
}));

import { registerOnboardCommand, resetLastScanResult } from '../onboard.js';
import {
  scanCodebase,
  analyzeCoverageGaps,
  auditDocumentation,
} from '../../lib/scanner.js';
import { fail, info, ok, warn, jsonOutput } from '../../lib/output.js';
import {
  generateOnboardingEpic,
  writeOnboardingEpic,
  formatEpicSummary,
  promptApproval,
  importOnboardingEpic,
} from '../../lib/epic-generator.js';
import {
  runPreconditions,
  filterTrackedGaps,
  findVerificationGaps,
  findPerFileCoverageGaps,
  findObservabilityGaps,
  getOnboardingProgress,
} from '../../lib/onboard-checks.js';
import { saveScanCache, loadValidCache } from '../../lib/scan-cache.js';

let testDir: string;
let originalCwd: string;

const mockScanResult = {
  modules: [
    { path: 'src/lib', sourceFiles: 5, testFiles: 3 },
    { path: 'src/commands', sourceFiles: 8, testFiles: 4 },
  ],
  totalSourceFiles: 20,
  artifacts: {
    hasBmad: false,
    hasBmalph: false,
    bmadPath: null,
    bmalpthFiles: [],
  },
};

const mockCoverageReport = {
  overall: 85.5,
  modules: [
    { path: 'src/lib', coveragePercent: 90, uncoveredFileCount: 1 },
    { path: 'src/commands', coveragePercent: 80, uncoveredFileCount: 2 },
  ],
  uncoveredFiles: 3,
};

const mockAuditResult = {
  documents: [
    { name: 'README.md', grade: 'present' as const, path: 'README.md' },
    { name: 'AGENTS.md', grade: 'missing' as const, path: null },
    { name: 'ARCHITECTURE.md', grade: 'missing' as const, path: null },
  ],
  summary: 'README.md(present) AGENTS.md(missing) ARCHITECTURE.md(missing)',
};

beforeEach(() => {
  vi.clearAllMocks();
  resetLastScanResult();
  testDir = mkdtempSync(join(tmpdir(), 'ch-onboard-cmd-test-'));
  originalCwd = process.cwd();
  process.chdir(testDir);
  process.exitCode = undefined;

  // Set up default mocks
  vi.mocked(scanCodebase).mockReturnValue(mockScanResult);
  vi.mocked(analyzeCoverageGaps).mockReturnValue(mockCoverageReport);
  vi.mocked(auditDocumentation).mockReturnValue(mockAuditResult);

  // Re-establish onboard-checks mocks after clearAllMocks
  vi.mocked(runPreconditions).mockReturnValue({
    canProceed: true,
    warnings: [],
    initialized: true,
    bmad: true,
    hooks: true,
  });
  vi.mocked(filterTrackedGaps).mockImplementation((stories: any[]) => ({
    untracked: stories,
    trackedCount: 0,
  }));
  vi.mocked(getOnboardingProgress).mockReturnValue(null);

  // Re-establish scan-cache mocks after clearAllMocks
  vi.mocked(loadValidCache).mockReturnValue(null);

  // Re-establish epic-generator mocks after clearAllMocks
  vi.mocked(generateOnboardingEpic).mockReturnValue({
    title: 'Onboarding Epic: Bring Project to Harness Compliance',
    generatedAt: '2026-03-15T10:00:00Z',
    stories: [
      { key: '0.1', title: 'Create ARCHITECTURE.md', type: 'architecture', acceptanceCriteria: ['AC1'] },
      { key: '0.2', title: 'Add test coverage for src/lib', type: 'coverage', module: 'src/lib', acceptanceCriteria: ['AC2'] },
    ],
    summary: { totalStories: 2, coverageStories: 1, docStories: 1, cleanupStories: 0, verificationStories: 0, observabilityStories: 0 },
  });
  vi.mocked(writeOnboardingEpic).mockReturnValue(undefined);
  vi.mocked(formatEpicSummary).mockReturnValue('Onboarding plan: 2 stories (1 coverage, 1 documentation, 0 cleanup)');
  vi.mocked(promptApproval).mockResolvedValue(true);
  vi.mocked(importOnboardingEpic).mockReturnValue([
    { storyKey: '0.1', title: 'Create ARCHITECTURE.md', beadsId: 'BEAD-1', status: 'created', storyFilePath: 'path1' },
    { storyKey: '0.2', title: 'Add test coverage for src/lib', beadsId: 'BEAD-2', status: 'created', storyFilePath: 'path2' },
  ]);
});

afterEach(() => {
  process.chdir(originalCwd);
  process.exitCode = undefined;
  rmSync(testDir, { recursive: true, force: true });
});

async function runOnboardCmd(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  program.option('--json', 'JSON output');
  registerOnboardCommand(program);
  try {
    await program.parseAsync(['node', 'test', 'onboard', ...args]);
  } catch {
    // Commander throws on exitOverride — ignore
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('onboard command', () => {
  it('runs all phases including epic generation when no subcommand given', async () => {
    await runOnboardCmd([]);

    expect(scanCodebase).toHaveBeenCalled();
    expect(analyzeCoverageGaps).toHaveBeenCalled();
    expect(auditDocumentation).toHaveBeenCalled();
    expect(generateOnboardingEpic).toHaveBeenCalled();
    expect(writeOnboardingEpic).toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(
      'Scan: 20 source files across 2 modules',
    );
    expect(info).toHaveBeenCalledWith(
      'Coverage: 85.5% overall (3 files uncovered)',
    );
    expect(info).toHaveBeenCalledWith(
      'Docs: README.md(present) AGENTS.md(missing) ARCHITECTURE.md(missing)',
    );
    // Epic summary printed
    expect(info).toHaveBeenCalledWith(
      'Onboarding plan: 2 stories (1 coverage, 1 documentation, 0 cleanup)',
    );
  });

  it('passes --min-module-size to scanCodebase', async () => {
    await runOnboardCmd(['--min-module-size', '5']);

    expect(scanCodebase).toHaveBeenCalledWith(
      expect.any(String),
      { minModuleSize: 5 },
    );
  });

  it('warns when bmalph artifacts detected', async () => {
    vi.mocked(scanCodebase).mockReturnValue({
      ...mockScanResult,
      artifacts: {
        hasBmad: true,
        hasBmalph: true,
        bmadPath: '_bmad',
        bmalpthFiles: ['.ralph/.ralphrc'],
      },
    });

    await runOnboardCmd([]);

    expect(warn).toHaveBeenCalledWith(
      'bmalph artifacts detected \u2014 will be flagged for cleanup',
    );
  });

  it('imports stories on approval in combined mode', async () => {
    vi.mocked(promptApproval).mockResolvedValue(true);

    await runOnboardCmd([]);

    expect(promptApproval).toHaveBeenCalled();
    expect(importOnboardingEpic).toHaveBeenCalled();
    expect(ok).toHaveBeenCalledWith('Onboarding: 2 stories imported into beads');
    expect(info).toHaveBeenCalledWith('Ready to run: codeharness run');
  });

  it('does not import on rejection in combined mode', async () => {
    vi.mocked(promptApproval).mockResolvedValue(false);

    await runOnboardCmd([]);

    expect(promptApproval).toHaveBeenCalled();
    expect(importOnboardingEpic).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(
      'Plan saved to ralph/onboarding-epic.md \u2014 edit and re-run when ready',
    );
  });
});

describe('onboard scan subcommand', () => {
  it('runs only scan phase', async () => {
    await runOnboardCmd(['scan']);

    expect(scanCodebase).toHaveBeenCalled();
    expect(analyzeCoverageGaps).not.toHaveBeenCalled();
    expect(auditDocumentation).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(
      'Scan: 20 source files across 2 modules',
    );
  });

  it('outputs JSON with --json flag', async () => {
    await runOnboardCmd(['scan', '--json']);

    expect(jsonOutput).toHaveBeenCalledWith({
      preconditions: { initialized: true, bmad: true, hooks: true },
      scan: mockScanResult,
    });
  });
});

describe('onboard coverage subcommand', () => {
  it('runs only coverage phase', async () => {
    await runOnboardCmd(['coverage']);

    // scanCodebase is called to get module info for coverage
    expect(scanCodebase).toHaveBeenCalled();
    expect(analyzeCoverageGaps).toHaveBeenCalled();
    expect(auditDocumentation).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(
      'Coverage: 85.5% overall (3 files uncovered)',
    );
  });
});

describe('onboard audit subcommand', () => {
  it('runs only audit phase', async () => {
    await runOnboardCmd(['audit']);

    expect(scanCodebase).not.toHaveBeenCalled();
    expect(analyzeCoverageGaps).not.toHaveBeenCalled();
    expect(auditDocumentation).toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(
      'Docs: README.md(present) AGENTS.md(missing) ARCHITECTURE.md(missing)',
    );
  });
});

describe('onboard epic subcommand', () => {
  it('is registered as a subcommand', () => {
    const program = new Command();
    program.exitOverride();
    registerOnboardCommand(program);

    const onboard = program.commands.find(c => c.name() === 'onboard');
    expect(onboard).toBeDefined();

    const subcommandNames = onboard!.commands.map(c => c.name());
    expect(subcommandNames).toContain('epic');
  });

  it('triggers scan when lastScanResult is null', async () => {
    resetLastScanResult();

    await runOnboardCmd(['epic', '--auto-approve']);

    expect(scanCodebase).toHaveBeenCalled();
    expect(analyzeCoverageGaps).toHaveBeenCalled();
    expect(auditDocumentation).toHaveBeenCalled();
    expect(generateOnboardingEpic).toHaveBeenCalled();
  });

  it('generates epic and writes to ralph/onboarding-epic.md', async () => {
    await runOnboardCmd(['epic', '--auto-approve']);

    expect(writeOnboardingEpic).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Onboarding Epic: Bring Project to Harness Compliance' }),
      expect.stringContaining('ralph/onboarding-epic.md'),
    );
  });

  it('prints summary after epic generation', async () => {
    await runOnboardCmd(['epic', '--auto-approve']);

    expect(info).toHaveBeenCalledWith(
      'Onboarding plan: 2 stories (1 coverage, 1 documentation, 0 cleanup)',
    );
    expect(info).toHaveBeenCalledWith('  0.1: Create ARCHITECTURE.md');
    expect(info).toHaveBeenCalledWith('  0.2: Add test coverage for src/lib');
  });

  it('--auto-approve skips prompt and imports directly', async () => {
    await runOnboardCmd(['epic', '--auto-approve']);

    expect(promptApproval).not.toHaveBeenCalled();
    expect(importOnboardingEpic).toHaveBeenCalled();
    expect(ok).toHaveBeenCalledWith('Onboarding: 2 stories imported into beads');
    expect(info).toHaveBeenCalledWith('Ready to run: codeharness run');
  });

  it('prompts for approval without --auto-approve', async () => {
    vi.mocked(promptApproval).mockResolvedValue(true);

    await runOnboardCmd(['epic']);

    expect(promptApproval).toHaveBeenCalled();
    expect(importOnboardingEpic).toHaveBeenCalled();
  });

  it('does not import when user rejects', async () => {
    vi.mocked(promptApproval).mockResolvedValue(false);

    await runOnboardCmd(['epic']);

    expect(promptApproval).toHaveBeenCalled();
    expect(importOnboardingEpic).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(
      'Plan saved to ralph/onboarding-epic.md \u2014 edit and re-run when ready',
    );
  });

  it('--json outputs epic and import_status without prompt or import', async () => {
    await runOnboardCmd(['epic', '--json']);

    expect(promptApproval).not.toHaveBeenCalled();
    expect(importOnboardingEpic).not.toHaveBeenCalled();
    expect(jsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        epic: expect.objectContaining({ title: 'Onboarding Epic: Bring Project to Harness Compliance' }),
        import_status: { stories_created: 0, stories_existing: 0 },
      }),
    );
  });
});

describe('onboard JSON output', () => {
  it('produces valid JSON with all phases including epic', async () => {
    await runOnboardCmd(['--json']);

    expect(jsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        scan: mockScanResult,
        coverage: mockCoverageReport,
        audit: mockAuditResult,
        epic: expect.objectContaining({ title: 'Onboarding Epic: Bring Project to Harness Compliance' }),
      }),
    );
  });

  it('coverage subcommand JSON has only coverage key', async () => {
    await runOnboardCmd(['coverage', '--json']);

    expect(jsonOutput).toHaveBeenCalledWith({
      preconditions: { initialized: true, bmad: true, hooks: true },
      coverage: mockCoverageReport,
    });
  });

  it('audit subcommand JSON has only audit key', async () => {
    await runOnboardCmd(['audit', '--json']);

    expect(jsonOutput).toHaveBeenCalledWith({
      preconditions: { initialized: true, bmad: true, hooks: true },
      audit: mockAuditResult,
    });
  });
});

describe('onboard help', () => {
  it('shows --min-module-size option in help', () => {
    const program = new Command();
    program.exitOverride();
    registerOnboardCommand(program);

    const onboard = program.commands.find(c => c.name() === 'onboard');
    expect(onboard).toBeDefined();

    const helpInfo = onboard!.helpInformation();
    expect(helpInfo).toContain('--min-module-size');
  });

  it('shows --full option in help', () => {
    const program = new Command();
    program.exitOverride();
    registerOnboardCommand(program);

    const onboard = program.commands.find(c => c.name() === 'onboard');
    expect(onboard).toBeDefined();

    const helpInfo = onboard!.helpInformation();
    expect(helpInfo).toContain('--full');
  });

  it('has scan, coverage, audit, and epic subcommands', () => {
    const program = new Command();
    program.exitOverride();
    registerOnboardCommand(program);

    const onboard = program.commands.find(c => c.name() === 'onboard');
    expect(onboard).toBeDefined();

    const subcommandNames = onboard!.commands.map(c => c.name());
    expect(subcommandNames).toContain('scan');
    expect(subcommandNames).toContain('coverage');
    expect(subcommandNames).toContain('audit');
    expect(subcommandNames).toContain('epic');
  });

  it('epic subcommand shows --auto-approve option', () => {
    const program = new Command();
    program.exitOverride();
    registerOnboardCommand(program);

    const onboard = program.commands.find(c => c.name() === 'onboard');
    const epic = onboard!.commands.find(c => c.name() === 'epic');
    expect(epic).toBeDefined();

    const helpInfo = epic!.helpInformation();
    expect(helpInfo).toContain('--auto-approve');
  });
});

describe('onboard precondition checks', () => {
  it('fails with exit code 1 when harness not initialized', async () => {
    vi.mocked(runPreconditions).mockReturnValue({
      canProceed: false,
      warnings: [],
      initialized: false,
      bmad: false,
      hooks: false,
    });

    await runOnboardCmd([]);

    expect(fail).toHaveBeenCalledWith(
      'Harness not initialized \u2014 run codeharness init first',
    );
    expect(process.exitCode).toBe(1);
    expect(scanCodebase).not.toHaveBeenCalled();
  });

  it('prints warnings when BMAD not installed but continues', async () => {
    vi.mocked(runPreconditions).mockReturnValue({
      canProceed: true,
      warnings: ["BMAD not installed \u2014 generated stories won't be executable until init completes"],
      initialized: true,
      bmad: false,
      hooks: true,
    });

    await runOnboardCmd([]);

    expect(warn).toHaveBeenCalledWith(
      "BMAD not installed \u2014 generated stories won't be executable until init completes",
    );
    expect(scanCodebase).toHaveBeenCalled();
  });

  it('prints warnings when hooks not registered', async () => {
    vi.mocked(runPreconditions).mockReturnValue({
      canProceed: true,
      warnings: ["Hooks not registered \u2014 enforcement won't be active"],
      initialized: true,
      bmad: true,
      hooks: false,
    });

    await runOnboardCmd(['scan']);

    expect(warn).toHaveBeenCalledWith(
      "Hooks not registered \u2014 enforcement won't be active",
    );
  });

  it('precondition check runs on scan subcommand', async () => {
    vi.mocked(runPreconditions).mockReturnValue({
      canProceed: false,
      warnings: [],
      initialized: false,
      bmad: false,
      hooks: false,
    });

    await runOnboardCmd(['scan']);

    expect(fail).toHaveBeenCalledWith(
      'Harness not initialized \u2014 run codeharness init first',
    );
    expect(scanCodebase).not.toHaveBeenCalled();
  });

  it('precondition check runs on coverage subcommand', async () => {
    vi.mocked(runPreconditions).mockReturnValue({
      canProceed: false,
      warnings: [],
      initialized: false,
      bmad: false,
      hooks: false,
    });

    await runOnboardCmd(['coverage']);

    expect(fail).toHaveBeenCalledWith(
      'Harness not initialized \u2014 run codeharness init first',
    );
    expect(analyzeCoverageGaps).not.toHaveBeenCalled();
  });

  it('precondition check runs on audit subcommand', async () => {
    vi.mocked(runPreconditions).mockReturnValue({
      canProceed: false,
      warnings: [],
      initialized: false,
      bmad: false,
      hooks: false,
    });

    await runOnboardCmd(['audit']);

    expect(fail).toHaveBeenCalledWith(
      'Harness not initialized \u2014 run codeharness init first',
    );
    expect(auditDocumentation).not.toHaveBeenCalled();
  });

  it('precondition check runs on epic subcommand', async () => {
    vi.mocked(runPreconditions).mockReturnValue({
      canProceed: false,
      warnings: [],
      initialized: false,
      bmad: false,
      hooks: false,
    });

    await runOnboardCmd(['epic', '--auto-approve']);

    expect(fail).toHaveBeenCalledWith(
      'Harness not initialized \u2014 run codeharness init first',
    );
    expect(generateOnboardingEpic).not.toHaveBeenCalled();
  });
});

describe('onboard gap filtering', () => {
  it('calls filterTrackedGaps on default action and reports tracked count', async () => {
    vi.mocked(filterTrackedGaps).mockReturnValue({
      untracked: [
        { key: '0.2', title: 'Add test coverage for src/lib', type: 'coverage', module: 'src/lib', acceptanceCriteria: ['AC2'] },
      ],
      trackedCount: 1,
    });

    await runOnboardCmd([]);

    expect(filterTrackedGaps).toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith('1 previously tracked gaps already in beads');
  });

  it('calls filterTrackedGaps on epic subcommand', async () => {
    vi.mocked(filterTrackedGaps).mockReturnValue({
      untracked: [],
      trackedCount: 2,
    });

    await runOnboardCmd(['epic', '--auto-approve']);

    expect(filterTrackedGaps).toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith('2 previously tracked gaps already in beads');
  });

  it('skips gap filtering when --full flag is set', async () => {
    await runOnboardCmd(['--full']);

    expect(filterTrackedGaps).not.toHaveBeenCalled();
  });

  it('skips gap filtering on epic with --full', async () => {
    await runOnboardCmd(['epic', '--auto-approve', '--full']);

    expect(filterTrackedGaps).not.toHaveBeenCalled();
  });

  it('does not print tracked message when trackedCount is 0', async () => {
    vi.mocked(filterTrackedGaps).mockReturnValue({
      untracked: [
        { key: '0.1', title: 'Create ARCHITECTURE.md', type: 'architecture', acceptanceCriteria: ['AC1'] },
      ],
      trackedCount: 0,
    });

    await runOnboardCmd([]);

    expect(info).not.toHaveBeenCalledWith(
      expect.stringContaining('previously tracked gaps already in beads'),
    );
  });

  it('includes preconditions in JSON output for default action', async () => {
    await runOnboardCmd(['--json']);

    expect(jsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        preconditions: { initialized: true, bmad: true, hooks: true },
      }),
    );
  });

  it('includes preconditions in JSON output for epic subcommand', async () => {
    await runOnboardCmd(['epic', '--json']);

    expect(jsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        preconditions: { initialized: true, bmad: true, hooks: true },
      }),
    );
  });

  it('--force-scan flag is accepted and bypasses cache', async () => {
    // loadValidCache returns null by default (mocked), so fresh scan runs
    await runOnboardCmd(['coverage', '--force-scan']);

    // loadValidCache called with forceScan: true
    expect(loadValidCache).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ forceScan: true }),
    );
    // Fresh scan should be called
    expect(scanCodebase).toHaveBeenCalled();
  });

  it('reuses cached scan when valid cache exists', async () => {
    vi.mocked(loadValidCache).mockReturnValue({
      timestamp: '2026-03-15T10:00:00.000Z',
      scan: mockScanResult,
      coverage: null,
      audit: null,
    });

    await runOnboardCmd(['coverage']);

    // scanCodebase should NOT be called since cache is used
    expect(scanCodebase).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('Using cached scan from'),
    );
  });

  it('prints progress message when onboarding gaps exist', async () => {
    vi.mocked(getOnboardingProgress).mockReturnValue({
      total: 7,
      resolved: 3,
      remaining: 4,
    });

    await runOnboardCmd([]);

    expect(info).toHaveBeenCalledWith(
      'Onboarding progress: 3/7 gaps resolved (4 remaining)',
    );
  });

  it('prints "Onboarding complete" when all gaps resolved', async () => {
    vi.mocked(getOnboardingProgress).mockReturnValue({
      total: 5,
      resolved: 5,
      remaining: 0,
    });

    await runOnboardCmd([]);

    expect(ok).toHaveBeenCalledWith('Onboarding complete \u2014 all gaps resolved');
    // Should not proceed to scanning
    expect(scanCodebase).not.toHaveBeenCalled();
  });

  it('does not exit early when all resolved but --full is passed', async () => {
    vi.mocked(getOnboardingProgress).mockReturnValue({
      total: 5,
      resolved: 5,
      remaining: 0,
    });

    await runOnboardCmd(['--full']);

    // Should still show progress line and proceed
    expect(info).toHaveBeenCalledWith(
      'Onboarding progress: 5/5 gaps resolved (0 remaining)',
    );
    expect(scanCodebase).toHaveBeenCalled();
  });

  it('does not exit early when all resolved but --force-scan is passed', async () => {
    vi.mocked(getOnboardingProgress).mockReturnValue({
      total: 5,
      resolved: 5,
      remaining: 0,
    });

    await runOnboardCmd(['--force-scan']);

    // Should still show progress line and proceed
    expect(info).toHaveBeenCalledWith(
      'Onboarding progress: 5/5 gaps resolved (0 remaining)',
    );
    expect(scanCodebase).toHaveBeenCalled();
  });

  it('saves scan cache after combined onboard run', async () => {
    await runOnboardCmd([]);

    expect(saveScanCache).toHaveBeenCalledWith(
      expect.objectContaining({
        timestamp: expect.any(String),
        scan: mockScanResult,
        coverage: mockCoverageReport,
        audit: mockAuditResult,
      }),
    );
  });

  it('shows --force-scan option in help', () => {
    const program = new Command();
    program.exitOverride();
    registerOnboardCommand(program);

    const onboard = program.commands.find(c => c.name() === 'onboard');
    expect(onboard).toBeDefined();

    const helpInfo = onboard!.helpInformation();
    expect(helpInfo).toContain('--force-scan');
  });

  it('merges extended gaps from verification, coverage, and observability detectors', async () => {
    vi.mocked(findVerificationGaps).mockReturnValue([
      { key: '0.v1', title: 'Create verification proof for 4-1-test', type: 'verification', storyKey: '4-1-test', acceptanceCriteria: ['AC'] },
    ]);
    vi.mocked(findPerFileCoverageGaps).mockReturnValue([
      { key: '0.fc1', title: 'Add test coverage for src/lib/low.ts', type: 'coverage', module: 'src/lib/low.ts', acceptanceCriteria: ['AC'] },
    ]);
    vi.mocked(findObservabilityGaps).mockReturnValue([
      { key: '0.o1', title: 'Configure OTLP instrumentation', type: 'observability', module: 'otlp-config', acceptanceCriteria: ['AC'] },
    ]);

    await runOnboardCmd(['epic', '--auto-approve', '--full']);

    // writeOnboardingEpic should receive the epic with merged stories
    const epicArg = vi.mocked(writeOnboardingEpic).mock.calls[0][0];
    const titles = epicArg.stories.map((s: any) => s.title);
    expect(titles).toContain('Create verification proof for 4-1-test');
    expect(titles).toContain('Add test coverage for src/lib/low.ts');
    expect(titles).toContain('Configure OTLP instrumentation');
    // Summary should be rebuilt with extended gap counts
    expect(epicArg.summary.verificationStories).toBe(1);
    expect(epicArg.summary.observabilityStories).toBe(1);
    // Original 1 coverage + 1 new per-file coverage = 2
    expect(epicArg.summary.coverageStories).toBe(2);
  });
});
