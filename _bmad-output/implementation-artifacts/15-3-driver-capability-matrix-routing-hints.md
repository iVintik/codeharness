# Story 15.3: Driver Capability Matrix & Routing Hints

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want the system to warn me about capability conflicts at workflow start and suggest cheaper driver alternatives,
so that I avoid misconfigurations and optimize costs.

## Acceptance Criteria

1. **Given** a workflow where a task specifies `plugins: ['gstack']` on a `codex` driver (which has `supportsPlugins: false`)
   **When** the workflow engine runs the pre-flight check at workflow start
   **Then** a warning message is emitted listing the task name, the conflicting capability (`supportsPlugins`), and the driver name
   **And** the workflow continues executing (warning is advisory, not a hard stop)
   <!-- verification: test-provable -->

2. **Given** a workflow where all tasks use drivers whose capabilities satisfy the task requirements
   **When** the workflow engine runs the pre-flight check
   **Then** no capability conflict warnings are emitted
   <!-- verification: test-provable -->

3. **Given** the CLI command `codeharness drivers`
   **When** invoked with no arguments
   **Then** it outputs a JSON object where each key is a registered driver name and each value contains `defaultModel`, `capabilities` (the full `DriverCapabilities` object), and a human-readable `description` string
   **And** the process exits with code 0
   <!-- verification: runtime-provable -->

4. **Given** the CLI command `codeharness drivers`
   **When** invoked with the `--json` flag
   **Then** the output is valid JSON parseable by `JSON.parse()` with the same structure as AC #3
   <!-- verification: runtime-provable -->

5. **Given** a workflow where a task uses `claude-code` (which costs >2x a cheaper capable alternative like `codex`)
   **When** the pre-flight capability check runs at workflow start
   **Then** an advisory message is displayed: `Advisory: task "{taskName}" uses {driver} — {cheaperDriver} could handle this task at lower cost`
   **And** the workflow continues executing (advisory only, not a hard stop)
   <!-- verification: test-provable -->

6. **Given** a workflow where a task uses the cheapest capable driver
   **When** the pre-flight capability check runs
   **Then** no routing hint advisory is emitted for that task
   <!-- verification: test-provable -->

7. **Given** the `DriverCapabilities` interface in `types.ts`
   **When** inspected
   **Then** it includes a `costTier` field of type `number` (1 = cheapest, higher = more expensive)
   **And** each driver sets its own `costTier` value
   <!-- verification: test-provable -->

8. **Given** the `checkCapabilityConflicts()` function
   **When** called with a `ResolvedWorkflow`
   **Then** it returns an array of `CapabilityWarning` objects, each with `taskName`, `driverName`, `capability`, and `message` fields
   **And** the function is a pure query (no side effects, no thrown errors)
   <!-- verification: test-provable -->

9. **Given** the `suggestCheaperDriver()` function in `factory.ts`
   **When** called with a driver name and its task's required capabilities
   **Then** it returns the name of the cheapest registered driver whose capabilities are a superset of the required capabilities, or `null` if no cheaper alternative exists
   <!-- verification: test-provable -->

10. **Given** `npm run build` is executed after all changes
    **When** the build completes
    **Then** it succeeds with zero TypeScript errors
    <!-- verification: test-provable -->

11. **Given** `npm run test:unit` is executed after all changes
    **When** the tests complete
    **Then** all existing tests pass with zero regressions
    <!-- verification: test-provable -->

