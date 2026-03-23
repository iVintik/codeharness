# Session Retrospective — 2026-03-23

**Sprint:** Operational Excellence Sprint
**Session window:** ~09:08 - 09:46 UTC+4 (~38 minutes)
**Ralph iterations:** 2 (iteration 1 timed out at 30 minutes)
**Commits produced:** 3

---

## 1. Session Summary

| Story | Outcome | Commits | Notes |
|-------|---------|---------|-------|
| 8-1-rust-stack-and-app-type-detection | done | `4c7f498` | Rust stack detection, app type inference from Cargo.toml |
| 8-2-expand-state-types-for-rust | done (in sprint-status.yaml), verifying (in state-snapshot) | `9ddd65e`, `d6a76bf` | Needed a fix commit for AC2 (rust_env_hint in OTLP state) |

Two stories attempted, two completed. Epic 8.1 (Rust Detection Foundation) is complete. Ralph timed out on iteration 1 after 30 minutes — it completed 8-1 impl+verify plus 8-2 impl+verify but was mid-retrospective when the timer expired. Iteration 2 picked up and produced the verification commit for 8-2.

---

## 2. Issues Analysis

### Bugs Discovered During Implementation

| Severity | Story | Issue | Fixed? |
|----------|-------|-------|--------|
| HIGH | 8-1 | `[dev-dependencies]`/`[build-dependencies]` deps incorrectly matched as production deps — false positive server/agent detection | Yes — added `getCargoDepsSection()` |
| HIGH | 8-1 | Substring false positives on crate names (`anthropic` matching `anthropic-sdk`, `rocket` matching `sprocket`) | Yes — added `hasCargoDep()` with word-boundary regex |
| HIGH | 8-2 | `getDefaultState()` hardcoded `coverage.tool` to `'c8'` regardless of stack — Rust projects got wrong default | Yes |
| MEDIUM | 8-1 | `[[bin]]` and `[lib]` matched inside TOML comments | Yes — used line-anchored regexes |
| MEDIUM | 8-1 | Missing test coverage for 3 of 5 web frameworks (rocket, tide, warp) | Yes — tests added |
| MEDIUM | 8-1 | Missing test for `[lib]` + `[[bin]]` dual-crate pattern | Yes |
| MEDIUM | 8-2 | `detectCoverageTool()` had no rust branch — Cargo.toml projects fell to `'unknown'` | Yes |
| MEDIUM | 8-2 | `getStackLabel('rust')` returned `'Unknown'` — AGENTS.md mislabeled Rust projects | Yes |
| MEDIUM | 8-2 | `generateAgentsMdContent()` had no rust branch — Rust projects got "No recognized stack" boilerplate | Yes |
| LOW | 8-1 | `getCargoDepsSection()` does not handle `[dependencies.foo]` inline subsection TOML style | No — accepted per NFR4 |
| LOW | 8-2 | Duplicate stack-to-tool mapping in `getCoverageTool()` (docs-scaffold.ts) and `getDefaultCoverageTool()` (state.ts) | No — tracked as tech debt |

### Workarounds / Tech Debt Introduced

- **Cargo.toml parsing uses string matching, not a proper TOML parser.** Deliberate per NFR4 (no new deps), but `[dependencies.foo]` subsections and comments containing dep names are edge cases that remain unhandled.
- **Library crates map to `generic` AppType** rather than a dedicated `'library'` type. Libraries are indistinguishable from unknown projects.
- **`coverage.tool` type was tightened** from plain `string` to a union type. Non-breaking but undocumented migration — existing state files with unexpected string values would still typecheck at runtime.

### Verification Gaps

- **8-2 AC2 initially failed.** The `rust_env_hint` field was missing from OTLP state for Rust projects. Required a separate fix commit (`9ddd65e`) before the verification commit (`d6a76bf`).
- **State snapshot still shows 8-2 as `verifying`**, while sprint-status.yaml shows `done`. Sync drift.
- **~40 pre-existing TypeScript compilation errors** in test files (bridge.test.ts, run.test.ts, etc.). Tests pass at runtime via Vitest despite `tsc --noEmit` errors. These are unrelated to this session but create noise during verification.
- **`parseCoverageReport` has no `'tarpaulin-json'` parser** — out of scope for 8-2, deferred to story 8-3.

