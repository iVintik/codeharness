# Story 2.4: Init Command — Workflow Generation

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want `codeharness init` to generate a default workflow in my project,
so that I can start using codeharness without manual setup.

## Acceptance Criteria

1. **Given** a project without `.codeharness/workflows/`
   **When** `codeharness init` runs
   **Then** `.codeharness/workflows/default.yaml` is created with contents identical to the embedded template at `templates/workflows/default.yaml`
   <!-- verification: test-provable -->

2. **Given** a project that already has `.codeharness/workflows/default.yaml`
   **When** `codeharness init` runs without `--force`
   **Then** the existing workflow file is NOT overwritten and an info message is logged indicating the file already exists
   <!-- verification: test-provable -->

3. **Given** a project that already has `.codeharness/workflows/default.yaml`
   **When** `codeharness init --force` runs
   **Then** the existing workflow file IS overwritten with the latest embedded template
   <!-- verification: test-provable -->

4. **Given** the `--force` flag is added to the init command
   **When** `codeharness init --help` is inspected
   **Then** the `--force` option appears in the help output with description indicating it overwrites existing generated files
   <!-- verification: test-provable -->

5. **Given** `codeharness init` runs successfully with workflow generation
   **When** the console output is inspected
   **Then** a success message `[OK] Workflow: .codeharness/workflows/default.yaml created` appears in the output (or `[INFO] Workflow: .codeharness/workflows/default.yaml already exists` if skipped)
   <!-- verification: test-provable -->

6. **Given** the existing stack detection functionality in `initProject()`
   **When** `codeharness init` runs after this change
   **Then** stack detection still works identically — no regressions in detected stack, app type, or stacks array
   <!-- verification: test-provable -->

7. **Given** the init command runs with `--json` flag
   **When** workflow generation completes
   **Then** the JSON output includes a `workflow` field with `{ status: 'created' | 'exists' | 'overwritten', path: '.codeharness/workflows/default.yaml' }`
   <!-- verification: test-provable -->

