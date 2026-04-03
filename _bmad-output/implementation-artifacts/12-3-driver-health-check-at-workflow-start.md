# Story 12.3: Driver Health Check at Workflow Start

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want all referenced drivers health-checked before any task executes,
so that I get immediate feedback if a CLI is missing or unauthenticated instead of discovering it mid-workflow.

## Acceptance Criteria

1. **Given** a workflow YAML referencing drivers `claude-code` and `codex`
   **When** `executeWorkflow()` is called
   **Then** the engine calls `healthCheck()` on every unique driver referenced in the workflow before executing any task
   **And** drivers are deduplicated (if three tasks use `claude-code`, `healthCheck()` is called once)
   <!-- verification: test-provable -->

2. **Given** all drivers pass their health checks (all return `available: true`)
   **When** the health check phase completes
   **Then** the workflow proceeds to task execution normally
   **And** no error is logged or thrown
   <!-- verification: test-provable -->

3. **Given** one or more drivers fail their health check (return `available: false`)
   **When** the health check phase completes
   **Then** the engine aborts with a clear error listing ALL failing drivers and their error messages
   **And** the error message includes the driver name and the `error` field from `DriverHealth` for each failing driver
   **And** no tasks have been dispatched
   <!-- verification: test-provable -->

4. **Given** a workflow where all tasks use the default driver (`claude-code`, no explicit `driver` field)
   **When** `executeWorkflow()` is called
   **Then** only the `claude-code` driver's `healthCheck()` is called (one call total)
   <!-- verification: test-provable -->

5. **Given** the health check phase starts
   **When** all driver health checks are invoked
   **Then** all health checks run concurrently via `Promise.all()` (not sequentially)
   **And** the total health check phase completes within 5 seconds (NFR6 — enforced by a `Promise.race` with a 5-second timeout)
   <!-- verification: test-provable -->

6. **Given** the health check phase exceeds the 5-second timeout (NFR6)
   **When** `Promise.race` resolves with the timeout
   **Then** the engine aborts with a clear error message indicating which drivers did not respond in time
   **And** no tasks have been dispatched
   <!-- verification: test-provable -->

7. **Given** a workflow state with `phase: 'completed'` (already finished)
   **When** `executeWorkflow()` is called
   **Then** the existing early-exit path returns immediately without calling any health checks
   <!-- verification: test-provable -->

8. **Given** driver registration occurs before `executeWorkflow()`
   **When** the engine collects unique driver names from the workflow
   **Then** it iterates `config.workflow.tasks`, reads each task's `driver` field (defaulting to `'claude-code'`), deduplicates, and calls `getDriver(name)` to resolve each to a registered `AgentDriver` before calling `healthCheck()`
   <!-- verification: test-provable -->