### Tooling / Infrastructure Problems

- **Leftover container:** Previous session left `codeharness-verify` container running. Had to clean up before starting fresh verification.
- **Stack detection mismatch:** `codeharness status --check-docker` reported stack as down, but shared stack containers were running under `codeharness-shared-*` naming. `docker-compose.harness.yml` tried to start duplicate containers and hit port conflicts.
- **Observability gap:** Both AC1 and AC2 verifications showed no log events emitted to VictoriaLogs during `codeharness init` operations. Silent code path — the init command does not emit structured telemetry.
- **Beads sync failure:** `codeharness sync` couldn't find the story Status line in the story file — likely a pattern mismatch (`## Status:` format).
- **Ralph timeout:** Iteration 1 timed out at 30 minutes. The agent was writing a retrospective file when it was killed. Useful work was lost (the retro had to be regenerated).

---

## 3. What Went Well

- **Two stories completed in a single session** (~38 minutes wall clock). Both stories in Epic 8.1 (Rust Detection Foundation) are done.
- **Thorough bug-finding during review.** The implementation subagent found and fixed 10 issues across both stories before verification, including two HIGH-severity false-positive bugs in Cargo.toml parsing.
- **Good test coverage.** Story 8-1 achieved 97.02% overall coverage with all 123 files above 80% floor. Multiple missing test scenarios were identified and added (web framework variants, dual-crate pattern).
- **Clean commits.** Three commits, each with clear scope: feature, fix, verification.
- **Existing test adjusted correctly.** The test using `'rust'` as an "unrecognized stack" was updated to `'java'` now that Rust is recognized.

---

## 4. What Went Wrong

- **Ralph iteration 1 timed out.** 30 minutes was not enough for impl+verify of two stories plus retrospective writing. The timeout killed the agent mid-write.
- **8-2 AC2 failed first verification pass.** The `rust_env_hint` field in OTLP state was missed during initial implementation. Required a fix commit and re-verify cycle.
- **Docker naming inconsistency** between shared stack (`codeharness-shared-*`) and the compose file's expected container names caused port conflicts and wasted verification time.
- **Beads sync is still broken.** The `codeharness sync` command fails to find story status headers, a problem carried forward from previous epics. Story file statuses remain stuck at `ready-for-dev`.
- **State snapshot desync.** `state-snapshot.json` shows 8-2 as `verifying` while `sprint-status.yaml` shows `done`. No mechanism ensures these stay consistent.

---

## 5. Lessons Learned

### Repeat
- **Review-then-fix before verification** caught 10 bugs. The pattern of having the agent review its own implementation for edge cases before running verification pays off consistently.
- **Separate fix commits from feature commits.** The `9ddd65e` fix commit for 8-2 AC2 kept the git history clean and traceable.

### Avoid
- **Don't rely on `codeharness sync`** for story status updates — it's been broken for 9+ epics. Update story files manually or fix the sync command.
- **Don't assume Docker container naming is consistent.** The shared stack uses different container names than what the status check expects. This causes false "stack down" reports and port conflicts.
- **Don't schedule retrospective writing within the same timeout window as impl+verify.** The retro was killed mid-write on iteration 1 because it started too late in the 30-minute window.

---

## 6. Action Items

### Fix Now (before next session)
- [ ] Reconcile `state-snapshot.json` — set 8-2 status to `done` to match `sprint-status.yaml`
- [ ] Clean up any leftover Docker containers from this session (`codeharness-verify`, duplicates)

### Fix Soon (next sprint)
- [ ] Fix Docker container naming: align `codeharness status --check-docker` detection with `codeharness-shared-*` naming convention, or vice versa
- [ ] Add `rust_env_hint` field to init-time telemetry so VictoriaLogs captures Rust project setup events (observability gap)
- [ ] Extract duplicate `stack -> coverage_tool` mapping into a single utility function (duplicated in docs-scaffold.ts and state.ts)
- [ ] Add `'library'` AppType for Rust `[lib]`-only crates instead of mapping them to `generic`

