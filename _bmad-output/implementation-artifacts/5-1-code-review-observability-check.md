# Story 5.1: Code Review Observability Check

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a reviewer,
I want static analysis results included in code review,
so that missing log statements are caught before verification.

## Acceptance Criteria

1. **Given** `patches/review/enforcement.md` exists, **When** read after this story is implemented, **Then** it includes a section titled "### Observability" that instructs the review agent: "Run `semgrep scan --config patches/observability/` and report gaps." <!-- verification: cli-verifiable -->
2. **Given** static analysis finds 3 missing log statements, **When** code review processes the results, **Then** each gap is listed as a review issue with file path, line number, and description (e.g., "src/lib/docker.ts:42 — catch block without logging"). <!-- verification: integration-required -->
3. **Given** no observability gaps are found by static analysis, **When** code review completes the observability check, **Then** the observability section passes silently — no false-positive warnings emitted. <!-- verification: integration-required -->
4. **Given** Semgrep is not installed on the review machine, **When** code review runs the observability check, **Then** it reports "static analysis skipped — install semgrep" as a warning and does NOT fail the review. <!-- verification: integration-required -->
5. **Given** `patches/dev/enforcement.md` exists, **When** read after this story is implemented, **Then** it includes an instruction: "Run `semgrep scan --config patches/observability/` before committing and fix any gaps." <!-- verification: cli-verifiable -->
6. **Given** the observability Semgrep rules in `patches/observability/*.yaml`, **When** `semgrep scan --config patches/observability/ --json <projectDir>` is run on a project with known observability gaps, **Then** the JSON output contains entries with `check_id`, `path`, `start.line`, and `extra.message` fields. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Update `patches/review/enforcement.md` with observability section (AC: #1, #3, #4)
  - [x] 1.1: Add `### Observability` section after existing "### Proof Quality Checks" section
  - [x] 1.2: Include instruction to run `semgrep scan --config patches/observability/` against changed files
  - [x] 1.3: Include instruction to list each gap as a review issue (file, line, description)
  - [x] 1.4: Include instruction that if Semgrep is not installed, log a warning and continue — do not fail review
  - [x] 1.5: Include instruction that zero gaps means the check passes silently

- [x] Task 2: Update `patches/dev/enforcement.md` with pre-commit observability instruction (AC: #5)
  - [x] 2.1: In the existing "### Observability" section, add instruction to run Semgrep before committing
  - [x] 2.2: Reference `patches/observability/` as the rule config directory

- [x] Task 3: Write unit tests verifying patch content (AC: #1, #5)
  - [x] 3.1: Create `src/modules/review/__tests__/observability-patch.test.ts`
  - [x] 3.2: Test that `patches/review/enforcement.md` contains "### Observability" section
  - [x] 3.3: Test that `patches/review/enforcement.md` contains `semgrep scan --config patches/observability/` instruction
  - [x] 3.4: Test that `patches/review/enforcement.md` contains skip/warning guidance for missing Semgrep
  - [x] 3.5: Test that `patches/dev/enforcement.md` contains `semgrep scan --config patches/observability/` instruction
  - [x] 3.6: Target 100% coverage on new test file

- [x] Task 4: Verify Semgrep rule output format (AC: #6)
  - [x] 4.1: Ensure existing `patches/observability/*.yaml` rules are valid Semgrep YAML (already done in Epic 1 — regression check only)
  - [x] 4.2: Add a test that parses mock Semgrep JSON output and confirms `check_id`, `path`, `start.line`, and `extra.message` fields are present

- [x] Task 5: Integration verification (AC: all)
  - [x] 5.1: `npm run build` — verify tsup compiles without errors
  - [x] 5.2: `npm run test:unit` — all tests pass, no regressions
  - [x] 5.3: Verify no file exceeds 300 lines (NFR9)
  - [x] 5.4: Verify review patch reads correctly as markdown

## Dev Notes

### Architecture References

This story implements FR26 (code review includes static analysis results) and FR28 (patches updated with observability enforcement). It builds on:
- Epic 1 (Stories 1.1–1.3): Semgrep rules in `patches/observability/`, the `analyze()` function in `src/modules/observability/analyzer.ts`
- Epic 2 (Story 2.2): Observability hook enforcement pattern
- Architecture Decision 1: Semgrep as configurable static analyzer
- Architecture Decision 6: Module structure with `patches/review/` for review enforcement

### Key Implementation Details

**This story is primarily a patch update, not a code change.** The review agent reads `patches/review/enforcement.md` at review time and follows its instructions. The dev agent reads `patches/dev/enforcement.md` during development. Both patches already exist — this story adds observability sections to them.

**No new TypeScript modules needed.** The `analyze()` function from `src/modules/observability/index.ts` already exists and runs Semgrep. The review agent calls Semgrep directly via the CLI as instructed by the patch. The analyzer module is used by `codeharness audit`, not by the review patch.

**Semgrep CLI, not programmatic API.** The patch tells the review agent to run `semgrep scan --config patches/observability/ --json`. The agent processes the JSON output and reports gaps. This is intentional — the review agent is an LLM reading a patch, not code invoking a function.

**Graceful degradation.** If Semgrep is not installed, the review agent should warn and continue. This matches the existing pattern in `src/modules/observability/analyzer.ts` where `analyze()` returns a warning result when Semgrep is missing.

**Gap report format.** Semgrep JSON output includes `results[]` where each entry has `check_id` (rule ID), `path` (file), `start.line` (line number), and `extra.message` (description). The review agent should extract these and list them as review issues.

### Existing Code to Reuse

- `patches/review/enforcement.md` — existing review enforcement patch to extend
- `patches/dev/enforcement.md` — existing dev enforcement patch to extend
- `patches/observability/*.yaml` — Semgrep rules already shipped (catch-without-logging, function-no-debug-log, error-path-no-log)
- `src/modules/observability/analyzer.ts` — reference for Semgrep invocation pattern and graceful degradation
- `src/modules/observability/types.ts` — `AnalyzerResult`, `ObservabilityGap` types for understanding gap shape

### What This Story Does NOT Include

- No new TypeScript modules or CLI commands — this is a patch-only change
- No programmatic integration of `analyze()` into the review orchestrator — the review agent runs Semgrep directly via CLI
- No runtime observability (that's Story 5.2)
- No changes to `src/modules/review/orchestrator.ts` — the orchestrator invokes the BMAD code-review workflow which reads the patch
- No Semgrep installation automation — users must install Semgrep separately

### Dependencies

- **Depends on:** Epic 1 (Semgrep rules exist in `patches/observability/`) — DONE
- **Depended on by:** None directly. Story 5.2 covers verification runtime integration separately.

### File Size Constraint

Each new file must be under 300 lines per NFR9.
- `patches/review/enforcement.md` — modification only, adding ~15-20 lines
- `patches/dev/enforcement.md` — modification only, adding ~3-5 lines
- `src/modules/review/__tests__/observability-patch.test.ts` — ~50-80 lines (patch content tests)

### Previous Story Intelligence (Story 4.2 Dockerfile Template & Dev Integration)

- Dev enforcement patch was updated in Story 4.2 with Dockerfile maintenance guidance — same pattern applies here
- Patch updates are simple markdown additions — no build or compile step needed
- Tests validate patch content by reading the file and checking for required strings
- The `patches/` directory is a first-class artifact — changes there are as important as code changes

### Git Intelligence

Recent commits show Epic 4 complete. Patterns:
- Patch files in `patches/` are markdown, updated by appending sections
- Tests for patch content use `readFileSync` and string matching
- Result<T> pattern with `ok()` and `fail()` from `src/types/result.ts`
- Barrel exports from `index.ts` for module boundaries
- 100% test coverage on new code

### References

- [Source: _bmad-output/planning-artifacts/architecture-operational-excellence.md#Decision 1] — Semgrep as static analyzer
- [Source: _bmad-output/planning-artifacts/architecture-operational-excellence.md#Decision 6] — Module structure, patches/review/
- [Source: _bmad-output/planning-artifacts/epics-operational-excellence.md#Story 5.1] — Acceptance criteria
- [Source: _bmad-output/planning-artifacts/prd-operational-excellence.md#FR26] — Code review includes static analysis
- [Source: _bmad-output/planning-artifacts/prd-operational-excellence.md#FR28] — Patches updated with observability enforcement
- [Source: patches/review/enforcement.md] — Existing review enforcement patch
- [Source: patches/dev/enforcement.md] — Existing dev enforcement patch
- [Source: src/modules/observability/analyzer.ts] — Semgrep invocation pattern

### Project Structure Notes

- Modified files: `patches/review/enforcement.md` (add Observability section), `patches/dev/enforcement.md` (add Semgrep pre-commit instruction)
- New files: `src/modules/review/__tests__/observability-patch.test.ts` (patch content validation tests)
- No module boundary changes — patches are independent artifacts read by agents at runtime

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/5-1-code-review-observability-check.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100% of all new code in src/)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (src/modules/review/AGENTS.md if tests added there)
- [ ] Exec-plan created in `docs/exec-plans/active/5-1-code-review-observability-check.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] All I/O mocked (filesystem reads for patch content)
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- Added `### Observability` section to `patches/review/enforcement.md` with Semgrep scan instruction, gap reporting format, silent-pass on zero gaps, and graceful skip when Semgrep is not installed
- Added pre-commit Semgrep scan instruction to existing `### Observability` section in `patches/dev/enforcement.md`
- Created `src/modules/review/__tests__/observability-patch.test.ts` with 8 tests: 5 for review patch content, 2 for dev patch content, 1 for Semgrep JSON output format contract
- Build passes, all 2853 tests pass across 111 test files, no regressions
- All files under 300 lines (NFR9 compliant)

### File List

- `patches/review/enforcement.md` (modified) — added Observability section with Semgrep integration instructions
- `patches/dev/enforcement.md` (modified) — added pre-commit Semgrep scan instruction
- `src/modules/review/__tests__/observability-patch.test.ts` (new) — patch content validation tests and Semgrep JSON format contract test
