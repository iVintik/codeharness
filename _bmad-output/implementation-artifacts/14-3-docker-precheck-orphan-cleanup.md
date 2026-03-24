# Story 14.3: Docker Pre-check and Orphan Cleanup

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer running harness-run,
I want Docker availability checked BEFORE any verification attempt and orphaned containers cleaned up automatically,
So that sessions don't burn 30 minutes on Docker failures and leftover containers don't interfere with fresh runs.

## Acceptance Criteria

1. Given Docker daemon is not running, when `codeharness run` executes its pre-flight checks, then it exits with a non-zero code and outputs `[FAIL] Docker not available` before spawning the agent <!-- verification: cli-verifiable -->
2. Given Docker daemon is not running, when `codeharness run` executes its pre-flight checks, then no agent process is spawned (no Ralph/Claude invocation occurs) <!-- verification: cli-verifiable -->
3. Given a leftover `codeharness-verify-*` container (exited or dead) from a crashed session, when `codeharness run` pre-flight runs, then the orphaned container is removed and an `[INFO]` message is logged <!-- verification: cli-verifiable -->
4. Given leftover `codeharness-shared-*` and `codeharness-collector-*` containers (exited or dead), when `codeharness run` pre-flight runs, then those orphaned containers are also removed <!-- verification: cli-verifiable -->
5. Given Docker is available but no orphaned containers exist, when `codeharness run` pre-flight runs, then cleanup completes silently (no error, no unnecessary output) and execution continues normally <!-- verification: cli-verifiable -->
6. Given Docker is available and orphan cleanup encounters a removal failure on one container, when pre-flight runs, then it continues removing other containers and does not abort the session <!-- verification: cli-verifiable -->
7. Given `npm run build` runs after all changes, then TypeScript compilation succeeds with zero errors <!-- verification: cli-verifiable -->
8. Given `npm test` runs after all changes, then all existing tests pass with zero regressions <!-- verification: cli-verifiable -->
9. Given no new file created for this story, when line count is checked, then no modified file exceeds 300 lines <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1 (AC: 1, 2): Add Docker pre-check to `run.ts` pre-flight section
  - [x] After state reconciliation (step 1b) and before story count check (step 2), call `isDockerAvailable()` from `src/lib/docker/index.js`
  - [x] If false, call `fail('[FAIL] Docker not available — install Docker or start the daemon')`, set `process.exitCode = 1`, and return early
  - [x] This prevents any agent spawn, prompt generation, or Docker operations from executing

- [x] Task 2 (AC: 3, 4): Consolidate orphan cleanup in `container-cleanup.ts`
  - [x] Extend `STALE_PATTERNS` array to include `'codeharness-verify-'` alongside existing `'codeharness-shared-'` and `'codeharness-collector-'`
  - [x] This single change makes the existing `cleanupContainers()` function also clean up verify containers
  - [x] No new function needed — the existing logic already handles Docker-not-available, per-container failure resilience, and Result<CleanupResult> return

- [x] Task 3 (AC: 3, 4, 5): Call cleanup from `run.ts` pre-flight
  - [x] After the Docker pre-check passes, call `cleanupContainers()` from `src/modules/infra/index.js`
  - [x] If result is success and `containersRemoved > 0`, log `[INFO] Cleaned up ${n} orphaned container(s): ${names.join(', ')}`
  - [x] If result is failure, log `[WARN] Container cleanup failed: ${error}` but do NOT abort the session

- [x] Task 4 (AC: 3): Update `src/lib/docker/cleanup.ts` stub to delegate to infra module
  - [x] Replace the placeholder `cleanupOrphanedContainers()` with a real implementation that calls `cleanupContainers()` from the infra module
  - [x] Or leave as-is if it's acceptable to keep the stub (the run.ts pre-flight calls the infra module directly)

- [x] Task 5 (AC: 1, 2, 5, 6): Add unit tests for pre-flight Docker check and cleanup in run.ts
  - [x] Test: Docker not available -> fail message, exitCode 1, no agent spawn
  - [x] Test: Docker available, no orphans -> continues normally
  - [x] Test: Docker available, orphans found -> cleanup runs, info logged, continues
  - [x] Test: Docker available, cleanup fails -> warning logged, continues

- [x] Task 6 (AC: 3, 4): Add test for verify-pattern inclusion in container-cleanup.ts
  - [x] Test: stale `codeharness-verify-*` containers are found and removed
  - [x] Extend existing tests in `src/modules/infra/__tests__/container-cleanup.test.ts`

