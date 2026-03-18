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