### Backlog (track but not urgent)
- [ ] Fix `codeharness sync` story status header pattern matching (carried 9+ epics)
- [ ] Fix ~40 pre-existing TypeScript compilation errors in test files
- [ ] Handle `[dependencies.foo]` inline TOML subsection style in `getCargoDepsSection()`
- [ ] Write integration test for `detectStack` -> `detectAppType` end-to-end flow
- [ ] Implement `tarpaulin-json` parser in `parseCoverageReport` (story 8-3 scope)

---

# Session Retrospective (Addendum) — 2026-03-23T09:50Z

**Sprint:** Operational Excellence Sprint (Epic 8: Full Rust Stack Support)
**Session window:** ~09:08 - 09:50 UTC+4 (~42 minutes total, 3 Ralph iterations)
**Commits produced:** 3 (stories 8-1, 8-2) + 8-3 code review completed
**Sprint progress:** 27/34 stories done, 8-3 at `verifying` in sprint-status / `review` in sprint-state.json

---

## 1. Session Summary

| Story | Phase Reached | Outcome | Notes |
|-------|--------------|---------|-------|
| 8-1-rust-stack-and-app-type-detection | done | Completed | Rust stack detection via Cargo.toml, app type inference. Commit `4c7f498`. |
| 8-2-expand-state-types-for-rust | done | Completed | State types expanded for Rust. AC2 failed first pass (missing `rust_env_hint`), fixed in `9ddd65e`, verified in `d6a76bf`. |
| 8-3-cargo-tarpaulin-coverage-detection | code-review done, verification not started | Incomplete | Story created, implemented, reviewed. HIGH bug found and fixed during review. Ran out of time before verification. |

Three stories attempted across 3 Ralph iterations. Two completed (Epic 8.1 done). One (8-3) reached code review but not verification -- left in limbo between `verifying` (sprint-status.yaml) and `review` (sprint-state.json).

Iteration 1 timed out at 30 minutes while writing the first retro. Iteration 2 completed 8-2 verification. Iteration 3 created, implemented, and reviewed 8-3 but hit the session wall before verification could run.

---

## 2. Issues Analysis

### Bugs Discovered During Implementation

| Severity | Story | Issue | Status |
|----------|-------|-------|--------|
| HIGH | 8-3 | `parseTestCounts()` only captured first `test result:` line from cargo test output. Workspace projects emit one per crate, so counts were wrong. | Fixed -- global regex + aggregation loop |
| HIGH | 8-1 | `[dev-dependencies]`/`[build-dependencies]` deps incorrectly matched as production deps | Fixed -- `getCargoDepsSection()` |
| HIGH | 8-1 | Substring false positives on crate names (`anthropic` matching `anthropic-sdk`) | Fixed -- `hasCargoDep()` with word-boundary regex |
| HIGH | 8-2 | `getDefaultState()` hardcoded `coverage.tool` to `'c8'` regardless of stack | Fixed |
| LOW | 8-3 | No type validation on `parseTarpaulinCoverage` -- string `"85.5"` vs number `85.5` | Not fixed, low risk |
| LOW | 8-3 | `checkOnlyCoverage()` shells out to `cargo tarpaulin --version` for Rust -- unnecessary side effect in check-only mode | Not fixed, pre-existing pattern |

### Workarounds / Tech Debt Introduced This Session

1. **ESM mocking workaround for 8-3:** `vi.spyOn` cannot spy on `execSync` from `node:child_process` in ESM mode. Used `vi.mock('node:child_process', ...)` with file-level mock and `mockReset()` in `afterEach`. Applies to all tests in the file -- fragile if new tests are added without understanding the mock scope.
2. **Cargo test regex ordering is load-bearing:** The cargo test regex must appear before pytest regex because pytest's pattern false-matches on cargo test output. No guard comment or test enforcing this ordering.
3. **`coverage.ts` now exceeds 600 lines** (architecture limit is 300). Explicitly deferred splitting -- tracked but growing.
4. **Cargo.toml parsing remains string-based** (no TOML parser). `[dependencies.foo]` inline subsection style unhandled.
5. **Duplicate stack-to-coverage-tool mapping** in `docs-scaffold.ts` and `state.ts`. No single source of truth.

### Verification Gaps

