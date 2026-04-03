# Story 8.1: Issue Tracker Module & CLI

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to create, list, and manage issues via `codeharness issue`,
so that bugs and tech debt have a path to implementation alongside stories.

## Acceptance Criteria

1. **Given** no `.codeharness/issues.yaml` exists
   **When** `codeharness issue create "Fix Docker timeout" --priority high --source retro-sprint-1` runs
   **Then** `.codeharness/issues.yaml` is created with an `issues` array containing one entry with auto-generated `id` (format `issue-NNN`), `title`, `source`, `priority`, and `status: backlog`
   <!-- verification: runtime-provable -->

2. **Given** `.codeharness/issues.yaml` already exists with issues
   **When** `codeharness issue create "Another bug" --priority medium` runs
   **Then** the new issue is appended to the existing `issues` array with the next sequential id
   **And** existing issues are not modified
   <!-- verification: runtime-provable -->

3. **Given** `.codeharness/issues.yaml` exists with issues
   **When** `codeharness issue list` runs
   **Then** all issues are displayed with id, title, priority, status, and source
   **And** `--json` flag outputs JSON array format
   <!-- verification: runtime-provable -->

4. **Given** `.codeharness/issues.yaml` exists with `issue-001` at status `backlog`
   **When** `codeharness issue close issue-001` runs
   **Then** `issue-001` status is updated to `done`
   **And** the file is written back with the updated status
   <!-- verification: runtime-provable -->

5. **Given** issues use status values
   **When** any status is set (via create or close)
   **Then** the status value is one of: `backlog`, `ready`, `in-progress`, `review`, `verifying`, `done`, `failed`, `blocked` (same values as sprint-status.yaml)
   <!-- verification: test-provable -->

6. **Given** `codeharness issue create` is called without `--source`
   **When** the issue is created
   **Then** `source` defaults to `"manual"`
   <!-- verification: test-provable -->

7. **Given** `codeharness issue create` is called without `--priority`
   **When** the issue is created
   **Then** `priority` defaults to `"medium"`
   <!-- verification: test-provable -->

8. **Given** `codeharness issue close` is called with a non-existent issue id
   **When** the command executes
   **Then** it prints an error message and exits with code 1
   <!-- verification: test-provable -->

9. **Given** `codeharness issue list` is called when no `issues.yaml` exists
   **When** the command executes
   **Then** it prints "No issues found" and exits with code 0
   <!-- verification: runtime-provable -->

10. **Given** `npm run build` is executed
    **When** the build completes
    **Then** it succeeds with zero errors
    **And** `npm run test:unit` passes with no regressions in existing test suites
    <!-- verification: test-provable -->

11. **Given** unit tests for the issue tracker module and CLI
    **When** `npm run test:unit` is executed
    **Then** tests pass at 80%+ coverage for new code covering: issue creation, listing, closing, default values, error handling, file I/O, id generation
    <!-- verification: test-provable -->

