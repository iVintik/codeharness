# Story 12.1: Codex Driver Implementation

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to run tasks on OpenAI Codex by setting `driver: codex` in my workflow YAML,
so that I can use Codex models for implementation or verification alongside other frameworks.

## Acceptance Criteria

1. **Given** a new `src/lib/agents/drivers/codex.ts` file
   **When** inspected
   **Then** `CodexDriver` implements the `AgentDriver` interface with `name = 'codex'`, `defaultModel = 'codex-mini'`, and `capabilities` including `supportsPlugins: false`, `supportsStreaming: true`, `costReporting: true`
   **And** the class structure matches `ClaudeCodeDriver` (one file per driver, named export, stateless between dispatches except `lastCost`)
   <!-- verification: test-provable -->

2. **Given** `CodexDriver.dispatch(opts)` is called with a valid prompt
   **When** the driver executes
   **Then** it spawns `codex` CLI via `child_process.spawn` with `stdio: ['ignore', 'pipe', 'pipe']`
   **And** stdout is parsed line-by-line into `StreamEvent` objects
   **And** unparseable lines are logged at debug level and skipped (never thrown, never yielded as malformed events)
   **And** a `result` event is always yielded at the end, even on error
   <!-- verification: test-provable -->

3. **Given** the Codex CLI reports cost in its output
   **When** `dispatch()` completes
   **Then** `cost_usd` is captured from CLI output and set on the final `result` event
   **And** `getLastCost()` returns the same value
   **And** if the CLI does not report cost, `cost_usd` is set to `null` (not 0, not undefined)
   <!-- verification: test-provable -->

4. **Given** the Codex CLI exits with a non-zero exit code or outputs an error
   **When** the error is classified
   **Then** the driver maps it to one of the standard `ErrorCategory` values: `RATE_LIMIT`, `NETWORK`, `AUTH`, `TIMEOUT`, `UNKNOWN`
   **And** classification follows the documented priority order (429/rate limit -> RATE_LIMIT, network codes -> NETWORK, 401/403/unauthorized -> AUTH, timeout -> TIMEOUT, else -> UNKNOWN)
   **And** no new error categories are invented
   <!-- verification: test-provable -->

5. **Given** `CodexDriver.healthCheck()` is called
   **When** the `codex` binary is installed on PATH
   **Then** it returns `{ available: true, authenticated: <auth_status>, version: <version_string> }`
   **And** when the binary is NOT on PATH, it returns `{ available: false, authenticated: false, version: null, error: "codex CLI not found. Install: npm install -g @openai/codex" }`
   <!-- verification: test-provable -->

6. **Given** `dispatch()` receives `opts.timeout` with a value
   **When** the Codex CLI process runs longer than the timeout
   **Then** the process is killed
   **And** a `result` event with `errorCategory: 'TIMEOUT'` is yielded
   <!-- verification: test-provable -->

7. **Given** `dispatch()` receives `opts.plugins` with values
   **When** the driver processes the plugins array
   **Then** it logs a warning that Codex does not support plugins and ignores the plugins array
   **And** dispatch proceeds normally without the plugins
   <!-- verification: test-provable -->

8. **Given** `dispatch()` produces `StreamEvent` objects
   **When** the sequence is inspected
   **Then** events follow the required ordering: zero or more `tool-start` -> `tool-input` -> `tool-complete` sequences, zero or more `text` events interleaved, zero or more `retry` events, and exactly one `result` event at the end
   <!-- verification: test-provable -->

9. **Given** `CodexDriver` is exported from `src/lib/agents/drivers/codex.ts`
   **When** `src/lib/agents/drivers/index.ts` is inspected
   **Then** it re-exports `CodexDriver` alongside existing exports
   **And** `factory.ts` provides the registration mechanism (the engine calls `registerDriver(new CodexDriver())` at startup)
   <!-- verification: test-provable -->

10. **Given** fixture files in `test/fixtures/drivers/codex/`
    **When** unit tests run
    **Then** tests cover: successful dispatch with event ordering, error classification for each category, health check with binary found, health check with binary missing, timeout termination, plugins warning, cost capture, cost null when absent, unparseable line handling
    <!-- verification: test-provable -->

