# Epic 0 Retrospective: In-Session Sprint Execution Skill

**Epic:** Epic 0 — In-Session Sprint Execution Skill
**Date:** 2026-03-16 (revised; original retro 2026-03-15)
**Stories:** 1 (0-1-sprint-execution-skill)
**Status:** All stories done
**Previous Retro:** None (first epic)
**Sessions to close:** 4+ (implementation on 2026-03-15, then blocked across 4 sessions on 2026-03-16)

---

## Epic Summary

Epic 0 was a strategic insertion — added via sprint change proposal before any other epic was started. The goal: create a sprint execution skill (`/harness-run`) that could autonomously iterate through stories using BMAD workflows, so that codeharness could build itself. This was a bootstrap problem — the tool that automates sprint execution needed to exist before the rest of the tool could be built.

The epic delivered a single story (0-1) that replaced the Ralph-focused `commands/harness-run.md` with an in-session sprint execution loop. The skill reads `sprint-status.yaml`, orchestrates BMAD workflows (create-story, dev-story, code-review) via Agent tool with fresh context per story, handles retry logic, and produces execution summaries.

The story was implemented and code-reviewed on 2026-03-15. It reached `verified` status quickly but was then blocked for 4 consecutive sessions (2026-03-16) because 5 of its 6 ACs are integration-required — they test live Agent tool invocation and full sprint execution, which cannot be verified by CLI tooling. The algorithm deadlock this caused (sequential epic processing halting on Epic 0's blocked story, preventing access to 49 verified stories in Epics 1-11) became the catalyst for Epic 12's corrective work on unverifiable AC detection and escalation.

The story was ultimately marked `done` with 1/6 ACs verified (content inspection) and 5/6 escalated (integration-required).

---

## What Went Well

### 1. Sprint Change Proposal Process Worked

The decision to insert Epic 0 before the planned Epic 1 was the right call. The sprint change proposal was drafted, reviewed, and approved with clear impact analysis. This prevented the chicken-and-egg problem: you can't autonomously build a CLI if you don't have autonomous sprint execution yet.

### 2. Skill-as-Markdown Architecture

The key architectural insight — that the sprint execution engine is a markdown command file with instructions, not TypeScript code — proved correct. The skill leverages Claude Code's Agent tool for fresh context per story, which keeps context pollution under control. No compilation step, no runtime dependencies, immediately testable. This architecture was validated across 12 subsequent epics of autonomous execution.

### 3. Architecture Amendment Was Clean

Amending Decision 4 (Ralph Integration) to position the sprint skill as the single execution engine, with Ralph as a future session-management wrapper, was a clean separation. This avoids two competing loop implementations. Epic 5 later confirmed this: Ralph invokes `/harness-run` rather than reimplementing task picking.

### 4. Code Review Caught Real Issues

The code review cycle identified concrete improvements: moving tracking variable initialization to Step 1 (before the loop), simplifying story selection to file-order scan, adding a dev-review cycle counter (max 5) to prevent infinite loops, and adding elapsed time to the summary. These were substantive, not nitpicks.

### 5. The Deliverable Actually Worked

Despite the verification difficulties, the harness-run skill successfully executed Epics 1 through 12 autonomously. The proof is in the output: 10,800 lines of production TypeScript, 1,437+ unit tests, 95%+ statement coverage — all built by the skill this story created. The best evidence for a bootstrap tool is that it builds the rest of the system.

---

## What Could Be Improved

### 1. Story Was Unverifiable by Design

5 of 6 ACs require live Agent tool invocation and full sprint execution context. This was known from the start — the story's Dev Notes section explicitly says "This is a markdown skill — no unit tests." But nobody flagged that the verification pipeline would choke on a story where 83% of ACs are structurally unverifiable. This gap wasn't addressed until Epic 12 (Story 12-3: Unverifiable AC Detection & Escalation), 12 epics later.

### 2. Four Sessions Burned on the Same Deadlock

The harness-run algorithm processes epics sequentially. When Story 0-1 sat at `verified` with 5/6 escalated ACs, the algorithm could not promote it to `done` and could not skip to Epic 1. This caused identical deadlocks in Sessions 2, 3, and 4 on 2026-03-16:

| Session | Duration | Cost | New Information |
|---------|----------|------|-----------------|
| Session 1 (Epic 12 work) | ~90 min | ~$5+ | High — 4 bugs fixed |
| Session 2 | ~30 min | ~$1.28 | Medium — deadlock identified |
| Session 3 | ~2 min | ~$1.28 | None — pure repeat |
| Session 4+ | ~2 min | ~$1.28 | None — pure repeat |

Total wasted cost on deadlock: ~$3.84+ across Sessions 2-4, with zero progress. Ralph's automated loop amplified the problem by firing new sessions before any human could implement the fix identified in Session 2's retro.

### 3. No Automated Regression Test

The skill is a markdown file — no unit tests apply. The Docker-based smoke test used during initial verification was manual and ad-hoc. There is still no automated way to verify the skill works after changes. This remains unaddressed.

### 4. Retry/Failure Paths Not Verified

AC5 (retry/cycle logic) was verified only at the initialization level ("variables initialized correctly"). The failure path (max retries exceeded, dev-review loop stagnation) was never exercised. This is the same verification gap that applies to all integration-required ACs — the happy path works, but edge cases remain untested.

---

## Lessons Learned

### L1: Bootstrap Problems Require Insertion Epics

When the tool you're building is needed to build itself, don't fight the dependency order. Insert a minimal epic at position 0 that creates just enough capability to proceed. The sprint change proposal mechanism handled this well.

### L2: Markdown Skills Are a Different Category of Deliverable

Traditional unit tests don't apply to markdown command files. The verification pipeline (Epic 4) was designed around CLI-testable acceptance criteria — it has no lighter path for non-code deliverables. This mismatch went undetected for 12 epics until the algorithm tried to verify Story 0-1 through the standard pipeline. The fix (Epic 12's `[ESCALATE]` status and `classifyVerifiability()`) was the right structural answer, but it came too late. ACs for markdown/skill stories should be tagged `<!-- verification: integration-required -->` at story creation time, not discovered during verification.

