# Story 4.3: Testing, Coverage & Quality Gates

Status: ready-for-dev

## Story

As a developer,
I want the harness to enforce 100% test coverage as a quality gate,
So that no blind spots accumulate across stories.

## Acceptance Criteria

1. **Given** a Node.js project, **When** `src/lib/coverage.ts` detects the coverage tool, **Then** c8 is identified as the coverage tool (from Vitest config or package.json), **And** detection is automatic — no manual configuration required.

2. **Given** a Python project, **When** `src/lib/coverage.ts` detects the coverage tool, **Then** coverage.py is identified as the coverage tool, **And** detection is automatic.

3. **Given** the pre-commit quality gate, **When** tests need to run as part of the gate, **Then** `coverage.ts` runs the project's test suite with coverage enabled, **And** test results are captured: pass count, fail count, coverage percentage, **And** if tests fail, `codeharness state set tests_passed false` is called, **And** if tests pass, `codeharness state set tests_passed true` is called.

4. **Given** tests pass with coverage data, **When** coverage is evaluated against the 100% target, **Then** if coverage >= 100%, `codeharness state set coverage_met true`, **And** if coverage < 100%, `codeharness state set coverage_met false`, **And** coverage percentage is printed: `[OK] Coverage: 100%` or `[FAIL] Coverage: 87% (target: 100%)`.

5. **Given** a story is being completed, **When** coverage delta is calculated, **Then** the change in coverage from before the story to after is reported, **And** delta is printed: `[INFO] Coverage delta: +4% (96% -> 100%)`.

6. **Given** the state file has `coverage.baseline` as null (first run), **When** coverage is measured, **Then** baseline is set to the current coverage value, **And** subsequent runs compare against baseline for delta.

## Tasks / Subtasks

