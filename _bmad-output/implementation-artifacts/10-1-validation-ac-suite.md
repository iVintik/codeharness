# Story 10.1: Validation AC Suite

Status: verifying

## Story

As a release manager,
I want comprehensive validation ACs covering all harness functionality,
so that self-validation tests every capability and the v1.0 release gate has clear pass/fail criteria.

## Acceptance Criteria

### FR Coverage (40 ACs — one per FR)

1. **Given** `src/commands/init.ts` exists, **When** inspected, **Then** it is a thin wrapper (<100 lines) that delegates to `infra.initProject()`. (FR1) <!-- verification: cli-verifiable -->
2. **Given** shared observability stack running, **When** `infra.detectSharedStack()` called, **Then** returns detected stack info without port conflicts. (FR2) <!-- verification: integration-required -->
3. **Given** `--opensearch-url` passed to init, **When** completed, **Then** sprint-state records `opensearch` backend type. (FR3) <!-- verification: integration-required -->
4. **Given** BMAD not installed, **When** init runs, **Then** `npx bmad-method install --yes --tools claude-code` executes non-interactively. (FR4) <!-- verification: integration-required -->
5. **Given** stale Docker verification containers exist, **When** cleanup runs, **Then** stale containers removed before new verification. (FR5) <!-- verification: integration-required -->
6. **Given** `--opensearch-url` pointing to remote endpoint, **When** init runs, **Then** no local Docker stack started. (FR6) <!-- verification: integration-required -->
7. **Given** `getNextStory()` called with mixed-epic backlog, **When** evaluated, **Then** returns story with highest priority tier (proof-exists > in-progress > verifying > backlog). (FR7) <!-- verification: cli-verifiable -->
8. **Given** `src/modules/sprint/state.ts` exists, **When** `getSprintState()` called, **Then** returns `Result<SprintState>` from single `sprint-state.json`. (FR8) <!-- verification: cli-verifiable -->
9. **Given** ralph running for 8+ hours, **When** monitored, **Then** no crashes, no memory leaks, no unrecoverable state. (FR9) <!-- verification: integration-required -->
10. **Given** attempt counts in sprint-state.json, **When** ralph session restarts, **Then** attempt counts persist across sessions. (FR10) <!-- verification: cli-verifiable -->
11. **Given** story with attempts >= 10, **When** `getNextStory()` evaluates it, **Then** skipped with reason "retry-exhausted". (FR11) <!-- verification: cli-verifiable -->
12. **Given** any iteration (success, failure, or timeout), **When** completed, **Then** report file exists with non-zero content. (FR12) <!-- verification: cli-verifiable -->
13. **Given** `verifyStory(key)` called, **When** spawning verifier, **Then** runs in isolated Docker container via docker exec. (FR13) <!-- verification: integration-required -->
14. **Given** verifier running in Docker, **When** executing CLI commands, **Then** captures stdout/stderr as proof evidence. (FR14) <!-- verification: integration-required -->
15. **Given** observability backend configured, **When** verifier queries endpoints, **Then** query results included in proof. (FR15) <!-- verification: integration-required -->
16. **Given** web project with UI ACs, **When** agent-browser verification runs, **Then** screenshots captured and referenced in proof. (FR16) <!-- verification: integration-required -->
17. **Given** proof document with `[FAIL]` verdict outside code blocks, **When** `parseProof()` called, **Then** detects and counts FAIL verdicts. (FR17) <!-- verification: cli-verifiable -->
18. **Given** proof document with `[ESCALATE]` verdict, **When** `parseProof()` called, **Then** detects and counts ESCALATE separately from FAIL. (FR18) <!-- verification: cli-verifiable -->
19. **Given** any project type (CLI, plugin, web), **When** verification runs, **Then** never refuses — adapts approach based on type. (FR19) <!-- verification: integration-required -->
20. **Given** verifier spawns `claude --print`, **When** invoked, **Then** includes `--allowedTools` flag. (FR20) <!-- verification: cli-verifiable -->
21. **Given** `reviewStory(key)` called, **When** review module invoked, **Then** orchestrates BMAD code-review workflow and returns `Result<ReviewResult>`. (FR21) <!-- verification: integration-required -->
22. **Given** review returns story to in-progress, **When** detected, **Then** re-triggers dev module with review findings. (FR22) <!-- verification: integration-required -->
23. **Given** review module throws or fails, **When** caught, **Then** returns `Result` error — sprint execution continues. (FR23) <!-- verification: cli-verifiable -->
24. **Given** `developStory(key)` called, **When** dev module invoked, **Then** orchestrates BMAD dev-story workflow and returns `Result<DevResult>`. (FR24) <!-- verification: integration-required -->
25. **Given** verification finds code bugs, **When** processed, **Then** story returned to dev with failing AC details. (FR25) <!-- verification: integration-required -->
26. **Given** dev module throws or fails, **When** caught, **Then** returns `Result` error — sprint execution continues. (FR26) <!-- verification: cli-verifiable -->
27. **Given** `codeharness status` called, **When** measured, **Then** returns in <3 seconds. (FR27) <!-- verification: cli-verifiable -->
28. **Given** active or completed run, **When** `codeharness status` called, **Then** shows done/failed/blocked/in-progress counts with per-story detail. (FR28) <!-- verification: cli-verifiable -->
29. **Given** failed story in status, **When** displayed, **Then** shows story ID, AC number, one-line error, suggested fix. (FR29) <!-- verification: cli-verifiable -->
30. **Given** `codeharness status --story <id>` called, **When** story exists, **Then** shows each AC with PASS/FAIL/ESCALATE and attempt history. (FR30) <!-- verification: cli-verifiable -->
31. **Given** completed run, **When** status displayed, **Then** includes cost, duration, and iteration count. (FR31) <!-- verification: cli-verifiable -->
32. **Given** OpenSearch backend configured, **When** `queryLogs()` called, **Then** queries OpenSearch `_search` API and returns results. (FR32) <!-- verification: integration-required -->
33. **Given** BMAD patches directory, **When** `applyAllPatches()` called, **Then** applies patches encoding real operational learnings per module role. (FR33) <!-- verification: cli-verifiable -->
34. **Given** patches in `patches/{role}/`, **When** inspected, **Then** all are markdown files — no hardcoded strings used for content. (FR34) <!-- verification: cli-verifiable -->
35. **Given** `patches/{dev,review,verify,sprint,retro}/` directories, **When** patch loader runs, **Then** loads from role-specific subdirectory. (FR35) <!-- verification: cli-verifiable -->
36. **Given** each patch file, **When** inspected, **Then** includes `## WHY` section with architectural reasoning. (FR36) <!-- verification: cli-verifiable -->
37. **Given** any module function (infra, sprint, verify, dev, review), **When** it fails, **Then** returns `Result` with error — never throws uncaught. (FR37) <!-- verification: cli-verifiable -->
38. **Given** each module directory `src/modules/{infra,sprint,verify,dev,review}/index.ts`, **When** imported, **Then** exports typed functions — no `any` types. (FR38) <!-- verification: cli-verifiable -->
39. **Given** each module, **When** inspected, **Then** owns its own state — does not read/write another module's state files. (FR39) <!-- verification: cli-verifiable -->
40. **Given** CLI command files in `src/commands/`, **When** measured, **Then** each is <100 lines (thin wrappers calling module functions). (FR40) <!-- verification: cli-verifiable -->

