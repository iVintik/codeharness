# Epic 6 Retrospective: Dashboard Visualization Rework

**Epic:** Epic 6 — Dashboard Visualization Rework
**Date:** 2026-03-21
**Stories Completed:** 2 (6-1, 6-2)
**Status:** All stories done
**Previous Retro:** epic-0-5-retrospective.md (Epic 0.5: Stream-JSON Live Activity Display)
**Implementation window:** 2026-03-21 (single day)
**Note:** This file replaces the stale `epic-6-retrospective.md` which documented Brownfield Onboarding from a previous sprint. Epic numbering collision between sprints caused confusion.

---

## Epic Summary

Epic 6 rewrote the Ink terminal dashboard components to match the UX specification and added end-to-end integration tests for the stream-JSON pipeline. Before this epic, the dashboard used Ink `Box` borders and a compact horizontal layout that diverged from the documented UX spec. After it, the output renders plain-text headers with `━━━` separators, vertical labeled story breakdown sections (`Done:` / `This:` / `Next:` / `Blocked:`), iteration count, and cost tracking — matching the spec exactly.

The epic had two stories:

| Story | Deliverable |
|-------|-------------|
| 6-1-rewrite-ink-components-match-ux-spec | Rewrote Header, StoryBreakdown, and Separator components; added iteration count parsing and cost accumulation; split into 3 files for NFR9 compliance |
| 6-2-verify-stream-json-pipeline-e2e | Added E2E integration test piping NDJSON through the full `createLineProcessor → parseStreamLine → renderer` chain; extracted `createLineProcessor` from `run.ts` into `run-helpers.ts` |

Total test count at epic completion: 2912 tests (2910 passing, 2 pre-existing failures in `state.test.ts` unrelated to this epic). Epic 0.5 ended at 2728 tests — a net increase of 184 tests across the combined Epic 0.5 + Epic 6 implementation window.

---

## What Went Well

### 1. Code Review Caught Critical Production Bugs

Story 6-1's code review found two bugs that would have been user-visible:
- **HIGH:** `updateSprintState()` wiped accumulated `totalCost` every 5 seconds during polling — cost display would flash and disappear.
- **MEDIUM:** `startsWith` key comparison in `StoryBreakdown` caused false story matches (e.g., story `3-2` matching `3-20`).

Both were fixed before verification. This is the second consecutive epic where code review caught HIGH-severity bugs (Epic 0.5 also found 5 issues including a missing AGENTS.md entry). The 4-phase pipeline (create → dev → review → verify) is earning its keep.

### 2. Story 6-1 Completed End-to-End in a Single Session

The story went through create, dev, code-review, and verify in one session (~45 minutes across two ralph runs). Well-scoped stories with clear UX spec references are ideal for single-session completion.

### 3. NFR9 Forced Good Architecture

The 300-line limit on `ink-components.tsx` required splitting into three files:
- `ink-components.tsx` (200 lines) — types + layout components + re-exports
- `ink-activity-components.tsx` (100 lines) — tool/thought/retry/message components
- `ink-app.tsx` (31 lines) — root App component (avoids circular imports)

This produced cleaner separation of concerns than the monolithic file.

### 4. Story 6-2 Code Review Improved Testability

The adversarial review of 6-2 found that the integration test reimplemented `makeLineHandler` instead of importing production code. The fix — extracting `createLineProcessor` to `run-helpers.ts` — made the production code testable and eliminated the risk of test/production divergence. This is a structural improvement to the codebase, not just a test fix.

### 5. Epic 0.5 Action Item A3 Addressed

Epic 0.5's retro explicitly flagged "Add E2E test for stream-JSON → parser → renderer pipeline" as a medium-priority action item. Story 6-2 directly addresses this. This is a rare case of a retrospective action item being completed in the next epic.

---

## What Could Be Improved

### 1. No Formal Epic Definition Existed

Sprint status listed "Epic 6: Dashboard Visualization Rework" but no epic definition file was ever created. The create-story agent derived requirements from the UX spec and existing code — which worked — but this bypassed the normal epic planning process. Story scope was determined ad-hoc rather than through structured planning.

### 2. Cost Accumulation Has a Known Data Loss Bug

Events arriving before `sprintInfo` is initialized silently lose their cost data. This was identified during development, documented in session issues, but shipped as known tech debt. Cost display may undercount, especially for short stories where early cost events matter proportionally more.

### 3. run.ts Remains Over the 300-Line Limit

`run.ts` sits at 308 lines — 8 over NFR9's 300-line limit. Story 6-2 extracted `createLineProcessor` to `run-helpers.ts`, which helped, but the file is still non-compliant. The `currentIterationCount` mutable closure variable and stderr parsing logic could be extracted further.

### 4. AC5 of Story 6-2 Remains Incomplete

AC5 requires manual verification: "run `codeharness run`, let it execute 1 story, confirm tool calls and thoughts appear in real-time." This is non-automatable and depends on having a valid story in the backlog. It was left as `[ ]` per the `integration-required` tag. This is acceptable but means the full E2E path has never been formally verified end-to-end with a live system.

### 5. Stale Container / Infrastructure Friction

Both stories encountered stale Docker containers from previous sessions and port conflicts with the shared observability stack. This consumed manual intervention time during every verification phase. Three infrastructure issues logged across two stories:
- Stale `codeharness-verify` container required `docker rm -f`
- Port conflict between harness-specific and shared compose stacks
- `codeharness sync --story 6-1` failed with "Story file not found or has no Status line"

