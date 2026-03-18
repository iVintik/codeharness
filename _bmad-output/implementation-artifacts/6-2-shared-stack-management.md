# Story 6.2: Shared Stack Management

Status: verifying

## Story

As an operator,
I want the shared observability stack properly managed,
so that init works cleanly across projects with port conflict detection and stale container cleanup.

## Acceptance Criteria

1. **Given** a shared observability stack is already running, **When** `codeharness init` runs in a new project, **Then** it detects the running stack via `isSharedStackRunning()` and reuses it without starting a duplicate — returning `ok` with `stack_running: true` and the existing compose file path. <!-- verification: cli-verifiable -->
2. **Given** a port required by the observability stack (4317, 4318, 8428, 9428, 16686) is already in use by a non-codeharness process, **When** `ensureStack()` is called, **Then** it detects the conflict before starting containers and returns `fail()` with a message identifying the conflicting port and the process occupying it. <!-- verification: cli-verifiable -->
3. **Given** stale codeharness Docker containers exist (matching `codeharness-shared-*` or `codeharness-collector-*` patterns, in exited/dead state), **When** `cleanupContainers()` is called, **Then** they are removed and the function returns `ok` with a count of containers removed. <!-- verification: cli-verifiable -->
4. **Given** `codeharness status --check-docker` is run, **When** a shared stack is active, **Then** the output reports the correct shared container names, their health status, and the compose project name (`codeharness-shared` or `codeharness-collector`). <!-- verification: cli-verifiable -->
5. **Given** `ensureStack()` is called and Docker is available but the shared stack is not running, **When** it executes, **Then** it starts the shared stack and returns `ok` with `StackStatus` containing `running: true` and a list of services with health status. <!-- verification: cli-verifiable -->
6. **Given** `ensureStack()` is called and Docker is not available, **When** it executes, **Then** it returns `fail()` with a descriptive error indicating Docker is required — it never throws. <!-- verification: cli-verifiable -->
7. **Given** `cleanupContainers()` is called and Docker is not available, **When** it executes, **Then** it returns `ok` with zero containers removed — it never throws. <!-- verification: cli-verifiable -->
8. **Given** the infra module stubs for `ensureStack()` and `cleanupContainers()`, **When** this story is complete, **Then** the stubs in `src/modules/infra/index.ts` are replaced with real implementations that delegate to internal module files. <!-- verification: cli-verifiable -->
9. **Given** `ensureStack()` starts the shared stack successfully, **When** the stack was previously torn down by another project, **Then** data volumes from the shared stack are preserved (NFR11: shared stack survives project-level init/teardown without data loss). <!-- verification: integration-required -->
10. **Given** all new code in `src/modules/infra/`, **When** tests are run, **Then** unit tests cover all new functions with mocked Docker interactions and 100% coverage on new code. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Create `src/modules/infra/stack-management.ts` (AC: #1, #2, #5, #6, #9)
  - [x]Implement `ensureStack(): Promise<Result<StackStatus>>` — the main orchestrator
  - [x]Implement `detectPortConflicts(ports: number[]): Result<PortConflictResult>` — checks if ports are in use
  - [x]Implement `detectRunningStack(): Result<StackDetectionResult>` — checks shared stack status
  - [x]Wrap all functions in try/catch, return `Result<T>`
  - [x]Keep under 300 lines
- [x] Task 2: Create `src/modules/infra/container-cleanup.ts` (AC: #3, #7)
  - [x]Implement `cleanupContainers(): Result<CleanupResult>` — removes stale containers
  - [x]Filter containers by `codeharness-shared-*` and `codeharness-collector-*` patterns
  - [x]Handle Docker-not-available gracefully (return ok with 0 removed)
  - [x]Keep under 300 lines
- [x] Task 3: Update `src/modules/infra/types.ts` (AC: #2, #3, #5)
  - [x]Add `PortConflictResult` type (port, pid, process name)
  - [x]Add `CleanupResult` type (containersRemoved, names)
  - [x]Add `StackDetectionResult` type (running, projectName, services)
  - [x]Expand `StackStatus` if needed for health details
- [x] Task 4: Update `src/modules/infra/index.ts` (AC: #8)
  - [x]Replace `ensureStack()` stub with real delegation to `stack-management.ts`
  - [x]Replace `cleanupContainers()` stub with real delegation to `container-cleanup.ts`
  - [x]Re-export new public types
- [x] Task 5: Update `src/commands/status.ts` for `--check-docker` (AC: #4)
  - [x]Ensure `--check-docker` path reports shared container names and compose project
  - [x]Use infra module functions for health check if applicable
- [x] Task 6: Create tests (AC: #10)
  - [x]`src/modules/infra/__tests__/stack-management.test.ts` — mock Docker interactions
  - [x]`src/modules/infra/__tests__/container-cleanup.test.ts` — mock Docker interactions
  - [x]Test port conflict detection with mocked `execFileSync`
  - [x]Test cleanup when Docker unavailable
  - [x]Test ensureStack reuse path (shared stack already running)
  - [x]Test ensureStack start path (shared stack not running)
- [x] Task 7: Verify build (`npm run build`) succeeds
- [x] Task 8: Verify all tests pass (`npm test`)
- [x] Task 9: Verify no file exceeds 300 lines (NFR18)

## Dev Notes

### Architecture Constraints

- **Result<T> pattern** — every public function returns `Result<T>`, never throws. Import `ok`, `fail` from `../../types/result.js`. [Source: architecture-overhaul.md#Decision 1]
- **ES modules** — all imports use `.js` extension. [Source: tsconfig.json]
- **Strict TypeScript** — `strict: true`, no `any` types (NFR19).
- **File size limit** — no file exceeds 300 lines (NFR18).
- **100% test coverage** on new code (NFR14).
- **Module boundary** — internal files are private to infra module. Only `index.ts` is the public interface.

### Current State

`src/modules/infra/index.ts` has two stubs to replace:
- `ensureStack()` — currently returns `fail('not implemented')`
- `cleanupContainers()` — currently returns `fail('not implemented')`

`src/modules/infra/docker-setup.ts` already handles shared stack detection and startup during init (in `handleLocalShared`). The new `stack-management.ts` provides a standalone `ensureStack()` that can be called outside of init — e.g., by `codeharness run` before spawning verification containers.

`src/modules/verify/env.ts` already has `cleanupStaleContainers()` for verify containers (`codeharness-verify-*`). The new `container-cleanup.ts` handles infra containers (`codeharness-shared-*`, `codeharness-collector-*`). These are complementary, not overlapping.

### Port Conflict Detection

Use `execFileSync('lsof', ['-i', `:${port}`, '-t'])` on macOS/Linux to detect processes using a port. On failure (port free), lsof returns non-zero. Wrap in try/catch. This is the standard approach for pre-flight port checks.

### Lib Files Used

- `src/lib/docker.ts` — `isDockerAvailable()`, `isSharedStackRunning()`, `startSharedStack()`, `getStackHealth()`, `stopSharedStack()`
- `src/lib/stack-path.ts` — `getComposeFilePath()`

### Dependencies

- **Story 6-1 (verifying):** Infra module structure, init-project.ts, docker-setup.ts
- **No external dependencies needed.** All logic wraps existing `src/lib/docker.ts` functions.

### What This Unblocks

- `ensureStack()` is needed by sprint execution before verification runs
- `cleanupContainers()` is needed by `codeharness run` for pre-flight cleanup (FR5)

### References

- [Source: _bmad-output/planning-artifacts/epics-overhaul.md#Story 6.2]
- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md — infra module]
- [Source: _bmad-output/planning-artifacts/prd-overhaul.md — FR2, FR5, NFR11, NFR12]
- [Source: src/modules/infra/index.ts — stubs to replace]
- [Source: src/modules/infra/docker-setup.ts — existing shared stack logic]
- [Source: src/lib/docker.ts — Docker helper functions]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/6-2-shared-stack-management.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/6-2-shared-stack-management.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
