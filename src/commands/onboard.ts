import { Command } from 'commander';
import { join } from 'node:path';
import { ok, fail, info, warn, jsonOutput } from '../lib/output.js';
import {
  scanCodebase,
  analyzeCoverageGaps,
  auditDocumentation,
} from '../lib/scanner.js';
import type {
  ScanResult,
  CoverageGapReport,
  DocAuditResult,
} from '../lib/scanner.js';
import {
  generateOnboardingEpic,
  writeOnboardingEpic,
  formatEpicSummary,
  promptApproval,
  importOnboardingEpic,
} from '../lib/epic-generator.js';
import type { OnboardingEpic } from '../lib/epic-generator.js';
import { listIssues, createIssue } from '../lib/beads.js';
import {
  runPreconditions,
  filterTrackedGaps,
  findVerificationGaps,
  findPerFileCoverageGaps,
  findObservabilityGaps,
  getOnboardingProgress,
} from '../lib/onboard-checks.js';
import { saveScanCache, loadValidCache } from '../lib/scan-cache.js';

// ─── Shared state for passing results between phases ─────────────────────────

let lastScanResult: ScanResult | null = null;
let lastCoverageResult: CoverageGapReport | null = null;
let lastAuditResult: DocAuditResult | null = null;

export function getLastScanResult(): ScanResult | null {
  return lastScanResult;
}

export function getLastCoverageResult(): CoverageGapReport | null {
  return lastCoverageResult;
}

export function getLastAuditResult(): DocAuditResult | null {
  return lastAuditResult;
}

export function resetLastScanResult(): void {
  lastScanResult = null;
  lastCoverageResult = null;
  lastAuditResult = null;
}

// ─── Command Registration ────────────────────────────────────────────────────

