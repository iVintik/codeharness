# Story 16-5: Rewrite harness-run Verification Dispatch (Step 3d)
<!-- verification-tier: test-provable -->

## Status: backlog

## Story

As a codeharness developer,
I want the harness-run Step 3d verification dispatch to use four-tier routing instead of binary unit-testable/black-box,
So that each verification tier gets the appropriate verification strategy (build+test, local run, Docker stack, or escalation).

## Acceptance Criteria

- [ ] AC1: Given harness-run Step 3d-0, when the story file is read, then verification tier is derived by parsing all AC `<!-- verification: {tier} -->` tags and computing `maxTier()` (not from a story-level `<!-- verification-tier: -->` tag) <!-- verification: test-provable -->
- [ ] AC2: Given a story where all ACs are `test-provable`, when Step 3d dispatches, then verification runs via subagent with build + tests + code inspection only (no Docker, no running the app) <!-- verification: test-provable -->
- [ ] AC3: Given a story where the derived tier is `runtime-provable`, when Step 3d dispatches, then verification builds the artifact and runs it locally (e.g., `npm start`, `cargo run`), interacts with it, and checks behavior <!-- verification: test-provable -->
- [ ] AC4: Given a story where the derived tier is `environment-provable`, when Step 3d dispatches, then full Docker verification flow runs (existing black-box path: `codeharness stack start`, docker exec, observability checks) <!-- verification: test-provable -->
- [ ] AC5: Given a story where the derived tier is `escalate`, when Step 3d dispatches, then escalated ACs are marked `[ESCALATE]` and non-escalated ACs are verified at their individual tier levels <!-- verification: test-provable -->
- [ ] AC6: Given the old `<!-- verification-tier: unit-testable -->` story-level tag, when Step 3d reads the story, then it is ignored in favor of AC-level tier derivation (backward compat: old tagged stories still work because their AC tags are parsed) <!-- verification: test-provable -->
- [ ] AC7: Given Step 3d-0, when tier derivation finds ACs with old tags like `<!-- verification: cli-verifiable -->`, then `LEGACY_TIER_MAP` maps them to new tiers before computing `maxTier()` <!-- verification: test-provable -->

## Technical Notes

**File:** `commands/harness-run.md`

**Step 3d-0 rewrite (L261-L267):** Replace the binary tag check with AC-level tier derivation:

```
**Step 3d-0: Derive story verification tier from AC tags.**

Read `_bmad-output/implementation-artifacts/{story_key}.md`. Parse ALL acceptance criteria lines for
`<!-- verification: {tier} -->` tags. Map any legacy tag values:
- `cli-verifiable` -> `test-provable`
- `integration-required` -> `environment-provable`

Compute the story tier = highest tier among all ACs:
- `escalate` > `environment-provable` > `runtime-provable` > `test-provable`

If no AC has a verification tag, default to `test-provable`.
```

**Four-tier dispatch (replaces L268-L309):**

- **test-provable:** Keep the existing unit-testable subagent prompt (L272-L302) largely as-is. This is the build + test + code inspection path. No Docker.
- **runtime-provable:** New subagent prompt. Build the project, then run it (`getRunCommand()` from StackProvider if available, otherwise `npm start` / `cargo run` / `python -m app`). Interact with the running artifact (CLI flags, HTTP requests to localhost). Check output/behavior. Kill the process after verification. No Docker stack needed.
- **environment-provable:** Keep the existing black-box Docker verification flow (L309+). `codeharness stack start`, `docker exec`, observability queries.
- **escalate:** Mark escalated ACs with `[ESCALATE]`. For non-escalated ACs in the same story, verify them at their individual tier. If all non-escalated ACs pass, story is done with escalation notes.

**Note:** The `runtime-provable` path is new functionality. The StackProvider interface needs a `getRunCommand?(): string[]` optional method (noted in tech spec). If that method doesn't exist yet, the runtime-provable subagent prompt should try common run commands based on detected stack (npm start, cargo run, python -m app).

## Files to Change

- `commands/harness-run.md` — Rewrite Step 3d-0 (L261-L267) for AC-level tier derivation. Replace binary dispatch (L268-L309) with four-tier dispatch. Add runtime-provable subagent prompt. Keep environment-provable as existing Docker flow. Add escalate handling.
