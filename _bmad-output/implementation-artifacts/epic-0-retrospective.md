# Epic 0 Retrospective: In-Session Sprint Execution Skill

**Epic:** Epic 0 — In-Session Sprint Execution Skill
**Date:** 2026-03-15
**Stories Completed:** 1 (0-1-sprint-execution-skill)
**Status:** All stories done

---

## Epic Summary

Epic 0 was a strategic insertion — added via sprint change proposal before any other epic was started. The goal: create a sprint execution skill (`/harness-run`) that could autonomously iterate through stories using BMAD workflows, so that codeharness could build itself. This was a bootstrap problem — the tool that automates sprint execution needed to exist before the rest of the tool could be built.

The epic delivered a single story that replaced the Ralph-focused `commands/harness-run.md` with an in-session sprint execution loop. The skill reads `sprint-status.yaml`, orchestrates BMAD workflows (create-story, dev-story, code-review) via Agent tool with fresh context per story, handles retry logic, and produces execution summaries.

---

## What Went Well

### 1. Sprint Change Proposal Process Worked

The decision to insert Epic 0 before the planned Epic 1 was the right call. The sprint change proposal was drafted, reviewed, and approved with clear impact analysis. This prevented the chicken-and-egg problem: you can't autonomously build a CLI if you don't have autonomous sprint execution yet.

### 2. Skill-as-Markdown Architecture

The key architectural insight — that the sprint execution engine is a markdown command file with instructions, not TypeScript code — proved correct. The skill leverages Claude Code's Agent tool for fresh context per story, which keeps context pollution under control. No compilation step, no runtime dependencies, immediately testable.

### 3. Architecture Amendment Was Clean

Amending Decision 4 (Ralph Integration) to position the sprint skill as the single execution engine, with Ralph as a future session-management wrapper, was a clean separation. This avoids two competing loop implementations and ensures Ralph (Epic 5) will be additive rather than duplicative.

### 4. Verification in Isolated Environment

Using a Docker container for verification was a good practice for a skill that modifies sprint state. The proof document shows the full lifecycle (pre-flight, story selection, dev, review, epic completion, summary) working end-to-end with a trivial test story.

### 5. Code Review Caught Real Issues

The code review cycle identified concrete improvements: moving tracking variable initialization to Step 1 (before the loop), simplifying story selection to file-order scan, adding a dev-review cycle counter (max 5) to prevent infinite loops, and adding elapsed time to the summary. These were substantive, not nitpicks.

---

## What Could Be Improved

### 1. Story Was Large for a Single Story

Story 0.1 covered the entire sprint execution loop — 7 steps, retry logic, epic completion, retrospective triggering, failure handling, and summary reporting. For a "minimal loop skeleton," it was still substantial. In future epics, consider splitting complex skills into smaller stories (e.g., separate story for retry/failure handling).

### 2. Retry/Failure Paths Not Fully Verified

The proof document notes that AC5 (retry/cycle logic) was verified only at the initialization level ("variables initialized correctly"). The happy path was fully tested, but the failure path (max retries exceeded, dev-review loop stagnation) was not exercised in the Docker test. Future stories should include negative-path test fixtures.

### 3. No Automated Regression Test

The skill is a markdown file — no unit tests apply. But there's no automated way to verify it still works after changes. The Docker-based smoke test was manual. Consider creating a lightweight regression harness (a script that sets up a fixture sprint-status.yaml and runs the skill against it) for future modifications.

### 4. Planning Artifacts Updated Across Multiple Files

The sprint change proposal required updates to epics.md, architecture.md, prd.md, and sprint-status.yaml. This was done correctly, but the scattered nature of these updates is a process smell. If the project grows, consider whether a single-source change proposal should auto-propagate to dependent artifacts.

---

## Lessons Learned

### L1: Bootstrap Problems Require Insertion Epics

When the tool you're building is needed to build itself, don't fight the dependency order. Insert a minimal epic at position 0 that creates just enough capability to proceed. The sprint change proposal mechanism handled this well.

### L2: Agent Tool Provides Sufficient Context Isolation

The Agent tool with `subagent_type: "general-purpose"` gives each BMAD workflow a fresh context. This is adequate for story-level isolation without needing external process spawning (Ralph). The in-session approach is simpler and faster for attended development.

### L3: sprint-status.yaml as Single Task Source Is Sufficient

Using sprint-status.yaml as the sole task source (no beads, no progress.json) kept the sprint execution skill simple. The file-order scanning for story selection is deterministic and easy to reason about. This validates the architecture decision to delay beads integration until Epic 3.

### L4: Markdown Skills Need Their Own Verification Strategy

Traditional unit tests don't apply to markdown command files. The Docker-based smoke test worked but was ad-hoc. For Epic 4 (verification pipeline), establishing a repeatable verification strategy for skills/commands should be an explicit requirement.

### L5: Code Review Cycle Counter Was a Non-Obvious Requirement

The original story didn't include a max cycle count for dev-review round-trips. Code review caught this — without it, a story that keeps failing review would loop infinitely between dev and review. This is the kind of edge case that emerges only when you think through the full state machine.

---

## Action Items for Subsequent Epics

| # | Action | Target Epic | Owner |
|---|--------|-------------|-------|
| A1 | When implementing Epic 4 quality gates, add them as enhancements to the existing `/harness-run` skill — do not create a separate execution flow | Epic 4 | Dev |
| A2 | When implementing Epic 5 Ralph integration, Ralph should invoke `/harness-run` — not reimplement task picking or gate logic | Epic 5 | Dev |
| A3 | Create a regression test fixture for `/harness-run` that exercises the failure path (max retries, dev-review loop stagnation) | Epic 4 | Dev |
| A4 | Consider splitting complex skills into multiple stories in future epics (one for happy path, one for error handling) | All future | SM |

---

## Next Epic Readiness

**Epic 1: Project Scaffold & CLI Entry Point** is next in the backlog. It covers:
- Story 1-1: Project scaffold and CLI entry point
- Story 1-2: Core libraries (state, stack detection, templates)
- Story 1-3: Init command (full harness initialization)

**Prerequisites met:** The sprint execution skill (`/harness-run`) is operational and can be used to execute Epic 1 stories autonomously.

**Risks for Epic 1:**
- These are code stories (TypeScript), not markdown skills. The verification strategy shifts to unit tests + build verification.
- Story 1-3 (init command) has significant scope — it orchestrates stack detection, dependency installation, Docker setup, BMAD patching, state file creation, and plugin scaffold generation. Consider whether it needs to be broken down further during story creation.

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