export function registerOnboardCommand(program: Command): void {
  const onboard = program
    .command('onboard')
    .description('Onboard an existing codebase into the harness')
    .option('--min-module-size <n>', 'Minimum files to count as a module', '3')
    .option('--full', 'Show all gaps regardless of existing beads issues')
    .option('--force-scan', 'Ignore cached scan and perform a fresh scan');

  // Subcommand: scan
  onboard
    .command('scan')
    .description('Scan codebase for modules and artifacts')
    .action((_, cmd) => {
      const opts = cmd.optsWithGlobals();
      const isJson = opts.json === true;
      const minModuleSize = parseInt(opts.minModuleSize ?? '3', 10);

      const preconditions = runPreconditions();
      if (!preconditions.canProceed) {
        fail('Harness not initialized \u2014 run codeharness init first');
        process.exitCode = 1;
        return;
      }
      for (const w of preconditions.warnings) {
        warn(w);
      }

      const result = runScan(minModuleSize);

      // Save scan to cache (coverage and audit not yet run)
      saveScanCache({
        timestamp: new Date().toISOString(),
        scan: result,
        coverage: null,
        audit: null,
      });

      if (isJson) {
        jsonOutput({ preconditions: { initialized: preconditions.initialized, bmad: preconditions.bmad, hooks: preconditions.hooks }, scan: result });
      } else {
        printScanOutput(result);
      }
    });

  // Subcommand: coverage
  onboard
    .command('coverage')
    .description('Analyze per-module coverage gaps')
    .action((_, cmd) => {
      const opts = cmd.optsWithGlobals();
      const isJson = opts.json === true;
      const forceScan = opts.forceScan === true;
      const minModuleSize = parseInt(opts.minModuleSize ?? '3', 10);

      const preconditions = runPreconditions();
      if (!preconditions.canProceed) {
        fail('Harness not initialized \u2014 run codeharness init first');
        process.exitCode = 1;
        return;
      }
      for (const w of preconditions.warnings) {
        warn(w);
      }

      // Try cached scan first
      let scan: ScanResult;
      if (lastScanResult) {
        scan = lastScanResult;
      } else {
        const cache = loadValidCache(process.cwd(), { forceScan });
        if (cache) {
          info(`Using cached scan from ${new Date(cache.timestamp).toLocaleString()}`);
          scan = cache.scan;
          lastScanResult = scan;
        } else {
          scan = runScan(minModuleSize);
        }
      }
      const result = runCoverageAnalysis(scan);

      if (isJson) {
        jsonOutput({ preconditions: { initialized: preconditions.initialized, bmad: preconditions.bmad, hooks: preconditions.hooks }, coverage: result });
      } else {
        printCoverageOutput(result);
      }
    });

  // Subcommand: audit
  onboard
    .command('audit')
    .description('Audit project documentation')
    .action((_, cmd) => {
      const opts = cmd.optsWithGlobals();
      const isJson = opts.json === true;

      const preconditions = runPreconditions();
      if (!preconditions.canProceed) {
        fail('Harness not initialized \u2014 run codeharness init first');
        process.exitCode = 1;
        return;
      }
      for (const w of preconditions.warnings) {
        warn(w);
      }

      const result = runAudit();

      if (isJson) {
        jsonOutput({ preconditions: { initialized: preconditions.initialized, bmad: preconditions.bmad, hooks: preconditions.hooks }, audit: result });
      } else {
        printAuditOutput(result);
      }
    });

  // Subcommand: epic
  onboard
    .command('epic')
    .description('Generate onboarding epic from scan findings')
    .option('--auto-approve', 'Skip interactive prompt and import directly')
    .action(async (epicOpts, cmd) => {
      const opts = cmd.optsWithGlobals();
      const isJson = opts.json === true;
      const autoApprove = epicOpts.autoApprove === true;
      const isFull = opts.full === true;
      const forceScan = opts.forceScan === true;
      const minModuleSize = parseInt(opts.minModuleSize ?? '3', 10);

      const preconditions = runPreconditions();
      if (!preconditions.canProceed) {
        fail('Harness not initialized \u2014 run codeharness init first');
        process.exitCode = 1;
        return;
      }
      for (const w of preconditions.warnings) {
        warn(w);
      }

      // Ensure scan results are available — try cache first
      let scan: ScanResult;
      let coverage: CoverageGapReport;
      let audit: DocAuditResult;

      if (lastScanResult) {
        scan = lastScanResult;
      } else {
        const cache = loadValidCache(process.cwd(), { forceScan });
        if (cache) {
          info(`Using cached scan from ${new Date(cache.timestamp).toLocaleString()}`);
          scan = cache.scan;
          lastScanResult = scan;
          if (cache.coverage) {
            lastCoverageResult = cache.coverage;
          }
          if (cache.audit) {
            lastAuditResult = cache.audit;
          }
        } else {
          scan = runScan(minModuleSize);
        }
      }
      coverage = lastCoverageResult ?? runCoverageAnalysis(scan);
      audit = lastAuditResult ?? runAudit();

      const epicPath = join(process.cwd(), 'ralph', 'onboarding-epic.md');
      const epic = generateOnboardingEpic(scan, coverage, audit);

      // Merge extended gap detectors (story 8-3)
      mergeExtendedGaps(epic);

      // Gap filtering: skip already-tracked gaps unless --full
      if (!isFull) {
        applyGapFiltering(epic);
      }

      writeOnboardingEpic(epic, epicPath);

      if (isJson) {
        // JSON mode: read-only, no prompt, no import (AC #7 for --json)
        jsonOutput({
          preconditions: { initialized: preconditions.initialized, bmad: preconditions.bmad, hooks: preconditions.hooks },
          epic,
          import_status: { stories_created: 0, stories_existing: 0 },
        });
        return;
      }

      // Print summary
      printEpicOutput(epic);

      // Approval flow
      let approved: boolean;
      if (autoApprove) {
        approved = true;
      } else {
        approved = await promptApproval();
      }

      if (approved) {
        const results = importOnboardingEpic(epicPath, { listIssues, createIssue });
        const created = results.filter(r => r.status === 'created').length;
        ok(`Onboarding: ${created} stories imported into beads`);
        info('Ready to run: codeharness run');
      } else {
        info('Plan saved to ralph/onboarding-epic.md \u2014 edit and re-run when ready');
      }
    });

  // Default action: run all phases including epic generation
  onboard.action(async (opts, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    const isJson = opts.json === true || globalOpts.json === true;
    const isFull = opts.full === true || globalOpts.full === true;
    const forceScan = opts.forceScan === true || globalOpts.forceScan === true;
    const minModuleSize = parseInt(opts.minModuleSize ?? '3', 10);

    const preconditions = runPreconditions();
    if (!preconditions.canProceed) {
      fail('Harness not initialized \u2014 run codeharness init first');
      process.exitCode = 1;
      return;
    }
    for (const w of preconditions.warnings) {
      warn(w);
    }

    // Check onboarding progress
    const progress = getOnboardingProgress({ listIssues });
    if (progress) {
      if (progress.remaining === 0 && !isFull && !forceScan) {
        ok('Onboarding complete \u2014 all gaps resolved');
        return;
      }
      info(`Onboarding progress: ${progress.resolved}/${progress.total} gaps resolved (${progress.remaining} remaining)`);
    }

    // Phase 1: Scan
    const scan = runScan(minModuleSize);

    // Phase 2: Coverage
    const coverage = runCoverageAnalysis(scan);

    // Phase 3: Audit
    const audit = runAudit();

    // Save complete cache entry
    saveScanCache({
      timestamp: new Date().toISOString(),
      scan,
      coverage,
      audit,
    });

    // Phase 4: Epic generation
    const epicPath = join(process.cwd(), 'ralph', 'onboarding-epic.md');
    const epic = generateOnboardingEpic(scan, coverage, audit);

    // Merge extended gap detectors (story 8-3)
    mergeExtendedGaps(epic);

    // Gap filtering: skip already-tracked gaps unless --full
    if (!isFull) {
      applyGapFiltering(epic);
    }

    writeOnboardingEpic(epic, epicPath);

    if (isJson) {
      jsonOutput({
        preconditions: { initialized: preconditions.initialized, bmad: preconditions.bmad, hooks: preconditions.hooks },
        scan,
        coverage,
        audit,
        epic,
      });
    } else {
      printScanOutput(scan);
      printCoverageOutput(coverage);
      printAuditOutput(audit);
      printEpicOutput(epic);

      // Prompt for approval in combined mode
      const approved = await promptApproval();
      if (approved) {
        const results = importOnboardingEpic(epicPath, { listIssues, createIssue });
        const created = results.filter(r => r.status === 'created').length;
        ok(`Onboarding: ${created} stories imported into beads`);
        info('Ready to run: codeharness run');
      } else {
        info('Plan saved to ralph/onboarding-epic.md \u2014 edit and re-run when ready');
      }
    }
  });
}