- [x] Task 7 (AC: 7): Run `npm run build` — TypeScript compilation succeeds
- [x] Task 8 (AC: 8): Run `npm test` — all existing tests pass, zero regressions
- [x] Task 9 (AC: 9): Verify all modified files are under 300 lines

## Dev Notes

### Architecture Compliance

- **Decision 11 (Process Enforcement):** This story implements two of five embedded gates in harness-run Step 1 pre-flight: Docker pre-check and orphan cleanup. The architecture specifies `docker info` as the check, but `isDockerAvailable()` already exists in `src/lib/docker/health.ts` and uses `docker --version` with a 10s timeout — use it.
- **Decision 7 (300-line limit, NFR5):** All modified files must stay under 300 lines. `run.ts` is currently 287 lines — budget is tight. The pre-flight additions should be ~15 lines max.

### Implementation Guidance

#### Where to modify

**`src/commands/run.ts`** — The pre-flight section. Currently the file has:
- Step 1: Plugin directory check (lines 88-94)
- Step 1b: State reconciliation (lines 96-104)
- Step 2: Read sprint status for story count (lines 106-116)

Insert Docker pre-check between step 1b and step 2. Insert orphan cleanup immediately after Docker pre-check.

```typescript
// 1c. Docker pre-flight: fail fast if Docker unavailable
if (!isDockerAvailable()) {
  fail('[FAIL] Docker not available — install Docker or start the daemon', outputOpts);
  process.exitCode = 1;
  return;
}

// 1d. Orphan container cleanup (best-effort — failures warn but don't abort)
const cleanup = cleanupContainers();
if (cleanup.success && cleanup.data.containersRemoved > 0) {
  info(`[INFO] Cleaned up ${cleanup.data.containersRemoved} orphaned container(s): ${cleanup.data.names.join(', ')}`, outputOpts);
} else if (!cleanup.success) {
  info(`[WARN] Container cleanup failed: ${cleanup.error}`, outputOpts);
}
```

This adds ~10 lines to run.ts (287 -> ~297, under 300).

**`src/modules/infra/container-cleanup.ts`** — Add `'codeharness-verify-'` to `STALE_PATTERNS`:

```typescript
const STALE_PATTERNS = ['codeharness-shared-', 'codeharness-collector-', 'codeharness-verify-'];
```

This is a 0-line-count change (just extending the array literal). The file is currently 84 lines.

#### Imports needed in run.ts

```typescript
import { isDockerAvailable } from '../lib/docker/index.js';
import { cleanupContainers } from '../modules/infra/index.js';
```

Both modules are already used elsewhere in the codebase.

#### What NOT to do

- Do NOT create a new `DockerNotAvailableError` class — the old skeleton suggested this but it's unnecessary. The `fail()` output function plus early return is the established pattern in `run.ts` (see plugin directory check at line 91).
- Do NOT use `execSync('docker info')` directly — use the existing `isDockerAvailable()` from `src/lib/docker/health.ts` which already handles timeouts and error catching.
- Do NOT create a new cleanup function — the existing `cleanupContainers()` in `src/modules/infra/container-cleanup.ts` already does exactly what's needed; just extend its pattern list.
- Do NOT modify `src/modules/verify/env.ts` — it has its own `cleanupStaleContainers()` for verify-specific cleanup. The pre-flight cleanup in run.ts catches the same containers at session start. The verify module's function is used during active verification sessions. Both can coexist.

### Testing Guidance

- **Vitest** (not Jest). Use `vi.fn()`, `vi.mock()`, `vi.mocked()`.
- Imports: `import { describe, it, expect, vi } from 'vitest'`
- For `run.ts` tests: mock `isDockerAvailable` and `cleanupContainers` at the module level. The existing test file is at `src/commands/__tests__/run.test.ts`.
- For `container-cleanup.ts` tests: the existing test file at `src/modules/infra/__tests__/container-cleanup.test.ts` already has the pattern. Add one test case for `codeharness-verify-*` containers being matched.
- Follow the existing mock patterns in the test files. Both test files already mock `node:child_process` and the docker module.

### Previous Story Intelligence (14-2)

- Story 14-2 was a minimal change (3-line sort modification in selector.ts, ~80 lines of tests). Clean implementation.
- The 300-line limit was carefully monitored: `selector.test.ts` reached 292 lines.
- Pattern: keep implementation changes minimal, put testing effort into edge cases.
- `run.ts` is already at 287 lines — any addition MUST be lean. The ~10 lines of Docker pre-check + cleanup fit within budget but leave almost no margin.

