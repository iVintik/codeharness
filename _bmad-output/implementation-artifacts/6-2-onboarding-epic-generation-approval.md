# Story 6.2: Onboarding Epic Generation & Approval

Status: ready-for-dev

## Story

As a developer with an existing project,
I want codeharness to generate an onboarding plan from scan findings and let me approve it,
So that I can review what will be done before the autonomous loop starts working on my project.

## Acceptance Criteria

1. **Given** scan findings are complete (modules, coverage gaps, doc audit), **When** `codeharness onboard epic` generates the onboarding plan, **Then** an onboarding epic is created with stories based on findings: one coverage story per module below 100% coverage, one story for AGENTS.md generation per module needing it, one story for ARCHITECTURE.md if missing, one story for doc freshness if stale docs detected, one story for bmalph cleanup if bmalph artifacts found, **And** the epic is written to `ralph/onboarding-epic.md`.

2. **Given** the onboarding epic is generated, **When** it is presented to the developer, **Then** the plan summary shows: total stories, coverage stories count, doc stories count, **And** each story has clear scope and acceptance criteria, **And** the developer is prompted: `Review the onboarding plan. Approve? [Y/n]`.

3. **Given** the developer approves the plan, **When** approval is confirmed, **Then** all onboarding stories are imported into beads via `codeharness bridge --epics ralph/onboarding-epic.md`, **And** each finding becomes a beads issue with `type=task` and priority from severity, **And** `[OK] Onboarding: <N> stories imported into beads` is printed, **And** `Ready to run: codeharness run` is displayed.

4. **Given** the developer rejects or wants to modify the plan, **When** they respond with `n` or provide feedback, **Then** the plan is not imported into beads, **And** the epic file remains at `ralph/onboarding-epic.md` for manual editing, **And** `[INFO] Plan saved to ralph/onboarding-epic.md — edit and re-run when ready` is printed.

5. **Given** `codeharness onboard --json`, **When** the full onboard pipeline completes, **Then** JSON output includes scan results, generated stories, and import status.

6. **Given** `codeharness onboard epic --auto-approve`, **When** the epic subcommand runs, **Then** approval is skipped and stories are imported directly into beads without interactive prompt, enabling non-interactive/CI usage.

7. **Given** scan results are not yet available (no prior `onboard scan` run in the same session), **When** `codeharness onboard epic` is run standalone, **Then** the scan phase runs automatically first to produce the required findings before epic generation.

## Tasks / Subtasks

