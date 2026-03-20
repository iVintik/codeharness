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

---

# Session 3 Retrospective — 2026-03-20T10:30Z

**Sprint:** Operational Excellence Sprint
**Session window:** ~06:18Z – ~06:30Z (2026-03-20), approx 15 minutes (AC3 fix + code review)
**Stories attempted:** 1
**Stories completed:** 1 (2-2-observability-hook-enforcement -> done)

---

## 1. Session Summary

| Story | Start Status | End Status | Phases Completed | Notes |
|-------|-------------|------------|-----------------|-------|
| 2-2-observability-hook-enforcement | review (AC3 failing) | done | dev-story (AC3 fix), code-review (AC3 cycle), verify | AC3 gap data pipeline was wired. Code review found the double-read bug in coverage-gate.ts and missing gaps field in StaticCoverageState. All 3 ACs passed verification. Committed as `2bd7760`. |

**Net progress:** Story 2-2 completed. Epic 2 now has 2/3 stories done (2-1 and 2-2). Story 2-3 (standalone runtime check/audit mode) remains in backlog.

---

## 2. Issues Analysis

### Bugs Discovered During Implementation or Review

1. **HIGH -- Double file read in coverage-gate.ts (code-review):** `checkObservabilityCoverageGate()` read sprint-state.json twice independently -- once via `readCoverageState()` for coverage numbers and once via `readCachedGaps()` for gap data. Two separate file reads, two separate JSON parses, two separate error paths. Fixed by adding gaps to `StaticCoverageState` and parsing everything in `extractCoverageState()`.
2. **HIGH -- Gaps never parsed back through readCoverageState (code-review):** `StaticCoverageState` type lacked a gaps field. Even though `saveCoverageResult()` writes gaps to sprint-state.json, `extractCoverageState()` never read them back. AC3 always showed empty gaps because the data was in the file but never loaded into memory. Root cause of the AC3 verification failure in Session 2.

### Workarounds Applied (Tech Debt Introduced)

1. **Duplicated default target constants (LOW, not fixed):** `DEFAULT_STATIC_TARGET` and `DEFAULT_RUNTIME_TARGET` are defined in both `coverage.ts` and `coverage-gate.ts`. Should be a single shared constant. Identified in code review but deferred.
2. **No integration test for full gap flow (LOW, not fixed):** There is no test that writes state with gaps, runs the gate, and verifies gaps appear in output. Unit tests exist for each piece individually but the end-to-end data flow is untested in automated tests.

### Workarounds Carried Forward

1. **`codeharness analyze` command still does not exist:** Session 2 identified this. Dev changed references to point to `codeharness observability-gate` or `patches/observability/` instead. The original block message referenced a non-existent command; now it references an existing one. Resolved by changing the reference rather than building the command.
2. **Gaps only populate after at least one analyzer run:** If sprint-state.json was written by an older version without the gaps field, the gate returns empty gaps. Graceful degradation, but first-run experience shows no gap details even when coverage is below target.

### Code Quality Concerns

1. **Duplicated constants across modules** -- same default target values defined in two files. Minor but will cause bugs if one is changed without the other.

### Verification Gaps

None new. All 3 ACs passed verification with concrete evidence (JSON output, exit codes, gap details in output).

### Tooling/Infrastructure Problems

None new this session.

---

## 3. What Went Well

- **Story 2-2 completed after one fix iteration.** Session 2 identified the exact failure (AC3 empty gaps). Session 3 fixed the root cause and passed verification on the first attempt. The fix cycle was fast (~15 minutes).
- **Code review found the root cause that dev missed.** Dev fixed the symptom (added `readCachedGaps()` to read gaps separately). Code review identified that the real fix was adding gaps to the existing type and parsing path, eliminating the double-read.
- **Non-existent command reference resolved.** The `codeharness analyze` reference from Session 2 was changed to point to actual commands. Users hitting the gate will now see actionable guidance.
- **Both Epic 2 implementation stories done.** Stories 2-1 and 2-2 are both verified and committed. The observability pipeline now has static analysis, runtime verification, and hook enforcement.

---

## 4. What Went Wrong

- **Same class of bug for the third session in a row.** Session 1: `saveRuntimeCoverage` was dead code (implemented but never called). Session 2: `gapSummary` was always empty (formatting code exists, no data source). Session 3: `StaticCoverageState` lacked gaps field (data in file, never loaded). All three are the same pattern: data pipeline breaks because producer and consumer are built independently without verifying the connection.
- **AC3 required three sessions to complete.** Created in Session 2, failed verification in Session 2, fixed in Session 3. A story with 3 ACs should not span multiple sessions, especially when the create-story phase identified the exact risk ("No codeharness analyze CLI command exists yet") that caused the failure.

---

## 5. Lessons Learned

### Patterns to Repeat

- **Targeted fix sessions work.** When the failure is well-characterized (Session 2 identified exactly what was wrong with AC3), a focused fix cycle is fast and effective. The session issues log from Session 2 gave Session 3 a clear target.
- **Code review improving fix quality.** Dev's initial fix (add a second file read) would have worked but introduced a new problem (double I/O). Code review upgraded it to the correct fix (extend the existing type). Review is not just catching bugs -- it is improving fix architecture.

### Patterns to Avoid

- **Building data producers and consumers in isolation.** Three sessions, three instances of the same bug class. The dev task list needs an explicit step: "Verify data flows end-to-end: write test data -> call producer -> call consumer -> assert output contains expected data." This should be a mandatory task in every story that adds data flow.
- **Deferring known risks from create-story.** The create-story phase identified "No codeharness analyze CLI command" as a risk. Dev proceeded without resolving it, causing AC3 failure. Risks identified during story creation should either be mitigated in the tasks or the AC should be rewritten to avoid the risk.

---

## 6. Action Items

### Fix Now (Before Next Session)

Nothing blocking. Story 2-2 is done. All Session 2 "Fix Now" items are resolved.

### Fix Soon (Next Sprint)

1. **Deduplicate default target constants** -- `DEFAULT_STATIC_TARGET` and `DEFAULT_RUNTIME_TARGET` exist in both `coverage.ts` and `coverage-gate.ts`. Extract to a shared constants file or the types module.
2. **Add end-to-end gap flow integration test** -- Write a test that creates sprint-state.json with gap data, runs `checkObservabilityCoverageGate()`, and asserts gaps appear in the result. Currently untested.
3. **Fix pre-existing BATS failures** -- Carried from Session 2. Tests 28-31 still failing on master.
4. **Add mandatory "verify data flow" task to story template** -- Every story that adds a data pipeline should include a task: "Write integration test verifying data flows from producer to consumer."

### Backlog (Track but Not Urgent)

1. **Centralize gap parsing** -- Carried from Session 1. Three independent parsing locations remain.
2. **Fix binary `logEventCount`** -- Carried from Session 1.
3. **Silent catch blocks** -- Carried from Session 1.
4. **Test against real telemetry** -- Carried from Session 1.
5. **Agent workflow compliance** -- Carried from Session 2.
6. **Type escape hatches (`as unknown as Record`)** -- Carried from Session 1.
7. **Replace grep-based JSON parsing in pre-commit-gate.sh** -- Carried from Session 2.