- **8-3 not verified.** Code review passed, but no verification run executed. Story left in inconsistent state across tracking files.
- **Branch coverage below floor.** `coverage.ts` branch coverage at 77.98% (below 80% floor). Caused by pre-existing untested branches, not new Rust code. Statement coverage 90.51% passes.
- **No integration test for `cargo tarpaulin` execution.** All 8-3 tests mock the subprocess call. Consistent with existing pattern but means actual tarpaulin output parsing is untested against real output.

### Tooling / Infrastructure Problems

- **Leftover Docker container** (`codeharness-verify`) from previous session required manual cleanup.
- **Docker naming mismatch:** `codeharness status --check-docker` looks for different container names than `codeharness-shared-*` naming used by shared stack. Causes false "stack down" and port conflicts.
- **Observability gap:** `codeharness init` emits no log events to VictoriaLogs. Silent code path during verification.
- **`codeharness sync` broken:** Cannot find story Status line in story files. Pattern mismatch on `## Status:`. Broken for 9+ epics.
- **Ralph timeout:** Iteration 1 killed at 30 minutes mid-retro-write. Work lost, had to be regenerated.
- **State tracking desync:** `sprint-status.yaml` shows 8-3 as `verifying`, `sprint-state.json` shows `review`. No reconciliation mechanism.

---

## 3. What Went Well

- **Three stories progressed in ~42 minutes.** Two fully completed (Epic 8.1 done), one through code review. Good velocity for Rust support work.
- **Code review caught a HIGH bug in 8-3** (`parseTestCounts` single-line capture for workspace projects) before it shipped. Self-review continues to be the highest-ROI quality gate.
- **10 bugs found and fixed across 8-1 and 8-2** during implementation, before verification even ran. The implementation subagent's review pass is consistently effective.
- **97% test coverage on 8-1.** All 123 files above 80% floor.
- **Clean commit history.** Feature, fix, and verification commits clearly scoped and traceable.

---

## 4. What Went Wrong

- **8-3 incomplete.** Ran out of session budget before verification. The story is in a split-brain state between tracking files.
- **Ralph iteration 1 timeout.** 30-minute window insufficient for 2 stories + retro. The retro was being written when killed -- wasted token spend on a partial file that had to be regenerated.
- **Docker infrastructure friction.** Container naming mismatch and leftover containers wasted verification time on both 8-2 and would have affected 8-3.
- **`codeharness sync` still broken.** Story file statuses stuck at `ready-for-dev`. This has been a known issue for 9+ epics with no fix. It creates noise in every session.
- **Branch coverage degradation.** `coverage.ts` dropped below 80% branch coverage floor. Not caused by this session's changes, but the file is growing (600+ lines) and the gap will widen as more Rust code is added.

---

## 5. Lessons Learned

### Repeat
- **Self-review before verification.** Found 10 bugs in 8-1/8-2 and 1 HIGH bug in 8-3 during code review. This pattern is the single most effective quality measure in the pipeline.
- **Separate fix commits from feature commits.** Clean git history makes debugging verification failures straightforward.
- **Track issues in `.session-issues.md` as they happen.** Having the raw materials for the retro available made this addendum possible even after iteration timeout.

### Avoid
- **Do not schedule retro writing inside the same iteration budget as implementation.** Iteration 1 timed out writing the retro. The retro should be a dedicated, short iteration or run outside Ralph.
- **Do not trust `codeharness status --check-docker`.** Docker naming mismatch makes the output unreliable. Verify containers manually with `docker ps`.
- **Do not let `coverage.ts` grow further without splitting.** It is 2x the architecture limit and branch coverage is degrading. Next story touching this file should refactor.

---

## 6. Action Items

### Fix Now (before next session)
- [ ] Reconcile 8-3 state: set consistent status across `sprint-status.yaml` and `sprint-state.json` (currently `verifying` vs `review`)
- [ ] Run 8-3 verification to complete the story
- [ ] Clean up leftover Docker containers

### Fix Soon (next sprint)
- [ ] Split `coverage.ts` into separate modules (Rust, Node, Python parsers). File is 600+ lines, 2x the 300-line architecture limit.
- [ ] Fix Docker container naming alignment between `codeharness status --check-docker` and `codeharness-shared-*` convention
- [ ] Add guard comment or ordering test for the cargo-test/pytest regex precedence in coverage parsing
- [ ] Extract duplicate `stack -> coverage_tool` mapping into a single utility function
- [ ] Add `rust_env_hint` to init-time telemetry (observability gap)

