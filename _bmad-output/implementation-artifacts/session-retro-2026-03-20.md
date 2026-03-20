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