- [ ] Task 1: Create `src/lib/epic-generator.ts` — onboarding epic generation from scan findings (AC: #1)
  - [ ] 1.1: Define types: `OnboardingStory { key: string, title: string, type: 'coverage' | 'agents-md' | 'architecture' | 'doc-freshness' | 'bmalph-cleanup', module?: string, acceptanceCriteria: string[] }`, `OnboardingEpic { title: string, generatedAt: string, stories: OnboardingStory[], summary: EpicSummary }`, `EpicSummary { totalStories: number, coverageStories: number, docStories: number, cleanupStories: number }`.
  - [ ] 1.2: Implement `generateOnboardingEpic(scan: ScanResult, coverage: CoverageGapReport, audit: DocAuditResult): OnboardingEpic`. This is the core function that maps findings to stories:
    - For each module in `coverage.modules` where `coveragePercent < 100`: create a coverage story with key `O.<N>`, title `Add test coverage for <module>`, acceptance criteria referencing the module's source file count and current coverage percentage.
    - For each module in `scan.modules`: check if `<module>/AGENTS.md` exists — if not, create an AGENTS.md story.
    - If `audit.documents` has `ARCHITECTURE.md` with grade `missing`: create an architecture doc story.
    - If any document in `audit.documents` has grade `stale`: create a doc-freshness story listing the stale documents.
    - If `scan.artifacts.hasBmalph` is true: create a bmalph-cleanup story listing `scan.artifacts.bmalpthFiles`.
  - [ ] 1.3: Implement `writeOnboardingEpic(epic: OnboardingEpic, outputPath: string): void`. Writes the epic to markdown following the format in `ralph/onboarding-epic.md` (existing reference): header with generation timestamp, `### Story O.N:` sections with user story, Given/When/Then acceptance criteria, and a footer with total story count.
  - [ ] 1.4: Implement `formatEpicSummary(epic: OnboardingEpic): string`. Returns a human-readable summary string: `Onboarding plan: <N> stories (<C> coverage, <D> documentation, <X> cleanup)`.

- [ ] Task 2: Implement interactive approval flow in `src/lib/epic-generator.ts` (AC: #2, #3, #4)
  - [ ] 2.1: Implement `promptApproval(): Promise<boolean>`. Uses Node.js `readline` to prompt `Review the onboarding plan. Approve? [Y/n]`. Returns true on `Y`, `y`, or empty input (default yes). Returns false on `n`, `N`, or any other input. Closes the readline interface after the answer.
  - [ ] 2.2: Implement `importOnboardingEpic(epicPath: string, beadsFns: { listIssues, createIssue }): BridgeImportResult[]`. Reuses `parseEpicsFile()` and `importStoriesToBeads()` from `src/lib/bmad.ts` to import the generated epic file into beads. Each story gets `type: 'task'` and priority assigned by severity: coverage stories get priority 2, doc stories get priority 3, cleanup stories get priority 4.

- [ ] Task 3: Add `epic` subcommand to `src/commands/onboard.ts` (AC: #1-#7)
  - [ ] 3.1: Register `onboard epic` subcommand with options: `--auto-approve` (skip interactive prompt). The subcommand calls the scan pipeline if `lastScanResult` is null (AC #7), then generates the epic, writes it, prompts for approval, and imports to beads.
  - [ ] 3.2: Wire the epic generation into the combined `onboard` command (no subcommand). After scan+coverage+audit, run epic generation, write the file, prompt for approval, and import. When `--json` is passed, skip the interactive prompt and include the epic data in JSON output (no import — JSON mode is read-only).
  - [ ] 3.3: Print summary after epic generation: `[INFO] Onboarding plan: <N> stories (<C> coverage, <D> documentation, <X> cleanup)`. Print per-story list: `[INFO]   O.1: Add test coverage for src/lib (90% → 100%)`.
  - [ ] 3.4: On approval, call `importOnboardingEpic()` and print: `[OK] Onboarding: <N> stories imported into beads` and `[INFO] Ready to run: codeharness run`.
  - [ ] 3.5: On rejection, print: `[INFO] Plan saved to ralph/onboarding-epic.md — edit and re-run when ready`.
  - [ ] 3.6: Handle `--auto-approve`: skip `promptApproval()` and proceed directly to import. This enables non-interactive usage from Ralph or CI.
  - [ ] 3.7: Handle `--json` for the `epic` subcommand: output `{ epic: OnboardingEpic, import_status: { stories_created: N, stories_existing: N } }` without interactive prompt or beads import.

- [ ] Task 4: Create `ralph/` directory if it doesn't exist (AC: #1)
  - [ ] 4.1: In `writeOnboardingEpic()`, ensure the target directory exists before writing. Use `mkdirSync(dirname(outputPath), { recursive: true })`.

- [ ] Task 5: Write unit tests for `src/lib/epic-generator.ts` (AC: #1-#5)
  - [ ] 5.1: Create `src/lib/__tests__/epic-generator.test.ts`. Test `generateOnboardingEpic()` with various findings combinations:
    - All modules at 100% coverage, all docs present → no stories generated.
    - Two modules below 100% → two coverage stories.
    - ARCHITECTURE.md missing → one architecture story.
    - Stale README.md → one doc-freshness story.
    - bmalph artifacts found → one cleanup story.
    - Full combination → correct total and categorization.
  - [ ] 5.2: Test `writeOnboardingEpic()` — verify output file matches expected markdown format with correct story numbering, headers, and footer.
  - [ ] 5.3: Test `formatEpicSummary()` — verify summary string format with known inputs.
  - [ ] 5.4: Test `importOnboardingEpic()` — mock `parseEpicsFile` and `importStoriesToBeads`, verify correct `type: 'task'` and priority mapping.
  - [ ] 5.5: Test `promptApproval()` — mock `readline` createInterface, verify `Y`/`y`/empty → true, `n`/`N` → false.

- [ ] Task 6: Write unit tests for updated `src/commands/onboard.ts` (AC: #1-#7)
  - [ ] 6.1: Update `src/commands/__tests__/onboard.test.ts`. Add tests for `onboard epic` subcommand registration.
  - [ ] 6.2: Test that `onboard epic` triggers scan when `lastScanResult` is null.
  - [ ] 6.3: Test `--auto-approve` flag skips prompt and imports directly.
  - [ ] 6.4: Test JSON output for `epic` subcommand includes epic and import_status.
  - [ ] 6.5: Test that the combined `onboard` command now includes epic generation phase.
  - [ ] 6.6: Mock `promptApproval`, `generateOnboardingEpic`, `writeOnboardingEpic`, `importOnboardingEpic` — do NOT run real beads commands in unit tests.

- [ ] Task 7: Build and verify (AC: #1-#7)
  - [ ] 7.1: Run `npm run build` — verify tsup compiles successfully with new epic-generator.ts and updated onboard.ts.
  - [ ] 7.2: Run `npm test` — verify all unit tests pass including new epic-generator and updated onboard tests.
  - [ ] 7.3: Verify `codeharness onboard epic --help` shows usage with `--auto-approve` option.
  - [ ] 7.4: Verify `codeharness onboard epic --auto-approve --json` produces valid JSON output when run in the codeharness project itself (dogfooding).
  - [ ] 7.5: Verify 100% test coverage is maintained — run `npm run test:coverage` and check no regressions.

## Dev Notes

### Architecture Context

This story implements the second half of the brownfield onboarding pipeline (Architecture Decision 9). Story 6.1 implemented scan → coverage → audit. This story adds epic generation → approval → beads import. Together they form the complete `codeharness onboard` flow.

The architecture specifies that onboarding stories flow into beads via `codeharness bridge --epics ralph/onboarding-epic.md`. Rather than shelling out to the bridge command, this story reuses the same import functions (`parseEpicsFile`, `importStoriesToBeads` from `src/lib/bmad.ts`) directly. This avoids subprocess overhead and enables better error handling.

The epic file format must match what `parseEpicsFile()` can parse — use the `### Story O.N:` header format with Given/When/Then acceptance criteria, consistent with the existing `ralph/onboarding-epic.md` reference file.

### Key Files to Modify

| File | Change |
|------|--------|
| `src/lib/epic-generator.ts` | New — epic generation, markdown writing, approval prompt, beads import |
| `src/commands/onboard.ts` | Add `epic` subcommand, wire epic generation into combined flow |
| `src/lib/__tests__/epic-generator.test.ts` | New — unit tests for epic generator |
| `src/commands/__tests__/onboard.test.ts` | Update — tests for epic subcommand and combined flow |

### Existing Code to Leverage

- `src/lib/bmad.ts` — `parseEpicsFile(filePath)` parses BMAD-format markdown into structured epics/stories. `importStoriesToBeads(stories, opts, beadsFns)` handles deduplication and beads import. Reuse directly for the import phase.
- `src/lib/beads.ts` — `createIssue(title, opts)` and `listIssues()` for beads operations. Pass these as `beadsFns` to `importStoriesToBeads`.
- `src/lib/scanner.ts` — `ScanResult`, `CoverageGapReport`, `DocAuditResult` types are inputs to epic generation. `scanCodebase()`, `analyzeCoverageGaps()`, `auditDocumentation()` for running the scan pipeline when needed.
- `src/commands/onboard.ts` — `getLastScanResult()` provides cached scan results from the current session. The `epic` subcommand should check this first before running a fresh scan.
- `src/lib/output.ts` — `ok()`, `fail()`, `warn()`, `info()`, `jsonOutput()` for CLI output formatting.
- `ralph/onboarding-epic.md` — Reference file showing the expected output format for generated epics.

### Epic Generation Logic

The mapping from scan findings to stories follows these rules:

| Finding | Story Type | Priority | Story Title Pattern |
|---------|-----------|----------|-------------------|
| Module coverage < 100% | `coverage` | 2 | `Add test coverage for <module>` |
| Module missing AGENTS.md | `agents-md` | 3 | `Create <module>/AGENTS.md` |
| ARCHITECTURE.md missing | `architecture` | 3 | `Create ARCHITECTURE.md` |
| Stale documents detected | `doc-freshness` | 3 | `Update stale documentation` |
| bmalph artifacts found | `bmalph-cleanup` | 4 | `Clean up bmalph artifacts` |

Stories are numbered sequentially as `O.1`, `O.2`, etc. The key format matches the existing reference file.

### Interactive Approval

The CLI currently has no interactive prompts anywhere. This story introduces the first one via Node.js `readline`. The `--auto-approve` flag provides a non-interactive escape hatch for automated usage (Ralph, CI, `--json` mode). When `--json` is passed, no prompt is shown and no import happens — JSON mode is read-only/informational.

### NFR Compliance

- **NFR5:** The epic generation step itself is fast (in-memory transformation). The scan phase (if triggered) may take longer but is already NFR-compliant from Story 6.1.
- **NFR27:** Module threshold from Story 6.1 carries through — the scan results used for epic generation already respect the configured threshold.

### Integration with Story 6.1

Story 6.1 left a hook point: `getLastScanResult()` returns cached scan results from the current CLI session. The `epic` subcommand should:
1. Check `getLastScanResult()` — if non-null, use it.
2. If null, run the full scan pipeline (scan → coverage → audit) to produce fresh results.
3. Pass results to `generateOnboardingEpic()`.

The combined `onboard` command (no subcommand) already runs scan → coverage → audit. This story extends it to also run epic generation → approval → import as the fourth phase.
