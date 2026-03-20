# Session Retrospective — 2026-03-20

**Sprint:** Operational Excellence Sprint
**Session window:** ~05:40Z (2026-03-20), approx 2–3 hours (verification + bug fixing)
**Stories attempted:** 1
**Stories completed:** 1 (2-1-verification-observability-check → done)

---

## 1. Session Summary

| Story | Start Status | End Status | Phases Completed | Notes |
|-------|-------------|------------|-----------------|-------|
| 2-1-verification-observability-check | verifying | done | create-story (3/19), dev (3/19), code-review (3/19), verify (3/20) | Full pipeline. Dev added 35 tests across 3 files (2510 total). Code review found 3 bugs (1 HIGH, 2 MEDIUM) — all fixed. Verification encountered proof parsing issues that required two attempts. |

**Net progress:** 1 story completed. Epic 2 now has 1/3 stories done. Epics 0, 0.5, and 1 remain fully done. Epics 2–5 remain in backlog.

---

## 2. Issues Analysis

### Bugs Discovered During Implementation or Review

1. **HIGH — `saveRuntimeCoverage` was dead code (code-review):** The function was implemented and tested but never called from any production code path. Runtime coverage would never persist to sprint-state.json. Fixed during code review.
2. **MEDIUM — `verify.ts` hardcoded 0 observability gaps (code-review):** The verify command always reported 0 gaps regardless of proof content. The new `VerifyResult` fields were added but never populated from parsed data. Fixed.
3. **MEDIUM — `verifier-session.ts` hardcoded 0 gaps (code-review):** Same pattern as verify.ts — new fields present but always zero. Fixed.

### Workarounds Applied (Tech Debt Introduced)

1. **Binary `logEventCount` (LOW, not fixed):** `logEventCount` is always 0 or 1 based on gap tag presence, not actual log event count. The parser only detects the `[OBSERVABILITY GAP]` tag, not the actual number of log events. Misleading field name.
2. **Duplicated coverage math (LOW, not fixed):** `verify/index.ts` duplicates `computeRuntimeCoverage` logic inline rather than calling the function. Two places to maintain.
3. **Silent catch blocks (LOW, not fixed):** Gap parsing errors are silently swallowed in 3 locations. Failures produce no diagnostics.
4. **Hardcoded CWD (architecture):** `verifyStory()` calls `saveRuntimeCoverage` with `'.'` as projectDir, assuming CWD is always the project root. Fragile assumption.

### Code Quality Concerns

1. **Triple gap parsing:** Three separate locations independently parse `[OBSERVABILITY GAP]` tags from proof text. Should be centralized into a single call.
2. **Tag coupling risk:** The `[OBSERVABILITY GAP]` format is a convention between the prompt template (tells Claude to emit it) and the parser regex (detects it). If the verifier LLM doesn't emit the exact format, the parser silently misses gaps. No fallback or fuzzy matching.

### Verification Gaps

1. **AC1 template verification limitation:** verify-prompt.ts compiles into the Claude Code plugin (skills/), not the npm CLI binary. Cannot directly inspect the template from inside a Docker container. Verified via the template-to-parser contract (constants and function exports) rather than end-to-end template inspection.
2. **VictoriaLogs always returns zero events:** The codeharness CLI does not emit OpenTelemetry data when running in its own Docker container. All observability gap checks return empty. This is expected (the tool instruments other projects, not itself), but it means the runtime observability check was never tested against a project that actually produces telemetry.

### Tooling/Infrastructure Problems

1. **Proof markdown parsing bug (verification):** The verifier embedded a heredoc containing nested code fences inside a bash code block. Closing backticks broke out of the outer fence, causing AC headings from test output to appear as real AC sections. The proof parser counted 8 ACs instead of 4. Required summarizing the heredoc content and re-running verification.
2. **Evidence adjacency requirement (verification):** The proof parser requires `bash` and `output` code blocks to be adjacent with no text between them. AC3 had explanatory text between blocks, causing it to be marked as pending. Required removing the intervening text.

### Workflow Compliance

1. **Epic 0.5 created without authorization (create-story):** The create-story agent added a new Epic 0.5 to sprint-status.yaml despite instructions not to modify it. The epic was already in the status file by the time this session ran, but the issue was logged as a process violation.
2. **Naming confusion:** Epic 2 retrospective references a different Epic 2 from a previous sprint. Numbering collision between sprints.

---

## 3. What Went Well

