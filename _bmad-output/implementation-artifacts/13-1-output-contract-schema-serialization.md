# Story 13.1: Output Contract Schema & Serialization

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want output contracts serialized as JSON files with atomic writes,
so that task results survive crashes and can be read by the next task in a cross-framework workflow.

## Acceptance Criteria

1. **Given** a new `src/lib/agents/output-contract.ts` module
   **When** the module is imported
   **Then** it exports `writeOutputContract(contract: OutputContract, contractDir: string): void` that writes a contract to disk
   **And** it exports `readOutputContract(taskName: string, storyId: string, contractDir: string): OutputContract | null` that reads a contract from disk
   <!-- verification: test-provable -->

2. **Given** a valid `OutputContract` object and a target directory
   **When** `writeOutputContract()` is called
   **Then** the contract is written to `{contractDir}/{taskName}-{storyId}.json`
   **And** the write is atomic: first written to a `.tmp` file, then renamed to the final path
   **And** the `.tmp` file does not remain on disk after a successful write
   <!-- verification: test-provable -->

3. **Given** a contract file exists at `{contractDir}/{taskName}-{storyId}.json`
   **When** `readOutputContract(taskName, storyId, contractDir)` is called
   **Then** the function returns the deserialized `OutputContract` object with all fields intact
   **And** the returned object matches the `OutputContract` interface from `types.ts`
   <!-- verification: test-provable -->

4. **Given** no contract file exists for the given `taskName` and `storyId`
   **When** `readOutputContract()` is called
   **Then** it returns `null` (not an error)
   <!-- verification: test-provable -->

5. **Given** a contract where optional fields (`testResults`, `cost_usd`) are `null`
   **When** `writeOutputContract()` is called and then `readOutputContract()` reads it back
   **Then** the `null` values are preserved (not omitted, not converted to `0` or `undefined`)
   <!-- verification: test-provable -->

6. **Given** a new `src/schemas/output-contract.schema.json` JSON Schema file
   **When** validated against the `OutputContract` interface in `types.ts`
   **Then** the schema defines all required fields: `version`, `taskName`, `storyId`, `driver`, `model`, `timestamp`, `cost_usd`, `duration_ms`, `changedFiles`, `testResults`, `output`, `acceptanceCriteria`
   **And** `cost_usd` allows `number | null`
   **And** `testResults` allows object | null
   **And** `changedFiles` is an array of strings
   **And** `acceptanceCriteria` is an array of objects with `id`, `description`, `status` fields
   **And** `version` is a number (fixed at `1` for initial release)
   <!-- verification: test-provable -->

7. **Given** `writeOutputContract()` is called and the target directory does not exist
   **When** the function executes
   **Then** it creates the directory recursively (like `mkdirSync(dir, { recursive: true })`) before writing
   <!-- verification: test-provable -->

8. **Given** a contract of approximately 1MB in size
   **When** `writeOutputContract()` serializes it and `readOutputContract()` deserializes it
   **Then** the round-trip completes within 1 second (NFR4)
   <!-- verification: test-provable -->

9. **Given** `writeOutputContract()` fails mid-write (e.g., disk error during temp file write)
   **When** the error occurs
   **Then** the function throws an error with a descriptive message including the file path
   **And** no partial final file is left on disk (the `.tmp` file may remain, but the final path is not corrupted)
   <!-- verification: test-provable -->

