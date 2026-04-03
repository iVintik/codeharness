# Story 10.2: Driver Factory & Registry

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want a driver factory that registers and resolves drivers by name,
so that the workflow engine can get any driver instance without knowing its implementation class.

## Acceptance Criteria

1. **Given** a new file `src/lib/agents/drivers/factory.ts`
   **When** inspected
   **Then** it exports a `registerDriver(driver: AgentDriver): void` function that stores drivers by `driver.name`
   **And** calling `registerDriver` with a driver whose name is already registered throws an error with the message containing the duplicate name
   <!-- verification: test-provable -->

2. **Given** the factory module
   **When** `getDriver('claude-code')` is called after a driver named `'claude-code'` has been registered
   **Then** it returns the registered `AgentDriver` instance (same reference)
   <!-- verification: test-provable -->

3. **Given** the factory module
   **When** `getDriver('unknown')` is called with a name that has no registered driver
   **Then** it throws an error whose message includes the unknown name and lists all currently registered driver names
   <!-- verification: test-provable -->

4. **Given** the factory module
   **When** `listDrivers()` is called
   **Then** it returns an array of all registered driver names as strings
   **And** the array is a copy (mutating it does not affect the registry)
   <!-- verification: test-provable -->

5. **Given** the factory module
   **When** `resetDrivers()` is called
   **Then** all registered drivers are cleared
   **And** subsequent `getDriver()` calls throw, and `listDrivers()` returns an empty array
   **And** `resetDrivers` is exported (needed for test isolation)
   <!-- verification: test-provable -->

6. **Given** drivers are registered explicitly via `registerDriver()`
   **When** the factory module is loaded
   **Then** there is NO auto-discovery of driver files (no dynamic `import()`, no directory scanning, no glob-based loading)
   **And** the factory module has no filesystem access at import time
   <!-- verification: test-provable -->

7. **Given** the barrel file `src/lib/agents/index.ts`
   **When** inspected
   **Then** it re-exports `getDriver`, `registerDriver`, `listDrivers`, and `resetDrivers` from `./drivers/factory.js`
   **And** the old `getDriver()` stub function that throws "No agent drivers available" is removed
   <!-- verification: test-provable -->

8. **Given** the `src/lib/agents/drivers/` directory
   **When** inspected
   **Then** it contains at least `factory.ts` and an `index.ts` barrel file
   **And** the barrel re-exports all public symbols from `factory.ts`
   <!-- verification: test-provable -->

9. **Given** unit tests in `src/lib/agents/__tests__/factory.test.ts`
   **When** `npm run test:unit` is executed
   **Then** tests cover: register and retrieve a driver, retrieve unknown name throws with helpful message, duplicate registration throws, `listDrivers()` returns registered names, `listDrivers()` returns a copy, `resetDrivers()` clears all drivers, factory has no auto-discovery behavior
   <!-- verification: test-provable -->

