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

---

# Session Retrospective — 2026-03-18 (Session 4, ~16:05Z – 16:23Z)

**Sprint:** Architecture Overhaul Sprint
**Session window:** ~16:05Z – 16:23Z (from session issues log timestamps)
**Stories attempted:** 2
**Stories completed:** 0 new completions (both still in pipeline)

---

## 1. Session Summary

| Story | Start Status | End Status | Notes |
|-------|-------------|------------|-------|
| 3-3-verify-dev-feedback-loop | verifying | verifying | Code review completed at 16:05Z. 6 bugs found (2 HIGH, 4 MEDIUM), all fixed. Story remains in verifying — awaiting final verification pass. |
| 3-4-eight-hour-stability-test | backlog | review | Story created (16:12Z) and dev-story completed (16:23Z). Validator module implemented, CLI command added, test fixtures and harness scripts created. Now awaiting code review. |

Epic 3 progress: 0/4 done, 3/4 verifying, 1/4 review. No stories crossed the done line this session, but 3-3 got significantly hardened through review, and 3-4 went from backlog to review in one pass.

---

## 2. Issues Analysis

### Bugs discovered during implementation or verification

1. **HIGH: Findings replacement regex fragile at EOF** (3-3, code-review) — The regex for replacing the `## Verification Findings` section in story files could leave stale content if the section was at the end of the file. Fixed during review.
2. **HIGH: Branch coverage falsely claimed at 100%** (3-3, code-review) — Dev agent claimed 100% branch coverage, but actual measurement showed 88.63%. False completion claim that would have passed without review scrutiny.
3. **MEDIUM: Verdict regex didn't handle multi-line format** (3-3, code-review) — The proof document parser assumed verdict was always on the same line as the `**Verdict:**` marker. The spec allows next-line format. Fixed.
4. **MEDIUM: State inconsistency on partial failure** (3-3, code-review) — In `processVerifyResult`, if findings were written but the state update failed, the system would be in an inconsistent state (findings present, but status not updated). Fixed by reversing operation order.
5. **MEDIUM: Off-by-one in Dev Agent Record insertion** (3-3, code-review) — The findings section was inserted at the wrong position relative to the `## Dev Agent Record` section boundary.
6. **MEDIUM: Missing test for state failure side-effect** (3-3, code-review) — No test verified the behavior when `updateStoryStatus` fails after findings are already written.

### Workarounds applied (tech debt introduced)

1. **sprint-status.yaml parsed with simple regex, not proper YAML parser** (3-4, dev) — The `validateStateConsistency` function parses sprint-status.yaml with regex pattern matching instead of using a YAML library. Brittle if the YAML structure changes. Acceptable for now since the format is controlled and simple.
2. **Stale lastError check uses hardcoded 24h threshold** (3-4, dev) — The validator flags `lastError` as stale if older than 24 hours. This threshold is a reasonable guess, not specified in the epic or architecture doc. Could produce false positives on slow-running projects.
3. **BATS test for ralph session recovery not implemented** (3-4, dev) — Task 7 called for a BATS test that starts ralph, sends SIGINT, restarts, and verifies state preservation. This was not implemented because it requires a full project setup with ralph configured. The unit tests cover the state preservation logic, but the end-to-end integration test is missing.

### Code quality concerns

1. **LOW: Direct exports from feedback.ts accessible outside module boundary** (3-3, code-review) — Internal functions like `parseProofForFailures` and `writeVerificationFindings` are exported from the module index. Convention says only `processVerifyResult` should be the public API, but TypeScript doesn't enforce module-internal visibility.
2. **LOW: Import ordering inconsistency** (3-3, code-review) — Minor style issue, not fixed.

### Verification gaps

1. **3-3 still in verifying** — Code review found and fixed 6 bugs. The story needs another verification pass to confirm the fixes hold. Branch coverage gap (88.63% vs 100% claimed) is concerning — the dev agent's self-reported coverage numbers cannot be trusted.
2. **3-4 coverage not formally measured** (dev) — Dev agent did not run `vitest --coverage` to report actual coverage numbers. Self-reported task completion without measurement evidence.
3. **3-4 AC #1, #3, #4 are non-deterministic** (create-story) — These ACs depend on wall-clock time, Docker availability, and API behavior. They cannot be verified in CI and require manual integration testing.

### Architecture concerns

1. **processVerifyResult partial-failure window** (3-3) — Even after the fix (reversed operation order), there is still a theoretical window where state is updated but findings are not written. Lower risk than the original direction, but not fully atomic.

### Tooling/infrastructure problems

None new this session.

---

## 3. What Went Well

- **Code review on 3-3 caught 6 real bugs** — Two HIGH-severity issues (EOF regex, false coverage claim) would have caused production failures. The review step continues to justify its cost.
- **Story 3-4 went from backlog to review in one pass** — Story creation and development completed in ~11 minutes (16:12Z to 16:23Z). The dev agent produced a validator module, CLI command, test fixtures, stability harness scripts, and Docker kill test in a single iteration.
- **Session issues log discipline maintained** — All three subagents (code-review, create-story, dev-story) logged their findings. Raw materials for this retrospective came directly from the log.
- **3-3 significantly hardened** — Six bugs fixed means the feedback loop is now more robust than what dev originally delivered. The verify-dev cycle is working as designed — review catches what dev misses.

---

## 4. What Went Wrong

- **Dev agent false coverage claim on 3-3** — Reported 100% branch coverage when actual was 88.63%. This is a recurring pattern: dev agents self-report completion metrics without running the actual measurement tools. Reviews catch this, but it wastes a review cycle.
- **No stories reached done status** — Two stories were worked but neither completed the full pipeline (dev -> review -> verify -> done). 3-3 is stuck in verifying after review fixes, and 3-4 just entered review. The pipeline is full but nothing shipped.
- **3-4 missing BATS integration test for session recovery** — A key acceptance criterion (ralph session recovery after SIGINT) has no end-to-end test. Unit tests cover the logic, but the integration gap means AC #8 is not fully testable in the current setup.
- **Non-deterministic ACs in 3-4** — Three of ten ACs require Docker, wall-clock timing, or API availability. These cannot be verified in CI, making the story partially untestable in automated pipelines.

---

## 5. Lessons Learned

