# Epic 26 Retrospective: Persistence & Resume

**Epic:** Epic 26 — Persistence & Resume
**Date:** 2026-04-07
**Stories Completed:** 4 (26-1, 26-2, 26-3, 26-4)
**Status:** All stories marked done in sprint-status.yaml
**Previous Retro:** Epic 22 (Flow Configuration Format & Parser)

---

## Epic Summary

Epic 26 implemented dual-layer persistence for the XState workflow engine: a primary XState snapshot for instant resume, and a semantic checkpoint log for config-change-resilient resume. This is epic 5 of 7 in the XState engine redesign (epics 21–27), following Epic 25's machine hierarchy (gate/story/epic/run machines).

**Story 26-1 — XState snapshot persistence** replaced the basic JSON persistence with real XState `getPersistedSnapshot()` output. Added config hash computation (SHA-256), atomic writes (tmp → rename), corrupt file detection, inspect callback wiring for automatic saves, and cleanup on success. 20 new tests. Clean implementation — no regressions.

**Story 26-2 — Snapshot resume with config hash validation** wired the resume path: on startup, load snapshot → compare config hash → if match: pass snapshot to `createActor()` for instant resume → if mismatch: discard and start fresh. Minimal code change (~15 lines in runner). Extend existing test suite.

**Story 26-3 — Semantic checkpoint log** added the second persistence layer: append-only JSONL file recording completed tasks. On config-mismatch resume, the engine reads checkpoints and skips completed tasks via guards in the story machine. The `completedTasks` set flows down the machine hierarchy (run → epic → story). Checkpoint log cleared alongside snapshot on success.

**Story 26-4 — Clear persistence on completion** consolidated cleanup into `clearAllPersistence()`, added CLI feedback ("Persistence cleared" / "Persistence preserved for resume"), handled edge cases (stale `.tmp` files, orphaned checkpoint logs, re-entry after completion, loop termination preservation).

By the end of Epic 26: 197 test files, 5221 tests passing, build clean. All three modified files under 300-line NFR18 limit (persistence: 297, runner: 214, story-machine: 232).

---

## What Went Well

### 1. Clean Story Sequencing — Each Story Built on the Previous

The 4-story sequence was well-designed:
- 26-1: Save snapshots (foundation)
- 26-2: Resume from snapshots (consumer of 26-1)
- 26-3: Checkpoint log as fallback (complements 26-2)
- 26-4: Consolidate cleanup + edge cases (polish)

Each story had clear boundaries and minimal overlap. No story needed to rework previous stories' code. This is the correct way to decompose persistence.

### 2. Story 26-1 Was a Clean First Implementation

The dev notes say "clean implementation with no regressions." 20 new tests, 6 existing test files updated for new mocks, and the module stayed at 186 lines. The atomic write pattern, corrupt file handling, and inspect callback were all implemented correctly on the first pass. This set a solid foundation for the remaining three stories.

### 3. Acceptance Criteria Were Thorough and Verifiable

Each story had 10-13 ACs with concrete verification instructions (grep patterns, file existence checks, JSON validity checks). Story 26-4's 12 ACs covered success, error, interrupt, loop termination, re-entry, orphaned files, stale temps, and resumed runs. This level of specificity reduces ambiguity and enables automated verification.

### 4. Architecture Decisions Paid Off

