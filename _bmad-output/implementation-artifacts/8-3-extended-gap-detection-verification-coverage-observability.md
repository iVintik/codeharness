# Story 8.3: Extended Gap Detection — Verification, Per-File Coverage, Observability

Status: ready-for-dev

## Story

As a developer onboarding an existing project,
I want the scanner to detect all types of gaps (not just test coverage and docs),
So that the generated onboarding epic covers everything needed for full harness compliance.

## Acceptance Criteria

1. **Given** stories exist in sprint-status.yaml with status `done`, **When** those stories have no proof document in `docs/exec-plans/completed/`, **Then** a gap `[gap:verification:<story-key>]` is created for each **And** the onboarding epic includes "Create verification proof for <story>" stories.

2. **Given** the coverage report shows files below 80% statement coverage, **When** onboard runs coverage analysis, **Then** `checkPerFileCoverage(80)` is used instead of the per-module `analyzeCoverageGaps` **And** each violating file generates a gap `[gap:coverage:<file-path>]`.

3. **Given** observability is enabled in state but OTLP env vars are not configured, **When** onboard runs, **Then** a gap `[gap:observability:otlp-config]` is surfaced **And** the epic includes "Configure OTLP instrumentation" story.

4. **Given** observability is enabled but Docker stack is not running, **When** onboard runs, **Then** a gap `[gap:observability:docker-stack]` is surfaced.

5. **Given** observability is disabled in state (`enforcement.observability: false`), **When** onboard runs, **Then** no observability gaps are generated.

## Tasks / Subtasks

