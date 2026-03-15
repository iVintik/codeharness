# Exec Plan: 0-1 Sprint Execution Skill

## Story

Replace the Ralph-focused `harness-run` command with an in-session sprint execution skill that reads `sprint-status.yaml` and orchestrates BMAD workflows (create-story → dev-story → code-review) via Agent tool.

## Acceptance Criteria Summary

1. Reads sprint-status.yaml, finds current epic and next backlog story
2. Orchestrates full story lifecycle: backlog → ready-for-dev → in-progress → review → done
3. Auto-advances to next story within epic after completion
4. Handles epic completion with retrospective trigger
5. Retry logic: max 3 stagnation retries, max 5 dev↔review cycles
6. Prints summary on completion or halt

## Files Changed

| File | Change |
|------|--------|
| `commands/harness-run.md` | Complete rewrite — Ralph invocation → in-session 7-step sprint loop |
| `AGENTS.md` | Updated with session completion instructions |
| `.claude/relay.yaml` | Relay configuration update |

## Verification Plan

### How to test

Run `/harness-run` against the live sprint-status.yaml. The skill should:

1. Read sprint-status.yaml and identify `0-1-sprint-execution-skill` as current story (Epic 0)
2. Detect story status and invoke the correct workflow for that status
3. After each workflow, re-read sprint-status.yaml and verify the transition happened
4. On epic completion, trigger retrospective and advance to next epic

### Test environment options

- **Live (current project):** Run `/harness-run` directly. Risk: it will process real stories.
- **Isolated worktree:** Use `isolation: "worktree"` with Agent tool to test in a throwaway copy.
- **Docker:** Clone repo into a container with Claude Code, run the skill there.

### Evidence to capture for proof doc

- Screenshot/log of Step 1 output (sprint-status.yaml parsed correctly)
- Screenshot/log of Step 2 output (correct story identified)
- Screenshot/log of workflow invocations (Agent tool calls)
- Final sprint-status.yaml state after execution
- Step 7 summary output

## Status

- [x] Implementation complete
- [x] Code review passed (fixes applied)
- [ ] Verification run completed
- [ ] Proof document created
