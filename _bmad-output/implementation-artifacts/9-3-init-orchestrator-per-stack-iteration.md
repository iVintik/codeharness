# Story 9-3: Init orchestrator per-stack iteration

## Status: backlog

## Story

As a developer running `codeharness init` on a multi-stack project,
I want coverage and OTLP to be configured for each detected stack,
So that all languages get observability and test coverage.

## Acceptance Criteria

- [ ] AC1: Given a multi-stack project (nodejs + rust), when `codeharness init` runs, then coverage tools are detected for each stack independently (c8 for nodejs, cargo-tarpaulin for rust) <!-- verification: cli-verifiable -->
- [ ] AC2: Given a multi-stack project (nodejs + rust), when `codeharness init` runs, then OTLP packages are installed for each stack independently (npm packages for nodejs, cargo crates for rust) <!-- verification: cli-verifiable -->
- [ ] AC3: Given a multi-stack project, when `codeharness init` runs, then info messages list all detected stacks (e.g., `Stack detected: Node.js (package.json) + Rust (Cargo.toml)`) <!-- verification: cli-verifiable -->
- [ ] AC4: Given a multi-stack project, when state is created, then `state.stacks` contains all detected stack names and `state.app_type` reflects primary stack <!-- verification: cli-verifiable -->

## Technical Notes

### Changes to `src/modules/infra/init-project.ts`

This is the main orchestration change. The `initProjectInner()` function (L51-162) currently calls `detectStack()` at L68 and uses the single result throughout.

**Replace at L68:**
```ts
// OLD
const stack = detectStack(projectDir);
// NEW
const detections = detectStacks(projectDir);
const stacks = detections.map(d => d.stack);
const primaryStack = stacks[0] ?? null;
```

**Per-stack iteration for coverage (around L90-100):**
```ts
// OLD: single detectCoverageTool(projectDir) call
// NEW: iterate over detections
for (const detection of detections) {
  const stackDir = detection.dir === '.' ? projectDir : path.join(projectDir, detection.dir);
  const coverageTool = detectCoverageTool(stackDir);
  // store per-stack coverage result
}
```

**Per-stack iteration for OTLP (around L110-130):**
```ts
// OLD: single instrumentProject(projectDir, stack) call
// NEW: iterate over detections
for (const detection of detections) {
  const stackDir = detection.dir === '.' ? projectDir : path.join(projectDir, detection.dir);
  await instrumentProject(stackDir, detection.stack);
}
```

**Per-stack app type detection:**
Call `detectAppType()` for each stack independently. Store `app_types: Record<string, AppType>` in state. Primary `app_type` = `stacks[0]`'s type.

**State creation update:**
```ts
state.stacks = stacks;
state.stack = primaryStack; // compat
state.app_type = primaryAppType;
```

**Info messages:**
Log all detected stacks: `Stack detected: Node.js (package.json) + Rust (Cargo.toml)` using `getStackLabel(stacks)` from docs-scaffold.

### Important: coverage.ts and otlp.ts internals do NOT change

`detectCoverageTool()` (L35-53 in coverage.ts) and `instrumentProject()` (L345 in otlp.ts) keep their single-stack signatures. The orchestrator loops — the internals don't know about multi-stack. This is the minimal API surface change strategy from the tech spec.

### Import changes

Add import of `detectStacks` and `StackDetection` from `../lib/stack-detect`. Keep `detectStack` import if still used elsewhere in the file.

### Test file

Update `src/modules/infra/__tests__/init-project.test.ts`:
- Mock `detectStacks()` to return multi-stack result
- Verify `detectCoverageTool()` called once per stack
- Verify `instrumentProject()` called once per stack with correct dir
- Verify state has `stacks: ['nodejs', 'rust']`
- Verify single-stack still works (backward compat)

## Files to Change

- `src/modules/infra/init-project.ts` — Replace `detectStack()` call at L68 with `detectStacks()`, add per-stack iteration loops for coverage detection and OTLP instrumentation, update state creation to set `stacks[]`, update info messages
- `src/commands/init.ts` — Update if it references `stack` from `InitResult` (change to `stacks`)
- `src/modules/infra/__tests__/init-project.test.ts` — Add multi-stack orchestration tests (per-stack coverage, per-stack OTLP, state fields, info messages)
