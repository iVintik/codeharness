# Story 11-2: sprint-status.yaml Becomes Derived View
<!-- verification-tier: unit-testable -->

## Status: done

## Story

As a developer,
I want `sprint-status.yaml` generated from `sprint-state.json`,
So that there's one source of truth with a human-readable view.

## Acceptance Criteria

- [x] AC1: Given `sprint-state.json` has story statuses, when `generateSprintStatusYaml()` is called, then it writes a valid YAML file matching the current sprint-status.yaml format <!-- verification: cli-verifiable -->
- [x] AC2: Given a story status changes in `sprint-state.json`, when `writeSprintState()` completes, then `sprint-status.yaml` is regenerated automatically <!-- verification: cli-verifiable -->
- [x] AC3: Given harness-run reads story statuses, when it queries state, then it reads from `sprint-state.json` directly (not sprint-status.yaml) <!-- verification: cli-verifiable -->

## Technical Notes

**Decision 1 (Unified State).** `sprint-status.yaml` transitions from source of truth to derived view. All readers must switch to `sprint-state.json`.

Create `generateSprintStatusYaml()` function that:
1. Reads `sprint-state.json`
2. Transforms `stories` and `epics` into the current YAML format (epic groupings, story status lines)
3. Writes `sprint-status.yaml` using the same YAML structure that exists today

Hook this into `writeSprintState()` so every state write auto-regenerates the YAML view. This ensures the human-readable file is always current without being a source of truth.

Current readers of `sprint-status.yaml` that must switch to `sprint-state.json`:
- `src/lib/beads-sync.ts` — `readSprintStatus()` parses YAML to get story statuses
- `src/commands/status.ts` — reads sprint-status.yaml for display
- `src/commands/run.ts` — reads story statuses for selection
- `src/modules/sprint/selector.ts` — story selection reads statuses
- `src/modules/sprint/reporter.ts` — progress reporting

The `readSprintStatus()` function in `src/lib/beads-sync.ts` should be replaced with direct reads from `sprint-state.json` via `readSprintState()`.

The YAML generation can live in `src/lib/sync/sprint-yaml.ts` (anticipating Epic 12 restructuring) or temporarily in `src/modules/sprint/state.ts`.

## Tasks/Subtasks

- [x] 1. Add `generateSprintStatusYaml()` to `src/modules/sprint/state.ts`
  - [x] 1.1 Create `getStoryStatusesFromState()` — derive flat status map from SprintState
  - [x] 1.2 Create `generateSprintStatusYaml()` — produce YAML with epic groupings, sorted by epic/story number
  - [x] 1.3 Create `sprintStatusYamlPath()` — return path to sprint-status.yaml
  - [x] 1.4 Create `writeSprintStatusYaml()` — best-effort write of derived YAML view
- [x] 2. Hook YAML generation into `writeStateAtomic()` so every state write regenerates the YAML
- [x] 3. Switch consumers from `readSprintStatus()` (YAML) to `readSprintStatusFromState()` (JSON)
  - [x] 3.1 Add `readSprintStatusFromState()` to sprint module index
  - [x] 3.2 Switch `src/commands/run.ts` from `readSprintStatus` to `readSprintStatusFromState`
  - [x] 3.3 Switch `src/lib/onboard-checks.ts` from `readSprintStatus` to `readSprintStatusFromState`
  - [x] 3.4 Verify `src/commands/status.ts` already reads from sprint-state.json (confirmed — no changes needed)
  - [x] 3.5 Verify `src/modules/sprint/selector.ts` already works from SprintState objects (confirmed — no changes needed)
  - [x] 3.6 Verify `src/modules/sprint/reporter.ts` already works from SprintState objects (confirmed — no changes needed)
- [x] 4. Update test mocks in `src/commands/__tests__/run.test.ts` to mock `readSprintStatusFromState` from new module
- [x] 5. Write tests for new functions in `src/modules/sprint/__tests__/sprint-yaml.test.ts`
  - [x] 5.1 Tests for `getStoryStatusesFromState`
  - [x] 5.2 Tests for `generateSprintStatusYaml` (valid YAML, epic grouping, sorting, status mapping)
  - [x] 5.3 Tests for `writeStateAtomic` regenerating YAML on every write
  - [x] 5.4 Tests for `sprintStatusYamlPath`

## Dev Agent Record

### Implementation Plan

- Place YAML generation in `src/modules/sprint/state.ts` (co-located with `writeStateAtomic`)
- Hook generation as a best-effort side effect after atomic JSON write
- Create `readSprintStatusFromState()` in sprint module index as a drop-in replacement for the old `readSprintStatus()` that parsed YAML
- Switch `run.ts` and `onboard-checks.ts` to use the new JSON-backed function
- `status.ts`, `selector.ts`, and `reporter.ts` already read from SprintState objects — no changes needed
- `beads-sync.ts` keeps its `readSprintStatus()` for backward compatibility (still used by its own sync functions and tests)

### Completion Notes

All 3 acceptance criteria satisfied:
- AC1: `generateSprintStatusYaml()` produces valid YAML matching the sprint-status.yaml format with epic groupings, story ordering, and correct status values. 14 dedicated tests verify this.
- AC2: `writeStateAtomic()` calls `writeSprintStatusYaml()` after every successful JSON write, ensuring the YAML view is always current.
- AC3: `run.ts` and `onboard-checks.ts` now read from `sprint-state.json` via `readSprintStatusFromState()`. `status.ts`, `selector.ts`, and `reporter.ts` already used SprintState objects.

Full test suite: 3424 tests pass across 124 test files, zero regressions.

## File List

- `src/modules/sprint/state.ts` — Added `generateSprintStatusYaml()`, `getStoryStatusesFromState()`, `sprintStatusYamlPath()`, `writeSprintStatusYaml()`, `yamlStatus()`, `parseStoryKey()`; modified `writeStateAtomic()` to regenerate YAML
- `src/modules/sprint/index.ts` — Added exports for `generateSprintStatusYaml`, `getStoryStatusesFromState`, `readSprintStatusFromState`
- `src/commands/run.ts` — Switched from `readSprintStatus` (beads-sync YAML) to `readSprintStatusFromState` (sprint module JSON)
- `src/lib/onboard-checks.ts` — Switched from `readSprintStatus` (beads-sync YAML) to `readSprintStatusFromState` (sprint module JSON)
- `src/commands/__tests__/run.test.ts` — Updated mock to include `readSprintStatusFromState` in sprint module mock
- `src/modules/sprint/__tests__/sprint-yaml.test.ts` — New: 14 tests for YAML generation and status derivation

## Change Log

- 2026-03-24: Implemented story 11-2. sprint-status.yaml is now a derived view auto-generated from sprint-state.json on every state write. All primary consumers switched to reading from sprint-state.json.

## Files to Change (Original)

- `src/modules/sprint/state.ts` — Add `generateSprintStatusYaml()`, call it at end of `writeSprintState()`
- `src/lib/beads-sync.ts` — Replace `readSprintStatus()` YAML parsing with `readSprintState()` JSON reads
- `src/commands/status.ts` — Switch from sprint-status.yaml to sprint-state.json reads
- `src/commands/run.ts` — Switch status reads to sprint-state.json
- `src/modules/sprint/selector.ts` — Ensure story selection reads from sprint-state.json
- `src/modules/sprint/reporter.ts` — Switch progress reads to sprint-state.json
