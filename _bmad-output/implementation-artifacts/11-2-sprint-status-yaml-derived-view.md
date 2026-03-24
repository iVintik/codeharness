# Story 11-2: sprint-status.yaml Becomes Derived View

## Status: backlog

## Story

As a developer,
I want `sprint-status.yaml` generated from `sprint-state.json`,
So that there's one source of truth with a human-readable view.

## Acceptance Criteria

- [ ] AC1: Given `sprint-state.json` has story statuses, when `generateSprintStatusYaml()` is called, then it writes a valid YAML file matching the current sprint-status.yaml format <!-- verification: cli-verifiable -->
- [ ] AC2: Given a story status changes in `sprint-state.json`, when `writeSprintState()` completes, then `sprint-status.yaml` is regenerated automatically <!-- verification: cli-verifiable -->
- [ ] AC3: Given harness-run reads story statuses, when it queries state, then it reads from `sprint-state.json` directly (not sprint-status.yaml) <!-- verification: cli-verifiable -->

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

## Files to Change

- `src/modules/sprint/state.ts` — Add `generateSprintStatusYaml()`, call it at end of `writeSprintState()`
- `src/lib/beads-sync.ts` — Replace `readSprintStatus()` YAML parsing with `readSprintState()` JSON reads
- `src/commands/status.ts` — Switch from sprint-status.yaml to sprint-state.json reads
- `src/commands/run.ts` — Switch status reads to sprint-state.json
- `src/modules/sprint/selector.ts` — Ensure story selection reads from sprint-state.json
- `src/modules/sprint/reporter.ts` — Switch progress reads to sprint-state.json
