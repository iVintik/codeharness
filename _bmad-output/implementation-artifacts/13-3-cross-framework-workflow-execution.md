# Story 13.3: Cross-Framework Workflow Execution

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to run a workflow where implement uses claude-code and verify uses codex,
so that verification is structurally independent from implementation.

## Acceptance Criteria

1. **Given** a workflow with `implement: { driver: claude-code }` and `verify: { driver: codex }`
   **When** `executeWorkflow()` completes the implement task
   **Then** the workflow engine writes an `OutputContract` JSON file to `.codeharness/contracts/{taskName}-{storyId}.json` via `writeOutputContract()`
   **And** the contract's `taskName`, `storyId`, `driver`, `model`, `timestamp`, and `duration_ms` fields are populated from the dispatch context
   <!-- verification: test-provable -->

2. **Given** the implement task has completed and its output contract exists on disk
   **When** the workflow engine dispatches the next task (e.g., verify)
   **Then** it reads the previous task's contract via `readOutputContract()` and passes it as `previousOutputContract` to `dispatchTask()`
   **And** the contract context is injected into the verify task's prompt via `buildPromptWithContractContext()`
   <!-- verification: test-provable -->

3. **Given** sequential flow steps `["create-story", "implement", "verify"]`
   **When** the engine processes them in order
   **Then** after `create-story` completes, an output contract is written
   **And** `implement` receives the contract from `create-story` as prompt context
   **And** after `implement` completes, its own output contract is written
   **And** `verify` receives the contract from `implement` as prompt context
   <!-- verification: test-provable -->

4. **Given** a loop block `{ loop: ["implement", "verify"] }` with different drivers per task
   **When** the loop executes iteration N
   **Then** after `implement` completes, its output contract is written
   **And** `verify` receives the output contract from `implement` as prompt context
   **And** on the next iteration, `implement` receives the output contract from the previous iteration's `verify` task
   <!-- verification: test-provable -->

5. **Given** the workflow engine dispatches a task and the driver yields `StreamEvent` objects
   **When** the dispatch completes
   **Then** the `OutputContract.output` field is set to the accumulated text from `text` events
   **And** `OutputContract.cost_usd` is set from the `result` event's cost (or `null` if not reported)
   **And** `OutputContract.changedFiles` is populated from `tool-complete` events for Write/Edit tools (or empty array if none)
   **And** `OutputContract.testResults` is `null` (test result extraction is not implemented in this story)
   **And** `OutputContract.acceptanceCriteria` is an empty array (AC extraction is not implemented in this story)
   <!-- verification: test-provable -->

6. **Given** the first task in a workflow (no previous task)
   **When** the engine dispatches it
   **Then** `previousOutputContract` is `null` and no contract injection occurs
   **And** the prompt is the base prompt unchanged
   <!-- verification: test-provable -->

7. **Given** the engine crashes after writing the output contract but before dispatching the next task
   **When** the engine resumes (NFR18: idempotent re-run)
   **Then** the previously-written output contract is still on disk (atomic writes from story 13-1)
   **And** the next task correctly reads it on resume
   **And** the completed task is skipped (existing crash recovery via `isTaskCompleted`)
   <!-- verification: test-provable -->

8. **Given** a `writeOutputContract()` call fails (e.g., disk full)
   **When** the error occurs
   **Then** the engine logs a warning but does NOT abort the workflow
   **And** the next task receives `null` as `previousOutputContract` (graceful degradation)
   **And** the workflow continues executing subsequent tasks
   <!-- verification: test-provable -->