12. **Given** no new file exceeds 300 lines
    **When** line count is checked for all modified/created files
    **Then** every source file stays under 300 lines
    <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1 (AC: #7): Extend `DriverCapabilities` with `costTier` field
  - [x] Add `readonly costTier: number` to `DriverCapabilities` in `src/lib/agents/types.ts`
  - [x] Update `ClaudeCodeDriver.capabilities` to set `costTier: 3`
  - [x] Update `CodexDriver.capabilities` to set `costTier: 1`
  - [x] Update `OpenCodeDriver.capabilities` to set `costTier: 2`
  - [x] Update existing tests in `src/lib/agents/__tests__/types.test.ts` for the new field

- [x] Task 2 (AC: #8, #9): Implement `checkCapabilityConflicts()` and `suggestCheaperDriver()`
  - [x] Add `CapabilityWarning` interface to `src/lib/agents/types.ts`: `{ taskName: string; driverName: string; capability: string; message: string }`
  - [x] Add `suggestCheaperDriver(driverName: string, requiredCaps: Partial<DriverCapabilities>): string | null` to `src/lib/agents/drivers/factory.ts`
  - [x] Add `checkCapabilityConflicts(workflow: ResolvedWorkflow): CapabilityWarning[]` to new `src/lib/agents/capability-check.ts` (workflow-engine.ts was at 1109 lines)
  - [x] `checkCapabilityConflicts` iterates tasks, compares task requirements (plugins implies `supportsPlugins`) against driver capabilities, and calls `suggestCheaperDriver` for cost routing
  - [x] Export new functions from `src/lib/agents/index.ts`

- [x] Task 3 (AC: #1, #2, #5, #6): Integrate capability check into workflow engine pre-flight
  - [x] Call `checkCapabilityConflicts()` during `runWorkflow()` after `checkDriverHealth()` (around line 914)
  - [x] For each returned warning, call `warn()` from `src/lib/output.ts`
  - [x] Do NOT throw or abort — warnings are advisory only

- [x] Task 4 (AC: #3, #4): Implement `codeharness drivers` CLI command
  - [x] Create `src/commands/drivers.ts` with `registerDriversCommand(program: Command)`
  - [x] Register all 3 drivers (import and register from driver files)
  - [x] Call `listDrivers()` + `getDriver()` for each to build structured output
  - [x] Support `--json` flag (default output is also JSON but pretty-printed)
  - [x] Register in `src/index.ts`

- [x] Task 5 (AC: #8, #9): Write unit tests for capability check and routing
  - [x] Test: plugin requirement on codex driver produces conflict warning
  - [x] Test: no conflicts when capabilities match
  - [x] Test: suggestCheaperDriver returns cheaper driver when one exists
  - [x] Test: suggestCheaperDriver returns null when current driver is cheapest
  - [x] Test: routing hint generated when driver costs >2x cheapest capable alternative
  - [x] Test: no routing hint when driver is cheapest capable

- [x] Task 6 (AC: #3, #4): Write tests for `codeharness drivers` command
  - [x] Test: command outputs JSON with all registered drivers
  - [x] Test: each driver entry has `defaultModel`, `capabilities`, `description`
  - [x] Test: `--json` flag produces parseable JSON

- [x] Task 7 (AC: #10): Run `npm run build` — zero TypeScript errors
- [x] Task 8 (AC: #11): Run `npm run test:unit` — all tests pass, zero regressions (4648 tests, 172 files)
- [x] Task 9 (AC: #12): Verify all modified/created files are under 300 lines

## Dev Notes

### Architecture Compliance

This story implements Epic 6, Story 6.3 (mapped to sprint Epic 15, Story 15-3) "Driver Capability Matrix & Routing Hints" from `epics-multi-framework.md`. It covers:
- **FR36:** System can suggest a cheaper driver for tasks that don't require the capabilities of the configured driver (routing hint — advisory, not automatic)
- **FR37:** System can document each driver's capabilities in a queryable format
- **FR38:** System can warn at workflow start if a task's requirements conflict with the driver's capabilities

Key architecture decisions honored:
- **Decision 1 (AgentDriver interface):** `capabilities: DriverCapabilities` already on all drivers — extend with `costTier`
- **Gap Analysis item 1:** Architecture explicitly calls for `capabilities: DriverCapabilities` on `AgentDriver` for FR37-FR38
- **Gap Analysis item 2:** Architecture explicitly calls for `suggestCheaperDriver()` in `factory.ts` for FR36

### What Already Exists (from previous epics)

1. **`DriverCapabilities` interface** (`src/lib/agents/types.ts` line 27): `{ supportsPlugins: boolean; supportsStreaming: boolean; costReporting: boolean }`
2. **All 3 drivers set capabilities:**
   - `ClaudeCodeDriver`: `{ supportsPlugins: true, supportsStreaming: true, costReporting: true }`
   - `CodexDriver`: `{ supportsPlugins: false, supportsStreaming: true, costReporting: true }`
   - `OpenCodeDriver`: `{ supportsPlugins: true, supportsStreaming: true, costReporting: true }`
3. **Driver factory** (`src/lib/agents/drivers/factory.ts`): `registerDriver()`, `getDriver()`, `listDrivers()`, `resetDrivers()`
4. **`checkDriverHealth()`** in `src/lib/workflow-engine.ts` line 818 — capability conflict check should run right after this
5. **`warn()` function** in `src/lib/output.ts` — use for advisory messages
6. **CLI command registration pattern**: `registerXCommand(program: Command)` in `src/commands/*.ts`, registered in `src/index.ts`
7. **`ResolvedWorkflow`** type from `src/lib/workflow-parser.ts` — tasks have `driver?: string` and `plugins?: string[]` fields

### What's Missing (the actual work for this story)

1. **`costTier` on `DriverCapabilities`** — no cost ordering exists; needed for `suggestCheaperDriver()`
2. **`checkCapabilityConflicts()` function** — no pre-flight capability validation exists
3. **`suggestCheaperDriver()` function** — no routing hint logic exists
4. **`codeharness drivers` CLI command** — no way to query driver capabilities from CLI
5. **`CapabilityWarning` type** — no structured warning type exists

### Data Flow (New)

```
runWorkflow() startup:
  1. checkDriverHealth(workflow)          ← existing (line 914)
  2. checkCapabilityConflicts(workflow)   ← NEW
       ↓
     For each task in workflow.tasks:
       - Get driver via getDriver(task.driver)
       - Check: task.plugins.length > 0 && !driver.capabilities.supportsPlugins → warning
       - Call suggestCheaperDriver(task.driver, requiredCaps)
       - If cheaper alternative && driver.costTier > 2 * cheaper.costTier → advisory
       ↓
     Return CapabilityWarning[]
       ↓
  3. For each warning: warn(warning.message)
```

### Capability Conflict Detection Logic

A task "requires" a capability based on its configuration:
- `task.plugins && task.plugins.length > 0` → requires `supportsPlugins: true`
- Future: `task.sourceAccess === false` → could require specific capability (but not yet in schema, defer)

The check is intentionally simple — compare task-implied requirements against `driver.capabilities` booleans. No need for a complex capability matching engine.

### Cost Routing Logic

`suggestCheaperDriver(driverName, requiredCaps)`:
1. Get all registered drivers via `listDrivers()` + `getDriver()`
2. Filter to drivers whose capabilities satisfy `requiredCaps` (every required boolean is true)
3. Find the cheapest (`costTier`) among those
4. If cheapest.costTier < currentDriver.costTier, return cheapest.name; else null

The "2x" threshold from FR36: only emit advisory if `currentDriver.costTier > 2 * cheapestCapable.costTier`. With tiers 1/2/3, claude-code (3) > 2 * codex (1), so it triggers. codex (1) vs opencode (2) would not trigger.

### CLI Command Design

`codeharness drivers` outputs:
```json
{
  "claude-code": {
    "defaultModel": "claude-sonnet-4-20250514",
    "capabilities": {
      "supportsPlugins": true,
      "supportsStreaming": true,
      "costReporting": true,
      "costTier": 3
    },
    "description": "Anthropic Claude via Agent SDK (in-process)"
  },
  "codex": {
    "defaultModel": "codex-mini",
    "capabilities": { ... },
    "description": "OpenAI Codex via CLI"
  },
  "opencode": {
    "defaultModel": "default",
    "capabilities": { ... },
    "description": "OpenCode via CLI"
  }
}
```

The `description` field is a new `readonly description: string` on `AgentDriver` interface OR a lookup map in the command. Simpler approach: add `description` to each driver class. But to avoid changing the `AgentDriver` interface for a display concern, use a static map in the command file.

**Decision: Use a static map in the drivers command.** Adding `description` to `AgentDriver` is scope creep for an informational field. The capability query (FR37) is the `capabilities` object itself.

### What NOT to Do

- Do NOT add automatic driver switching — FR36 is advisory only, explicitly scoped as "routing hint"
- Do NOT add dynamic capability discovery — capabilities are static per driver class
- Do NOT modify existing driver dispatch logic — this is pre-flight only
- Do NOT block workflow execution on capability warnings — advisory only
- Do NOT add new npm dependencies
- Do NOT modify the `AgentDriver` interface beyond what's needed (adding `costTier` to `DriverCapabilities`)
- Do NOT create docs/drivers/ pages — that's out of scope for this story (the CLI command IS the queryable format per FR37)

### Line Budget Analysis

| File | Current Lines | Estimated Change | Target |
|------|--------------|------------------|--------|
| `agents/types.ts` | ~155 | +10 (costTier, CapabilityWarning) | ~165 |
| `agents/drivers/factory.ts` | ~68 | +25 (suggestCheaperDriver) | ~93 |
| `agents/drivers/claude-code.ts` | ~282 | +1 (costTier) | ~283 |
| `agents/drivers/codex.ts` | ~similar | +1 (costTier) | ~similar |
| `agents/drivers/opencode.ts` | ~similar | +1 (costTier) | ~similar |
| NEW `commands/drivers.ts` | — | ~60 | ~60 |
| NEW `agents/capability-check.ts` or in `workflow-engine.ts` | — | ~50 | ~50 |
| Tests (various) | — | +80-100 | within budget |

All source files stay well under 300 lines.

### Testing Guidance

- **Vitest** (not Jest). Use `vi.fn()`, `vi.mock()`, `vi.mocked()`.
- For `suggestCheaperDriver`: test in `src/lib/agents/__tests__/factory.test.ts` — register mock drivers with different costTiers, verify cheapest capable is returned.
- For `checkCapabilityConflicts`: test with mock workflows — create `ResolvedWorkflow` objects with tasks that have plugins on capability-mismatched drivers.
- For `codeharness drivers`: follow pattern in `src/commands/__tests__/status.test.ts` or `src/commands/__tests__/stats.test.ts`.
- Use `resetDrivers()` in `beforeEach` for test isolation (already done in factory tests).

### Previous Story Intelligence (15-2)

- Story 15-2 added per-story cost tracking. Pattern: extend types first, then wire into system, then tests.
- 4624 tests at end of 15-2. Expect to add ~15-20 new tests.
- Build is clean. TypeScript strict mode is on.
- Key learning: keep renderer/controller changes minimal; the per-story cost bug from 15-2 code review (cost-loss on story key change) shows that state transitions need careful snapshot logic. This story doesn't touch renderer state, so no similar risk.

### Git Intelligence

Last commits:
- `bdca2ca feat: story 15-2-cost-tracking-per-driver — Cost Tracking Per Driver`
- `dcaf19b feat: story 15-1-plugin-pass-through-configuration — Plugin Pass-Through Configuration`

Pattern: stories in Epic 15 follow type-extension → logic → integration → CLI → tests flow.

### References

- [Source: _bmad-output/planning-artifacts/epics-multi-framework.md#Story 6.3: Driver Capability Matrix & Routing Hints]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md — Decision 1, Gap Analysis items 1-2]
- [Source: _bmad-output/planning-artifacts/prd.md — FR36, FR37, FR38]
- [Source: src/lib/agents/types.ts — DriverCapabilities interface, AgentDriver interface]
- [Source: src/lib/agents/drivers/factory.ts — driver registry, listDrivers(), getDriver()]
- [Source: src/lib/agents/drivers/claude-code.ts — ClaudeCodeDriver.capabilities]
- [Source: src/lib/agents/drivers/codex.ts — CodexDriver.capabilities (supportsPlugins: false)]
- [Source: src/lib/agents/drivers/opencode.ts — OpenCodeDriver.capabilities]
- [Source: src/lib/workflow-engine.ts — checkDriverHealth(), runWorkflow() line 914]
- [Source: src/lib/agents/index.ts — public API re-exports]
- [Source: src/index.ts — CLI command registration pattern]

## Files to Change

- `src/lib/agents/types.ts` — Add `costTier: number` to `DriverCapabilities`; add `CapabilityWarning` interface
- `src/lib/agents/drivers/claude-code.ts` — Add `costTier: 3` to capabilities
- `src/lib/agents/drivers/codex.ts` — Add `costTier: 1` to capabilities
- `src/lib/agents/drivers/opencode.ts` — Add `costTier: 2` to capabilities
- `src/lib/agents/drivers/factory.ts` — Add `suggestCheaperDriver()` function
- `src/lib/agents/capability-check.ts` — NEW: `checkCapabilityConflicts()` function
- `src/lib/agents/index.ts` — Export new functions and types
- `src/lib/workflow-engine.ts` — Call `checkCapabilityConflicts()` in `runWorkflow()` after health check
- `src/commands/drivers.ts` — NEW: `registerDriversCommand()` for `codeharness drivers` CLI
- `src/index.ts` — Register drivers command
- `src/lib/agents/__tests__/factory.test.ts` — Tests for `suggestCheaperDriver()`
- `src/lib/agents/__tests__/capability-check.test.ts` — NEW: Tests for `checkCapabilityConflicts()`
- `src/commands/__tests__/drivers.test.ts` — NEW: Tests for drivers CLI command
- `src/lib/agents/__tests__/types.test.ts` — Update for `costTier` field

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/15-3-driver-capability-matrix-routing-hints-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/15-3-driver-capability-matrix-routing-hints.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

### Change Log

- 2026-04-03: Story created with 12 ACs covering FR36, FR37, FR38. New CLI command `codeharness drivers`, capability conflict pre-flight check, and cost-based routing hints. Status set to ready-for-dev.
- 2026-04-03: Implementation complete. All 9 tasks done. 4648 tests pass (172 files). Build clean. Status set to review.

### File List