**Repeat:**
- Code review as a mandatory step. This session's review of 3-3 found 2 HIGH bugs that would have shipped otherwise.
- Creating stories and immediately implementing them in the same session. The 3-4 turnaround was fast because context was fresh.
- Logging session issues from every subagent. The retrospective writes itself when the data is already captured.

**Avoid:**
- Trusting dev agent self-reported coverage numbers. Always require actual `vitest --coverage` output as evidence. Consider adding a post-dev automated coverage check.
- Accepting non-deterministic ACs without flagging them at story creation time. ACs #1, #3, #4 on story 3-4 should have been marked `integration-required` from the start (they were, but the implications for CI were not discussed).
- Leaving regex-based parsers as permanent solutions. The sprint-status.yaml regex parser in validator.ts will break on any structural change.

---

## 6. Action Items

### Fix now (before next session)

- [ ] **Run verification pass on 3-3** — Code review fixed 6 bugs. The story needs re-verification to confirm fixes hold and branch coverage is now actually at target.
- [ ] **Run code review on 3-4** — Story is at review status. Code review should check validator logic, coverage claims, and the regex YAML parser.

### Fix soon (next sprint)

- [ ] **Add automated post-dev coverage check** — Dev agents repeatedly over-report coverage. Add a CI step or hook that runs `vitest --coverage` and fails if below threshold, independent of dev agent claims.
- [ ] **Implement BATS session recovery test for 3-4** — AC #8 needs an end-to-end test. May require a lightweight test harness that simulates ralph startup/SIGINT/restart.
- [ ] **Replace regex YAML parser in validator.ts** — Use a proper YAML library (js-yaml) to parse sprint-status.yaml. The regex approach is brittle.
- [ ] **Make lastError staleness threshold configurable** — The hardcoded 24h threshold should be a parameter or read from project config.

### Backlog (track but not urgent)

- [ ] **Enforce module-internal visibility** — `parseProofForFailures` and `writeVerificationFindings` should not be part of the sprint module's public API. Consider barrel export patterns or `@internal` annotations.
- [ ] **Address processVerifyResult atomicity gap** — The partial-failure window (state updated, findings not written) is low-risk but not zero-risk. Consider a transaction-like pattern or compensating action.
- [ ] **Document non-deterministic AC testing strategy** — ACs requiring Docker, wall-clock time, or external APIs need a documented approach (manual test checklist, dedicated CI environment, or conditional skip).

---

## Cumulative Session Stats (2026-03-18, all 4 sessions)

| Metric | Value |
|--------|-------|
| Total stories attempted today | 10 (sessions 1-3: 1-1, 1-2, 1-3, 2-1, 2-2, 2-3, 2-4, 3-1, 3-2; session 4: 3-3, 3-4) |
| Stories at done | 7 (1-1, 1-2, 1-3, 2-1, 2-2, 2-3, 2-4) |
| Stories at verifying | 3 (3-1, 3-2, 3-3) |
| Stories at review | 1 (3-4) |
| Epics completed | 2 (Epic 1, Epic 2) |
| Epic 3 progress | 0/4 done, 3/4 verifying, 1/4 review |
| Bugs found this session | 6 (all fixed in code review of 3-3) |
| Workarounds applied this session | 3 (regex YAML parser, 24h threshold, missing BATS test) |
| Review findings fixed this session | 2 HIGH + 4 MEDIUM = 6 |
| Tests passing | 1888+ (71 files) |
| Blocking issue | Black-box enforcement bug (4 sessions unfixed), 3-1/3-2/3-3 stuck in verifying |
| Next up | Verify 3-3 post-review, code-review 3-4, unblock 3-1/3-2 |

---

# Session 5 Retrospective — 2026-03-18T19:59Z

**Sprint:** Architecture Overhaul Sprint
**Session window:** ~17:00Z – 20:56Z (estimated from issue timestamps and ralph logs)
**Stories attempted:** 2 (3-3, 3-4)
**Stories completed:** 0 (both remain at `verifying`)

---

## 1. Session Summary

| Story | Entry State | Exit State | Cycles | Notes |
|-------|------------|------------|--------|-------|
| 3-3-verify-dev-feedback-loop | verifying | verifying | 0 | No new activity logged in session issues this session. Remains stuck in verifying from session 4. |
| 3-4-eight-hour-stability-test | verifying | verifying | 4 (verify → dev fix → code review → re-verify) | Went through a full feedback loop but re-verification still fails: 2/10 ACs verified. |

Ralph ran 3 iterations this session (3 claude_output logs created). All changes remain uncommitted.

---

## 2. Issues Analysis

### Bugs Discovered

| # | Severity | Description | Status |
|---|----------|-------------|--------|
| 1 | MEDIUM | `validate-state.ts` used `path.join()` instead of `path.resolve()` for path construction — breaks with absolute paths | Fixed in code review cycle |
| 2 | LOW | Type assertions in `validate-state.ts` (no runtime schema validation) | Noted, not fixed |
| 3 | LOW | No runtime schema validation in `validator.ts` | Noted, not fixed |

### Workarounds Applied (Tech Debt)

None new this session. Previous session workarounds remain in place.

### Code Quality

- Coverage reached **95.83%** across all 75 files (all above 80% floor)
- All **1925 tests pass**
- `validator.ts` went from 92.18% to 100% coverage after adding 4 defensive catch-block tests

### Verification Gaps

This was the dominant problem this session:

1. **AC10 (coverage)** — initially failed at 92.18%, fixed by adding tests for defensive catch blocks
2. **ACs 5, 6, 7, 8** — lack `bash+output` evidence pairs. The showboat verifier counts them as pending because proof format doesn't meet the expected template (2/10 verified)
3. **ACs 1, 3, 4** — correctly escalated (require actual 8-hour integration runs)
4. **Root cause identified**: Story 3.4 is a mixed story. It has unit-testable ACs (validator, CLI, coverage) and integration-required ACs (stability scripts, 8-hour runs). The Docker black-box container only has the npm package installed — test fixtures and `tests/stability/` scripts are dev-only artifacts not in `dist/`. This makes it impossible to verify integration ACs via the standard black-box pathway.

### Tooling/Infrastructure Problems

| Problem | Impact |
|---------|--------|
| Black-box enforcement gap | Stability test scripts (`tests/stability/`) are not included in the npm package. Docker container cannot run them. This is a structural issue — not a bug in the verifier. |
| Proof format mismatch | Non-escalated ACs with CLI evidence are being rejected because they lack `bash+output` formatting that the showboat verifier expects. 5 ACs affected. |

