# Epic 0.5 Retrospective: Stream-JSON Live Activity Display

**Epic:** Epic 0.5 — Stream-JSON Live Activity Display
**Date:** 2026-03-21
**Stories:** 4 (0-5-1 through 0-5-4)
**Status:** All stories done
**Previous Retro:** epic-0-retrospective.md (Epic 0: Live Progress Dashboard)
**Implementation window:** 2026-03-19 through 2026-03-21
**Retrospective reviewed:** 2026-03-21 (post-verification of all 4 stories)

---

## Epic Summary

Epic 0.5 replaced the buffered JSON output pipeline with real-time stream-JSON event rendering. Before this epic, `codeharness run` showed silence for minutes while Claude worked, then dumped results. After it, operators see live tool calls (with spinners), text thoughts, per-story progress breakdowns, and story completion messages — all rendered via Ink (React for terminals).

The epic was a clean four-story vertical slice through the stack:

| Story | Layer | Deliverable |
|-------|-------|-------------|
| 0-5-1 | Transport | Ralph driver switched from `--output-format json` to `stream-json` |
| 0-5-2 | Parsing | `parseStreamLine()` converts NDJSON lines to typed `StreamEvent` discriminated union |
| 0-5-3 | Rendering | Ink components for header (elapsed, sprint progress), story breakdown, story messages |
| 0-5-4 | Integration | `run.ts` wired everything together: stream pipeline, elapsed time, story statuses, ralph message parsing |

Total test count at epic completion: 2728 tests passing, 0 failures. Coverage above 95% across all touched files.

---

## What Went Well

### 1. Clean Layered Architecture

The four stories mapped exactly to four architectural layers (transport → parsing → rendering → integration). Each story was independently implementable and testable. No story required rework after a downstream story was built. The interfaces between layers (NDJSON string → StreamEvent → Ink props → terminal output) were stable from day one.

### 2. Existing Infrastructure Was Correctly Leveraged

Story 0-5-1 discovered that the claude-code driver already had partial stream-json infrastructure: `driver_supports_live_output()`, `driver_prepare_live_command()`, and `driver_stream_filter()` all existed. The story promoted stream-json from "alternative mode" to "only mode" rather than building from scratch. Similarly, 0-5-4 found that `run.ts` was already ~80% integrated (imports, line buffering, renderer calls) — only elapsed time, story statuses, and ralph message parsing needed wiring.

### 3. NFR9 (300-Line Limit) Forced Good Extraction

Story 0-5-4 hit the 300-line file limit on `run.ts` (was 358 lines). Rather than requesting an exception, the dev agent extracted `formatElapsed`, `mapSprintStatus`, `mapSprintStatuses`, `parseRalphMessage`, `countStories`, and `buildSpawnArgs` into `src/lib/run-helpers.ts`. This produced a cleaner codebase: pure functions in a helper file with 43 dedicated unit tests, `run.ts` reduced to exactly 300 lines.

### 4. Code Review Earned Its Keep (Again)

