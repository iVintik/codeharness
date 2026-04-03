# Story 10.4: Model Resolution Module

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want a model resolver that cascades task → agent → driver defaults,
so that the effective model for any task dispatch is deterministic and the workflow engine can resolve the correct model without hardcoding knowledge of the resolution chain.

## Acceptance Criteria

1. **Given** a new file `src/lib/agents/model-resolver.ts`
   **When** the file is inspected
   **Then** it exports a `resolveModel` function with signature `resolveModel(task: { model?: string }, agent: { model?: string }, driver: { defaultModel: string }) → string`
   **And** the function is a pure function with no side effects
   <!-- verification: test-provable -->

2. **Given** a task with `model: 'claude-opus-4-20250514'`, an agent with `model: 'claude-sonnet-4-20250514'`, and a driver with `defaultModel: 'claude-haiku-3-20250514'`
   **When** `resolveModel(task, agent, driver)` is called
   **Then** it returns `'claude-opus-4-20250514'` (task-level wins)
   <!-- verification: test-provable -->

3. **Given** a task with no `model` field, an agent with `model: 'claude-sonnet-4-20250514'`, and a driver with `defaultModel: 'claude-haiku-3-20250514'`
   **When** `resolveModel(task, agent, driver)` is called
   **Then** it returns `'claude-sonnet-4-20250514'` (agent-level fallback)
   <!-- verification: test-provable -->

4. **Given** a task with no `model` field, an agent with no `model` field, and a driver with `defaultModel: 'claude-sonnet-4-20250514'`
   **When** `resolveModel(task, agent, driver)` is called
   **Then** it returns `'claude-sonnet-4-20250514'` (driver default fallback)
   <!-- verification: test-provable -->

5. **Given** a task with `model: undefined`, an agent with `model: undefined`, and a driver with `defaultModel: 'codex-mini'`
   **When** `resolveModel(task, agent, driver)` is called
   **Then** it returns `'codex-mini'`
   **And** this proves backward compatibility — existing workflows without model fields resolve to the driver default
   <!-- verification: test-provable -->

6. **Given** a task with `model: ''` (empty string), an agent with `model: 'claude-sonnet-4-20250514'`
   **When** `resolveModel(task, agent, driver)` is called
   **Then** the empty string is treated as "not set" and falls through to the agent model
   **And** the function returns `'claude-sonnet-4-20250514'`
   <!-- verification: test-provable -->

7. **Given** the `resolveModel` function
   **When** called with `driver.defaultModel` as an empty string
   **Then** it throws an error with a descriptive message indicating the driver has no default model
   **And** this is the only case where `resolveModel` throws
   <!-- verification: test-provable -->

8. **Given** the module `src/lib/agents/model-resolver.ts`
   **When** `src/lib/agents/index.ts` barrel is inspected
   **Then** `resolveModel` is re-exported from the barrel
   <!-- verification: test-provable -->

9. **Given** unit tests in `src/lib/agents/__tests__/model-resolver.test.ts`
   **When** `npm run test:unit` is executed
   **Then** tests cover all 3 cascade levels (task wins, agent fallback, driver fallback)
   **And** tests cover edge cases: empty strings treated as unset, undefined fields, null fields
   **And** tests cover the driver-default-empty-string error case
   **And** tests verify the return type is `string`
   <!-- verification: test-provable -->