---

## Cross-Session Pattern Analysis

Three sessions on 2026-03-20. One persistent bug class appeared in every session:

| Session | Bug | Pattern |
|---------|-----|---------|
| 1 | `saveRuntimeCoverage` never called | Function implemented, tested, exported, but never wired into caller |
| 2 | `gapSummary` always empty | Formatting code exists, no data source connected |
| 3 | `StaticCoverageState` missing gaps field | Data written to file, never read back into type |

All three are **producer-consumer disconnects**. The fix is process-level: every story that adds data flow must include an explicit task verifying the full pipeline (write -> read -> display). Without this, the pattern will continue in future stories.

**Session totals for 2026-03-20:**
- Stories completed: 2 (2-1-verification-observability-check, 2-2-observability-hook-enforcement)
- Stories attempted: 2
- HIGH bugs found by code review: 6 (3 in Session 1, 3 in Session 2, 2 in Session 3 -- 8 total, but Session 1 was for story 2-1)
- Verification failures requiring re-work: 2 (proof parser in Session 1, AC3 in Session 2)
- Phases executed: ~12 (create-story x2, dev x3, code-review x3, verify x3, plus Session 3 fix cycle)

---

# Session 4 Retrospective — 2026-03-20T10:35Z

**Sprint:** Operational Excellence Sprint
**Session window:** ~06:32Z – ~06:55Z (2026-03-20), approx 25 minutes
**Stories attempted:** 1
**Stories completed:** 0 (2-3-standalone-runtime-check-audit-mode at `verifying`, not yet done)

---

## 1. Session Summary

| Story | Start Status | End Status | Phases Completed | Notes |
|-------|-------------|------------|-----------------|-------|
| 2-3-standalone-runtime-check-audit-mode | backlog | verifying | create-story, dev-story, code-review | Full pipeline through code review. Story implements `validateRuntime()` — a standalone function that queries VictoriaLogs for runtime telemetry and computes module-level coverage. Code review found 3 issues (2 HIGH, 1 MEDIUM), all fixed. File grew to 212 lines (above 200-line target, justified by security hardening). Verification not yet completed — session ended or is still in progress. |

**Net progress:** Story 2-3 advanced through 3 phases (create-story, dev, code-review) but has not reached done. Epic 2 remains at 2/3 stories done (2-1, 2-2). Sprint-status.yaml still shows 2-3 as `verifying`.

---

## 2. Issues Analysis

### Bugs Discovered During Implementation or Review

