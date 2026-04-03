# Story 9.1: Workflow Patch Resolution

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to patch the default workflow via a patch file,
so that I can customize execution without replacing the entire workflow.

## Acceptance Criteria

1. **Given** an embedded default workflow at `templates/workflows/default.yaml` and a project-level patch file at `.codeharness/workflows/default.patch.yaml` with `extends: embedded://default`
   **When** the workflow resolver runs
   **Then** the patch's `overrides` are deep-merged onto the embedded base (objects merge recursively, arrays and scalars replace)
   **And** the resolved workflow still validates against the workflow JSON schema
   <!-- verification: test-provable -->

2. **Given** a patch with a `replace` key containing a top-level section (e.g., `replace: { flow: [...] }`)
   **When** the workflow resolver merges the patch
   **Then** the `replace` sections wholly overwrite the corresponding base sections (no deep merge, full replacement)
   <!-- verification: test-provable -->

3. **Given** no patch file exists at the user-level or project-level path
   **When** the workflow resolver runs
   **Then** the embedded default workflow is returned unchanged
   **And** no errors are thrown
   <!-- verification: test-provable -->

4. **Given** a patch file with invalid YAML syntax
   **When** the workflow resolver attempts to load it
   **Then** a `WorkflowParseError` is thrown with a descriptive message including the file path and parse error
   <!-- verification: test-provable -->

5. **Given** a patch file that is valid YAML but produces an invalid workflow after merge (e.g., references a non-existent task in flow)
   **When** the workflow resolver merges and validates
   **Then** a `WorkflowParseError` is thrown with specific schema or referential integrity errors
   <!-- verification: test-provable -->

6. **Given** both a user-level patch at `~/.codeharness/workflows/default.patch.yaml` and a project-level patch at `.codeharness/workflows/default.patch.yaml`
   **When** the workflow resolver runs
   **Then** the user-level patch is applied first onto the embedded base, and the project-level patch is applied second on top of the user-merged result
   <!-- verification: test-provable -->

7. **Given** `run.ts` currently loads the workflow via `parseWorkflow()`
   **When** this story is implemented
   **Then** `run.ts` calls a new `resolveWorkflow()` function (or equivalent) that handles the full embedded -> user -> project patch chain
   **And** `parseWorkflow()` remains available for direct file parsing (no breaking change)
   <!-- verification: test-provable -->

8. **Given** the `resolveWorkflow()` function
   **When** called with a `cwd` option
   **Then** it looks for project patches relative to `cwd` and user patches relative to `$HOME`
   <!-- verification: test-provable -->

9. **Given** `npm run build` is executed
   **When** the build completes
   **Then** it succeeds with zero errors
   **And** `npm run test:unit` passes with no regressions in existing test suites
   <!-- verification: test-provable -->