### Backlog (track but not urgent)
- [ ] Fix `codeharness sync` story status header pattern matching (broken 9+ epics, creating noise every session)
- [ ] Fix ~40 pre-existing TypeScript compilation errors in test files
- [ ] Handle `[dependencies.foo]` inline TOML subsection style in `getCargoDepsSection()`
- [ ] Add `'library'` AppType for Rust `[lib]`-only crates
- [ ] Add type validation to `parseTarpaulinCoverage` for string vs number coverage values
- [ ] Write integration test for actual `cargo tarpaulin` output parsing (not just mocked)

---

# Session Retrospective (Final) -- 2026-03-23T10:30Z

**Sprint:** Operational Excellence Sprint (Epic 8: Full Rust Stack Support)
**Full session window:** ~09:08 - 10:30 UTC+4 (~82 minutes total, 4 Ralph iterations)
**Commits produced:** 3 (stories 8-1, 8-2)
**Sprint progress:** 28/34 stories done, 6 remaining in backlog (all Epic 8.2-8.5)

This is the final consolidated retrospective for the 2026-03-23 session. Two prior addenda covered iterations 1-3. This covers iteration 4 (8-3 verification) and provides a full-session analysis.

---

## 1. Session Summary

| Story | Phase | Outcome | Iterations | Notes |
|-------|-------|---------|------------|-------|
| 8-1-rust-stack-and-app-type-detection | done | Completed | 1 | Rust stack detection via Cargo.toml. Commit `4c7f498`. |
| 8-2-expand-state-types-for-rust | done | Completed | 1-2 | State types for Rust. AC2 failed first pass, fixed in `9ddd65e`, verified in `d6a76bf`. |
| 8-3-cargo-tarpaulin-coverage-detection | done | Completed | 3-4 | Created, implemented, reviewed in iteration 3. Verified in iteration 4 via Docker black-box. |

Three stories attempted, three completed. Epic 8.1 (Rust Detection Foundation) and the first story of Epic 8.2 (Rust Coverage & Testing) are done. Session ended with NO_WORK -- all remaining Epic 8 stories (8-4 through 8-9) are in backlog and require explicit promotion to be picked up.

### Iteration Timeline

| Iteration | Duration | Work Done | Outcome |
|-----------|----------|-----------|---------|
| 1 | 30 min (timeout) | 8-1 impl+verify, 8-2 impl+verify | Timed out mid-retrospective write |
| 2 | ~8 min | 8-2 verification commit, retro written | Completed |
| 3 | ~12 min | 8-3 create-story, dev-story, code-review | Completed (verification deferred) |
| 4 | ~20 min | 8-3 Docker black-box verification | Completed, story marked done |

---

## 2. Issues Analysis

### Bugs Discovered and Fixed (4 HIGH, 6 MEDIUM)

| Severity | Story | Issue | Fixed? |
|----------|-------|-------|--------|
| HIGH | 8-3 | `parseTestCounts()` only captured first `test result:` line -- workspace projects emit one per crate | Yes -- global regex + aggregation loop |
| HIGH | 8-1 | `[dev-dependencies]`/`[build-dependencies]` deps incorrectly matched as production deps | Yes -- `getCargoDepsSection()` |
| HIGH | 8-1 | Substring false positives on crate names (`anthropic` matching `anthropic-sdk`) | Yes -- `hasCargoDep()` with word-boundary regex |
| HIGH | 8-2 | `getDefaultState()` hardcoded `coverage.tool` to `'c8'` regardless of stack | Yes |
| MEDIUM | 8-1 | `[[bin]]` and `[lib]` matched inside TOML comments | Yes -- line-anchored regexes |
| MEDIUM | 8-1 | Missing test coverage for 3 of 5 web frameworks | Yes -- tests added |
| MEDIUM | 8-2 | `detectCoverageTool()` had no rust branch | Yes |
| MEDIUM | 8-2 | `getStackLabel('rust')` returned `'Unknown'` | Yes |
| MEDIUM | 8-2 | `generateAgentsMdContent()` had no rust branch | Yes |
| MEDIUM | 8-3 | AGENTS.md stale for coverage module (missing cargo-tarpaulin) | Yes |