1. **HIGH -- Command injection in `execSync(cfg.testCommand)` (code-review):** The runtime validator executed unsanitized user-provided test commands via `execSync`. An attacker could inject shell metacharacters. Fixed with metacharacter rejection — the function now refuses commands containing `;`, `|`, `&`, `` ` ``, `$()`, `>`, `<`.
2. **HIGH -- Query timeout too short (code-review):** The health-check timeout of 3 seconds was reused for VictoriaLogs queries. Queries against real telemetry data take longer. Fixed with a dedicated 30-second query-specific timeout.
3. **MEDIUM -- Malformed URL crash (code-review):** `new URL()` in `queryTelemetryEvents` could throw on malformed endpoint URLs, crashing the process. Fixed with try/catch.

### Workarounds Applied (Tech Debt Introduced)

1. **File exceeded 200-line target (LOW, not fixed):** `runtime-validator.ts` grew to 212 lines, above the story's 200-line cap. Justified by security hardening added during code review. Future additions will need extraction or a new module.
2. **`parseLogEvents` silently drops malformed JSON (LOW, not fixed):** NDJSON lines that fail `JSON.parse` are silently dropped with no counter, warning, or diagnostic. Same silent-error pattern flagged in Sessions 1-3.
3. **Substring module matching (LOW, not fixed):** `event.source.includes(mod)` can false-positive on short module names (e.g., module `"io"` matches `"stdio"`, `"radio"`, etc.). No exact-match or boundary-aware matching.
4. **`saveRuntimeCoverage` doesn't persist module details (architecture):** `validateRuntime()` returns a `RuntimeValidationResult` with a `modules` array, but `saveRuntimeCoverage()` only persists aggregate stats (percentage, total, covered). Story 3.1 (audit coordinator) must extend persistence to include per-module data.

### Design Decisions and Risks

1. **No CLI surface yet:** This story implements only the module function (`validateRuntime()`), not a `codeharness audit` CLI command. The CLI surface is deferred to Epic 3 / Story 3.1. Same pattern as Session 2 where `codeharness analyze` was referenced but didn't exist.
2. **AC 1 integration risk (create-story):** Verifying runtime validation requires running VictoriaLogs with actual OTLP-instrumented test execution producing telemetry. Tagged as `integration-required` during story creation.
3. **Module detection heuristic undefined (create-story):** The architecture says "module-level matching" but doesn't specify how to discover modules or map telemetry events to them. Dev resolved this by using config-provided module names matched via string inclusion — fragile but functional.
4. **Config path mismatch (create-story):** Story creation expected config at `_bmad/bmm/config.yaml` but actual path is `_bmad/config.yaml`. Workaround applied, but this indicates stale path references in templates or documentation.
5. **Epic-2 status anomaly (create-story):** Sprint-status.yaml shows `epic-2: backlog` despite stories 2-1 and 2-2 being `done`. Left as-is per instructions, but the epic status is inaccurate.

### Code Quality Concerns

1. **Branch coverage at 76% (dev):** Statement, function, and line coverage are at 100%, but defensive fallbacks in NDJSON parsing leave branches uncovered. These are error-path branches that are hard to trigger in unit tests without mocking internal parse failures.

### Verification Gaps

1. **Verification not yet completed:** Story is at `verifying` but no proof document has been validated. The session appears to have ended before verification could run or complete.
2. **VictoriaLogs zero events (expected):** Same as all previous sessions — codeharness does not emit its own telemetry, so runtime validation queries return empty. The feature is tested against mocked data but not against a live instrumented project.

### Tooling/Infrastructure Problems

None new this session.

---

## 3. What Went Well

- **Code review caught a security vulnerability.** Command injection via `execSync` is a serious bug that would have shipped without review. The metacharacter rejection fix is a meaningful security improvement.
- **Three phases completed in ~25 minutes.** Create-story, dev, and code-review all completed quickly. The pipeline throughput continues to be efficient.
- **Story creation identified key risks early.** The create-story phase flagged AC 1 integration difficulty, the missing CLI surface, and the module detection ambiguity. All three were real issues that dev had to navigate.
- **Dev achieved 100% statement/function/line coverage.** Despite implementing a function that talks to external services (VictoriaLogs, test command execution), the test suite mocks all I/O and covers the happy path and error paths comprehensively.

---

## 4. What Went Wrong

- **Story did not reach done.** Session ended with the story at `verifying`, meaning no verification ran. This is the first session today that ended mid-pipeline without completing its story.
- **Silent error handling pattern continues.** Session 4 adds another instance: `parseLogEvents` silently drops malformed JSON. This is the fourth session in a row where silent error swallowing was flagged but not fixed. The pattern is now systemic.
- **Substring matching is a latent bug.** Using `event.source.includes(mod)` for module detection will produce false positives in any project with short module names. This was flagged but not fixed, and it will be the source of incorrect coverage numbers in production.
- **Persistence gap between `validateRuntime()` and `saveRuntimeCoverage()`.** This is the same producer-consumer disconnect pattern from Sessions 1-3, now in a new form: the function produces per-module data but the persistence layer only saves aggregates. The module details are computed and then discarded.

---

## 5. Lessons Learned

### Patterns to Repeat

- **Security review in code review phase.** The command injection bug was a real vulnerability, not a theoretical concern. Code review catching `execSync` with unsanitized input justifies the review overhead.
- **Tagging ACs with verification difficulty during create-story.** The `<!-- verification: integration-required -->` tag on AC 1 sets correct expectations for the verify phase. Better than discovering the difficulty during verification.

### Patterns to Avoid

- **Reusing timeouts across different operations.** A 3-second health-check timeout is wrong for a 30-second data query. Timeouts should be calibrated per operation, not shared as a single constant.
- **String inclusion for matching without boundary checks.** `includes()` is not a matching strategy — it is a substring search. Module matching needs at least word-boundary awareness or exact matching.
- **Ending sessions before verification.** A story at `verifying` without a proof is in limbo — it consumed create/dev/review effort but produced no validated output. Sessions should either complete through verification or not start the story.

---

## 6. Action Items

### Fix Now (Before Next Session)

1. **Complete verification of 2-3-standalone-runtime-check-audit-mode.** The story is at `verifying` and needs a full Docker verification pass. This is the only blocker to completing Epic 2.

### Fix Soon (Next Sprint)

1. **Fix substring module matching** -- Replace `event.source.includes(mod)` with boundary-aware or exact matching. Short module names will cause false positives in production.
2. **Add diagnostics for dropped NDJSON lines** -- `parseLogEvents` should count and warn about malformed lines, not silently discard them.
3. **Extend `saveRuntimeCoverage` to persist module details** -- Story 3.1 needs per-module data. The persistence layer currently discards it.
4. **Fix epic-2 status in sprint-status.yaml** -- Epic status says `backlog` but 2 of 3 stories are `done`. Should be `in-progress` at minimum.
5. **Deduplicate default target constants** -- Carried from Session 3.
6. **Add end-to-end gap flow integration test** -- Carried from Session 3.
7. **Fix pre-existing BATS failures** -- Carried from Session 2. Tests 28-31 still failing on master.

### Backlog (Track but Not Urgent)

1. **Centralize gap parsing** -- Carried from Session 1. Three independent parsing locations remain.
2. **Fix binary `logEventCount`** -- Carried from Session 1.
3. **Silent catch blocks** -- Carried from Session 1. Now four+ locations.
4. **Test against real telemetry** -- Carried from Session 1.
5. **Agent workflow compliance** -- Carried from Session 2.
6. **Type escape hatches (`as unknown as Record`)** -- Carried from Session 1.
7. **Replace grep-based JSON parsing in pre-commit-gate.sh** -- Carried from Session 2.
8. **Config path mismatch** -- `_bmad/bmm/config.yaml` vs `_bmad/config.yaml`. Templates reference the wrong path.

---

## Cross-Session Pattern Analysis (Updated)

Four sessions on 2026-03-20. The producer-consumer disconnect pattern persists:

| Session | Bug | Pattern |
|---------|-----|---------|
| 1 | `saveRuntimeCoverage` never called | Function implemented, tested, exported, but never wired into caller |
| 2 | `gapSummary` always empty | Formatting code exists, no data source connected |
| 3 | `StaticCoverageState` missing gaps field | Data written to file, never read back into type |
| 4 | `saveRuntimeCoverage` doesn't persist modules | Function returns per-module data, persistence layer discards it |

A second pattern emerged this session: **silent error handling**. Four sessions, four instances of silent error swallowing (catch blocks with no logging, parse failures with no counters, malformed data silently dropped). This is now as persistent as the producer-consumer disconnect.

**Cumulative session totals for 2026-03-20:**
- Stories completed: 2 (2-1, 2-2)
- Stories in progress: 1 (2-3 at verifying)
- HIGH bugs found by code review: 8 (Sessions 1-3) + 2 (Session 4) = 10 total
- Security vulnerabilities caught: 1 (command injection in Session 4)
- Verification failures requiring re-work: 2 (proof parser in Session 1, AC3 in Session 2)
- Phases executed: ~15 (Sessions 1-3: ~12, Session 4: create-story + dev + code-review = 3)

---

# Session 5 Retrospective — 2026-03-20T11:00Z

**Sprint:** Operational Excellence Sprint
**Session window:** ~06:55Z – ~07:03Z (2026-03-20), approx 10 minutes
**Stories attempted:** 1
**Stories completed:** 1 (2-3-standalone-runtime-check-audit-mode -> done)

---

## 1. Session Summary

| Story | Start Status | End Status | Phases Completed | Notes |
|-------|-------------|------------|-----------------|-------|
| 2-3-standalone-runtime-check-audit-mode | verifying | done | verify | Verification completed all 3 ACs. One bug found and fixed during verify (invalid LogsQL query syntax). Stale Docker container required manual cleanup. Committed as `899b622`. Epic 2 marked complete in follow-up commit `a531a96`. |

**Net progress:** Story 2-3 completed. Epic 2 is now fully done (3/3 stories: 2-1, 2-2, 2-3). Sprint-status.yaml updated to `epic-2: done`. Ralph session stopped by user after Epic 2 completion (5 loops, 4 calls, ~95 minutes elapsed).

---

## 2. Issues Analysis

### Bugs Discovered During Verification

1. **BUG -- Invalid LogsQL query syntax (verify):** `queryTelemetryEvents` used `_stream_id:*` which is not valid VictoriaLogs LogsQL syntax. The query returned HTTP 400. Fixed by changing to `*` (wildcard matching all entries). This bug would have caused every real VictoriaLogs query to fail in production. It was not caught during dev or code review because unit tests mock the HTTP layer.

### Workarounds Applied (Tech Debt Introduced)

None new this session. All unfixed LOWs from Session 4 remain:
1. File exceeded 200-line target (212 lines).
2. `parseLogEvents` silently drops malformed JSON.
3. Substring module matching (`includes()` false positives).
4. `saveRuntimeCoverage` doesn't persist module details.

### Verification Gaps

1. **`echo ok` test command produces no telemetry (verify):** The synthetic test command used during verification does not emit OTLP telemetry, so VictoriaLogs shows zero events. This is expected for the test setup, but it means AC 1 (query telemetry and compute coverage) was verified against a zero-event dataset. The code paths for non-zero event processing were validated by unit tests only.

### Tooling/Infrastructure Problems

1. **Stale Docker container from prior session (verify):** Had to `docker rm -f` before starting the verification environment. The `verify-env` cleanup that runs between sessions did not remove the container. This is the second time this issue appeared today (also in Session 3). The cleanup script is unreliable.

---

## 3. What Went Well

- **Epic 2 completed.** All three stories (2-1, 2-2, 2-3) are verified and committed. The runtime observability pipeline now has verification checks, hook enforcement, and standalone runtime validation.
- **Verification caught a real production bug.** The LogsQL syntax error (`_stream_id:*` vs `*`) would have caused all VictoriaLogs queries to fail with HTTP 400. Unit tests didn't catch it because they mock HTTP. The live Docker verification environment exposed the real behavior.
- **Fast verification session.** Single story, single phase (verify), completed in ~10 minutes. No re-work needed beyond the LogsQL fix.
- **Session issues log provided complete traceability.** Session 5 logged the LogsQL bug, the Docker container issue, and the observability gap. All issues in this retrospective trace directly to log entries.

---

## 4. What Went Wrong

- **LogsQL syntax was never validated against a real backend.** The query string was authored during dev, survived code review, and was only caught when verification actually hit the VictoriaLogs API. This is a test coverage gap: unit tests mock the HTTP layer so any query string would "work." Integration-level testing (even with a fixture or recorded response) would have caught this.
- **Docker container cleanup is unreliable.** Two sessions today required manual `docker rm -f` before starting. The `verify-env` cleanup runs between sessions but fails to remove containers. This wastes time and adds friction to every verification pass.
- **Zero-event verification is structurally weak.** AC 1 specifies "query VictoriaLogs for runtime telemetry and compute module-level coverage." Verification ran the query, got zero events, and computed 62.5% coverage (from module config). The actual event-to-module mapping logic was tested only via unit tests with mock data, not against a real backend with real events.

---

## 5. Lessons Learned

### Patterns to Repeat

- **Live backend verification catches what mocks miss.** The LogsQL syntax bug was invisible to unit tests. Docker-based verification against real VictoriaLogs exposed it immediately. Every story that integrates with external services should include a live verification step.
- **Complete the pipeline in a single focused session.** Session 5 picked up exactly where Session 4 left off (story at `verifying`), ran the verify phase, and finished. No wasted effort.

### Patterns to Avoid

- **Mocking HTTP without validating query/request format.** Unit tests that mock `fetch` or `http` accept any URL and query string. At minimum, tests should assert that the query string matches expected syntax patterns, even if the response is mocked.
- **Leaving stories at `verifying` across sessions.** Session 4 ended with 2-3 unverified. Session 5 had to context-switch back to it. If a story reaches code review, push through to verification in the same session whenever possible.

---

## 6. Action Items

### Fix Now (Before Next Session)

Nothing blocking. Epic 2 is complete. All stories verified and committed.

### Fix Soon (Next Sprint)

1. **Fix Docker container cleanup** -- The `verify-env` cleanup script does not reliably remove containers between sessions. Two manual `docker rm -f` operations today. Investigate why the cleanup fails and fix it.
2. **Add query format assertions to HTTP-mocked tests** -- Unit tests for `queryTelemetryEvents` should assert the query string matches valid LogsQL syntax, even when the HTTP response is mocked.
3. **Fix substring module matching** -- Carried from Session 4. `event.source.includes(mod)` false-positives on short names.
4. **Add diagnostics for dropped NDJSON lines** -- Carried from Session 4.
5. **Extend `saveRuntimeCoverage` to persist module details** -- Carried from Session 4. Required by Story 3.1.
6. **Deduplicate default target constants** -- Carried from Session 3.
7. **Add end-to-end gap flow integration test** -- Carried from Session 3.
8. **Fix pre-existing BATS failures** -- Carried from Session 2. Tests 28-31 still failing on master.

### Backlog (Track but Not Urgent)

1. **Centralize gap parsing** -- Carried from Session 1.
2. **Fix binary `logEventCount`** -- Carried from Session 1.
3. **Silent catch blocks** -- Carried from Session 1. Now five+ locations.
4. **Test against real telemetry** -- Carried from Session 1.
5. **Agent workflow compliance** -- Carried from Session 2.
6. **Type escape hatches (`as unknown as Record`)** -- Carried from Session 1.
7. **Replace grep-based JSON parsing in pre-commit-gate.sh** -- Carried from Session 2.
8. **Config path mismatch** -- Carried from Session 4.
9. **Epic numbering collision** -- Carried from Session 1.

---

## Cross-Session Pattern Analysis (Final — 2026-03-20)

Five sessions on 2026-03-20. Two persistent bug patterns across all sessions:

### Pattern 1: Producer-Consumer Disconnects

| Session | Bug | Pattern |
|---------|-----|---------|
| 1 | `saveRuntimeCoverage` never called | Function implemented, tested, exported, never wired into caller |
| 2 | `gapSummary` always empty | Formatting code exists, no data source connected |
| 3 | `StaticCoverageState` missing gaps field | Data written to file, never read back into type |
| 4 | `saveRuntimeCoverage` doesn't persist modules | Function returns per-module data, persistence layer discards it |
| 5 | LogsQL query syntax invalid | Query string authored without validation against real API |

Session 5's bug is a variant: the "producer" (query construction) is disconnected from the "consumer" (VictoriaLogs API) by a mock boundary. Same root cause -- components built in isolation without verifying the connection.

### Pattern 2: Silent Error Handling

| Session | Instance |
|---------|----------|
| 1 | 3 silent catch blocks in gap parsing |
| 2 | No NaN validation on CLI args |
| 3 | (None new) |
| 4 | `parseLogEvents` silently drops malformed JSON |
| 5 | (None new, but prior instances remain unfixed) |

Five sessions, zero fixes to silent error handling. This is accepted technical debt that will cause debugging difficulty in production.

### Final Day Totals (2026-03-20)

- **Stories completed:** 3 (2-1, 2-2, 2-3)
- **Epics completed:** 1 (Epic 2: Runtime Observability & Coverage Metrics)
- **HIGH bugs found by code review:** 10 across 5 sessions
- **Security vulnerabilities caught:** 1 (command injection)
- **Production bugs caught by live verification:** 1 (LogsQL syntax)
- **Verification failures requiring re-work:** 2 (proof parser in Session 1, AC3 in Session 2)
- **Phases executed:** ~16 (create-story x3, dev x4, code-review x4, verify x4, plus fix cycles)
- **Total session time:** ~3.5 hours across 5 sessions
- **Average story throughput:** ~70 minutes per story (including all rework)
- **Docker cleanup issues:** 2 (Sessions 3 and 5)

### Recommendations for Next Sprint

1. **Add "verify data flow end-to-end" as a mandatory dev task** for any story that adds a data pipeline. This addresses the producer-consumer disconnect pattern that appeared in every session.
2. **Add query/request format assertions to mocked HTTP tests.** The LogsQL bug would have been caught if the unit test asserted the query string format.
3. **Fix Docker container cleanup before starting the next sprint.** Two manual cleanups in one day is a workflow tax.
4. **Tackle silent error handling as a dedicated tech-debt story.** Five sessions of deferral means it won't get fixed incrementally. Schedule it explicitly.
5. **Code review remains non-negotiable.** 10 HIGH bugs caught across 5 sessions. The 3-5 minutes per review paid for themselves many times over.

---

# Session 6 Retrospective — 2026-03-20T11:30Z

**Sprint:** Operational Excellence Sprint
**Session window:** ~07:15Z – ~07:35Z (2026-03-20), approx 20 minutes
**Stories attempted:** 2 (0-5-3 verification + 0-5-4 story creation)
**Stories completed:** 1 (0-5-3-ink-terminal-renderer -> done)

---

## 1. Session Summary

| Story | Start Status | End Status | Phases Completed | Notes |
|-------|-------------|------------|-----------------|-------|
| 0-5-3-ink-terminal-renderer | verifying | done | code-review (prior), verify | All 9 ACs passed black-box verification. Code review in prior phase found 2 HIGH issues (unused constant, untested post-cleanup guards) and 1 MEDIUM (array reference mutation). All fixed before verification. Committed as `888c714`. |
| 0-5-4-run-command-integration | backlog | ready-for-dev | create-story | Story spec created with 9 ACs. Flagged 3 risks during creation: AC 8 ambiguity (stderr vs NDJSON), run.ts already at 358 lines (exceeds 300-line NFR9), and dependency on 0-5-3 (now resolved). |

**Net progress:** Story 0-5-3 completed — Epic 0.5 now has 3/4 stories done (0-5-1, 0-5-2, 0-5-3). Story 0-5-4 is the final story needed to complete Epic 0.5. Sprint-status.yaml shows 0-5-4 as `ready-for-dev`.

---

## 2. Issues Analysis

### Bugs Discovered During Implementation or Review

1. **HIGH -- `STATUS_SYMBOLS` constant defined but unused (code-review):** Symbols were hardcoded inline in `StoryBreakdown` component instead of using the defined constant. This created a divergence risk -- if the constant were updated, the component would still use old inline values. Fixed by refactoring to use the constant via a `fmt()` helper.
2. **HIGH -- `updateStories()` and `addMessage()` post-cleanup guard untested (code-review):** The `if (cleaned) return` early-exit paths in both functions had zero test coverage. These guards prevent state updates after Ink cleanup, but without tests, a future refactor could remove them and cause use-after-cleanup bugs. Fixed by adding dedicated test cases.
3. **MEDIUM -- `updateStories()` took caller's array reference without defensive copy (code-review):** The function stored the caller's array directly. If the caller mutated the array after passing it, renderer state would silently corrupt. Fixed with `[...stories]` spread to create a defensive copy.

### Workarounds Applied (Tech Debt Introduced)

1. **`truncateToWidth()` private function has no independent edge-case tests (LOW, not fixed):** Covered only through component tests. Edge cases (empty string, string exactly at width, multi-byte characters) are not explicitly tested. Identified in code review but deferred.
2. **Unreachable `rerender()` guard causes < 100% branch coverage (LOW, not fixed):** The `if (!cleaned)` false branch at line 89 of `ink-renderer.tsx` is dead code — `rerender` is only called when Ink is active. Causes 96.77% branch coverage instead of 100%. Cosmetic issue only.

### Code Quality Concerns

1. **Coverage: 96.53% overall, all 110 files above 80% floor.** Ink-renderer.tsx at 96.77% branches is the only file below 100% branch coverage, and only due to the unreachable guard. No quality concern.
2. **run.ts at 358 lines:** The file that story 0-5-4 will modify already exceeds the 300-line NFR9 limit by 58 lines. The create-story phase recommends extracting helpers before or during 0-5-4 implementation. If deferred, 0-5-4 will push it further past the limit.

### Verification Gaps

1. **AGENTS.md precondition failure (verify):** `codeharness verify` initially failed because `stream-parser.ts`, `ink-components.tsx`, and `ink-renderer.tsx` were missing from `src/lib/AGENTS.md`. Fixed by adding a "Stream Parsing & Ink Rendering" section. This is a process gap: new files added during dev should have AGENTS.md updated in the same phase. Code review didn't catch the missing entries.
2. **No exec-plan found (verify, warning only):** Story 0-5-3 does not have a separate execution plan document. Warning logged but not blocking — the story spec itself contains sufficient implementation detail.
3. **Showboat not installed (verify, warning only):** Re-verification step skipped because `showboat` CLI is not installed in the verification environment. Non-blocking.

### Tooling/Infrastructure Problems

None new this session. Docker cleanup was not an issue (no stale containers reported).

### Design Decisions and Risks (0-5-4 Create-Story)

1. **AC 8 ambiguity:** Epic says "ralph reads Claude stdout (NDJSON)" for piping, but story completion messages come from ralph's stderr, not the NDJSON stream. The story spec clarifies this in dev notes, but implementation will need to handle both stdout (NDJSON events) and stderr (ralph messages) as separate streams.
2. **NFR9 line limit risk:** run.ts is already 58 lines over the 300-line limit. Story 0-5-4 adds stream piping, Ink renderer integration, polling, and cleanup — easily another 80-100 lines. Story recommends extracting helpers into a separate module before or during implementation.
3. **0-5-3 dependency resolved:** Story 0-5-4 depends on 0-5-3 (Ink renderer). 0-5-3 was completing verification at the time 0-5-4 was created. Now done — no blocker.

---

## 3. What Went Well

- **Story 0-5-3 completed cleanly.** All 9 ACs passed verification on the first attempt. No re-work needed. This is the first story today that passed verification without requiring a fix cycle.
- **Code review improved component quality.** The unused `STATUS_SYMBOLS` constant and the missing defensive copy were subtle bugs that would have caused maintenance headaches later. The untested cleanup guards were a real coverage gap. All three issues fixed before verification.
- **Story 0-5-4 created with clear risk identification.** The create-story phase flagged the stderr/stdout ambiguity, the NFR9 line limit violation, and the 0-5-3 dependency. All three are actionable by the dev phase.
- **Epic 0.5 nearing completion.** Three of four stories done. One story (0-5-4) remains as the integration story that wires everything together.
- **Test coverage remains strong.** 96.53% overall, 110 files above 80% floor, 2510+ tests passing. The ink renderer alone added comprehensive component tests for all rendering paths.

---

## 4. What Went Wrong

- **AGENTS.md not updated during dev phase.** Three new files were added to `src/lib/` during 0-5-3 dev but AGENTS.md was not updated until verification caught the precondition failure. This is a recurring process gap: the dev phase creates files but does not update module documentation. Code review also missed it.
- **run.ts already over the line limit before 0-5-4 starts.** At 358 lines, the file is 19% over the 300-line NFR9 limit. This was not addressed in any prior story. Story 0-5-4 will add significant logic to this file. If extraction is not done first, the file will grow to 450+ lines, making it increasingly difficult to maintain.
- **Two LOW code review findings deferred.** The `truncateToWidth()` edge-case testing gap and the unreachable `rerender()` guard are minor, but they add to the growing list of deferred LOWs. Across all 6 sessions today, 14+ LOW findings have been deferred.

---

## 5. Lessons Learned

### Patterns to Repeat

- **Comprehensive component testing pays off at verification.** Story 0-5-3 passed all 9 ACs on the first attempt — the only story today to do so. The dev phase invested in thorough component tests (each rendering path, each status symbol, each message type), and the result was zero verification rework.
- **Defensive copies for shared state.** The `[...stories]` spread fix is a small change with large impact. Any function that stores caller-provided data should copy it. This should be a standard pattern in future stories.

### Patterns to Avoid

- **Creating files without updating AGENTS.md.** Three new files, zero AGENTS.md updates, caught only at verification. The dev task list should include "update AGENTS.md for all new/modified files" as a mandatory final task.
- **Letting file sizes exceed limits across stories.** run.ts exceeded 300 lines before this sprint's stories even started. No story took ownership of the extraction. By the time 0-5-4 needs to modify it, the tech debt is compounding. File size limits should be enforced as pre-conditions, not aspirations.

---

## 6. Action Items

### Fix Now (Before Next Session)

1. **Extract helpers from run.ts before starting 0-5-4 dev.** The file is at 358 lines. Story 0-5-4 will add 80-100 more lines. Extract polling, status formatting, or error handling into a separate module to get run.ts under 300 lines before implementation begins.

### Fix Soon (Next Sprint)

1. **Add "update AGENTS.md" as mandatory dev task** -- Every story that creates or modifies files in a module should include a task to update the corresponding AGENTS.md. Code review should check for this.
2. **Add independent `truncateToWidth()` edge-case tests** -- Deferred from code review. Should cover empty string, exact-width string, multi-byte/emoji characters, and zero-width inputs.
3. **Fix Docker container cleanup** -- Carried from Session 5.
4. **Add query format assertions to HTTP-mocked tests** -- Carried from Session 5.
5. **Fix substring module matching** -- Carried from Session 4.
6. **Add diagnostics for dropped NDJSON lines** -- Carried from Session 4.
7. **Extend `saveRuntimeCoverage` to persist module details** -- Carried from Session 4.
8. **Deduplicate default target constants** -- Carried from Session 3.
9. **Add end-to-end gap flow integration test** -- Carried from Session 3.
10. **Fix pre-existing BATS failures** -- Carried from Session 2. Tests 28-31 still failing on master.

### Backlog (Track but Not Urgent)

1. **Remove unreachable `rerender()` guard** -- Dead code causing 96.77% branch coverage instead of 100%. Cosmetic.
2. **Centralize gap parsing** -- Carried from Session 1.
3. **Fix binary `logEventCount`** -- Carried from Session 1.
4. **Silent catch blocks** -- Carried from Session 1. Now five+ locations.
5. **Test against real telemetry** -- Carried from Session 1.
6. **Agent workflow compliance** -- Carried from Session 2.
7. **Type escape hatches (`as unknown as Record`)** -- Carried from Session 1.
8. **Replace grep-based JSON parsing in pre-commit-gate.sh** -- Carried from Session 2.
9. **Config path mismatch** -- Carried from Session 4.
10. **Epic numbering collision** -- Carried from Session 1.
11. **Address 14+ deferred LOW findings** -- Accumulated across all 6 sessions. Consider a dedicated tech-debt story.

---

## Cross-Session Pattern Analysis (Final Update — 6 Sessions, 2026-03-20)

Six sessions on 2026-03-20. Updated totals and patterns.

### Pattern 1: Producer-Consumer Disconnects

| Session | Bug | Pattern |
|---------|-----|---------|
| 1 | `saveRuntimeCoverage` never called | Function implemented, tested, exported, never wired into caller |
| 2 | `gapSummary` always empty | Formatting code exists, no data source connected |
| 3 | `StaticCoverageState` missing gaps field | Data written to file, never read back into type |
| 4 | `saveRuntimeCoverage` doesn't persist modules | Function returns per-module data, persistence layer discards it |
| 5 | LogsQL query syntax invalid | Query string authored without validation against real API |
| 6 | (None new) | First session without this pattern -- component tests covered all rendering paths |

Session 6 broke the pattern. The difference: the Ink renderer story had self-contained components where producer and consumer were in the same file, tested together. Stories with cross-module data flow remain vulnerable.

### Pattern 2: Silent Error Handling

| Session | Instance |
|---------|----------|
| 1 | 3 silent catch blocks in gap parsing |
| 2 | No NaN validation on CLI args |
| 3 | (None new) |
| 4 | `parseLogEvents` silently drops malformed JSON |
| 5 | (None new) |
| 6 | (None new) |

No new instances, but zero prior instances fixed. Six sessions of deferral.

### Pattern 3: AGENTS.md / Documentation Lag (New)

| Session | Instance |
|---------|----------|
| 2 | AGENTS.md files not updated for new modules (code-review caught) |
| 6 | AGENTS.md not updated for 3 new files (verification caught) |

Documentation updates are consistently forgotten during dev and inconsistently caught during review.

### Final Day Totals (2026-03-20 — All 6 Sessions)

- **Stories completed:** 4 (2-1, 2-2, 2-3, 0-5-3)
- **Stories created:** 1 (0-5-4, ready-for-dev)
- **Epics completed:** 1 (Epic 2: Runtime Observability & Coverage Metrics)
- **HIGH bugs found by code review:** 12 (Sessions 1-5: 10, Session 6: 2)
- **MEDIUM bugs found by code review:** 4 (Sessions 1-5: 3, Session 6: 1)
- **Security vulnerabilities caught:** 1 (command injection, Session 4)
- **Production bugs caught by live verification:** 1 (LogsQL syntax, Session 5)
- **Verification failures requiring re-work:** 2 (proof parser in Session 1, AC3 in Session 2)
- **Stories passing verification on first attempt:** 2 (0-5-3 in Session 6, 2-3 in Session 5)
- **Phases executed:** ~19 (Sessions 1-5: ~16, Session 6: code-review + verify + create-story = 3)
- **Total session time:** ~4 hours across 6 sessions
- **Average story throughput:** ~60 minutes per story (4 stories in ~4 hours, including all rework)
- **Docker cleanup issues:** 2 (Sessions 3 and 5)
- **Deferred LOW findings:** 14+ across all sessions
- **Test count:** 2510+ passing, 96.53% overall coverage

### Recommendations for Next Sprint (Updated)

1. **Add "verify data flow end-to-end" as a mandatory dev task** for any story that adds a cross-module data pipeline. Session 6 showed this is not needed for self-contained component stories.
2. **Add "update AGENTS.md" as a mandatory dev task** for any story that creates or modifies files. Two sessions had documentation lag issues.
3. **Extract run.ts before 0-5-4 dev.** The file is at 358 lines and 0-5-4 will add substantially more. Do the extraction as a preparatory task.
4. **Add query/request format assertions to mocked HTTP tests.** Carried from Session 5.
5. **Fix Docker container cleanup.** Carried from Session 5.
6. **Schedule a dedicated tech-debt story** to address silent error handling (5+ locations) and the 14+ deferred LOWs. Incremental deferral is not working.
7. **Code review remains non-negotiable.** 12 HIGH + 4 MEDIUM bugs caught across 6 sessions. Every session's review found real issues.

---

# Session 7 Retrospective — 2026-03-20T12:00Z

**Sprint:** Operational Excellence Sprint
**Session window:** ~08:10Z – ~08:25Z (2026-03-20), approx 15 minutes (dev + code-review)
**Stories attempted:** 1
**Stories completed:** 0 (0-5-4-run-command-integration at `verifying`, not yet done)

---

## 1. Session Summary

| Story | Start Status | End Status | Phases Completed | Notes |
|-------|-------------|------------|-----------------|-------|
| 0-5-4-run-command-integration | ready-for-dev | verifying | dev-story, code-review | Story integrates stream-json piping, Ink renderer, elapsed time, per-story statuses, and ralph message parsing into `codeharness run`. Dev extracted helpers to `run-helpers.ts` to bring `run.ts` from 358 to exactly 300 lines (NFR9 compliance). Code review found 1 HIGH, 3 MEDIUM, 1 LOW — all fixed except the missing proof document (deferred to verify phase). 2728 tests pass. 86 new/updated tests. Verification not yet completed. |

**Net progress:** Story 0-5-4 advanced through dev and code-review. Epic 0.5 remains at 3/4 stories done (0-5-1, 0-5-2, 0-5-3). Completing 0-5-4 will finish Epic 0.5.

---

## 2. Issues Analysis

### Bugs Discovered During Implementation or Review

1. **HIGH -- AGENTS.md missing for new module (code-review):** `run-helpers.ts` was a brand-new file in `src/lib/` and was not documented in `src/lib/AGENTS.md`. This is the third session (Sessions 2, 6, and now 7) where AGENTS.md was not updated during dev. Fixed during code review.
2. **MEDIUM -- Duplicate test code (code-review):** `countStories` and `buildSpawnArgs` had identical tests in both `run-helpers.test.ts` and `run.test.ts`. After extraction to `run-helpers.ts`, the original `run.test.ts` tests were copied rather than replaced with re-export verification. Fixed by replacing duplicates with minimal re-export tests.
3. **MEDIUM -- Polling interval code untested (code-review):** The `setInterval` callback in `run.ts` (lines 207-228) was never exercised by any test. AC #6 (elapsed time) and AC #7 (per-story statuses) were only tested for the initial call, not the polling refresh path. Fixed by adding `vi.useFakeTimers()` test.
4. **MEDIUM -- Misleading test name (code-review):** Test `--max-story-retries defaults to 3` actually asserted default is `'10'`. Name was wrong since an earlier change updated the default but not the test name. Fixed.

### Workarounds Applied (Tech Debt Introduced)

1. **run.ts at exactly 300 lines (LOW):** Was 358 originally. Extracting `countStories` and `buildSpawnArgs` plus new helpers to `run-helpers.ts` brought it to exactly 300. Zero headroom -- any future changes to `run.ts` will require further extraction. The file is at the absolute boundary of NFR9.
2. **Pre-existing TS errors in test files (LOW, not fixed):** Loosely-typed `vi.fn()` mocks don't match strict type signatures. This exists across many test files and was not introduced by this story. Not addressed.
3. **run-helpers.test.ts at 303 lines (LOW, not fixed):** Slightly over the 300-line NFR9 limit. Test files are typically exempt from this limit.

### Code Quality Concerns

1. **Branch coverage at 70.23% for run.ts:** Uncovered branches are error-handling catch blocks (prompt write failure, JSON parse failure). These are difficult to trigger in unit tests. Statement coverage at 95.52% and function coverage at 100% are strong.
2. **No integration test for full stream-json to Ink pipeline:** All tests mock the renderer. No test verifies that actual NDJSON events flow through `parseStreamLine()` and produce visible Ink output. Unit tests verify each piece independently.
3. **coverage-summary.json confusion (pre-existing):** The file contains Jest-format results, not istanbul coverage data. Pre-existing issue, not introduced by this story.

### Verification Gaps

1. **Verification not yet completed:** Story is at `verifying` but no proof document has been validated. Session ended before verification could run.

### Tooling/Infrastructure Problems

None new this session.

---

## 3. What Went Well

- **NFR9 compliance achieved.** `run.ts` went from 358 lines (19% over limit) to exactly 300 lines through disciplined extraction. The Session 6 "Fix Now" action item (extract helpers before 0-5-4 dev) was executed as part of the dev phase rather than as a separate step, achieving the same outcome.
- **Code review caught the AGENTS.md gap again.** Third session in a row where dev forgot to update AGENTS.md for new files. Code review is the reliable backstop, but this process gap needs a structural fix.
- **Polling interval now tested.** The `setInterval` callback was a known coverage gap (flagged in session issues). Code review pushed for the fix, and the `vi.useFakeTimers()` approach works cleanly.
- **86 new/updated tests, 2728 total passing.** Test count grew by 218 from Session 6's 2510. Coverage remains at 96.65% overall with all 111 files above the 80% floor.
- **Clean extraction pattern.** Helper functions (`formatElapsed`, `mapSprintStatus`, `mapSprintStatuses`, `parseRalphMessage`) were extracted with clear interfaces. `run.ts` re-exports `countStories` and `buildSpawnArgs` for backward compatibility, avoiding breaking changes.

---

## 4. What Went Wrong

- **AGENTS.md forgotten for the third time.** Sessions 2, 6, and 7 all had AGENTS.md update failures. The Session 6 action item said "Add 'update AGENTS.md' as mandatory dev task." This session's dev phase still did not do it. The action item is not being enforced -- it needs to be embedded in the story template or dev agent prompt, not just listed in retrospectives.
- **Zero headroom on run.ts line count.** Exactly 300 lines means the next person to touch `run.ts` will immediately violate NFR9. This is a fragile equilibrium. More extraction should have been done to create a buffer (e.g., target 250 lines, not 300).
- **Verification not completed in session.** Same issue as Session 4 -- story reached `verifying` but session ended before verification ran. The story has consumed dev and review effort but produced no validated output yet.

---

## 5. Lessons Learned

### Patterns to Repeat

- **Extract helpers proactively during dev, not as a separate preparatory step.** Session 6 recommended extracting run.ts before 0-5-4 dev. Dev did it inline during implementation, which worked well -- the extraction was informed by the actual code being added, producing better boundaries than a pre-emptive extraction would have.
- **Test polling intervals with fake timers.** The `vi.useFakeTimers()` pattern for testing `setInterval` callbacks was effective. Apply this to any future polling-based code.

### Patterns to Avoid

- **Targeting exactly the limit.** Hitting 300 lines exactly means zero margin. Extraction should target 80% of the limit (~240 lines) to leave room for future changes.
- **Listing action items in retrospectives without enforcing them.** "Add 'update AGENTS.md' as mandatory dev task" was an action item from Session 6. It was not acted on. Action items that require process changes (template edits, prompt modifications) need to be executed immediately, not deferred to "next sprint."

---

## 6. Action Items

### Fix Now (Before Next Session)

1. **Complete verification of 0-5-4-run-command-integration.** The story is at `verifying` and needs verification to complete Epic 0.5. This is the only blocker.
2. **Add "update AGENTS.md for all new/modified files" to the dev agent prompt or story template.** Three sessions of forgetting is enough. This needs a structural fix, not another retrospective note.

### Fix Soon (Next Sprint)

1. **Extract more from run.ts to create headroom.** Currently at 300 lines. Target 240-250 lines. Move the `readResultFromStatusFile()` or the `sprintState` polling setup into helpers.
2. **Add full pipeline integration test for stream-json to Ink.** Currently all tests mock the renderer. One test should verify real NDJSON → `parseStreamLine()` → Ink component rendering.
3. **Fix pre-existing TS type errors in test files.** Loosely-typed `vi.fn()` mocks across multiple test files. This is growing tech debt that makes type checking less reliable.
4. **Fix Docker container cleanup** -- Carried from Session 5.
5. **Add query format assertions to HTTP-mocked tests** -- Carried from Session 5.
6. **Fix substring module matching** -- Carried from Session 4.
7. **Add diagnostics for dropped NDJSON lines** -- Carried from Session 4.
8. **Extend `saveRuntimeCoverage` to persist module details** -- Carried from Session 4.
9. **Deduplicate default target constants** -- Carried from Session 3.
10. **Add end-to-end gap flow integration test** -- Carried from Session 3.
11. **Fix pre-existing BATS failures** -- Carried from Session 2. Tests 28-31 still failing on master.

### Backlog (Track but Not Urgent)

1. **Remove unreachable `rerender()` guard** -- Carried from Session 6.
2. **Centralize gap parsing** -- Carried from Session 1.
3. **Fix binary `logEventCount`** -- Carried from Session 1.
4. **Silent catch blocks** -- Carried from Session 1. Now five+ locations.
5. **Test against real telemetry** -- Carried from Session 1.
6. **Agent workflow compliance** -- Carried from Session 2.
7. **Type escape hatches (`as unknown as Record`)** -- Carried from Session 1.
8. **Replace grep-based JSON parsing in pre-commit-gate.sh** -- Carried from Session 2.
9. **Config path mismatch** -- Carried from Session 4.
10. **Epic numbering collision** -- Carried from Session 1.
11. **Address 15+ deferred LOW findings** -- Accumulated across all 7 sessions.

---

## Cross-Session Pattern Analysis (Updated — 7 Sessions, 2026-03-20)

Seven sessions on 2026-03-20. Updated patterns.

### Pattern 1: Producer-Consumer Disconnects

| Session | Bug | Pattern |
|---------|-----|---------|
| 1 | `saveRuntimeCoverage` never called | Function implemented, tested, exported, never wired into caller |
| 2 | `gapSummary` always empty | Formatting code exists, no data source connected |
| 3 | `StaticCoverageState` missing gaps field | Data written to file, never read back into type |
| 4 | `saveRuntimeCoverage` doesn't persist modules | Function returns per-module data, persistence layer discards it |
| 5 | LogsQL query syntax invalid | Query string authored without validation against real API |
| 6 | (None new) | Self-contained component story, no cross-module data flow |
| 7 | (None new) | Integration story, but pipeline was already ~80% wired from prior stories |

Sessions 6 and 7 both avoided the pattern. Session 6 was self-contained. Session 7 was integration of existing, tested components -- the producer-consumer connections were already validated by prior stories. The pattern appears primarily in stories that create new cross-module data flows from scratch.

### Pattern 2: Silent Error Handling

No new instances in Session 7. Five+ locations remain unfixed across seven sessions.

### Pattern 3: AGENTS.md / Documentation Lag

| Session | Instance |
|---------|----------|
| 2 | AGENTS.md files not updated for new modules (code-review caught) |
| 6 | AGENTS.md not updated for 3 new files (verification caught) |
| 7 | AGENTS.md not updated for `run-helpers.ts` (code-review caught) |

Three sessions, three occurrences. This is now a systemic process failure. Code review catches it every time, but the fix should be prevention (dev task), not detection (review finding).

### Cumulative Day Totals (2026-03-20 — All 7 Sessions)

- **Stories completed:** 4 (2-1, 2-2, 2-3, 0-5-3)
- **Stories in progress:** 1 (0-5-4 at verifying)
- **Stories created:** 1 (0-5-4)
- **Epics completed:** 1 (Epic 2: Runtime Observability & Coverage Metrics)
- **HIGH bugs found by code review:** 13 (Sessions 1-6: 12, Session 7: 1)
- **MEDIUM bugs found by code review:** 7 (Sessions 1-6: 4, Session 7: 3)
- **LOW findings deferred:** 15+ across all sessions
- **Security vulnerabilities caught:** 1 (command injection, Session 4)
- **Production bugs caught by live verification:** 1 (LogsQL syntax, Session 5)
- **Verification failures requiring re-work:** 2 (proof parser in Session 1, AC3 in Session 2)
- **Stories passing verification on first attempt:** 2 (0-5-3, 2-3)
- **Phases executed:** ~22 (Sessions 1-6: ~19, Session 7: dev + code-review + session-issues = ~3)
- **Total session time:** ~4.5 hours across 7 sessions
- **Average story throughput:** ~60 minutes per completed story (4 stories in ~4 hours)
- **Test count:** 2728 passing, 96.65% overall coverage
- **AGENTS.md misses:** 3 (Sessions 2, 6, 7)

### Recommendations for Next Sprint (Final Update)

1. **Embed "update AGENTS.md" in the dev agent prompt or story template.** Three sessions of forgetting proves retrospective action items are not enough. Make it structural.
2. **Add "verify data flow end-to-end" as a mandatory dev task** for stories with cross-module data pipelines. Sessions 6-7 show it's not needed for self-contained or integration-of-existing-components stories.
3. **Complete 0-5-4 verification to close Epic 0.5.** This is the only in-progress work remaining.
4. **Schedule a dedicated tech-debt story** for silent error handling (5+ locations), deferred LOWs (15+), and pre-existing BATS failures. Seven sessions of incremental deferral confirms these will not be fixed opportunistically.
5. **Target 80% of line limits, not 100%.** `run.ts` at exactly 300 lines has zero headroom. Future extraction targets should be ~240 lines.
6. **Code review remains non-negotiable.** 13 HIGH + 7 MEDIUM bugs caught across 7 sessions. Every single session's review found real issues. The cost is 3-5 minutes per review; the value is preventing production bugs, security vulnerabilities, and data loss.