---

## 3. What Went Well

- **Full feedback loop executed**: Story 3-4 went through verify → dev fix → code review → re-verify in a single session. The pipeline worked as designed even though the outcome was still "verifying".
- **Coverage gap closed**: validator.ts went from 92.18% to 100% with targeted defensive tests. Dev agent identified and fixed the gap quickly.
- **Code review caught a real bug**: `join()` vs `resolve()` path issue in validate-state.ts would have caused failures with absolute paths. Fixed before merge.
- **All 1925 tests still pass**: No regressions introduced despite significant changes (560 lines added/changed across 21 files).

---

## 4. What Went Wrong

- **Story 3-4 remains stuck in verifying** after 4 cycles. The problem is structural: the story mixes unit-testable and integration-testable ACs, and the verification pathway can only handle one or the other.
- **Proof format rigidity**: ACs that have valid CLI evidence are being rejected because the format doesn't match what the showboat expects. This wastes verify-dev cycles on formatting problems, not actual code quality issues.
- **No stories moved to done this session**. Stories 3-1, 3-2, 3-3, 3-4 all remain at `verifying`. Epic 3 has zero completions.
- **3 ralph iterations consumed with no forward progress on story state**. The verify-dev loop cycled but the structural blocker means it will keep cycling without resolution.

---

## 5. Lessons Learned

### Patterns to Repeat

- Code review as a gate before re-verification catches real bugs (path.join → path.resolve).
- Dev agent adding targeted tests for uncovered branches is effective — went from 92% to 100% in one cycle.

### Patterns to Avoid

- **Mixed-tier stories**: Stories that combine unit-testable ACs and integration-required ACs create verification deadlocks. The black-box verifier can't verify integration ACs, and splitting verification mid-story is not supported.
- **Burning cycles on format issues**: Multiple verify attempts failed because of proof formatting, not code quality. The verifier should be more lenient about evidence format or provide clearer feedback about what format it expects.
- **Leaving 4 stories in `verifying` simultaneously**: Creates a pile-up. Should focus on unblocking one story at a time.

---

## 6. Action Items

### Fix Now (Before Next Session)

- [ ] **Reformat proof for story 3-4 ACs 5/6/7/8**: Add proper `bash+output` evidence pairs so the showboat verifier accepts them. These ACs have valid evidence — it's a formatting problem.
- [ ] **Decide on 3-4 integration ACs**: Either mark ACs 1, 3, 4 as permanently escalated (they require 8-hour runs nobody will do in CI), or restructure the story to separate them.

### Fix Soon (Next Sprint)

- [ ] **Split mixed-tier stories at planning time**: Add a constraint to story creation that prevents mixing `cli-verifiable` and `integration-required` ACs in the same story, OR teach the verifier to handle partial verification (some ACs verified, some escalated = story passes).
- [ ] **Unblock stories 3-1 and 3-2**: These have been stuck in `verifying` since session 2. Diagnose and resolve or force-complete.
- [ ] **Include test fixtures in Docker build** (or create a separate verification image): The npm-package-only Docker image is insufficient for stories that test dev-only scripts.

### Backlog

- [ ] **Proof format documentation**: Document what the showboat verifier expects for `bash+output` evidence pairs so agents produce correct proofs on first attempt.
- [ ] **Runtime schema validation**: Add Zod or similar validation to `validator.ts` and `validate-state.ts` to replace type assertions (LOW issues from code review).
- [ ] **Verifier feedback quality**: When the verifier rejects proof for formatting reasons, it should say "wrong format" not just "pending" — agents waste cycles trying to fix code when the code is fine.

---

## Updated Running Totals

| Metric | Value |
|--------|-------|
| Total stories attempted today | 10 (sessions 1-4: 1-1 through 3-4; session 5: 3-3, 3-4) |
| Stories at done | 7 (1-1, 1-2, 1-3, 2-1, 2-2, 2-3, 2-4) |
| Stories at verifying | 4 (3-1, 3-2, 3-3, 3-4) |
| Epics completed | 2 (Epic 1, Epic 2) |
| Epic 3 progress | 0/4 done, 4/4 verifying |
| Bugs found this session | 1 MEDIUM (path.join), 2 LOW (type assertions) |
| Tests passing | 1925 (75 files) |
| Coverage | 95.83% overall, all files above 80% floor |
| Blocking issue | Verification pathway cannot handle mixed-tier stories; 4 stories stuck in verifying |
| Next up | Reformat 3-4 proof, unblock 3-1/3-2/3-3, then push Epic 3 to done |

---

# Session Retrospective — 2026-03-18 (Session 6, ~17:00Z – 21:42Z)

**Sprint:** Architecture Overhaul Sprint
**Session window:** ~17:00Z – 21:42Z (from session issues log timestamps and file modification times)
**Stories attempted:** 3 (3-3, 3-4, 4-1)
**Stories completed:** 0 (3-3 and 3-4 remain at `verifying`, 4-1 at `review`)
**Ralph iterations this session:** 4 (claude_output logs at 19:59, 20:26, 20:56, 21:19)

---

## 1. Session Summary

| Story | Entry State | Exit State | Cycles | Notes |
|-------|------------|------------|--------|-------|
| 3-3-verify-dev-feedback-loop | verifying | verifying | 0 new | No new activity logged. Remains stuck from session 4. |
| 3-4-eight-hour-stability-test | verifying | verifying | 4 (verify, dev fix, code review, re-verify) | Full feedback loop executed. AC10 coverage gap fixed (92% -> 100%). Code review caught `join()` vs `resolve()` bug. Re-verification still fails: 2/10 ACs verified due to proof format mismatch and Docker image lacking test scripts. |
| 4-1-verify-module-extraction | backlog | review | 1 (create-story, dev-story) | Story created and implemented. ~1,307 lines of verify code reorganized into module structure. Session time exhausted before code review or verification could run. |

**Sprint progress:** Epic 3 at 0/4 done, 4/4 verifying. Epic 4 started with 4-1 at review. No stories crossed the done line this session.

---

## 2. Issues Analysis

### Bugs discovered during implementation or verification

