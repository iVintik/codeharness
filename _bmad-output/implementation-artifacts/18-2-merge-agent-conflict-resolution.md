# Story 18.2: Merge Agent for Conflict Resolution

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want a merge agent that resolves git conflicts with semantic context,
so that parallel epics don't require manual conflict resolution.

## Acceptance Criteria

1. **Given** a new `src/lib/merge-agent.ts` module, **when** imported, **then** it exports a `resolveConflicts(options: MergeConflictContext): Promise<ConflictResolutionResult>` function and the `MergeConflictContext` and `ConflictResolutionResult` interfaces. <!-- verification: test-provable -->

2. **Given** `worktree-manager.ts` `mergeWorktree()` returns `MergeResult` with `reason: 'conflict'` and a `conflicts` array, **when** the merge agent is called with the conflicting files, main content, branch content, and both epics' descriptions, **then** the agent receives a prompt containing all conflict context: file paths, `<<<<<<< main` / `>>>>>>> branch` markers, and semantic descriptions of what each epic built. <!-- verification: test-provable -->

3. **Given** the merge agent resolves all conflicts in the provided files, **when** resolution completes, **then** the agent writes the resolved content to the conflicting files on disk, stages the changes (`git add`), and commits the merge resolution. <!-- verification: test-provable -->

