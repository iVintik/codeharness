# Story 4.4: Source Isolation Enforcement

Status: verifying

## Story

As a developer,
I want source_access: false enforced via source-free workspace,
so that the evaluator cannot access implementation code.

## Acceptance Criteria

1. **Given** a `source-isolation.ts` module at `src/lib/source-isolation.ts`
   **When** inspected
   **Then** it exports a `createIsolatedWorkspace(options: IsolationOptions): Promise<IsolatedWorkspace>` function that creates a temp directory at `/tmp/codeharness-verify-{runId}/` with a `story-files/` subdirectory
   <!-- verification: test-provable -->

2. **Given** a task with `source_access: false` and a list of story file paths
   **When** `createIsolatedWorkspace()` is called with `{ runId, storyFiles }` 
   **Then** the temp directory is created, story files are copied into `story-files/`, and a `verdict/` directory is created for evaluator output
   **And** the workspace directory does NOT contain `src/`, `node_modules/`, `package.json`, or any source code files
   <!-- verification: test-provable -->

3. **Given** a created `IsolatedWorkspace`
   **When** its `toDispatchOptions()` method is called
   **Then** it returns `DispatchOptions` with `cwd` set to the temp directory path
   <!-- verification: test-provable -->

4. **Given** an agent resolved with `disallowedTools` (e.g., the evaluator agent)
   **When** the subagent definition is compiled via `compileSubagentDefinition()` and source isolation is active
   **Then** `disallowedTools` includes `["Edit", "Write"]` preventing the agent from modifying any files
   **And** this is verified by checking that the evaluator embedded template at `templates/agents/evaluator.yaml` already specifies `disallowedTools: [Edit, Write]`
   <!-- verification: test-provable -->

5. **Given** an `IsolatedWorkspace` after use
   **When** `cleanup()` is called
   **Then** the temp directory and all its contents are removed from disk
   **And** calling `cleanup()` on an already-cleaned workspace does not throw
   <!-- verification: test-provable -->

6. **Given** `createIsolatedWorkspace()` is called with an empty `storyFiles` array
   **When** the workspace is created
   **Then** the temp directory and `story-files/` subdirectory still exist (empty)
   **And** `verdict/` directory exists
   <!-- verification: test-provable -->

7. **Given** a story file path that does not exist on disk
   **When** `createIsolatedWorkspace()` attempts to copy it
   **Then** a warning is logged (via `warn()`) and the missing file is skipped without throwing
   <!-- verification: test-provable -->

8. **Given** `dispatchAgent()` is called with `DispatchOptions.cwd` pointing to the isolated workspace
   **When** the Agent SDK `query()` is invoked
   **Then** the SDK session runs in the temp directory (verified by confirming `agent-dispatch.ts` already passes `options.cwd` to query — line 134)
   **And** the agent has no access to the original project's `src/` directory
   <!-- verification: test-provable -->