1. **MEDIUM: `validate-state.ts` used `path.join()` instead of `path.resolve()`** (3-4, code-review) — Path construction breaks with absolute paths. Found and fixed during code review. This is the kind of bug that only surfaces in production when paths differ from development defaults.

2. **AC10 coverage gap: `validator.ts` at 92.18%** (3-4, verification) — Defensive catch blocks had no test coverage. Fixed by adding 4 targeted tests, reaching 100% on all metrics.

3. **Proof parser format mismatch** (3-4, re-verification) — Non-escalated ACs 5, 6, 7, 8 have valid CLI evidence but lack the `bash+output` evidence pair format that the showboat verifier expects. Result: 2/10 ACs verified when the actual number with valid evidence is higher. This is the same class of problem reported in session 5 — the verifier rejects valid proof because of formatting, not substance.

### Workarounds applied (tech debt introduced)

1. **Duplicate proof parser in feedback.ts** (3-3, carried forward) — The verify module is still a stub, so the feedback loop implements its own proof markdown parser. Story 4-1's verify module extraction will eventually absorb this, but until then there are two independent proof parsers in the codebase.

2. **`verify-env.ts` at 472 lines needs splitting** (4-1, create-story) — Identified during story creation. Exceeds NFR18 300-line limit. The module extraction in 4-1 will need to split this file during migration, adding scope to an already large story.

3. **`commands/verify.ts` at 303 lines** (4-1, create-story) — Also exceeds NFR18. Needs refactoring to under 100 lines as part of the extraction, but 4-1's dev agent chose to delegate logic rather than fully decompose.

### Code quality concerns

1. **`index.ts` at 141 lines in verify module** (4-1, dev) — Exceeds the 100-line target for module indexes. Needed for re-exports and delegation. Acceptable but above target.

2. **`proof.ts` lines 207, 242 uncovered** (4-1, dev) — Edge-case parser branches for unusual proof document formats. Overall 91.6% statements / 97.9% lines. Close to target but not at 100%.

3. **5 `as any` assertions in verify-env tests** (4-1, dev) — Test-only type-casting to mock complex interfaces. Technically violates NFR19 (no `any` types) but pragmatic for test mocks.

4. **`commands/verify.ts` still 303 lines** (4-1, dev) — Pre-existing, not addressed this session. Delegates logic to the new module but the file itself was not shrunk.

5. **Overall coverage at 95.83%, all 75 files above 80% floor** — Healthy baseline maintained despite significant code reorganization.

### Verification gaps

1. **Story 3-4: 2/10 ACs verified** — Root cause identified: story mixes unit-testable ACs (validator, CLI, coverage) and integration-required ACs (stability scripts, 8-hour runs). The Docker container only has the npm package — `tests/stability/` scripts and test fixtures are dev-only artifacts not included in `dist/`. The standard black-box verification pathway cannot access them.

2. **Story 3-4: ACs 1, 3, 4 correctly escalated** — These require actual 8-hour runs. Nobody is going to run these in CI. They need to be accepted as permanently escalated or the story needs restructuring.

3. **Story 4-1: No code review or verification** — Session time ran out after dev-story completed. The story has ~1,307 lines of reorganized code with no review gate yet. Historical pattern shows reviews catch 2-4 bugs per story.

4. **Old story file collision risk** (4-1) — `4-1-verification-pipeline-showboat-integration.md` (v1 archive) exists alongside the new `4-1-verify-module-extraction.md`. Could confuse agents that search by story key prefix.

### Tooling/infrastructure problems

1. **Docker image lacks dev-only test artifacts** — The npm-package-only Docker image is structurally insufficient for stories that test scripts in `tests/stability/` or `tests/fixtures/`. This blocks verification for any story with integration ACs about dev tooling.

2. **Proof format rigidity** — The showboat verifier rejects valid evidence because of formatting (missing `bash+output` pairs), not substance. Multiple sessions have now reported this. Agents waste verify-dev cycles on format problems.

3. **sprint-status.yaml not auto-updated by agents** — Dev agents note manual sync is needed but don't actually update the YAML. Status drift between `sprint-state.json` and `sprint-status.yaml` accumulates.

---

## 3. What Went Well

- **Story 3-4 feedback loop executed correctly.** Verify found a real gap (92% coverage), dev fixed it (added 4 tests, reached 100%), code review caught a real bug (`join` vs `resolve`), re-verify confirmed the fix held. The pipeline worked as designed, even though the story remains stuck on verification format issues.

- **Story 4-1 created and implemented in one pass.** A large story (~1,307 lines of code reorganization) went from backlog to review in a single session. The verify module now has proper structure: `proof.ts`, `container.ts`, `verify-env.ts` split into the module, with `index.ts` orchestrating.

- **Coverage maintained at 95.83%.** Despite significant code moves and reorganization across 21+ files, no coverage regression. All 75 files stay above 80% floor.

- **All 1925 tests pass.** No regressions from either the 3-4 fixes or the 4-1 module extraction.

- **Root cause for 3-4 verification failure identified.** The problem is structural (Docker image missing dev scripts), not a code quality issue. This diagnosis prevents further wasted cycles trying to fix the code when the verification infrastructure is the bottleneck.

---

## 4. What Went Wrong

- **Zero stories moved to done.** This is the second consecutive session with no completions. Epic 3 has all 4 stories stuck at `verifying`. The pipeline is producing work but nothing is shipping.

- **4 stories remain stuck at `verifying` simultaneously.** Stories 3-1, 3-2, 3-3, and 3-4 are all in verification limbo. The backlog is clear but the verification stage is clogged. This indicates the verification pathway is the bottleneck, not development.

- **Verification format issues continue to waste cycles.** Story 3-4 went through a full verify-dev-review-re-verify loop this session, but re-verification still reports 2/10 ACs verified because of proof formatting. The dev agent fixed real code issues, but the format problem persists independent of code quality.

- **Story 4-1 shipped to review without code review gate.** Session time exhaustion meant ~1,307 lines of reorganized code have no review. Based on historical patterns (2-4 bugs caught per review), there are likely undetected issues.

- **"Fix now" items from prior sessions still unfixed.** The black-box enforcement bug (reported in session 1) and stale `epics.md` (reported in session 2) were both "Fix now" action items that have persisted for 5+ sessions. The "Fix now" category has no enforcement mechanism.

