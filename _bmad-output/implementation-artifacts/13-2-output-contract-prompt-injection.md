# Story 13.2: Output Contract Prompt Injection

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the previous task's output contract injected into the next task's prompt,
so that cross-framework tasks have context from the previous step.

## Acceptance Criteria

1. **Given** a new `formatContractAsPromptContext(contract: OutputContract): string` function in `src/lib/agents/output-contract.ts`
   **When** called with a valid `OutputContract`
   **Then** it returns a structured text block containing: changed files list, test results summary, output summary, and AC statuses
   **And** the formatted string is human-readable and parseable by any LLM
   <!-- verification: test-provable -->

2. **Given** a contract with `changedFiles: ["src/api/users.ts", "src/api/users.test.ts"]`
   **When** `formatContractAsPromptContext()` formats it
   **Then** the output contains a "Changed Files" section listing each file
   <!-- verification: test-provable -->

3. **Given** a contract with `testResults: { passed: 12, failed: 0, coverage: 98.5 }`
   **When** `formatContractAsPromptContext()` formats it
   **Then** the output contains a "Test Results" section with passed, failed, and coverage values
   <!-- verification: test-provable -->

4. **Given** a contract with `testResults: null`
   **When** `formatContractAsPromptContext()` formats it
   **Then** the "Test Results" section shows "No test results available" (not an error, not omitted)
   <!-- verification: test-provable -->

5. **Given** a contract with `acceptanceCriteria: [{ id: "AC1", description: "User can register", status: "implemented" }]`
   **When** `formatContractAsPromptContext()` formats it
   **Then** the output contains an "Acceptance Criteria" section listing each AC with its id, description, and status
   <!-- verification: test-provable -->

6. **Given** a contract with an empty `changedFiles` array and `null` testResults
   **When** `formatContractAsPromptContext()` formats it
   **Then** it still returns a valid string (no crashes on empty/null fields)
   **And** sections for empty data indicate "none" or similar, not blank
   <!-- verification: test-provable -->

7. **Given** `formatContractAsPromptContext()` returns a formatted string
   **When** the string is examined
   **Then** it includes the task name, driver, model, cost, and duration from the contract as a context header
   <!-- verification: test-provable -->

8. **Given** a new `buildPromptWithContractContext(basePrompt: string, previousContract: OutputContract | null): string` function in `src/lib/agents/output-contract.ts`
   **When** called with a non-null `previousContract`
   **Then** it returns `basePrompt` followed by a separator and the formatted contract context
   **And** the separator clearly delineates the original prompt from the injected context
   <!-- verification: test-provable -->

9. **Given** `buildPromptWithContractContext()` is called with `previousContract: null`
   **When** no previous contract exists (first task in workflow)
   **Then** it returns the `basePrompt` unchanged (no injection, no separator)
   <!-- verification: test-provable -->

10. **Given** the workflow engine in `src/lib/workflow-engine.ts` dispatches a task
    **When** `DispatchOpts` is constructed and the task has a non-null `outputContract` field
    **Then** the engine uses `buildPromptWithContractContext()` to prepend/append contract context to the prompt
    **And** the injection works regardless of which driver is used (claude-code, codex, opencode)
    <!-- verification: test-provable -->

11. **Given** the `formatContractAsPromptContext()` output
    **When** the output is measured
    **Then** the `output` field from the contract is truncated to at most 2000 characters to avoid prompt bloat
    **And** truncation is indicated with a `[truncated]` marker
    <!-- verification: test-provable -->