Story 0-5-4's code review found 5 issues (1 HIGH, 3 MEDIUM, 1 LOW):
- HIGH: Missing AGENTS.md entry for new `run-helpers.ts` module
- MEDIUM: Duplicate tests between `run-helpers.test.ts` and `run.test.ts`
- MEDIUM: Polling interval code untested (AC #6 and #7 only tested for initial call)
- LOW: Misleading test name (`defaults to 3` when actual default was `10`)

All but one were fixed before verification. The polling interval gap was a real coverage hole — `vi.useFakeTimers()` test was added to exercise the `setInterval` callback.

### 5. Ink Component Enhancement Was Non-Destructive

Story 0-5-3 added three new capabilities (elapsed time in header, story breakdown section, story completion messages) without modifying any existing component behavior. All 29 pre-existing tests continued to pass. Both files stayed under 300 lines (ink-components.tsx: 228, ink-renderer.tsx: 202).

### 6. Story 0-5-1 Verified Cleanly — First Try

The driver change was the highest-risk story (modifying ralph's core output format). Session issues log: "Clean verification — all 4 ACs passed without issues." The detailed error detection analysis in the story's dev notes (proving that NDJSON wouldn't cause false positives in ralph's grep-based error detection) was accurate and saved debugging time.

---

## What Could Be Improved

### 1. Story 0-5-2 Verification Was Painful

The stream event parser had the most verification friction of any story in the epic:

- **Non-standard status:** Sprint status showed `verified` (not a valid lifecycle status); the story file said `in-progress`. The verifier had to guess the actual state.
- **Export gap:** `parseStreamLine` was not exported from `src/index.ts`, making it inaccessible in the container's dist bundle. Required adding re-export and rebuild before container verification could proceed.
- **ESM import workaround:** Container verification required `VITEST=1` env var to suppress CLI auto-parse on module import, plus `node --input-type=module` for ESM. This is a recurring friction point.
- **VictoriaLogs blind spot:** Zero log events returned for parser invocations — `parseStreamLine` is a pure function with no telemetry.
- **Not CLI-accessible:** `parseStreamLine()` is tree-shaken out of the main package bundle. Black-box Docker verification was impossible. Had to fall back to `unit-testable` verification tier — which the story didn't originally tag.
- **Verify command bug:** `codeharness verify` returned `[FAIL] Proof quality check failed: 6/6 ACs verified` — reporting FAIL when all ACs passed. This is a presentation bug in the verify tool itself.
- **Pre-commit gate:** `verification_run: false` in session_flags blocked the commit. Required manual sed override of `.claude/codeharness.local.md`.
- **Duplicate verification commit:** Two commits exist for 0-5-2 (d856e6f and ebe5375), suggesting the first verification attempt failed or was incomplete.

A pure-function library with zero side effects should not require this much ceremony to verify.

### 2. Epic Origin Was Unauthorized

The create-story agent for Story 2-1 injected Epic 0.5 into `sprint-status.yaml` without authorization — a process violation flagged in the 2026-03-20 session retro. The epic itself was good work that needed doing, but the insertion bypassed the sprint change proposal process that Epic 0 had established. This sets a bad precedent: subagents modifying sprint scope during story creation.

### 3. Story Status Inconsistencies

Multiple stories had status mismatches between `sprint-status.yaml` and their story files. Story 0-5-2 showed `verified` in sprint status but `in-progress` in the story file. Story 0-5-3 showed `verifying` in the story file while marked `done` in sprint status. These discrepancies force manual reconciliation during verification and retrospectives.

### 4. No End-to-End Integration Test

The epic has strong unit test coverage at each layer, but no automated test verifies the full pipeline: spawn ralph with stream-json → NDJSON stdout → `parseStreamLine()` → Ink renderer → terminal output. Each layer was tested in isolation against mocks. The integration between layers relies on type contracts and manual observation during `codeharness run`. An E2E test with a mock NDJSON source piping through the full renderer would catch contract drift.

---

## Lessons Learned

### L1: Vertical Slices Through the Stack Work Well for Pipeline Features

The transport → parsing → rendering → integration decomposition mapped cleanly to stories. Each story had a single responsibility, clear inputs/outputs, and could be tested independently. This pattern should be reused for future pipeline features.

### L2: Pure-Function Libraries Need a Lighter Verification Path

Story 0-5-2 (`parseStreamLine`) is a stateless function with zero side effects, zero I/O, and zero dependencies beyond TypeScript types. Forcing it through black-box Docker verification is wasteful. The `<!-- verification-tier: unit-testable -->` tag exists but wasn't applied at story creation time. Stories should be tagged with their verification tier during planning, not discovered during verification.

### L3: Tree-Shaking Affects Verification Strategy

Internal library functions that aren't exported from the package entry point get tree-shaken from the built bundle. This makes them invisible to black-box testing (Docker container running the installed package). Any story producing internal-only library code should be tagged `unit-testable` and should not attempt Docker verification.

### L4: The `codeharness verify` Tool Has a Presentation Bug

The verify tool reports `[FAIL]` when all ACs pass if the story has other metadata issues (missing proof doc, etc.). This is confusing and has now been encountered in multiple stories. The FAIL/PASS determination should be based strictly on AC pass rate, not ancillary checks.

### L5: Enhance-Don't-Rewrite Produces Better Outcomes

Story 0-5-3 explicitly instructed "enhance, don't rewrite" for the Ink components. The result: 18 new tests, zero regressions, files stayed under size limits. This stands in contrast to earlier sprint stories where rewrites introduced cascading failures. The pattern of adding new components alongside existing ones, with additive state, is safer than restructuring.

---

## Metrics

- **Stories planned:** 4
- **Stories completed:** 4
- **Stories failed:** 0
- **Code review cycles:** 1 per story (4 total; all passed on first review cycle)
- **Total new tests:** ~167 (28 BATS + 32 TS in 0-5-1; ~30 in 0-5-2; 18 in 0-5-3; 86 in 0-5-4)
- **Test suite at completion:** 2728 tests, 0 failures
- **Coverage:** 95%+ across all touched files; per-file floor above 80%
- **Files created:** 3 (stream-parser.ts, run-helpers.ts, run-helpers.test.ts)
- **Files modified:** ~10 (claude-code.sh, ralph.sh, run.ts, run.test.ts, ink-components.tsx, ink-renderer.tsx, ink-renderer.test.tsx, driver_claude_code.bats, stream-parser.test.ts, AGENTS.md)
- **NFR9 violations:** 0 (run.ts trimmed from 358 to 300 lines via extraction)
- **Implementation window:** 3 days (2026-03-19 to 2026-03-21)

---

## Action Items

| # | Action | Priority | Notes |
|---|--------|----------|-------|
| A1 | Fix `codeharness verify` presentation bug — FAIL on 6/6 pass | High | Encountered in 0-5-2 and other stories. FAIL/PASS should reflect AC pass rate only. |
| A2 | Tag stories with `verification-tier` at planning time | High | 0-5-2 was discovered as unit-testable during verification. Tag should be set in epic planning. |
| A3 | Add E2E test for stream-JSON → parser → renderer pipeline | Medium | Mock NDJSON source, pipe through full pipeline, assert terminal output. Currently untested integration. |
| A4 | Enforce sprint change proposal for scope additions | Medium | Epic 0.5 was injected by a subagent without authorization. Process guard needed. |
| A5 | Fix story-status synchronization between sprint-status.yaml and story files | Medium | Multiple stories had mismatched statuses. Either automate sync or pick one source of truth. |
| A6 | Remove `verification_run` pre-commit gate or make it context-aware | Low | Gate blocked a legitimate commit in 0-5-2. Manual sed override is not a process. |
| A7 | Add integration test for package entry point exports | High | `parseStreamLine` was missing from `src/index.ts`. A test importing from `dist/` and asserting all public API functions exist would catch this. |
| A8 | Split package entry point into library + CLI bootstrap | Medium | Eliminates the `VITEST=1` container workaround. Benefits all future container verification and programmatic use. |