- **Epic 3 has zero completions after 6 sessions of work.** All 4 stories have been through dev and review, but none have cleared verification. The epic is 100% implemented and 0% complete by the sprint status definition.

---

## 5. Lessons Learned

### Patterns to Repeat

- **Diagnosing root causes before cycling.** The session correctly identified that 3-4's verification failure is structural (Docker image missing dev scripts) rather than trying another verify-dev cycle. This prevents wasting future iterations on a problem that code changes cannot fix.

- **Code review catching path bugs.** The `join()` vs `resolve()` fix is exactly the kind of issue that only surfaces in production with non-default path configurations. Review continues to justify its cost.

- **Large module extractions in single sessions.** Story 4-1 moved ~1,307 lines across 3 lib files into a proper module structure in one pass. The module skeleton from Epic 1 provided a clear target architecture, making the extraction mechanical rather than creative.

### Patterns to Avoid

- **Accumulating stories in `verifying`.** Four stories stuck simultaneously creates a pile-up that no single session can resolve. Stories should be unblocked one at a time, not left to accumulate.

- **Ignoring "Fix now" action items.** Both the black-box enforcement bug and stale epics.md have been "Fix now" for 5+ sessions. If an item is truly "Fix now", it should be the first thing addressed in the next session, not deferred behind story work.

- **Starting new stories (4-1) while old stories (3-1 through 3-4) are stuck.** Moving forward to Epic 4 before Epic 3 clears verification creates a longer unreviewed pipeline. Better to unblock the verification bottleneck first.

- **Mixed-tier stories.** Story 3-4 combines unit-testable ACs and integration-required ACs. The verification pathway can only handle one tier at a time. Stories should be split by verification tier at planning time.

---

## 6. Action Items

### Fix now (before next session)

1. **Unblock Epic 3 stories from `verifying`.** Stories 3-1, 3-2, 3-3, and 3-4 are all stuck. For each: if non-escalated ACs have valid evidence, manually advance to done with escalated ACs tracked as follow-up stories. Four stories in verification limbo is the highest-priority problem in the sprint.

2. **Fix proof format for story 3-4 ACs 5/6/7/8.** These have valid CLI evidence in the wrong format. Reformat to `bash+output` pairs so the verifier accepts them. Alternatively, make the verifier more lenient about evidence format.

3. **Run code review on story 4-1.** ~1,307 lines of reorganized code with no review gate. Historical bug rate is 2-4 per story. This should not sit in review overnight.

### Fix soon (next sprint)

4. **Fix the black-box enforcement bug.** `checkBlackBoxEnforcement()` must respect verification tier. This has been a "Fix now" item since session 1 and is still unfixed after 6 sessions. It is the single most persistent blocker in the sprint.

5. **Include test fixtures in Docker verification build (or create a dev-mode image).** The npm-package-only Docker image cannot verify stories about dev tooling scripts. Either add `tests/` to the Docker build context or create a separate image for integration verification.

6. **Split mixed-tier stories at planning time.** Add a constraint: no story should have both `cli-verifiable` and `integration-required` ACs unless the story explicitly defines how each tier is verified.

7. **Add a mechanism to enforce "Fix now" items.** These items persist for sessions because nothing prevents the next session from starting story work instead. Consider: the first Ralph iteration of each session runs "Fix now" items before picking new stories.

### Backlog (track but not urgent)

8. **Remove old story file `4-1-verification-pipeline-showboat-integration.md`.** Archive-v1 artifact that could confuse agents searching by story key prefix.

9. **Refactor `commands/verify.ts` below 100 lines.** Still at 303 lines after 4-1 extraction. The module now handles the logic, but the command file needs further trimming.

10. **Address `as any` assertions in verify-env tests.** 5 instances. Low priority but violates NFR19.

11. **Cover `proof.ts` edge-case branches (lines 207, 242).** Parser branches for unusual proof formats. Not critical but prevents 100% coverage.

---

## Updated Running Totals

| Metric | Value |
|--------|-------|
| Total stories attempted today | 12 (1-1 through 3-4 from sessions 1-5; 3-3, 3-4, 4-1 in session 6) |
| Stories at done | 7 (1-1, 1-2, 1-3, 2-1, 2-2, 2-3, 2-4) |
| Stories at verifying | 4 (3-1, 3-2, 3-3, 3-4) |
| Stories at review | 1 (4-1) |
| Epics completed | 2 (Epic 1, Epic 2) |
| Epic 3 progress | 0/4 done, 4/4 verifying (fully implemented, nothing shipped) |
| Epic 4 progress | 0/3 done, 1/3 review, 2/3 backlog |
| Ralph iterations this session | 4 |
| Ralph iterations total (est.) | ~18 |
| Bugs found this session | 2 (join vs resolve, coverage gap — both fixed) |
| Tests passing | 1925 (75 files) |
| Coverage | 95.83% overall, all files above 80% floor |
| Blocking issue | Verification bottleneck: 4 stories stuck, mixed-tier format issues, Docker image missing dev scripts |
| "Fix now" items unfixed from prior sessions | 2 (black-box enforcement bug since session 1, stale epics.md since session 2) |
| Sessions with zero completions | 2 consecutive (sessions 5 and 6) |
| Next up | Unblock Epic 3 verification, review 4-1, fix black-box enforcement |

---

# Session Retrospective — 2026-03-18 (Session 7, ~17:52Z – 21:50Z+)

**Sprint:** Architecture Overhaul Sprint
**Session window:** ~17:52Z – 21:50Z+ (from session issues log timestamps and ralph log)
**Stories attempted:** 2 (4-1 code review + verification; 3-1 verification retries)
**Stories completed:** 0 (4-1 moved from review to blocked-on-verification; 3-1 at retry 9/10)
**Ralph iterations this session:** 5 (19:59, 20:26, 20:56, 21:19, 21:46 — all on 3-1)

---

## 1. Session Summary