9. **Given** `npm run build` is executed after all changes
   **When** the build completes
   **Then** it succeeds with zero TypeScript errors
   **And** `npm run test:unit` passes with no regressions in existing test suites
   <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Implement `checkDriverHealth()` function in `workflow-engine.ts` (AC: #1, #2, #3, #5, #6, #8)
  - [x] Add a new exported async function `checkDriverHealth(workflow: ResolvedWorkflow): Promise<void>`
  - [x] Collect unique driver names from `workflow.tasks` — `task.driver ?? 'claude-code'` for each task
  - [x] Deduplicate driver names into a `Set<string>`
  - [x] For each unique driver name, call `getDriver(name)` to resolve the `AgentDriver`
  - [x] Run all `driver.healthCheck()` concurrently via `Promise.all()`
  - [x] Wrap with `Promise.race([healthChecks, timeout(5000)])` for NFR6 compliance
  - [x] If timeout fires, throw an error listing drivers that did not respond
  - [x] After all checks complete, collect failures (where `available === false`)
  - [x] If any failures, throw an error listing all failing driver names and their `error` messages
  - [x] If all pass, return void (success)

- [x] Task 2: Integrate `checkDriverHealth()` into `executeWorkflow()` (AC: #1, #2, #3, #4, #7)
  - [x] Add the health check call after workflow state initialization but BEFORE the work-items loading / flow-step iteration
  - [x] Place it after the early exit for `phase === 'completed'` (so completed workflows skip health checks)
  - [x] Wrap in try/catch — on failure, set `phase: 'failed'`, push error to `errors[]`, return early with `success: false`

- [x] Task 3: Write unit tests for `checkDriverHealth()` (AC: #1-#9)
  - [x] Test: single driver, health check passes — no error thrown
  - [x] Test: multiple unique drivers, all pass — no error thrown
  - [x] Test: deduplicated drivers — `healthCheck()` called once per unique driver
  - [x] Test: one driver fails — error thrown listing the failing driver and its error message
  - [x] Test: multiple drivers fail — error lists ALL failing drivers, not just the first
  - [x] Test: default driver (`claude-code`) used when task has no `driver` field
  - [x] Test: timeout — if health check hangs, error thrown after 5 seconds
  - [x] Test: completed workflow skips health checks entirely

- [x] Task 4: Verify build and tests (AC: #9)
  - [x] Run `npm run build` — zero TypeScript errors
  - [x] Run `npm run test:unit` — all tests pass, no regressions

## Dev Notes

### Architecture Compliance

This story implements Epic 3, Story 3.3 (mapped to sprint Epic 12, Story 12-3) "Driver Health Check at Workflow Start" from `epics-multi-framework.md`. It covers:
- **NFR6:** Driver health check (all drivers in workflow) must complete within 5 seconds at workflow start.
- **FR2/FR3 (enforcement):** The health check uses each driver's existing `healthCheck()` method (implemented in stories 10-3, 12-1, 12-2). This story wires the checks into the workflow engine pre-flight.

Key architecture decisions honored:
- **Decision 1 (Driver Interface):** `healthCheck()` is already part of `AgentDriver`. This story consumes it — no interface changes.
- **Flow from architecture-multi-framework.md:** `driver-factory → get driver by name → driver.healthCheck()` — this story implements exactly this call path at workflow start.

### Implementation Strategy

The change is localized to `src/lib/workflow-engine.ts`:

1. **New function `checkDriverHealth()`** — pure function that takes a `ResolvedWorkflow`, extracts unique drivers, runs health checks concurrently with a 5-second timeout. Throws on failure. This is testable in isolation.

2. **Integration into `executeWorkflow()`** — a single call to `checkDriverHealth()` inserted between state initialization and work-item loading. The existing early-exit for `phase === 'completed'` remains above it.

### Where to Insert in `executeWorkflow()`

Current flow (line numbers approximate):
```
738: export async function executeWorkflow(config)
745:   let state = readWorkflowState(...)
748:   if (state.phase === 'completed') return;  // <-- keep this ABOVE health check
759:   state = { ...state, phase: 'executing', ... }
765:   writeWorkflowState(state, projectDir)
767:   // 2. Load work items                      // <-- INSERT health check BEFORE this
768:   const workItems = loadWorkItems(...)
```

Insert the health check call between line 765 (write state) and line 767 (load work items). This ensures:
- Completed workflows skip health checks (early exit on line 748)
- State is already written as `executing` before health checks run
- If health checks fail, no work items are loaded and no tasks dispatched

### Key API Surface

```typescript
// New export from workflow-engine.ts
export async function checkDriverHealth(workflow: ResolvedWorkflow): Promise<void>;
```

Internally uses:
- `getDriver(name)` from `./agents/drivers/factory.js` (already imported)
- `driver.healthCheck()` from `AgentDriver` interface
- `ResolvedWorkflow` from `./workflow-parser.js` (already imported)

### What NOT to Do

- Do NOT modify `factory.ts` — only consume `getDriver()`.
- Do NOT modify any driver files (`claude-code.ts`, `codex.ts`, `opencode.ts`) — health check logic is already implemented.
- Do NOT modify `types.ts` — `DriverHealth` and `AgentDriver` already exist.
- Do NOT modify `workflow-parser.ts` — `ResolvedTask.driver` already exists.
- Do NOT run health checks sequentially — use `Promise.all()` for concurrency.
- Do NOT swallow health check errors — the whole point is to surface them clearly.
- Do NOT add new dependencies — only use existing imports.
- Do NOT change the `EngineConfig` interface — the workflow is already available on `config.workflow`.

### Previous Story Intelligence

From story 12-2 (OpenCode Driver Implementation):
- 64 new tests added, 4478 total passing across 166 test files.
- `healthCheck()` on `OpenCodeDriver` checks `which opencode`, version, and optional auth. Returns `DriverHealth`.
- All three CLI drivers (`claude-code`, `codex`, `opencode`) have `healthCheck()` implemented identically in structure.

From story 12-1 (Codex Driver Implementation):
- `healthCheck()` on `CodexDriver` checks `which codex`, `codex --version`, and auth. Same `DriverHealth` return type.
- `IGNORE:` comments required on catch blocks for linter compliance.

From story 10-5 (Workflow Engine Driver Integration):
- `getDriver()` is already imported and used in `workflow-engine.ts` (line 7).
- Driver resolution happens per-task at dispatch time (line 293-294). This story adds pre-flight validation at workflow start.

### Git Intelligence

Recent commits (all in current sprint):
- `1ed6db3` — story 12-2: OpenCode Driver Implementation
- `6edd1df` — story 12-1: Codex Driver Implementation
- `44c0b70` — story 11-2: workflow referential integrity validation
- `a4bf7e6` — story 11-1: workflow schema extension
- `f128064` — story 10-5: workflow engine driver integration

### Testing Patterns

Follow the existing `workflow-engine.test.ts` patterns:
- Mock `getDriver()` via `vi.mock('./agents/drivers/factory.js', ...)`
- Create mock `AgentDriver` objects with `healthCheck` returning `Promise<DriverHealth>`
- Use `vi.fn()` for health check methods to verify call counts (deduplication)
- Test timeout by having a mock `healthCheck` that never resolves (use `new Promise(() => {})`)
- Verify error messages contain failing driver names and error strings

### Project Structure Notes

Files to MODIFY:
- `src/lib/workflow-engine.ts` — Add `checkDriverHealth()` function and integrate into `executeWorkflow()`

Files to possibly MODIFY:
- `src/lib/__tests__/workflow-engine.test.ts` — Add tests for health check behavior (or create a focused test file if the existing one is large)

Files NOT to modify:
- `src/lib/agents/drivers/factory.ts` — consume only
- `src/lib/agents/drivers/claude-code.ts` — already has healthCheck
- `src/lib/agents/drivers/codex.ts` — already has healthCheck
- `src/lib/agents/drivers/opencode.ts` — already has healthCheck
- `src/lib/agents/types.ts` — DriverHealth, AgentDriver already exist
- `src/lib/workflow-parser.ts` — ResolvedTask.driver already exists

### References

- [Source: _bmad-output/planning-artifacts/epics-multi-framework.md#Story 3.3: Driver Health Check at Workflow Start]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md — driver-factory → get driver by name → driver.healthCheck()]
- [Source: _bmad-output/planning-artifacts/prd.md — NFR6: Driver health check must complete within 5 seconds]
- [Source: _bmad-output/planning-artifacts/prd.md — Driver health check at startup]
- [Source: src/lib/workflow-engine.ts — executeWorkflow() function, lines 738+]
- [Source: src/lib/agents/types.ts — DriverHealth, AgentDriver interfaces]
- [Source: src/lib/agents/drivers/factory.ts — getDriver()]
- [Source: _bmad-output/implementation-artifacts/12-2-opencode-driver-implementation.md — previous story context]
- [Source: _bmad-output/implementation-artifacts/12-1-codex-driver-implementation.md — codex driver context]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/12-3-driver-health-check-at-workflow-start-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/12-3-driver-health-check-at-workflow-start.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None.

### Completion Notes List

- Implemented `checkDriverHealth()` in `workflow-engine.ts` with concurrent health checks and 5s timeout
- Integrated into `executeWorkflow()` after state initialization, before work item loading
- Added optional `timeoutMs` parameter for testability (defaults to 5000ms)
- Created dedicated test file `driver-health-check.test.ts` with 10 tests covering all ACs
- Updated existing test mock to return healthy `DriverHealth` from `healthCheck()`
- Updated one existing test assertion (`mockGetDriver` call count) to account for health check call
- Build: 0 TypeScript errors. Tests: 4488 passed, 0 failed, 167 test files.

### File List

- `src/lib/workflow-engine.ts` — Added `checkDriverHealth()` function and integration into `executeWorkflow()`
- `src/lib/__tests__/driver-health-check.test.ts` — New test file with 10 tests for health check behavior
- `src/lib/__tests__/workflow-engine.test.ts` — Updated mock and assertion for health check compatibility