4. **Given** the merge agent has resolved conflicts and committed, **when** post-resolution validation runs, **then** the full test suite executes on the merged result via `npm test` (or the project's configured test command). <!-- verification: test-provable -->

5. **Given** the test suite fails after agent-resolved merge, **when** failure is detected, **then** the merge is reverted (`git reset --hard HEAD~1`), and the agent retries with additional context including the test failure output (up to 3 total attempts). <!-- verification: test-provable -->

6. **Given** 3 consecutive resolution attempts have all failed (tests fail each time), **when** the third attempt fails, **then** the merge is escalated: the worktree and branch are preserved, and the `ConflictResolutionResult` includes `escalated: true` with `escalationMessage` containing the worktree path, branch name, conflicting files, and a `git diff` command the user can run. <!-- verification: test-provable -->

7. **Given** the `ConflictResolutionResult` interface, **when** inspected, **then** it includes: `resolved: boolean`, `attempts: number`, `escalated: boolean`, `escalationMessage?: string`, `testResults?: { passed: number; failed: number; coverage?: number }`, and `resolvedFiles?: string[]`. <!-- verification: test-provable -->

8. **Given** the merge agent dispatches a driver (via `AgentDriver.dispatch()`), **when** the driver is invoked, **then** the prompt includes: (a) the list of conflicting files with their full conflict-marker content, (b) a description of what the main branch contains, (c) a description of what the feature branch was building, and (d) instructions to resolve preserving both changes. <!-- verification: test-provable -->

9. **Given** the `MergeConflictContext` interface, **when** inspected, **then** it includes: `epicId: string`, `branch: string`, `conflicts: string[]` (file paths), `mainDescription: string`, `branchDescription: string`, `cwd: string`, `testCommand: string`, and `driver: AgentDriver`. <!-- verification: test-provable -->

10. **Given** `worktree-manager.ts` currently aborts the merge on conflict (calls `abortMerge`), **when** the merge agent integration is wired, **then** `mergeWorktree()` gains an optional `onConflict` callback parameter of type `(context: MergeConflictContext) => Promise<ConflictResolutionResult>` that is invoked instead of immediately returning a conflict result. If no callback is provided, behavior is unchanged (returns conflict result as before). <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Define `MergeConflictContext` and `ConflictResolutionResult` interfaces (AC: #1, #7, #9)
  - [x] Create `src/lib/merge-agent.ts` with both interfaces
  - [x] `MergeConflictContext`: epicId, branch, conflicts, mainDescription, branchDescription, cwd, testCommand, driver
  - [x] `ConflictResolutionResult`: resolved, attempts, escalated, escalationMessage?, testResults?, resolvedFiles?
  - [x] Export the `resolveConflicts` function

- [x] Task 2: Build the conflict context prompt (AC: #2, #8)
  - [x] Read conflict markers from each file in the `conflicts` array using `readFileSync`
  - [x] Build a structured prompt with: file path, conflict content, main description, branch description
  - [x] Include instructions: "Resolve all conflicts preserving changes from both branches. Both are correct additions."
  - [x] Include instruction to write resolved content to the files and stage + commit

- [x] Task 3: Implement `resolveConflicts()` with retry loop (AC: #3, #4, #5, #6)
  - [x] Loop up to 3 attempts
  - [x] Each attempt: dispatch driver with prompt, then run test suite
  - [x] If tests pass: return `{ resolved: true, attempts, testResults, resolvedFiles }`
  - [x] If tests fail: revert (`git reset --hard HEAD~1`), retry with test failure context appended to prompt
  - [x] After 3 failures: return `{ resolved: false, attempts: 3, escalated: true, escalationMessage }` with worktree path, branch, conflicting files, and `git diff` command

- [x] Task 4: Add `onConflict` callback to `mergeWorktree()` (AC: #10)
  - [x] Add optional `onConflict` parameter to `mergeWorktree` signature
  - [x] When conflicts detected and `onConflict` is provided: do NOT abort merge, instead call `onConflict` with context
  - [x] When conflicts detected and `onConflict` is NOT provided: existing behavior (abort, return conflict result)
  - [x] If `onConflict` returns `resolved: true`, the merge continues with cleanup
  - [x] If `onConflict` returns `escalated: true`, return a merge failure result preserving worktree

- [x] Task 5: Write unit tests (AC: #1-#10)
  - [x] Test: `resolveConflicts` dispatches driver with correct prompt containing conflict markers
  - [x] Test: successful resolution (tests pass on first attempt) returns `resolved: true, attempts: 1`
  - [x] Test: resolution with test failure retries up to 3 times with test failure context
  - [x] Test: after 3 failures, returns `escalated: true` with escalation message containing worktree path, branch, files, git diff command
  - [x] Test: `ConflictResolutionResult` has correct shape
  - [x] Test: `MergeConflictContext` has correct shape
  - [x] Test: `mergeWorktree` with `onConflict` callback invokes callback on conflict
  - [x] Test: `mergeWorktree` without `onConflict` preserves existing conflict behavior
  - [x] Test: prompt includes main and branch descriptions
  - [x] Test: retry prompt includes previous test failure output

## Dev Notes

### Architecture Constraints

- **Architecture Decision 3** (architecture-parallel-execution.md): Merges are serialized — only one `git merge` into main at a time. The merge agent operates INSIDE the merge mutex — the agent resolves conflicts while the mutex is held. Do not release the mutex between conflict detection and resolution.
- **Merge Agent Boundary** (architecture-parallel-execution.md): The merge agent wraps a driver with merge-specific context. It does NOT know about worktrees or lanes directly — it receives a `MergeConflictContext` with everything it needs. The `cwd` in context points to the main repo (where the conflicted merge is in progress).
- **Retry Policy**: 3 attempts total. Each failed attempt reverts the merge commit and retries with test failure output appended. After 3 failures, escalate — preserve the worktree and branch for manual resolution.
- **Driver Dispatch**: Use the `AgentDriver` interface from `src/lib/agents/types.ts`. The merge agent receives a driver instance in its context — it does NOT select the driver itself. The caller (lane pool or engine) is responsible for choosing which driver to use.

### Key Files to Create

| File | Why |
|------|-----|
| `src/lib/merge-agent.ts` | New module — conflict resolution dispatch and retry logic |
| `src/lib/__tests__/merge-agent.test.ts` | Tests for all merge agent functionality |

### Key Files to Modify

| File | Why |
|------|-----|
| `src/lib/worktree-manager.ts` | Add optional `onConflict` callback to `mergeWorktree()` signature |
| `src/lib/__tests__/worktree-manager.test.ts` | Add tests for `onConflict` callback behavior |

### Key Files to Read (Do Not Modify)

| File | Why |
|------|-----|
| `src/lib/agents/types.ts` | `AgentDriver`, `DispatchOpts`, `OutputContract` — driver dispatch interface |
| `src/lib/agents/drivers/factory.ts` | `getDriver()` — how to retrieve a registered driver |
| `src/lib/agents/stream-parser.ts` | `StreamEvent` — events from driver dispatch (consume and ignore during merge) |
| `src/lib/lane-pool.ts` | `LanePool` — the caller that will wire `onConflict` (not this story's responsibility to wire it) |
| `src/lib/hierarchical-flow.ts` | `ExecutionConfig` — provides merge_strategy and other config |

### Implementation Patterns

**Prompt construction:**
```typescript
function buildConflictPrompt(ctx: MergeConflictContext, testFailure?: string): string {
  const conflictSections = ctx.conflicts.map(file => {
    const content = readFileSync(join(ctx.cwd, file), 'utf-8');
    return `### ${file}\n\`\`\`\n${content}\n\`\`\``;
  }).join('\n\n');

  let prompt = `Merge conflict in ${ctx.conflicts.length} file(s) between main and ${ctx.branch}.\n\n`;
  prompt += `**Main branch context:** ${ctx.mainDescription}\n`;
  prompt += `**Feature branch context:** ${ctx.branchDescription}\n\n`;
  prompt += `**Conflicting files:**\n\n${conflictSections}\n\n`;
  prompt += `Resolve ALL conflicts preserving changes from both branches. Both are correct additions.\n`;
  prompt += `Write the resolved content to each file, stage with \`git add\`, and commit the merge resolution.\n`;

  if (testFailure) {
    prompt += `\n**Previous attempt failed tests:**\n\`\`\`\n${testFailure}\n\`\`\`\n`;
    prompt += `Fix the resolution to make all tests pass.\n`;
  }
  return prompt;
}
```

**Retry loop:**
```typescript
export async function resolveConflicts(ctx: MergeConflictContext): Promise<ConflictResolutionResult> {
  const maxAttempts = 3;
  let lastTestFailure: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const prompt = buildConflictPrompt(ctx, lastTestFailure);
    // Dispatch driver — consume stream events to completion
    for await (const _event of ctx.driver.dispatch({ prompt, model: '...', cwd: ctx.cwd, sourceAccess: true })) {
      // Stream events consumed; merge agent doesn't need to display them
    }

    // Run test suite
    const testResults = await runTestSuite(ctx.testCommand, ctx.cwd);
    if (testResults.failed === 0) {
      return { resolved: true, attempts: attempt, escalated: false, testResults, resolvedFiles: ctx.conflicts };
    }

    // Revert and retry
    lastTestFailure = testResults.output;
    execSync('git reset --hard HEAD~1', { cwd: ctx.cwd });
  }

  // Escalation after max attempts
  return {
    resolved: false,
    attempts: maxAttempts,
    escalated: true,
    escalationMessage: buildEscalationMessage(ctx),
  };
}
```

**onConflict wiring in mergeWorktree (conceptual):**
```typescript
// In the catch block where conflicts are detected:
if (conflicts.length > 0 && onConflict) {
  // Do NOT abort merge — leave conflicts in place for the agent to resolve
  const result = await onConflict({ epicId, branch, conflicts, ... });
  if (result.resolved) {
    // Agent resolved and committed — run tests is already done inside resolveConflicts
    this.cleanupWorktree(epicId);
    return { success: true, testResults: result.testResults, durationMs: Date.now() - start };
  }
  // Escalated — abort merge, preserve worktree
  this.abortMerge(strategy);
  return { success: false, reason: 'conflict', conflicts, durationMs: Date.now() - start };
}
// No callback — existing behavior
this.abortMerge(strategy);
return { success: false, reason: 'conflict', conflicts, durationMs: Date.now() - start };
```

### Previous Story (18-1) Intelligence

- Story 18-1 added `mergeWorktree()`, `MergeResult`, `MergeStrategy`, `AsyncMutex`, and `mergeMutex` to `worktree-manager.ts`.
- The `mergeWorktree` method currently detects conflicts via `detectConflicts()` (checks `git diff --name-only --diff-filter=U`) and aborts immediately, returning `{ success: false, reason: 'conflict', conflicts }`.
- The `abortMerge(strategy)` method calls `git merge --abort` or `git rebase --abort` depending on strategy.
- The `runTestSuite(testCommand)` private method uses `execAsync` with timeout, parses pass/fail/coverage from stdout. This pattern should be reused (or extracted) for the merge agent's test validation.
- The `execGit` private helper wraps `execSync` with 30s timeout and error wrapping.
- Tests use `vi.mock('node:child_process')` to mock `execSync` and `exec`. Follow the same pattern.
- The `findBranchForEpic(epicId)` method returns the branch name for a given epicId.
- 26 merge tests were added in 18-1. The merge agent tests will be in a separate file.
- Module pattern: TypeScript ESM, `.js` import extensions, vitest.

### Boundary: What This Story Does NOT Include

- **Wiring the onConflict callback into lane-pool or epic-completion** — the lane pool and epic completion flow (Epic 19) will call `mergeWorktree` with the `onConflict` callback. This story adds the callback parameter and the merge agent module; callers are wired later.
- **TUI merge status display** — Epic 20 will show merge progress, conflict resolution status, and escalation in the TUI.
- **Telemetry for merge attempts** — not in scope. Telemetry for merge can be added later.
- **Choosing which driver to use for the merge agent** — the caller passes the driver instance. The merge agent does not contain driver selection logic.

### Edge Cases

- **Conflict in files that don't exist on disk** (e.g., deleted on one side): The `readFileSync` in prompt construction may fail. Handle gracefully — log the file as "deleted on one side" in the prompt context.
- **Agent fails to resolve** (writes incomplete files, doesn't commit): After dispatch completes, check if the working directory is clean. If conflicts remain unresolved (still has conflict markers), treat as failed attempt.
- **Agent creates new conflicts** (resolves one file but breaks another): The test suite catches this — tests will fail, triggering a retry.
- **Empty conflict list** (mergeWorktree passes empty array): Guard against this — if `conflicts.length === 0`, return immediately with `resolved: true, attempts: 0`.
- **Git state corruption during retry** (reset fails): Wrap `git reset --hard HEAD~1` in try/catch. If reset fails, escalate immediately — don't retry on a corrupted state.
- **Driver dispatch throws** (network error, rate limit): Catch dispatch errors. Treat as a failed attempt — revert and retry. Count toward the 3-attempt limit.
- **Test command timeout**: The `runTestSuite` already has a timeout. A timeout counts as test failure.

### Project Structure Notes

- Source: TypeScript in `src/`, compiled to `dist/`
- Tests: vitest, colocated in `src/lib/__tests__/`
- ESM modules — use `.js` extensions in imports
- Build: `npm run build`, Test: `npm test`
- The `merge-agent.ts` should be a focused module (~150-250 lines). Do not bloat with unnecessary abstractions.
- The `worktree-manager.ts` is ~500 lines after 18-1. Adding the `onConflict` parameter is a small change (~20-30 lines).

### References

- [Source: _bmad-output/planning-artifacts/epics-parallel-execution.md#Story 18.2]
- [Source: _bmad-output/planning-artifacts/architecture-parallel-execution.md#Decision 3 -- Merge Serialization & Agent]
- [Source: _bmad-output/planning-artifacts/architecture-parallel-execution.md#Merge Agent Boundary]
- [Source: _bmad-output/planning-artifacts/prd.md#FR13, FR14, FR16]
- [Source: _bmad-output/planning-artifacts/ux-design-parallel-execution.md#Merge In Progress]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/18-2-merge-agent-conflict-resolution-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/18-2-merge-agent-conflict-resolution.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

### File List

- `src/lib/merge-agent.ts` (created)
- `src/lib/__tests__/merge-agent.test.ts` (created)
- `src/lib/worktree-manager.ts` (modified — added onConflict callback, OnConflictCallback type)
- `src/lib/__tests__/worktree-manager.test.ts` (modified — added 5 onConflict tests)
