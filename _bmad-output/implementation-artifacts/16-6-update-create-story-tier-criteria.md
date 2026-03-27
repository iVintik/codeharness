# Story 16-6: Update create-story Prompt with Tier Criteria
<!-- verification-tier: test-provable -->

## Status: backlog

## Story

As a codeharness developer,
I want the create-story prompt in harness-run Step 3a to include explicit tier decision criteria and examples,
So that the agent tags each AC with the correct `VerificationTier` consistently instead of guessing.

## Acceptance Criteria

- [ ] AC1: Given harness-run Step 3a prompt, when inspected, then it contains a decision tree with four tiers: `test-provable`, `runtime-provable`, `environment-provable`, `escalate` <!-- verification: test-provable -->
- [ ] AC2: Given the decision tree, when inspected, then it includes at least 4 concrete AC examples (one per tier) showing the Given/When/Then and which tier to assign <!-- verification: test-provable -->
- [ ] AC3: Given the Step 3a prompt, when inspected, then the tag format instruction reads `<!-- verification: {tier} -->` with `{tier}` being one of the four new tier names <!-- verification: test-provable -->
- [ ] AC4: Given the Step 3a prompt, when inspected, then it no longer references `cli-verifiable` or `integration-required` as valid tier names for NEW stories (old tags are only for backward compat in parsing) <!-- verification: test-provable -->
- [ ] AC5: Given the decision tree, when inspected, then `test-provable` criteria include: code structure, types, file existence, test passing, documentation, config changes, refactoring <!-- verification: test-provable -->
- [ ] AC6: Given the decision tree, when inspected, then `runtime-provable` criteria include: running the built application, CLI output, API endpoint behavior, exit codes <!-- verification: test-provable -->
- [ ] AC7: Given the decision tree, when inspected, then `environment-provable` criteria include: Docker, databases, observability stack, multiple services, distributed systems <!-- verification: test-provable -->
- [ ] AC8: Given the decision tree, when inspected, then `escalate` criteria include: physical hardware, human visual judgment, paid external services, GPU <!-- verification: test-provable -->

## Technical Notes

**File:** `commands/harness-run.md`

**Step 3a prompt (L157-L172):** Replace the current AC tagging instruction:

Current (L158):
```
For each AC, append `<!-- verification: cli-verifiable -->` or `<!-- verification: integration-required -->` based on whether the AC can be verified by running CLI commands in a subprocess. ACs referencing workflows, sprint planning, user sessions, or external system interactions should be tagged as integration-required.
```

Replace with the decision tree from the tech spec:

```
For each AC, determine the verification tier and append the tag:

Is this AC about code structure, types, file existence, test passing, config, refactoring, or documentation?
-> test-provable

Does this AC require running the built application and checking its output/behavior (CLI commands, API endpoints, exit codes)?
-> runtime-provable

Does this AC require Docker, databases, observability stack, message queues, or multiple services running together?
-> environment-provable

Does this AC require physical hardware, human visual judgment, GPU rendering, or paid external services?
-> escalate

Tag format: <!-- verification: {tier} -->

EXAMPLES:
- 'Given function X exists, when called with Y, then returns Z' -> test-provable (unit test proves it)
- 'Given the CLI is run with --flag, when output is checked, then it shows X' -> runtime-provable (need to run the binary)
- 'Given the server is running, when POST /api/users is called, then logs appear in VictoriaLogs' -> environment-provable (needs observability stack)
- 'Given the game renders at 60fps on a 4K display' -> escalate (needs GPU hardware)
```

## Files to Change

- `commands/harness-run.md` — Replace AC tagging instruction in Step 3a prompt (around L158) with four-tier decision tree and examples.
