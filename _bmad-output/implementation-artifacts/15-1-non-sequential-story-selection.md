# Story 15.1: Non-Sequential Story Selection

Status: review

## Story

As a developer using codeharness,
I want harness-run to select stories by readiness across all epics instead of processing epics sequentially,
So that a single stuck story in an early epic doesn't block 40+ verifiable stories in later epics.

## Acceptance Criteria

1. **Given** sprint-status.yaml has stories at `verifying` across multiple epics and some are retry-exhausted, **When** harness-run selects the next story, **Then** it scans ALL epics (not just the first non-done one) and skips retry-exhausted stories. <!-- verification: cli-verifiable -->

2. **Given** multiple actionable stories exist across epics, **When** harness-run prioritizes them, **Then** it processes in this order: (a) stories with existing proof documents needing only validation, (b) stories at `in-progress` or `review`, (c) stories at `verifying` without proofs, (d) stories at `backlog` or `ready-for-dev`. <!-- verification: cli-verifiable -->

3. **Given** a story is retry-exhausted (count >= max_retries in `ralph/.story_retries`), **When** harness-run encounters it, **Then** it prints `[INFO] Skipping {story_key}: retry-exhausted ({count}/{max})` and moves to the next actionable story. It does NOT halt the sprint. <!-- verification: cli-verifiable -->

4. **Given** a story has a proof document with `escalated > 0` and `pending === 0`, **When** harness-run encounters it, **Then** it skips it as blocked (existing behavior preserved). <!-- verification: cli-verifiable -->

5. **Given** no actionable stories remain anywhere in the sprint, **When** harness-run finishes scanning, **Then** it goes to Step 7 (summary) with result `NO_WORK` — not `HALTED_ON_FAILURE`. <!-- verification: cli-verifiable -->

6. **Given** harness-run completes a story, **When** it returns to Step 2, **Then** it re-scans all epics for the next actionable story (not just the current epic). Epic completion (Step 5) still triggers when all stories in an epic reach `done`. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Rewrite Step 2 of `commands/harness-run.md` (AC: #1, #2, #3, #4, #5, #6)
  - [x] 1.1: Replace "Find current epic → find next story in current epic" with cross-epic scan
  - [x] 1.2: Add retry-exhausted check: read `ralph/.story_retries`, parse `{key}={count}` format, skip if count >= max_retries
  - [x] 1.3: Add prioritization logic: proof-exists > in-progress/review > verifying > backlog
  - [x] 1.4: Preserve blocked-story skip logic (escalated > 0 and pending === 0)
  - [x] 1.5: Change "no actionable stories" outcome from HALT to NO_WORK summary
  - [x] 1.6: Update Step 4 (Story Complete) to go back to Step 2 cross-epic scan instead of checking only current epic

- [x] Task 2: Update Step 6 (Failure Handling) (AC: #3, #5)
  - [x] 2.1: Change from "halt sprint" to "skip story, go to Step 2 for next actionable"
  - [x] 2.2: Only go to Step 7 when Step 2 finds zero actionable stories

- [x] Task 3: Update Step 7 summary to distinguish NO_WORK from HALTED_ON_FAILURE (AC: #5)
  - [x] 3.1: Add `stories_skipped` counter alongside `stories_completed` and `stories_failed`
  - [x] 3.2: Print skipped stories with reasons in the summary

## Dev Notes

### This Is a Skill File, Not TypeScript

All changes are to `commands/harness-run.md` — a Claude Code slash command. No TypeScript code. No unit tests. The "logic" is instructions the agent follows.

### Key File

| File | Purpose |
|------|---------|
| `commands/harness-run.md` | **TARGET** — the skill file to modify |
| `ralph/.story_retries` | Read-only — check retry counts. Format: `{key}={count}` per line |

### What the Current Step 2 Does (to be replaced)

```
1. Find current epic: first epic-N where status != done
2. Find next story in current epic: first N-M-slug where status != done and actionable
3. If no actionable in current epic: skip to next epic or halt
```

### What the New Step 2 Should Do

```
1. Collect ALL stories across ALL epics (ignore epic boundaries)
2. Filter: remove done, remove retry-exhausted, remove blocked (escalated)
3. Prioritize: proof-exists-needs-validation > in-progress/review > verifying > backlog
4. Take first from prioritized list
5. If empty list: go to Step 7 with NO_WORK
```

### How to Check "proof exists needs validation"

A story at `verifying` has an existing proof if `verification/{story_key}-proof.md` exists. To check if it just needs validation (vs. already validated), run `codeharness verify --story {story_key} --json` and check the output. If it returns `pending=0, escalated=0` → done (shouldn't still be at verifying). If it errors or hasn't been run → needs validation.

The simplest heuristic: if the file exists, it's a quick win. Try validation first. If it fails, fall through to full Docker verification.

### Retry-Exhausted Check

Read `ralph/.story_retries`. Each line is `{story_key}={count}`. If count >= max_retries (3), the story is retry-exhausted. Skip it and print info message.

### Epic Completion Still Works

Even though story selection is cross-epic, epic completion (Step 5) still triggers. After a story completes, Step 4 checks if all stories in that story's epic are done. If yes, run retrospective and mark epic done. Then Step 2 re-scans for the next story across all epics.

### What NOT To Change

- Step 1 (pre-flight) — unchanged
- Step 3 (execute story lifecycle) — unchanged
- Step 5 (epic completion) — unchanged (but triggered differently)
- Step 8 (session retrospective) — unchanged
- Subagent issues tracking — unchanged

### References

- [Source: sprint-change-proposal-2026-03-17.md — Section 4.1, 4.2, 4.3]
- [Source: session-retro-2026-03-17.md — Action items A5, A19]
- [Source: commands/harness-run.md — current Step 2, Step 4, Step 6]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/15-1-non-sequential-story-selection.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (N/A — markdown skill, no executable code)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (commands module — if AGENTS.md references Step 2 logic)
- [ ] Exec-plan created in `docs/exec-plans/active/15-1-non-sequential-story-selection.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code (N/A — markdown skill)
- [ ] Integration tests for cross-module interactions (N/A — markdown skill)
- [ ] Coverage target: N/A
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
N/A — markdown skill file, no executable code

### Completion Notes List
- All 3 tasks completed: Step 2 rewrite (cross-epic scan with prioritization), Step 6 (skip instead of halt), Step 7 (stories_skipped counter and NO_WORK result)
- Step 4 updated to route back to Step 2 cross-epic scan
- Step 5 updated to return to Step 2 instead of self-managing next-epic logic
- Step 1 updated with stories_skipped and skipped_reasons tracking variables
- HALTED_ON_FAILURE result removed entirely — replaced by NO_WORK

### Change Log
- 2026-03-17: Initial implementation of all tasks

### File List
- `commands/harness-run.md` — primary target, all changes here
- `_bmad-output/implementation-artifacts/15-1-non-sequential-story-selection.md` — story file updated