10. **Given** unit tests for workflow patch resolution
    **When** `npm run test:unit` is executed
    **Then** tests pass at 80%+ coverage for new code covering: patch loading, silent skip on missing, malformed patch errors, deep merge, replace semantics, user-before-project ordering, schema validation after merge, referential integrity after merge
    <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Add `resolveWorkflow()` function to `src/lib/workflow-parser.ts` (AC: #1, #3, #6, #7, #8)
  - [x] Define `WorkflowPatch` interface: `{ extends?: string; overrides?: Record<string, unknown>; replace?: Record<string, unknown> }`
  - [x] Implement `loadWorkflowPatch(filePath: string): WorkflowPatch | null` — reads patch YAML, returns null if file missing, throws `WorkflowParseError` on malformed YAML (mirrors `loadPatch` from agent-resolver)
  - [x] Implement `mergeWorkflowPatch(base: Record<string, unknown>, patch: WorkflowPatch): Record<string, unknown>` — deep-merges `overrides`, then applies `replace` sections as full overwrites
  - [x] Implement `resolveWorkflow(options?: { cwd?: string; name?: string }): ResolvedWorkflow` — loads embedded default from `templates/workflows/{name}.yaml`, applies user patch from `~/.codeharness/workflows/{name}.patch.yaml`, applies project patch from `.codeharness/workflows/{name}.patch.yaml`, then validates and returns
  - [x] Reuse `deepMerge` utility — extract from agent-resolver into a shared location or duplicate inline (agent-resolver already has this pattern)

- [x] Task 2: Update `src/commands/run.ts` to use `resolveWorkflow()` (AC: #7)
  - [x] Replace the existing `parseWorkflow(workflowPath)` call with `resolveWorkflow({ cwd: projectDir })`
  - [x] Keep fallback logic for direct file path if `resolveWorkflow` fails (graceful degradation)

- [x] Task 3: Write unit tests in `src/lib/__tests__/workflow-parser.test.ts` (AC: #9, #10)
  - [x] Test: `resolveWorkflow` returns embedded workflow when no patches exist
  - [x] Test: `resolveWorkflow` deep-merges `overrides` from project patch onto embedded base
  - [x] Test: `resolveWorkflow` applies `replace` sections as full replacement (not deep merge)
  - [x] Test: `resolveWorkflow` applies user patch before project patch (ordering)
  - [x] Test: `resolveWorkflow` throws `WorkflowParseError` for malformed YAML patch
  - [x] Test: `resolveWorkflow` throws `WorkflowParseError` when merged result fails schema validation
  - [x] Test: `resolveWorkflow` throws `WorkflowParseError` when merged result has dangling task refs in flow
  - [x] Test: `resolveWorkflow` silently skips missing patch files
  - [x] Test: `loadWorkflowPatch` returns null for non-existent file
  - [x] Test: `loadWorkflowPatch` throws for invalid YAML
  - [x] Test: `mergeWorkflowPatch` handles overrides-only patch
  - [x] Test: `mergeWorkflowPatch` handles replace-only patch
  - [x] Test: `mergeWorkflowPatch` handles patch with both overrides and replace
  - [x] Test: existing `parseWorkflow` tests still pass (no regressions)

- [x] Task 4: Verify build and all tests pass (AC: #9)
  - [x] Run `npm run build` — zero errors
  - [x] Run `npm run test:unit` — no regressions

## Dev Notes

### Architecture Context

Per architecture-v2.md (AD1), `workflow-parser` is responsible for: "Parse YAML, validate against JSON schema, resolve patches (embedded->user->project)" covering FR13-15. The patch resolution for workflows follows the same pattern as `agent-resolver.ts` does for agents.

The current `workflow-parser.ts` handles parsing and validation but has no patch resolution. This story adds the patch chain — the same embedded -> user -> project pattern that `agent-resolver.ts` already implements for agent configs.

### Patch Chain (mirrors agent-resolver)

Resolution order:
1. Load embedded workflow from `templates/workflows/{name}.yaml`
2. Look for user-level patch at `~/.codeharness/workflows/{name}.patch.yaml` — merge if found, skip silently if not
3. Look for project-level patch at `.codeharness/workflows/{name}.patch.yaml` — merge if found, skip silently if not
4. Validate merged result against JSON schema + referential integrity
5. Apply defaults and return `ResolvedWorkflow`

### Patch File Format

```yaml
# .codeharness/workflows/default.patch.yaml
extends: embedded://default

overrides:
  tasks:
    implement:
      session: continue
      max_budget_usd: 5.0

replace:
  flow:
    - implement
    - verify
```

- `extends` — identifies the base (currently only `embedded://default` supported)
- `overrides` — deep-merged: objects merge recursively, arrays replace, scalars replace
- `replace` — full section replacement: keys in `replace` wholly overwrite corresponding keys in base

### Merge Strategy

The `deepMerge` function already exists in `agent-resolver.ts` (lines 106-131). Same semantics:
- Objects: recursive merge
- Arrays: replace entirely
- Scalars: replace

The `replace` key is new (not in agent-resolver). After deep-merging `overrides`, each key in `replace` fully overwrites the corresponding key in the result. This allows replacing `flow` entirely without deep-merging individual steps.

### Current run.ts Workflow Loading (lines 101-115)

```typescript
const projectWorkflowPath = join(projectDir, '.codeharness', 'workflows', 'default.yaml');
const templateWorkflowPath = join(projectDir, 'templates', 'workflows', 'default.yaml');
const workflowPath = existsSync(projectWorkflowPath) ? projectWorkflowPath : templateWorkflowPath;
parsedWorkflow = parseWorkflow(workflowPath);
```

This will be replaced with `resolveWorkflow({ cwd: projectDir })` which handles the full resolution chain internally. Note: if a project has a full custom workflow (not a patch) at `.codeharness/workflows/default.yaml`, the resolver should detect the absence of `extends` and load it directly (same pattern as custom agents in `agent-resolver.ts`).

### Schema Validation

The workflow JSON schema (`src/schemas/workflow.schema.json`) has `"additionalProperties": false`. Patch files do NOT need to pass schema validation independently — only the merged result does. The `extends`, `overrides`, and `replace` keys are patch-specific and would fail schema validation if validated as a standalone workflow.

### Existing Code to Reference

- `src/lib/agent-resolver.ts` — `loadPatch()`, `mergePatch()`, `resolveAgent()`, `deepMerge()` — direct pattern to follow
- `src/lib/workflow-parser.ts` — `parseWorkflow()` — existing function to keep backward-compatible
- `src/lib/schema-validate.ts` — `validateWorkflowSchema()` — reuse for post-merge validation
- `src/commands/run.ts` — lines 101-115 — call site to update

### File Structure

```
src/
  lib/
    workflow-parser.ts          (MODIFIED — add resolveWorkflow, loadWorkflowPatch, mergeWorkflowPatch)
    __tests__/
      workflow-parser.test.ts   (MODIFIED — add patch resolution tests)
  commands/
    run.ts                      (MODIFIED — use resolveWorkflow instead of parseWorkflow)
```

### Dependencies

- **Modified file:** `src/lib/workflow-parser.ts` — add ~80-100 lines for patch resolution
- **Modified file:** `src/lib/__tests__/workflow-parser.test.ts` — add ~150-200 lines of new tests
- **Modified file:** `src/commands/run.ts` — ~5-10 line change
- **No new files** — patch resolution lives in the existing workflow-parser module
- **No new npm dependencies** — uses `yaml`, `node:fs`, `node:os` (already available)

### Anti-Patterns to Avoid

- **Do NOT create a separate `workflow-resolver.ts`** — per architecture, patch resolution is part of `workflow-parser` module (FR1-6, FR13-15 all map to same module)
- **Do NOT validate patch files against the workflow schema** — patches have `extends`/`overrides`/`replace` keys not in the schema; only validate the merged result
- **Do NOT break `parseWorkflow()`** — it must remain backward-compatible for direct file parsing
- **Do NOT use `any` in the API surface** — explicit TypeScript types per NFR18
- **Do NOT modify `workflow.schema.json`** — the schema defines valid workflows, not patch files

### Previous Story Intelligence

From story 3-3 (agent resolver):
- The `resolveAgent()` function follows embedded -> user -> project patch chain
- `loadPatch()` returns null for missing files (silent skip), throws for malformed YAML
- `mergePatch()` deep-merges `overrides` and appends `prompt_patches`
- Custom agents (no `extends`) are loaded directly — same pattern needed for custom workflows

From story 2-2 (workflow parser):
- `parseWorkflow()` reads file, parses YAML, validates schema, checks referential integrity, applies defaults
- `WorkflowParseError` is the error class with `.errors` array

### Git Intelligence

Recent commits follow: `feat: story {key} — {description}`. This story modifies existing files (workflow-parser.ts, run.ts, tests). The codebase uses TypeScript with ESM `.js` extensions in import paths. Tests use vitest with temp directory patterns.

### References

- [Source: _bmad-output/planning-artifacts/epics-v2.md#Story 9.1: Workflow Patch Resolution]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#AD1: Module Boundaries — workflow-parser covers FR13-15]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#AD4: Config Resolution Caching]
- [Source: src/lib/agent-resolver.ts — loadPatch(), mergePatch(), resolveAgent(), deepMerge()]
- [Source: src/lib/workflow-parser.ts — parseWorkflow(), WorkflowParseError]
- [Source: src/lib/schema-validate.ts — validateWorkflowSchema()]
- [Source: src/commands/run.ts — workflow loading (lines 101-115)]
- [Source: src/schemas/workflow.schema.json — workflow schema (additionalProperties: false)]
- [Source: templates/workflows/default.yaml — embedded default workflow]