12. **Given** the workflow engine already reads `.codeharness/issues.yaml`
    **When** an issue is created via `codeharness issue create`
    **Then** the YAML format matches what `loadWorkItems()` in `workflow-engine.ts` expects: `issues` array with objects containing `id`, `title`, `source`, `priority`, `status`
    <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Create `src/lib/issue-tracker.ts` — the issue tracker module (AC: #1, #2, #5, #6, #7, #12)
  - [x] Define `Issue` interface: `{ id: string; title: string; source: string; priority: string; status: string; created_at: string }`
  - [x] Define `IssuesFile` interface: `{ issues: Issue[] }`
  - [x] Implement `readIssues(dir?: string): IssuesFile` — reads `.codeharness/issues.yaml`, returns `{ issues: [] }` if missing
  - [x] Implement `writeIssues(data: IssuesFile, dir?: string): void` — writes to `.codeharness/issues.yaml`, creates `.codeharness/` if needed
  - [x] Implement `nextIssueId(existing: Issue[]): string` — generates `issue-NNN` with zero-padded 3-digit incrementing from highest existing id
  - [x] Implement `createIssue(title: string, options?: { priority?: string; source?: string }, dir?: string): Issue` — creates and persists a new issue
  - [x] Implement `closeIssue(id: string, dir?: string): Issue` — finds issue by id, sets status to `done`, writes back
  - [x] Define `VALID_STATUSES` constant matching sprint validator values: `backlog`, `ready`, `in-progress`, `review`, `verifying`, `done`, `failed`, `blocked`
  - [x] Define `VALID_PRIORITIES` constant: `low`, `medium`, `high`, `critical`

- [x] Task 2: Create `src/commands/issue.ts` — the CLI command (AC: #1, #2, #3, #4, #8, #9)
  - [x] Register `issue` command with three subcommands: `create`, `list`, `close`
  - [x] `issue create <title>` with `--priority <p>` and `--source <s>` options
  - [x] `issue list` with `--json` support
  - [x] `issue close <id>` subcommand
  - [x] Use `ok()`, `fail()`, `info()`, `jsonOutput()` from `src/lib/output.ts`
  - [x] Export `registerIssueCommand` function

- [x] Task 3: Register the command in `src/index.ts` (AC: #10)
  - [x] Import `registerIssueCommand` from `./commands/issue.js`
  - [x] Call `registerIssueCommand(program)` in the registration block

- [x] Task 4: Write unit tests in `src/lib/__tests__/issue-tracker.test.ts` (AC: #10, #11)
  - [x] Test: `readIssues` returns empty array when file doesn't exist
  - [x] Test: `readIssues` parses existing issues.yaml correctly
  - [x] Test: `writeIssues` creates `.codeharness/` directory if needed
  - [x] Test: `writeIssues` outputs valid YAML matching workflow-engine expected format
  - [x] Test: `nextIssueId` generates `issue-001` for empty array
  - [x] Test: `nextIssueId` increments from highest existing id
  - [x] Test: `createIssue` sets defaults: source=`manual`, priority=`medium`, status=`backlog`
  - [x] Test: `createIssue` appends without modifying existing issues
  - [x] Test: `closeIssue` updates status to `done`
  - [x] Test: `closeIssue` throws for non-existent id
  - [x] Test: created YAML is compatible with `loadWorkItems()` expectations

- [x] Task 5: Write command tests in `src/commands/__tests__/issue.test.ts` (AC: #10, #11)
  - [x] Test: `create` subcommand creates issues.yaml
  - [x] Test: `list` subcommand displays issues
  - [x] Test: `list` with `--json` outputs JSON
  - [x] Test: `list` with no issues prints "No issues found"
  - [x] Test: `close` subcommand updates status
  - [x] Test: `close` with bad id returns error

- [x] Task 6: Verify build and all tests pass (AC: #10)
  - [x] Run `npm run build` — zero errors
  - [x] Run `npm run test:unit` — no regressions

## Dev Notes

### Architecture Context

The workflow engine (`src/lib/workflow-engine.ts`) already reads `.codeharness/issues.yaml` via `loadWorkItems()` (lines 186-222). It expects this YAML format:

```yaml
issues:
  - id: issue-001
    title: Docker timeout handling too aggressive
    source: retro-sprint-1
    priority: high
    status: backlog
```

The engine filters issues with status `backlog` or `ready-for-dev` and creates `WorkItem` objects with `source: 'issues'`. This story builds the write side — the module and CLI that create/manage the file the engine already reads.

### YAML Format Compatibility

The `loadWorkItems()` function expects:
- Top-level `issues` key containing an array
- Each issue has `id`, `title`, `source`, `priority`, `status` fields
- Status values `backlog` and `ready-for-dev` are the ones the engine picks up

The module MUST produce YAML that `loadWorkItems()` can parse. A compatibility test should round-trip: create issue → write YAML → parse with `yaml` library → verify structure matches what `loadWorkItems` expects.

### Status Values

From `src/modules/sprint/validator.ts`, the valid statuses are:
`backlog`, `ready`, `in-progress`, `review`, `verifying`, `done`, `failed`, `blocked`

The issue tracker must use the same set. Note: `ready-for-dev` appears in the workflow engine as a filter value but `ready` is the canonical status in the validator. Both should be accepted by the engine.

### File Location

Per architecture doc (AD6) and existing `run.ts` (line 159): `.codeharness/issues.yaml`. The path is already referenced in `run.ts`:
```typescript
issuesPath: join(projectDir, '.codeharness', 'issues.yaml'),
```

### CLI Pattern

Follow the existing command pattern:
- Export `registerIssueCommand(program: Command): void`
- Use Commander subcommands (`.command('create')`, `.command('list')`, `.command('close')`)
- Use `ok()`, `fail()`, `info()`, `jsonOutput()` from `src/lib/output.ts`
- Support `--json` global flag
- Set `process.exitCode = 1` on errors (do NOT call `process.exit()`)

### ID Generation

Auto-generated IDs follow `issue-NNN` format (zero-padded 3 digits). Parse existing IDs to find the max, increment by 1. If no issues exist, start at `issue-001`. If IDs are non-sequential (e.g., issue-001, issue-005), next is `issue-006`.

### Dependencies

- **New file:** `src/lib/issue-tracker.ts` — core module (~120-150 lines)
- **New file:** `src/commands/issue.ts` — CLI command (~100-120 lines)
- **New file:** `src/lib/__tests__/issue-tracker.test.ts` — module tests (~200-250 lines)
- **New file:** `src/commands/__tests__/issue.test.ts` — command tests (~150-180 lines)
- **Modified file:** `src/index.ts` — register new command (~2 lines)
- **No new npm dependencies** — uses `yaml` (already installed) and `commander` (already installed)

### File Structure

```
src/
  lib/
    issue-tracker.ts          (NEW)
    __tests__/
      issue-tracker.test.ts   (NEW)
  commands/
    issue.ts                  (NEW)
    __tests__/
      issue.test.ts           (NEW)
  index.ts                    (MODIFIED — add import + registration)
```

### Testing Standards

- Framework: `vitest` (already configured)
- Pattern: co-located tests in `__tests__/` directories
- Coverage target: 80%+
- Use `vi.mock` for fs operations in unit tests
- Use temp directories for integration-style tests (see existing patterns in `workflow-state.test.ts`)

### Anti-Patterns to Avoid

- **Do NOT use `process.exit()`** — set `process.exitCode` instead (existing pattern)
- **Do NOT use `any` in the API surface** — explicit TypeScript types per NFR18
- **Do NOT create a separate schema for issues.yaml** — the format is simple enough that runtime validation suffices
- **Do NOT modify `workflow-engine.ts`** — the read side already works; this story is write-only
- **Do NOT add beads or GitHub integration** — this is a standalone file-based tracker

### Previous Story Intelligence

From story 7-2 (resume after circuit breaker):
- The `run.ts` command already passes `issuesPath` to the workflow engine (line 159)
- The engine's `loadWorkItems()` already handles missing/malformed issues.yaml gracefully

From architecture-v2.md (AD6):
- issues.yaml replaces beads as the lightweight issue tracker
- Same statuses, same execution path as stories
- Retro auto-import (story 8-2) will write to the same file

### Git Intelligence

Recent commits follow: `feat: story {key} — {description}`. This story creates new files (no modifications to existing code except index.ts registration). The codebase uses TypeScript with ESM `.js` extensions in import paths. Tests use vitest with vi.mock patterns.

### References

- [Source: _bmad-output/planning-artifacts/epics-v2.md#Story 8.1: Issue Tracker Module & CLI]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#AD6: Issue Tracking (Beads Replacement)]
- [Source: src/lib/workflow-engine.ts — loadWorkItems() (lines 136-226)]
- [Source: src/commands/run.ts — issuesPath (line 159)]
- [Source: src/modules/sprint/validator.ts — VALID_STATUSES (lines 12-21)]
- [Source: src/lib/output.ts — ok(), fail(), info(), jsonOutput()]
- [Source: src/index.ts — command registration pattern]