### L3: Sequential Epic Processing With Hard Halts Is Fragile

The harness-run algorithm's design — process epics in order, halt when no actionable stories remain — is correct for the happy path but catastrophic when a single story is structurally blocked. The algorithm had no skip logic, no "done-pending-integration" status, and no awareness that 49 stories sat behind a single blocked story. This is a fundamental architectural gap in the sprint execution skill itself — the very deliverable of this epic.

### L4: Automated Loops Amplify Deadlocks

Ralph's automated loop fired Sessions 3 and 4 against a known deadlock without any pre-session check. Each session burned API cost and produced zero progress. The lesson: automated execution needs a circuit breaker — if the previous session's exit reason was "deadlock" or "blocked," refuse to start a new session unless the blocker has been resolved.

### L5: The Best Verification Is Production Use

Story 0-1's deliverable (harness-run.md) was verified more thoroughly by building 12 epics than any proof document could capture. The harness-run skill orchestrated creation and development of 60+ stories, managed epic transitions, triggered retrospectives, and handled retry logic — all in production. When a bootstrap tool's value is proven by the system it built, formal AC verification becomes ceremonial.

---

## Action Item Status (from original retro)

| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Add quality gates to `/harness-run` in Epic 4 | Done | Epic 4 (Story 4-1, 4-2, 4-3) added verification pipeline, hook enforcement, and testing gates to harness-run |
| A2 | Ralph should invoke `/harness-run`, not reimplement | Done | Epic 5 (Story 5-1) implemented Ralph as a session wrapper calling harness-run |
| A3 | Create regression test fixture for failure paths | Not done | No automated regression test exists for harness-run.md. The skill remains untested for failure paths. |
| A4 | Split complex skills into multiple stories | Partially done | Later epics used 2-5 story splits. But complex individual stories still appear (e.g., 12-1 covered three independent fix layers). |

---

## Action Items for Future Work

| # | Action | Priority | Owner | Notes |
|---|--------|----------|-------|-------|
| A1 | Add epic-skip logic to harness-run | High | Dev | When all stories in an epic are blocked/escalated, skip to next epic. This is the root cause of the 4-session deadlock. |
| A2 | Add pre-session blocker check to Ralph | High | Dev | Before invoking claude, Ralph should verify the previous session's exit reason. If "deadlock," require evidence of fix before proceeding. |
| A3 | Allow promoting stories where all verifiable ACs pass | Medium | Dev | Stories with 100% of CLI-verifiable ACs verified and remaining ACs escalated should be promotable to `done` automatically. |
| A4 | Define "documentation-only" story type | Medium | PM | Markdown/skill stories should require only content inspection, not integration testing. Lighter verification path needed. |
| A5 | Create regression test fixture for harness-run failure paths | Low | Dev | Carried from original retro A3. Still unaddressed after 12 epics. Either schedule as a story or drop. |

---

## Metrics

- **Stories planned:** 1
- **Stories completed:** 1
- **Stories failed:** 0
- **Code review cycles:** 1 (issues found and fixed in single pass)
- **Sprint change proposals:** 1 (approved)
- **Architecture amendments:** 1 (Decision 4 — Ralph as wrapper)
- **Files modified:** 3 (commands/harness-run.md, AGENTS.md, .claude/relay.yaml)
- **Files created:** 2 (exec-plan, proof document)
- **Sessions to reach done:** 4+ (1 implementation session + 3 blocked sessions before manual resolution)
- **ACs verified by CLI:** 1/6 (AC1 — content inspection)
- **ACs escalated:** 5/6 (AC2-AC6 — integration-required)
- **Estimated cost of deadlock sessions:** ~$3.84 (Sessions 2-4, zero progress)
- **Subsequent epics built by this deliverable:** 12 (Epics 1-12, 60+ stories)
