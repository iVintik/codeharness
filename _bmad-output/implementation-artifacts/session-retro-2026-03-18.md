# Session Retrospective — 2026-03-18

**Sprint:** Architecture Overhaul Sprint
**Session window:** ~04:30Z – 04:45Z (estimated from issue timestamps)
**Stories attempted:** 2
**Stories completed:** 2 (both marked done)

---

## 1. Session Summary

| Story | Outcome | Notes |
|-------|---------|-------|
| 1-1-result-type-shared-types | Done | All 6 ACs verified (0 pending, 0 escalated). Blocked by black-box enforcement bug — required manual workaround. |
| 1-2-module-skeleton-index-pattern | Done | Story created, implemented, code-reviewed, and completed. 95.37% coverage. Two HIGH mutability issues found and fixed in review. |

Both stories in Epic 1 that were attempted are now done. Story 1-3 (migrate existing tests) remains in backlog.

---

## 2. Issues Analysis

### Bugs discovered

1. **Black-box enforcement applied unconditionally (verify.ts:112)** — `checkBlackBoxEnforcement()` requires docker-exec/docker-host/observability commands in every AC proof section. Unit-testable stories that use `npx tsx` or local commands get flagged as failing (`blackBoxPass=false`) even when all ACs are verified. This is the most significant bug found this session. It actively blocks the verification pipeline for an entire category of stories.

2. **`import.meta.dirname` requires Node 21.2+** — Used in `import-boundaries.test.ts`. Project targets `node>=18`. Works under vitest but would break under Node 18-20 direct execution. Minor compatibility risk.

### Workarounds applied (tech debt introduced)

1. **Story 1-1 manual verification bypass** — Verified proof quality from JSON output instead of relying on exit code. This means the automation cannot be trusted for unit-testable stories until the black-box enforcement bug is fixed. Any future session running `codeharness verify` on unit-testable stories will hit the same wall.

### Code quality concerns (found in review)

1. **Mutable arrays in Result types** — `VerifyResult.acResults` was `AcResult[]` instead of `ReadonlyArray<AcResult>`. `ProofQuality.issues` was `string[]` instead of `readonly string[]`. Both fixed during review. Pattern: new type definitions defaulting to mutable when the project convention is immutable.

2. **Module-specific types are stub-quality** — Fields like `InitOptions.template`, `DevResult.filesChanged` are placeholders. Will need refinement in stories 2.x-6.x. Acceptable for skeleton story, but creates a revision burden later.

### Verification gaps

1. **import-boundaries.test.ts silently passes when COMMANDS_DIR missing** — Test skips instead of failing in environments without the commands directory. False green. Not fixed this session (LOW priority per review).

### Design ambiguities

1. **`getObservabilityBackend()` return type mismatch** — Architecture Decision 3 specifies a bare return type, while all other functions return `Result<T>`. Stub had to work around this inconsistency. Needs architectural clarification before Epic 7.

2. **AC #3 "no command file exceeds 100 lines"** — 16 of 17 command files currently exceed this limit. The AC is aspirational and cannot pass until future stories extract logic into modules. Story framed it as documenting the gap.

### Tooling/infrastructure problems

None reported this session.

---

## 3. What Went Well

- **Two stories completed in a single session** — Story 1-1 (shared types) and 1-2 (module skeleton) both reached done status. Epic 1 is 2/3 complete.
- **Code review caught real issues** — Two HIGH-severity mutability violations were found and fixed before merge. The review step is earning its keep.
- **95.37% test coverage** — All 64 files above 80% floor. Strong foundation for the skeleton layer.
- **Session issues log was used properly** — Every subagent (verification, create-story, dev, code-review) logged problems as they arose. This made the retrospective possible from real data rather than memory.

---

## 4. What Went Wrong

- **Black-box enforcement bug wasted verification time** — The verifier reported failure on a fully-verified story. The human had to manually inspect JSON output and override. This is a process bottleneck — the automation should have passed cleanly.
- **Types-only files show 0% coverage** — `types.ts` files containing only interfaces report 0 statements to v8. Not a real gap, but it pollutes coverage reports and could trigger false alarms in CI if minimum thresholds are enforced at the file level.

---

## 5. Lessons Learned

**Repeat:**
- Logging issues in `.session-issues.md` as they happen. Every entry here was actionable.
- Running code review as a separate step after dev — caught mutability violations that would have propagated.

**Avoid:**
- Assuming the verification pipeline handles all story types. The unit-testable vs. black-box distinction was added recently (v0.19.1) but the enforcement logic was not updated to respect it.
- Defining types as mutable by default. Use `readonly` and `ReadonlyArray` from the start.

---

## 6. Action Items

### Fix now (before next session)

- [ ] **Fix black-box enforcement for unit-testable stories** — `validateProofQuality` in `src/lib/verify.ts` must skip `checkBlackBoxEnforcement()` when the story is classified as unit-testable (or when no black-box tier is specified). This blocks all future unit-testable story verification. Ref: story 1-1 workaround.

### Fix soon (next sprint)

- [ ] **Replace `import.meta.dirname` with Node 18-compatible alternative** — In `import-boundaries.test.ts`. Use `path.dirname(fileURLToPath(import.meta.url))` or similar.
- [ ] **Make import-boundaries.test.ts fail instead of skip when COMMANDS_DIR missing** — Silent skip creates false green results.
- [ ] **Clarify `getObservabilityBackend()` return type** — Resolve mismatch between architecture doc and Result<T> convention before Epic 7 begins.

### Backlog (track but not urgent)

- [ ] **Handle types-only files in coverage reporting** — Either exclude `types.ts` files from coverage or set a per-file exception so 0% on interface-only files doesn't trigger alarms.
- [ ] **Refine module-specific stub types** — `InitOptions`, `DevResult`, etc. are placeholders. Revisit as each module's story is implemented (Epics 2-6).
- [ ] **Reduce command file line counts below 100** — 16/17 files exceed the limit. Track as ongoing tech debt to resolve as modules absorb logic.

---

# Session Retrospective — 2026-03-18 (continued, ~04:50Z – 09:03Z)

**Sprint:** Architecture Overhaul Sprint
**Session window:** ~04:50Z – 09:03Z (from issue timestamps and commit times)
**Stories attempted:** 1
**Stories completed:** 1
**Epic 1 status:** COMPLETE (all 3 stories done)

---

## 1. Session Summary

| Story | Outcome | Notes |
|-------|---------|-------|
| 1-3-migrate-existing-tests-to-module-structure | Done | 6 verify test files moved to `src/modules/verify/__tests__/`. All tests pass, coverage maintained at baseline. Code review found 3 MEDIUM issues, all resolved. |

Epic 1 (Foundation -- Result Types & Module Skeleton) is now fully complete. All 3 stories (1-1, 1-2, 1-3) are done. The sprint moves to Epic 2 next.

---

## 2. Issues Analysis

### Bugs discovered

None new this sub-session.

### Workarounds applied (tech debt introduced)

1. **Migrated tests still import from `../../../lib/` not from module index** -- Tests reference source files via deep relative paths instead of through the module's public API (`src/modules/verify/index.ts`). This is expected and documented -- source extraction happens in Story 4-1. But it means the module boundary is not enforced by the test imports yet. Every test in `src/modules/verify/__tests__/` bypasses the module's index.

### Code quality concerns (found in review)

1. **MEDIUM: Missing AGENTS.md for verify module** -- The verify module had no AGENTS.md documenting ownership, purpose, and test patterns. Created during review.
2. **MEDIUM: Missing showboat proof document** -- Verification proof was not generated before review. Created at `verification/1-3-migrate-existing-tests-to-module-structure-proof.md`.
3. **MEDIUM: Story referenced nonexistent exec-plan** -- The story doc referenced an execution plan that was never created. Updated story to note exec-plan is not required for migration-only stories.
4. **LOW: `verify-prompt.test.ts` placement questionable** -- This test validates a template file (`src/templates/verify-prompt.ts`), not a verify module file. It was migrated with the verify tests because it's thematically related, but architecturally it belongs with template tests. Minor -- can be revisited when templates get their own module.
5. **LOW: Noisy stderr from CLI parser tests** -- Commander.js outputs error messages to stderr during parser tests. Harmless but clutters test output.

### Verification gaps

None new. All 3 ACs are CLI-verifiable and passed cleanly.

### Coverage

Coverage held steady at baseline -- no regression from the migration:
- Lines: 95.96%
- Statements: 95.37%
- Functions: 98.4%
- Branches: 85.1%

Lowest individual files remain `src/lib/coverage.ts` (88.94%) and `src/lib/verify.ts` (89.04%).

### Tooling/infrastructure problems

None reported.

---

## 3. What Went Well

- **Epic 1 completed in a single day** -- All 3 foundation stories done. The module skeleton, shared types, and test migration are in place. This unblocks Epics 2-6.
- **Story 1-3 was clean** -- No bugs, no blockers, no verification workarounds needed. The migration pattern (move tests, update imports, verify coverage) worked exactly as designed.
- **Code review continued to add value** -- Caught missing documentation (AGENTS.md, proof doc) and a story metadata error (nonexistent exec-plan reference). These are process hygiene issues that would have caused confusion in future sessions.
- **Session issues log captured useful context** -- The note about old story file `1-3-init-command-full-harness-initialization.md` from archive-v1 prevented a potential naming collision.

---

## 4. What Went Wrong

- **No significant problems this sub-session.** Story 1-3 was straightforward migration work with no surprises.
- **Minor: three MEDIUM review findings** indicate that the create-story and dev-story subagents are not consistently generating AGENTS.md, proof docs, or validating exec-plan references. These should be caught earlier in the pipeline, not during code review.

---

## 5. Lessons Learned

**Repeat:**
- Migration-only stories (no new code, just reorganization) are low-risk and fast. Good candidates for building momentum early in a sprint.
- Keeping coverage baseline numbers in the story ACs provides a concrete, automated gate. No ambiguity about whether coverage regressed.

**Avoid:**
- Referencing exec-plans in stories where none exist. The story template should either require an exec-plan or explicitly mark it N/A.
- Moving tests without updating them to use the module's public API. This creates a window where tests bypass the module boundary. Acceptable as documented tech debt, but should not become permanent.

---

## 6. Action Items

### Fix now (before next session)