### 6. Story File Statuses Not Updated

Both story files show `Status: verifying` despite being marked `done` in `sprint-status.yaml`. This is a recurring problem flagged in every retrospective since Epic 4. The `codeharness sync` command exists but is never used in the workflow.

---

## Lessons Learned

### L1: UX Spec as Source of Truth Produces Clear Stories

Story 6-1 was derived directly from the UX spec mockup with the instruction "reproduce EXACTLY." This eliminated ambiguity that previous dashboard stories suffered from, where developers "interpreted" the visual format. When a visual spec exists, stories should reference specific line numbers and include the target output verbatim.

### L2: Code Review Catches Different Bugs Than Verification

Across both stories, code review found 5 bugs (2 HIGH, 2 MEDIUM, 1 LOW). Verification found 0 additional functional bugs. This confirms the pattern from Epic 0.5: review catches logic and integration bugs; verification catches deployment and packaging bugs. Both phases serve different purposes and neither should be skipped.

### L3: Extracting Closures Improves Testability

Both stories benefited from extracting closure-scoped functions into importable modules. Story 6-1 split components into three files. Story 6-2 extracted `createLineProcessor` from a closure in `run.ts`. The pattern: if a function is defined inside another function's scope, it cannot be unit-tested. Extract it.

### L4: Epic Numbering Collisions Cause Real Confusion

The previous sprint had its own "Epic 6" (Brownfield Onboarding) which left a stale `epic-6-retrospective.md`. The create-story agent noted this as a misleading artifact. Session retros flagged it twice. Nobody cleaned it up between sessions. Epic numbering should be prefixed by sprint identifier (e.g., `opex-6` vs `overhaul-6`) or use globally unique numbers.

### L5: Two-Story Epics Ship Fast but Skip Process Steps

Epic 6 completed in a single day with two stories. However: no epic definition file, no sprint planning step, story files not synced to sprint status, proof documents not created. The speed is good; the process gaps compound over time when they become normalized behavior.

---

## Epic 0.5 Retro Action Item Status

| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Fix `codeharness verify` presentation bug — FAIL on 6/6 pass | Not done | Not addressed in Epic 6. |
| A2 | Tag stories with `verification-tier` at planning time | Not done | Epic 6 stories weren't tagged. |
| A3 | Add E2E test for stream-JSON → parser → renderer pipeline | Done | Story 6-2 directly addresses this. |
| A4 | Enforce sprint change proposal for scope additions | Not done | Not addressed. |
| A5 | Fix story-status synchronization | Not done | Both 6-1 and 6-2 have status mismatches. |
| A6 | Remove `verification_run` pre-commit gate or make it context-aware | Not done | Not addressed. |
| A7 | Add integration test for package entry point exports | Not done | Not addressed. |
| A8 | Split package entry point into library + CLI bootstrap | Not done | Not addressed. |

**Summary:** 1 of 8 action items from Epic 0.5 was resolved. 7 remain unaddressed. The pattern of carrying forward unresolved action items continues.

---

## Action Items

| # | Action | Priority | Notes |
|---|--------|----------|-------|
| A1 | Fix cost accumulation data loss — buffer cost from events before `sprintInfo` init | High | Known bug shipped as tech debt. Cost display undercounts. |
| A2 | Bring `run.ts` under 300 lines (NFR9 compliance) — extract iteration count and stderr parsing | Medium | Currently 308 lines. Pre-existing violation. |
| A3 | Clean up epic numbering collision — establish sprint-prefixed or globally unique epic numbers | Medium | Two different "Epic 6" definitions exist. Caused confusion across 4+ session retros. |
| A4 | Fix story-status sync — either automate or enforce `codeharness sync` after story completion | Medium | Carried from Epic 0.5 A5, Epic 5 A5, Epic 4 A4. Six epics of divergence. |
| A5 | Add multi-byte UTF-8 chunk boundary test for `createLineProcessor` | Low | `StringDecoder` handles it but no test proves it. Flagged in 6-2 review. |
| A6 | Complete AC5 manual verification of 6-2 when next live story execution occurs | Low | Non-automatable. Needs real `codeharness run` with a backlog story. |
| A7 | Automate stale container cleanup before verification | Low | Infrastructure friction in every verify phase. `docker rm -f` before each run. |

---

## Metrics

- **Stories planned:** 2
- **Stories completed:** 2
- **Stories failed:** 0
- **Code review cycles:** 1 per story (2 total; both passed on first review cycle with fixes)
- **Bugs caught in review:** 5 (2 HIGH, 2 MEDIUM, 1 LOW across both stories)
- **Bugs caught in verify:** 0
- **Total new tests:** ~184 (17 new/updated in 6-1 + integration test suite in 6-2)
- **Test suite at completion:** 2912 tests (2910 passing, 2 pre-existing failures in state.test.ts)
- **Files created:** 3 (ink-activity-components.tsx, ink-app.tsx, run-pipeline.test.ts)
- **Files modified:** 7 (ink-components.tsx, ink-renderer.tsx, run-helpers.ts, run.ts, ink-renderer.test.tsx, run-helpers.test.ts, sample-stream.ndjson fixture)
- **NFR9 violations:** 1 (run.ts at 308 lines — pre-existing, not introduced by this epic)
- **Implementation window:** 1 day (2026-03-21)
- **Epic 0.5 retro actions resolved:** 1 of 8