### NFR Coverage (key NFRs)

41. **Given** any module function, **When** it encounters an error, **Then** returns structured `Result` — no uncaught exceptions crash the system. (NFR1) <!-- verification: cli-verifiable -->
42. **Given** 8+ hour ralph run, **When** monitored, **Then** no crashes, memory leaks, or unrecoverable state. (NFR2) <!-- verification: integration-required -->
43. **Given** any ralph iteration including timeout, **When** completed, **Then** report file is non-zero bytes. (NFR3) <!-- verification: cli-verifiable -->
44. **Given** `updateStoryStatus()` writing sprint-state.json, **When** inspected, **Then** uses atomic write pattern (temp file + rename). (NFR4) <!-- verification: cli-verifiable -->
45. **Given** all bash scripts in the project, **When** inspected, **Then** none use `set -e`. (NFR5) <!-- verification: cli-verifiable -->
46. **Given** `codeharness status` called, **When** measured, **Then** returns in <3 seconds. (NFR7) <!-- verification: cli-verifiable -->
47. **Given** all source files in `src/`, **When** measured, **Then** no file exceeds 300 lines. (NFR18) <!-- verification: cli-verifiable -->
48. **Given** module interfaces in `src/types/`, **When** inspected, **Then** documented with TypeScript types — no `any`. (NFR19) <!-- verification: cli-verifiable -->

### UX Coverage

49. **Given** `codeharness status` output, **When** read, **Then** shows current story, phase, AC progress, iteration, cost, elapsed in one screen. (UX-status-format) <!-- verification: cli-verifiable -->
50. **Given** failed story in status output, **When** read, **Then** includes AC number, command that failed, and output. (UX-error-detail) <!-- verification: cli-verifiable -->
51. **Given** `codeharness status --story <id>`, **When** called, **Then** shows drill-down with per-AC PASS/FAIL/ESCALATE and attempt history. (UX-drill-down) <!-- verification: cli-verifiable -->

