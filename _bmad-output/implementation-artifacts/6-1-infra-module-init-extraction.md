# Story 6.1: Infra Module — Init Extraction

Status: verifying

## Story

As a developer,
I want init.ts split into infra module components,
so that no file exceeds 300 lines and init logic is encapsulated in `src/modules/infra/`.

## Acceptance Criteria

1. **Given** the extraction is complete, **When** `src/commands/init.ts` is measured, **Then** it is under 100 lines — a thin wrapper that delegates to `infra.initProject()`. <!-- verification: cli-verifiable -->
2. **Given** `infra.initProject(opts)` is called with valid options, **When** it executes, **Then** it handles the full init workflow: stack detection, dependency installation, Docker setup, BMAD installation/patching, state file creation, and documentation scaffolding — returning `Result<InitResult>`. <!-- verification: cli-verifiable -->
3. **Given** no file in `src/modules/infra/` exceeds 300 lines, **When** line counts are measured across all infra module files, **Then** every file is at or below 300 lines (NFR18). <!-- verification: cli-verifiable -->
4. **Given** existing init tests in `src/commands/__tests__/init.test.ts`, **When** all tests are run after the extraction, **Then** all pass with no regressions. <!-- verification: cli-verifiable -->
5. **Given** the infra module boundary, **When** any file outside `src/modules/infra/` imports from the infra module, **Then** it imports only from `infra/index.ts` — no imports from internal files like `docker.ts`, `bmad-setup.ts`, or `deps-install.ts`. <!-- verification: cli-verifiable -->
6. **Given** `infra.initProject(opts)` encounters a non-critical failure (e.g., BMAD install fails, Beads init fails), **When** the error is caught, **Then** it continues the init workflow and includes the partial failure in the result — it never throws an uncaught exception. <!-- verification: cli-verifiable -->
7. **Given** `infra.initProject(opts)` encounters a critical failure (e.g., Docker not available with observability required, critical dependency missing), **When** the error is caught, **Then** it returns `fail()` with a descriptive error — it never throws. <!-- verification: cli-verifiable -->
8. **Given** the idempotent re-run path (harness already initialized), **When** `infra.initProject(opts)` is called on an already-initialized project, **Then** it detects existing state, verifies configuration, and returns early with the current status — matching existing re-run behavior. <!-- verification: cli-verifiable -->
9. **Given** `codeharness init` is run end-to-end after the extraction, **When** comparing its output and state file to the pre-extraction behavior, **Then** the CLI output, state file contents, and exit codes are identical for all modes (local-shared, remote-direct, remote-routed, no-observability). <!-- verification: integration-required -->
10. **Given** the build succeeds (`npm run build`), **When** the compiled output is inspected, **Then** there are no TypeScript errors and the infra module is importable from its index. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Create `src/modules/infra/docker-setup.ts` (AC: #2, #3)
  - [x]Extract Docker availability check, shared stack detection, stack start/stop, collector-only mode
  - [x]Move relevant logic from `init.ts` lines 351-762 (Docker/observability block)
  - [x]Wrap all functions in try/catch, return `Result<T>`
  - [x]Keep under 300 lines
- [x] Task 2: Create `src/modules/infra/bmad-setup.ts` (AC: #2, #3)
  - [x]Extract BMAD installation, version detection, patch application, bmalph detection
  - [x]Move relevant logic from `init.ts` lines 441-502 (BMAD block)
  - [x]Wrap all functions in try/catch, return `Result<T>`
  - [x]Keep under 300 lines
- [x] Task 3: Create `src/modules/infra/deps-install.ts` (AC: #2, #3)
  - [x]Extract dependency installation and verification
  - [x]Move relevant logic from `init.ts` lines 383-400 (dependency block)
  - [x]Wrap all functions in try/catch, return `Result<T>`
  - [x]Keep under 300 lines
- [x] Task 4: Create `src/modules/infra/docs-scaffold.ts` (AC: #2, #3)
  - [x]Extract AGENTS.md generation, docs/ scaffold, README generation
  - [x]Move helper functions: `generateAgentsMdContent`, `generateDocsIndexContent`, `getProjectName`, `getStackLabel`, `getCoverageTool`
  - [x]Move relevant logic from `init.ts` lines 523-576 (documentation block)
  - [x]Keep under 300 lines
- [x] Task 5: Create `src/modules/infra/init-project.ts` (AC: #2, #6, #7, #8)
  - [x]Implement `initProject(opts: InitOptions): Result<InitResult>` — the orchestrator
  - [x]Compose the sub-steps: stack detection, deps, Docker, BMAD, beads, state, docs, OTLP
  - [x]Handle idempotent re-run path (already initialized)
  - [x]Handle critical vs. non-critical failures
  - [x]Keep under 300 lines
- [x] Task 6: Update `src/modules/infra/types.ts` (AC: #2)
  - [x]Expand `InitOptions` to match the full option set from `init.ts` (frontend, database, api, observability, otelEndpoint, logsUrl, metricsUrl, tracesUrl, json)
  - [x]Expand `InitResult` to match the full result shape from `init.ts` (stack, app_type, enforcement, documentation, dependencies, beads, bmad, otlp, docker, error)
  - [x]Add any additional internal types needed by sub-modules
- [x] Task 7: Update `src/modules/infra/index.ts` (AC: #1, #5)
  - [x]Replace `initProject()` stub with real delegation to `init-project.ts`
  - [x]Re-export only public types and functions
  - [x]Keep `ensureStack()`, `cleanupContainers()`, `getObservabilityBackend()` as stubs (stories 6-2, 7-1)
- [x] Task 8: Rewrite `src/commands/init.ts` as thin wrapper (AC: #1)
  - [x]Import `initProject` from `../modules/infra/index.js`
  - [x]Register commander options (preserved)
  - [x]Delegate all logic to `infra.initProject(opts)`
  - [x]Handle JSON output mode at the command level
  - [x]Target: <100 lines
- [x] Task 9: Update/migrate tests (AC: #4)
  - [x]Ensure existing `src/commands/__tests__/init.test.ts` tests still pass
  - [x]Add unit tests in `src/modules/infra/__tests__/` for each new sub-module
  - [x]Test critical vs. non-critical failure paths
  - [x]Test idempotent re-run path
- [x] Task 10: Verify build (`npm run build`) succeeds (AC: #10)
- [x] Task 11: Verify all existing tests pass (`npm test`) (AC: #4)
- [x] Task 12: Verify no file exceeds 300 lines (AC: #3, NFR18)
- [x] Task 13: Verify `src/commands/init.ts` is <100 lines (AC: #1)

## Dev Notes

### Architecture Constraints

- **Result<T> pattern** — every public function returns `Result<T>`, never throws. Import `ok`, `fail` from `../../types/result.js`. [Source: architecture-overhaul.md#Decision 1]
- **ES modules** — all imports use `.js` extension. [Source: tsconfig.json]
- **Strict TypeScript** — `strict: true`, no `any` types (NFR19).
- **File size limit** — no file exceeds 300 lines (NFR18).
- **100% test coverage** on new code (NFR14).
- **Module boundary** — internal files are private to infra module. Only `index.ts` is the public interface.

### Current State of init.ts

`src/commands/init.ts` is currently **780 lines** — nearly 3x the 300-line NFR limit. It contains:
- Helper functions (lines 73-174): `getProjectName`, `getStackLabel`, `getCoverageTool`, `generateAgentsMdContent`, `generateDocsIndexContent`
- Idempotent re-run check (lines 211-296)
- Remote endpoint URL validation (lines 298-332)
- Stack detection (lines 334-348)
- Docker availability check (lines 350-381)
- Dependency installation (lines 383-400)
- Beads initialization (lines 402-439)
- BMAD installation/patching (lines 441-502)
- State file creation (lines 504-516)
- Documentation scaffold (lines 522-576)
- OTLP instrumentation (lines 578-616)
- Docker stack setup — 4 modes (lines 618-762)
- Enforcement summary + JSON output (lines 764-776)

### Extraction Strategy

The init.ts logic decomposes into these infra sub-modules:

| New File | Responsibility | Approx Lines | Source |
|----------|---------------|-------------|--------|
| `docker-setup.ts` | Docker check, shared stack, collector-only, remote modes | ~200 | init.ts Docker block + `src/lib/docker.ts` calls |
| `bmad-setup.ts` | BMAD install, version detect, patches, bmalph | ~120 | init.ts BMAD block + `src/lib/bmad.ts` calls |
| `deps-install.ts` | Dependency installation and verification | ~80 | init.ts deps block + `src/lib/deps.ts` calls |
| `docs-scaffold.ts` | AGENTS.md, docs/, README generation | ~150 | init.ts doc block + helpers |
| `init-project.ts` | Orchestrator composing all sub-steps | ~250 | init.ts action handler |
| `types.ts` | Full InitOptions, InitResult, internal types | ~80 | init.ts interfaces (expanded) |

The sub-modules call into `src/lib/` utilities (docker.ts, bmad.ts, deps.ts, etc.) — those lib files are NOT moved in this story. They remain in `src/lib/` as shared utilities. The infra module wraps them with Result<T> returns and composes them into the init workflow.

### Lib Files NOT Moved (Remain in src/lib/)

Per the architecture doc, files like `docker.ts`, `bmad.ts`, `deps.ts`, `otlp.ts`, `beads.ts`, `stack-detect.ts`, `stack-path.ts`, `state.ts` are candidates for eventual migration into `src/modules/infra/`. However, they are currently imported by other modules and the command layer. Moving them is a separate concern from extracting init logic. This story focuses on:
1. Making `init.ts` a thin wrapper
2. Creating the infra module orchestrator (`initProject`)
3. Splitting logic into <300 line sub-modules

Lib file migration can happen as a follow-up or as part of stories 6-2/6-3.

### Existing Tests (1714 lines)

`src/commands/__tests__/init.test.ts` is comprehensive (1714 lines). These tests mock `src/lib/*` modules heavily. After extraction:
- Command-level tests should still work (init.ts still registers the same Commander command)
- New unit tests for infra sub-modules should mock `src/lib/*` the same way
- The test file itself may need splitting if it grows further

### Infra Module Structure After This Story

```
src/modules/infra/
├── index.ts              # Re-exports: initProject (real), ensureStack (stub), cleanupContainers (stub), getObservabilityBackend (stub)
├── init-project.ts       # NEW: initProject() orchestrator
├── docker-setup.ts       # NEW: Docker/observability setup
├── bmad-setup.ts         # NEW: BMAD install/patch
├── deps-install.ts       # NEW: Dependency installation
├── docs-scaffold.ts      # NEW: Documentation generation
├── types.ts              # Updated: full InitOptions, InitResult
└── __tests__/
    ├── index.test.ts     # Updated
    ├── init-project.test.ts  # NEW
    ├── docker-setup.test.ts  # NEW
    ├── bmad-setup.test.ts    # NEW
    ├── deps-install.test.ts  # NEW
    └── docs-scaffold.test.ts # NEW
```

### Dependencies

- **Epic 1 (done):** Result<T> types, module skeleton with index.ts pattern
- **No external dependencies needed.** All logic is composition of existing `src/lib/` functions.

### What Stays as Stubs

- `ensureStack()` — story 6-2
- `cleanupContainers()` — story 6-2
- `getObservabilityBackend()` — story 7-1

### References

- [Source: _bmad-output/planning-artifacts/epics-overhaul.md#Story 6.1]
- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md — infra module, Decision 3, migration table]
- [Source: _bmad-output/planning-artifacts/prd-overhaul.md — FR1, FR2, FR4, FR5, FR6]
- [Source: src/commands/init.ts — 780 lines to extract]
- [Source: src/modules/infra/index.ts — stubs to replace]
- [Source: src/modules/infra/types.ts — types to expand]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/6-1-infra-module-init-extraction.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/6-1-infra-module-init-extraction.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
