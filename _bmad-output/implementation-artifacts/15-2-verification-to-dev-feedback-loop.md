# Story 15.2: Verification-to-Dev Feedback Loop

Status: review

## Story

As a developer using codeharness,
I want verification failures that reveal code bugs to automatically trigger a dev cycle with the specific findings,
So that the system fixes problems instead of blindly retrying the same broken verification.

## Acceptance Criteria

1. **Given** a verification proof has `pending > 0` (some ACs failed), **When** harness-run processes the result, **Then** it reads the proof document, extracts the failing ACs and their error descriptions, and saves them to the story file under a `## Verification Findings` section. <!-- verification: cli-verifiable -->

2. **Given** verification found code bugs (pending > 0), **When** the story is sent back to dev, **Then** harness-run updates sprint-status.yaml from `verifying` to `in-progress`, resets the retry count to 0 in `ralph/.story_retries`, and prints `[WARN] Story {key}: verification found {N} failing ACs — returning to dev`. <!-- verification: cli-verifiable -->

3. **Given** a story returns to dev after verification findings, **When** the dev-story subagent is invoked (Step 3b), **Then** the prompt includes the verification findings: "The following ACs failed verification. Fix the code to make them pass: {list of failing ACs with error descriptions}". The dev agent has full context of what went wrong. <!-- verification: integration-required -->

4. **Given** a verification failure is an infrastructure issue (timeout, no proof produced, docker error — NOT code bugs), **When** retry_count >= max_retries, **Then** the story is skipped (not halted) and harness-run continues to the next actionable story via Step 2. <!-- verification: cli-verifiable -->

5. **Given** a verification failure is an infrastructure issue, **When** retry_count < max_retries, **Then** harness-run retries from step 3d-iv (existing behavior). Only infrastructure failures count against the retry budget. <!-- verification: cli-verifiable -->

6. **Given** a story cycles through verify → dev → verify multiple times, **When** the verify→dev cycle count reaches 10, **Then** harness-run prints `[WARN] Story {key}: verify↔dev cycle limit reached — skipping` and moves to the next story. This prevents infinite loops where dev can't fix what verification finds. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Rewrite Step 3d-vii (retry logic) in `commands/harness-run.md` (AC: #1, #2, #4, #5)
  - [x] 1.1: Split failure handling into two paths: "proof has pending > 0" vs "infrastructure failure"
  - [x] 1.2: For pending > 0: read proof, extract failing ACs, save to story file, set status to in-progress, reset retries
  - [x] 1.3: For infra failures: increment retry_count, skip if exhausted (go to Step 2, not Step 7)
  - [x] 1.4: Remove the old "halt sprint" behavior entirely — never halt on a single story

- [x] Task 2: Update Step 3b (dev-story) prompt to include verification findings (AC: #3)
  - [x] 2.1: Before invoking dev-story, check if the story file has a `## Verification Findings` section
  - [x] 2.2: If findings exist, append them to the dev-story prompt so the dev agent knows what to fix
  - [x] 2.3: After dev completes and story goes back to review→verifying, the findings section stays for reference

- [x] Task 3: Add verify↔dev cycle counter (AC: #6)
  - [x] 3.1: Add `verify_dev_cycles = 0` to tracking variables in Step 1
  - [x] 3.2: Increment when verification sends story back to dev (in the new 3d-vii pending>0 path)
  - [x] 3.3: If verify_dev_cycles >= 10 for a story, skip it instead of looping forever
  - [x] 3.4: Reset verify_dev_cycles when moving to a new story

## Dev Notes

### This Is a Skill File, Not TypeScript

All changes are to `commands/harness-run.md`. No TypeScript code.

### Key Design Decision: Code Bugs vs Infra Failures

The critical distinction:
- **Code bugs** (pending > 0 in proof): the feature doesn't work. Fix the code. Never counts against retry budget. Goes back to dev with findings.
- **Infrastructure failures** (timeout, docker error, no proof): transient issue. Retry, then skip after max_retries. These DO count against retry budget.

This means a story with real code bugs can cycle through verify→dev→verify many times without hitting the retry limit. The verify↔dev cycle counter (AC #6) is the safety valve for that loop.

### How to Extract Failing ACs from Proof

The proof document format is:
```markdown
## AC N: description

```bash
docker exec codeharness-verify <command>
```

```output
<output showing failure>
```
```

Look for AC sections where the verdict is not PASS and not [ESCALATE]. Those are the failing ACs. Extract the AC number, description, and the error output.

### Interaction with Story 15-1

15-1 changes Step 2 (story selection) and Step 6 (skip not halt). 15-2 changes Step 3d-vii (verification failure handling) and Step 3b (dev prompt). These are independent sections of harness-run.md — no merge conflicts expected. But 15-2's "skip to next story" in the infra-failure path uses Step 2's new cross-epic selection from 15-1.

**Implementation order: 15-1 first, then 15-2.** 15-2 depends on 15-1's "go to Step 2 for next story" behavior.

### What Changes in harness-run.md

| Section | Change |
|---------|--------|
| Step 1 (pre-flight) | Add `verify_dev_cycles` tracking variable |
| Step 3b (dev-story) | Check for `## Verification Findings` in story file, include in prompt |
| Step 3d-vii (retry logic) | Complete rewrite — split into code-bug vs infra-failure paths |
| Step 6 (failure handling) | Already changed by 15-1 to skip-not-halt |

### References

- [Source: sprint-change-proposal-2026-03-17.md — Section 4.2 (updated)]
- [Source: session-retro-2026-03-17.md — Action items A4, A11]
- [Source: commands/harness-run.md — Step 3d-vii, Step 3b]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/15-2-verification-to-dev-feedback-loop.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (N/A — markdown skill, no executable code)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (commands module)
- [ ] Exec-plan created in `docs/exec-plans/active/15-2-verification-to-dev-feedback-loop.md`

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
- All 3 tasks completed: Step 3d-vii rewrite (Path A/B split), Step 3b verification findings injection, verify_dev_cycles counter
- No TypeScript code changed — all edits to commands/harness-run.md
- Story 15-1 changes (Step 2, Step 6) are intact and unmodified

### Change Log
- `commands/harness-run.md` Step 1: Added `verify_dev_cycles` and `max_verify_dev_cycles` tracking variables
- `commands/harness-run.md` Step 2: Added `verify_dev_cycles = 0` to per-story counter reset
- `commands/harness-run.md` Step 3b: Added pre-check for `## Verification Findings` section, conditional inclusion in dev-story prompt
- `commands/harness-run.md` Step 3d-vii: Complete rewrite — split into Path A (code bugs: extract findings, save to story, return to dev, reset retries) and Path B (infra failures: increment retry, skip if exhausted, go to Step 2)

### File List
- `commands/harness-run.md` — primary change target (slash command definition)
- `_bmad-output/implementation-artifacts/15-2-verification-to-dev-feedback-loop.md` — story file (status + task checkboxes)
