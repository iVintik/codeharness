# Story 6.1: Codebase Scan & Gap Analysis

Status: ready-for-dev

## Story

As a developer with an existing project,
I want to run `codeharness onboard` to understand what my project needs to reach full harness compliance,
So that I get a clear picture of gaps before committing to the onboarding process.

## Acceptance Criteria

1. **Given** a developer runs `codeharness onboard` in an existing project, **When** the scan phase executes, **Then** source files are discovered and modules are identified, **And** module detection uses a configurable minimum threshold (default: 3 files to count as a module, NFR27), **And** subdirectories below the threshold are grouped with their parent module, **And** `[INFO] Scan: <N> source files across <M> modules` is printed.

2. **Given** `codeharness onboard --min-module-size <N>` is specified, **When** modules are detected, **Then** the custom threshold is used instead of the default 3.

3. **Given** the scan completes module detection, **When** coverage analysis runs, **Then** `src/lib/coverage.ts` detects the coverage tool and runs coverage, **And** a gap report is produced showing: per-module coverage percentage, uncovered files count, overall project coverage, **And** `[INFO] Coverage: <X>% overall (<N> files uncovered)` is printed.

4. **Given** the scan completes coverage analysis, **When** documentation audit runs, **Then** existing documentation is checked: README.md, AGENTS.md, ARCHITECTURE.md, docs/ directory, **And** each document gets a quality grade: present/stale/missing, **And** `[INFO] Docs: README(present) AGENTS.md(missing) ARCHITECTURE.md(missing)` is printed.

5. **Given** the scan detects bmalph artifacts, **When** `.ralph/.ralphrc` or bmalph CLI config files are found, **Then** they are flagged as superseded files for cleanup, **And** existing BMAD artifacts (`_bmad/`) are preserved.

6. **Given** `codeharness onboard scan --json`, **When** the scan completes, **Then** JSON output includes modules array, coverage data, doc audit results, and detected artifacts.

7. **Given** subcommands are available, **When** the developer wants to run individual phases, **Then** `codeharness onboard scan` runs only module detection, **And** `codeharness onboard coverage` runs only coverage analysis, **And** `codeharness onboard audit` runs only documentation audit.

## Tasks / Subtasks

