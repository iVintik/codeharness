# Story 8.2: Onboard Precondition Checks & State Awareness

Status: ready-for-dev

## Story

As a developer running `codeharness onboard` on an existing project,
I want the command to check prerequisites and understand what's already set up,
So that it doesn't suggest work that's already done or fail silently due to missing setup.

## Acceptance Criteria

1. **Given** `codeharness init` has NOT been run, **When** I run `codeharness onboard`, **Then** `[FAIL] Harness not initialized — run codeharness init first` is printed **And** exit code is 1.

2. **Given** BMAD is not installed, **When** I run `codeharness onboard`, **Then** `[WARN] BMAD not installed — generated stories won't be executable until init completes` is printed **And** onboard continues (non-blocking).

3. **Given** enforcement hooks are not registered, **When** I run `codeharness onboard`, **Then** `[WARN] Hooks not registered — enforcement won't be active` is printed.

4. **Given** I previously ran onboard and fixed 3 of 5 gaps, **When** I run `codeharness onboard` again, **Then** only the 2 remaining unfixed gaps are surfaced **And** the output shows `[INFO] 3 previously tracked gaps already in beads`.

5. **Given** `--full` flag is passed, **When** I run `codeharness onboard --full`, **Then** all gaps are shown regardless of existing beads issues (full re-scan mode).

## Tasks / Subtasks