9. **Given** the contract directory `.codeharness/contracts/` does not exist
   **When** the engine writes the first output contract
   **Then** the directory is created automatically (by `writeOutputContract()`'s `mkdirSync` with `recursive: true`)
   <!-- verification: test-provable -->

10. **Given** `npm run build` is executed after all changes
    **When** the build completes
    **Then** it succeeds with zero TypeScript errors
    **And** `npm run test:unit` passes with no regressions in existing test suites
    <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Add output contract writing to `dispatchTaskWithResult()` in `src/lib/workflow-engine.ts` (AC: #1, #5, #8, #9)
  - [x] Import `writeOutputContract` and `readOutputContract` from `./agents/output-contract.js`
  - [x] After step 12 (record trace ID) and before step 13 (write state to disk), construct an `OutputContract` from dispatch context:
    - `version: 1`
    - `taskName` from the `taskName` parameter
    - `storyId` from the `storyKey` parameter
    - `driver` from `driverName`
    - `model` from the resolved `model`
    - `timestamp: new Date().toISOString()`
    - `cost_usd` from the `cost` variable (0 → null)
    - `duration_ms` computed from start/end timestamps around the dispatch
    - `changedFiles` extracted from `tool-complete` events during dispatch (Write/Edit tool names)
    - `testResults: null` (not extracted in this story)
    - `output` from the accumulated `output` string
    - `acceptanceCriteria: []` (not extracted in this story)
  - [x] Call `writeOutputContract(contract, join(projectDir, '.codeharness', 'contracts'))` inside a try/catch
  - [x] On write failure, call `warn()` with the error message — do NOT throw
  - [x] Return the contract from `dispatchTaskWithResult()` alongside `updatedState` and `output`

- [x] Task 2: Track `changedFiles` from `StreamEvent` during dispatch (AC: #5)
  - [x] In the `for await (const event of driver.dispatch(...))` loop, track tool-complete events
  - [x] When `event.type === 'tool-complete'` and the tool name matches Write/Edit patterns, extract the file path from `event.args` or `event.name` and add to a `changedFiles: string[]` array
  - [x] Use the accumulated `changedFiles` when constructing the `OutputContract`

- [x] Task 3: Wire contract passing in sequential flow execution in `executeWorkflow()` (AC: #2, #3, #6)
  - [x] Maintain a `lastOutputContract: OutputContract | null = null` variable across flow steps
  - [x] After each `dispatchTask()` call for sequential tasks, update `lastOutputContract` from the returned contract
  - [x] Pass `lastOutputContract` as `previousOutputContract` to the next `dispatchTask()` call
  - [x] Update `dispatchTask()` return type to include the output contract

- [x] Task 4: Wire contract passing in loop block execution in `executeLoopBlock()` (AC: #4)
  - [x] Maintain a `lastOutputContract: OutputContract | null = null` variable across loop iterations
  - [x] After each task dispatch within the loop, update `lastOutputContract`
  - [x] Pass `lastOutputContract` as `previousOutputContract` to the next task dispatch
  - [x] The contract carries across iterations (verify's contract from iteration N is passed to implement in iteration N+1)

- [x] Task 5: Update `dispatchTask()` and `dispatchTaskWithResult()` signatures (AC: #1, #2)
  - [x] Change `dispatchTaskWithResult()` to return `{ updatedState, output, contract }` where `contract` is `OutputContract | null`
  - [x] Change `dispatchTask()` to return `{ state: WorkflowState; contract: OutputContract | null }`

- [x] Task 6: Add timing measurement to `dispatchTaskWithResult()` (AC: #1, #5)
  - [x] Record `const startMs = Date.now()` before the dispatch loop
  - [x] Compute `duration_ms = Date.now() - startMs` after the dispatch loop
  - [x] Use this for `OutputContract.duration_ms`

- [x] Task 7: Write unit tests (AC: #1-#10)
  - [x] In `src/lib/__tests__/workflow-engine.test.ts`:
    - [x] Test: `dispatchTaskWithResult` writes output contract to `.codeharness/contracts/`
    - [x] Test: `dispatchTaskWithResult` returns the written contract
    - [x] Test: sequential flow passes contract from task N to task N+1 via `previousOutputContract`
    - [x] Test: first task in flow gets `null` as `previousOutputContract`
    - [x] Test: loop block passes contract between tasks within an iteration
    - [x] Test: loop block carries contract across iterations
    - [x] Test: contract `output` field contains accumulated text events
    - [x] Test: contract `cost_usd` is populated from result event cost
    - [x] Test: contract `changedFiles` is populated from tool-complete events for Write/Edit
    - [x] Test: write failure is caught and logged, next task gets `null` contract
    - [x] Test: contract directory is created if it does not exist

- [x] Task 8: Verify build and tests (AC: #10)
  - [x] Run `npm run build` — zero TypeScript errors
  - [x] Run `npm run test:unit` — all tests pass, no regressions

## Dev Notes

### Architecture Compliance

This story implements Epic 4, Story 4.3 (mapped to sprint Epic 13, Story 13-3) "Cross-Framework Workflow Execution" from `epics-multi-framework.md`. It covers:
- **FR16:** System can execute a workflow where consecutive tasks use different drivers
- **FR17:** System can serialize a task's output contract to a structured JSON file after task completion
- **FR19:** System can pass acceptance criteria, changed file lists, and test results across framework boundaries via output contracts
- **FR20:** System can execute verification tasks on a different framework than implementation tasks
- **NFR18:** Workflow engine must be idempotent for re-runs — resume from last completed task

Key architecture decisions honored:
- **Decision 3 (Output Contract Format):** JSON files in `.codeharness/contracts/{taskName}-{storyId}.json`. Written atomically.
- **Output Contract Population Pattern:** Engine populates contract after each dispatch. `changedFiles` from tool-complete events, `cost_usd` from `getLastCost()`, `output` from accumulated text. Fields not available are `null`.
- **Workflow Engine Boundary:** Engine writes/reads output contracts between tasks. Engine does NOT parse CLI output or know driver internals.

### Implementation Strategy

This story wires together the pieces built in 13-1 (write/read) and 13-2 (prompt injection). The main integration points are:

1. **After dispatch:** Construct `OutputContract` from dispatch context and write to disk via `writeOutputContract()`.
2. **Before dispatch:** Read the previous task's contract and pass it via `previousOutputContract` parameter (already wired in 13-2).
3. **Sequential flow:** Thread `lastOutputContract` through the flow step loop in `executeWorkflow()`.
4. **Loop blocks:** Thread `lastOutputContract` through the loop iteration in `executeLoopBlock()`.

The contract directory convention is `.codeharness/contracts/` under the project root. This matches the architecture spec and the state directory convention (`.codeharness/workflow-state.yaml`).

**Changed file extraction:** During `driver.dispatch()`, `tool-complete` events with tool names like `Write`, `Edit`, `write_to_file`, `edit_file` etc. indicate file modifications. We extract file paths from these events. This is best-effort — not all drivers emit tool-complete events, and the file path format may vary.

**Graceful degradation:** If `writeOutputContract()` fails (disk error, permissions), the engine logs a warning and continues. The next task simply gets no contract context. This is acceptable because the contract is an optimization (context passing), not a correctness requirement.

### What Already Exists

- `writeOutputContract()` / `readOutputContract()` — `src/lib/agents/output-contract.ts` (story 13-1)
- `buildPromptWithContractContext()` — `src/lib/agents/output-contract.ts` (story 13-2)
- `previousOutputContract` parameter — already on `dispatchTask()` and `dispatchTaskWithResult()` (wired in story 13-2)
- `OutputContract` interface — `src/lib/agents/types.ts` (lines 67-80)
- `DispatchOpts.outputContract` — field already exists in `types.ts` (line 94)
- Contract prompt injection — already wired in `dispatchTaskWithResult()` line 321
- `isTaskCompleted()` / `isLoopTaskCompleted()` — crash recovery already works (skips completed tasks on re-run)
- `warn()` — logging utility imported in `workflow-engine.ts`
- Mock infrastructure — `workflow-engine.test.ts` already mocks `getDriver`, `resolveModel`, `buildPromptWithContractContext`, etc.

### What NOT to Do

- Do NOT modify `output-contract.ts` — the write/read/format functions are complete from stories 13-1 and 13-2.
- Do NOT modify `types.ts` — `OutputContract`, `DispatchOpts`, `AgentDriver` are already defined.
- Do NOT modify any driver files — contract writing is engine-level, not driver-level.
- Do NOT implement test result extraction from driver output — that's a future enhancement. Set `testResults: null`.
- Do NOT implement acceptance criteria extraction — that's a future enhancement. Set `acceptanceCriteria: []`.
- Do NOT abort the workflow on contract write failure — graceful degradation is required (AC #8).
- Do NOT change the `dispatchTask()` public signature more than necessary — callers may depend on it returning `WorkflowState`. Consider returning an object `{ state, contract }` or adding the contract to a separate return path.

### Previous Story Intelligence

From story 13-2 (Output Contract Prompt Injection):
- `buildPromptWithContractContext()` already wired into `dispatchTaskWithResult()` at line 321.
- `previousOutputContract` parameter already exists on both `dispatchTask()` and `dispatchTaskWithResult()`.
- 4526 tests passing across 168 test files, coverage 96.8%.
- `mockBuildPromptWithContractContext` already set up in workflow-engine tests.

From story 13-1 (Output Contract Schema & Serialization):
- `writeOutputContract()` creates directory recursively, writes atomically (.tmp → rename).
- `readOutputContract()` returns `null` when file doesn't exist.
- `assertSafeComponent()` validates taskName/storyId are safe filename components.

### Testing Patterns

Follow existing patterns in `src/lib/__tests__/workflow-engine.test.ts`:
- The test file already mocks all dependencies (driver factory, model resolver, workflow state, etc.).
- Add `mockWriteOutputContract` and `mockReadOutputContract` to the hoisted mocks.
- Mock `writeOutputContract` to capture the written contract for assertions.
- Mock `readOutputContract` to return a test contract when needed.
- For sequential flow tests, verify that `dispatchTask` calls pass the correct `previousOutputContract`.
- For loop block tests, verify contract threading across tasks and iterations.
- For error handling, mock `writeOutputContract` to throw and verify `warn()` is called.

The `mockDriverDispatch` already yields `StreamEvent` objects — extend it to yield `tool-complete` events for Write/Edit to test `changedFiles` extraction.

### Project Structure Notes

Files to CREATE:
- None (all changes go in existing files)

Files to MODIFY:
- `src/lib/workflow-engine.ts` — add contract writing after dispatch, thread contracts through sequential and loop flows, track changedFiles from tool-complete events
- `src/lib/__tests__/workflow-engine.test.ts` — add tests for contract writing, threading, graceful degradation

Files NOT to modify:
- `src/lib/agents/output-contract.ts` — complete from stories 13-1 and 13-2
- `src/lib/agents/types.ts` — OutputContract and DispatchOpts already defined
- Any driver files — contract management is engine-level
- `src/lib/workflow-parser.ts` — output_contract field on tasks is for schema-level config
- `src/lib/workflow-state.ts` — state management is already complete

### References

- [Source: _bmad-output/planning-artifacts/epics-multi-framework.md#Story 4.3: Cross-Framework Workflow Execution]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md — Decision 3: Output Contract Format]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md — Output Contract Population Pattern]
- [Source: _bmad-output/planning-artifacts/epics-multi-framework.md — FR16, FR17, FR19, FR20, NFR18]
- [Source: src/lib/agents/types.ts — OutputContract interface]
- [Source: src/lib/agents/output-contract.ts — writeOutputContract, readOutputContract, buildPromptWithContractContext]
- [Source: src/lib/workflow-engine.ts — dispatchTask(), dispatchTaskWithResult(), executeWorkflow(), executeLoopBlock()]
- [Source: _bmad-output/implementation-artifacts/13-1-output-contract-schema-serialization.md — story 13-1 context]
- [Source: _bmad-output/implementation-artifacts/13-2-output-contract-prompt-injection.md — story 13-2 context]
