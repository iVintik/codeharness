# Story 12.2: Split docker.ts, otlp.ts, beads-sync.ts, doc-health.ts

Status: verifying

## Story

As a developer,
I want all 832/590/453/378-line files split into domain subdirectories,
So that the entire codebase respects the 300-line limit.

## Acceptance Criteria

1. AC1: Given `src/lib/docker/` directory exists, when inspected, then it contains: `index.ts` (under 50 lines, re-exports only), `compose.ts` (startStack, stopStack, startSharedStack, stopSharedStack, startCollectorOnly, stopCollectorOnly), `health.ts` (getStackHealth, getCollectorHealth, checkRemoteEndpoint, isDockerAvailable, isDockerComposeAvailable, isStackRunning, isSharedStackRunning, isCollectorRunning), `cleanup.ts` (cleanupOrphanedContainers, cleanupVerifyEnv — new functions extracted from health/compose if applicable, or empty placeholder if no cleanup logic currently exists) <!-- verification: cli-verifiable -->
2. AC2: Given `src/lib/observability/` directory exists, when inspected, then it contains: `index.ts` (under 50 lines, re-exports only), `instrument.ts` (installNodeOtlp, installPythonOtlp, installRustOtlp, instrumentProject, patchNodeStartScript), `config.ts` (configureOtlpEnvVars, ensureServiceNameEnvVar, ensureEndpointEnvVar, configureCli, configureWeb, configureAgent) <!-- verification: cli-verifiable -->
3. AC3: Given `src/lib/sync/` directory exists, when inspected, then it contains: `index.ts` (under 50 lines, re-exports only), `beads.ts` (syncBeadsToStoryFile, syncStoryFileToBeads, syncClose, syncAll, beadsStatusToStoryStatus, storyStatusToBeadsStatus), `sprint-yaml.ts` (readSprintStatus, updateSprintStatus, appendOnboardingEpicToSprint), `story-files.ts` (resolveStoryFilePath, readStoryFileStatus, updateStoryFileStatus) <!-- verification: cli-verifiable -->
4. AC4: Given `src/lib/doc-health/` directory exists, when inspected, then it contains: `index.ts` (under 50 lines, re-exports only), `scanner.ts` (findModules, scanDocHealth), `staleness.ts` (isDocStale, getSourceFilesInModule, getMentionedFilesInAgentsMd, checkAgentsMdCompleteness, checkAgentsMdForModule, checkDoNotEditHeaders, checkStoryDocFreshness), `report.ts` (formatDocHealthOutput, printDocHealthOutput, createExecPlan, completeExecPlan, getExecPlanStatus) <!-- verification: cli-verifiable -->
5. AC5: Given each file across all four new domain directories (`docker/`, `observability/`, `sync/`, `doc-health/`), when `wc -l` is run on every file, then no file exceeds 300 lines <!-- verification: cli-verifiable -->
6. AC6: Given the old monolithic files (`src/lib/docker.ts`, `src/lib/otlp.ts`, `src/lib/beads-sync.ts`, `src/lib/doc-health.ts`), when the split is complete, then they no longer exist (deleted, not left as stubs) <!-- verification: cli-verifiable -->
7. AC7: Given all consumers that previously imported from `docker.js`, `otlp.js`, `beads-sync.js`, `doc-health.js`, when import paths are inspected, then they import from the new domain directories (`docker/index.js`, `observability/index.js`, `sync/index.js`, `doc-health/index.js`) <!-- verification: cli-verifiable -->
8. AC8: Given `npm test` is run after all changes, when it completes, then all tests pass with 0 regressions <!-- verification: cli-verifiable -->
9. AC9: Given `npx tsc --noEmit` is run after all changes, when it completes, then zero new type errors are introduced <!-- verification: cli-verifiable -->
10. AC10: Given test files for `docker.test.ts` (524 lines), `otlp.test.ts` (1011 lines), `beads-sync.test.ts` (823 lines), `doc-health.test.ts` (846 lines), when the split is complete, then tests are reorganized under the corresponding `__tests__/` subdirectories within each domain directory <!-- verification: cli-verifiable -->
11. AC11: Given files inside any domain directory (e.g., `docker/compose.ts`), when cross-domain imports are checked, then no file imports directly from internal files of another domain directory — only through barrel `index.js` re-exports or shared utilities (`state.js`, `output.js`) <!-- verification: cli-verifiable -->
12. AC12: Given a user runs `codeharness stack`, `codeharness sync`, `codeharness doc-health`, or any command that exercises docker/otlp/beads-sync/doc-health functionality, when the command executes end-to-end, then observable behavior is identical to before the split (same output, same exit codes, same JSON format) <!-- verification: integration-required -->
13. AC13: Given `src/lib/observability/` is created for OTLP utilities, when its purpose is compared to `src/modules/observability/` (audit module), then the two directories serve distinct concerns: `lib/observability/` is the low-level OTLP configuration utility layer, `modules/observability/` is the static analysis audit module <!-- verification: cli-verifiable -->