### Regression Coverage (v1 verifying stories)

52. **Given** `src/types/result.ts`, **When** imported, **Then** exports `Result<T>`, `ok(data)`, `fail(error, context?)`. (Regression: 1-1) <!-- verification: cli-verifiable -->
53. **Given** `src/modules/{infra,sprint,verify,dev,review}/index.ts`, **When** imported, **Then** each exports typed function stubs or implementations returning `Result<T>`. (Regression: 1-2) <!-- verification: cli-verifiable -->
54. **Given** verify-related tests, **When** located, **Then** exist in `src/modules/verify/__tests__/`. (Regression: 1-3) <!-- verification: cli-verifiable -->
55. **Given** `getSprintState()` with old-format files, **When** called, **Then** auto-migrates to sprint-state.json. (Regression: 2-1) <!-- verification: cli-verifiable -->
56. **Given** `getNextStory()` with retry-exhausted story, **When** called, **Then** skips with reason "retry-exhausted". (Regression: 2-2) <!-- verification: cli-verifiable -->
57. **Given** `codeharness status` in complete run, **When** displayed, **Then** shows done/failed/blocked/skipped counts. (Regression: 2-3) <!-- verification: cli-verifiable -->
58. **Given** timeout (exit 124), **When** captured, **Then** saves git diff, state delta, partial stderr in timeout report. (Regression: 3-1) <!-- verification: cli-verifiable -->
59. **Given** `developStory(key)` with failing workflow, **When** caught, **Then** returns `fail(error)` — never throws. (Regression: 3-2) <!-- verification: cli-verifiable -->
60. **Given** failing ACs from verification, **When** processed, **Then** story status set to in-progress with failing AC details. (Regression: 3-3) <!-- verification: integration-required -->
61. **Given** `verifyStory(key)` called, **When** returns, **Then** `Result<VerifyResult>` includes AC-level results. (Regression: 4-1) <!-- verification: cli-verifiable -->
62. **Given** any project type, **When** verification runs, **Then** adapts approach — CLI uses docker exec, plugin uses claude --print. (Regression: 4-2) <!-- verification: integration-required -->
63. **Given** stale verification containers, **When** cleanup runs before new verification, **Then** removed. (Regression: 4-3) <!-- verification: integration-required -->
64. **Given** `reviewStory(key)` failing, **When** caught, **Then** returns `Result` error — sprint continues. (Regression: 5-1) <!-- verification: cli-verifiable -->
65. **Given** `src/commands/init.ts`, **When** measured, **Then** <100 lines. (Regression: 6-1) <!-- verification: cli-verifiable -->
66. **Given** shared stack running, **When** init detects it, **Then** reuses without port conflicts. (Regression: 6-2) <!-- verification: integration-required -->
67. **Given** BMAD installed, **When** init runs, **Then** skips install and applies patches. (Regression: 6-3) <!-- verification: integration-required -->
68. **Given** no OpenSearch config, **When** `getObservabilityBackend()` called, **Then** returns `VictoriaBackend`. (Regression: 7-1) <!-- verification: cli-verifiable -->
69. **Given** `--opensearch-url` passed, **When** init completes, **Then** state records opensearch backend. (Regression: 7-2) <!-- verification: integration-required -->
70. **Given** `verify/browser.ts` or browser verification module, **When** AC references UI, **Then** uses agent-browser via docker exec. (Regression: 8-1) <!-- verification: integration-required -->
71. **Given** `patches/{dev,review,verify,sprint,retro}/` directories, **When** patch loader runs, **Then** loads from role subdirectory, not flat `patches/*.md`. (Regression: 9-1) <!-- verification: cli-verifiable -->

### Resolved Action Items (regression ACs)