- [ ] Task 1: Add precondition check functions in `src/lib/onboard-checks.ts` (AC: #1, #2, #3)
  - [ ] 1.1: Create `checkHarnessInitialized(dir?: string): { ok: boolean }` — checks if `.claude/codeharness.local.md` exists using `existsSync(getStatePath(dir))`. Returns `{ ok: true }` if file exists, `{ ok: false }` otherwise.
  - [ ] 1.2: Create `checkBmadInstalled(dir?: string): { ok: boolean }` — delegates to `isBmadInstalled(dir)` from `src/lib/bmad.ts`. Returns `{ ok: true }` if `_bmad/` exists.
  - [ ] 1.3: Create `checkHooksRegistered(dir?: string): { ok: boolean }` — checks if `hooks/hooks.json` exists inside the plugin directory. The plugin directory path is resolved from the codeharness package location (`join(__dirname, '..', '..', 'hooks', 'hooks.json')`). Returns `{ ok: true }` if file exists.
  - [ ] 1.4: Create `runPreconditions(dir?: string): { canProceed: boolean; warnings: string[] }` — orchestrates all three checks. If harness not initialized: returns `{ canProceed: false, warnings: [] }` (hard fail). If BMAD not installed or hooks not registered: adds warning messages to `warnings` array and returns `{ canProceed: true, warnings }`.

- [ ] Task 2: Add gap filtering using gap-id dedup from story 8-1 (AC: #4, #5)
  - [ ] 2.1: Create `filterTrackedGaps(stories: OnboardingStory[], beadsFns: { listIssues: () => BeadsIssue[] }): { untracked: OnboardingStory[]; trackedCount: number }` in `src/lib/onboard-checks.ts`. For each story, build the expected gap-id using `buildGapId()` — coverage stories use `[gap:coverage:<module>]`, docs stories use `[gap:docs:<doc-name>]`, cleanup stories use `[gap:docs:bmalph-cleanup]` (same categories as story 8-1). Then call `findExistingByGapId(gapId, existingIssues)` from `src/lib/beads.ts`. If found, it's already tracked; otherwise it's untracked.
  - [ ] 2.2: The gap-id category mapping for onboarding stories:
    - `coverage` type → `buildGapId('coverage', story.module)` → `[gap:coverage:src/lib]`
    - `agents-md` type → `buildGapId('docs', story.module + '/AGENTS.md')` → `[gap:docs:src/lib/AGENTS.md]`
    - `architecture` type → `buildGapId('docs', 'ARCHITECTURE.md')` → `[gap:docs:ARCHITECTURE.md]`
    - `doc-freshness` type → `buildGapId('docs', 'stale-docs')` → `[gap:docs:stale-docs]`
    - `bmalph-cleanup` type → `buildGapId('docs', 'bmalph-cleanup')` → `[gap:docs:bmalph-cleanup]`

- [ ] Task 3: Integrate preconditions and gap filtering into `src/commands/onboard.ts` (AC: #1-#5)
  - [ ] 3.1: Add `--full` option to the `onboard` command: `.option('--full', 'Show all gaps regardless of existing beads issues')`.
  - [ ] 3.2: At the top of every `onboard` action handler (the default action and each subcommand), add a call to `runPreconditions()`. If `canProceed` is false, call `fail('Harness not initialized — run codeharness init first')` and call `process.exit(1)`. If there are warnings, print each with `warn()`.
  - [ ] 3.3: In the `epic` subcommand action and in the default combined action, after generating the epic, if `--full` is NOT set: call `filterTrackedGaps(epic.stories, { listIssues })`. Replace `epic.stories` with the `untracked` result. If `trackedCount > 0`, print `info(`${trackedCount} previously tracked gaps already in beads`)`. Update the epic summary counts accordingly.
  - [ ] 3.4: If `--full` IS set, skip the gap filtering step entirely — show all gaps as usual.
  - [ ] 3.5: In JSON mode, include precondition results in the output: `{ preconditions: { initialized: true, bmad: true, hooks: true }, ... }`.

- [ ] Task 4: Update `importOnboardingEpic` in `src/lib/epic-generator.ts` to use gap-id when creating issues (AC: #4)
  - [ ] 4.1: When `importOnboardingEpic` wraps `createIssue`, it should generate a gap-id for each story based on the story title pattern (same mapping as Task 2.2). The gap-id should be appended to the description using `appendGapId()` from `src/lib/beads.ts`.
  - [ ] 4.2: This ensures that issues created by `onboard epic` have gap-id tags, making them findable by `filterTrackedGaps` on subsequent runs.

- [ ] Task 5: Write unit tests (AC: #1-#5)
  - [ ] 5.1: Add `src/lib/__tests__/onboard-checks.test.ts` with tests for `checkHarnessInitialized` — verify it returns `{ ok: true }` when state file exists, `{ ok: false }` when missing.
  - [ ] 5.2: Add tests for `checkBmadInstalled` — verify it delegates to `isBmadInstalled` correctly.
  - [ ] 5.3: Add tests for `checkHooksRegistered` — verify it checks for hooks.json existence.
  - [ ] 5.4: Add tests for `runPreconditions` — verify hard fail when not initialized, soft warnings for BMAD and hooks.
  - [ ] 5.5: Add tests for `filterTrackedGaps` — verify it returns only untracked stories when some have matching gap-ids in existing beads issues, returns all stories when no matches, returns empty when all matched.
  - [ ] 5.6: Update tests in `src/commands/__tests__/onboard.test.ts` (or create if needed) — verify `onboard` calls preconditions, exits on hard fail, continues with warnings, respects `--full` flag.
  - [ ] 5.7: Update tests for `importOnboardingEpic` in `src/lib/__tests__/epic-generator.test.ts` to verify gap-id tags are appended to created issues.

- [ ] Task 6: Build and verify (AC: #1-#5)
  - [ ] 6.1: Run `npm run build` — verify tsup compiles successfully with new module.
  - [ ] 6.2: Run `npm run test:unit` — verify all unit tests pass including new precondition and filtering tests.
  - [ ] 6.3: Run `npm run test:coverage` — verify 100% test coverage is maintained.

## Dev Notes

### Architecture Context

The `onboard` command currently runs a scan-coverage-audit-epic pipeline without any precondition checks. It doesn't know if the harness is initialized, if BMAD is installed, or if hooks are registered. It also regenerates the full epic every time, with no awareness of which gaps are already tracked in beads.

Story 8-1 introduced the `gap-id` system (`buildGapId`, `findExistingByGapId`, `appendGapId`, `createOrFindIssue`) in `src/lib/beads.ts`. This story leverages that infrastructure to make onboard state-aware: preconditions prevent running in an uninitialized project, and gap filtering prevents re-surfacing already-tracked work.

### Key Files to Modify

| File | Change |
|------|--------|
| `src/lib/onboard-checks.ts` | **NEW** — precondition check functions and gap filtering |
| `src/commands/onboard.ts` | Add `--full` flag, precondition calls at top of actions, gap filtering before epic display/import |
| `src/lib/epic-generator.ts` | Add gap-id tags to `importOnboardingEpic` issue creation |
| `src/lib/__tests__/onboard-checks.test.ts` | **NEW** — unit tests for precondition and filtering functions |
| `src/lib/__tests__/epic-generator.test.ts` | Update tests for gap-id in onboarding import |

### Existing Code to Leverage

- `src/lib/state.ts` — `getStatePath(dir)` returns the path to the state file; `existsSync()` checks if harness is initialized.
- `src/lib/bmad.ts` — `isBmadInstalled(dir)` checks for `_bmad/` directory.
- `src/lib/beads.ts` — `buildGapId()`, `findExistingByGapId()`, `appendGapId()`, `listIssues()` from story 8-1.
- `src/lib/epic-generator.ts` — `OnboardingStory` type has `type` and `module` fields used for gap-id category mapping.
- `src/lib/output.ts` — `ok()`, `fail()`, `warn()`, `info()` for formatted output.

### Gap-ID Mapping for Onboarding Stories

| Story Type | Gap-ID Pattern | Example |
|------------|---------------|---------|
| `coverage` | `[gap:coverage:<module-path>]` | `[gap:coverage:src/lib]` |
| `agents-md` | `[gap:docs:<module>/AGENTS.md]` | `[gap:docs:src/lib/AGENTS.md]` |
| `architecture` | `[gap:docs:ARCHITECTURE.md]` | `[gap:docs:ARCHITECTURE.md]` |
| `doc-freshness` | `[gap:docs:stale-docs]` | `[gap:docs:stale-docs]` |
| `bmalph-cleanup` | `[gap:docs:bmalph-cleanup]` | `[gap:docs:bmalph-cleanup]` |

### Precondition Check Priority

| Check | Behavior | Reason |
|-------|----------|--------|
| Harness initialized | **Hard fail** (exit 1) | State file is required for all subsequent operations |
| BMAD installed | **Soft warning** (continue) | Scan/coverage/audit work without BMAD; only epic import needs it |
| Hooks registered | **Soft warning** (continue) | Informational; onboard itself doesn't need hooks |

### Edge Cases

- **First run (no beads issues):** `filterTrackedGaps` returns all stories as untracked. Behavior identical to current implementation.
- **All gaps tracked:** `filterTrackedGaps` returns empty list. Epic generation still works but produces 0 stories. Output: `[INFO] 5 previously tracked gaps already in beads` followed by an empty epic.
- **Mixed state:** Some gaps tracked, some not. Only untracked gaps appear in the epic. `--full` overrides this.
- **Beads not initialized:** `listIssues()` will throw `BeadsError`. Catch this in `filterTrackedGaps` and fall back to returning all stories as untracked (fail open — don't block onboard because beads is unavailable).

### Backward Compatibility

This is additive. The `--full` flag restores the old behavior (show everything). Without `--full`, existing users see fewer gaps on re-runs, which is the desired UX improvement. The precondition check is new but should not break any existing workflow where `init` was run first.
