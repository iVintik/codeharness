# Story 9.2: Custom Workflow Creation

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to create a custom workflow YAML in my project and run it via `codeharness run --workflow my-workflow`,
so that I can define non-standard execution flows without patching the embedded default.

## Acceptance Criteria

1. **Given** a custom workflow file at `.codeharness/workflows/my-workflow.yaml` with valid `tasks` and `flow` sections
   **When** `codeharness run --workflow my-workflow` executes
   **Then** the custom workflow is loaded from `.codeharness/workflows/my-workflow.yaml`, validated against the workflow JSON schema, and used as the workflow for execution
   <!-- verification: test-provable -->

2. **Given** a custom workflow file at `.codeharness/workflows/my-workflow.yaml`
   **When** the file fails JSON schema validation (e.g., missing `tasks` key, unknown properties, invalid task fields)
   **Then** a `WorkflowParseError` is thrown with specific schema validation errors and the file path
   <!-- verification: test-provable -->

3. **Given** a custom workflow file that passes schema validation but has dangling task references in `flow` (e.g., `flow: [nonexistent]` where `nonexistent` is not defined in `tasks`)
   **When** the workflow resolver loads and validates it
   **Then** a `WorkflowParseError` is thrown with referential integrity errors listing the dangling references
   <!-- verification: test-provable -->

4. **Given** agent references in a custom workflow (e.g., `agent: my-custom-agent`)
   **When** the workflow is resolved and agents are compiled
   **Then** agent references resolve through the same embedded -> user -> project config chain as the default workflow
   **And** unknown agent names cause an error at agent resolution time (not at workflow parse time)
   <!-- verification: test-provable -->

5. **Given** the `codeharness run` command
   **When** invoked with `--workflow my-workflow`
   **Then** `resolveWorkflow()` is called with `{ cwd: projectDir, name: 'my-workflow' }` instead of the default name
   <!-- verification: test-provable -->

6. **Given** `--workflow my-workflow` is specified but no file exists at `.codeharness/workflows/my-workflow.yaml` and no embedded template exists for that name
   **When** `codeharness run --workflow my-workflow` executes
   **Then** the command exits with a clear error message indicating the workflow was not found
   **And** the error message includes the expected file path
   <!-- verification: test-provable -->

7. **Given** `codeharness run` is invoked without `--workflow`
   **When** the command executes
   **Then** the default workflow resolution chain (embedded -> user patch -> project patch) is used unchanged (backward-compatible)
   <!-- verification: test-provable -->

8. **Given** a custom workflow at `.codeharness/workflows/ci.yaml` alongside a patch at `.codeharness/workflows/ci.patch.yaml`
   **When** the workflow resolver loads `ci`
   **Then** the custom workflow is loaded directly (not patched) because it has no `extends` key — the patch file is ignored for full custom workflows
   <!-- verification: test-provable -->

9. **Given** `npm run build` is executed
   **When** the build completes
   **Then** it succeeds with zero errors
   **And** `npm run test:unit` passes with no regressions in existing test suites
   <!-- verification: test-provable -->