8. **Given** unit tests for workflow generation during init
   **When** `npm run test:unit` is executed
   **Then** tests pass covering: new project gets workflow copied, existing workflow is preserved without `--force`, existing workflow is overwritten with `--force`, `--json` output includes workflow field, and no regressions in existing init tests
   <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Add `--force` flag to init command registration (AC: #3, #4)
  - [x] Add `--force` option to `registerInitCommand()` in `src/commands/init.ts`
  - [x] Pass `force` through `InitOptions` type in `src/modules/infra/types.ts`

- [x] Task 2: Implement workflow generation step in `initProjectInner()` (AC: #1, #2, #3, #5, #7)
  - [x] Add workflow generation step after stack detection but before Docker check
  - [x] Use `getPackageRoot()` from `src/lib/templates.ts` to locate `templates/workflows/default.yaml`
  - [x] Use `fs.copyFileSync` to copy the embedded template to `.codeharness/workflows/default.yaml`
  - [x] Create `.codeharness/workflows/` directory with `mkdirSync({ recursive: true })`
  - [x] Skip copy if target exists and `--force` is not set; log info message
  - [x] Overwrite if target exists and `--force` is set; log overwrite message
  - [x] Add `workflow` field to `InitResult` type

- [x] Task 3: Update `handleRerun()` for idempotent workflow check (AC: #2, #6)
  - [x] On re-run, skip workflow generation (already handled by exists check)
  - [x] Verify re-run path does not regress

- [x] Task 4: Write unit tests (AC: #8)
  - [x] Test: new project gets `.codeharness/workflows/default.yaml` created
  - [x] Test: existing workflow file is preserved without `--force`
  - [x] Test: existing workflow file is overwritten with `--force`
  - [x] Test: `--json` output includes `workflow` field
  - [x] Test: no regressions — existing init-project tests still pass

## Dev Notes

### Module Location and Architecture Role

This story modifies the existing init command flow. The changes touch:
- `src/commands/init.ts` — add `--force` option registration
- `src/modules/infra/types.ts` — add `force` to `InitOptions`, add `workflow` to `InitResult`
- `src/modules/infra/init-project.ts` — add workflow generation step to `initProjectInner()`

The init command is a thin wrapper (`68 lines`) that delegates to `initProject()` in `src/modules/infra/init-project.ts`. All business logic goes into `init-project.ts`, not the command file.

### Workflow File Copy Pattern

The architecture (AD3) states: "The `codeharness init` command copies the default workflow to the project." This is a simple file copy, not a template render — the default workflow YAML has no `{{VAR}}` placeholders.

Use `getPackageRoot()` from `src/lib/templates.ts` to locate the embedded template:
```typescript
import { getPackageRoot } from '../../lib/templates.js';
const src = join(getPackageRoot(), 'templates/workflows/default.yaml');
const dest = join(projectDir, '.codeharness/workflows/default.yaml');
```

Use `fs.existsSync()` + `fs.copyFileSync()` — no need for `renderTemplateFile()` since there are no template variables. Use `mkdirSync(dirname(dest), { recursive: true })` to ensure the directory exists.

### Output Conventions (Established by `init-project.ts`)

The init command uses these output helpers from `src/lib/output.ts`:
- `okOutput(msg)` — green `[OK] msg`
- `info(msg)` — blue `[INFO] msg`
- `warn(msg)` — yellow `[WARN] msg`
- `failOutput(msg)` — red `[FAIL] msg`

Follow the same pattern:
- Created: `okOutput('Workflow: .codeharness/workflows/default.yaml created')`
- Exists: `info('Workflow: .codeharness/workflows/default.yaml already exists')`
- Overwritten: `okOutput('Workflow: .codeharness/workflows/default.yaml overwritten')`

### `--force` Flag Scope

The `--force` flag in this story only affects workflow file generation. Future stories may expand its scope (e.g., agent configs in story 3.2). Keep the logic modular so `force` can be checked independently per generation step.

### Insertion Point in `initProjectInner()`

Add the workflow generation step after stack detection (line ~91 in current code) and before Docker check (line ~101). This keeps workflow generation early and independent of Docker/observability configuration. The step should:
1. Compute source and destination paths
2. Check if destination exists
3. Copy or skip based on `force` flag
4. Update `result.workflow` object
5. Emit appropriate console output

### JSON Output Extension

The `InitResult` type (in `src/modules/infra/types.ts`) needs a new optional `workflow` field:
```typescript
workflow?: { status: 'created' | 'exists' | 'overwritten'; path: string };
```

### Anti-Patterns to Avoid

- **Do NOT use `renderTemplateFile()`** for this copy — the default workflow has no placeholders
- **Do NOT read the YAML and re-serialize** — use `copyFileSync` to preserve exact formatting
- **Do NOT put business logic in `src/commands/init.ts`** — it stays a thin wrapper
- **Do NOT modify `templates/workflows/default.yaml`** — it was created in story 2.3 and is correct
- **Do NOT change `package.json` files array** — `templates/workflows/` was already added in story 2.3

### Existing Test Patterns

Init tests are heavily mocked. See `src/modules/infra/__tests__/init-project.test.ts` for the pattern:
- Mock `fs` functions (`existsSync`, `readFileSync`, `writeFileSync`, etc.)
- Mock `stack-detect`, `deps-install`, `docker-setup`, `bmad-setup`
- Assert on `Result<InitResult>` shape
- For workflow generation tests: mock `existsSync` for the destination path, assert `copyFileSync` or `writeFileSync` was called with correct args

### What This Story Does NOT Do

- **Does not create the validate command** (story 2.5)
- **Does not create agent YAML files** (story 3.2)
- **Does not implement workflow patching** (story 9.1)
- **Does not change the existing default workflow YAML** — that's story 2.3's output
- **Does not add `--force` to any other files** (e.g., agents) — that's future stories

### Project Structure Notes

- Modified file: `src/commands/init.ts` — add `--force` option
- Modified file: `src/modules/infra/types.ts` — extend `InitOptions` and `InitResult`
- Modified file: `src/modules/infra/init-project.ts` — add workflow generation step
- Modified file: `src/modules/infra/__tests__/init-project.test.ts` — add workflow generation tests
- No new files created (all changes are additions to existing files)

### References

- [Source: _bmad-output/planning-artifacts/epics-v2.md#Story 2.4: Init Command — Workflow Generation]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#AD3: Embedded Template Storage]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#Project Structure — src/commands/init.ts]
- [Source: _bmad-output/implementation-artifacts/2-3-default-embedded-workflow.md — templates/workflows/default.yaml location, parseWorkflow API]
- [Source: src/modules/infra/init-project.ts — initProjectInner flow, output conventions, result shape]
- [Source: src/lib/templates.ts — getPackageRoot() for locating embedded templates]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/2-4-init-command-workflow-generation-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (80%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/2-4-init-command-workflow-generation.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 80%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- Task 1: Added `--force` flag to `registerInitCommand()` with default `false`. Added `force` to `CommandInitOptions` and `InitOptions`. Passed through to `initProject()`.
- Task 2: Added workflow generation step in `initProjectInner()` after stack detection, before Dockerfile template generation. Uses `getPackageRoot()` + `copyFileSync`. Creates directory with `mkdirSync({ recursive: true })`. Handles create/exists/overwrite states with correct output messages. Added `workflow` field to `InitResult`.
- Task 3: Updated `handleRerun()` to populate `result.workflow` with `exists` status when workflow file is already present.
- Task 4: Added 5 unit tests covering: fresh creation, preservation without `--force`, overwrite with `--force`, JSON output inclusion, and stack detection non-regression. All 30 tests pass (25 original + 5 new). Full suite: 3614 tests pass, 0 regressions.

### Change Log

- 2026-04-02: Implemented story 2-4 — init command workflow generation with `--force` flag support
- 2026-04-02: Code review — fixed handleRerun() to respect --force flag and handle missing workflow on re-run; added 3 re-run tests

### File List

- src/commands/init.ts (modified — added `--force` option and `force` field)
- src/modules/infra/types.ts (modified — added `force` to `InitOptions`, `workflow` to `InitResult`)
- src/modules/infra/init-project.ts (modified — added workflow generation step, updated imports, updated `handleRerun()`, fixed re-run --force handling)
- src/modules/infra/__tests__/init-project.test.ts (modified — added 5 workflow generation tests + 3 re-run workflow tests)

### Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.6 (1M context)
**Date:** 2026-04-02
**Outcome:** Changes Requested -> Fixed

**Issues Found: 2 HIGH, 1 MEDIUM, 2 LOW**

| # | Severity | Description | Status |
|---|----------|-------------|--------|
| 1 | MEDIUM | `handleRerun()` ignored `--force` flag — workflow never overwritten on re-run | FIXED |
| 2 | MEDIUM | `handleRerun()` left `result.workflow` undefined when file missing on re-run | FIXED |
| 3 | MEDIUM | No test coverage for re-run + `--force` workflow overwrite path | FIXED (3 tests added) |
| 4 | LOW | No descriptive error when template source file missing (falls to generic catch) | Noted |
| 5 | LOW | Relative path `.codeharness/workflows/default.yaml` repeated 7+ times without constant | Noted |

**Fixes Applied:**
- `init-project.ts` `handleRerun()`: Added full workflow generation logic with `--force` support and missing-file recovery
- `init-project.test.ts`: Added 3 new tests — re-run+force overwrite, re-run missing file creation, re-run preserve without force

**Coverage:** 96.64% overall, all 150 files above 80% per-file floor. 33 init-project tests passing.