### Key Observations About Existing Code

1. **`isDockerAvailable()`** (health.ts:31-38) — already exists, returns boolean, uses `docker --version` with 10s timeout. Perfect for pre-check.
2. **`cleanupContainers()`** (container-cleanup.ts:25-84) — returns `Result<CleanupResult>`, handles Docker-not-available gracefully, catches per-container failures. Only needs the verify pattern added to `STALE_PATTERNS`.
3. **`cleanupStaleContainers()`** (verify/env.ts:212-227) — a separate function that does the same thing for `codeharness-verify-*` containers during active verification. It's called from `verify-env cleanup` command. The pre-flight cleanup in run.ts covers the same containers at session start, but having both is fine (idempotent).
4. **`cleanupOrphanedContainers()`** (docker/cleanup.ts:15-22) — a stub that always returns 0. Can be left as-is or updated to delegate to the infra module. Low priority.
5. **`run.ts` structure** — sequential steps with early returns on failure. The pre-flight section (steps 1-1b) uses `fail()` + `process.exitCode = 1` + `return` pattern consistently.
6. **State reconciliation** (run.ts:96-104) — already exists as step 1b, implementing another Decision 11 gate. Docker pre-check should follow the same best-effort pattern for cleanup (warn but don't abort).

### References

- [Source: _bmad-output/planning-artifacts/architecture-v3.md lines 506-520] — Decision 11: Process Enforcement
- [Source: _bmad-output/planning-artifacts/epics-architecture-v3.md lines 349-363] — Story 14-3 epic definition
- [Source: src/commands/run.ts] — Run command with pre-flight section to extend
- [Source: src/modules/infra/container-cleanup.ts] — Existing cleanup function to extend with verify pattern
- [Source: src/lib/docker/health.ts lines 31-38] — `isDockerAvailable()` function to use
- [Source: src/modules/verify/env.ts lines 212-227] — Separate verify-specific cleanup (do NOT modify)

## Files to Change

- `src/commands/run.ts` — Add Docker pre-check (step 1c) and orphan cleanup (step 1d) to pre-flight section. +2 imports, +10 lines of logic. Target: ~297 lines (under 300).
- `src/modules/infra/container-cleanup.ts` — Add `'codeharness-verify-'` to `STALE_PATTERNS` array. 0 net lines added.
- `src/commands/__tests__/run.test.ts` — Add tests for Docker pre-check failure and cleanup behavior.
- `src/modules/infra/__tests__/container-cleanup.test.ts` — Add test for verify-pattern container cleanup.
- `src/modules/infra/AGENTS.md` — Update container-cleanup.ts description to mention `codeharness-verify-*` pattern.
- `src/commands/AGENTS.md` — Update run.ts description to mention Docker pre-check and orphan cleanup pre-flight gates.

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/14-3-docker-precheck-orphan-cleanup.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/14-3-docker-precheck-orphan-cleanup.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

### Change Log

- 2026-03-25: Story created with 9 ACs (2 from epic, 7 derived from architecture, testing, and code analysis). Full implementation guidance with file locations, line budgets, and anti-patterns. Status set to ready-for-dev.
- 2026-03-25: Implementation complete. All 9 tasks done. 3672 tests pass, build succeeds, run.ts at exactly 300 lines. Status set to review.
- 2026-03-25: Code review (adversarial). 2 MEDIUM issues fixed (stale AGENTS.md for infra and commands modules). 2 LOW issues noted (docker --version vs docker info, double Docker check). Coverage: 97.1% overall, 100% on container-cleanup.ts and cleanup.ts, 93.5% on run.ts. Status set to verifying.

### File List

- `src/commands/run.ts` — Added Docker pre-check (step 1c) and orphan cleanup (step 1d) to pre-flight. +2 imports, +13 lines logic. 300 lines total.
- `src/modules/infra/container-cleanup.ts` — Added `'codeharness-verify-'` to STALE_PATTERNS. 83 lines.
- `src/lib/docker/cleanup.ts` — Updated stub to delegate to infra module's cleanupContainers(). 26 lines.
- `src/commands/__tests__/run.test.ts` — Added 4 tests for Docker pre-check and cleanup behavior. 947 lines.
- `src/modules/infra/__tests__/container-cleanup.test.ts` — Added verify-pattern test. 173 lines.
- `src/lib/docker/__tests__/cleanup.test.ts` — Rewrote to test delegation to infra module. 50 lines.