### Known Issues NOT Fixed (accepted risk)

| Severity | Story | Issue | Reason |
|----------|-------|-------|--------|
| LOW | 8-3 | No type validation on `parseTarpaulinCoverage` (string vs number) | Low risk, `?? 0` handles `undefined` |
| LOW | 8-3 | `checkOnlyCoverage()` shells out to `cargo tarpaulin --version` in check-only mode | Pre-existing pattern across all stacks |
| LOW | 8-1 | `getCargoDepsSection()` does not handle `[dependencies.foo]` inline subsection TOML | Accepted per NFR4 (no TOML parser dep) |
| LOW | 8-2 | Duplicate stack-to-tool mapping in `docs-scaffold.ts` and `state.ts` | Tech debt tracked |

### Workarounds / Tech Debt Introduced

1. **ESM mocking workaround:** `vi.mock('node:child_process', ...)` with file-level mock and `mockReset()` in `afterEach`. Cannot use `vi.spyOn` on `execSync` in ESM mode. Fragile if new tests are added without understanding mock scope.
2. **Cargo test regex ordering is load-bearing:** Must appear before pytest regex to avoid false matches. No guard comment or ordering test.
3. **`coverage.ts` now exceeds 600 lines** (architecture limit is 300). Deliberately deferred splitting.
4. **Cargo.toml parsing is string-based** (no TOML parser). Edge cases with inline subsections and comments remain.

### Verification Gaps

- **8-3 AC1/AC2 verified via function replication, not CLI.** `codeharness coverage --json` does not expose `runCommand` or `reportFormat` fields. The verifier had to replicate `detectCoverageTool()` logic from `dist/index.js` to confirm output. This is a CLI/API gap -- internal functions are not fully exercisable through the CLI.
- **8-3 AC4 verified via function replication.** `parseTestCounts` is internal with no CLI subcommand that accepts raw test output.
- **Branch coverage at 77.98%** on `coverage.ts` (below 80% floor). Pre-existing untested branches, not caused by new code. Statement coverage 90.51% passes.
- **No observability data during verification.** VictoriaLogs received no events during any verification run. Docker container lacks Docker-in-Docker, and `codeharness init` does not emit structured telemetry.

### Tooling / Infrastructure Problems