- [ ] Task 1: Create `src/lib/scanner.ts` — codebase scanning and module detection (AC: #1, #2)
  - [ ] 1.1: Define types: `ScanResult { modules: ModuleInfo[], totalSourceFiles: number, artifacts: DetectedArtifacts }`, `ModuleInfo { path: string, sourceFiles: number, testFiles: number }`, `DetectedArtifacts { hasBmad: boolean, hasBmalph: boolean, bmadPath: string | null, bmalpthFiles: string[] }`.
  - [ ] 1.2: Implement `scanCodebase(dir: string, options?: { minModuleSize?: number }): ScanResult`. Reuse `findModules()` from `src/lib/doc-health.ts` for the module detection walk — that function already handles the threshold, skips node_modules/.git, and filters test files. Adapt or call it directly with the `threshold` parameter mapped from `minModuleSize`.
  - [ ] 1.3: Count total source files across the entire project (not just within modules). Walk the directory tree counting `.ts`, `.js`, `.py` files (excluding test files, node_modules, .git). This gives the "N source files" number for the `[INFO] Scan:` output.
  - [ ] 1.4: For each detected module, count source files and test files separately. This enables per-module coverage gap analysis in Task 3.
  - [ ] 1.5: Implement artifact detection: check for `_bmad/` directory (preserve), `.ralph/.ralphrc` (flag as superseded), any `.ralph/` config files. Return these in `DetectedArtifacts`.
  - [ ] 1.6: Implement parent-grouping logic for subdirectories below the module threshold. When a subdirectory has fewer than `minModuleSize` source files, it should not appear as a standalone module — its files are counted under the parent directory's module if the parent qualifies.

- [ ] Task 2: Implement per-module coverage analysis in `src/lib/scanner.ts` (AC: #3)
  - [ ] 2.1: Define `CoverageGapReport { overall: number, modules: ModuleCoverageInfo[], uncoveredFiles: number }`, `ModuleCoverageInfo { path: string, coveragePercent: number, uncoveredFileCount: number }`.
  - [ ] 2.2: Implement `analyzeCoverageGaps(modules: ModuleInfo[], dir?: string): CoverageGapReport`. Use `detectCoverageTool()` and `runCoverage()` from `src/lib/coverage.ts` to get overall coverage. Parse the coverage report JSON (vitest or coverage.py format) to extract per-file coverage data, then aggregate by module path.
  - [ ] 2.3: For each module, compute: files with 0% coverage (uncovered), files with partial coverage, and module-level coverage percentage. Count total uncovered files across all modules.
  - [ ] 2.4: Handle the case where no coverage tool is detected — return a report with `overall: 0` and all modules showing 0% coverage, with a warning message.

- [ ] Task 3: Implement documentation audit in `src/lib/scanner.ts` (AC: #4)
  - [ ] 3.1: Define `DocAuditResult { documents: DocAuditEntry[], summary: string }`, `DocAuditEntry { name: string, grade: 'present' | 'stale' | 'missing', path: string | null }`.
  - [ ] 3.2: Implement `auditDocumentation(dir?: string): DocAuditResult`. Check for: `README.md`, `AGENTS.md`, `ARCHITECTURE.md`, `docs/` directory, `docs/index.md`. For each: if missing, grade is `missing`; if present, check staleness using `isDocStale()` from `src/lib/doc-health.ts` (compare doc mtime against source code mtime); if stale, grade is `stale`; otherwise `present`.
  - [ ] 3.3: Generate the summary string in format: `README(present) AGENTS.md(missing) ARCHITECTURE.md(missing)`.

- [ ] Task 4: Replace onboard command stub with full implementation in `src/commands/onboard.ts` (AC: #1-#7)
  - [ ] 4.1: Replace the stub in `src/commands/onboard.ts`. Register the `onboard` command with Commander.js including option `--min-module-size <n>` (default 3) and global `--json` flag support.
  - [ ] 4.2: Register subcommands: `onboard scan`, `onboard coverage`, `onboard audit`. Each runs only its respective phase. The bare `onboard` command (no subcommand) runs all three phases sequentially.
  - [ ] 4.3: Implement the `scan` subcommand: call `scanCodebase()`, print `[INFO] Scan: <N> source files across <M> modules`. If bmalph artifacts detected, print `[WARN] bmalph artifacts detected — will be flagged for cleanup`.
  - [ ] 4.4: Implement the `coverage` subcommand: call `analyzeCoverageGaps()`, print `[INFO] Coverage: <X>% overall (<N> files uncovered)`.
  - [ ] 4.5: Implement the `audit` subcommand: call `auditDocumentation()`, print `[INFO] Docs: <summary string>`.
  - [ ] 4.6: Implement JSON output for all subcommands and the combined run. When `--json` is passed, output a single JSON object with `{ scan: ScanResult, coverage: CoverageGapReport, audit: DocAuditResult }` (only populated fields for individual subcommands).
  - [ ] 4.7: Store scan results in memory (or a temp file) so that Story 6.2 can consume them for epic generation. The combined `onboard` command should pass results forward to the epic generation phase.

- [ ] Task 5: Write unit tests for `src/lib/scanner.ts` (AC: #1-#5)
  - [ ] 5.1: Create `src/lib/__tests__/scanner.test.ts`. Test `scanCodebase()` with a fixture directory containing known source files — verify correct module count and source file count.
  - [ ] 5.2: Test `--min-module-size` option — verify threshold 1 produces more modules than threshold 5 for the same directory.
  - [ ] 5.3: Test artifact detection — create fixture with `.ralph/.ralphrc` and `_bmad/` directory, verify `hasBmalph: true` and `hasBmad: true`, verify `_bmad/` is preserved (not flagged as superseded).
  - [ ] 5.4: Test parent-grouping logic — verify that a subdirectory with 1 file is not reported as a module when threshold is 3, but its files are counted under the parent if the parent qualifies.
  - [ ] 5.5: Test `auditDocumentation()` — verify correct grades for present, stale, and missing documents.
  - [ ] 5.6: Test `analyzeCoverageGaps()` — mock `runCoverage()` to return known coverage data, verify per-module aggregation.

- [ ] Task 6: Write unit tests for `src/commands/onboard.ts` (AC: #1, #2, #6, #7)
  - [ ] 6.1: Create `src/commands/__tests__/onboard.test.ts`. Test that `codeharness onboard --help` shows `--min-module-size` option.
  - [ ] 6.2: Test subcommand registration — verify `onboard scan`, `onboard coverage`, `onboard audit` are recognized.
  - [ ] 6.3: Test JSON output mode — verify `--json` produces valid JSON with expected structure.
  - [ ] 6.4: Test that the combined `onboard` command runs all three phases and produces all output lines.
  - [ ] 6.5: Mock `scanCodebase`, `analyzeCoverageGaps`, `auditDocumentation` — do NOT run real scans in unit tests.

- [ ] Task 7: Build and verify (AC: #1-#7)
  - [ ] 7.1: Run `npm run build` — verify tsup compiles successfully with new scanner.ts and updated onboard.ts.
  - [ ] 7.2: Run `npm test` — verify all unit tests pass including new scanner and onboard tests.
  - [ ] 7.3: Verify `codeharness onboard --help` shows usage with `--min-module-size` option and subcommands.
  - [ ] 7.4: Verify `codeharness onboard scan --json` produces valid JSON output when run in the codeharness project itself (dogfooding).
  - [ ] 7.5: Verify 100% test coverage is maintained — run `npm run test:coverage` and check no regressions.

## Dev Notes

### Architecture Context

The `codeharness onboard` command is the entry point for brownfield onboarding (Architecture Decision 9). It's a multi-phase pipeline: scan -> coverage -> audit -> epic generation (Story 6.2) -> beads import (Story 6.2). This story implements the first three phases.

The architecture document specifies `src/lib/scanner.ts` as the home for codebase scanning and module detection. However, `src/lib/doc-health.ts` already implements `findModules()` with the configurable threshold, test file exclusion, and directory walking. The scanner should reuse this function rather than reimplementing it.

### Key Files to Modify

| File | Change |
|------|--------|
| `src/commands/onboard.ts` | Replace stub with full implementation including subcommands |
| `src/lib/scanner.ts` | New — codebase scanning, coverage gap analysis, doc audit |
| `src/lib/__tests__/scanner.test.ts` | New — unit tests for scanner |
| `src/commands/__tests__/onboard.test.ts` | New — unit tests for onboard command |

### Existing Code to Leverage

- `src/lib/doc-health.ts` — `findModules(dir, threshold)` already implements configurable module detection with threshold, skips node_modules/.git, excludes test files. Reuse directly.
- `src/lib/doc-health.ts` — `isDocStale(docPath, codeDir)` checks freshness by comparing doc mtime against source mtime. Use for doc audit.
- `src/lib/doc-health.ts` — `scanDocHealth(dir)` runs a full doc health scan including AGENTS.md, docs/index.md, exec-plans. Relevant for the audit phase.
- `src/lib/coverage.ts` — `detectCoverageTool(dir)`, `runCoverage(dir)`, `parseCoverageReport()` handle coverage tool detection, execution, and report parsing. Use for coverage gap analysis.
- `src/lib/stack-detect.ts` — `detectStack(dir)` identifies Node.js or Python projects. May be useful for context in scan output.
- `src/lib/output.ts` — `ok()`, `fail()`, `warn()`, `info()`, `jsonOutput()` for CLI output formatting.

### Module Detection: Threshold and Parent Grouping

The `findModules()` function in doc-health.ts walks directories and counts source files per directory. Directories with fewer than `threshold` source files are not reported as modules. The architecture (Decision 9, NFR27) specifies that subdirectories below threshold should be "grouped with parent."

In practice: if `src/commands/` has 8 source files (module) and `src/commands/utils/` has 1 file (below threshold), `utils/` is not a standalone module — its files are already counted under the parent when computing coverage. The `findModules()` function already achieves this by simply not returning below-threshold directories.

### Per-Module Coverage Analysis

The `runCoverage()` function runs the project-wide coverage command and parses the report. For per-module breakdown, the scanner needs to read the coverage report JSON directly (e.g., `coverage/coverage-summary.json` for vitest/c8) and map file paths to detected modules. Each file in the report whose path falls within a module directory contributes to that module's coverage percentage.

### Artifact Detection

bmalph detection looks for:
- `.ralph/.ralphrc` — bmalph configuration file (superseded by codeharness)
- `.ralph/` directory with bmalph-specific files (not the vendored Ralph in the codeharness package itself)
- Any `.ralphrc` in the project root

BMAD detection looks for:
- `_bmad/` directory — preserved, not superseded

### NFR Compliance

- **NFR23:** Doc-gardener scan must complete within 60 seconds — the doc audit phase reuses `scanDocHealth()` which is already NFR23-compliant.
- **NFR27:** Module detection threshold must be configurable (default: 3 files) — implemented via `--min-module-size` CLI option and `minModuleSize` parameter.
- **NFR5:** `codeharness init` <5 min — onboard is separate from init but should also be reasonably fast. Coverage analysis may take time (runs tests); individual subcommands allow phased execution.