10. **Given** `npm run build` is executed after all changes
    **When** the build completes
    **Then** it succeeds with zero TypeScript errors
    **And** `npm run test:unit` passes with no regressions in existing test suites
    <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Create `src/schemas/output-contract.schema.json` (AC: #6)
  - [x] Define JSON Schema with `$schema`, `title`, `type: object`, and `required` array listing all 12 fields
  - [x] Define `version` as `{ type: "number" }`
  - [x] Define `taskName`, `storyId`, `driver`, `model`, `timestamp`, `output` as `{ type: "string" }`
  - [x] Define `cost_usd` as `{ type: ["number", "null"] }`
  - [x] Define `duration_ms` as `{ type: "number" }`
  - [x] Define `changedFiles` as `{ type: "array", items: { type: "string" } }`
  - [x] Define `testResults` as `{ oneOf: [{ type: "null" }, { type: "object", properties: { passed: number, failed: number, coverage: ["number", "null"] }, required: [...] }] }`
  - [x] Define `acceptanceCriteria` as `{ type: "array", items: { type: "object", properties: { id: string, description: string, status: string }, required: [...] } }`

- [x] Task 2: Create `src/lib/agents/output-contract.ts` module (AC: #1, #2, #3, #4, #5, #7, #9)
  - [x] Import `writeFileSync`, `readFileSync`, `renameSync`, `mkdirSync`, `existsSync` from `node:fs`
  - [x] Import `join`, `dirname` from `node:path`
  - [x] Import `OutputContract` type from `./types.js`
  - [x] Implement `contractFilePath(taskName: string, storyId: string, contractDir: string): string` helper that returns `join(contractDir, \`\${taskName}-\${storyId}.json\`)`
  - [x] Implement `writeOutputContract(contract: OutputContract, contractDir: string): void`
    - [x] Ensure directory exists: `mkdirSync(contractDir, { recursive: true })`
    - [x] Compute final path from `contractFilePath(contract.taskName, contract.storyId, contractDir)`
    - [x] Compute temp path: `finalPath + '.tmp'`
    - [x] `writeFileSync(tmpPath, JSON.stringify(contract, null, 2) + '\n', 'utf-8')`
    - [x] `renameSync(tmpPath, finalPath)`
    - [x] Wrap in try/catch — on failure, throw with descriptive message including the file path
  - [x] Implement `readOutputContract(taskName: string, storyId: string, contractDir: string): OutputContract | null`
    - [x] Compute path from `contractFilePath(taskName, storyId, contractDir)`
    - [x] If file does not exist (`!existsSync(path)`), return `null`
    - [x] `readFileSync(path, 'utf-8')` → `JSON.parse()` → return as `OutputContract`

- [x] Task 3: Write unit tests (AC: #1-#10)
  - [x] Create `src/lib/agents/__tests__/output-contract.test.ts`
  - [x] Test: `writeOutputContract` creates file at correct path (`{taskName}-{storyId}.json`)
  - [x] Test: `writeOutputContract` uses atomic write (write to `.tmp`, then rename — verify no `.tmp` remains)
  - [x] Test: `readOutputContract` returns the deserialized contract with all fields intact
  - [x] Test: `readOutputContract` returns `null` when file does not exist
  - [x] Test: round-trip preserves `null` values for `cost_usd` and `testResults`
  - [x] Test: `writeOutputContract` creates directory recursively when it does not exist
  - [x] Test: `writeOutputContract` throws descriptive error on write failure
  - [x] Test: round-trip for a ~1MB contract completes within 1 second (NFR4 performance test)
  - [x] Test: JSON Schema in `output-contract.schema.json` validates a correct contract
  - [x] Test: JSON Schema rejects a contract missing required fields

- [x] Task 4: Export from barrel file (AC: #1)
  - [x] Add `writeOutputContract` and `readOutputContract` exports to `src/lib/agents/index.ts`

- [x] Task 5: Verify build and tests (AC: #10)
  - [x] Run `npm run build` — zero TypeScript errors
  - [x] Run `npm run test:unit` — all tests pass, no regressions

## Dev Notes

### Architecture Compliance

This story implements Epic 4, Story 4.1 (mapped to sprint Epic 13, Story 13-1) "Output Contract Schema & Serialization" from `epics-multi-framework.md`. It covers:
- **FR17:** System can serialize a task's output contract to a structured JSON file after task completion
- **NFR4:** Output contract serialization/deserialization must complete within 1 second for contracts up to 1MB
- **NFR10:** Output contract JSON format must be stable across driver versions
- **NFR15:** Output contract files must survive engine crashes — written atomically

Key architecture decisions honored:
- **Decision 3 (Output Contract Format):** JSON files in `.codeharness/contracts/{taskName}-{storyId}.json`. Written atomically (write to `.tmp`, then rename). Version field for format evolution.
- **Output Contract Population Pattern:** Drivers set `changedFiles`, `testResults`, `output`, `cost_usd`. Fields not available are `null`.

### Implementation Strategy

This story creates a standalone module — no modifications to existing files (except the barrel `index.ts`). The workflow engine integration (calling `writeOutputContract` after task dispatch) belongs to story 13-3 (Cross-Framework Workflow Execution).

The module follows the same atomic write pattern used in `src/modules/sprint/state.ts`:
```typescript
writeFileSync(tmpPath, data, 'utf-8');
renameSync(tmpPath, finalPath);
```

### What Already Exists

- `OutputContract` interface — defined in `src/lib/agents/types.ts` (lines 67-80) with all required fields
- `TestResults` interface — defined in `src/lib/agents/types.ts` (lines 49-53)
- `ACStatus` interface — defined in `src/lib/agents/types.ts` (lines 58-62)
- `DispatchOpts.outputContract` — already accepts `OutputContract` for injection into next task
- The `.codeharness/contracts/` directory convention is defined in the architecture but does not yet exist at runtime

### What NOT to Do

- Do NOT modify `types.ts` — `OutputContract`, `TestResults`, `ACStatus` already exist and are correct.
- Do NOT modify `workflow-engine.ts` — engine integration is story 13-3.
- Do NOT modify `workflow-parser.ts` — the `output_contract` field on tasks is for schema-level config, not runtime contract files.
- Do NOT add schema validation at write time — the TypeScript type system is sufficient. Schema is for external tooling and documentation.
- Do NOT use async I/O — the existing codebase uses sync filesystem operations (`writeFileSync`, `renameSync`) for atomic writes. Follow the same pattern for consistency.

### Previous Story Intelligence

From story 12-3 (Driver Health Check at Workflow Start):
- 4488 tests passing across 167 test files.
- `getDriver()` and `healthCheck()` wired into `executeWorkflow()` pre-flight.
- All driver infrastructure (factory, claude-code, codex, opencode) is complete and tested.

From the sprint/state.ts atomic write pattern:
- `writeFileSync` to `.tmp`, then `renameSync` to final path.
- Wrap in try/catch, return `Result<void>` pattern (but this module can throw instead — simpler for this use case).

### Testing Patterns

Follow existing agent test patterns in `src/lib/agents/__tests__/`:
- Use `mkdtempSync` for isolated temp directories per test
- Clean up temp dirs in `afterEach`
- For the 1MB performance test, generate a contract with a large `output` field (~1MB string)
- For atomic write verification, check that no `.tmp` file remains after `writeOutputContract`
- For error testing, use a read-only directory or non-existent deeply nested path

### Project Structure Notes

Files to CREATE:
- `src/schemas/output-contract.schema.json` — JSON Schema for output contract format
- `src/lib/agents/output-contract.ts` — serialize/deserialize module
- `src/lib/agents/__tests__/output-contract.test.ts` — unit tests

Files to MODIFY:
- `src/lib/agents/index.ts` — add barrel exports for `writeOutputContract`, `readOutputContract`

Files NOT to modify:
- `src/lib/agents/types.ts` — OutputContract already defined
- `src/lib/workflow-engine.ts` — integration is story 13-3
- `src/lib/workflow-parser.ts` — output_contract field is separate concern
- Any driver files — drivers are not involved in this story

### References

- [Source: _bmad-output/planning-artifacts/epics-multi-framework.md#Story 4.1: Output Contract Schema & Serialization]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md — Decision 3: Output Contract Format]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md — Output Contract Population Pattern]
- [Source: src/lib/agents/types.ts — OutputContract, TestResults, ACStatus interfaces]
- [Source: src/modules/sprint/state.ts — writeStateAtomic() atomic write pattern]
- [Source: src/lib/agents/index.ts — barrel exports]
- [Source: _bmad-output/implementation-artifacts/12-3-driver-health-check-at-workflow-start.md — previous story context]