- (No new "fix now" items from this sub-session. Previous session's action items still apply.)

### Fix soon (next sprint)

- [ ] **Ensure create-story generates AGENTS.md for new modules** -- The verify module was missing its AGENTS.md until code review caught it. The story creation pipeline should check for this.
- [ ] **Ensure dev-story generates proof documents** -- Showboat proof was missing until review. Either dev or verify subagent should create it automatically.
- [ ] **Add exec-plan validation to story template** -- Stories should explicitly state "exec-plan: N/A" for migration/simple stories, or reference a real plan. No dangling references.

### Backlog (track but not urgent)

- [ ] **Relocate `verify-prompt.test.ts` to templates module** -- Currently in verify module but tests a template file. Move when templates get their own module structure.
- [ ] **Suppress Commander.js stderr noise in parser tests** -- Low priority cosmetic issue. Consider redirecting stderr in test setup.
- [ ] **Update migrated verify tests to use module index imports** -- After Story 4-1 (source extraction), tests should import from `src/modules/verify/index.ts` instead of deep `../../../lib/` paths.

---

## Full-Day Summary

| Metric | Value |
|--------|-------|
| Stories attempted | 3 |
| Stories completed | 3 |
| Epics completed | 1 (Epic 1: Foundation) |
| Bugs found | 1 (black-box enforcement, from earlier sub-session) |
| Workarounds applied | 2 (verification bypass, deep import paths) |
| Review findings fixed | 5 (2 HIGH mutability + 3 MEDIUM documentation) |
| Coverage | 95.37% statements (held at baseline) |
| Next up | Epic 2: Unified State & Status Command |

---

# Session Retrospective — 2026-03-18 (Session 3, ~05:08Z – 09:26Z)

**Sprint:** Architecture Overhaul Sprint
**Session window:** ~05:08Z – 09:26Z (from issue timestamps and commit times)
**Stories attempted:** 1
**Stories completed:** 1
**Epic 2 status:** 1/4 done (2-1 complete, 2-2 through 2-4 in backlog)

---

## 1. Session Summary

| Story | Outcome | Notes |
|-------|---------|-------|
| 2-1-sprint-state-module-unified-state-file | Done | Full lifecycle: create-story, dev-story, code-review, verify. 8 ACs all verified. Code review found 2 HIGH and 4 MEDIUM issues, all fixed. |

This is the first story in Epic 2 (Unified State & Status Command). It replaces the fragmented state files (sprint-status.yaml, ralph/status.json, .story_retries, etc.) with a single `sprint-state.json` managed by a TypeScript module. Migration from old format runs on first access.

---

## 2. Issues Analysis

### Bugs discovered

1. **HIGH: `lastAttempt` overwritten on every status change** — The `lastAttempt` timestamp was being updated whenever story status changed, not only when transitioning to in-progress. Semantic bug — would make "last attempted" meaningless for debugging stuck stories. Found and fixed during code review.
2. **HIGH: Test coverage gaps on error paths** — `writeStateAtomic` and `parseRalphStatus` error paths had no test coverage. Tests added during review.

### Workarounds applied (tech debt introduced)

1. **Concurrent write testing is sequential only** — AC #6 (concurrent write safety) is tested with sequential writes, not true multi-process concurrency. Fork-based testing was deemed out of scope for unit tests. This means the atomic-write claim is tested at the API level but not under real contention.
2. **`process.cwd()` used as project root detection** — Fragile assumption. Works for Ralph (always invoked from project root) but would break if the module is imported from a different working directory. Not fixed (LOW).

### Code quality concerns (found in review)

1. **MEDIUM: DRY violation — duplicated `computeSprintCounts` logic** — Sprint count computation was duplicated across state read and migration paths. Extracted to a shared function during review.
2. **MEDIUM: Mutable shared `EMPTY_STORY` object** — A `const EMPTY_STORY` object was shared across all callers. If anyone mutated it (bypassing TypeScript checks), all stories would be corrupted. Replaced with `emptyStory()` factory function.
3. **MEDIUM: CJS `require()` in ESM test file** — A test file used `require()` to import a module, which is invalid in ESM context. Replaced with a proper helper.
4. **MEDIUM: NFR18 violation — `state.test.ts` exceeded 300 lines** — Compacted from 310+ to 287 lines during review.

### Verification gaps

1. **Migration outer catch block uncovered** — `migrateFromOldFormat` has an outer try/catch that is never reached because inner parsers handle all expected errors. LOW risk — the code is defensive but the branch is dead unless a truly unexpected error occurs (e.g., out-of-memory).

### Design ambiguities surfaced

1. **YAML parsing approach** — Architecture doc said to replace sprint-status.yaml but didn't specify whether to add a YAML dependency. Resolved by using manual line-by-line parsing since the format is flat `key: value`.
2. **Migration trigger timing** — Epic said "first access" triggers migration. Interpreted as: migration runs when `sprint-state.json` does not exist AND at least one old file exists.
3. **Ralph race condition risk** — Ralph (bash process) writes `ralph/status.json` and `.story_retries` while this module reads them for migration. Migration should only run when Ralph is stopped. No guard was added — relies on operational discipline.

### Unfixed issues carried forward

- `getSprintState()` silently swallows migration errors, falls through to `defaultState()` — could mask real problems
- No schema validation on `JSON.parse` result in `getSprintState` — malformed JSON that parses successfully would produce runtime errors downstream
- `process.cwd()` as project root (mentioned above)

---

## 3. What Went Well

- **First Epic 2 story completed cleanly** — Story 2-1 went through the full pipeline (create, dev, review, verify) without blockers. No verification workarounds needed.
- **Code review caught 2 HIGH bugs** — The `lastAttempt` semantic bug and missing error-path tests would have been hard to find later. Review step continues to justify its cost.
- **Design ambiguities resolved pragmatically** — YAML parsing without a dependency, migration trigger semantics, and race condition risk were all addressed in the story creation phase, not discovered mid-implementation.
- **8 ACs all CLI-verifiable** — Every acceptance criterion was testable via local commands. No black-box enforcement issues (contrast with story 1-1).

---

## 4. What Went Wrong

- **6 review findings in one story** — 2 HIGH + 4 MEDIUM is a lot for a single story. The dev subagent produced code with a semantic bug (lastAttempt), a security pattern issue (mutable shared state), and a DRY violation. These are not exotic edge cases — they should have been caught during implementation.
- **Test file bloat** — `state.test.ts` exceeded 300 lines and had to be manually compacted. The dev subagent is not self-enforcing NFR limits.
- **3 LOW issues left unfixed** — `process.cwd()` fragility, silent error swallowing, and missing schema validation are all carried forward. Each is individually low-risk but they accumulate.

---

## 5. Lessons Learned

**Repeat:**
- Resolving design ambiguities during create-story, not during dev. The YAML parsing and migration trigger decisions were made upfront, saving implementation churn.
- Using factory functions (`emptyStory()`) instead of shared mutable objects. This pattern should be standard for any default/template objects.

**Avoid:**
- Relying on TypeScript's type system to prevent mutations at runtime. The `EMPTY_STORY` bug shows that `const` + `readonly` is not enough if the object is shared. Always use factory functions for default state.
- Writing 300+ line test files. The dev subagent should split test files proactively, not wait for review to flag NFR violations.
- Leaving `process.cwd()` as implicit project root. This works today but will break when the module is used outside Ralph's execution context.

---

## 6. Action Items

### Fix now (before next session)

- (No blocking items. All HIGH/MEDIUM issues were resolved during review.)

### Fix soon (next sprint)

- [ ] **Add schema validation to `getSprintState()` JSON parsing** — A malformed-but-parseable `sprint-state.json` would cause runtime errors. Add a lightweight shape check after `JSON.parse`.
- [ ] **Replace `process.cwd()` with explicit project root parameter** — Pass the project root into state functions rather than relying on the current working directory.
- [ ] **Make `getSprintState()` log migration errors instead of silently swallowing** — At minimum, write a warning to stderr or a debug log so migration failures are visible.
- [ ] **Add Ralph race condition guard to migration** — Check for Ralph lock file or running process before migrating old state files. Prevent data corruption if someone runs migration while Ralph is active.

### Backlog (track but not urgent)

- [ ] **Add true concurrent write test for `writeStateAtomic`** — Current tests are sequential. A fork-based test would validate the atomic-write guarantee under real contention.
- [ ] **Cover outer catch in `migrateFromOldFormat`** — Dead branch today, but if the function is refactored, this could become reachable. Add a test that forces an unexpected error.
- [ ] **Dev subagent NFR self-check** — The dev subagent should check file line counts against NFR limits before finishing. Reduce review findings caused by known, automatable rules.

---

## Updated Full-Day Summary

| Metric | Value |
|--------|-------|
| Stories attempted | 4 |
| Stories completed | 4 |
| Epics completed | 1 (Epic 1: Foundation) |
| Epic 2 progress | 1/4 stories done |
| Bugs found | 3 (black-box enforcement, lastAttempt semantic, error path coverage) |
| Workarounds applied | 3 (verification bypass, deep import paths, sequential-only concurrency test) |
| Review findings fixed | 11 (2 HIGH mutability + 3 MEDIUM documentation + 2 HIGH bugs + 4 MEDIUM code quality) |
| Unfixed LOW issues | 6 (carried forward) |
| Coverage | 95.37% statements (held at baseline) |
| Total API cost | ~$15.57 across 3 sessions |
| Next up | Story 2-2: story-selection-cross-epic-prioritization |

---

# Session Retrospective — 2026-03-18 (Session 4, ~09:26Z – 09:51Z)

**Sprint:** Architecture Overhaul Sprint
**Session window:** ~09:26Z – 09:51Z (from issue timestamps and commit f0eca86)
**Stories attempted:** 1
**Stories completed:** 1
**Epic 2 status:** 2/4 done (2-1, 2-2 complete; 2-3, 2-4 in backlog)

---

## 1. Session Summary

| Story | Outcome | Notes |
|-------|---------|-------|
| 2-2-story-selection-cross-epic-prioritization | Done | Full lifecycle: create-story, dev-story, code-review, verify. Code review found 1 HIGH (missing AC #2 implementation) and 2 MEDIUM issues, all fixed. |

Story 2-2 implements cross-epic story selection with priority tiers (in-progress > verifying-with-proof > proof-exists > backlog) and retry exhaustion reporting. This is the decision engine that determines which story Ralph picks next.

---

## 2. Issues Analysis

### Bugs discovered

1. **HIGH: AC #2 not implemented — retry-exhausted stories silently skipped** — `selectNextStory()` filtered out retry-exhausted stories without reporting them or updating their status to blocked. The caller had no way to know stories were being dropped. Fixed by adding `RetryExhaustedInfo[]` to `SelectionResult`.
2. **Dead code in `priorityTier()`** — An `attempts >= MAX_STORY_ATTEMPTS` guard was unreachable after retry-exhaustion logic moved to the caller. Removed during review.

### Workarounds applied (tech debt introduced)

None new this session.

### Code quality concerns (found in review)

1. **MEDIUM: Missing test coverage for non-Error throws and empty key edge case** — Tests did not cover `throw "string"` paths or story keys that are empty strings. Added during review.
2. **MEDIUM: Coverage report directory misconfigured** — vitest was writing coverage output to `src/coverage/` instead of `coverage/`. Fixed `reportsDirectory` in `vitest.config.ts`.
3. **Architecture concern (not fixed): `getNextStory()` has side effects** — The function reads state AND writes state (updating retry-exhausted stories to blocked). This mixes query and command. Accepted per AC requirements — the selection and status update must be atomic to prevent race conditions.

### Verification gaps

1. **LOW (not fixed): `priorityTier` default branch uncoverable** — Defensive guard for unknown status values. TypeScript's exhaustive checking makes this branch unreachable at compile time, but it exists as a runtime safety net. Cannot be meaningfully tested without type-casting hacks.
2. **LOW (not fixed): `getNextStory` line 35 selector fail path hard to trigger** — Requires the state file to become corrupted between the read and select calls. Integration-level concern, not unit-testable.

### Design ambiguities surfaced

1. **Priority ordering for `in-progress` vs `proof-exists`** — AC #1 listed `proof-exists` as highest priority, but `in-progress` logically should take precedence (a story already being worked on should not be preempted). Resolved during story creation by making `in-progress` priority 0 and `verifying-with-proof` priority 1.
2. **`ready` status not in priority tiers** — `ready` exists in the `StoryStatus` union but is not mentioned in the epic's priority tier definition or PRD FR7. Resolved by treating `ready` as equivalent to `backlog`.
3. **Missing story title source** — `StorySelection.title` is required by the type, but `SprintState` does not store story titles. Dev will need to derive titles from the story key or read story markdown files. Not resolved this session — surfaced as a known gap.

### Tooling/infrastructure problems

None reported.

---

## 3. What Went Well

- **Story 2-2 completed end-to-end without blockers** — No verification workarounds, no sandbox issues, no pipeline failures.
- **Code review caught a missing AC implementation** — AC #2 (retry-exhausted reporting) was entirely absent from the initial implementation. The review step prevented a story from being marked done with an unimplemented acceptance criterion. This is the most valuable review finding of the day.
- **Design ambiguities resolved during story creation** — Priority ordering, `ready` status handling, and `in-progress` precedence were all decided before implementation, preventing dev churn.
- **Coverage config bug found and fixed** — The `reportsDirectory` misconfiguration in vitest.config.ts would have caused confusion in CI. Caught opportunistically during review.

---

## 4. What Went Wrong

- **AC #2 was entirely missing from the initial implementation** — The dev subagent implemented selection (AC #1) and persistence (AC #3+) but skipped retry-exhaustion reporting (AC #2). This is a process failure: the dev subagent should be checking off ACs as it implements them. An entire AC being absent is worse than a bug in an implemented AC.
- **Dead code shipped to review** — The `priorityTier()` guard for `attempts >= MAX_STORY_ATTEMPTS` became unreachable after the retry logic was restructured but was not removed. Dev subagent did not clean up after refactoring.

---

## 5. Lessons Learned

**Repeat:**
- Resolving ambiguous priority orderings during story creation. The `in-progress` vs `proof-exists` decision was non-obvious and would have caused implementation confusion.
- Logging design decisions (like treating `ready` as `backlog`) in the session issues log for future reference.

**Avoid:**
- Trusting that the dev subagent implements all ACs. A missing AC is fundamentally different from a buggy AC — it suggests the dev did not systematically enumerate the acceptance criteria before coding. Consider adding an AC checklist step to the dev pipeline.
- Leaving dead code after refactoring. The dev subagent should do a cleanup pass when moving logic between functions.

---

## 6. Action Items

### Fix now (before next session)

- (No blocking items. All HIGH/MEDIUM issues were resolved during review.)

### Fix soon (next sprint)

- [ ] **Add AC checklist enforcement to dev subagent** — Before marking a story as dev-complete, the dev subagent should verify that every AC has at least one corresponding test or implementation touchpoint. Prevents the "missing AC #2" class of failures.
- [ ] **Resolve `StorySelection.title` source** — The type requires a title but the state module has no title storage. Either add titles to `SprintState` or derive them from story file names. Needed before story 2-3 (status report) which will display titles.

### Backlog (track but not urgent)

- [ ] **Refactor `getNextStory()` to separate query from command** — Currently reads state, selects, and writes (updates blocked status) in one function. When the module stabilizes, consider splitting into `selectNext()` (pure) and `applySelection()` (side effects).
- [ ] **Cover `priorityTier` default branch** — If TypeScript adds a new `StoryStatus` value in the future, this branch becomes reachable. Add a test using type assertion to future-proof.
- [ ] **Cover `getNextStory` selector fail path** — Consider an integration test that corrupts state between read and select to validate error handling.

---

## Updated Full-Day Summary

| Metric | Value |
|--------|-------|
| Stories attempted | 5 |
| Stories completed | 5 |
| Epics completed | 1 (Epic 1: Foundation) |
| Epic 2 progress | 2/4 stories done |
| Bugs found | 4 (+1: missing AC #2 implementation) |
| Workarounds applied | 3 (unchanged from session 3) |
| Review findings fixed | 14 (+1 HIGH missing AC, +2 MEDIUM test/config) |
| Unfixed LOW issues | 8 (+2: uncoverable branches) |
| Coverage | 95.37% statements (held at baseline) |
| Next up | Story 2-3: status-report-one-screen-overview |

---

# Session Retrospective — 2026-03-18 (Session 5, ~09:58Z – 10:30Z)

**Sprint:** Architecture Overhaul Sprint
**Session window:** ~09:58Z – 10:30Z (from issue timestamps and commit b962181)
**Stories attempted:** 1
**Stories completed:** 1
**Epic 2 status:** 3/4 done (2-1, 2-2, 2-3 complete; 2-4 in backlog)

---

## 1. Session Summary

| Story | Outcome | Notes |
|-------|---------|-------|
| 2-3-status-report-one-screen-overview | Done | Full lifecycle: create-story, dev-story, code-review, verify. 1,526 lines added across 25 files. New `reporter.ts` module (203 lines), expanded `status.ts` (+63 lines), 477 lines of new tests. Code review found 2 MEDIUM fixes applied. |

Story 2-3 adds a one-screen sprint status overview to `codeharness status`. It introduces a `StatusReport` type with sprint progress, run summary, failed story details, and labeled action items (NEW/CARRIED). All report generation logic lives in the new `reporter.ts` pure-function module; `status.ts` only calls `generateReport()` and formats the output.

---

## 2. Issues Analysis

### Bugs discovered

1. **MEDIUM (fixed): `formatDuration()` negative duration on clock skew** -- Produced nonsensical output like "-1h-14m" when system clock drifted backward. Fixed with `Math.max(0, ms)` clamp.
2. **MEDIUM (fixed): `getSprintReportData()` field drift risk** -- Manually copied 13 fields to a plain `Record<string, unknown>` for JSON output. Fragile — any new field added to `StatusReport` would need a corresponding manual copy. Simplified to return `StatusReport` directly.

### Workarounds applied (tech debt introduced)

1. **`MAX_ATTEMPTS` hardcoded in `reporter.ts`** -- Duplicates the constant from `selector.ts` (value: 10). Not extracted to a shared location. If the value changes in one place, the other becomes stale. LOW priority but a DRY violation.
2. **`RunSummary.skipped` is always empty** -- The current state format has no way to distinguish "blocked" from "skipped" stories. The field exists in the type but is never populated. Consumers will see `skipped: []` regardless of actual skip state.

### Code quality concerns (found in review)

1. **LOW (not fixed): `status.ts` at 629 lines** -- Still exceeds NFR18 300-line limit. Pre-existing problem. Story added ~63 lines but kept most logic in `reporter.ts` to limit growth. Full decomposition requires a dedicated story.
2. **Architecture: `status.ts` is monolithic** -- Handles Docker health, stack health, sprint state, beads, onboarding, and coverage in one file. The sprint report addition makes this more visible but the problem predates this story.

### Verification gaps

1. **No integration test for `--json` flag with sprint data** -- JSON output path adds sprint report data but no test exercises the full CLI `codeharness status --json` against a real `sprint-state.json`. Unit tests cover the reporter and status command separately.
2. **No integration test for full CLI `codeharness status`** against real sprint-state.json -- Same concern as above, from a different angle.
3. **Coverage gap: `status.ts` branch coverage dropped to 75.41%** -- Many new conditional branches (sprint state present/absent, run active/inactive, failures/no-failures) are only partially covered.

### Design ambiguities surfaced

1. **AC 5 action item labeling boundary** -- Epic says "shows with NEW/CARRIED labels" but doesn't define precisely what's NEW vs CARRIED. Used heuristic: items whose story appears in `run.completed` or `run.failed` are NEW; all others are CARRIED. May need refinement if the heuristic produces unexpected labels.
2. **FR30 (story drill-down) belongs to story 2-4** -- Output includes a hint ("Run with --story <key> for details") but does NOT implement drill-down. Correctly scoped.

### Test isolation concern

1. **Pre-existing: `index.test.ts` and `state.test.ts` race condition** -- Both write to `sprint-state.json` in CWD. Nondeterministic collision when vitest runs them in parallel. Not introduced this session but surfaced again during development.

### Tooling/infrastructure problems

None reported.

---

## 3. What Went Well

- **Story 2-3 completed without blockers** -- No verification workarounds, no sandbox issues, no pipeline failures. Clean end-to-end execution.
- **Reporter module is well-isolated** -- 203 lines, pure functions, no filesystem or network access. Easy to test, easy to extend. Good separation of concerns.
- **477 lines of new tests** -- `reporter.test.ts` (242 lines) and expanded `status.test.ts` (+235 lines) cover the report generation and status command integration thoroughly.
- **Coverage held steady** -- 95.48% statements, 96.07% lines. Slight improvement from baseline despite adding significant new code.
- **`formatDuration` clock skew bug caught in review** -- Edge case that would have produced confusing output in production.

---

## 4. What Went Wrong

- **`status.ts` continues to grow** -- Now at 629 lines, more than double the 300-line NFR. Every story that touches status output makes this worse. The monolithic structure is becoming a real maintenance burden. This needs a decomposition story soon.
- **`status.ts` branch coverage is weak at 75.41%** -- The file has 240 branches with only 181 covered. Many of the new sprint state display branches are untested. This is below the 80% NFR floor for branches.
- **`MAX_ATTEMPTS` duplication** -- A second copy of this constant now exists. Small but exactly the kind of drift that causes hard-to-find bugs later.
- **Test isolation race condition still unfixed** -- This was reported in session 5's issues and was also a known issue from prior sessions. It keeps resurfacing because it only fails nondeterministically.

---

## 5. Lessons Learned

**Repeat:**
- Keeping report generation logic in a pure-function module (`reporter.ts`) separate from the command handler (`status.ts`). This pattern kept the status command's growth minimal and made the reporter trivially testable.
- Labeling design decisions (NEW/CARRIED heuristic) in the session issues log for future reference when the heuristic inevitably needs adjustment.

**Avoid:**
- Adding code to `status.ts` without a decomposition plan. The file is 2x over its NFR limit and still growing. Future stories should extract existing sections (Docker, beads, onboarding) into their own modules before adding new ones.
- Duplicating constants across modules. `MAX_ATTEMPTS` should be in a shared location (e.g., `types/constants.ts` or the sprint module's index).

---

## 6. Action Items

### Fix now (before next session)

- (No blocking items. All MEDIUM issues were resolved during review.)

### Fix soon (next sprint)

- [ ] **Decompose `status.ts`** -- Extract Docker health, beads, onboarding, and coverage sections into separate modules or at least separate files. The file is at 629 lines (NFR limit: 300). This is the most pressing tech debt item.
- [ ] **Extract `MAX_ATTEMPTS` to a shared constant** -- Currently duplicated in `selector.ts` and `reporter.ts`. Move to `types/constants.ts` or sprint module index.
- [ ] **Fix test isolation for `index.test.ts` / `state.test.ts`** -- Use unique temp directories or test-specific file names to prevent the CWD race condition.
- [ ] **Improve `status.ts` branch coverage** -- Currently 75.41%, below the 80% NFR floor. Add tests for sprint-state-absent, run-inactive, and no-failures branches.

### Backlog (track but not urgent)

- [ ] **Populate `RunSummary.skipped`** -- Requires state format changes to distinguish blocked from skipped stories. Track for when the state schema is next revised.
- [ ] **Add CLI integration test for `codeharness status --json`** -- End-to-end test against a real sprint-state.json to validate the full output path.
- [ ] **Refine NEW/CARRIED labeling heuristic** -- Current heuristic uses `run.completed`/`run.failed` membership. May produce incorrect labels for stories that span multiple runs. Revisit when users report label confusion.

---

## Updated Full-Day Summary

| Metric | Value |
|--------|-------|
| Stories attempted | 6 |
| Stories completed | 6 |
| Epics completed | 1 (Epic 1: Foundation) |
| Epic 2 progress | 3/4 stories done |
| Bugs found | 6 (+2: formatDuration clock skew, getSprintReportData field drift) |
| Workarounds applied | 5 (+2: MAX_ATTEMPTS duplication, empty RunSummary.skipped) |
| Review findings fixed | 16 (+2 MEDIUM: clock skew fix, field drift simplification) |
| Unfixed LOW issues | 10 (+2: status.ts line count, MAX_ATTEMPTS duplication) |
| Coverage | 95.48% statements (slight improvement) |
| Branch coverage concern | `status.ts` at 75.41% (below 80% NFR floor) |
| Next up | Story 2-4: status-story-drill-down |

---

# Session Retrospective — 2026-03-18 (Session 6, ~10:38Z – 11:19Z)

**Sprint:** Architecture Overhaul Sprint
**Session window:** ~10:38Z – 11:19Z (from issue timestamps and commits d12b106, 21629f1)
**Stories attempted:** 1
**Stories completed:** 1
**Epic 2 status:** COMPLETE (all 4 stories done)

---

## 1. Session Summary

| Story | Outcome | Notes |
|-------|---------|-------|
| 2-4-status-story-drill-down | Done | Full lifecycle: create-story, dev-story, code-review, verify. New `drill-down.ts` module (138 lines). Code review found 2 HIGH type safety issues, 1 MEDIUM missing `pendingCount`, and 2 LOW issues. All HIGH/MEDIUM fixed. |

Story 2-4 adds `--story <key>` drill-down to `codeharness status`, showing per-AC verdicts with FAIL detail, synthetic attempt history, and proof summary. The drill-down logic lives in the new `drill-down.ts` pure-function module. This completes Epic 2 (Unified State & Status Command).

---

## 2. Issues Analysis

### Bugs discovered

1. **HIGH (fixed): `AcDetail.verdict` typed as `string` instead of `AcVerdict`** -- Lost type safety on the verdict field. Any string would type-check, defeating the purpose of the `AcVerdict` union. Fixed during code review.
2. **HIGH (fixed): `StoryDrillDown.status` typed as `string` instead of `StoryStatus`** -- Same class of bug. Both indicate the dev subagent is not reusing existing union types when defining new interfaces.
3. **MEDIUM (fixed): `ProofSummary` missing `pendingCount`** -- Proof total was wrong when pending ACs existed. The pass + fail + escalate counts did not sum to total ACs. Fixed by adding `pendingCount` to the type and computation.

### Workarounds applied (tech debt introduced)

1. **Attempt history is synthetic** -- `StoryState` only stores `attempts: number`, not per-attempt logs. Historical attempts show "details unavailable". The drill-down provides accurate data only for the most recent attempt. This is a known limitation documented in the story, not a bug.
2. **AcDetail enrichment is limited** -- Only `reason` is populated (from `lastError`) for failed ACs. The `command`, `expected`, `actual`, and `suggestedFix` fields defined in the type await upstream `AcResult` extension. Until enriched, drill-down shows verdicts without diagnostic detail for most failures.

### Code quality concerns (found in review)

1. **LOW (not fixed): `MAX_ATTEMPTS` alias duplicated** -- `drill-down.ts` imports `MAX_STORY_ATTEMPTS` from `selector.ts` and aliases it to `MAX_ATTEMPTS`. Meanwhile `reporter.ts` has its own hardcoded `MAX_ATTEMPTS = 10`. Two modules with the same constant from different sources.
2. **LOW (not fixed): `AttemptRecord.outcome` typed as `string`** -- Should be a union type (`'passed' | 'verify failed' | 'blocked' | 'details unavailable' | ...`). Currently accepts any string.
3. **LOW (not fixed): `status.ts` at 714 lines** -- Up from 629 in session 5. Now 2.4x over the 300-line NFR18 limit. The drill-down integration added ~85 lines of formatting and flag handling.

### Coverage

1. **`drill-down.ts` branch coverage: 86.84%** -- Uncovered defensive paths on lines 26, 61, 91, 96, 134. These are edge-case guards (no dash in key, blocked status fallthrough, escalate/pending verdict counting, outer catch block). Acceptable for defensive code but flagged for awareness.

### Verification gaps

1. **Risk: AC #2 FAIL detail depends on enriched AcResult data** -- If the verifier doesn't write enriched fields, drill-down shows verdicts without actionable detail. This is an upstream dependency on future AcResult type extension.
2. **Risk: AC #3 attempt history is approximate** -- Synthetic reconstruction from a single `attempts` counter means no real timestamps, outcomes, or failing ACs for historical attempts.

### Design observations

1. **`reporter.ts` at 203 lines** -- The session issues log flagged that adding `getStoryDrillDown()` to reporter could push it over 300 lines. This was avoided by creating a separate `drill-down.ts` module. Good architectural decision.
2. **Harmless stderr noise** -- Two Commander option parsing errors appear during test runs. Not failures, just import-time side effects from Commander.js. Pre-existing issue, not introduced by this story.

### Tooling/infrastructure problems

None reported.

---

## 3. What Went Well

- **Epic 2 completed** -- All 4 stories (2-1 through 2-4) are done. The unified state module, story selection, one-screen status overview, and story drill-down are all implemented and verified.
- **`drill-down.ts` is clean and well-scoped** -- 138 lines, pure functions, no side effects. Follows the same pattern as `reporter.ts`. The sprint module now has a consistent architecture: `index.ts` (state), `selector.ts` (selection), `reporter.ts` (overview), `drill-down.ts` (detail).
- **Code review caught type safety regressions** -- Two HIGH-severity issues where union types were widened to `string`. This is the third session in a row where review caught type safety problems. The pattern is clear: the dev subagent defaults to `string` when it should reuse existing union types.
- **Separated drill-down from reporter** -- Rather than bloating `reporter.ts` past 300 lines, a new module was created. Correct decision given NFR18.

---

## 4. What Went Wrong

- **`status.ts` grew to 714 lines** -- 2.4x over the NFR limit. This was already 629 lines last session and the problem is accelerating. Every Epic 2 story added formatting code to this file. A decomposition story is overdue.
- **Type safety regressions keep recurring** -- Three sessions in a row, the dev subagent has typed new interface fields as `string` instead of reusing existing union types (`AcVerdict`, `StoryStatus`). This is a pattern, not a one-off mistake. The dev subagent needs explicit guidance to check existing type definitions before declaring new interfaces.
- **Two known workarounds limit drill-down utility** -- Synthetic attempt history and limited AcDetail enrichment mean the drill-down currently shows verdicts and status but little diagnostic detail. Users will see "FAIL" without knowing why. This reduces the value of the feature until AcResult is extended.
- **`pendingCount` was missing from `ProofSummary`** -- The proof total math was silently wrong. Pass + fail + escalate did not equal total ACs when pending ACs existed. This would have produced confusing proof summaries in production.

---

## 5. Lessons Learned

**Repeat:**
- Creating separate pure-function modules for distinct concerns (`drill-down.ts` vs `reporter.ts`). This keeps each file under NFR limits and makes testing straightforward.
- Documenting known limitations (synthetic history, limited enrichment) in the story itself so they are tracked as intentional gaps, not forgotten bugs.

**Avoid:**
- Typing new interface fields as `string` when a union type already exists. The dev subagent should grep for existing types before defining new interfaces. This has been the most common HIGH-severity review finding across the sprint.
- Adding formatting/display code to `status.ts`. All new display logic should go into dedicated modules. The command handler should only orchestrate calls and format final output.

---

## 6. Action Items

### Fix now (before next session)

- (No blocking items. All HIGH/MEDIUM issues were resolved during review.)

### Fix soon (next sprint)

- [ ] **Decompose `status.ts` urgently** -- Now at 714 lines (2.4x NFR limit). Extract Docker health, beads, onboarding, coverage, and sprint display into separate modules. This is the single highest-priority tech debt item.
- [ ] **Extract `MAX_ATTEMPTS` to shared constants** -- Currently in three places: `selector.ts` (canonical), `reporter.ts` (hardcoded copy), `drill-down.ts` (alias). Consolidate to one source of truth.
- [ ] **Add type-reuse check to dev subagent guidelines** -- The dev subagent must check `types/` and existing module types before declaring new `string`-typed fields. Three sessions of the same review finding is a process gap.
- [ ] **Type `AttemptRecord.outcome` as a union** -- Replace `string` with `'passed' | 'verify failed' | 'blocked' | 'details unavailable'`.

### Backlog (track but not urgent)

- [ ] **Extend `AcResult` with diagnostic fields** -- `command`, `expected`, `actual`, `suggestedFix`. Required to make drill-down FAIL detail useful. Depends on verifier changes.
- [ ] **Add per-attempt history to `StoryState`** -- Store an array of `{timestamp, outcome, failingAc}` per attempt instead of just `attempts: number`. Eliminates synthetic history.
- [ ] **Cover `drill-down.ts` defensive branches** -- Lines 26, 61, 91, 96, 134 are uncovered edge cases. Add targeted tests to reach 95%+ branch coverage.
- [ ] **Investigate `status.ts` branch coverage** -- Still at ~75%, below 80% NFR floor. This will get worse as the file grows. Decomposition (above) is the real fix.

---

## Updated Full-Day Summary

| Metric | Value |
|--------|-------|
| Stories attempted | 7 |
| Stories completed | 7 |
| Epics completed | 2 (Epic 1: Foundation, Epic 2: Unified State & Status Command) |
| Epic 2 progress | 4/4 stories done (COMPLETE) |
| Bugs found | 9 (+3: AcDetail.verdict type, StoryDrillDown.status type, missing pendingCount) |
| Workarounds applied | 7 (+2: synthetic attempt history, limited AcDetail enrichment) |
| Review findings fixed | 19 (+2 HIGH type safety, +1 MEDIUM pendingCount) |
| Unfixed LOW issues | 13 (+3: MAX_ATTEMPTS duplication, AttemptRecord.outcome typing, status.ts 714 lines) |
| Coverage | 95.48% statements (held steady) |
| Branch coverage concern | `status.ts` ~75% (below NFR floor), `drill-down.ts` 86.84% |
| `status.ts` line count | 714 (2.4x over 300-line NFR — critical tech debt) |
| Next up | Epic 3: Stable Sprint Execution (3-1-error-capture-on-timeout) |

---

# Session Retrospective — 2026-03-18 (Session 7, ~11:09Z – 11:22Z+)

**Sprint:** Architecture Overhaul Sprint
**Session window:** ~11:09Z – ongoing (Ralph iteration #9 still running at retro time)
**Stories attempted:** 1
**Stories completed:** 0
**Epic 3 status:** In progress (3-1 in `review`, 3-2 through 3-4 in backlog)

---

## 1. Session Summary

| Story | Outcome | Notes |
|-------|---------|-------|
| 3-1-error-capture-on-timeout | In review | Create-story and dev-story completed. Ralph logged "retry 1/10" indicating the first iteration did not complete the full pipeline. Story status is `review` — code review or verification has not yet passed. Ralph is still running. |

This is the first story in Epic 3 (Stable Sprint Execution). It introduces timeout error capture with Result<T> types, timeout report generation, and integration with the status drill-down. Notably, this is the first story requiring changes to both Ralph bash scripts and TypeScript modules.

---

## 2. Issues Analysis

### Bugs discovered

None new confirmed this session. Story 3-1 is still in review — bugs may surface during code review and verification.

### Workarounds applied (tech debt introduced)

None confirmed yet (story incomplete).

### Code quality concerns (raised during story creation and dev)

1. **AC #6 gap: no implementation tasks cover it** — AC #6 requires `codeharness status --story` to show timeout reports in drill-down. The dev task breakdown (10 tasks) does not include any task implementing this integration. This means storing timeout report paths in `sprint-state.json` and modifying the drill-down reporter, which spans module boundaries. The AC-to-task mapping is incomplete.
2. **`npx` dependency in `ralph.sh` timeout capture** — Timeout capture calls `npx codeharness timeout-report`, which adds npm resolution overhead. Direct `node dist/index.js timeout-report` would be faster but requires knowing the install path. This is a performance concern for the 10-second budget in AC #5.

### Verification gaps

1. **AC #6 (status drill-down integration) crosses module boundaries** — Depends on story 2-4's drill-down infrastructure and may require stories 3-2/3-3 to be fully testable. Tagged `integration-required` during story creation.
2. **AC #3 attempt history approximate** — Carried forward from session 6: `StoryState` only stores `attempts: number`, limiting drill-down fidelity.

### Design ambiguities surfaced

1. **Two epics files exist** — `epics.md` and `epics-overhaul.md`. The create-story agent had to determine which was canonical by cross-referencing sprint-status.yaml story keys. `epics-overhaul.md` is correct. The stale `epics.md` should be removed or archived to prevent future confusion.
2. **Sparse epic ACs expanded** — The epic definition for 3-1 had only 3 ACs. The create-story agent expanded to 6 to cover Result<T>, error handling, performance, and status integration. This is appropriate but indicates the epic-level AC definitions are sometimes too coarse for story-level work.
3. **First dual-language story** — Both bash (ralph.sh) and TypeScript modules are modified. The dev agent needs to handle bash function testing (BATS) alongside TypeScript unit tests. This is a new execution pattern not exercised in Epics 1-2.

### Tooling/infrastructure problems

1. **Pre-existing BATS failures** — 20+ tests in `bridge.bats` and `exec_plans.bats` fail due to `declare -A` requiring bash 4+ on macOS (system bash is 3.2). Unrelated to story 3-1 but pollutes test output and could mask new BATS failures introduced by this story.
2. **Ralph retry triggered** — Story 3-1 got "retry 1/10" in Ralph's loop, meaning the first Claude session did not complete the story pipeline. This could be a timeout (30-minute budget) or a pipeline failure. The story moved from `backlog` to `review`, suggesting dev completed but review/verify did not finish.

---

## 3. What Went Well

- **Epic 2 fully completed earlier this day** — All 4 stories done. The unified state module, story selection, status overview, and drill-down are all shipped. Strong foundation for Epic 3.
- **Session issues log continues to capture real problems** — The 3-1 entries from create-story and dev-story identify the AC #6 gap and BATS compatibility issue before they become blockers during verification.
- **Story 3-1 create-story expanded sparse ACs** — Rather than implementing against 3 vague ACs, the agent expanded to 6 well-defined ACs covering the full scope. Proactive scoping prevents ambiguity during dev.
- **9 sessions completed in one day** — Ralph executed 9 iterations, completing 7 stories across 2 epics. High throughput for autonomous sprint execution.

---

## 4. What Went Wrong

- **Story 3-1 did not complete in one iteration** — First Ralph session for this story triggered a retry. The 30-minute budget may be insufficient for a dual-language story (bash + TypeScript) that introduces a new CLI command (`timeout-report`), a new module (`Result<T>` integration), and touches Ralph's shell scripts.
- **AC #6 has no implementation task** — The dev agent produced 10 tasks but none cover the status drill-down integration required by AC #6. This is the same class of failure as session 4 (story 2-2 missing AC #2 implementation). The dev subagent is still not systematically mapping every AC to at least one task.
- **Pre-existing BATS failures obscure new test results** — 20+ failures from bash version incompatibility make it hard to determine if story 3-1's bash changes introduced new failures. Test signal is degraded.
- **Stale `epics.md` file caused confusion** — The create-story agent had to spend time determining which epics file was canonical. This is wasted effort on a problem that has a trivial fix (delete or rename the stale file).

---

## 5. Lessons Learned

**Repeat:**
- Expanding sparse epic ACs during story creation. Better to have 6 specific ACs than 3 vague ones.
- Logging dual-language concerns (bash + TypeScript) in session issues. Future stories modifying Ralph scripts will face the same BATS compatibility challenge.

**Avoid:**
- Assuming all stories fit in a single 30-minute Ralph iteration. Dual-language stories with new CLI commands may need a larger time budget or should be split into smaller stories (bash changes vs TypeScript changes).
- Leaving stale files (`epics.md`) alongside their replacements. Rename or archive immediately when a new version is created.
- Creating task breakdowns without explicitly mapping each AC to at least one task. AC #6 was dropped entirely — same failure pattern as AC #2 in story 2-2.

---

## 6. Action Items

### Fix now (before next session)

- [ ] **Remove or archive stale `epics.md`** — Only `epics-overhaul.md` is canonical. The stale file wastes agent time and risks using wrong story definitions.
- [ ] **Verify story 3-1 completes in next Ralph iteration** — Status is `review`. Ralph should pick it up and finish code review + verification. If it fails again, investigate whether the 30-minute budget is sufficient.

### Fix soon (next sprint)

- [ ] **Add AC-to-task mapping validation to dev subagent** — This is the second time an AC was entirely missing from the task breakdown (AC #2 in story 2-2, AC #6 in story 3-1). The dev agent should produce an explicit mapping before coding.
- [ ] **Fix BATS bash 4+ compatibility** — 20+ pre-existing failures from `declare -A` on macOS system bash. Either require bash 4+ in the test harness or rewrite tests to avoid associative arrays. This blocks reliable bash test signal for Epic 3.
- [ ] **Evaluate `npx` overhead in Ralph timeout capture** — If `npx codeharness timeout-report` consistently exceeds the 10-second budget (AC #5), switch to direct `node` invocation or pre-resolve the binary path.
- [ ] **Implement AC #6 for story 3-1** — The task breakdown is missing status drill-down integration. Add a task that stores timeout report paths in `sprint-state.json` and modifies the drill-down reporter.

### Backlog (track but not urgent)

- [ ] **Consider splitting dual-language stories** — Stories that modify both bash and TypeScript may exceed single-iteration budgets. Evaluate whether bash-only and TypeScript-only stories are more reliable for autonomous execution.
- [ ] **Standardize epic AC granularity** — Epic 3 had only 3 ACs for story 3-1's scope. Establish a guideline: minimum 1 AC per distinct capability being added.

---

## Updated Full-Day Summary

| Metric | Value |
|--------|-------|
| Stories attempted | 8 |
| Stories completed | 7 |
| Stories in progress | 1 (3-1 in review) |
| Epics completed | 2 (Epic 1: Foundation, Epic 2: Unified State & Status Command) |
| Epic 3 progress | 0/4 stories done (3-1 in review) |
| Ralph iterations | 9 (7 successful completions, 1 retry on 3-1, 1 still running) |
| Bugs found | 9 (no new confirmed — 3-1 still in review) |
| Workarounds applied | 7 (unchanged — 3-1 not yet complete) |
| Review findings fixed | 19 (unchanged — 3-1 review pending) |
| Unfixed LOW issues | 13 (unchanged) |
| New risks identified | 3 (AC #6 gap, BATS compatibility, npx overhead) |
| Coverage | 95.57% statements, 85.52% branches (improved from 95.48%) |
| `status.ts` line count | 714 (unchanged — critical tech debt) |
| `status.ts` branch coverage | 76.29% (below 80% NFR floor) |
| Estimated session cost | ~$4.36 for session 6 (session 7 still running) |
| Next up | Complete 3-1 review/verify, then 3-2-graceful-dev-module |

---

# Session Retrospective — 2026-03-18 (Session 8: Final)

**Sprint:** Architecture Overhaul Sprint
**Session window:** ~06:50Z – 08:00Z (from issue timestamps)
**Stories attempted this session:** 2 (2-4 completion + 3-1 full pipeline)
**Stories completed:** 1 (2-4 done); 1 stuck at verifying (3-1)
**Ralph iterations this session:** ~3 (loop_count=10 total, prior sessions used ~7)

---

## 1. Session Summary

| Story | Phase(s) Run | Outcome | Key Detail |
|-------|-------------|---------|------------|
| 2-4-status-story-drill-down | create-story, dev, code-review, verify | **Done** | 3 HIGH issues found and fixed in review. Drill-down shipped with synthetic attempt history (workaround). |
| 3-1-error-capture-on-timeout | create-story, dev, code-review, verify | **Stuck at verifying** | 5/6 ACs verified, 1 escalated (AC #6 requires cross-module integration). Blocked by black-box enforcement bug in verify tool. |

Epic 2 is fully complete (all 4 stories done). Epic 3 has 1 of 4 stories in progress, 3 in backlog.

---

## 2. Issues Analysis

### Bugs discovered during implementation or verification

1. **`AcDetail.verdict` typed as `string` instead of `AcVerdict`** (story 2-4, code-review) — Loses type safety on the drill-down output. Found and fixed in review. Pattern: when adding new types, developers default to `string` instead of reusing existing union types.

2. **`StoryDrillDown.status` typed as `string` instead of `StoryStatus`** (story 2-4, code-review) — Same pattern as above. Fixed.

3. **`ProofSummary` missing `pendingCount`** (story 2-4, code-review) — Proof total calculation was wrong when pending ACs existed. Fixed.

4. **Zero test coverage on `timeout-report.ts`** (story 3-1, code-review) — 4.76% statements, 0% branches at review time. Fixed by adding 7 unit tests.

5. **Story key not sanitized in timeout report filename** (story 3-1, code-review) — Path traversal / malformed filenames possible. Fixed.

6. **Trailing newline off-by-one in `capturePartialStderr`** (story 3-1, code-review) — Last captured line wasted on empty string. Fixed.

7. **No validation on `iteration`/`durationMinutes` parameters** (story 3-1, code-review) — Negative/zero/non-integer values accepted silently. Fixed.

8. **Black-box enforcement bug blocks unit-testable story verification** (story 3-1, verify) — `checkBlackBoxEnforcement()` requires docker/observability commands in ALL AC proof sections. Unit-testable proofs using `npx vitest` get flagged as failing even when all ACs pass. This is the same bug reported in earlier sessions — still not fixed. Story 3-1 shows verified=5, pending=0, escalated=1 but `passed=false` due to blackBoxPass.

### Workarounds applied (tech debt introduced)

1. **Synthetic attempt history in drill-down** (story 2-4) — `StoryState` only stores `attempts: number`, not per-attempt logs. Drill-down shows "details unavailable" for historical attempts. Real per-attempt logging deferred to a future story.

2. **`AcDetail` enrichment limited to `reason` field only** (story 2-4) — Only `reason` populated from `lastError` for failed ACs. Fields `command`, `expected`, `actual`, `suggestedFix` await upstream `AcResult` type extension.

3. **Expanded sparse epic ACs during story creation** (story 3-1) — Epic 3 definition had only 3 ACs for story 3-1; expanded to 6 at story-creation time. This is a workaround for under-specified epics, not a proper fix.

### Code quality concerns

1. **`status.ts` at 714 lines** — Exceeds 300-line NFR18 limit. Pre-existing tech debt worsened by story 2-4 additions. Not addressed this session.

2. **`MAX_ATTEMPTS` alias duplicated** in `drill-down.ts` and `reporter.ts` — Minor, both one-liners. Not fixed.

3. **`AttemptRecord.outcome` typed as `string`** instead of a union type — Loses type safety. Not fixed.

4. **`capturePartialStderr` reads entire file into memory** before slicing last N lines (story 3-1) — Not fixed.

5. **`captureTimeoutReport` hardcodes `sprint-state.json` path** via `process.cwd()` (story 3-1) — Not fixed.

6. **Unused `dirname` import** in timeout.ts line 8 — Not fixed.

### Verification gaps

1. **AC #6 for story 3-1 escalated** — Requires integration between timeout module and status drill-down reporter. Genuinely cannot be verified without cross-module work. Correctly identified as needing a follow-up story or stories 3.2/3.3.

2. **AC #6 missing from task breakdown entirely** — Dev agent produced 10 tasks, none implementing AC #6. This is the second time an AC was dropped from a task breakdown (also happened with AC #2 in story 2-2).

3. **`drill-down.ts` branch coverage 86.84%** — Uncovered defensive paths on lines 26, 61, 91, 96, 134. Acceptable but not complete.

4. **`captureStateDelta` missing malformed JSON parse error test** — Coverage gap in timeout module.

### Tooling/infrastructure problems

1. **Two epics files exist** (`epics.md` and `epics-overhaul.md`) — Create-story agent had to figure out which was canonical. Wasted agent time. Reported in prior sessions too — still not cleaned up.

2. **20+ pre-existing BATS test failures** — `declare -A` requires bash 4+ on macOS. Unrelated to this session's stories but prevents reliable bash test signal for Epic 3's Ralph modifications.

3. **Harmless stderr noise from Commander option parsing** during test runs — Not failures, just import-time side effects. Noise in test output.

---

## 3. What Went Well

- **Epic 2 fully completed.** All 4 stories (2-1 through 2-4) done, verified, and committed. The unified state module, story selection, one-screen status overview, and story drill-down are all shipped.

- **Code review process catching real bugs.** Story 2-4 had 3 HIGH issues and 1 MEDIUM issue caught in review. Story 3-1 had 1 HIGH and 3 MEDIUM issues caught. All were fixed before merge. The review step is providing genuine value.

- **Story 3-1 implemented a dual-language feature** (bash + TypeScript) in a single iteration — Ralph timeout capture in bash, timeout-report CLI command and module in TypeScript. This was flagged as risky and it worked, though verification stumbled.

- **Session issues log is working as intended.** Every subagent (create-story, dev, code-review, verify) contributed entries. The log captured the AC #6 gap at every phase — first flagged at create-story time, confirmed at dev time, and correctly escalated at verify time. Traceability works.

---

## 4. What Went Wrong

- **Story 3-1 stuck at `verifying`** due to two compounding problems: (1) the black-box enforcement bug falsely fails unit-testable proofs, and (2) AC #6 was escalated because it requires cross-module integration not yet built. Neither problem is fixable within the story itself.

- **AC-to-task mapping dropped AC #6 for story 3-1.** Same failure pattern as story 2-2. The dev agent's task breakdown did not include a task for AC #6 (status drill-down integration). This was caught by every subsequent agent but not prevented.

- **Stale `epics.md` still not removed.** This was an action item from the previous retro session. It wasted agent time again this session.

- **`status.ts` continues to grow.** Now at 714 lines, well over the 300-line NFR18 limit. Each status/reporting story adds more code without any extraction happening. This is compounding tech debt.

---

## 5. Lessons Learned

**Repeat:**
- Code review as a mandatory step before verification. The review phase caught 4 HIGH-severity issues across two stories this session that would have caused runtime bugs.
- Logging risks and workarounds at every phase in `.session-issues.md`. The traceability from create-story through verification is working.
- Expanding sparse epic ACs at story-creation time rather than discovering gaps during implementation.

**Avoid:**
- Assuming the black-box enforcement bug will be fixed before the next session. It has persisted for 3+ sessions now and blocks all unit-testable story verification. Must be fixed or worked around systematically.
- Creating task breakdowns without explicitly mapping each AC to at least one task. This is now a repeated failure (stories 2-2 and 3-1).
- Allowing `status.ts` to grow further without extraction. Next story touching the status module should include a refactoring task.

---

## 6. Action Items

### Fix now (before next session)

- [ ] **Fix the black-box enforcement bug in verify tool** — This has blocked or complicated verification for 3+ sessions. `checkBlackBoxEnforcement()` must distinguish unit-testable stories from black-box stories and only enforce docker/observability commands for the latter. The `verification-tier` feature (commit 40bf55d) was supposed to handle this but is not integrated into enforcement logic.
- [ ] **Remove or archive stale `epics.md`** — Only `epics-overhaul.md` is canonical. This was an action item last session and was not done.
- [ ] **Advance story 3-1 past `verifying`** — With 5/6 ACs verified and 1 correctly escalated, the story should be marked done with AC #6 tracked as a follow-up. The skip logic in Ralph step 2 should handle this, but if not, manually advance it.

### Fix soon (next sprint)

- [ ] **Add AC-to-task mapping validation to dev subagent** — Require the dev agent to produce an explicit AC-to-task mapping table before coding. Third instance of this failure will cost a full story retry.
- [ ] **Extract `status.ts` into smaller modules** — 714 lines, 76.29% branch coverage. Next story touching status should split it into reporter.ts, formatter.ts, and status-core.ts (or similar).
- [ ] **Implement AC #6 for story 3-1** — Store timeout report paths in `sprint-state.json` and modify drill-down reporter to display them. Could be a standalone mini-story or folded into story 3-2/3-3.
- [ ] **Fix BATS bash 4+ compatibility** — 20+ failures block reliable bash test signal for all Epic 3 stories modifying Ralph scripts.

### Backlog (track but not urgent)

- [ ] **Add per-attempt logging to `StoryState`** — Current `attempts: number` field prevents meaningful drill-down history. Extend to store per-attempt outcome, timestamp, and error summary.
- [ ] **Enrich `AcResult` with detail fields** — `command`, `expected`, `actual`, `suggestedFix` are all missing. The drill-down UI is ready for them but shows empty data.
- [ ] **Evaluate `npx` overhead in Ralph timeout capture** — If `npx codeharness timeout-report` exceeds the 10-second budget, switch to direct `node dist/index.js` invocation.
- [ ] **Address remaining LOW unfixed issues** — Unused imports, hardcoded paths, memory-inefficient file reads. None are urgent but the count (13+ from prior sessions plus 4 new) is growing.

---

## Full-Day Summary (Updated)

| Metric | Value |
|--------|-------|
| Stories attempted (full day) | 9 |
| Stories completed | 8 (1-1, 1-2, 1-3, 2-1, 2-2, 2-3, 2-4, epic milestones) |
| Stories stuck | 1 (3-1 at verifying, 1 escalated AC) |
| Epics completed | 2 (Epic 1: Foundation, Epic 2: Unified State & Status) |
| Epic 3 progress | 0/4 done, 1/4 verifying, 3/4 backlog |
| Ralph iterations (est.) | 10 |
| Bugs found this session | 8 (7 fixed in review, 1 systemic — black-box enforcement) |
| Workarounds applied this session | 3 |
| Review findings fixed this session | 7 (HIGH) + 4 (MEDIUM) = 11 |
| Unfixed LOW issues | 17 (13 prior + 4 new) |
| `status.ts` line count | 714 (critical — NFR18 limit is 300) |
| Next up | Fix black-box enforcement bug, advance 3-1, start 3-2-graceful-dev-module |

---

# Session Retrospective — 2026-03-18 (Session 9, ~08:00Z – 08:18Z)

**Sprint:** Architecture Overhaul Sprint
**Session window:** ~08:00Z – 08:18Z (from issue timestamps)
**Stories attempted this session:** 1 (3-2-graceful-dev-module)
**Stories completed:** 0 (stuck at verifying — 2 escalated ACs)
**Ralph iterations this session:** ~1 (loop_count=11 total, prior sessions used ~10)

---

## 1. Session Summary

| Story | Phase(s) Run | Outcome | Key Detail |
|-------|-------------|---------|------------|
| 3-2-graceful-dev-module | create-story, dev, code-review, verify | **Stuck at verifying** | 7/8 ACs verified at unit-testable tier, 2 escalated (AC 6 integration-required, 1 auto-escalated). 100% dev module coverage. |

Story 3-2 went through the full pipeline — create, dev, review, verify — in a single Ralph loop iteration. The dev module was implemented from a pure stub (`fail('not implemented')`) to a fully functional orchestrator wrapping `claude --print`. All unit tests pass (1861 total). Story is blocked at verification due to 2 escalated ACs.

Epic 3 now has 2 of 4 stories at `verifying`, 2 still in backlog.

---

## 2. Issues Analysis

### Bugs discovered during implementation or verification

1. **Missing AGENTS.md for `src/modules/dev/`** (code-review) — Required by project convention. Created during review. Not a code bug but a process gap: the dev agent should create AGENTS.md as part of new module creation.

2. **`filesChanged`/`testsAdded` not captured in non-timeout error path** (code-review) — When orchestrator.ts hit a non-timeout error, partial work data (files changed, tests added) was lost. Fixed in review.

3. **Branch coverage gap on line 59 — empty line filtering** (code-review) — `filter(Boolean)` after `split('\n')` had an untested false branch. Fixed: added test, achieved 100% coverage.

4. **SIGTERM-only timeout path untested** (code-review) — `signal === 'SIGTERM'` without `killed === true` was not covered. Fixed: added explicit test.

5. **Verify tool proof parser mismatch** (verification) — `codeharness verify` reported 6 verified ACs vs manual count of 7 PASS. Parser may have issues detecting PASS verdicts in certain AC section formats. This is a tooling bug affecting proof document quality metrics.

### Workarounds applied (tech debt introduced)

1. **Expanded sparse epic ACs from 3 to 8** (create-story) — Same pattern as story 3-1. Epic 3 definition under-specifies ACs. Story creation agent expanded to cover NFRs (file size, coverage, module boundary enforcement). This is now a recurring workaround across multiple stories.

2. **`Record<string, unknown>` casts used 3 times in orchestrator.ts** — Untyped `child_process` error properties cast to generic record type. Proper typing deferred.

### Code quality concerns

1. **`captureFilesChanged()` uses `execSync` instead of `execFileSync`** for git commands — Inconsistent with project pattern. Low risk but inconsistent.

2. **Test redundancy** between `index.test.ts` and `orchestrator.test.ts` — Both test Result shape. Minor duplication.

3. **Code review created proof document prematurely** — The review agent created `verification/3-2-graceful-dev-module-proof.md`, which is the verification agent's job. May cause confusion about verification tier classification since the review agent doesn't follow the verification protocol.

### Verification gaps

1. **AC #6 escalated (integration-required)** — "Sprint loop continues on failure" requires a live ralph run with the dev module producing an actual failure. Cannot be tested with mocks alone. Correctly flagged at create-story time and escalated at verification.

2. **No integration test with real `claude` CLI** — Orchestrator invokes `claude --print` which cannot be tested without the real CLI. All tests mock `execFileSync`. This is inherent to the architecture — the dev module wraps an external tool.

3. **Output capture limitation** — `execFileSync` captures stdout but stderr is only available in the error object on failure. Story spec says "captured stdout/stderr summary" but success-path stderr is not available. Documented but unresolved.

### Tooling/infrastructure problems

1. **Two epics files still exist** — `epics.md` and `epics-overhaul.md`. Third session in a row this is reported. Still not cleaned up.

2. **Pre-existing BATS failures (bash 4+)** — 20+ tests in `bridge.bats` and `exec_plans.bats` still failing. Blocks reliable bash test signal for Epic 3 Ralph modifications.

3. **Black-box enforcement bug still active** — Story 3-1 remains at `verifying` from the prior session. The `checkBlackBoxEnforcement()` bug has now been reported in 4+ sessions without a fix.

---

## 3. What Went Well

- **Story 3-2 implemented from stub to full module in one iteration.** The dev module went from `fail('not implemented')` to a complete orchestrator with Result<T> wrapping, timeout detection, error capture, file-changed tracking, and test-count tracking — all in a single Ralph loop.

- **100% coverage on dev module.** All four coverage metrics (statements, branches, functions, lines) hit 100% on the core module after review fixes. This is the first module to ship at full coverage.

- **All 1861 tests pass, build clean.** No regressions introduced despite adding a new module from scratch.

- **Code review caught 2 HIGH and 3 MEDIUM issues.** All fixed before verification. The missing AGENTS.md and non-timeout error path data loss would have been real problems in production.

- **Session issues log continues to provide traceability.** The AC #6 integration requirement was flagged at create-story time (08:00Z), confirmed in dev (08:05Z), reinforced in review (08:12Z), and correctly escalated in verification (08:18Z). Every phase agreed on the assessment.

---

## 4. What Went Wrong

- **Story 3-2 stuck at `verifying` despite strong evidence.** 7 of 8 ACs verified with 100% module coverage, but 2 ACs were escalated. One (AC #6) is genuinely integration-required. The second escalation reason is unclear — possibly auto-escalated by the verify tool for `integration-required` tags in the story file.

- **Verify tool proof parser inaccuracy.** Reported 6 verified vs manual count of 7 PASS. If the parser undercounts verified ACs, stories may be unnecessarily blocked or require manual intervention to advance.

- **Black-box enforcement bug persists for 4th session.** Story 3-1 cannot advance past `verifying` because of this bug. It was listed as "Fix now (before next session)" in Session 8's action items and was not fixed.

- **Stale `epics.md` persists for 3rd session.** Also listed as a "Fix now" action item in Session 8. Not done.

- **Review agent overstepped by creating proof document.** The review agent created `verification/3-2-graceful-dev-module-proof.md` which should be the verification agent's responsibility. This could confuse the verification tier classification or create merge conflicts if verification also creates the file.

---

## 5. Lessons Learned

**Repeat:**
- Implementing from a pure stub with clear Result<T> patterns. Story 3-1's timeout.ts provided a template that 3-2's orchestrator.ts followed successfully. Pattern reuse across stories within an epic works.
- Catching coverage gaps in code review before verification. The SIGTERM-only path and empty-line filter branch were both found and fixed in review, preventing verification failures.
- Flagging integration-required ACs at story-creation time. Creates clear expectations for every subsequent phase.

**Avoid:**
- Letting "Fix now" action items persist unfixed between sessions. Both the black-box enforcement bug and stale epics.md were "Fix now" items from Session 8 and neither was addressed. "Fix now" items need a mechanism to actually get fixed.
- Having the code review agent create verification artifacts. Review should flag gaps and recommend; verification should create proof documents.
- Expanding epic ACs ad-hoc in each story. Epic 3 has now had two stories where ACs were expanded from 3 to 6-8 at story-creation time. The epic definitions should be updated at the source.

---

## 6. Action Items

### Fix now (before next session)

- [ ] **Fix the black-box enforcement bug in verify tool** — Carried forward from Session 8. 4th session blocked. `checkBlackBoxEnforcement()` must respect verification tier (unit-testable vs black-box).
- [ ] **Remove or archive stale `epics.md`** — Carried forward from Session 8. 3rd session with wasted agent time.
- [ ] **Advance stories 3-1 and 3-2 past `verifying`** — Both have integration-required ACs correctly escalated. They should be marked done with follow-up stories tracked for the escalated ACs.
- [ ] **Fix verify tool proof parser** — 6 vs 7 PASS count mismatch on story 3-2 suggests a parsing bug. Investigate and fix before next verification run.

### Fix soon (next sprint)

- [ ] **Update Epic 3 AC definitions at source** — Both stories 3-1 and 3-2 required ad-hoc AC expansion from 3 to 6-8 ACs. Update `epics-overhaul.md` with the expanded ACs to prevent repeated workarounds.
- [ ] **Add AGENTS.md creation to dev subagent new-module template** — Missing AGENTS.md was caught in review. Should be part of the module creation checklist.
- [ ] **Restrict review agent from creating proof documents** — Add guard to code-review subagent instructions: verification artifacts are verification's job.
- [ ] **Implement AC #6 for both 3-1 and 3-2** — Story 3-1 AC #6 (timeout report in drill-down) and 3-2 AC #6 (sprint loop continues on failure) both need integration testing. Could be a shared integration-test story.

### Backlog (track but not urgent)

- [ ] **Replace `Record<string, unknown>` casts in orchestrator.ts** — 3 instances of untyped child_process error properties. Create proper error type.
- [ ] **Switch `captureFilesChanged()` from `execSync` to `execFileSync`** — Consistency fix, low priority.
- [ ] **Remove test redundancy between index.test.ts and orchestrator.test.ts** — Both test Result shape assertions.
- [ ] **Investigate execFileSync stderr capture on success path** — Current architecture cannot capture stderr on successful runs. May need to switch to `spawn` if stderr capture is important.

---

## Full-Day Summary (Updated)

| Metric | Value |
|--------|-------|
| Stories attempted (full day) | 10 |
| Stories completed | 8 (1-1, 1-2, 1-3, 2-1, 2-2, 2-3, 2-4, epic milestones) |
| Stories stuck at verifying | 2 (3-1: 1 escalated AC; 3-2: 2 escalated ACs) |
| Epics completed | 2 (Epic 1: Foundation, Epic 2: Unified State & Status) |
| Epic 3 progress | 0/4 done, 2/4 verifying, 2/4 backlog |
| Ralph iterations (est.) | 11 |
| Bugs found today | 13 (12 fixed in review, 1 systemic — black-box enforcement) |
| Workarounds applied today | 5 |
| Review findings fixed today | 9 (HIGH) + 7 (MEDIUM) = 16 |
| Unfixed LOW issues | 21 (17 prior + 4 new) |
| `status.ts` line count | 714 (critical — NFR18 limit is 300) |
| Dev module coverage | 100% (all metrics) |
| "Fix now" items carried forward | 2 (black-box bug, stale epics.md) |
| Next up | Fix black-box enforcement, advance 3-1/3-2, start 3-3-verify-dev-feedback-loop |

---

# Session Retrospective — 2026-03-18 (Session 3)

**Sprint:** Architecture Overhaul Sprint
**Session window:** ~08:00Z – 08:45Z (estimated from issue timestamps)
**Stories attempted:** 4
**Stories completed:** 1 (2-4 done), 2 blocked at verification, 1 at review
**Ralph loop count:** 12 (cumulative)

---

## 1. Session Summary

| Story | Status | Phases Run | Outcome |
|-------|--------|------------|---------|
| 2-4-status-story-drill-down | done | create-story, dev, code-review | Completed. 3 HIGH type-safety issues caught and fixed in review. |
| 3-1-error-capture-on-timeout | verifying (blocked) | create-story, dev, code-review, verification | 5/6 ACs verified. AC #6 escalated (integration-required). Black-box enforcement bug blocks pass. |
| 3-2-graceful-dev-module | verifying (blocked) | create-story, dev, code-review, verification | 7/8 ACs verified. AC #6 escalated (integration-required). 100% dev module coverage. 2 escalated ACs block advancement. |
| 3-3-verify-dev-feedback-loop | review | create-story, dev | Implemented and tests written. 88.63% branch coverage. Awaiting code review. |

**Sprint progress:** Epic 2 complete (4/4 done). Epic 3 at 0/4 done, 2/4 verifying, 1/4 review, 1/4 backlog.

---

## 2. Issues Analysis

### Bugs discovered during implementation or verification

1. **`AcDetail.verdict` typed as `string` instead of `AcVerdict`** (story 2-4, code-review) — Lost type safety on the drill-down AC verdict field. Fixed in review.
2. **`StoryDrillDown.status` typed as `string` instead of `StoryStatus`** (story 2-4, code-review) — Same class of bug. Fixed in review.
3. **`ProofSummary` missing `pendingCount`** (story 2-4, code-review) — Proof total was wrong when pending ACs existed. Fixed.
4. **Story key not sanitized in timeout report filename** (story 3-1, code-review) — Path traversal possible with malformed story keys. Fixed.
5. **Trailing newline off-by-one in `capturePartialStderr`** (story 3-1, code-review) — Last captured line wasted on empty string. Fixed.
6. **No validation on `iteration`/`durationMinutes` parameters** (story 3-1, code-review) — Negative/zero/non-integer values accepted silently. Fixed.
7. **Zero coverage on `timeout-report.ts`** (story 3-1, code-review) — 4.76% statements, 0% branches before fix. 7 unit tests added.
8. **`filesChanged`/`testsAdded` not captured in non-timeout error path** (story 3-2, code-review) — Partial work data lost on non-timeout failures. Fixed.
9. **Branch coverage gap on line 59** (story 3-2, code-review) — Empty line filtering untested. Fixed, now 100%.
10. **SIGTERM-only timeout path untested** (story 3-2, code-review) — `signal === 'SIGTERM'` without `killed === true` was uncovered. Test added.
11. **Verify tool blackBoxPass enforcement bug** (story 3-1, verification) — `checkBlackBoxEnforcement` requires docker-exec/docker-host/observability commands in every non-escalated AC section. Unit-testable proofs that use `npx vitest` get flagged as failing even when all ACs pass. Known from prior session, still unfixed.
12. **Verify tool proof parser miscount** (story 3-2, verification) — Reports 6 verified vs manual count of 7 PASS. Parser may have issues detecting PASS verdicts in certain AC section formats.

### Workarounds applied (tech debt introduced)

1. **Synthetic attempt history** (story 2-4) — `StoryState` only tracks `attempts: number`, not per-attempt logs. Drill-down shows "details unavailable" for historical attempts. Real per-attempt tracking deferred.
2. **Limited AcDetail enrichment** (story 2-4) — Only `reason` populated from `lastError` for failed ACs. `command`, `expected`, `actual`, `suggestedFix` fields await upstream `AcResult` extension.
3. **Expanded sparse ACs** (stories 3-1, 3-2, 3-3) — Epic definitions had only 3 ACs each; expanded to 6-8 to cover NFRs and edge cases. AC expansion at create-story time is becoming a pattern — epics are too terse.
4. **Duplicate proof parser in feedback.ts** (story 3-3) — Verify module is still a stub, so feedback.ts implements its own proof parser. Will duplicate logic that should live in Epic 4's verify module extraction.
5. **`vi.resetAllMocks()` instead of `vi.clearAllMocks()`** (story 3-3) — Mock leaks with persistent `mockImplementation` required the heavier reset. Indicates test isolation problems.

### Code quality concerns raised by reviewers

1. **`status.ts` at 714 lines** — Exceeds NFR18 limit of 300 lines. Pre-existing, worsened by 2-4. Needs extraction/refactoring.
2. **`MAX_ATTEMPTS` alias duplicated** in drill-down.ts and reporter.ts (story 2-4, LOW, not fixed).
3. **`AttemptRecord.outcome` typed as `string`** instead of union type (story 2-4, LOW, not fixed).
4. **`capturePartialStderr` reads entire file into memory** before slicing last N lines (story 3-1, LOW, not fixed).
5. **`captureTimeoutReport` hardcodes `sprint-state.json` path** via `process.cwd()` (story 3-1, LOW, not fixed).
6. **`formatReport` hardcodes "last 100 lines"** in heading regardless of actual maxLines (story 3-1, LOW, not fixed).
7. **Unused `dirname` import** in timeout.ts line 8 (story 3-1, LOW, not fixed).
8. **`Record<string, unknown>` casts** used 3 times in orchestrator.ts for untyped child_process error properties (story 3-2, LOW, not fixed).
9. **`captureFilesChanged()` uses `execSync`** instead of `execFileSync` for git commands (story 3-2, LOW, not fixed).
10. **Test redundancy** between index.test.ts and orchestrator.test.ts for Result shape testing (story 3-2, LOW, not fixed).

### Verification gaps

1. **AC #6 in story 3-1** — Status drill-down showing timeout info requires cross-module integration between timeout module and status reporter. Correctly escalated, but means the timeout-to-status pipeline is untested.
2. **AC #6 in story 3-2** — Sprint loop continuing on dev failure requires live ralph integration test. Cannot be verified at unit level.
3. **AC #2 in story 3-3** — Dev prompt inclusion of failing ACs is handled at harness-run prompt level, not in TypeScript. Not testable in this story's scope.
4. **`captureStateDelta` does not test malformed JSON parse error path** (story 3-1).
5. **Branch coverage 88.63% on feedback.ts** — Uncovered branches are regex match arms in `parseProofForFailures` for contrived proof formats.
6. **Code review created proof document prematurely** (story 3-2) — Verification's job, not code review's. May cause tier classification confusion.

### Tooling/infrastructure problems

1. **Two epics files exist** (`epics.md` and `epics-overhaul.md`) — Session had to determine which was authoritative. `epics-overhaul.md` is correct. Stale `epics.md` should be removed or archived.
2. **20+ pre-existing BATS test failures** — `bridge.bats` and `exec_plans.bats` fail due to `declare -A` requiring bash 4+ on macOS. Unrelated to current stories but pollute test output.
3. **Commander option parsing stderr noise** — Two harmless Commander parsing errors during test runs. Not failures, just import-time side effects.
4. **sprint-status.yaml not auto-updated by dev agent** (story 3-3) — Dev agent had to note manual sync was needed (`ready-for-dev -> review`).
5. **npx startup overhead risk** — `npx codeharness timeout-report` in ralph.sh may exceed the 10-second budget. Direct `node dist/index.js` would be faster but requires knowing the install path.

---

## 3. What Went Well

- **Epic 2 fully completed.** All 4 stories (2-1 through 2-4) reached done status. The unified state and status command chain is operational.
- **Code review is catching real issues consistently.** This session: 3 HIGH type-safety bugs (2-4), 4 MEDIUM bugs (3-1), 3 MEDIUM bugs (3-2). The review gate is earning its cost.
- **Dev module hit 100% coverage** on all metrics (statements, branches, functions, lines). Clean implementation with proper Result<T> wrapping.
- **Session issues log is dense and useful.** Every subagent (create-story, dev, code-review, verification) logged problems as they occurred. 108 lines of raw data across 11 log sections.
- **Story 3-3 advanced quickly** — from backlog to review in a single session segment. Create-story and dev phases completed without blockers.
- **All 1861 tests pass, build clean.** No regressions introduced despite touching multiple modules.

---

## 4. What Went Wrong

- **Black-box enforcement bug still unfixed.** This was identified in Session 1 and carried forward through Sessions 2 and 3. Stories 3-1 and 3-2 are both blocked at verification because of it. Two stories stuck in `verifying` limbo is a concrete cost of not fixing this.
- **Integration-required ACs are unprovable.** Three stories (3-1, 3-2, 3-3) each have at least one AC that requires live ralph integration or cross-module wiring. These ACs get escalated and block story completion. The pattern of "AC requires integration but story is unit-scoped" is a design flaw in the story definitions.
- **Epic AC definitions are too sparse.** Three stories this session required AC expansion from 3 epic-level ACs to 6-8 story-level ACs. The create-story agent spends time inventing ACs rather than implementing the epic author's intent. This is wasted motion.
- **`status.ts` is 714 lines and growing.** NFR18 limit is 300. Every status-related story makes it worse. No refactoring story exists to address this.
- **Stale `epics.md` is still present.** Reported in Session 2. Still causing confusion when agents look for epic definitions.
- **Proof parser accuracy is questionable.** Verification reported 6 verified for story 3-2 while manual count shows 7 PASS. If the parser undercounts, stories may be incorrectly blocked.

---

## 5. Lessons Learned

**Repeat:**
- Running code review as a mandatory gate before verification. This session's reviews caught 10 bugs (3 HIGH, 7 MEDIUM) that would have reached verification or production otherwise.
- Logging issues in `.session-issues.md` at every phase boundary. The density of actionable data is high.
- Using `Result<T>` pattern consistently across modules. Stories 3-1 and 3-2 both follow the pattern cleanly, making error handling predictable.

**Avoid:**
- Leaving systemic bugs unfixed across sessions. The black-box enforcement bug has now blocked verification in 3 consecutive sessions. It should have been the first fix in Session 2.
- Writing ACs that require integration testing when the story is unit-scoped. Either make the AC testable at the story's tier, or split it into a separate integration story.
- Allowing files to grow past NFR limits without scheduling remediation. `status.ts` at 714 lines is now more than double the limit.
- Having two competing source-of-truth files for the same data (epics.md vs epics-overhaul.md).

---

## 6. Action Items

### Fix now (before next session)

1. **Fix black-box enforcement bug in verify.ts** — Make `checkBlackBoxEnforcement` aware of proof tier (unit-testable vs black-box). This is blocking 2 stories from advancing past `verifying`.
2. **Delete or archive stale `epics.md`** — Only `epics-overhaul.md` should exist. Agents are wasting time disambiguating.
3. **Advance story 3-3 through code review** — It's at `review` status. Run code-review, then verification.

### Fix soon (next sprint)

4. **Refactor `status.ts`** (714 lines) — Extract drill-down logic, reporter logic, and formatter into separate files. Create a story for this.
5. **Fix proof parser miscount** — Investigate why `codeharness verify` reports 6 verified when 7 ACs are PASS. May be a section format detection issue.
6. **Add per-attempt tracking to `StoryState`** — Current `attempts: number` loses history. Needed for meaningful drill-down attempt display.
7. **Enrich `AcResult` with detail fields** — `command`, `expected`, `actual`, `suggestedFix` are needed for useful drill-down output.
8. **Create integration test story** — Consolidate the escalated ACs from 3-1/3-2/3-3 into a single integration test story that runs with live ralph.

### Backlog (track but not urgent)

9. **Fix unused `dirname` import** in timeout.ts.
10. **Replace `execSync` with `execFileSync`** in captureFilesChanged().
11. **Eliminate `Record<string, unknown>` casts** in orchestrator.ts — type the child_process error properly.
12. **Remove `MAX_ATTEMPTS` duplication** between drill-down.ts and reporter.ts.
13. **Address `capturePartialStderr` memory usage** — stream last N lines instead of reading entire file.
14. **Fix `formatReport` hardcoded heading** — Use actual maxLines value.
15. **Clean up test redundancy** between index.test.ts and orchestrator.test.ts.
16. **Fix BATS tests for bash 4+** — `declare -A` incompatibility on macOS default bash 3.

---

## Cumulative Session Stats (2026-03-18, all 3 sessions)

| Metric | Value |
|--------|-------|
| Total stories attempted today | 8 (1-1, 1-2, 2-4, 3-1, 3-2, 3-3 + 2-1 through 2-3 from prior sessions) |
| Stories at done | 7 (1-1, 1-2, 2-1, 2-2, 2-3, 2-4, 1-3) |
| Stories at verifying (blocked) | 2 (3-1, 3-2) |
| Stories at review | 1 (3-3) |
| Epics completed | 2 (Epic 1, Epic 2) |
| Epic 3 progress | 0/4 done, 2/4 verifying, 1/4 review, 1/4 backlog |
| Ralph loop count | 12 |
| Bugs found this session | 12 (10 fixed in review, 2 systemic) |
| Workarounds applied this session | 5 |
| Review findings fixed this session | 3 HIGH + 7 MEDIUM = 10 |
| Unfixed LOW issues (cumulative) | 27 (21 prior + 6 new) |
| `status.ts` line count | 714 (critical — NFR18 limit is 300) |
| Tests passing | 1861 |
| Blocking issue | Black-box enforcement bug (3 sessions unfixed) |
| Next up | Fix black-box enforcement, code-review 3-3, unblock 3-1/3-2 verification |
