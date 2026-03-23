# Story 9-3: Init orchestrator per-stack iteration

## Status: verifying

## Story

As a developer running `codeharness init` on a multi-stack project,
I want coverage and OTLP to be configured for each detected stack,
So that all languages get observability and test coverage.

## Acceptance Criteria

- [x] AC1: Given a multi-stack project (nodejs + rust), when `codeharness init` runs, then coverage tools are detected for each stack independently (c8 for nodejs, cargo-tarpaulin for rust) <!-- verification: cli-verifiable -->
- [x] AC2: Given a multi-stack project (nodejs + rust), when `codeharness init` runs, then OTLP packages are installed for each stack independently (npm packages for nodejs, cargo crates for rust) <!-- verification: cli-verifiable -->
- [x] AC3: Given a multi-stack project, when `codeharness init` runs, then info messages list all detected stacks (e.g., `Stack detected: Node.js (package.json) + Rust (Cargo.toml)`) <!-- verification: cli-verifiable -->
- [x] AC4: Given a multi-stack project, when state is created, then `state.stacks` contains all detected stack names and `state.app_type` reflects primary stack <!-- verification: cli-verifiable -->

## Tasks/Subtasks

- [x] Task 1: Update `getStackLabel()` in `docs-scaffold.ts` to accept `string | string[]` and format multi-stack output (e.g., `Node.js (package.json) + Rust (Cargo.toml)`)
- [x] Task 2: In `init-project.ts` L75, change info message to pass `result.stacks` (or all stack names) to `getStackLabel()` so multi-stack projects show all stacks
- [x] Task 3: In `init-project.ts` L123, replace single `getCoverageTool(stack)` with per-stack loop over `allStacks`, calling `getCoverageTool()` per stack and storing results (primary stack's tool in `state.coverage.tool` for backward compat)
- [x] Task 4: In `init-project.ts` L138, replace single `instrumentProject(projectDir, stack, ...)` with per-stack loop over `allStacks`, calling `instrumentProject()` per detection with correct subdirectory path
- [x] Task 5: Verify `state.stacks` is persisted correctly (already done in story 9-2 at L125 — confirm no changes needed)
- [x] Task 6: Add test — multi-stack init calls `getCoverageTool()` once per detected stack
- [x] Task 7: Add test — multi-stack init calls `instrumentProject()` once per detected stack with correct dir
- [x] Task 8: Add test — info output includes all detected stacks label
- [x] Task 9: Add test — state file after multi-stack init has `stacks: ['nodejs', 'rust']` and `app_type` set from primary stack
- [x] Task 10: Add test — single-stack backward compat: single-stack project still works identically
- [x] Task 11: Run full test suite — verify zero regressions

## Dev Agent Record

### Implementation Plan

- Updated `getStackLabel()` to accept `string | string[] | null` with array support via recursive mapping and `+` join
- Changed info message to use `result.stacks` array when populated, falling back to single stack
- Added per-stack coverage detection loop over `allStacks`, keeping primary stack's tool in `state.coverage.tool`
- Replaced single `instrumentProject()` with per-stack loop using correct subdirectory paths
- Added `join` import from `node:path` for subdirectory path construction
- Confirmed `state.stacks` persistence from story 9-2 is intact

### Debug Log

No issues encountered during implementation.

### Completion Notes

All 11 tasks implemented and verified. 5 new multi-stack tests added to init-project.test.ts, 3 new getStackLabel array tests added to docs-scaffold.test.ts. Full test suite: 3105 tests pass across 114 files with zero regressions.

## File List

- `src/modules/infra/init-project.ts` — Per-stack coverage and OTLP loops, multi-stack info message, added `join` import
- `src/modules/infra/docs-scaffold.ts` — `getStackLabel()` now accepts `string | string[] | null`
- `src/modules/infra/__tests__/init-project.test.ts` — 6 multi-stack orchestration tests (added OTLP root-dir matching test), updated mocks
- `src/modules/infra/__tests__/docs-scaffold.test.ts` — 3 new getStackLabel array tests
- `src/commands/__tests__/init.test.ts` — Updated fail-path tests to mock `detectStacks` instead of removed `detectStack` call
- `src/lib/state.ts` — Added optional `tools` field to `coverage` interface for per-stack coverage tools map

## Change Log

- 2026-03-23: Implemented per-stack iteration for coverage detection and OTLP instrumentation in init orchestrator. Updated getStackLabel for multi-stack display. Added 8 new tests.
- 2026-03-23: Code review fixes — H1: per-stack coverage loop now stores tools map in state.coverage.tools instead of discarding results; H2: OTLP primary stack matching uses dir==='.' to avoid wrong detection in multi-nodejs projects; M1: eliminated double filesystem scan by removing detectStack() call and deriving root stack from detectStacks() result; added test for OTLP root-dir matching edge case; fixed integration tests in init.test.ts.

## Senior Developer Review (AI)

**Reviewer:** Code Review Workflow on 2026-03-23
**Outcome:** Changes Requested -> Fixed

### Issues Found: 2 HIGH, 3 MEDIUM, 2 LOW

#### HIGH (fixed)
1. **H1: Per-stack coverage loop was dead code** — `getCoverageTool()` called per stack but return value discarded. Fixed: now stores results in `state.coverage.tools` map.
2. **H2: OTLP primary stack matching by stack name only** — `detection.stack === stack` could match a subdirectory detection instead of root. Fixed: added `detection.dir === '.'` guard.

#### MEDIUM (fixed)
3. **M1: Double filesystem scan** — `detectStack()` and `detectStacks()` both scan the filesystem. Removed `detectStack()` call; root stack derived from `detectStacks()` result.
4. **M2: Integration tests used removed API** — `init.test.ts` fail-path tests mocked `detectStack` which is no longer called. Fixed: updated to mock `detectStacks`.
5. **M3: State type missing `tools` field** — `coverage.tools` assigned in init-project.ts but not declared in `HarnessState` interface. Fixed: added optional `tools?: Record<string, string>` to state type.

#### LOW (not fixed — tech debt)
6. **L1: No `state.coverage.tools` consumer yet** — The tools map is persisted but no existing code reads it. Future stories should consume it.
7. **L2: `detectAppType` still uses primary stack only** — In multi-stack projects, app type is computed from the root stack only, not considering secondary stacks.

### Verification
- 3109 tests pass, 0 failures
- Coverage: 97.03% overall, all 123 files above 80% per-file floor

## Technical Notes

### Current state after story 9-2

Story 9-2 already added `detectStacks` import and basic `stacks` population in `init-project.ts`:
- L9: `import { detectStack, detectStacks, detectAppType } from '../../lib/stack-detect.js';`
- L70-71: `const allStacks = detectStacks(projectDir);` and `result.stacks = [...new Set(allStacks.map(s => s.stack))];`
- L125: `state.stacks = result.stacks as import('../../lib/stack-detect.js').StackName[];`

What is NOT yet multi-stack:
- L75: `info(\`Stack detected: ${getStackLabel(stack)}\`)` — uses single stack, not all stacks
- L123: `state.coverage.tool = getCoverageTool(stack);` — single stack coverage only
- L138: `result.otlp = instrumentProject(projectDir, stack, { json: isJson, appType });` — single stack OTLP only

### Changes to `src/modules/infra/init-project.ts`

**Info message (L74-77):** Replace `getStackLabel(stack)` with `getStackLabel(result.stacks)` (after updating `getStackLabel` to accept arrays). Show all stacks in the detection message.

**Per-stack coverage (L123):** Replace single `getCoverageTool(stack)` with iteration over `allStacks`. For each detection, compute the coverage tool. Store primary stack's tool in `state.coverage.tool` for backward compat. Optionally store a `state.coverage.tools` map for future consumers.

**Per-stack OTLP (L134-139):** Replace single `instrumentProject()` call with loop:
```ts
for (const detection of allStacks) {
  const stackDir = detection.dir === '.' ? projectDir : path.join(projectDir, detection.dir);
  const stackOtlp = instrumentProject(stackDir, detection.stack, { json: isJson, appType });
  // Collect results; primary stack's result goes to result.otlp for backward compat
}
```

### Important: coverage.ts and otlp.ts internals do NOT change

`getCoverageTool()` and `instrumentProject()` keep their single-stack signatures. The orchestrator loops — the internals don't know about multi-stack. This is the minimal API surface change strategy from the tech spec.

### `getStackLabel()` in docs-scaffold.ts

Currently accepts `string | null`. Needs to also accept `string[]` to format multi-stack labels. When given an array, join with ` + ` separator. The stack-to-label mapping (nodejs -> `Node.js (package.json)`, rust -> `Rust (Cargo.toml)`, python -> `Python`) already exists.

### Test file

Update `src/modules/infra/__tests__/init-project.test.ts`:
- Mock `detectStacks()` to return multi-stack result `[{ stack: 'nodejs', dir: '.' }, { stack: 'rust', dir: '.' }]`
- Verify `getCoverageTool()` called once per stack
- Verify `instrumentProject()` called once per stack with correct dir
- Verify state has `stacks: ['nodejs', 'rust']`
- Verify single-stack still works (backward compat)

## Files to Change

- `src/modules/infra/init-project.ts` — Add per-stack iteration loops for coverage detection and OTLP instrumentation, update info message to show all stacks
- `src/modules/infra/docs-scaffold.ts` — Update `getStackLabel()` to accept `string | string[]` for multi-stack label formatting
- `src/modules/infra/__tests__/init-project.test.ts` — Add multi-stack orchestration tests (per-stack coverage, per-stack OTLP, state fields, info messages, backward compat)