- [ ] Task 1: Create `src/lib/coverage.ts` — coverage tool detection (AC: #1, #2)
  - [ ] 1.1: Define `CoverageToolInfo` interface: `{ tool: 'c8' | 'coverage.py' | 'unknown', runCommand: string, reportFormat: string }`. `runCommand` is the full shell command to run tests with coverage (e.g., `npx vitest run --coverage --reporter=json` for Node.js, `coverage run -m pytest && coverage json` for Python). `reportFormat` identifies how to parse the output.
  - [ ] 1.2: Implement `detectCoverageTool(dir?: string): CoverageToolInfo` — for Node.js: check `vitest.config.ts` / `vitest.config.js` for `coverage` block, check `package.json` for `@vitest/coverage-v8` or `c8` in devDependencies, check for `jest` with `--coverage` support. For Python: check for `coverage` or `pytest-cov` in `requirements.txt` / `pyproject.toml`. Return `unknown` if nothing detected with a warning.
  - [ ] 1.3: Implement `getTestCommand(dir?: string): string` — detect the test runner from package.json scripts (`test:coverage`, `test:unit`, `test`) or Python equivalents. For Node.js with Vitest: `npx vitest run --coverage`. For Node.js with Jest: `npx jest --coverage --coverageReporters=json-summary`. For Python with coverage.py: `coverage run -m pytest && coverage json`.
  - [ ] 1.4: Read `coverage.tool` from state file if already set (from `codeharness init`), use as hint but verify against actual project config. If state says `c8` but project has no Vitest, re-detect.

- [ ] Task 2: Implement coverage execution and parsing in `src/lib/coverage.ts` (AC: #3, #4)
  - [ ] 2.1: Implement `runCoverage(dir?: string): CoverageResult` where `CoverageResult = { success: boolean, testsPassed: boolean, passCount: number, failCount: number, coveragePercent: number, rawOutput: string }`. Execute the detected test command via `execSync` or `execFileSync`, capture stdout/stderr.
  - [ ] 2.2: Parse Vitest/c8 JSON coverage output (from `coverage/coverage-summary.json`): extract `total.lines.pct`, `total.branches.pct`, `total.functions.pct`, `total.statements.pct`. Use `statements.pct` as the primary coverage metric.
  - [ ] 2.3: Parse coverage.py JSON output (from `coverage.json`): extract `totals.percent_covered`. This is the primary coverage metric for Python.
  - [ ] 2.4: Determine test pass/fail from exit code: exit 0 = tests passed, non-zero = tests failed. Also parse test output for pass/fail counts if available (Vitest outputs `Tests  X passed | Y failed`).
  - [ ] 2.5: Handle execution errors gracefully: if test command not found, return `{ success: false, testsPassed: false, passCount: 0, failCount: 0, coveragePercent: 0, rawOutput: 'Test command not found' }`. If coverage report file missing, return `success: true, testsPassed: true` but `coveragePercent: 0` with warning.

- [ ] Task 3: Implement coverage evaluation and state updates in `src/lib/coverage.ts` (AC: #3, #4, #5, #6)
  - [ ] 3.1: Implement `evaluateCoverage(result: CoverageResult, dir?: string): CoverageEvaluation` where `CoverageEvaluation = { met: boolean, target: number, actual: number, delta: number | null, baseline: number | null }`. Read `coverage.target` from state (default 100), compare `result.coveragePercent` against target.
  - [ ] 3.2: Implement baseline management: read `coverage.baseline` from state. If null (first run), set baseline to current coverage. Calculate delta: `current - baseline`. Update state: `coverage.current = result.coveragePercent`, `coverage.baseline = baseline ?? result.coveragePercent`.
  - [ ] 3.3: Implement `updateCoverageState(result: CoverageResult, evaluation: CoverageEvaluation, dir?: string): void` — uses `readStateWithBody()` / `writeState()` to update: `session_flags.tests_passed = result.testsPassed`, `session_flags.coverage_met = evaluation.met`, `coverage.current = evaluation.actual`, `coverage.baseline` (set if null).
  - [ ] 3.4: Implement `formatCoverageOutput(evaluation: CoverageEvaluation): string[]` — returns array of output lines using `ok()`, `fail()`, `info()` format: `[OK] Coverage: 100%` or `[FAIL] Coverage: 87% (target: 100%)`, and `[INFO] Coverage delta: +4% (96% -> 100%)` when delta is available.

- [ ] Task 4: Create `codeharness coverage` CLI subcommand in `src/commands/coverage.ts` (AC: #1-#6)
  - [ ] 4.1: Register `coverage` command in `src/index.ts` with Commander.js. Options: `--json` (machine-readable output), `--check-only` (evaluate without running tests — reads last coverage report), `--story <id>` (associate coverage delta with a specific story).
  - [ ] 4.2: Implement command action: call `detectCoverageTool()`, `runCoverage()`, `evaluateCoverage()`, `updateCoverageState()`. Print formatted output using `ok()`, `fail()`, `info()` from output utilities.
  - [ ] 4.3: JSON output structure: `{ status: 'ok'|'fail', testsPassed: boolean, passCount: number, failCount: number, coveragePercent: number, target: number, met: boolean, delta: number|null, baseline: number|null, tool: string }`.
  - [ ] 4.4: Exit codes: 0 if tests pass and coverage met, 1 if tests fail or coverage not met, 2 if invalid usage.
  - [ ] 4.5: `--check-only` mode: skip running tests, read the most recent coverage report file directly. Useful for hooks that need to check coverage without re-running the full suite.

- [ ] Task 5: Integrate coverage gate into sprint execution skill (AC: #3, #4)
  - [ ] 5.1: The sprint execution skill (`/harness-run` from Epic 0) needs to call `codeharness coverage` as a gate before marking a story `done`. Locate the skill definition (likely in `skills/` or `commands/` in the plugin directory) and add the gate step.
  - [ ] 5.2: Gate sequence in story-completion flow: (1) run tests with coverage via `codeharness coverage`, (2) check `tests_passed` and `coverage_met` flags, (3) if either is false, retry implementation before proceeding, (4) if both true, proceed to verification (Story 4.1's `codeharness verify`).
  - [ ] 5.3: If `codeharness coverage` is not installed or fails, the gate should warn but not hard-block (graceful degradation). The pre-commit-gate hook (Story 4.2) provides the hard block on commit.

- [ ] Task 6: Create unit tests for `src/lib/coverage.ts` (AC: #1-#6)
  - [ ] 6.1: Create `src/lib/__tests__/coverage.test.ts`. Test `detectCoverageTool()`: mock filesystem with `package.json` containing `@vitest/coverage-v8` → expect `c8`, mock with `requirements.txt` containing `coverage` → expect `coverage.py`, mock with no indicators → expect `unknown`.
  - [ ] 6.2: Test `runCoverage()`: mock `execSync` to return sample Vitest JSON output, verify parsed `CoverageResult` has correct `coveragePercent`, `testsPassed`, `passCount`, `failCount`. Test with failed test run (non-zero exit code). Test with missing coverage report file.
  - [ ] 6.3: Test `evaluateCoverage()`: test with 100% coverage and target 100 → `met: true`. Test with 87% and target 100 → `met: false`. Test with null baseline → baseline set to current. Test delta calculation: baseline 90, current 100 → delta +10.
  - [ ] 6.4: Test `updateCoverageState()`: verify state file is updated with correct `session_flags.tests_passed`, `session_flags.coverage_met`, `coverage.current`, `coverage.baseline`. Use real state file read/write (tmpdir pattern from existing tests).
  - [ ] 6.5: Test `formatCoverageOutput()`: verify output strings match expected format for passing and failing cases.

- [ ] Task 7: Create unit tests for `src/commands/coverage.ts` (AC: #1-#6)
  - [ ] 7.1: Create `src/commands/__tests__/coverage.test.ts`. Test the full command flow: mock the underlying coverage functions, verify CLI output format matches expectations for text and JSON modes.
  - [ ] 7.2: Test `--json` flag: verify JSON output structure matches spec from Task 4.3.
  - [ ] 7.3: Test `--check-only` flag: verify tests are not re-run, only coverage report is read.
  - [ ] 7.4: Test exit codes: 0 for pass, 1 for fail, 2 for invalid usage.
  - [ ] 7.5: Test error handling: state file not found → `[FAIL]` with exit 1.

- [ ] Task 8: Create BATS integration test for coverage command (AC: #1-#6)
  - [ ] 8.1: Create `tests/coverage_gate.bats` (or extend `tests/coverage_report.bats`). Test `codeharness coverage` as a subprocess with a real state file.
  - [ ] 8.2: Set up a minimal Node.js project fixture with a single test file and Vitest config. Run `codeharness coverage` and verify: exit code 0, state file updated with `tests_passed: true`, `coverage_met: true`, coverage percentage printed.
  - [ ] 8.3: Test with a project that has failing tests: verify exit code 1, `tests_passed: false`.
  - [ ] 8.4: Test with no test runner detected: verify graceful failure with actionable error message.
  - [ ] 8.5: Test `--json` output: parse JSON output and verify fields.

- [ ] Task 9: Build and verify (AC: #1-#6)
  - [ ] 9.1: Run `npm run build` — verify tsup compiles successfully with new `coverage.ts` and `coverage` command.
  - [ ] 9.2: Run `npm run test:unit` — all tests pass including new coverage tests.
  - [ ] 9.3: Run `npm run test:coverage` — verify 100% coverage for all new code in `src/`.
  - [ ] 9.4: Manual test: run `codeharness coverage` in the codeharness project itself — verify it detects c8/Vitest, runs tests, reports coverage.
  - [ ] 9.5: Manual test: run `codeharness coverage --json` — verify JSON output format.
  - [ ] 9.6: Verify state file is updated: `coverage.current`, `coverage.baseline`, `session_flags.tests_passed`, `session_flags.coverage_met` all reflect actual results.

## Dev Notes

### This Story Is the Third in Epic 4

Story 4.1 (Verification Pipeline) and Story 4.2 (Hook Architecture & Enforcement) are both done. Story 4.1 established the verification orchestration and Showboat proof pipeline. Story 4.2 established the hook architecture including `pre-commit-gate.sh` which checks `tests_passed` and `coverage_met` session flags. This story provides the mechanism that actually sets those flags based on real test runs and coverage measurements.

### What Already Exists

**State infrastructure (from Epic 1):**
- `src/lib/state.ts` — Full state file read/write with nested value support. State already has `coverage` block with `target: 100`, `baseline: null`, `current: null`, `tool: 'c8'`. Session flags `tests_passed` and `coverage_met` exist and are checked by hooks.
- `src/commands/state.ts` — `state show`, `state get`, `state set`, `state reset-session` subcommands. Used by hooks and verification pipeline to mutate session flags.

**Hook enforcement (from Story 4.2):**
- `hooks/pre-commit-gate.sh` — Checks `tests_passed`, `coverage_met`, `verification_run` flags. Blocks commit if any is false. This story's coverage command sets `tests_passed` and `coverage_met` — the flags that the hook reads.
- `hooks/post-test-verify.sh` — Fires after test commands, prompts agent to query logs. Detects test commands: `npm test`, `npm run test`, `pytest`, `jest`, `vitest`, `cargo test`, `go test`, `bats`.

**Stack detection (from Epic 1):**
- `src/lib/stack-detect.ts` — Detects `nodejs` (from `package.json`) or `python` (from `requirements.txt` / `pyproject.toml` / `setup.py`). Coverage tool detection should align with this detection — Node.js stack uses c8/Vitest, Python stack uses coverage.py.

**Test infrastructure:**
- Vitest for unit tests (`src/**/__tests__/*.test.ts`), BATS for integration tests (`tests/*.bats`).
- `vitest.config.ts` — Already configured with v8 coverage provider.
- `package.json` scripts: `test:unit` (vitest run), `test:coverage` (vitest run --coverage).
- Existing BATS test `tests/coverage_report.bats` — Tests the legacy `retro.sh --coverage` command for generating coverage reports. This is the Ralph/retro layer, not the CLI layer. The new `codeharness coverage` command replaces this for the CLI.

**Verification pipeline (from Story 4.1):**
- `src/commands/verify.ts` — Calls `checkPreconditions()` which reads `tests_passed` and `coverage_met` flags. If either is false, verification is blocked. This story ensures those flags get set by real test/coverage runs before verification can proceed.
- `src/lib/verify.ts` — `checkPreconditions()` function reads session flags.

### Architecture Decisions That Apply

- **Decision 1 (CLI <-> Plugin Boundary):** Coverage detection, test execution, and state updates belong in the CLI (`src/lib/coverage.ts`). The sprint skill calls the CLI command. Hooks read the resulting state flags.
- **Decision 2 (State Management):** Session flag lifecycle: tests pass -> CLI sets `tests_passed = true`, coverage meets target -> CLI sets `coverage_met = true`. The pre-commit gate reads these flags.
- **FR52-FR55 mapping:** FR52 (100% coverage enforcement) = evaluateCoverage with target 100, FR53 (per-commit test running) = runCoverage called from coverage command, FR54 (coverage tool detection per stack) = detectCoverageTool, FR55 (coverage delta per story) = evaluateCoverage delta calculation.

### Coverage Tool Detection Strategy

**Node.js stack:**
1. Check `vitest.config.ts` / `vitest.config.js` for `coverage` block -> c8 (Vitest uses c8/v8 internally)
2. Check `package.json` devDependencies for `@vitest/coverage-v8` or `@vitest/coverage-istanbul` -> c8
3. Check `package.json` devDependencies for `c8` -> c8
4. Check `package.json` devDependencies for `jest` -> jest --coverage
5. Fallback: check for `nyc` or `istanbul` -> nyc

**Python stack:**
1. Check `requirements.txt` or `pyproject.toml` for `coverage` -> coverage.py
2. Check for `pytest-cov` -> coverage.py (pytest-cov wraps coverage.py)
3. Fallback: check for `coverage` command availability

**Test command detection:**
- Node.js: prefer `package.json` scripts in order: `test:coverage` -> `test:unit` -> `test`
- Python: prefer `pytest` if available, fall back to `python -m unittest`
- Always wrap with coverage tool: `npx vitest run --coverage` or `coverage run -m pytest`

### Coverage Report Parsing

**Vitest/c8 JSON output** (at `coverage/coverage-summary.json`):
```json
{
  "total": {
    "lines": { "total": 100, "covered": 95, "skipped": 0, "pct": 95 },
    "statements": { "total": 120, "covered": 115, "skipped": 0, "pct": 95.83 },
    "functions": { "total": 30, "covered": 28, "skipped": 0, "pct": 93.33 },
    "branches": { "total": 40, "covered": 38, "skipped": 0, "pct": 95 }
  }
}
```
Use `total.statements.pct` as primary metric.

**coverage.py JSON output** (at `coverage.json`):
```json
{
  "totals": {
    "covered_lines": 95,
    "num_statements": 100,
    "percent_covered": 95.0
  }
}
```
Use `totals.percent_covered` as primary metric.

### Sprint Skill Integration

The epic-level note says: "Implement coverage gate as an enhancement to the sprint execution skill. The skill checks tests pass and coverage is met before marking a story `done`."

The sprint skill (`/harness-run` from Epic 0, Story 0.1) follows this flow per story:
1. `create-story` workflow -> `ready-for-dev`
2. `dev-story` workflow -> `in-progress`
3. **NEW: `codeharness coverage` -> set `tests_passed`, `coverage_met`**
4. `codeharness verify --story <id>` -> set `verification_run` (from Story 4.1)
5. `code-review` workflow -> `done`

The coverage gate (step 3) should be added to the skill definition. If coverage fails, the skill should retry the dev-story workflow (the agent needs to fix tests/add coverage before proceeding).

### What NOT To Do

- **Do NOT modify hook scripts** — that's Story 4.2 (done). Hooks read state flags; this story sets them.
- **Do NOT implement doc freshness checks** — that's Story 4.4.
- **Do NOT modify the verification pipeline** — that's Story 4.1 (done). Verification reads `tests_passed` and `coverage_met` as preconditions.
- **Do NOT hardcode coverage results** — run real tests, parse real coverage reports.
- **Do NOT use `console.log` directly** — use output utilities from `src/lib/output.ts`.
- **Do NOT add `any` types** — strict TypeScript.
- **Do NOT mock the test runner in production code** — `runCoverage()` must execute the real test suite. Mocking is for unit tests only.

### Scope Boundaries

**IN SCOPE (this story):**
- Create `src/lib/coverage.ts` with tool detection, test execution, coverage parsing, evaluation, state updates
- Create `src/commands/coverage.ts` CLI command
- Register coverage command in `src/index.ts`
- Integrate coverage gate into sprint skill story-completion flow
- Unit tests for `src/lib/coverage.ts` and `src/commands/coverage.ts`
- BATS integration test for the coverage command

**OUT OF SCOPE (other stories):**
- Hook modifications (Story 4.2 — done)
- Verification pipeline (Story 4.1 — done)
- Doc freshness enforcement (Story 4.4)
- Ralph integration (Epic 5)
- Onboarding coverage gap analysis (Epic 6, `src/lib/scanner.ts`)

### Dependencies

- **Depends on:** Story 4.1 (verification pipeline checks `tests_passed` and `coverage_met` preconditions) — DONE. Story 4.2 (pre-commit-gate.sh reads `tests_passed` and `coverage_met` flags) — DONE. Story 1.2 (core libraries — state.ts, stack-detect.ts) — DONE.
- **Depended on by:** Story 4.4 (doc freshness uses similar gate pattern in sprint skill), Story 5.1 (Ralph sessions will run `codeharness coverage` as part of story completion).

### Carried Action Items from Epic 3 Retrospective

- **A1:** Add integration test that runs `codeharness init` as subprocess — address if scope allows in Task 8, otherwise carry to dedicated tech-debt story.
- **A3:** Improve branch coverage to 95%+ — new CLI code in this story must have 100% coverage. The coverage command itself will be able to measure and enforce this going forward.

### New npm Dependencies

None. Uses Node.js built-ins (`child_process.execSync`, `fs`, `path`) and existing project dependencies (`yaml`, `commander`).

### Files Modified

| File | Change |
|------|--------|
| `src/index.ts` | Register `coverage` command via `registerCoverageCommand()` |

### New Files Created

| File | Purpose |
|------|---------|
| `src/lib/coverage.ts` | Coverage tool detection, test execution, parsing, evaluation, state updates (FR52-FR55) |
| `src/commands/coverage.ts` | `codeharness coverage` CLI command with `--json`, `--check-only`, `--story` options |
| `src/lib/__tests__/coverage.test.ts` | Unit tests for coverage.ts |
| `src/commands/__tests__/coverage.test.ts` | Unit tests for coverage command |
| `tests/coverage_gate.bats` | BATS integration test for coverage command |

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 4, Story 4.3]
- [Source: _bmad-output/planning-artifacts/architecture.md — Testing (FR52-FR55) maps to `src/lib/coverage.ts` + `hooks/pre-commit-gate.sh`]
- [Source: _bmad-output/planning-artifacts/prd.md — FR52-FR55 (Testing & Coverage)]
- [Source: src/lib/state.ts — HarnessState interface with `coverage` and `session_flags` blocks]
- [Source: src/lib/stack-detect.ts — Stack detection for coverage tool alignment]
- [Source: vitest.config.ts — Existing Vitest config with v8 coverage provider]
- [Source: hooks/pre-commit-gate.sh — Reads `tests_passed` and `coverage_met` flags]
- [Source: src/lib/verify.ts — checkPreconditions() reads `tests_passed` and `coverage_met`]
- [Source: _bmad-output/implementation-artifacts/epic-3-retrospective.md — Carried action items A1, A3]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/4-3-testing-coverage-quality-gates.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100% of all new code in src/)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (src/lib — coverage.ts; src/commands — coverage.ts)
- [ ] Exec-plan created in `docs/exec-plans/active/4-3-testing-coverage-quality-gates.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for coverage command (BATS)
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