## Tasks/Subtasks

### docker.ts split (378 lines -> src/lib/docker/)

- [x] Task 1: Create `src/lib/docker/compose.ts` — Move compose operations: `startStack`, `stopStack`, `startSharedStack`, `stopSharedStack`, `startCollectorOnly`, `stopCollectorOnly`, `isStackRunning`, `isSharedStackRunning`, `isCollectorRunning` and related private helpers (AC: #1)
  - [x] Import types from sibling files as needed
  - [x] Import `dockerComposeTemplate`, `dockerComposeCollectorOnlyTemplate` from `../../templates/docker-compose.js`
- [x] Task 2: Create `src/lib/docker/health.ts` — Move health check functions: `isDockerAvailable`, `isDockerComposeAvailable`, `getStackHealth`, `getCollectorHealth`, `checkRemoteEndpoint` and types: `DockerServiceStatus`, `DockerHealthService`, `DockerHealthResult`, `RemoteEndpointCheckResult` (AC: #1)
- [x] Task 3: Create `src/lib/docker/cleanup.ts` — Extract any container cleanup logic, or create minimal placeholder with `cleanupOrphanedContainers` and `cleanupVerifyEnv` stubs if no cleanup logic currently exists in docker.ts (AC: #1)
- [x] Task 4: Create `src/lib/docker/index.ts` — Pure re-export barrel file, under 50 lines (AC: #1, #7)
  - [x] Re-export all public functions and types from `./compose.js`, `./health.js`, `./cleanup.js`
- [x] Task 5: Update all consumer imports for docker (AC: #7)
  - [x] `src/commands/stack.ts` — `from '../lib/docker.js'` -> `from '../lib/docker/index.js'`
  - [x] `src/commands/status.ts` — update import path
  - [x] `src/lib/onboard-checks.ts` — update import path
  - [x] `src/modules/infra/docker-setup.ts` — update import path
  - [x] `src/modules/infra/stack-management.ts` — update import path
  - [x] `src/modules/infra/container-cleanup.ts` — update import path
  - [x] `src/modules/infra/types.ts` — update import path
  - [x] `src/modules/verify/env.ts` — update import path
  - [x] All corresponding test files that import from docker
- [x] Task 6: Delete old `src/lib/docker.ts` (AC: #6)

### otlp.ts split (453 lines -> src/lib/observability/)

- [x] Task 7: Create `src/lib/observability/instrument.ts` — Move installation functions: `installNodeOtlp`, `installPythonOtlp`, `installRustOtlp`, `instrumentProject`, `patchNodeStartScript` and type `OtlpResult` (AC: #2)
  - [x] Import from sibling `./config.js` as needed
- [x] Task 8: Create `src/lib/observability/config.ts` — Move configuration functions: `configureOtlpEnvVars`, `ensureServiceNameEnvVar`, `ensureEndpointEnvVar`, `configureCli`, `configureWeb`, `configureAgent` and exported constants: `WEB_OTLP_PACKAGES`, `AGENT_OTLP_PACKAGES_NODE`, `AGENT_OTLP_PACKAGES_PYTHON`, `NODE_REQUIRE_FLAG` (AC: #2)
- [x] Task 9: Create `src/lib/observability/backends.ts` — Create `ObservabilityBackend` interface with Victoria and ELK implementations for query building (AC: #2)
  - [x] Note: backends.ts may be mostly new code if no backend abstraction exists in otlp.ts today — check current otlp.ts for any backend-specific logic
- [x] Task 10: Create `src/lib/observability/index.ts` — Pure re-export barrel file, under 50 lines (AC: #2, #7)
  - [x] Re-export all public functions, types, and constants
- [x] Task 11: Update all consumer imports for otlp (AC: #7)
  - [x] `src/commands/teardown.ts` — `from '../lib/otlp.js'` -> `from '../lib/observability/index.js'`
  - [x] `src/modules/infra/init-project.ts` — update import path
  - [x] `src/modules/infra/types.ts` — update import path
  - [x] All corresponding test files that import from otlp
- [x] Task 12: Delete old `src/lib/otlp.ts` (AC: #6)

### beads-sync.ts split (590 lines -> src/lib/sync/)

- [x] Task 13: Create `src/lib/sync/story-files.ts` — Move story file operations: `resolveStoryFilePath`, `readStoryFileStatus`, `updateStoryFileStatus` (AC: #3)
  - [x] Import `BeadsIssue` type from `../beads.js`
- [x] Task 14: Create `src/lib/sync/sprint-yaml.ts` — Move sprint status operations: `readSprintStatus`, `updateSprintStatus`, `appendOnboardingEpicToSprint`, `OnboardingStoryEntry` type (AC: #3)
- [x] Task 15: Create `src/lib/sync/beads.ts` — Move sync operations: `beadsStatusToStoryStatus`, `storyStatusToBeadsStatus`, `syncBeadsToStoryFile`, `syncStoryFileToBeads`, `syncClose`, `syncAll` and `SyncResult`, `SyncDirection` types (AC: #3)
  - [x] Import from sibling `./story-files.js` and `./sprint-yaml.js`
- [x] Task 16: Create `src/lib/sync/index.ts` — Pure re-export barrel file, under 50 lines (AC: #3, #7)
  - [x] Re-export all public functions and types
- [x] Task 17: Update all consumer imports for beads-sync (AC: #7)
  - [x] `src/commands/sync.ts` — `from '../lib/beads-sync.js'` -> `from '../lib/sync/index.js'`
  - [x] `src/commands/verify.ts` — update import path
  - [x] `src/modules/verify/orchestrator.ts` — update import path
  - [x] All corresponding test files that import from beads-sync
- [x] Task 18: Delete old `src/lib/beads-sync.ts` (AC: #6)

### doc-health.ts split (832 lines -> src/lib/doc-health/)

- [x] Task 19: Create `src/lib/doc-health/scanner.ts` — Move scanning functions: `findModules`, `scanDocHealth` and types: `DocHealthResult`, `DocHealthReport` (AC: #4)
  - [x] This will be the largest file — ensure it stays under 300 lines
- [x] Task 20: Create `src/lib/doc-health/staleness.ts` — Move staleness/completeness functions: `isDocStale`, `getSourceFilesInModule`, `getMentionedFilesInAgentsMd`, `checkAgentsMdCompleteness`, `checkAgentsMdForModule`, `checkDoNotEditHeaders`, `checkStoryDocFreshness` (AC: #4)
- [x] Task 21: Create `src/lib/doc-health/report.ts` — Move reporting/exec-plan functions: `formatDocHealthOutput`, `printDocHealthOutput`, `createExecPlan`, `completeExecPlan`, `getExecPlanStatus` (AC: #4)
- [x] Task 22: Create `src/lib/doc-health/index.ts` — Pure re-export barrel file, under 50 lines (AC: #4, #7)
  - [x] Re-export all public functions and types
- [x] Task 23: Update all consumer imports for doc-health (AC: #7)
  - [x] `src/commands/doc-health.ts` — `from '../lib/doc-health.js'` -> `from '../lib/doc-health/index.js'`
  - [x] `src/lib/scanner.ts` — `from './doc-health.js'` -> `from './doc-health/index.js'`
  - [x] `src/modules/audit/dimensions.ts` — update import path
  - [x] `src/commands/verify.ts` — update import path
  - [x] `src/modules/verify/orchestrator.ts` — update import path
  - [x] All corresponding test files that import from doc-health
- [x] Task 24: Delete old `src/lib/doc-health.ts` (AC: #6)

### Test reorganization

- [x] Task 25: Reorganize `src/lib/__tests__/docker.test.ts` (524 lines) into `src/lib/docker/__tests__/` with files matching source modules (e.g., `compose.test.ts`, `health.test.ts`) (AC: #10)
- [x] Task 26: Reorganize `src/lib/__tests__/otlp.test.ts` (1011 lines) into `src/lib/observability/__tests__/` with files matching source modules (e.g., `instrument.test.ts`, `config.test.ts`) (AC: #10)
- [x] Task 27: Reorganize `src/lib/__tests__/beads-sync.test.ts` (823 lines) into `src/lib/sync/__tests__/` with files matching source modules (e.g., `beads.test.ts`, `sprint-yaml.test.ts`, `story-files.test.ts`) (AC: #10)
- [x] Task 28: Reorganize `src/lib/__tests__/doc-health.test.ts` (846 lines) into `src/lib/doc-health/__tests__/` with files matching source modules (e.g., `scanner.test.ts`, `staleness.test.ts`, `report.test.ts`) (AC: #10)
- [x] Task 29: Delete old test files after reorganization (AC: #10)
- [x] Task 30: Update test imports in command test files that mock or import from the old paths (AC: #7, #10)

### Cross-cutting verification

- [x] Task 31: Verify cross-domain import discipline — grep for internal cross-domain imports (AC: #11)
- [x] Task 32: Run `npx tsc --noEmit` — zero new type errors (AC: #9)
- [x] Task 33: Run `npm test` — all tests pass, zero regressions (AC: #8)

## Dev Notes

### Current File Sizes (actual measured)

| File | Lines | Target Directory |
|------|-------|-----------------|
| `src/lib/doc-health.ts` | 832 | `src/lib/doc-health/` |
| `src/lib/beads-sync.ts` | 590 | `src/lib/sync/` |
| `src/lib/otlp.ts` | 453 | `src/lib/observability/` |
| `src/lib/docker.ts` | 378 | `src/lib/docker/` |
| **Total** | **2,253** | |

### Current Test File Sizes

| Test File | Lines |
|-----------|-------|
| `src/lib/__tests__/otlp.test.ts` | 1,011 |
| `src/lib/__tests__/doc-health.test.ts` | 846 |
| `src/lib/__tests__/beads-sync.test.ts` | 823 |
| `src/lib/__tests__/docker.test.ts` | 524 |
| **Total** | **3,204** |

### Consumer Inventory

#### docker.ts consumers (13 source files + test files)
- `src/commands/stack.ts` — isSharedStackRunning, startSharedStack, stopSharedStack, getStackHealth, isCollectorRunning, startCollectorOnly, stopCollectorOnly, getCollectorHealth, checkRemoteEndpoint
- `src/commands/status.ts` — getStackHealth, getCollectorHealth, isSharedStackRunning, checkRemoteEndpoint, DockerHealthResult
- `src/lib/onboard-checks.ts` — isStackRunning
- `src/modules/infra/docker-setup.ts` — isDockerAvailable, isDockerComposeAvailable, isSharedStackRunning, startSharedStack, startCollectorOnly
- `src/modules/infra/stack-management.ts` — multiple docker imports
- `src/modules/infra/container-cleanup.ts` — isDockerAvailable
- `src/modules/infra/types.ts` — DockerStartResult
- `src/modules/verify/env.ts` — isDockerAvailable

#### otlp.ts consumers (4 source files + test files)
- `src/commands/teardown.ts` — NODE_REQUIRE_FLAG
- `src/modules/infra/init-project.ts` — instrumentProject
- `src/modules/infra/types.ts` — OtlpResult

#### beads-sync.ts consumers (4 source files + test files)
- `src/commands/sync.ts` — syncAll, syncStoryFileToBeads, syncBeadsToStoryFile, SyncDirection, SyncResult, readSprintStatus, updateSprintStatus, appendOnboardingEpicToSprint
- `src/commands/verify.ts` — updateSprintStatus
- `src/modules/verify/orchestrator.ts` — syncClose

#### doc-health.ts consumers (5 source files + test files)
- `src/commands/doc-health.ts` — multiple imports
- `src/lib/scanner.ts` — findModules, isDocStale
- `src/modules/audit/dimensions.ts` — scanDocHealth
- `src/commands/verify.ts` — completeExecPlan
- `src/modules/verify/orchestrator.ts` — checkStoryDocFreshness

### Important: observability/ namespace collision

`src/modules/observability/` already exists as the static analysis audit module. `src/lib/observability/` will contain the low-level OTLP configuration utilities. These are distinct concerns:
- `src/lib/observability/` — OTLP package installation, env var configuration, backend query builders (utility layer)
- `src/modules/observability/` — Semgrep-based static analysis for missing observability instrumentation (business logic module)

No naming conflict — `lib/` and `modules/` are different architectural layers. Document this distinction in a comment in `src/lib/observability/index.ts`.

### backends.ts Note

The epic definition specifies `backends.ts` with `ObservabilityBackend` interface, `VictoriaBackend`, and `ElkBackend`. Current `otlp.ts` may not contain backend abstraction logic — this may need to be created as new code implementing the interface from architecture-v3.md Decision 5. If no backend-specific logic exists in `otlp.ts` today, create a minimal `backends.ts` with the interface and placeholder implementations. Do NOT over-engineer — just enough to satisfy the split structure.

### cleanup.ts Note

The epic definition specifies `cleanup.ts` with `cleanupOrphanedContainers` and `cleanupVerifyEnv`. Current `docker.ts` may not have these exact functions. Check `src/modules/infra/container-cleanup.ts` — cleanup logic may live there already. If docker.ts has no cleanup functions, create `cleanup.ts` as a minimal file that re-exports from the infra module, or create stubs with TODO comments.

### Import Rules (architecture-v3.md, Decision 4)

- External consumers import from `src/lib/{domain}/index.ts` only
- Within a domain, files can import from siblings
- No cross-domain internal imports — use `../docker/index.js`, not `../docker/compose.js`
- `src/lib/state.ts` and `src/lib/output.ts` are shared utilities — any file can import them

### Dependency Graph Within Each Domain

**docker/**
- `health.ts` — types only, no internal deps (pure functions + execSync)
- `compose.ts` — depends on `../../templates/docker-compose.js`, may need types from `./health.js`
- `cleanup.ts` — may depend on `./health.js` for isDockerAvailable
- `index.ts` — re-exports from all three

**observability/**
- `config.ts` — env var helpers, standalone
- `instrument.ts` — depends on `./config.js` for env var setup, `../stacks/index.js` for provider
- `backends.ts` — standalone (interface + implementations)
- `index.ts` — re-exports from all three

**sync/**
- `story-files.ts` — depends on `../beads.js` for BeadsIssue type
- `sprint-yaml.ts` — standalone (reads/writes YAML)
- `beads.ts` — depends on `./story-files.js`, `./sprint-yaml.js`, `../beads.js`
- `index.ts` — re-exports from all three

**doc-health/**
- `scanner.ts` — core scanning logic, types
- `staleness.ts` — depends on types from `./scanner.js`
- `report.ts` — depends on types from `./scanner.js`
- `index.ts` — re-exports from all three

### Patterns Established by Story 12-1

Follow the same patterns from the coverage/ split:
- Barrel index files are pure re-exports, under 50 lines
- Tests reorganized into `__tests__/` within the domain directory
- Consumer imports updated to use `/index.js` suffix
- Old monolithic file deleted (not left as stub)
- No cross-domain internal imports
- Do NOT create `AGENTS.md` in domain directories — that's a modules/ convention

### Project Structure Notes

- This is Story 12-2 of Epic 12 (lib/ Restructuring). Story 12-1 (coverage/ split) is the template.
- Story 12-3 will move business logic from status.ts command to a status module.
- Story 12-4 will create shared test utilities and fixtures.

### References

- [Source: _bmad-output/planning-artifacts/architecture-v3.md — Decision 4: lib/ Restructuring]
- [Source: _bmad-output/planning-artifacts/epics-architecture-v3.md — Epic 12, Story 12-2]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [x] Showboat proof document created (`docs/exec-plans/active/12-2-split-docker-otlp-beads-dochealth.proof.md`)
- [x] All acceptance criteria verified with real-world evidence
- [x] Test coverage meets target (100%)

## Documentation Requirements

- [x] Relevant AGENTS.md files updated (list modules touched)
- [x] Exec-plan created in `docs/exec-plans/active/12-2-split-docker-otlp-beads-dochealth.md`

## Testing Requirements

- [x] Unit tests written for all new/changed code
- [x] Integration tests for cross-module interactions
- [x] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