9. **Given** unit tests for the source isolation module
   **When** `npm run test:unit` is executed
   **Then** tests pass at 80%+ coverage for `source-isolation.ts` covering: workspace creation, story file copying, missing file handling, dispatch options generation, cleanup, idempotent cleanup, and no-source-code verification
   <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Create source isolation module interfaces (AC: #1, #3)
  - [x] Create `src/lib/source-isolation.ts`
  - [x] Define `IsolationOptions` interface: `{ runId: string; storyFiles: string[] }`
  - [x] Define `IsolatedWorkspace` interface: `{ dir: string; storyFilesDir: string; verdictDir: string; toDispatchOptions(): DispatchOptions; cleanup(): Promise<void> }`
  - [x] Import `DispatchOptions` from `agent-dispatch.ts` for return type

- [x] Task 2: Implement workspace creation (AC: #1, #2, #6)
  - [x] Implement `createIsolatedWorkspace(options: IsolationOptions): Promise<IsolatedWorkspace>`
  - [x] Create temp directory at `/tmp/codeharness-verify-{runId}/` using `mkdtemp` or `mkdirSync`
  - [x] Create `story-files/` subdirectory inside the temp dir
  - [x] Create `verdict/` subdirectory inside the temp dir
  - [x] Copy each story file from `storyFiles` array into `story-files/`
  - [x] Handle empty `storyFiles` array — still create directories

- [x] Task 3: Implement missing file handling (AC: #7)
  - [x] When a story file path doesn't exist, call `warn()` from `output.ts` with a descriptive message
  - [x] Skip the missing file and continue with remaining files
  - [x] Do not throw — the workspace is still valid with fewer files

- [x] Task 4: Implement dispatch options and cleanup (AC: #3, #5)
  - [x] `toDispatchOptions()` returns `{ cwd: dir }` where `dir` is the temp directory path
  - [x] `cleanup()` removes the temp directory recursively using `rm -rf` / `fs.rm(dir, { recursive: true, force: true })`
  - [x] `cleanup()` is idempotent — if directory already removed, no error

- [x] Task 5: Verify existing integration points (AC: #4, #8)
  - [x] Confirm `templates/agents/evaluator.yaml` has `disallowedTools: [Edit, Write]` (from story 3-2)
  - [x] Confirm `agent-dispatch.ts` line 134 already passes `options.cwd` to `query()` (from story 4-1)
  - [x] Confirm `compileSubagentDefinition()` in `agent-resolver.ts` already passes `disallowedTools` through (line 343)
  - [x] No changes needed to `agent-dispatch.ts` or `agent-resolver.ts`

- [x] Task 6: Write unit tests (AC: #9)
  - [x] Create `src/lib/__tests__/source-isolation.test.ts`
  - [x] Test: `createIsolatedWorkspace()` creates temp dir with expected structure
  - [x] Test: story files are copied to `story-files/` subdirectory
  - [x] Test: `src/` directory does NOT exist in isolated workspace
  - [x] Test: `toDispatchOptions()` returns `{ cwd }` pointing to the temp dir
  - [x] Test: `cleanup()` removes the temp directory
  - [x] Test: `cleanup()` called twice does not throw (idempotent)
  - [x] Test: empty `storyFiles` array creates directories but no files in `story-files/`
  - [x] Test: missing story file logs a warning and is skipped
  - [x] Test: `verdict/` directory exists in workspace
  - [x] Verify 80%+ coverage on `source-isolation.ts` — achieved 100% across all metrics

## Dev Notes

### Module Design Decision

Source isolation is a standalone `source-isolation.ts` module rather than being added to `agent-dispatch.ts` or `evaluator.ts`. Rationale:

1. `agent-dispatch.ts` is intentionally stateless — it does not do file I/O beyond what the SDK does (per story 4-1 anti-patterns)
2. The evaluator module (story 6-1) will call `createIsolatedWorkspace()` to set up the blind workspace, then pass the resulting `cwd` to `dispatchAgent()`
3. Source isolation is a reusable primitive — any task with `source_access: false` uses it, not just the evaluator

### How Source Isolation Works End-to-End

```
workflow-engine (story 5-1) checks task.source_access:
  if source_access === false:
    1. createIsolatedWorkspace({ runId, storyFiles })
       -> creates /tmp/codeharness-verify-{runId}/
       -> copies story AC files into story-files/
       -> creates verdict/ for output
    2. workspace.toDispatchOptions()
       -> returns { cwd: '/tmp/codeharness-verify-{runId}/' }
    3. dispatchAgent(definition, prompt, { ...dispatchOptions })
       -> agent-dispatch passes cwd to SDK query() (already implemented, line 134)
       -> SDK runs agent in temp dir — no src/ present
    4. workspace.cleanup()
       -> removes temp dir
  else:
    dispatchAgent(definition, prompt, { cwd: process.cwd() })
    -> normal dispatch in project directory
```

### Workspace Structure

```
/tmp/codeharness-verify-{runId}/
  story-files/     # ACs and story context — copied from sprint
  verdict/         # evaluator writes JSON verdict here (used by story 6-1)
```

The workspace deliberately omits: `src/`, `node_modules/`, `package.json`, `.git/`, `.codeharness/`, and all other project files. The evaluator sees only what was explicitly placed there.

### Existing Code That Already Supports This

- `agent-dispatch.ts` line 134: `...(options?.cwd ? { cwd: options.cwd } : {})` — already passes cwd to SDK
- `agent-resolver.ts` line 343: `disallowedTools: agent.disallowedTools ?? []` — already passes through from agent config
- `templates/agents/evaluator.yaml`: already defines `disallowedTools: [Edit, Write]` (from story 3-2)
- `workflow-parser.ts` line 11: `source_access: boolean` — already parsed from workflow YAML

### What This Story Does NOT Do

- Does NOT implement the evaluator itself — that's Epic 6 (story 6-1)
- Does NOT implement Docker container management — that's Epic 6
- Does NOT copy observability configs into the workspace — that's Epic 6 (evaluator observability, FR37)
- Does NOT modify `agent-dispatch.ts` — it already handles `cwd`
- Does NOT modify `agent-resolver.ts` — it already passes `disallowedTools`
- Does NOT orchestrate when isolation is used — the workflow-engine (story 5-1) decides based on `task.source_access`

### Anti-Patterns to Avoid

- **Do NOT spawn a git worktree** — too complex, AD2 explicitly chose temp dir for simplicity
- **Do NOT symlink source files** — defeats isolation purpose
- **Do NOT use Docker-in-Docker** — AD2 explicitly rejected this
- **Do NOT add state tracking to this module** — it creates a directory and cleans it up, nothing more
- **Do NOT import workflow-state** — this module is stateless (the engine records workspace info if needed)

### Dependencies from Previous Stories

- **Story 4-1** created `agent-dispatch.ts` with `DispatchOptions.cwd` — this module creates the cwd value for isolated dispatch
- **Story 3-2** created the evaluator embedded template with `disallowedTools: [Edit, Write]` — this module relies on that being set
- **Story 3-3** created `agent-resolver.ts` with `compileSubagentDefinition()` — this module relies on it passing `disallowedTools` through
- **Story 2-2** created `workflow-parser.ts` with `source_access` field on `ResolvedTask` — the engine will use this to decide when to invoke isolation

### Project Structure Notes

- New file: `src/lib/source-isolation.ts` — workspace creation, file copying, cleanup
- New test file: `src/lib/__tests__/source-isolation.test.ts`
- No modified files — this module is additive only
- Aligns with architecture pattern: each module in `src/lib/` is one file with co-located test

### Testing Strategy

Unit tests use real file system operations in a temp directory (same pattern as `workflow-state.test.ts`). Tests create a temp project dir with dummy story files, call `createIsolatedWorkspace()`, verify the workspace structure, then call `cleanup()`. No mocking needed — the module does real fs operations and we verify real results.

### References

- [Source: _bmad-output/planning-artifacts/epics-v2.md#Story 4.4: Source Isolation Enforcement]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#AD2: Evaluator Workspace Isolation]
- [Source: _bmad-output/planning-artifacts/prd-evaluator-redesign.md#FR23 — source_access: false enforcement]
- [Source: src/lib/agent-dispatch.ts — DispatchOptions.cwd, line 134]
- [Source: src/lib/agent-resolver.ts — compileSubagentDefinition(), disallowedTools, line 343]
- [Source: src/lib/workflow-parser.ts — ResolvedTask.source_access, line 11]
- [Source: _bmad-output/implementation-artifacts/4-1-agent-dispatch-module-sdk-integration.md — predecessor story]
- [Source: _bmad-output/implementation-artifacts/4-2-session-boundary-management.md — predecessor story]
- [Source: _bmad-output/implementation-artifacts/4-3-trace-id-generation-injection.md — predecessor story]