11. **Given** `npm run build` is executed after all changes
    **When** the build completes
    **Then** it succeeds with zero TypeScript errors
    **And** `npm run test:unit` passes with no regressions in existing test suites
    <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Create Codex CLI output fixtures (AC: #10)
  - [x] Create `test/fixtures/drivers/codex/` directory
  - [x] Add `success.jsonl` — sample successful Codex CLI output (NDJSON lines representing tool use, text output, and result with cost)
  - [x] Add `error-rate-limit.txt` — sample output when rate-limited (HTTP 429 or "rate limit" message)
  - [x] Add `error-auth.txt` — sample output when authentication fails (401/403 or "unauthorized")
  - [x] Add `error-network.txt` — sample output for network failures
  - [x] Add `unparseable.txt` — sample output with lines that don't match any known format
  - [x] NOTE: Codex CLI output format is not publicly documented. Create plausible fixtures based on typical CLI agent output patterns (NDJSON with type fields). Actual format will need refinement against real CLI output.

- [x] Task 2: Create `src/lib/agents/drivers/codex.ts` (AC: #1, #2, #3, #4, #6, #7, #8)
  - [x] Implement `CodexDriver` class implementing `AgentDriver` interface
  - [x] Set `name = 'codex'`, `defaultModel = 'codex-mini'`, `capabilities = { supportsPlugins: false, supportsStreaming: true, costReporting: true }`
  - [x] Implement `parseLine(line: string): StreamEvent | null` — parse one stdout line into a StreamEvent or null
  - [x] Implement `classifyError(err: unknown): ErrorCategory` — follow the standard classification priority order from architecture
  - [x] Implement `dispatch(opts: DispatchOpts): AsyncGenerator<StreamEvent>` using `child_process.spawn('codex', [...args], { stdio: ['ignore', 'pipe', 'pipe'] })`
  - [x] Build CLI args from `opts`: `--model`, `--cwd`, prompt as positional or via stdin
  - [x] Parse stdout line-by-line via `readline.createInterface`
  - [x] Log unparseable lines at debug level, skip them
  - [x] Handle process `close` event for crash detection
  - [x] Implement timeout via `setTimeout` + `proc.kill()`
  - [x] Log warning and ignore if `opts.plugins` is non-empty
  - [x] Guarantee `result` event is always yielded (even on error)
  - [x] Implement `healthCheck(): Promise<DriverHealth>` — (1) `which codex`, (2) `codex --version`, (3) optional auth check
  - [x] Implement `getLastCost(): number | null`

- [x] Task 3: Update barrel export in `src/lib/agents/drivers/index.ts` (AC: #9)
  - [x] Add `export { CodexDriver } from './codex.js';`

- [x] Task 4: Write unit tests `src/lib/agents/__tests__/codex-driver.test.ts` (AC: #10, #11)
  - [x] Mock `child_process.spawn` at the line-reader level — feed fixture lines to `parseLine()`
  - [x] Test: successful dispatch produces correct StreamEvent sequence from fixture
  - [x] Test: result event is always present at end
  - [x] Test: cost captured from CLI output
  - [x] Test: cost is null when CLI doesn't report it
  - [x] Test: error classification for RATE_LIMIT, NETWORK, AUTH, TIMEOUT, UNKNOWN
  - [x] Test: healthCheck with binary found returns available: true
  - [x] Test: healthCheck with binary not found returns available: false with install instructions
  - [x] Test: timeout kills process and yields TIMEOUT result
  - [x] Test: plugins array triggers warning log, dispatch proceeds
  - [x] Test: unparseable lines logged and skipped
  - [x] Anti-pattern: do NOT mock `child_process.spawn` directly — mock at the line-reader / readline level

- [x] Task 5: Verify build and tests (AC: #11)
  - [x] Run `npm run build` — zero TypeScript errors
  - [x] Run `npm run test:unit` — all tests pass, no regressions

## Dev Notes

### Architecture Compliance

This story implements Epic 3, Story 3.1 (mapped to sprint Epic 12, Story 12-1) "Codex Driver Implementation" from `epics-multi-framework.md`. It covers FR2 (detect CLI binary on PATH), FR3 (verify auth status), FR5 (spawn agent via driver CLI), FR7 (parse CLI output to StreamEvent), FR8 (capture/normalize cost), FR9 (classify errors into standard categories), FR10 (detect/report unparseable output).

Key architecture decisions honored:
- **Decision 1 (Driver Interface):** `CodexDriver` implements `AgentDriver` with `dispatch()` returning `AsyncIterable<StreamEvent>`. Same interface as `ClaudeCodeDriver`.
- **Decision 2 (CLI-Wrapping Strategy):** `child_process.spawn` with `stdio: ['ignore', 'pipe', 'pipe']`. No PTY. Line-by-line stdout parsing. JSON output mode preferred if Codex supports it.
- **Implementation Patterns:** One file per driver, named `codex.ts`. Class name `CodexDriver`. Named export. Register in factory — never auto-discover. Stateless between dispatches except `lastCost`.

### Current State of the Codebase

- **`src/lib/agents/drivers/claude-code.ts`** — Reference implementation. 282 lines. Uses Agent SDK `query()` in-process. This story creates the CLI-wrapped counterpart.
- **`src/lib/agents/drivers/factory.ts`** — Module-singleton registry. `registerDriver()`, `getDriver()`, `listDrivers()`, `resetDrivers()`. CodexDriver will be registered here by the engine at startup.
- **`src/lib/agents/drivers/index.ts`** — Barrel file. Currently exports factory functions + `ClaudeCodeDriver`. Must add `CodexDriver`.
- **`src/lib/agents/types.ts`** — Defines `AgentDriver`, `DispatchOpts`, `DriverHealth`, `DriverCapabilities`, `ErrorCategory`, `OutputContract`. All types ready — no changes needed.
- **`src/lib/agents/stream-parser.ts`** — Defines `StreamEvent` union type: `ToolStartEvent`, `ToolInputEvent`, `ToolCompleteEvent`, `TextEvent`, `RetryEvent`, `ResultEvent`. The `parseLine()` function there parses Claude Code NDJSON format. The Codex driver needs its own `parseLine()` for Codex output format.
- **`src/lib/agents/__tests__/claude-code-driver.test.ts`** — Reference test file. Uses `vi.mock` for Agent SDK, `fakeStream()` helper, `collectEvents()` helper. The Codex driver tests should follow the same pattern but mock `child_process.spawn` + readline instead.
- **`src/lib/workflow-engine.ts`** — Registers `ClaudeCodeDriver` at startup via `registerDriver(new ClaudeCodeDriver())`. After this story, it should also register `CodexDriver`. However, engine registration is story 12-3 (health check at workflow start) — for now, just export the class so the engine CAN register it.
- **Test count as of last story:** 4350 tests pass across 164 test files.

### Codex CLI Specifics

- **Binary name:** `codex` (installed via `npm install -g @openai/codex`)
- **Default model:** `codex-mini` (architecture Decision 4)
- **Auth:** OpenAI API key or ChatGPT account. Auth status may be checkable via `codex auth status` or similar.
- **Output format:** Not publicly documented. Likely NDJSON or structured text. Create plausible fixtures; refine against real CLI output later.
- **Plugins:** Not supported. Warn and ignore per architecture Decision 6.

### What NOT to Do

- Do NOT modify `factory.ts` — only import from it. Registration happens in the engine.
- Do NOT modify `types.ts` — all types are already defined.
- Do NOT modify `stream-parser.ts` — the Codex driver has its own line parsing logic.
- Do NOT modify `workflow-engine.ts` — engine registration of CodexDriver is deferred to story 12-3.
- Do NOT mock `child_process.spawn` directly in tests — mock at the line-reader level (feed fixture lines to `parseLine()`).
- Do NOT invent new error categories beyond RATE_LIMIT, NETWORK, AUTH, TIMEOUT, UNKNOWN.
- Do NOT use PTY allocation — use plain `child_process.spawn` with pipes.
- Do NOT auto-discover the driver — it must be explicitly registered.

### Previous Story Intelligence

From story 11-2 (Workflow Referential Integrity Validation):
- Referential integrity now validates driver names at parse time. Once `CodexDriver` is registered, `driver: codex` will pass validation.
- The validation skips driver checks when the registry is empty (standalone parse without engine).
- 12 new tests, 4350 total passing. Pattern: write YAML to temp dir, call `parseWorkflow()`, assert.

From story 11-1 (Workflow Schema Extension):
- `driver`, `model`, and `plugins` fields added to workflow schema and `ResolvedTask`.
- Forward-compat casts cleaned up.
- `ResolvedTask` already has `driver?: string`, `model?: string`, `plugins?: string[]`.

From story 10-3 (Claude Code Driver Extraction):
- `ClaudeCodeDriver` is the reference implementation. Follow its structure exactly.
- Key patterns: `classifyError()` as a standalone function, `mapSdkMessage()` / `parseLine()` for event conversion, `lastCost` tracking, guaranteed `result` event via `yieldedResult` boolean.

### Git Intelligence

Recent commits (all in current sprint):
- `44c0b70` — story 11-2: workflow referential integrity validation
- `a4bf7e6` — story 11-1: workflow schema extension
- `f128064` — story 10-5: workflow engine driver integration
- `3717741` — story 10-4: model resolution module
- `bd3f35d` — story 10-3: ClaudeCodeDriver extraction

All recent work is in the driver/workflow area. Patterns are consistent and fresh.

### Project Structure Notes

Files to CREATE:
- `src/lib/agents/drivers/codex.ts` — CodexDriver class
- `src/lib/agents/__tests__/codex-driver.test.ts` — Unit tests
- `test/fixtures/drivers/codex/success.jsonl` — Success fixture
- `test/fixtures/drivers/codex/error-rate-limit.txt` — Rate limit error fixture
- `test/fixtures/drivers/codex/error-auth.txt` — Auth error fixture
- `test/fixtures/drivers/codex/error-network.txt` — Network error fixture
- `test/fixtures/drivers/codex/unparseable.txt` — Unparseable lines fixture

Files to MODIFY:
- `src/lib/agents/drivers/index.ts` — Add `CodexDriver` re-export

Files NOT to modify:
- `src/lib/agents/drivers/factory.ts` — consume only
- `src/lib/agents/drivers/claude-code.ts` — reference only
- `src/lib/agents/types.ts` — all types exist
- `src/lib/agents/stream-parser.ts` — Codex has its own parser
- `src/lib/workflow-engine.ts` — engine registration is story 12-3
- `src/schemas/workflow.schema.json` — schema already supports `driver` field

### Testing Patterns

Follow `claude-code-driver.test.ts` patterns:
- `vi.mock` for external dependencies (child_process)
- Helper: `makeOpts(overrides)` for creating DispatchOpts
- Helper: `collectEvents(iterable)` for gathering all events
- Test event ordering: tool-start, tool-input, tool-complete, text, result
- Test error paths: each ErrorCategory triggered by specific fixture input
- Test health check: mock `execSync`/`execFile` for `which codex` and `codex --version`
- Anti-pattern: do NOT mock spawn directly. Feed fixture lines to the parser.

### References

- [Source: _bmad-output/planning-artifacts/epics-multi-framework.md#Story 3.1: Codex Driver Implementation]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md#Decision 1: Driver Interface Design]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md#Decision 2: CLI-Wrapping Strategy]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md#Implementation Patterns — Driver Implementation Pattern]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md#Implementation Patterns — StreamEvent Production Pattern]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md#Implementation Patterns — Error Classification Pattern]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md#Implementation Patterns — Health Check Pattern]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md#Implementation Patterns — Testing Pattern for Drivers]
- [Source: src/lib/agents/drivers/claude-code.ts — reference driver implementation]
- [Source: src/lib/agents/__tests__/claude-code-driver.test.ts — reference test patterns]
- [Source: _bmad-output/implementation-artifacts/11-2-workflow-referential-integrity-validation.md — previous story context]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/12-1-codex-driver-implementation-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/12-1-codex-driver-implementation.md

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

- All 5 tasks completed: fixtures, driver, barrel export, tests, build+test verification
- 53 new tests added, 4404 total passing across 165 test files
- Build succeeds with zero TypeScript errors
- Boundary test required `// IGNORE:` comments on catch blocks — added per project convention

### File List

- `test/fixtures/drivers/codex/success.jsonl` (created)
- `test/fixtures/drivers/codex/error-rate-limit.txt` (created)
- `test/fixtures/drivers/codex/error-auth.txt` (created)
- `test/fixtures/drivers/codex/error-network.txt` (created)
- `test/fixtures/drivers/codex/unparseable.txt` (created)
- `src/lib/agents/drivers/codex.ts` (created)
- `src/lib/agents/__tests__/codex-driver.test.ts` (created)
- `src/lib/agents/drivers/index.ts` (modified)
