# Story 12-2: Split docker.ts, otlp.ts, beads-sync.ts, doc-health.ts

## Status: backlog

## Story

As a developer,
I want all 832/590/422/378-line files split into domain subdirectories,
So that the entire codebase respects the 300-line limit.

## Acceptance Criteria

- [ ] AC1: Given `src/lib/docker/` with `compose.ts`, `health.ts`, `cleanup.ts` and `src/lib/observability/` with `instrument.ts`, `config.ts`, `backends.ts` and `src/lib/sync/` with `beads.ts`, `sprint-yaml.ts`, `story-files.ts`, when each file is checked, then no file exceeds 300 lines <!-- verification: cli-verifiable -->
- [ ] AC2: Given all splits complete, when `npm test` runs, then all tests pass with 0 regressions <!-- verification: cli-verifiable -->

## Technical Notes

**Decision 4 (lib/ Restructuring)** and **Decision 12 (File Size Enforcement).** Four oversized files must be split.

### docker.ts (378 lines) -> src/lib/docker/

```
src/lib/docker/
  index.ts      — Re-exports (<50 lines)
  compose.ts    — startStack, stopStack, startSharedStack (Docker Compose operations)
  health.ts     — getStackHealth, checkDocker (health checks, port availability)
  cleanup.ts    — cleanupOrphanedContainers, cleanupVerifyEnv (container cleanup)
```

Current `src/lib/docker.ts` has compose management, health checks, and cleanup interleaved. Split by responsibility.

### otlp.ts (422 lines) -> src/lib/observability/

```
src/lib/observability/
  index.ts      — Re-exports (<50 lines)
  instrument.ts — instrumentProject (delegates to stack provider for package install)
  config.ts     — configureOtlpEnvVars, ensureServiceNameEnvVar (env var management)
  backends.ts   — ObservabilityBackend interface, VictoriaBackend, ElkBackend (query builders)
```

Note: `src/modules/observability/` already exists for the observability audit module. `src/lib/observability/` is the utility layer for OTLP configuration -- different concern. The `backends.ts` file implements the `ObservabilityBackend` interface from Decision 5.

### beads-sync.ts (590 lines) -> src/lib/sync/

```
src/lib/sync/
  index.ts      — Re-exports (<50 lines)
  beads.ts      — bdCommand, beads CLI wrapper, BeadsNotInstalledError
  sprint-yaml.ts — generateSprintStatusYaml (from story 11-2), readSprintStatus (legacy)
  story-files.ts — readStoryFileStatus, updateStoryFile, parseStoryMarkdown
```

### doc-health.ts (832 lines) -> src/lib/doc-health/

```
src/lib/doc-health/
  index.ts      — Re-exports (<50 lines)
  scanner.ts    — scanDocumentation, findDocFiles
  staleness.ts  — checkStaleness, calculateDocAge
  report.ts     — generateDocHealthReport, formatFindings
```

This is the worst violator at 832 lines. Split into scanning, staleness detection, and report generation.

Import rule (Decision 4): All external consumers import through `index.ts` facades only.

## Files to Change

- `src/lib/docker.ts` — Delete after splitting into `src/lib/docker/`
- `src/lib/docker/index.ts` — Create. Re-exports
- `src/lib/docker/compose.ts` — Create. Compose operations
- `src/lib/docker/health.ts` — Create. Health checks
- `src/lib/docker/cleanup.ts` — Create. Container cleanup
- `src/lib/otlp.ts` — Delete after splitting into `src/lib/observability/`
- `src/lib/observability/index.ts` — Create. Re-exports
- `src/lib/observability/instrument.ts` — Create. Project instrumentation
- `src/lib/observability/config.ts` — Create. OTLP env var config
- `src/lib/observability/backends.ts` — Create. Backend query builders
- `src/lib/beads-sync.ts` — Delete after splitting into `src/lib/sync/`
- `src/lib/sync/index.ts` — Create. Re-exports
- `src/lib/sync/beads.ts` — Create. Beads CLI wrapper
- `src/lib/sync/sprint-yaml.ts` — Create. Sprint YAML generation
- `src/lib/sync/story-files.ts` — Create. Story file operations
- `src/lib/doc-health.ts` — Delete after splitting into `src/lib/doc-health/`
- `src/lib/doc-health/index.ts` — Create. Re-exports
- `src/lib/doc-health/scanner.ts` — Create. Doc scanning
- `src/lib/doc-health/staleness.ts` — Create. Staleness checks
- `src/lib/doc-health/report.ts` — Create. Report generation
- All files importing from the original monolithic files — Update import paths