12. **Given** `npm run build` is executed after all changes
    **When** the build completes
    **Then** it succeeds with zero TypeScript errors
    **And** `npm run test:unit` passes with no regressions in existing test suites
    <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Implement `formatContractAsPromptContext()` in `src/lib/agents/output-contract.ts` (AC: #1, #2, #3, #4, #5, #6, #7, #11)
  - [x] Add function signature: `export function formatContractAsPromptContext(contract: OutputContract): string`
  - [x] Format header section: task name, driver, model, cost, duration, timestamp
  - [x] Format "Changed Files" section: list files or "None"
  - [x] Format "Test Results" section: passed/failed/coverage or "No test results available"
  - [x] Format "Output Summary" section: truncate `contract.output` to 2000 chars with `[truncated]` marker
  - [x] Format "Acceptance Criteria" section: list each AC with id, description, status
  - [x] Return the assembled string

- [x] Task 2: Implement `buildPromptWithContractContext()` in `src/lib/agents/output-contract.ts` (AC: #8, #9)
  - [x] Add function signature: `export function buildPromptWithContractContext(basePrompt: string, previousContract: OutputContract | null): string`
  - [x] If `previousContract` is `null`, return `basePrompt` unchanged
  - [x] Otherwise, call `formatContractAsPromptContext(previousContract)` and append to `basePrompt` with a clear separator (e.g., `\n\n---\n\n## Previous Task Context\n\n`)

- [x] Task 3: Wire injection into workflow engine (AC: #10)
  - [x] In `src/lib/workflow-engine.ts`, in the `dispatchTaskWithResult()` function
  - [x] Before constructing `DispatchOpts`, check if `opts.outputContract` (or a passed-in previous contract) exists
  - [x] Use `buildPromptWithContractContext(prompt, previousContract)` to build the final prompt
  - [x] Pass the enriched prompt in `DispatchOpts.prompt` — this is framework-agnostic since all drivers consume the prompt field

- [x] Task 4: Update barrel exports in `src/lib/agents/index.ts` (AC: #1)
  - [x] Add `formatContractAsPromptContext` and `buildPromptWithContractContext` to exports

- [x] Task 5: Write unit tests (AC: #1-#12)
  - [x] Create or extend `src/lib/agents/__tests__/output-contract.test.ts`
  - [x] Test: `formatContractAsPromptContext` produces sections for changed files, test results, AC statuses, output summary, header
  - [x] Test: `formatContractAsPromptContext` handles `null` testResults gracefully
  - [x] Test: `formatContractAsPromptContext` handles empty changedFiles array
  - [x] Test: `formatContractAsPromptContext` truncates output field > 2000 chars and appends `[truncated]`
  - [x] Test: `formatContractAsPromptContext` does NOT truncate output field <= 2000 chars
  - [x] Test: `buildPromptWithContractContext` returns basePrompt unchanged when contract is `null`
  - [x] Test: `buildPromptWithContractContext` appends formatted context with separator when contract is provided
  - [x] Test: round-trip — build prompt with contract, verify all key fields appear in the result

- [x] Task 6: Verify build and tests (AC: #12)
  - [x] Run `npm run build` — zero TypeScript errors
  - [x] Run `npm run test:unit` — all tests pass, no regressions

## Dev Notes

### Architecture Compliance

This story implements Epic 4, Story 4.2 (mapped to sprint Epic 13, Story 13-2) "Output Contract Prompt Injection" from `epics-multi-framework.md`. It covers:
- **FR18:** System can load a previous task's output contract and inject it as context into the next task's prompt
- **FR19:** System can pass acceptance criteria, changed file lists, and test results across framework boundaries via output contracts
- **Architecture Decision 3:** "Injection: Workflow engine reads contract, appends structured summary to next task's prompt as context."

### Implementation Strategy

The injection is **prompt-level**, not driver-level. The contract context is formatted as a structured text block and appended to the `prompt` string in `DispatchOpts`. This makes it framework-agnostic — all three drivers (claude-code, codex, opencode) already consume `DispatchOpts.prompt`.

Key insight: Do NOT use `appendSystemPrompt` for contract injection. That field is only supported by the claude-code driver (via Agent SDK). Instead, modify the `prompt` field directly, which all drivers handle. The `appendSystemPrompt` field continues to be used only for trace ID injection.

The workflow engine already has a `dispatchTaskWithResult()` function that constructs the prompt and DispatchOpts. The integration point is there — call `buildPromptWithContractContext()` to enrich the prompt before constructing DispatchOpts.

### What Already Exists

- `OutputContract` interface — `src/lib/agents/types.ts` (lines 67-80), all fields defined
- `writeOutputContract()` / `readOutputContract()` — `src/lib/agents/output-contract.ts`, from story 13-1
- `DispatchOpts.outputContract` — field already exists in `types.ts` (line 94), type `OutputContract | undefined`
- `DispatchOpts.prompt` — the primary prompt field consumed by all drivers
- `dispatchTaskWithResult()` — `src/lib/workflow-engine.ts` (line 271+), constructs DispatchOpts and dispatches
- Barrel exports — `src/lib/agents/index.ts` already exports `writeOutputContract` and `readOutputContract`

### What NOT to Do

- Do NOT use `appendSystemPrompt` for contract injection — only claude-code supports it. Use `prompt` field for universal compatibility.
- Do NOT modify any driver files — injection is prompt-level, not driver-level.
- Do NOT validate the contract schema at injection time — trust the typed contract from `readOutputContract()`.
- Do NOT include the entire `output` field untruncated — large outputs bloat the prompt. Truncate to 2000 chars.
- Do NOT modify `types.ts` — `OutputContract` and `DispatchOpts.outputContract` already exist.
- Do NOT wire `readOutputContract()` into the engine in this story — that's story 13-3 (Cross-Framework Workflow Execution). This story only adds the formatting and prompt-building functions, plus the engine call site that uses a passed-in contract.

### Previous Story Intelligence

From story 13-1 (Output Contract Schema & Serialization):
- `output-contract.ts` uses sync I/O (`writeFileSync`, `readFileSync`, `renameSync`) — follow the same pattern for consistency.
- Tests in `src/lib/agents/__tests__/output-contract.test.ts` use `mkdtempSync` for isolated temp dirs.
- The `contractFilePath()` helper validates safe filenames — no path traversal.
- The atomic write pattern: write to `.tmp`, then `renameSync` to final path.
- `assertSafeComponent()` validates taskName/storyId are safe filename components.

From story 12-3 (Driver Health Check at Workflow Start):
- ~4488 tests passing across 167 test files.
- All driver infrastructure (factory, claude-code, codex, opencode) is complete and tested.

### Testing Patterns

Follow existing patterns in `src/lib/agents/__tests__/output-contract.test.ts`:
- Tests already exist for `writeOutputContract` and `readOutputContract` — add new describe blocks for the new functions.
- Create a fixture `OutputContract` object and reuse it across tests.
- For truncation testing, create a contract with an `output` field > 2000 characters and verify the formatted output contains `[truncated]`.
- For the `buildPromptWithContractContext` tests, verify that `null` contract returns the base prompt unchanged.

### Project Structure Notes

Files to CREATE:
- None (all changes go in existing files)

Files to MODIFY:
- `src/lib/agents/output-contract.ts` — add `formatContractAsPromptContext()` and `buildPromptWithContractContext()`
- `src/lib/agents/index.ts` — add barrel exports for the two new functions
- `src/lib/workflow-engine.ts` — wire `buildPromptWithContractContext()` into `dispatchTaskWithResult()`
- `src/lib/agents/__tests__/output-contract.test.ts` — add tests for new functions

Files NOT to modify:
- `src/lib/agents/types.ts` — OutputContract and DispatchOpts already defined
- Any driver files (`claude-code.ts`, `codex.ts`, `opencode.ts`) — injection is prompt-level
- `src/lib/workflow-parser.ts` — output_contract field is separate concern

### References

- [Source: _bmad-output/planning-artifacts/epics-multi-framework.md#Story 4.2: Output Contract Prompt Injection]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md — Decision 3: Output Contract Format — Injection]
- [Source: _bmad-output/planning-artifacts/prd.md — FR18, FR19]
- [Source: src/lib/agents/types.ts — OutputContract, DispatchOpts interfaces]
- [Source: src/lib/agents/output-contract.ts — writeOutputContract, readOutputContract from story 13-1]
- [Source: src/lib/workflow-engine.ts — dispatchTaskWithResult(), lines 271+]
- [Source: src/lib/agents/index.ts — barrel exports]
- [Source: _bmad-output/implementation-artifacts/13-1-output-contract-schema-serialization.md — previous story context]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/13-2-output-contract-prompt-injection-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/13-2-output-contract-prompt-injection.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

N/A

### Completion Notes List

- Implemented `formatContractAsPromptContext()` — formats OutputContract as structured markdown sections (header, changed files, test results, output summary, acceptance criteria)
- Implemented `buildPromptWithContractContext()` — appends formatted contract context to base prompt with separator, or returns base prompt unchanged when contract is null
- Wired injection into `dispatchTaskWithResult()` via optional `previousOutputContract` parameter — story 13-3 will supply the actual contract
- Added 12 new unit tests covering all ACs; total test count 4523, all passing
- Output truncation at 2000 chars with `[truncated]` marker confirmed via tests

### Code Review Fixes (Adversarial Review)

- **MEDIUM fix:** Exposed `previousOutputContract` parameter on public `dispatchTask()` API so story 13-3 can pass contracts through the public interface (was only on internal `dispatchTaskWithResult()`)
- **MEDIUM fix:** Added 2001-char boundary test for output truncation edge case
- **MEDIUM fix:** Added `buildPromptWithContractContext` mock to workflow-engine tests, added 2 integration tests verifying contract injection flows through `dispatchTask()` to the driver
- Post-review test count: 4526 (168 files), coverage: 96.8%, all files above 80% per-file floor

### File List

- `src/lib/agents/output-contract.ts` — added `formatContractAsPromptContext()` and `buildPromptWithContractContext()`
- `src/lib/agents/index.ts` — added barrel exports for new functions
- `src/lib/workflow-engine.ts` — imported `buildPromptWithContractContext` and `OutputContract`, added `previousOutputContract` parameter to both `dispatchTask()` and `dispatchTaskWithResult()`, wired prompt injection
- `src/lib/agents/__tests__/output-contract.test.ts` — added 13 tests for new functions (12 original + 1 boundary)
- `src/lib/__tests__/workflow-engine.test.ts` — added mock for `buildPromptWithContractContext`, added 2 integration tests for contract injection via `dispatchTask()`