- **Story 2-1 completed end-to-end** — Went through all four phases (create-story, dev, code-review, verify) and reached done status. The full pipeline worked.
- **Code review earned its keep again** — Found that `saveRuntimeCoverage` was dead code (never called from production). Without review, this bug would have shipped and runtime coverage would silently never persist.
- **35 new tests, 2510 total passing** — Comprehensive unit test coverage for the new runtime coverage and gap parsing modules. All filesystem operations properly mocked.
- **Clean architecture** — Runtime coverage is properly separated from static coverage per architecture Decision 2. New module (`runtime-coverage.ts`) follows existing patterns (atomic write, Result type, barrel exports).
- **Session issues log continued to provide value** — Four distinct subagent phases each logged problems as they occurred. Every issue in this retrospective traces back to a session log entry.

---

## 4. What Went Wrong

- **Proof parser is fragile** — Two separate parsing bugs hit during verification (nested code fences and adjacency requirement). Both required manual proof editing and re-runs. The parser makes assumptions about markdown structure that are easily violated by LLM-generated content.
- **Dead code shipped from dev** — `saveRuntimeCoverage` was implemented, tested, exported, but never wired into any call site. Dev phase checked all task boxes without catching this. The task list said "implement" but didn't explicitly say "wire into callers." Code review caught it, but the gap in dev-phase detection is concerning.
- **Three hardcoded-zero bugs in one story** — verify.ts and verifier-session.ts both hardcoded 0 for the new fields. This is a pattern: when new fields are added to a shared type, existing construction sites get `0` or `''` as placeholders and nobody goes back to wire in real values. Code review caught all three, but this pattern will repeat.
- **Cannot verify observability against real telemetry** — The codeharness project doesn't produce its own telemetry, so the runtime observability check was verified against the contract (parser + types + functions) but never against a live project with actual log events. The feature is structurally complete but untested in the scenario it was designed for.

---

## 5. Lessons Learned

### Patterns to Repeat

- **Code review after every dev phase, no exceptions.** Previous session (3/19) skipped review on 6-1 due to time pressure and found 51 regressions later. This session ran review and caught 3 bugs including dead code. The pattern holds: review pays for itself.
- **Session issues log as retrospective input.** Four structured entries across four phases gave complete traceability. Keep requiring every subagent to log issues.

### Patterns to Avoid

- **Adding fields to shared types without grepping for all construction sites.** The `VerifyResult` type was extended with 2 new fields. Five files needed updating. Dev updated the obvious ones but hardcoded zeros in 2 others. Future stories should include a task: "grep for all `VerifyResult` constructions and update each with real values."
- **Implementing a function without wiring it into callers.** The task list had "implement saveRuntimeCoverage" and "wire gap parsing into verify orchestrator" as separate tasks, but the wiring task didn't mention calling saveRuntimeCoverage. Task decomposition needs to explicitly trace data flow from creation to consumption.
- **Relying on LLM-generated markdown structure in parsers.** The proof parser assumes specific markdown formatting that Claude's output doesn't always match. Either make the parser more resilient or constrain the output format more tightly (e.g., structured JSON proofs instead of markdown).

---

## 6. Action Items

### Fix Now (Before Next Session)

- Nothing blocking. Story 2-1 is done and the 3 bugs found in code review were fixed before verification.

### Fix Soon (Next Sprint)

1. **Centralize gap parsing** — Refactor the 3 independent `[OBSERVABILITY GAP]` parsing locations into a single function call. Tracked as tech debt from code review.
2. **Fix binary `logEventCount`** — Either rename to `hasLogEvents: boolean` or implement actual event counting. Current name is misleading.
3. **Add silent-catch diagnostics** — The 3 silent catch blocks in gap parsing should at least log warnings. Silent failures in observability code are ironic.
4. **Harden proof parser** — The adjacency requirement and nested-fence vulnerability need fixes. The parser should handle common markdown variations from LLM output without manual proof editing.

### Backlog (Track but Not Urgent)

1. **Deduplicate coverage math** — `verify/index.ts` inline coverage logic duplicates `computeRuntimeCoverage`. Extract to single call site.
2. **Remove hardcoded CWD assumption** — `verifyStory()` passes `'.'` to `saveRuntimeCoverage`. Should pass explicit project directory.
3. **Test against real telemetry** — When a project with actual OpenTelemetry instrumentation is available, verify the runtime observability check end-to-end with live log events.
4. **Epic numbering collision** — Previous sprint's Epic 2 and current sprint's Epic 2 share the same number. Consider prefixed naming (e.g., `overhaul-2` vs `opex-2`) to avoid confusion in retrospective references.
5. **Type escape hatches** — The 4 `as unknown as Record<string, unknown>` casts from 6-1 (previous session) are still in codebase. Tracked from 3/19 retro but not yet addressed.