10. **Given** `npm run build` is executed
    **When** the build completes
    **Then** it succeeds with zero TypeScript errors
    **And** `npm run test:unit` passes with no regressions in existing test suites
    <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Create `src/lib/agents/drivers/` directory structure (AC: #8)
  - [x] Create `src/lib/agents/drivers/factory.ts`
  - [x] Create `src/lib/agents/drivers/index.ts` barrel file

- [x] Task 2: Implement the driver registry in `factory.ts` (AC: #1, #2, #3, #4, #5, #6)
  - [x] Implement `registerDriver(driver: AgentDriver): void` — stores by `driver.name`, throws on duplicate
  - [x] Implement `getDriver(name: string): AgentDriver` — returns instance, throws with helpful error listing all registered names if not found
  - [x] Implement `listDrivers(): string[]` — returns copy of registered names
  - [x] Implement `resetDrivers(): void` — clears registry (for test isolation)
  - [x] Use a plain `Map<string, AgentDriver>` — no dynamic imports, no filesystem scanning

- [x] Task 3: Create `src/lib/agents/drivers/index.ts` barrel (AC: #8)
  - [x] Re-export `getDriver`, `registerDriver`, `listDrivers`, `resetDrivers` from `./factory.js`

- [x] Task 4: Update `src/lib/agents/index.ts` barrel (AC: #7)
  - [x] Remove the old `getDriver()` stub function
  - [x] Re-export `getDriver`, `registerDriver`, `listDrivers`, `resetDrivers` from `./drivers/factory.js`

- [x] Task 5: Write unit tests in `src/lib/agents/__tests__/factory.test.ts` (AC: #9, #10)
  - [x] Test: register a mock driver and retrieve it by name
  - [x] Test: `getDriver('nonexistent')` throws with the name and lists registered drivers
  - [x] Test: duplicate `registerDriver()` throws with the duplicate name
  - [x] Test: `listDrivers()` returns all registered names
  - [x] Test: `listDrivers()` returns a copy (push to result does not affect registry)
  - [x] Test: `resetDrivers()` clears all registrations
  - [x] Test: factory module source has no `import()`, `readdir`, `glob`, or `require()` calls (grep the file)
  - [x] Verify `npm run build` passes with zero errors
  - [x] Verify `npm run test:unit` passes with no regressions

## Dev Notes

### Architecture Compliance

This story implements the **Driver Factory Pattern** from `_bmad-output/planning-artifacts/architecture-multi-framework.md` (Project Structure & Boundaries section). Key constraints:

- **Explicit registration, no auto-discovery** — the architecture mandates "Register in `factory.ts` — never auto-discover". Drivers are registered by calling `registerDriver()` at application bootstrap, not by scanning the filesystem.
- **Factory is a module singleton** — uses module-level `Map`, not a class instance. Import from anywhere, get the same registry.
- **Factory knows nothing about drivers** — it stores `AgentDriver` instances by name. It does not import `ClaudeCodeDriver`, `CodexDriver`, etc. Those are registered externally (by the bootstrap/entry point, implemented in story 10-5).

### Existing Code to Modify

1. **`src/lib/agents/index.ts`** — Remove the old `getDriver()` stub that throws "No agent drivers available". Replace with re-export from `./drivers/factory.js`. The old stub will no longer be needed once the factory is in place.

### What NOT to Do

- Do NOT create driver implementation files (`claude-code.ts`, `codex.ts`, `opencode.ts`) — those are stories 10-3, 12-1, 12-2
- Do NOT register any drivers in the factory module itself — registration happens at bootstrap (story 10-5)
- Do NOT import any driver classes in `factory.ts` — it only depends on the `AgentDriver` interface type
- Do NOT modify `workflow-engine.ts` or `agent-dispatch.ts` — integration comes in story 10-5
- Do NOT create a `model-resolver.ts` — that is story 10-4
- Do NOT add filesystem operations (`fs`, `path.glob`, dynamic `import()`) to `factory.ts`

### Dependencies

- **Story 10-1 (done):** `AgentDriver` interface in `src/lib/agents/types.ts` — this story imports the interface type for the registry's type constraint
- **Stories 10-3, 12-1, 12-2 (future):** Driver implementations that will call `registerDriver()` to register themselves
- **Story 10-5 (future):** Workflow engine integration that will call `getDriver()` to resolve drivers at dispatch time

### Testing Patterns

- Follow existing Vitest patterns in `src/lib/agents/__tests__/`
- Create mock `AgentDriver` implementations for testing (minimal objects satisfying the interface)
- Use `beforeEach(() => resetDrivers())` to ensure test isolation
- Test the "no auto-discovery" AC by grepping `factory.ts` source for forbidden patterns (`import(`, `readdir`, `glob`, `require(`)
- Use `describe/it/expect` structure consistent with existing test files

### Implementation Notes

- The `Map<string, AgentDriver>` is the entire data structure. No WeakMap, no class, no dependency injection.
- `getDriver()` error message should be actionable: `"Driver 'codex' not found. Registered drivers: claude-code, opencode"` — this helps users debug workflow YAML misconfiguration.
- `listDrivers()` must return a copy (`[...map.keys()]`) to prevent registry mutation via the returned array.

### References

- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md — "Register in factory.ts — never auto-discover"]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md — Project Structure: `drivers/factory.ts`]
- [Source: _bmad-output/planning-artifacts/epics-multi-framework.md — Story 1.2: Driver Factory & Registry]
- [Source: src/lib/agents/types.ts — AgentDriver interface (story 10-1)]
- [Source: src/lib/agents/index.ts — old getDriver() stub to replace]
