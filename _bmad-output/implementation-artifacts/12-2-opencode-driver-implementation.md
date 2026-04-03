# Story 12.2: OpenCode Driver Implementation

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to run tasks on OpenCode by setting `driver: opencode` in my workflow YAML,
so that I can use OpenCode's multi-model support for any task alongside other frameworks.

## Acceptance Criteria

1. **Given** a new `src/lib/agents/drivers/opencode.ts` file
   **When** inspected
   **Then** `OpenCodeDriver` implements the `AgentDriver` interface with `name = 'opencode'`, `defaultModel = 'default'` (inherits from OpenCode's own config), and `capabilities` including `supportsPlugins: true`, `supportsStreaming: true`, `costReporting: true`
   **And** the class structure matches `CodexDriver` (one file per driver, named export, stateless between dispatches except `lastCost`)
   <!-- verification: test-provable -->

2. **Given** `OpenCodeDriver.dispatch(opts)` is called with a valid prompt
   **When** the driver executes
   **Then** it spawns `opencode` CLI via `child_process.spawn` with `stdio: ['ignore', 'pipe', 'pipe']`
   **And** stdout is parsed line-by-line into `StreamEvent` objects
   **And** unparseable lines are logged at debug level and skipped (never thrown, never yielded as malformed events)
   **And** a `result` event is always yielded at the end, even on error
   <!-- verification: test-provable -->

3. **Given** the OpenCode CLI reports cost in its output
   **When** `dispatch()` completes
   **Then** `cost_usd` is captured from CLI output and set on the final `result` event
   **And** `getLastCost()` returns the same value
   **And** if the CLI does not report cost, `cost_usd` is set to `null` (not 0, not undefined)
   <!-- verification: test-provable -->

4. **Given** the OpenCode CLI exits with a non-zero exit code or outputs an error
   **When** the error is classified
   **Then** the driver maps it to one of the standard `ErrorCategory` values: `RATE_LIMIT`, `NETWORK`, `AUTH`, `TIMEOUT`, `UNKNOWN`
   **And** classification follows the documented priority order (429/rate limit -> RATE_LIMIT, network codes -> NETWORK, 401/403/unauthorized -> AUTH, timeout -> TIMEOUT, else -> UNKNOWN)
   **And** no new error categories are invented
   <!-- verification: test-provable -->

5. **Given** `OpenCodeDriver.healthCheck()` is called
   **When** the `opencode` binary is installed on PATH
   **Then** it returns `{ available: true, authenticated: <auth_status>, version: <version_string> }`
   **And** when the binary is NOT on PATH, it returns `{ available: false, authenticated: false, version: null, error: "opencode not found. Install: https://opencode.ai" }`
   <!-- verification: test-provable -->

6. **Given** `dispatch()` receives `opts.timeout` with a value
   **When** the OpenCode CLI process runs longer than the timeout
   **Then** the process is killed
   **And** a `result` event with `errorCategory: 'TIMEOUT'` is yielded
   <!-- verification: test-provable -->

7. **Given** `dispatch()` receives `opts.plugins` with values
   **When** the driver processes the plugins array
   **Then** it passes each plugin via `--plugin` flag to the OpenCode CLI
   **And** dispatch proceeds with plugins included in the CLI args
   <!-- verification: test-provable -->

8. **Given** `dispatch()` produces `StreamEvent` objects
   **When** the sequence is inspected
   **Then** events follow the required ordering: zero or more `tool-start` -> `tool-input` -> `tool-complete` sequences, zero or more `text` events interleaved, zero or more `retry` events, and exactly one `result` event at the end
   <!-- verification: test-provable -->

9. **Given** `OpenCodeDriver` is exported from `src/lib/agents/drivers/opencode.ts`
   **When** `src/lib/agents/drivers/index.ts` is inspected
   **Then** it re-exports `OpenCodeDriver` alongside existing exports
   **And** `factory.ts` provides the registration mechanism (the engine calls `registerDriver(new OpenCodeDriver())` at startup)
   <!-- verification: test-provable -->

10. **Given** fixture files in `test/fixtures/drivers/opencode/`
    **When** unit tests run
    **Then** tests cover: successful dispatch with event ordering, error classification for each category, health check with binary found, health check with binary missing, timeout termination, plugins pass-through, cost capture, cost null when absent, unparseable line handling
    <!-- verification: test-provable -->

11. **Given** `npm run build` is executed after all changes
    **When** the build completes
    **Then** it succeeds with zero TypeScript errors
    **And** `npm run test:unit` passes with no regressions in existing test suites
    <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Create OpenCode CLI output fixtures (AC: #10)
  - [x] Create `test/fixtures/drivers/opencode/` directory
  - [x] Add `success.txt` — sample successful OpenCode CLI output (text-based or NDJSON lines representing tool use, text output, and result with cost)
  - [x] Add `error-rate-limit.txt` — sample output when rate-limited
  - [x] Add `error-auth.txt` — sample output when authentication fails
  - [x] Add `error-network.txt` — sample output for network failures
  - [x] Add `unparseable.txt` — sample output with lines that don't match any known format
  - [x] NOTE: OpenCode CLI output format is not publicly documented. Create plausible fixtures based on typical CLI agent output patterns. Actual format will need refinement against real CLI output. OpenCode is Go-based — output may differ from Node.js CLIs.

- [x] Task 2: Create `src/lib/agents/drivers/opencode.ts` (AC: #1, #2, #3, #4, #6, #7, #8)
  - [x] Implement `OpenCodeDriver` class implementing `AgentDriver` interface
  - [x] Set `name = 'opencode'`, `defaultModel = 'default'`, `capabilities = { supportsPlugins: true, supportsStreaming: true, costReporting: true }`
  - [x] Implement `parseLine(line: string): StreamEvent | null` — parse one stdout line into a StreamEvent or null
  - [x] Implement `classifyError(err: unknown): ErrorCategory` — reuse the same classification priority order from `codex.ts` (identical logic)
  - [x] Implement `dispatch(opts: DispatchOpts): AsyncGenerator<StreamEvent>` using `child_process.spawn('opencode', [...args], { stdio: ['ignore', 'pipe', 'pipe'] })`
  - [x] Build CLI args from `opts`: `--model`, `--cwd`, `--plugin` (per plugin in opts.plugins), prompt as positional or via stdin
  - [x] Parse stdout line-by-line via `readline.createInterface`
  - [x] Log unparseable lines at debug level, skip them
  - [x] Handle process `close` event for crash detection
  - [x] Implement timeout via `setTimeout` + `proc.kill()`
  - [x] Pass `opts.plugins` as `--plugin <name>` flags (unlike Codex which warns and ignores)
  - [x] Guarantee `result` event is always yielded (even on error)
  - [x] Implement `healthCheck(): Promise<DriverHealth>` — (1) `which opencode`, (2) `opencode --version`, (3) optional auth check
  - [x] Implement `getLastCost(): number | null`

- [x] Task 3: Update barrel export in `src/lib/agents/drivers/index.ts` (AC: #9)
  - [x] Add `export { OpenCodeDriver } from './opencode.js';`

- [x] Task 4: Write unit tests `src/lib/agents/__tests__/opencode-driver.test.ts` (AC: #10, #11)
  - [x] Mock `child_process.spawn` and `child_process.execFile` via `vi.mock`
  - [x] Helper: `makeOpts(overrides)` for creating DispatchOpts
  - [x] Helper: `collectEvents(iterable)` for gathering all events
  - [x] Helper: `createMockProcess(stdoutLines, exitCode, stderrData)` — same pattern as `codex-driver.test.ts`
  - [x] Test: successful dispatch produces correct StreamEvent sequence from fixture
  - [x] Test: result event is always present at end
  - [x] Test: cost captured from CLI output
  - [x] Test: cost is null when CLI doesn't report it
  - [x] Test: error classification for RATE_LIMIT, NETWORK, AUTH, TIMEOUT, UNKNOWN
  - [x] Test: healthCheck with binary found returns available: true
  - [x] Test: healthCheck with binary not found returns available: false with install instructions
  - [x] Test: timeout kills process and yields TIMEOUT result
  - [x] Test: plugins array passed as `--plugin` flags to CLI
  - [x] Test: unparseable lines logged and skipped
  - [x] Anti-pattern: do NOT mock `child_process.spawn` directly. Feed fixture lines to the parser via `createMockProcess`.

- [x] Task 5: Verify build and tests (AC: #11)
  - [x] Run `npm run build` — zero TypeScript errors
  - [x] Run `npm run test:unit` — all tests pass, no regressions

## Dev Notes

### Architecture Compliance

This story implements Epic 3, Story 3.2 (mapped to sprint Epic 12, Story 12-2) "OpenCode Driver Implementation" from `epics-multi-framework.md`. It covers FR2 (detect CLI binary on PATH), FR3 (verify auth status), FR5 (spawn agent via driver CLI), FR7 (parse CLI output to StreamEvent), FR8 (capture/normalize cost), FR9 (classify errors into standard categories), FR10 (detect/report unparseable output).

Key architecture decisions honored:
- **Decision 1 (Driver Interface):** `OpenCodeDriver` implements `AgentDriver` with `dispatch()` returning `AsyncIterable<StreamEvent>`. Same interface as `ClaudeCodeDriver` and `CodexDriver`.
- **Decision 2 (CLI-Wrapping Strategy):** `child_process.spawn` with `stdio: ['ignore', 'pipe', 'pipe']`. No PTY. Line-by-line stdout parsing.
- **Decision 4 (Model Resolution):** `defaultModel = 'default'` — OpenCode inherits from its own config, unlike Codex which has `codex-mini`.
- **Decision 6 (Plugin Pass-Through):** OpenCode supports plugins via `--plugin` flag. Unlike Codex (warn and ignore), OpenCode passes plugins through.
- **Implementation Patterns:** One file per driver, named `opencode.ts`. Class name `OpenCodeDriver`. Named export. Register in factory — never auto-discover. Stateless between dispatches except `lastCost`.

### Key Differences from CodexDriver (Story 12-1)

The OpenCode driver is structurally identical to CodexDriver with these differences:

1. **Plugins supported:** OpenCode supports `--plugin <name>` flags. Codex warns and ignores. The `dispatch()` method must iterate `opts.plugins` and add `--plugin` args.
2. **Default model:** `'default'` instead of `'codex-mini'`. OpenCode inherits from its own config.
3. **Binary name:** `opencode` instead of `codex`.
4. **Install instructions:** `"opencode not found. Install: https://opencode.ai"` instead of npm install.
5. **Health check auth:** OpenCode auth check may use `opencode auth status` or similar. Same pattern as Codex — try the command, if it fails treat as unauthenticated.
6. **Output format:** OpenCode is Go-based. Output format may differ. The `parseLine()` function should handle the same NDJSON-style format as Codex initially, but may need refinement later against real output. If OpenCode uses a different JSON structure, adjust field names accordingly.

### Current State of the Codebase

- **`src/lib/agents/drivers/codex.ts`** — Reference implementation for CLI-wrapped drivers. 333 lines. Copy this structure, adjust for OpenCode differences.
- **`src/lib/agents/drivers/claude-code.ts`** — In-process driver using Agent SDK. Different pattern — do NOT copy this for OpenCode.
- **`src/lib/agents/drivers/factory.ts`** — Module-singleton registry. `registerDriver()`, `getDriver()`, `listDrivers()`, `resetDrivers()`. OpenCodeDriver will be registered here by the engine at startup (story 12-3).
- **`src/lib/agents/drivers/index.ts`** — Barrel file. Currently exports factory functions + `ClaudeCodeDriver` + `CodexDriver`. Must add `OpenCodeDriver`.
- **`src/lib/agents/types.ts`** — Defines `AgentDriver`, `DispatchOpts`, `DriverHealth`, `DriverCapabilities`, `ErrorCategory`. All types ready — no changes needed.
- **`src/lib/agents/stream-parser.ts`** — Defines `StreamEvent` union type. The OpenCode driver needs its own `parseLine()` for OpenCode output format.
- **`src/lib/agents/__tests__/codex-driver.test.ts`** — Reference test file for CLI-wrapped drivers. Follow this pattern exactly.
- **Test count as of last story:** 4404 tests pass across 165 test files (53 added by story 12-1).

### What NOT to Do

- Do NOT modify `factory.ts` — only import from it. Registration happens in the engine.
- Do NOT modify `types.ts` — all types are already defined.
- Do NOT modify `stream-parser.ts` — the OpenCode driver has its own line parsing logic.
- Do NOT modify `workflow-engine.ts` — engine registration of OpenCodeDriver is deferred to story 12-3.
- Do NOT modify `codex.ts` — it is the reference, not a shared base class.
- Do NOT mock `child_process.spawn` directly in tests — use `createMockProcess()` helper pattern from `codex-driver.test.ts`.
- Do NOT invent new error categories beyond RATE_LIMIT, NETWORK, AUTH, TIMEOUT, UNKNOWN.
- Do NOT use PTY allocation — use plain `child_process.spawn` with pipes.
- Do NOT auto-discover the driver — it must be explicitly registered.
- Do NOT share `classifyError()` between drivers via import — each driver has its own copy (architecture requires self-contained driver files).

### Previous Story Intelligence

From story 12-1 (Codex Driver Implementation):
- 53 new tests added, 4404 total passing across 165 test files.
- `classifyError()` exported as standalone function — same pattern needed for OpenCode.
- `parseLine()` exported as standalone function — same pattern needed.
- `IGNORE:` comments required on catch blocks for linter compliance (project convention).
- `createMockProcess()` helper in test file creates mock stdout Readable, stderr EventEmitter, and proc EventEmitter. Emits lines via `stdout.push()` then `stdout.push(null)`, followed by `proc.emit('close', exitCode)` on next tick.
- Cost captured from `result` type events via `cost_usd` field on parsed JSON.
- `yieldedResult` boolean guarantees exactly one result event.
- `closePromise` captured BEFORE readline iteration to avoid race condition where `close` fires during iteration.

From story 11-2 (Workflow Referential Integrity Validation):
- Referential integrity validates driver names at parse time. Once `OpenCodeDriver` is registered, `driver: opencode` will pass validation.
- Validation skips driver checks when registry is empty.

### Git Intelligence

Recent commits (all in current sprint):
- `6edd1df` — story 12-1: Codex Driver Implementation
- `44c0b70` — story 11-2: workflow referential integrity validation
- `a4bf7e6` — story 11-1: workflow schema extension
- `f128064` — story 10-5: workflow engine driver integration
- `3717741` — story 10-4: model resolution module

All recent work is in the driver/workflow area. Patterns are consistent and fresh.

### Project Structure Notes

Files to CREATE:
- `src/lib/agents/drivers/opencode.ts` — OpenCodeDriver class
- `src/lib/agents/__tests__/opencode-driver.test.ts` — Unit tests
- `test/fixtures/drivers/opencode/success.txt` — Success fixture
- `test/fixtures/drivers/opencode/error-rate-limit.txt` — Rate limit error fixture
- `test/fixtures/drivers/opencode/error-auth.txt` — Auth error fixture
- `test/fixtures/drivers/opencode/error-network.txt` — Network error fixture
- `test/fixtures/drivers/opencode/unparseable.txt` — Unparseable lines fixture

Files to MODIFY:
- `src/lib/agents/drivers/index.ts` — Add `OpenCodeDriver` re-export

Files NOT to modify:
- `src/lib/agents/drivers/factory.ts` — consume only
- `src/lib/agents/drivers/codex.ts` — reference only, do not import from
- `src/lib/agents/drivers/claude-code.ts` — reference only
- `src/lib/agents/types.ts` — all types exist
- `src/lib/agents/stream-parser.ts` — OpenCode has its own parser
- `src/lib/workflow-engine.ts` — engine registration is story 12-3
- `src/schemas/workflow.schema.json` — schema already supports `driver` field

### Testing Patterns

Follow `codex-driver.test.ts` patterns exactly:
- `vi.mock('node:child_process', ...)` for spawn and execFile
- Helper: `makeOpts(overrides)` for creating DispatchOpts
- Helper: `collectEvents(iterable)` for gathering all events
- Helper: `createMockProcess(stdoutLines, exitCode, stderrData)` — creates mock Readable stdout, EventEmitter stderr, EventEmitter proc with kill mock
- Test event ordering: tool-start, tool-input, tool-complete, text, result
- Test error paths: each ErrorCategory triggered by specific fixture input
- Test health check: mock `execFile` for `which opencode` and `opencode --version`
- Test plugins: verify `--plugin` flags appear in spawn args (unlike Codex which warns)
- Anti-pattern: do NOT mock spawn directly. Feed fixture lines to the parser via createMockProcess.
- Add `// IGNORE:` comments on empty catch blocks per project convention.

### References

- [Source: _bmad-output/planning-artifacts/epics-multi-framework.md#Story 3.2: OpenCode Driver Implementation]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md#Decision 1: Driver Interface Design]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md#Decision 2: CLI-Wrapping Strategy]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md#Decision 4: Model Resolution Cascade]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md#Decision 6: Plugin Ecosystem Pass-Through]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md#Implementation Patterns — Driver Implementation Pattern]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md#Implementation Patterns — StreamEvent Production Pattern]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md#Implementation Patterns — Error Classification Pattern]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md#Implementation Patterns — Health Check Pattern]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md#Implementation Patterns — Testing Pattern for Drivers]
- [Source: src/lib/agents/drivers/codex.ts — reference CLI-wrapped driver implementation]
- [Source: src/lib/agents/__tests__/codex-driver.test.ts — reference test patterns]
- [Source: _bmad-output/implementation-artifacts/12-1-codex-driver-implementation.md — previous story context]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/12-2-opencode-driver-implementation-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/12-2-opencode-driver-implementation.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Change Log

- 2026-04-03: Implemented OpenCode Driver (story 12-2) — created driver, tests, fixtures, barrel export update. 64 new tests, 4478 total passing across 166 test files. Zero regressions.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

N/A — clean implementation, no debugging required.

### Completion Notes List

- Task 1: Created 5 fixture files in `test/fixtures/drivers/opencode/` matching codex fixture patterns with OpenCode-specific content (Go-based CLI, opencode binary name, opencode session IDs).
- Task 2: Implemented `OpenCodeDriver` class in `src/lib/agents/drivers/opencode.ts` (280 lines). Follows CodexDriver structure exactly with key differences: `supportsPlugins: true`, `defaultModel = 'default'`, plugins passed via `--plugin` flags, install URL points to `https://opencode.ai`. Exports `classifyError()` and `parseLine()` as standalone functions per architecture requirement.
- Task 3: Added `export { OpenCodeDriver } from './opencode.js';` to `src/lib/agents/drivers/index.ts`.
- Task 4: Created 64 unit tests in `src/lib/agents/__tests__/opencode-driver.test.ts` covering all ACs: class properties, parseLine (20 tests), classifyError (14 tests), dispatch flows (successful, cost handling, error handling, result guarantee, timeout, plugins pass-through, unparseable lines, event ordering, CLI args, exception handling, no-model/cwd), healthCheck (3 tests), barrel export.
- Task 5: Build succeeded with zero TypeScript errors. Full test suite: 4478 tests pass across 166 test files (74 new tests added vs. prior 4404).

### File List

- `src/lib/agents/drivers/opencode.ts` — NEW: OpenCodeDriver implementation
- `src/lib/agents/__tests__/opencode-driver.test.ts` — NEW: Unit tests (64 tests)
- `src/lib/agents/drivers/index.ts` — MODIFIED: Added OpenCodeDriver re-export
- `test/fixtures/drivers/opencode/success.txt` — NEW: Success fixture
- `test/fixtures/drivers/opencode/error-rate-limit.txt` — NEW: Rate limit error fixture
- `test/fixtures/drivers/opencode/error-auth.txt` — NEW: Auth error fixture
- `test/fixtures/drivers/opencode/error-network.txt` — NEW: Network error fixture
- `test/fixtures/drivers/opencode/unparseable.txt` — NEW: Unparseable lines fixture