- [ ] Task 1: Add verification gap detection in `src/lib/onboard-checks.ts` (AC: #1)
  - [ ] 1.1: Create `findVerificationGaps(dir?: string): OnboardingStory[]` that reads sprint-status.yaml via `readSprintStatus(dir)` from `src/lib/beads-sync.ts`, filters entries with status `done` that have a story key pattern (e.g., `\d+-\d+-`), and for each checks if a proof document exists at `docs/exec-plans/completed/<story-key>.md`. If missing, creates an `OnboardingStory` with `type: 'verification'` and `key` derived from a counter.
  - [ ] 1.2: The story title format is `Create verification proof for <story-key>`. The acceptance criteria should reference the story key and note that a proof document must be created at `docs/exec-plans/completed/`.
  - [ ] 1.3: Add the gap-id mapping for verification stories: `buildGapId('verification', story.storyKey)` → `[gap:verification:<story-key>]`. Update `storyToGapId()` to handle the new `'verification'` type.

- [ ] Task 2: Add per-file coverage gap detection in `src/lib/onboard-checks.ts` (AC: #2)
  - [ ] 2.1: Create `findPerFileCoverageGaps(floor: number, dir?: string): OnboardingStory[]` that calls `checkPerFileCoverage(floor, dir)` from `src/lib/coverage.ts` and maps each violation to an `OnboardingStory` with `type: 'coverage'` and `module` set to the violating file path.
  - [ ] 2.2: Each story title is `Add test coverage for <file-path>` and generates a gap-id of `[gap:coverage:<file-path>]`. This reuses the existing `coverage` category but with file-level granularity instead of module-level.

- [ ] Task 3: Add observability gap detection in `src/lib/onboard-checks.ts` (AC: #3, #4, #5)
  - [ ] 3.1: Create `findObservabilityGaps(dir?: string): OnboardingStory[]` that reads harness state via `readState(dir)` from `src/lib/state.ts`. If `enforcement.observability` is `false`, return empty array immediately (AC #5).
  - [ ] 3.2: If observability is enabled, check if OTLP is configured by reading `state.otlp?.enabled`. If `state.otlp` is undefined or `state.otlp.enabled` is false, create an `OnboardingStory` with type `'observability'`, title `Configure OTLP instrumentation`, and gap-id `[gap:observability:otlp-config]` (AC #3).
  - [ ] 3.3: If observability is enabled, check Docker stack status. Read `state.docker?.compose_file` to get the compose file path. If the compose file path exists in state, call `isStackRunning(composeFile)` from `src/lib/docker.ts`. If not running, create an `OnboardingStory` with type `'observability'`, title `Start Docker observability stack`, and gap-id `[gap:observability:docker-stack]` (AC #4). If compose file is not configured in state at all, also surface this gap.
  - [ ] 3.4: Add the gap-id mapping for observability stories to `storyToGapId()`.

- [ ] Task 4: Extend `OnboardingStory` type and epic generator (AC: #1, #2, #3, #4)
  - [ ] 4.1: In `src/lib/epic-generator.ts`, extend the `OnboardingStory['type']` union to include `'verification'` and `'observability'`.
  - [ ] 4.2: Update `PRIORITY_BY_TYPE` to include new types: `verification: 2` (same priority as coverage — these are compliance gaps), `observability: 1` (highest priority — infrastructure must be set up first).
  - [ ] 4.3: Update `writeOnboardingEpic()` to handle new story types in the user story text:
    - `verification`: "As a developer, I want verification proof for <story-key> to ensure it's properly documented."
    - `observability`: "As a developer, I want observability infrastructure configured so the harness can monitor runtime behavior."
  - [ ] 4.4: Update `getPriorityFromTitle()` in `src/lib/epic-generator.ts` to recognize new title patterns for the two new types.
  - [ ] 4.5: Update `getGapIdFromTitle()` in `src/lib/epic-generator.ts` to derive gap-ids from new title patterns:
    - `Create verification proof for <key>` → `[gap:verification:<key>]`
    - `Configure OTLP instrumentation` → `[gap:observability:otlp-config]`
    - `Start Docker observability stack` → `[gap:observability:docker-stack]`

- [ ] Task 5: Integrate new gap detectors into `src/commands/onboard.ts` (AC: #1-#5)
  - [ ] 5.1: Import the three new detection functions from `src/lib/onboard-checks.ts`.
  - [ ] 5.2: In `generateOnboardingEpic()` (or in a new orchestrator function called before epic generation), call `findVerificationGaps()`, `findPerFileCoverageGaps(80)`, and `findObservabilityGaps()`, then merge their results into the stories list before gap filtering and epic writing.
  - [ ] 5.3: The merge should happen AFTER the existing `generateOnboardingEpic()` call (which handles module-level coverage, docs, and bmalph), so the extended gaps are appended to `epic.stories`. Alternatively, modify `generateOnboardingEpic()` to accept optional extra stories and merge internally.
  - [ ] 5.4: Update `applyGapFiltering()` to handle the new story types — this should work automatically since `filterTrackedGaps` uses `storyToGapId()` which will be updated in Task 1.3 / Task 3.4.
  - [ ] 5.5: Update epic summary counts: add `verificationStories` and `observabilityStories` to `EpicSummary`, and update `formatEpicSummary()` to include them.

- [ ] Task 6: Update `storyToGapId()` in `src/lib/onboard-checks.ts` (AC: #1-#4)
  - [ ] 6.1: Add cases for `'verification'` type: `buildGapId('verification', story.storyKey!)` where `storyKey` is a new optional field on `OnboardingStory` that holds the sprint-status story key.
  - [ ] 6.2: Add cases for `'observability'` type: use `story.module` field to distinguish between `otlp-config` and `docker-stack` (e.g., store the observability sub-type in `module`).

- [ ] Task 7: Write unit tests (AC: #1-#5)
  - [ ] 7.1: Add tests for `findVerificationGaps` in `src/lib/__tests__/onboard-checks.test.ts`:
    - Test with sprint-status containing done stories that have proof docs → no gaps.
    - Test with done stories missing proof docs → gaps created with correct gap-ids.
    - Test with stories in non-done statuses → no gaps.
    - Test with missing sprint-status.yaml → empty result (graceful).
  - [ ] 7.2: Add tests for `findPerFileCoverageGaps` in `src/lib/__tests__/onboard-checks.test.ts`:
    - Test with all files above floor → no gaps.
    - Test with files below floor → gaps with correct file paths and gap-ids.
    - Test with no coverage report → empty result.
  - [ ] 7.3: Add tests for `findObservabilityGaps` in `src/lib/__tests__/onboard-checks.test.ts`:
    - Test with observability disabled → no gaps (AC #5).
    - Test with observability enabled, OTLP not configured → otlp-config gap (AC #3).
    - Test with observability enabled, Docker not running → docker-stack gap (AC #4).
    - Test with observability enabled, everything configured and running → no gaps.
  - [ ] 7.4: Update `src/lib/__tests__/epic-generator.test.ts` to verify:
    - New story types in `PRIORITY_BY_TYPE`.
    - `writeOnboardingEpic` handles verification and observability story types.
    - `getPriorityFromTitle` and `getGapIdFromTitle` handle new title patterns.
  - [ ] 7.5: Update `storyToGapId` tests to cover verification and observability types.

- [ ] Task 8: Build and verify (AC: #1-#5)
  - [ ] 8.1: Run `npm run build` — verify tsup compiles successfully with new types and exports.
  - [ ] 8.2: Run `npm run test:unit` — verify all unit tests pass including new gap detection tests.
  - [ ] 8.3: Run `npm run test:coverage` — verify 100% test coverage is maintained.

## Dev Notes

### Architecture Context

The current `onboard` pipeline detects three kinds of gaps:
1. **Module-level coverage** — via `analyzeCoverageGaps()` in `src/lib/scanner.ts`, which gives per-module aggregates.
2. **Documentation** — via `auditDocumentation()` in `src/lib/scanner.ts`, checking README.md, AGENTS.md, ARCHITECTURE.md.
3. **bmalph cleanup** — via `scanCodebase()` artifact detection.

This story extends gap detection to three new dimensions:
1. **Verification gaps** — done stories without proof documents.
2. **Per-file coverage** — files individually below 80% (not module averages).
3. **Observability readiness** — OTLP config and Docker stack state.

### Key Files to Modify

| File | Change |
|------|--------|
| `src/lib/onboard-checks.ts` | Add `findVerificationGaps`, `findPerFileCoverageGaps`, `findObservabilityGaps` functions; update `storyToGapId` |
| `src/lib/epic-generator.ts` | Extend `OnboardingStory['type']` union, add `storyKey` field, update priority/gap-id maps, update markdown generation |
| `src/commands/onboard.ts` | Integrate new gap detectors into the onboard pipeline, update summary counts |
| `src/lib/__tests__/onboard-checks.test.ts` | Tests for three new gap detection functions |
| `src/lib/__tests__/epic-generator.test.ts` | Tests for new types in priority/gap-id maps and markdown output |

### Existing Code to Leverage

| Module | Function | Purpose |
|--------|----------|---------|
| `src/lib/beads-sync.ts` | `readSprintStatus(dir)` | Reads sprint-status.yaml, returns `Record<string, string>` of story keys to statuses |
| `src/lib/coverage.ts` | `checkPerFileCoverage(floor, dir)` | Already implemented — returns `{ floor, violations: FileCoverageEntry[], totalFiles }`. Violations include files below the floor with per-metric coverage data |
| `src/lib/state.ts` | `readState(dir)` | Returns `HarnessState` with `enforcement.observability`, `otlp`, and `docker` fields |
| `src/lib/docker.ts` | `isStackRunning(composeFile)` | Checks if Docker Compose stack is running |
| `src/lib/beads.ts` | `buildGapId(category, identifier)` | Creates `[gap:<category>:<identifier>]` tags |
| `src/lib/onboard-checks.ts` | `storyToGapId(story)` | Maps OnboardingStory to gap-id string — needs extension for new types |

### Story Type → Gap-ID Mapping (Extended)

| Story Type | Gap-ID Pattern | Example |
|------------|---------------|---------|
| `coverage` | `[gap:coverage:<module-or-file>]` | `[gap:coverage:src/lib/scanner.ts]` |
| `agents-md` | `[gap:docs:<module>/AGENTS.md]` | `[gap:docs:src/lib/AGENTS.md]` |
| `architecture` | `[gap:docs:ARCHITECTURE.md]` | `[gap:docs:ARCHITECTURE.md]` |
| `doc-freshness` | `[gap:docs:stale-docs]` | `[gap:docs:stale-docs]` |
| `bmalph-cleanup` | `[gap:docs:bmalph-cleanup]` | `[gap:docs:bmalph-cleanup]` |
| `verification` | `[gap:verification:<story-key>]` | `[gap:verification:4-1-verification-pipeline]` |
| `observability` | `[gap:observability:<sub-type>]` | `[gap:observability:otlp-config]` |

### Per-File vs Per-Module Coverage

The existing `analyzeCoverageGaps()` aggregates coverage at the module level. This story introduces `checkPerFileCoverage(80)` which operates at file level. Both can coexist — the module-level gaps from `generateOnboardingEpic()` give a high-level view, while the per-file gaps from this story identify specific files needing attention. The per-file approach uses an 80% floor (not the project-level target from state) to catch the worst offenders.

When both produce coverage stories, dedup via gap-id prevents duplicates: module-level uses `[gap:coverage:src/lib]` while file-level uses `[gap:coverage:src/lib/scanner.ts]`. These are distinct gap-ids so both can coexist.

### Verification Gap Detection Logic

```
for each entry in sprint-status.yaml:
  if key matches story pattern (e.g., 1-1-xxx, 4-2-yyy) AND status === 'done':
    proofPath = docs/exec-plans/completed/<key>.md
    if !existsSync(proofPath):
      create verification gap story
```

Epic/retrospective entries (keys like `epic-1`, `epic-1-retrospective`) should be skipped — they are not stories that need proof documents.

### Observability Gap Detection Logic

```
state = readState(dir)
if !state.enforcement.observability:
  return []  // no gaps

gaps = []
if !state.otlp?.enabled:
  gaps.push(otlp-config gap)

if state.docker?.compose_file:
  if !isStackRunning(state.docker.compose_file):
    gaps.push(docker-stack gap)
else:
  // No compose file configured means Docker was never set up
  gaps.push(docker-stack gap)

return gaps
```

### Edge Cases

- **No sprint-status.yaml**: `readSprintStatus()` returns `{}`, so `findVerificationGaps()` returns empty — graceful no-op.
- **No coverage report**: `checkPerFileCoverage()` returns `{ violations: [], totalFiles: 0 }` — no gaps.
- **State file missing**: `readState()` throws `StateFileNotFoundError`. Since onboard already runs preconditions that check for state file, this shouldn't happen. But if it does, `findObservabilityGaps()` should catch the error and return empty (fail open).
- **Docker commands fail**: `isStackRunning()` catches exec errors and returns `false` — so a Docker failure is treated as "not running" which surfaces the gap.
- **Observability enabled but no docker section in state**: This means Docker was never configured via init. Treat as docker-stack gap.

### OnboardingStory Type Extension

The `OnboardingStory` interface needs two additions:
1. Extend the `type` union: `'coverage' | 'agents-md' | 'architecture' | 'doc-freshness' | 'bmalph-cleanup' | 'verification' | 'observability'`
2. Add optional `storyKey?: string` field for verification stories (holds the sprint-status key like `4-1-verification-pipeline`)

The `module` field (already optional) can be reused for observability stories to hold the sub-type (`otlp-config` or `docker-stack`).