// ─── Gap Filtering Helper ────────────────────────────────────────────────────

function applyGapFiltering(epic: OnboardingEpic): void {
  const { untracked, trackedCount } = filterTrackedGaps(epic.stories, { listIssues });
  if (trackedCount > 0) {
    info(`${trackedCount} previously tracked gaps already in beads`);
  }
  epic.stories = untracked;
  rebuildEpicSummary(epic);
}

function mergeExtendedGaps(epic: OnboardingEpic): void {
  const verificationGaps = findVerificationGaps();
  const perFileCoverageGaps = findPerFileCoverageGaps(80);
  const observabilityGaps = findObservabilityGaps();

  epic.stories.push(...verificationGaps, ...perFileCoverageGaps, ...observabilityGaps);
  rebuildEpicSummary(epic);
}

function rebuildEpicSummary(epic: OnboardingEpic): void {
  const coverageStories = epic.stories.filter(s => s.type === 'coverage').length;
  const docStories = epic.stories.filter(
    s => s.type === 'agents-md' || s.type === 'architecture' || s.type === 'doc-freshness',
  ).length;
  const cleanupStories = epic.stories.filter(s => s.type === 'bmalph-cleanup').length;
  const verificationStories = epic.stories.filter(s => s.type === 'verification').length;
  const observabilityStories = epic.stories.filter(s => s.type === 'observability').length;
  epic.summary = {
    totalStories: epic.stories.length,
    coverageStories,
    docStories,
    cleanupStories,
    verificationStories,
    observabilityStories,
  };
}

// ─── Phase Implementations ───────────────────────────────────────────────────

function runScan(minModuleSize: number): ScanResult {
  const result = scanCodebase(process.cwd(), { minModuleSize });
  lastScanResult = result;
  return result;
}

function runCoverageAnalysis(scan: ScanResult): CoverageGapReport {
  const result = analyzeCoverageGaps(scan.modules);
  lastCoverageResult = result;
  return result;
}

function runAudit(): DocAuditResult {
  const result = auditDocumentation();
  lastAuditResult = result;
  return result;
}

// ─── Output Formatting ──────────────────────────────────────────────────────

function printScanOutput(result: ScanResult): void {
  info(`Scan: ${result.totalSourceFiles} source files across ${result.modules.length} modules`);
  if (result.artifacts.hasBmalph) {
    warn('bmalph artifacts detected \u2014 will be flagged for cleanup');
  }
}

function printCoverageOutput(result: CoverageGapReport): void {
  info(`Coverage: ${result.overall}% overall (${result.uncoveredFiles} files uncovered)`);
}

function printAuditOutput(result: DocAuditResult): void {
  info(`Docs: ${result.summary}`);
}

function printEpicOutput(epic: OnboardingEpic): void {
  info(formatEpicSummary(epic));
  for (const story of epic.stories) {
    info(`  ${story.key}: ${story.title}`);
  }
}