---

# Session 2 Retrospective — 2026-03-20T10:00Z

**Sprint:** Operational Excellence Sprint
**Session window:** ~05:50Z – ~06:30Z (2026-03-20), approx 40 minutes
**Stories attempted:** 1
**Stories completed:** 0 (2-2-observability-hook-enforcement still in review)

---

## 1. Session Summary

| Story | Start Status | End Status | Phases Completed | Notes |
|-------|-------------|------------|-----------------|-------|
| 2-2-observability-hook-enforcement | backlog | review | create-story, dev, code-review, verify (partial) | Full pipeline attempted. Dev added pre-commit gate and coverage extraction. Code review found 3 HIGH bugs (all fixed). Verification failed AC 3 — `gapSummary` hardcoded as empty array. Story returned to dev for AC 3 fix. Currently in review status. |

**Net progress:** Story 2-2 advanced through 4 phases but did not reach done. AC 1 and AC 2 pass; AC 3 fails. Epic 2 remains at 1/3 stories done.

---

## 2. Issues Analysis

### Bugs Discovered During Implementation or Review

1. **HIGH — `saveCoverageResult` dropped `runtime` field (code-review):** Every `codeharness analyze` run wiped runtime coverage data from sprint-state.json. The save function overwrote the entire coverage object without preserving existing runtime data. Fixed during code review.
2. **HIGH — No NaN validation on `--min-static`/`--min-runtime` (code-review):** `parseInt` with non-numeric input silently set NaN as the target. The gate always failed with no useful error message. Fixed during code review.
3. **HIGH — `timeout` command not on stock macOS (code-review):** The observability gate check used the `timeout` command, which is a GNU coreutils utility not available on macOS by default. The gate silently never ran on Mac. Fixed by removing `timeout`.
4. **AC 3 FAIL — `gapSummary` hardcoded as empty array (verify):** `checkObservabilityCoverageGate()` never reads gap data from sprint-state.json or calls the analyzer. The formatting code for gap display exists but receives no data. The block message cannot show specific gaps because the data pipeline is not wired.

### Workarounds Applied (Tech Debt Introduced)

1. **Gap details deferred to CLI command (create-story, dev):** AC 3 requires the block message to show specific files/functions missing observability. Running Semgrep in a pre-commit hook (~10s) violates the 500ms hook NFR. The workaround: use cached coverage data and direct users to run `codeharness analyze`. But `codeharness analyze` does not exist as a CLI command yet.
2. **`extractCoverageState` extended as a bug fix (dev):** The existing function from Story 2.1 didn't parse the `runtime` section or `runtimeTarget` from sprint-state.json, even though Story 2.1 writes that data. This was silently broken — dev fixed it as part of 2-2 work. Technically a Story 2.1 bug fix shipped with 2-2.
3. **Grep-based JSON parsing in pre-commit-gate.sh (code-review, not fixed):** The shell script parses JSON using grep. Fragile, pre-existing pattern. Not addressed this session.

### Code Quality Concerns

1. **AGENTS.md files not updated (code-review, fixed):** coverage-gate.ts and observability-gate.ts were missing from module documentation files. Fixed during review.
2. **Unreachable DEFAULT_STATIC_TARGET fallback (code-review, not fixed):** Dead defensive code that can never execute. Low priority.

### Verification Gaps

1. **AC 3 failed verification:** The gate function formats gap summaries but the data source is never populated. The gap summary is always empty. This is not a display formatting bug — the data pipeline from analyzer to gate is missing.
2. **No `codeharness analyze` CLI command:** The block message tells users to run `codeharness analyze` for details, but this command does not exist. Users hitting the gate would see a reference to a non-existent command.
3. **VictoriaLogs returned no events:** Same as Session 1 — the CLI doesn't emit OTEL data. Expected behavior but means runtime observability checks are untested against real telemetry.

### Tooling/Infrastructure Problems

1. **Pre-existing BATS failures:** 4 tests in `tests/integration/hooks.bats` (tests 28-31) fail on master due to `hooks.json` format mismatch. Not caused by this story, but pre-existing test rot that could mask new regressions.
2. **sprint-status.yaml not updated by agents:** Both create-story and dev agents failed to update sprint-status.yaml. The harness-run coordinator handled it manually. Recurring issue from Session 1.

### Design Decisions and Risks

1. **AC 3 ambiguity resolved with performance tradeoff:** Epic spec says block message should include specific files/functions missing logging. Story resolved the tension with the 500ms NFR by using cached data. But the cache is never populated, making the resolution hollow.
2. **`coverage.ts` line limit risk:** Existing file is 269 lines; adding the gate function (~40 lines) approaches the 300-line NFR9 limit. May need extraction in a follow-up.