10. **Given** `npm run build` is executed
    **When** the build completes
    **Then** it succeeds with zero TypeScript errors
    **And** `npm run test:unit` passes with no regressions in existing test suites
    <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Create `src/lib/agents/model-resolver.ts` (AC: #1, #2, #3, #4, #5, #6, #7)
  - [x] Implement `resolveModel(task, agent, driver)` with 3-level cascade
  - [x] Treat empty strings as "not set" (fall through)
  - [x] Treat `null` and `undefined` as "not set" (fall through)
  - [x] Throw descriptive error if driver.defaultModel is empty/falsy (last resort must be valid)
  - [x] Export the function as a named export

- [x] Task 2: Update barrel exports in `src/lib/agents/index.ts` (AC: #8)
  - [x] Re-export `resolveModel` from `./model-resolver.js`

- [x] Task 3: Create unit tests in `src/lib/agents/__tests__/model-resolver.test.ts` (AC: #9, #10)
  - [x] Test: task model takes highest priority
  - [x] Test: agent model used when task has no model
  - [x] Test: driver default used when neither task nor agent specify one
  - [x] Test: empty string treated as unset at task level
  - [x] Test: empty string treated as unset at agent level
  - [x] Test: undefined fields fall through correctly
  - [x] Test: null fields fall through correctly
  - [x] Test: driver default empty string throws error
  - [x] Test: return type is always string
  - [x] Verify `npm run build` succeeds
  - [x] Verify `npm run test:unit` passes with no regressions

## Dev Notes

### Architecture Compliance

This story implements **Decision 4: Model Resolution** from `_bmad-output/planning-artifacts/architecture-multi-framework.md`. Key quote:

> **Resolution order:**
> 1. Task-level `model` in workflow YAML (highest priority)
> 2. Agent-level `model` in agent YAML
> 3. Driver default model (hard-coded per driver)
>
> **Implementation:** `resolveModel(task, agent, driver) → task.model ?? agent.model ?? driver.defaultModel`

The architecture specifies a simple nullish coalescing chain. However, the implementation must also handle empty strings as "not set" because YAML parsers may produce `""` for omitted fields, and this is a defensive best practice for config resolution.

### Current State of the Codebase

- **Agent configs (`ResolvedAgent` in `agent-resolver.ts`)** do NOT currently have a `model` field. The `SubagentDefinition` gets a hardcoded `DEFAULT_MODEL = 'claude-sonnet-4-20250514'` in `compileSubagentDefinition()`. The model resolver does NOT modify `ResolvedAgent` — that will happen when the workflow schema is extended (story 11-1).
- **Workflow tasks** do NOT currently have a `model` field in `workflow.schema.json`. That will be added in story 11-1 (Workflow Schema Extension).
- **Driver `defaultModel`** is already defined on the `AgentDriver` interface (story 10-1) and implemented on `ClaudeCodeDriver` (story 10-3) as `'claude-sonnet-4-20250514'`.

The model resolver must accept loose input types (`{ model?: string }`) so it can work with both current configs (no model field) and future configs (model field added in stories 11-1+).

### Input Type Design

The function parameters use structural typing (not imported interfaces) to avoid coupling to specific config shapes:

```typescript
export function resolveModel(
  task: { model?: string | null },
  agent: { model?: string | null },
  driver: { defaultModel: string },
): string
```

This means any object with an optional `model` field works — `ResolvedAgent`, parsed workflow task, or a plain object in tests. The driver parameter requires `defaultModel` because every `AgentDriver` has it.

### What NOT to Do

- Do NOT modify `agent-resolver.ts` — agent model field comes later (story 11-1)
- Do NOT modify `workflow.schema.json` — task model/driver fields come later (story 11-1)
- Do NOT modify `workflow-engine.ts` — integration comes in story 10-5
- Do NOT modify `ClaudeCodeDriver` or `factory.ts` — they are already done
- Do NOT add a `model` field to `ResolvedAgent` — that's story 11-1's job

### Driver Default Models (for reference)

From the architecture document:
- `claude-code`: `claude-sonnet-4-20250514`
- `codex`: `codex-mini`
- `opencode`: inherits from OpenCode's own config

### Testing Patterns

- Follow existing Vitest patterns in `src/lib/agents/__tests__/`
- Pure function tests — no mocking needed, no async, no filesystem
- Use `describe/it/expect` structure
- Each cascade level gets its own test case
- Edge cases (empty string, null, undefined) get explicit tests

### References

- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md#Decision 4: Model Resolution]
- [Source: _bmad-output/planning-artifacts/epics-multi-framework.md#Story 1.4: Model Resolution Module]
- [Source: src/lib/agents/types.ts — AgentDriver.defaultModel]
- [Source: src/lib/agents/drivers/claude-code.ts — ClaudeCodeDriver.defaultModel]
- [Source: src/lib/agent-resolver.ts — current DEFAULT_MODEL hardcoding]