10. **Given** unit tests for custom workflow creation
    **When** `npm run test:unit` is executed
    **Then** tests cover: custom workflow loading by name, schema validation of custom workflows, referential integrity of custom workflows, `--workflow` CLI flag plumbing, missing workflow error path, backward-compatible default behavior, agent resolution with custom agent names
    <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Add `--workflow` CLI option to `src/commands/run.ts` (AC: #5, #6, #7)
  - [x] Add `.option('--workflow <name>', 'Workflow name to load (default: "default")')` to the run command definition
  - [x] Pass `options.workflow ?? 'default'` as the `name` parameter to `resolveWorkflow({ cwd: projectDir, name: workflowName })`
  - [x] Keep the fallback logic for backward compatibility — if `resolveWorkflow` fails and name is `'default'`, try direct file parse

- [x] Task 2: Verify `resolveWorkflow()` already handles custom workflows by name (AC: #1, #2, #3, #8)
  - [x] Confirm `resolveWorkflow({ name: 'my-workflow' })` loads `.codeharness/workflows/my-workflow.yaml` as a full custom workflow when no `extends` key is present (this path already exists at lines 312-319 of `workflow-parser.ts`)
  - [x] Confirm that if no custom file exists and no embedded template exists for that name, `resolveWorkflow` throws `WorkflowParseError` with "Embedded workflow not found" (this is the existing error at line 329)
  - [x] Confirm schema validation and referential integrity checks run on custom workflows (they go through `parseWorkflow` which calls `validateAndResolve`)
  - [x] If any of the above behaviors are missing or broken, fix them

- [x] Task 3: Verify agent resolution works for custom agent names (AC: #4)
  - [x] Confirm `run.ts` resolves agent names from the workflow's `tasks` through `resolveAgent()` / `compileSubagentDefinition()` — no changes expected since this is already name-based
  - [x] Write a test confirming custom agent names in a custom workflow are passed to the agent resolver

- [x] Task 4: Write unit tests (AC: #9, #10)
  - [x] Test: `resolveWorkflow({ name: 'my-workflow' })` loads a custom workflow from `.codeharness/workflows/my-workflow.yaml` in the project dir
  - [x] Test: custom workflow fails schema validation — throws `WorkflowParseError` with errors
  - [x] Test: custom workflow passes schema but has dangling flow refs — throws `WorkflowParseError`
  - [x] Test: `resolveWorkflow({ name: 'nonexistent' })` with no matching file throws clear error
  - [x] Test: `resolveWorkflow()` (no name) defaults to `'default'` — backward-compatible
  - [x] Test: custom workflow with `extends` key is NOT treated as a full custom workflow (falls through to patch resolution)
  - [x] Test: `--workflow` option is plumbed correctly in `run.ts` (mock-based test)
  - [x] Test: existing `run.ts` tests still pass (no regressions)

- [x] Task 5: Build and test verification (AC: #9)
  - [x] Run `npm run build` — zero errors
  - [x] Run `npm run test:unit` — no regressions

## Dev Notes

### Architecture Context

Per architecture-v2.md (AD1), `workflow-parser` covers FR13-15: workflow config patching and resolution. FR13 specifically states "User can create custom workflows at project level or user level." Story 9-1 implemented the patch resolution chain (FR14, FR15). This story completes FR13 by exposing the custom workflow path through the CLI.

### What Already Exists

The `resolveWorkflow()` function in `workflow-parser.ts` (lines 305-360) already supports:
- A `name` parameter defaulting to `'default'`
- Detection of full custom workflows at `.codeharness/workflows/{name}.yaml` (lines 312-319)
- Falls back to embedded template when no custom file exists (lines 322-342)
- Schema validation and referential integrity on all paths

The main gap is the **CLI plumbing**: `run.ts` calls `resolveWorkflow({ cwd: projectDir })` without passing a name, and there's no `--workflow` flag to specify one.

### Changes Required

This is a small story. The primary changes are:

1. **`src/commands/run.ts`** — Add `--workflow <name>` option (~3-5 lines changed)
2. **`src/commands/__tests__/run.test.ts`** — Add test for `--workflow` flag plumbing (~20-30 lines)
3. **`src/lib/__tests__/workflow-parser.test.ts`** — Add tests for custom workflow loading by name (~60-80 lines)

No changes to `workflow-parser.ts` are expected unless verification reveals a bug in the existing custom workflow path.

### CLI Interface

```
codeharness run --workflow my-workflow
codeharness run --workflow ci
codeharness run                         # defaults to "default"
```

The `--workflow` value is a name, not a file path. It maps to:
- Custom: `.codeharness/workflows/{name}.yaml`
- Embedded: `templates/workflows/{name}.yaml`
- Patch: `.codeharness/workflows/{name}.patch.yaml` (only for embedded-based workflows)

### Agent Resolution

Agent names in custom workflows resolve through the same `resolveAgent()` chain. The workflow parser validates that task names referenced in `flow` exist in `tasks`, but does NOT validate that agent names resolve to real agents — that happens downstream in `run.ts` when `resolveAgent()` / `compileSubagentDefinition()` are called for each task's agent. This is the correct separation of concerns.

### Edge Cases

- Custom workflow with `extends` key: treated as a patch, not a full custom workflow. The resolver checks for `extends` at line 316.
- User-level custom workflow at `~/.codeharness/workflows/my-workflow.yaml`: NOT currently supported (only project-level). The `resolveWorkflow` function only checks `projectCustomPath`. This is acceptable — user-level is for patches, project-level is for full custom workflows.
- Multiple custom workflows: each has its own name, so `--workflow ci` and `--workflow deploy` load different files.

### File Structure

```
src/
  commands/
    run.ts                              (MODIFIED — add --workflow option)
    __tests__/
      run.test.ts                       (MODIFIED — add --workflow plumbing test)
  lib/
    workflow-parser.ts                  (LIKELY UNCHANGED — already supports name param)
    __tests__/
      workflow-parser.test.ts           (MODIFIED — add custom workflow name tests)
```

### Dependencies

- **Modified file:** `src/commands/run.ts` — ~5 line change (add option, pass name)
- **Modified file:** `src/commands/__tests__/run.test.ts` — ~30 lines new tests
- **Modified file:** `src/lib/__tests__/workflow-parser.test.ts` — ~80 lines new tests
- **No new files**
- **No new npm dependencies**

### Anti-Patterns to Avoid

- **Do NOT accept file paths** in `--workflow` — it takes a name, not a path. The resolver maps names to paths.
- **Do NOT create a `workflow-resolver.ts`** — resolution logic lives in `workflow-parser.ts` per architecture.
- **Do NOT validate agent names in the workflow parser** — agent resolution is a separate concern handled by `agent-resolver.ts`.
- **Do NOT modify `workflow.schema.json`** — the schema is correct as-is.
- **Do NOT break the default behavior** — omitting `--workflow` must work exactly as before.

### Previous Story Intelligence

From story 9-1 (workflow patch resolution):
- `resolveWorkflow()` was added with full patch chain support
- `deepMerge`, `loadWorkflowPatch`, `mergeWorkflowPatch` are tested and working
- Custom workflow detection (no `extends` key) was added as part of the resolver
- The `name` parameter already exists but is untested for non-default values

### Git Intelligence

Recent commits follow: `feat: story {key} — {description}`. This story modifies existing files only. The codebase uses TypeScript with ESM `.js` extensions in import paths. Tests use vitest with temp directory patterns.

### References

- [Source: _bmad-output/planning-artifacts/epics-v2.md#Story 9.2: Custom Workflow Creation]
- [Source: _bmad-output/planning-artifacts/epics-v2.md#FR13: User can create custom workflows at project level or user level]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#AD1: Module Boundaries — workflow-parser covers FR13-15]
- [Source: src/lib/workflow-parser.ts — resolveWorkflow() lines 305-360, already supports name param]
- [Source: src/commands/run.ts — registerRunCommand, line 106 — current resolveWorkflow call without name]
- [Source: src/schemas/workflow.schema.json — workflow schema]
- [Source: templates/workflows/default.yaml — embedded default workflow]
- [Source: _bmad-output/implementation-artifacts/9-1-workflow-patch-resolution.md — predecessor story]