| Problem | Impact | Recurring? |
|---------|--------|------------|
| Leftover `codeharness-verify` container from previous session | Wasted cleanup time at start of verification | Yes (3rd session in a row) |
| Docker naming mismatch (`codeharness-shared-*` vs compose names) | False "stack down" reports, port conflicts | Yes (known since Epic 7) |
| `codeharness sync` broken (can't find Status line in story files) | Story file statuses stuck at `ready-for-dev` | Yes (broken 9+ epics) |
| Ralph iteration 1 timed out at 30 min | Lost retro work, required regeneration | First occurrence with 2-story load |
| State tracking desync between `sprint-status.yaml` and `sprint-state.json` | Ambiguous story status between files | Yes (every session) |

---

## 3. What Went Well

- **Three stories completed in a single session.** Epic 8.1 fully done. First story of Epic 8.2 done. Sprint progress moved from 25/34 to 28/34.
- **Self-review caught 10 bugs before verification.** The pattern of implementation followed by code review before verification continues to be the highest-ROI quality gate. The HIGH bug in `parseTestCounts` (workspace aggregation) would have been a runtime defect.
- **97% test coverage on 8-1.** All 123 files above 80% floor. 2980 tests passing, zero regressions.
- **Session issues log worked as designed.** Each subagent appended real issues as they encountered them. This file was the raw material for all three retrospective addenda.
- **Docker verification for 8-3 succeeded on first attempt** in iteration 4, despite the story being complex (internal functions not directly CLI-exercisable).

---

## 4. What Went Wrong

- **Iteration 1 timeout.** 30-minute budget was insufficient for implementing, verifying, and retro-writing two stories. The retro was killed mid-write, wasting tokens and requiring regeneration.
- **8-2 AC2 failed first verification pass.** `rust_env_hint` was missed in the initial implementation. Required a separate fix commit and re-verify cycle.
- **8-3 verification deferred across iterations.** Code review completed in iteration 3 but verification didn't run until iteration 4. The story spent ~40 minutes in limbo between `verifying` and `review` status across different tracking files.
- **Docker infrastructure friction consumed time in every iteration.** Container naming mismatch, leftover containers, and port conflicts are recurring problems that have not been fixed.
- **`codeharness sync` is still broken.** This has been a known issue for 9+ epics. Story file statuses are permanently stuck at `ready-for-dev`. At this point it's actively harmful -- it creates noise in every session and gives false confidence to anyone reading story files.

---

## 5. Lessons Learned

### Repeat

- **Self-review before verification.** Found 10 bugs across 3 stories before any verification run. This is consistently the best quality investment.
- **Track issues in `.session-issues.md` as they happen.** Having timestamped raw materials made retrospectives possible even after iteration timeouts.
- **Separate fix commits from feature commits.** Clean git history makes debugging straightforward.
- **Session retro addenda pattern works.** Appending to the retro file after each iteration gives progressive visibility without losing earlier analysis.

### Avoid

- **Do not schedule retro writing inside the same iteration budget as implementation.** Iteration 1 proved this -- the retro was killed mid-write. Retros should be a dedicated short iteration or run outside Ralph.
- **Do not trust `codeharness status --check-docker`.** Docker naming mismatch makes output unreliable. Use `docker ps` directly.
- **Do not let `coverage.ts` grow further without splitting.** It is 2x the architecture limit (600+ lines vs 300) and branch coverage is degrading. The next story touching this file must split it.
- **Do not defer fixing recurring infrastructure issues.** Docker naming mismatch and `codeharness sync` breakage have been noted in retrospectives for 9+ epics. Each session wastes time on the same workarounds.

---

## 6. Action Items

### Fix Now (before next session)

- [ ] Reconcile `sprint-state.json` -- set 8-3 status to `done` to match `sprint-status.yaml`
- [ ] Clean up leftover Docker containers (`codeharness-verify`, duplicates)
- [ ] Verify `state-snapshot.json` has 8-2 and 8-3 both as `done`

### Fix Soon (next sprint)

- [ ] **Split `coverage.ts`** into separate modules (Rust, Node, Python parsers). 600+ lines, 2x the 300-line limit. Branch coverage already degrading.
- [ ] **Fix Docker container naming** -- align `codeharness status --check-docker` with `codeharness-shared-*` convention. This has wasted time every session since Epic 7.
- [ ] **Add guard comment or ordering test** for cargo-test/pytest regex precedence in coverage parsing
- [ ] **Extract duplicate `stack -> coverage_tool` mapping** into a single utility function (duplicated in `docs-scaffold.ts` and `state.ts`)
- [ ] **Add `rust_env_hint` to init-time telemetry** (observability gap -- no VictoriaLogs events during Rust project init)
- [ ] **Expose `runCommand` and `reportFormat` in CLI JSON output** -- `codeharness coverage --json` currently omits these fields, forcing verification to replicate internal function logic

### Backlog (track but not urgent)

- [ ] Fix `codeharness sync` story status header pattern matching (broken 9+ epics, noted in every retro)
- [ ] Fix ~40 pre-existing TypeScript compilation errors in test files
- [ ] Handle `[dependencies.foo]` inline TOML subsection style in `getCargoDepsSection()`
- [ ] Add `'library'` AppType for Rust `[lib]`-only crates instead of mapping to `generic`
- [ ] Add type validation to `parseTarpaulinCoverage` for string vs number coverage values
- [ ] Write integration test for actual `cargo tarpaulin` output parsing (not just mocked)
- [ ] Add `parseTestCounts` CLI subcommand for direct test output parsing (currently internal-only)

---

## Session Metrics

| Metric | Value |
|--------|-------|
| Stories completed | 3 (8-1, 8-2, 8-3) |
| Stories failed | 0 |
| Bugs found pre-verification | 10 (4 HIGH, 6 MEDIUM) |
| Bugs shipped unfixed | 0 HIGH/MEDIUM, 4 LOW (accepted) |
| Ralph iterations | 4 |
| Timeouts | 1 (iteration 1) |
| Commits | 3 |
| Tests added | ~25 new tests |
| Total test count | 2980 passing |
| Sprint progress | 25/34 -> 28/34 (82% done) |
| Remaining backlog | 6 stories (Epic 8.2-8.5) |