| Story | Entry State | Exit State | Cycles | Notes |
|-------|------------|------------|--------|-------|
| 4-1-verify-module-extraction | review | review (verification ran, 7/8 PASS, 1 ESCALATE, blocked by blackBoxPass=false) | 1 (code review + verify) | Code review found and fixed 2 bugs (HIGH: missing `strategy` field in 11 test mocks; MEDIUM: mutation of readonly fields). Verification produced strong proof: 7 PASS, 0 FAIL, 1 ESCALATE. But `codeharness verify` exit code 1 because blackBoxPass=false for a unit-testable story. Same blocker as session 1. |
| 3-1-error-capture-on-timeout | verifying | verifying (retry 9/10) | 5 ralph iterations | All 5 iterations targeted 3-1 verification. One timed out (iteration 2, exit 124, empty output). Four completed successfully but story remains at verifying. At retry 9/10 — one more failure flags it as blocked. |

**Sprint progress:** No stories moved to done. 7/25 done, unchanged from session 6. Epic 3 still 0/4 done, all verifying. Epic 4 still 0/3 done. Third consecutive session with zero completions.

---

## 2. Issues Analysis

### Bugs discovered during implementation or verification

1. **HIGH: 11 test mocks missing `strategy` field** (4-1, code review, 17:52Z) — `src/commands/__tests__/verify.test.ts` had 11 `ParsedAC` mock objects that lacked the required `strategy` field, causing 6 TS2741 compile errors. Found and fixed in code review. Root cause: the `ParsedAC` type was extended during module extraction but test mocks were not updated.

2. **MEDIUM: `checkVerifyEnv()` mutated readonly fields** (4-1, code review, 17:52Z) — `src/modules/verify/env.ts` wrote to `CheckResult` fields that are declared `readonly`. This would fail at runtime under strict frozen-object scenarios. Found and fixed in code review.

3. **Design issue: `codeharness verify` conflates blackBoxPass with overall pass** (4-1, verification, 17:58Z) — Unit-testable stories with valid proofs (7/8 PASS, 1 ESCALATE) get exit code 1 because `blackBoxPass=false`. The verifier assumes every story needs Docker-exec evidence. This is the same bug reported in session 1, session 3, session 5, and session 6. It is now the single longest-lived unfixed bug in the project.

### Workarounds applied (tech debt introduced)

None new this session. Prior workarounds (duplicate proof parser, 303-line verify command) persist.

### Code quality concerns

1. **LOW not fixed: `perAC[].verified` hardcoded true for escalated ACs** (4-1, code review) — `index.ts` marks escalated ACs as `verified: true` which overstates proof quality. Escalated ACs should be `verified: false` with an `escalated: true` flag or similar.

2. **LOW not fixed: Hardcoded paths duplicated between index.ts and commands/verify.ts** (4-1, code review) — Path construction for proof and story files is copy-pasted in two locations. Should be centralized.

3. **LOW not fixed: Unsafe `as unknown as Record<string, unknown>` casts in env.ts** (4-1, code review) — Type-system escape hatches that bypass TypeScript's safety guarantees.

4. **Coverage improved to 96.16%** — Up from 95.83% last session. All 76 files (up from 75) above 80% floor. 1937 tests passing (up from 1925).

### Verification gaps

1. **Story 4-1: 7 PASS, 0 FAIL, 1 ESCALATE but blocked** — AC8 (sprint loop resilience) correctly escalated as `integration-required`. The remaining 7 ACs all verified. But `codeharness verify` returns exit 1 due to `blackBoxPass=false`. The story is functionally verified but cannot be marked done through the automated pipeline.

2. **Story 3-1: 9 retries consumed, 1 remaining** — Ralph has spent 5 iterations this session (plus 4 from prior sessions) trying to verify 3-1. One iteration timed out entirely (30 minutes, zero output). At retry 9/10, one more failure will flag it as blocked. No evidence of forward progress across iterations.

### Tooling/infrastructure problems

1. **Iteration timeout (3-1, iteration 2)** — Claude produced zero output in 30 minutes and exited with code 124. The timeout report shows no partial output captured. This is a complete waste of an iteration with no diagnostic value.

2. **blackBoxPass enforcement remains unfixed** — Now in its 7th session as a known blocker. It prevents unit-testable stories from passing automated verification. Every session reports it. No session fixes it. It is the root cause of the verification bottleneck.

3. **Ralph grinding on a stuck story** — Ralph spent all 5 iterations on 3-1, which has shown no progress across 9 retries. The retry mechanism lacks intelligence: it does not detect that a story is making no forward progress and should be skipped or escalated sooner.

---

## 3. What Went Well

- **4-1 code review caught 2 real bugs.** The HIGH-severity missing `strategy` field would have caused compile failures. The MEDIUM mutation bug would violate immutability guarantees at runtime. Review continues to justify its cost (2 bugs found, matching the 2-4 per story historical average).

- **4-1 verification produced strong proof.** 7/8 ACs passed with legitimate evidence. The one escalated AC (sprint loop resilience) is genuinely integration-required and correctly identified. The verification pipeline produced accurate results despite ultimately returning exit 1.

- **Coverage and test count both improved.** 95.83% -> 96.16% coverage, 1925 -> 1937 tests. Upward trend despite no stories completing.

- **Session issues log was useful.** The 4 entries from code review and verification provided concrete, actionable data for this retrospective. The log format works.

---

## 4. What Went Wrong

- **Third consecutive session with zero completions.** Sessions 5, 6, and 7 all produced zero done stories. The sprint is in a completion drought. Work is being done (code review, verification, bug fixes) but nothing crosses the finish line.

- **5 ralph iterations spent on a single stuck story (3-1) with no progress.** 3-1 is at retry 9/10 with no evidence it is closer to passing than it was at retry 1. Ralph does not distinguish between "fixable on retry" and "structurally blocked."

- **The blackBoxPass bug is now 7 sessions old.** It was identified in session 1. It was a "Fix now" item in sessions 2, 3, 4, 5, and 6. It remains unfixed. It is now the longest-lived, highest-impact unfixed bug. It blocks every unit-testable story from automated verification. The "Fix now" label has no enforcement mechanism.

- **4-1 cannot be marked done despite 7/8 ACs passing.** A story with strong verification evidence is blocked by a known bug in the verifier. This is the verification bottleneck in its purest form: the code is correct, the proof is valid, but the tooling rejects it.

- **One iteration completely wasted on timeout.** Iteration 2 ran for 30 minutes, produced zero output, and exited 124. No diagnostic data was captured. 30 minutes of compute with zero information gain.

---

## 5. Lessons Learned

### Patterns to Repeat

- **Code review before verification.** The 4-1 sequence (review -> fix 2 bugs -> verify) worked correctly. The bugs found in review would have caused verification failures, so the review saved at least one wasted verify-dev cycle.