72. **Given** `validateProofQuality()` in verify module, **When** story is unit-testable, **Then** skips `checkBlackBoxEnforcement()` — does not require docker-exec evidence. (Action: session-retro-2026-03-18 A1) <!-- verification: cli-verifiable -->
73. **Given** `import-boundaries.test.ts`, **When** `COMMANDS_DIR` is missing, **Then** test fails (not silently skips). (Action: session-retro-2026-03-18 A3) <!-- verification: cli-verifiable -->
74. **Given** `getObservabilityBackend()` return type, **When** inspected, **Then** consistent with `Result<T>` convention or documented exception. (Action: session-retro-2026-03-18 A4) <!-- verification: cli-verifiable -->
75. **Given** types-only files (interfaces, no statements), **When** coverage measured, **Then** either excluded from coverage or have documented exception — no false 0% alarms. (Action: session-retro-2026-03-18 A5) <!-- verification: cli-verifiable -->
76. **Given** `validateProofQuality()` regex, **When** parsing AC headers, **Then** recognizes both `## AC 1:` and `## AC1:` formats. (Action: session-retro-2026-03-16 B1) <!-- verification: cli-verifiable -->
77. **Given** proof documents with showboat-format evidence blocks, **When** `validateProofQuality()` runs, **Then** recognizes both HTML comment markers and bash+output block format. (Action: session-retro-2026-03-16 B2) <!-- verification: cli-verifiable -->
78. **Given** existing proof file, **When** `createProofDocument()` called, **Then** does not overwrite — preserves captured evidence. (Action: session-retro-2026-03-16 B3) <!-- verification: cli-verifiable -->
79. **Given** proof containing `[ESCALATE]` as evidence text (inside AC descriptions), **When** escalation detection runs, **Then** scoped to AC status lines only — no false positives from evidence content. (Action: session-retro-2026-03-16 B4) <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Create validation AC registry file (AC: 1-79)
  - [x] Create `src/modules/verify/validation-acs.ts` exporting a typed array of all 79 validation ACs
  - [x] Each AC entry: `{ id, frRef, description, verificationMethod: 'cli' | 'integration', command?: string }`
  - [x] Group ACs by category: FR, NFR, UX, Regression, ActionItem
- [x] Task 2: Implement CLI-verifiable AC test runners (AC: cli-verifiable subset)
  - [x] For file-existence ACs: `existsSync` checks
  - [x] For line-count ACs: `wc -l` or line counting
  - [x] For content-inspection ACs: regex/grep checks
  - [x] For type-checking ACs: `npx tsc --noEmit` or AST inspection
  - [x] For timing ACs: `performance.now()` wrappers
- [x] Task 3: Tag integration-required ACs with environment prerequisites (AC: integration-required subset)
  - [x] Docker availability check
  - [x] Shared stack detection
  - [x] OpenSearch endpoint availability
  - [x] Agent-browser availability
  - [x] Ralph session context
- [x] Task 4: Import v1 verifying story ACs as regression tests (AC: 52-71)
  - [x] Map each v1 story to its most critical AC
  - [x] Verify each regression AC is testable with current codebase
- [x] Task 5: Import resolved action items as regression ACs (AC: 72-79)
  - [x] Cross-reference session retros for resolved bugs
  - [x] Verify each fix is still in place
- [x] Task 6: Write unit tests for validation AC registry (AC: 1)
  - [x] Test: registry contains exactly 79 ACs
  - [x] Test: every FR (1-40) has exactly one AC
  - [x] Test: no duplicate AC IDs
  - [x] Test: every AC has a verificationMethod
  - [x] Test: cli-verifiable ACs have a command or check function

## Dev Notes

### Current State

Epic 10 (Self-Validation & Adaptation) is the final epic before v1.0. This story creates the comprehensive validation AC suite that stories 10-2 and 10-3 will execute. No validation infrastructure exists yet — this story defines _what_ to validate.

### What Changes

This story produces:
1. A typed validation AC registry (`src/modules/verify/validation-acs.ts`)
2. Unit tests for the registry itself
3. CLI-verifiable check functions for ACs that can be tested by running commands in a subprocess