---

## 3. What Went Well

- **Code review caught 3 HIGH-severity bugs** — All three would have caused production failures: silent data loss (runtime field dropped), silent gate failure (NaN targets), and platform incompatibility (macOS `timeout`). Review continues to pay for itself.
- **AC 1 and AC 2 passed verification** — The basic gate behavior (block commits when coverage below threshold, allow when above) works correctly. The core hook enforcement mechanism is functional.
- **Bug fix for Story 2.1 included** — `extractCoverageState` not parsing runtime data was a latent bug from the previous story. Caught and fixed during 2-2 dev work rather than discovering it later.
- **Fast session throughput** — Four phases (create-story, dev, code-review, verify) completed in approximately 40 minutes.

---

## 4. What Went Wrong

- **AC 3 data pipeline not wired** — The dev phase implemented the formatting code for gap summaries but never connected it to a data source. `gapSummary` is always an empty array. This is the same pattern from Session 1 (saveRuntimeCoverage was dead code) — implementing the consumer without wiring the producer.
- **Non-existent CLI command referenced** — The block message tells users to run `codeharness analyze`, but this command doesn't exist. Dev created user-facing text referencing functionality that hasn't been built. No one caught this until verification.
- **Pre-existing test rot ignored** — 4 BATS tests have been failing on master. They were noted but not fixed. These failures erode confidence in the test suite and could mask regressions from this story's hook changes.
- **Story returned to dev** — Verification failed, requiring another dev iteration. The create-story phase identified the AC 3 ambiguity and the missing `codeharness analyze` command as risks, but dev proceeded without resolving them.

---

## 5. Lessons Learned

### Patterns to Repeat

- **Code review before verification, always.** Three HIGH bugs were caught and fixed before verification ran. Without review, verification would have failed on data loss and NaN bugs in addition to the AC 3 gap.
- **Session issues log entries from every phase.** Create-story flagged the AC 3 ambiguity and the missing CLI command. Dev flagged pre-existing BATS failures. Code review flagged platform compatibility. Every phase contributed distinct findings.

### Patterns to Avoid

- **Implementing display code without a data source.** This is the second session in a row where formatting/display code was built but never connected to actual data. The dev task list should explicitly include "verify data flows end-to-end from source to display" as a checklist item.
- **Referencing non-existent commands in user-facing messages.** Block messages and error text should only reference commands that exist. If a command is planned but not yet built, use generic guidance ("check observability coverage") instead of specific command references.
- **Proceeding past known risks without mitigation.** Create-story identified "No `codeharness analyze` CLI command exists yet" as a risk. Dev proceeded anyway and embedded references to it. The risk should have been resolved (build the command, adjust the message, or explicitly defer with a stub) before moving to implementation.

---

## 6. Action Items

### Fix Now (Before Next Session)

1. **Wire `gapSummary` data source in `checkObservabilityCoverageGate()`** — The function needs to read gap data from sprint-state.json (where the analyzer writes it) and pass it to the formatting code. This is the AC 3 fix required for verification.
2. **Resolve `codeharness analyze` reference** — Either create the CLI command (if it's a simple wrapper around the existing analyzer module) or change the block message to not reference a non-existent command.

### Fix Soon (Next Sprint)

1. **Fix pre-existing BATS failures** — Tests 28-31 in `tests/integration/hooks.bats` fail on master. Fix the `hooks.json` format mismatch before it masks new regressions.
2. **Extract coverage gate into separate module** — `coverage.ts` is approaching the 300-line NFR9 limit. The gate function should be in its own file (already partially done with `coverage-gate.ts` and `observability-gate.ts` per code review notes).
3. **Replace grep-based JSON parsing in pre-commit-gate.sh** — Use `jq` or a proper JSON parser. Current grep approach is fragile.

### Backlog (Track but Not Urgent)

1. **Remove unreachable DEFAULT_STATIC_TARGET fallback** — Dead code identified in code review.
2. **Centralize gap parsing** — Carried over from Session 1. Three independent parsing locations remain.
3. **Fix binary `logEventCount`** — Carried over from Session 1. Still misleading.
4. **Silent catch blocks** — Carried over from Session 1. Three locations still swallow errors silently.
5. **Test against real telemetry** — Carried over from Session 1. No project with actual OTEL data has been used for end-to-end testing.
6. **Agent workflow compliance** — Agents consistently fail to update sprint-status.yaml. Either enforce it in the agent prompt or accept that harness-run handles it and remove the expectation.