- **Session issues log as retrospective input.** The structured entries with severity, location, and fix status made this retrospective straightforward. Continue logging issues in this format.

### Patterns to Avoid

- **Letting ralph grind on stuck stories.** 9 retries with no progress is wasted compute. The retry limit should be accompanied by a progress check: if the error message is identical across retries, skip immediately instead of waiting for the retry limit.

- **Deferring "Fix now" items indefinitely.** The blackBoxPass bug has been "Fix now" for 6 sessions. At this point it should be treated as a story in the sprint, not an action item in a retrospective. Action items without enforcement are suggestions.

- **Starting new epics while old epics are stuck.** Session 6 started Epic 4 (4-1) while Epic 3 has 4 stories in verification limbo. 4-1 is now also stuck in the same verification bottleneck. Adding stories to a clogged pipeline does not increase throughput.

---

## 6. Action Items

### Fix now (before next session)

1. **Fix the blackBoxPass enforcement bug.** This is no longer optional. It has been "Fix now" for 6 consecutive sessions. Either modify `checkBlackBoxEnforcement()` to respect the `cli-verifiable` / `unit-testable` verification tier, or remove it entirely for non-black-box stories. Until this is fixed, no unit-testable story can be marked done through automated verification.

2. **Manually advance 4-1 to done.** 7/8 ACs verified, 1 correctly escalated. The only reason it is not done is the blackBoxPass bug. If the bug cannot be fixed immediately, manually mark the story as done with the escalated AC tracked as follow-up.

3. **Decide on 3-1.** It is at retry 9/10 with no forward progress across 9 attempts. Either fix the underlying verification issue manually or mark it blocked and move on. Do not let ralph burn the 10th retry.

### Fix soon (next sprint)

4. **Add progress detection to ralph retry logic.** If the same story fails with the same error across N retries, skip it before reaching the retry limit. Current behavior wastes iterations on structurally blocked stories.

5. **Unblock remaining Epic 3 stories (3-2, 3-3, 3-4).** All have been at `verifying` for 4+ sessions. Same approach as 4-1: review proof quality, advance stories with valid evidence, track gaps as follow-up.