It does NOT:
- Run the full validation suite (that's story 10-3)
- Build the fix→dev→review→verify adaptation loop (that's story 10-2)
- Create a new `codeharness validate` command (that's story 10-3)

### AC Count Breakdown

| Category | Count | cli-verifiable | integration-required |
|----------|-------|----------------|---------------------|
| FR (1-40) | 40 | 23 | 17 |
| NFR | 8 | 6 | 2 |
| UX | 3 | 3 | 0 |
| Regression (v1 stories) | 20 | 13 | 7 |
| Action items | 8 | 8 | 0 |
| **Total** | **79** | **53** | **26** |

### Architecture Compliance

- FR coverage: All 40 FRs have exactly one AC (ACs 1-40)
- NFR coverage: Key NFRs covered (NFR1, NFR2, NFR3, NFR4, NFR5, NFR7, NFR18, NFR19)
- UX coverage: Status format, error detail, drill-down (ACs 49-51)
- Regression: 20 ACs from v1 verifying stories (ACs 52-71)
- Action items: 8 ACs from resolved session retro bugs (ACs 72-79)
- NFR17 (self-validation as CI gate) is the meta-requirement — this entire epic fulfills it
- No file >300 lines (NFR18) — validation-acs.ts will be data-heavy but can be split if needed

### Verification Method Classification Rules

- `cli-verifiable`: Can be checked by file inspection, `wc -l`, `grep`, `tsc --noEmit`, test execution, or timing a subprocess — no Docker, no running services, no user sessions
- `integration-required`: Needs Docker containers, shared observability stack, OpenSearch endpoint, agent-browser, BMAD install, ralph session, or multi-service coordination

### References

- [Source: _bmad-output/planning-artifacts/epics-overhaul.md#Epic 10: Self-Validation & Adaptation]
- [Source: _bmad-output/implementation-artifacts/archive-v1/sprint-status-v1.yaml — 32 verifying stories]
- [Source: _bmad-output/implementation-artifacts/session-retro-2026-03-16.md — action items B1-B4]
- [Source: _bmad-output/implementation-artifacts/session-retro-2026-03-18.md — action items A1-A5]
- [Source: src/modules/verify/ — verification module where registry will live]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`verification/10-1-validation-ac-suite-proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (src/modules/verify)
- [ ] Exec-plan created in `docs/exec-plans/active/10-1-validation-ac-suite.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Implementation Plan

- Split registry into 4 source files to comply with NFR18 (300-line limit): types, FR data, remaining data, barrel
- Each AC entry typed with `ValidationAC` interface including id, frRef, description, verificationMethod, optional command, and category
- CLI-verifiable ACs have a `command` field with the shell command that can verify them (vitest runs, wc -l, grep, tsc, etc.)
- Integration-required ACs omit the command field since they need Docker/services/sessions
- Helper functions for filtering by category, verification method, and ID lookup

### Completion Notes

- All 6 tasks completed. 33 unit tests written covering registry structure, counts, distribution, helpers, prerequisite tagging, regression mapping, and action item mapping.
- Full test suite: 87 files, 2299 tests, all passing. No regressions.
- Discovery: Story table claims 53 cli-verifiable / 26 integration-required, but counting the actual `<!-- verification: ... -->` HTML comment tags in each AC line yields 55 cli / 24 integration. Tests match the actual tag counts (source of truth).
- Files split across 4 source files (types: 26 lines, FR data: 193 lines, remaining data: 216 lines, barrel: 47 lines) — all under 300.

## File List

- src/modules/verify/validation-ac-types.ts (new)
- src/modules/verify/validation-ac-fr.ts (new)
- src/modules/verify/validation-ac-data.ts (new)
- src/modules/verify/validation-acs.ts (new)
- src/modules/verify/__tests__/validation-acs.test.ts (new)
- src/modules/verify/index.ts (modified — re-export validation AC registry)
- src/modules/verify/AGENTS.md (modified)
- docs/exec-plans/active/10-1-validation-ac-suite.md (new)

## Senior Developer Review (AI)

**Date:** 2026-03-19
**Outcome:** Changes Requested -> Fixed -> Approved for Verification

### Findings

| # | Severity | Description | Status |
|---|----------|-------------|--------|
| 1 | HIGH | ACs 30 and 51 reference non-existent `drill-down.test.ts` — should be `reporter.test.ts` | FIXED |
| 2 | MEDIUM | Validation AC registry not re-exported from verify module `index.ts`, violating module boundary convention | FIXED |
| 3 | MEDIUM | AC 34 command has redundant `! -name AGENTS.md` clause (already matched by `! -name "*.md"`) | FIXED |
| 4 | MEDIUM | Missing proof document (`verification/10-1-validation-ac-suite-proof.md`) — expected for verification phase | DEFERRED to 10-3 |
| 5 | LOW | Story AC Count Breakdown table (53/26) contradicts actual HTML tag counts (55/24) — table not corrected | NOT FIXED |
| 6 | LOW | No edge case tests for helpers with invalid input (e.g., invalid category, NaN ID) | NOT FIXED |

### Verification

- All 33 tests pass after fixes
- Full suite: 87 files, 2299 tests, all passing
- Coverage: 96.55% overall, all 93 files above 80% per-file floor
- No new TypeScript errors introduced
- All file line counts under 300 (NFR18)

## Change Log

- 2026-03-19: Created typed validation AC registry with all 79 ACs covering FR, NFR, UX, Regression, and ActionItem categories. 33 unit tests. Registry split into 4 files for NFR18 compliance.
- 2026-03-19: Code review — fixed 3 issues: non-existent drill-down.test.ts references, missing re-export from index.ts, redundant find exclusion. Status set to verifying.