AD3 (dual-layer persistence) from the architecture doc directly mapped to stories 26-1/26-2 (snapshot layer) and 26-3 (checkpoint layer). The design decision to keep machines unaware of persistence (persistence is the runner's concern) meant zero changes to machine files across all 4 stories. Clean separation of concerns.

### 5. File Size Discipline Held

All three modified files stayed under the 300-line NFR18 limit:
- `workflow-persistence.ts`: 138 → 297 lines (grew 159 lines across 4 stories, still under limit)
- `workflow-runner.ts`: 163 → 214 lines (grew 51 lines)
- `workflow-story-machine.ts`: grew to 232 lines (checkpoint skip guard added in 26-3)

Total: 743 lines across 3 files for a complete dual-layer persistence system. Tight.

### 6. Test Suite Growth Without Regressions

Test count grew from ~5177 (post-26-1) to 5221 (post-26-4) — 44 new tests across the epic. Zero regressions throughout. The test-per-feature discipline remained strong.

---

## What Didn't Go Well

### 1. No Epic 26 Commits Visible in Git History

`git log --grep="26-"` returns zero commits. All Epic 26 work landed within autonomous harness runs without discrete per-story commits. This is the **same problem flagged in Epic 22's retrospective** (action item A4: "Commit epic work as discrete commits"). The pattern was not addressed.

Impact: no `git blame` traceability to specific stories, no ability to revert a single story's changes, no commit history for code review archaeology.

### 2. Story 26-2 Has No Dev Agent Record

Story 26-2's spec ends at the verification section without a "Dev Agent Record" (model used, completion notes, file list). Stories 26-1, 26-3, and 26-4 have this section. Missing dev records break post-hoc analysis of what actually happened during implementation.

### 3. Verification Proofs Missing for Story 26-1

Three verification proofs exist (26-2, 26-3, 26-4) but none for 26-1. Either 26-1 was verified but the proof wasn't saved, or it was never formally verified. Given that 26-1 is the foundation story, this is a gap.

### 4. Story 26-4 Status is "review" Not "done"

Sprint-status.yaml shows `26-4-clear-persistence-on-completion: done`, but the story spec header says `Status: review`. The status header in the story file was not updated after review passed. Minor drift, but it's the same sprint tracking inconsistency flagged in Epic 22's retrospective (pattern P3).

### 5. Acceptance Criteria for 26-4 Are All "pending"

The previous task context shows all 12 ACs for story 26-4 listed as `(pending)`. If these are genuinely pending, the story isn't verified. The verification proof exists (26-4-clear-persistence-on-completion-proof.md), so this may be a status tracking issue — but it needs confirmation.

---

## Epic 22 Retro Action Item Follow-Through

| # | Action | Status | Evidence |
|---|--------|--------|----------|
| A1 | Revert default.yaml or add runtime bridge | ✅ Resolved | Epic 24 built the compiler, Epic 25 built the machines — the full pipeline now works. The runtime bridge wasn't needed because the pipeline was completed. |
| A2 | Sync sprint-state.json | ✅ Resolved | Sprint state was cleaned up (commit `2277e6c`: "clean sprint state — remove 64 completed stories"). |
| A3 | Add runtime integration AC to template stories | ⏳ Not directly tested | No template stories in Epic 26 — not applicable this epic, but the principle should carry forward. |
| A4 | Commit epic work as discrete commits | ❌ Not addressed | Zero commits referencing `26-*` in git history. Same problem as Epic 22. |
| A5 | Set attempt threshold for story splitting (8 attempts) | ⏳ Unknown | No attempt counts documented in Epic 26 story dev records (except 26-1 which was clean). Cannot assess. |
| A6 | Fix sprint-state.json ↔ sprint-status.yaml sync | ✅ Improved | Sprint status is now auto-generated from sprint-state.json (header: "auto-generated from sprint-state.json"). The derived view problem was solved by making sprint-status a derived view. |

**Summary:** A1, A2, A6 resolved. A4 remains unaddressed (same failure mode). A3 and A5 not directly applicable but not institutionalized either.

---

## Patterns Observed

### P1: Persistence Module Approaching Size Ceiling

`workflow-persistence.ts` went from 138 to 297 lines — 3 lines from the 300-line NFR18 limit. Any future persistence feature (log rotation, compaction, versioned migrations) will require either splitting the module or raising the limit. This is a known pressure point.

### P2: Story Sequencing Discipline Improved Since Epic 22

Epic 22's retrospective flagged premature template migration (parser before runtime). Epic 26 had clean sequential dependencies — each story was buildable and testable independently. The team learned from the Epic 22 mistake.

### P3: Autonomous Harness Runs Produce Invisible Git History

Epics 22 and 26 both show zero story-level commits. The harness executes stories autonomously but doesn't create git commits per story. This makes it impossible to:
- `git log` for what a story changed
- `git revert` a single story
- Review per-story diffs
- Trace regressions to specific stories

This is now a recurring pattern across multiple epics.

### P4: Edge Case Stories Are Valuable

Story 26-4 (cleanup edge cases) covered 8 specific edge cases: stale temps, orphaned checkpoints, re-entry after completion, loop termination, resumed cleanup, etc. These are the scenarios that cause production bugs. The decision to dedicate a story to edge cases rather than sprinkling them across earlier stories was correct — it gave focused attention to failure modes.

---

## Lessons Learned

### L1: Dual-Layer Persistence Design Was Worth the Complexity

The snapshot (fast path) + checkpoint log (resilient path) design from the architecture doc proved its value. The snapshot handles normal crash recovery instantly. The checkpoint log handles the harder case (config changes between runs) gracefully. Two persistence layers is more complexity, but the user experience of "I changed my YAML and didn't lose progress" justifies it.

### L2: Machines Should Not Know About Persistence

The decision to keep all persistence logic in the runner (not in machines) meant zero changes to machine files across 4 stories. This clean boundary will make future machine refactoring (Epic 27) simpler.

### L3: Consolidation Stories (26-4) Catch Real Bugs

Story 26-4's orphaned checkpoint scenario (T6) is a real race condition: if `clearSnapshot()` succeeds but `clearCheckpointLog()` fails, the next run may incorrectly skip tasks. Without a dedicated consolidation story, this edge case would have been missed.

### L4: Atomic Writes Are Table Stakes for CLI Persistence

The write-tmp-then-rename pattern from 26-1 prevents corrupt snapshots on crash. This should be the default for all file-based persistence in the project, not just workflow snapshots.

---

## Technical Debt

| # | Debt Item | Severity | Source |
|---|-----------|----------|--------|
| D1 | `workflow-persistence.ts` at 297/300 lines — no room for growth | Medium | NFR18 ceiling |
| D2 | Legacy `workflow-state.ts` still active for phase tracking alongside new snapshot persistence | Low | Dual write path (YAML + JSON) |
| D3 | No checkpoint log compaction — log grows unbounded across interrupted runs | Low | Deferred from 26-3 |
| D4 | Gate iteration state not restored on checkpoint resume — only full task skip | Low | Acknowledged in 26-3 dev notes |
| D5 | `completedTasks` passed as `Record<string, true>` through machine inputs (Set not serializable by XState) | Low | Workaround in 26-3 |

---

## Action Items

| # | Action | Owner | Target |
|---|--------|-------|--------|
| A1 | **Create per-story git commits during harness runs** — the harness should commit after each story completes. This is the third epic where story-level commits are missing. Without this, git history is a black box. | Dev | Epic 27 |
| A2 | **Split `workflow-persistence.ts` before adding features** — at 297 lines, any addition breaks NFR18. Split into `workflow-snapshot.ts` (save/load/clear snapshot + config hash) and `workflow-checkpoint.ts` (append/load/clear checkpoint log). `clearAllPersistence` can stay in either or become a thin orchestrator. | Dev | Before persistence changes |
| A3 | **Update story 26-4 status header to "done"** — the story spec still says `Status: review`. | SM | Immediate |
| A4 | **Verify story 26-1 acceptance criteria** — no proof document exists. Either create the proof retroactively or document why it was skipped. | QA | Next session |
| A5 | **Add dev agent record to story 26-2** — missing model, completion notes, and file list. Fill in from git diff or session logs if available. | Dev | Next session |
| A6 | **Confirm 26-4 AC statuses** — all 12 ACs show "pending" in the story context. The proof exists. Update the status markers or confirm verification is complete. | QA | Immediate |

---

## Next Epic Preparation

**Epic 27: TUI Visualization** — 5 stories:
- 27-1: Pure visualizer function
- 27-2: Derive position from snapshot state path
- 27-3: Wire inspect API to visualizer
- 27-4: Sideband streaming to TUI
- 27-5: Simplify run.ts — remove hand-tracked state

**Dependencies on Epic 26:**
- 27-2 reads XState snapshot state paths (depends on 26-1's `getPersistedSnapshot()` output format)
- 27-3 wires into XState inspect API (same callback mechanism 26-1 uses for snapshot saves)
- 27-5 removes hand-tracked state because XState machines + persistence now handle it

**Preparation needed:**
- A2 (split persistence module) should happen before 27-2 if position derivation touches persistence
- Verify the XState inspect API can serve both snapshot persistence (26-1) and TUI visualization (27-3) simultaneously — may need multiple inspect handlers or a multiplexer
- `workflow-runner.ts` at 214 lines has room for 27-3/27-5 changes, but monitor closely

**Risk:** 27-5 (remove hand-tracked state) is a refactoring story that touches `run.ts` — the main CLI entry point. High-traffic file with many integration points. Should be the last story in the epic, not the first.