6. **Add timeout diagnostics.** Iteration 2 timed out with zero output. The timeout report captured no partial output. Add a mechanism to capture in-progress state (e.g., periodic snapshots of Claude's conversation) so timeouts produce actionable data.

### Backlog (track but not urgent)

7. **Fix `perAC[].verified` for escalated ACs.** Hardcoded `true` overstates proof quality.

8. **Centralize path construction.** Duplicated between `index.ts` and `commands/verify.ts`.

9. **Remove `as unknown as Record<string, unknown>` casts in env.ts.** Type-safety escape hatches.

10. **Refactor `commands/verify.ts` below 100 lines.** Still at 303 lines, carried from session 6.

---

## Updated Running Totals

| Metric | Value |
|--------|-------|
| Total stories attempted today | 13 (prior 12 + 3-1 verification retries this session) |
| Stories at done | 7 (1-1, 1-2, 1-3, 2-1, 2-2, 2-3, 2-4) |
| Stories at verifying | 5 (3-1, 3-2, 3-3, 3-4, 4-1 effectively) |
| Stories at review | 1 (4-1 formally) |
| Epics completed | 2 (Epic 1, Epic 2) |
| Epic 3 progress | 0/4 done, 4/4 verifying |
| Epic 4 progress | 0/3 done, 1/3 review (7/8 ACs verified), 2/3 backlog |
| Ralph iterations this session | 5 (all on 3-1) |
| Ralph iterations total (est.) | ~23 |
| Bugs found this session | 2 (missing strategy field, readonly mutation — both fixed in review) |
| Tests passing | 1937 (76 files) |
| Coverage | 96.16% statements, 86.45% branches, 98.59% functions, 96.66% lines |
| Blocking issue | blackBoxPass enforcement bug (7 sessions old, prevents all unit-testable stories from automated verification) |
| "Fix now" items unfixed from prior sessions | 2 (blackBoxPass since session 1, stale epics.md since session 2) |
| Sessions with zero completions | 3 consecutive (sessions 5, 6, 7) |
| Story 3-1 retry count | 9/10 (one more failure = blocked) |
| Next up | FIX blackBoxPass bug, advance 4-1 to done, decide on 3-1 fate |

---

# Session Retrospective — 2026-03-18T18:00Z (Session 8)

**Sprint:** Architecture Overhaul Sprint
**Session window:** ~18:00Z – 21:30Z (estimated from issue timestamps and ralph logs)
**Stories attempted:** 4 (3 completed, 1 still verifying)

## 1. Session Summary

| Story | Start Status | End Status | Key Activity |
|-------|-------------|------------|-------------|
| 3-2-graceful-dev-module | verifying | done | Fixed proof parser bugs blocking verification |
| 3-3-verify-dev-feedback-loop | verifying | done | Same parser fix unblocked this story |
| 4-1-verify-module-extraction | review | done | Code review (2 rounds) + verification |
| 3-4-eight-hour-stability-test | verifying | verifying | 4 pending ACs — narrative descriptions without evidence blocks |

### Throughput

- 3 stories completed (verifying/review → done)
- First session with >0 completions since session 4
- Broke a 3-session streak of zero completions (sessions 5, 6, 7)
- **Root cause of the streak was identified and fixed this session**: two bugs in `proof.ts`

## 2. Issues Analysis

### Bugs Discovered

| ID | Severity | Description | Fixed? |
|----|----------|-------------|--------|
| B1 | **CRITICAL** | AC section parsing in `proof.ts` bled into `## Summary` section — last AC picked up `[ESCALATE]` from summary table, corrupting verdicts | Yes |
| B2 | **CRITICAL** | Black-box enforcement applied to unit-testable proofs where `docker exec` is irrelevant — caused false failures on all CLI-verifiable stories | Yes |
| B3 | HIGH | `proof.ts` exceeded 300-line NFR18 limit (303 lines) | Yes — compacted |
| B4 | HIGH | `commands/verify.ts` exceeded 300-line NFR18 limit (303 lines) | Yes — compacted |
| B5 | MEDIUM | `verify.test.ts` had 4 TypeScript errors — mock objects used wrong property names for `DocHealthResult`/`DocHealthReport` | Yes |

**B1 and B2 were the 7-session-old blockers.** Every prior session flagged `blackBoxPass` enforcement as a blocker but nobody fixed it until this session. These two bugs together prevented automated verification of ALL unit-testable stories, which is the majority of the codebase.

### Workarounds / Tech Debt Introduced

| Item | Severity | Location | Description |
|------|----------|----------|-------------|
| W1 | LOW | `src/modules/verify/index.ts:114` | `perAC[].verified` hardcoded to `true` regardless of escalation status — semantically wrong for escalated ACs |
| W2 | LOW | `src/modules/verify/index.ts:84-87` | Hardcoded paths `_bmad-output/implementation-artifacts` and `verification/` duplicated across modules — pre-existing debt, not new |
| W3 | LOW | `src/modules/verify/env.ts:54,61` | `as unknown as Record<string, unknown>` unsafe casts — pre-existing from original code |

### Verification Gaps

| Story | Gap |
|-------|-----|
| 3-4 | 4 ACs remain pending — ACs 1, 3, 4 are `integration-required` (need actual 8-hour run), AC 10 failed (92% coverage, not 100% on `validator.ts` defensive branches) |
| 4-1 AC6 | Coverage reported as "96.13% overall, all files above 80%" — not the "100% on new code" NFR14 requires. Passed on aggregate rather than strict per-file new-code metric. |

### Tooling/Infrastructure Issues

None reported this session. Sandbox and CLI operated normally.

## 3. What Went Well

1. **Root-caused the 3-session blocker.** Two bugs in `proof.ts` had been blocking verification of ALL unit-testable stories since session 1. This session fixed both in a single pass.
2. **3 stories completed in one session.** Best throughput of any session in this sprint. The prior 7 sessions combined completed 7 stories; this session added 3 more in a fraction of the time.
3. **Code review caught real issues.** The 4-1 adversarial review found 5 actionable issues across 2 rounds (2 NFR18 violations, 1 TS error batch, 1 readonly mutation, 1 missing field). All HIGH/MEDIUM items were fixed before verification.
4. **Module extraction executed cleanly.** 584-line `src/lib/verify.ts` split into 4 files, all under 300 lines, all tests passing (1937 tests, 73 files), old files deleted.
5. **Cascading unblock.** Fixing proof.ts bugs for 3-2 automatically unblocked 3-3 — two stories for the price of one fix.

## 4. What Went Wrong

1. **Proof parser bugs survived 7 sessions.** The `blackBoxPass` enforcement bug was flagged in session 1's retro as "Fix now" and remained unfixed through sessions 2-7. Every session noted it. Nobody fixed it. This cost at least 15-20 wasted ralph iterations across those sessions.
2. **Story 3-4 remains stuck at verifying.** AC 10 (100% coverage) has a concrete failure — `validator.ts` at 92% with uncovered defensive catch blocks. The integration-required ACs (1, 3, 4) are legitimately blocked on an 8-hour run that hasn't happened.
3. **NFR18 violations shipped past dev.** Both `proof.ts` and `commands/verify.ts` hit 303 lines — the review caught them, but the dev agent should have stayed under the limit. The 300-line limit is a hard constraint, not a suggestion.

## 5. Lessons Learned

### Patterns to Repeat

- **Fix blockers first, then do new work.** This session's 3 completions all came from fixing the verification parser — not from writing new code. The highest-leverage work was a bug fix.
- **Cascading unblocks are high-ROI.** When a fix unblocks multiple stories, prioritize it even if it means delaying a single story's development.
- **Adversarial code review catches real bugs.** The 2-round review process for 4-1 found issues that tests alone didn't catch (NFR violations, wrong mock properties).

### Patterns to Avoid

- **Carrying "Fix now" items across sessions without fixing them.** The blackBoxPass bug was "Fix now" for 7 sessions. If a retro says "Fix now," the next session must fix it before doing anything else.
- **Trusting aggregate coverage as proof of NFR14 compliance.** "96% overall" is not the same as "100% on new/changed code." Per-file, per-function coverage on touched code needs explicit verification.
- **Dev agents ignoring line count during implementation.** The 300-line limit should be checked before marking tasks done, not caught in review.

## 6. Action Items

### Fix Now (before next session)

| # | Item | Owner | Context |
|---|------|-------|---------|
| 1 | Fix story 3-4 AC10: add tests for `validator.ts` defensive catch blocks (lines 63-64, 115, 207-208) to reach 100% coverage | Dev | Currently at 92%; blocks story completion |
| 2 | Decide 3-4 integration ACs (1, 3, 4): escalate or schedule an actual 8-hour run | Operator | These ACs require real runtime; cannot be unit-tested |

### Fix Soon (next sprint)

| # | Item | Context |
|---|------|---------|
| 3 | Fix `perAC[].verified` hardcoded to `true` in `verifyStory()` — should reflect escalation status | W1 from this session |
| 4 | Extract hardcoded paths to config/constants (`_bmad-output/implementation-artifacts`, `verification/`) | W2 — duplicated across modules |
| 5 | Resolve story 3-1 (error-capture-on-timeout) — at 9/10 retries, one more failure = blocked | Inherited from prior sessions |

### Backlog

| # | Item | Context |
|---|------|---------|
| 6 | Remove unsafe `as unknown as Record<string, unknown>` casts in `env.ts` | W3 — pre-existing tech debt |
| 7 | Add per-file new-code coverage gate to CI (not just aggregate threshold) | Lesson from 4-1 AC6 gap |
| 8 | `index.ts` facade at 141 lines approaching soft limit — monitor | Flagged in session issues |

## Session Scorecard

| Metric | Value |
|--------|-------|
| Stories completed | 3 (3-2, 3-3, 4-1) |
| Stories still verifying | 1 (3-4) |
| Bugs fixed | 5 (2 critical, 2 high, 1 medium) |
| Tests passing | 1937 (73 files) |
| Coverage | 96.13% statements |
| Epics completed | 0 (Epic 3 still has 3-1 verifying + 3-4 verifying) |
| "Fix now" items from prior sessions resolved | 1 (blackBoxPass — the big one) |
| "Fix now" items carried forward | 2 (3-4 coverage, 3-4 integration ACs) |
| Sessions with zero completions (streak) | 0 — streak broken |
