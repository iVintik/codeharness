# Story 16.5: Rewrite harness-run Verification Dispatch
<!-- verification-tier: test-provable -->

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a codeharness developer,
I want the harness-run Step 3d verification dispatch to use four-tier routing instead of binary unit-testable/black-box,
So that each verification tier gets the appropriate verification strategy (build+test, local run, Docker stack, or escalation).

## Acceptance Criteria

- [ ] AC1: Given harness-run Step 3d-0, when a story file is read, then the verification tier is derived by parsing ALL AC-level `<!-- verification: {tier} -->` tags and computing `maxTier()` across them — the story-level `<!-- verification-tier: -->` tag is NOT used for dispatch <!-- verification: test-provable -->
- [ ] AC2: Given a story where all ACs are tagged `test-provable`, when Step 3d dispatches, then verification runs via a single subagent that builds, runs tests, and inspects code — no Docker, no running the app <!-- verification: test-provable -->
- [ ] AC3: Given a story where the derived tier is `runtime-provable`, when Step 3d dispatches, then a subagent builds the artifact, runs it locally (e.g., `npm start`, `cargo run`), interacts with it, and checks behavior — no Docker stack needed <!-- verification: test-provable -->
- [ ] AC4: Given a story where the derived tier is `environment-provable`, when Step 3d dispatches, then the existing full Docker verification flow runs (`codeharness stack start`, docker exec, observability checks) <!-- verification: test-provable -->
- [ ] AC5: Given a story where the derived tier is `escalate`, when Step 3d dispatches, then escalated ACs are marked `[ESCALATE]` and non-escalated ACs are verified at their individual tier levels <!-- verification: test-provable -->
- [ ] AC6: Given a story file with the old `<!-- verification-tier: unit-testable -->` story-level tag, when Step 3d reads it, then the story-level tag is ignored and AC-level tier derivation is used instead (backward compat: old stories still work because their AC tags are parsed) <!-- verification: test-provable -->
- [ ] AC7: Given Step 3d-0 encounters ACs with legacy tags like `<!-- verification: cli-verifiable -->` or `<!-- verification: integration-required -->`, when tier derivation runs, then `LEGACY_TIER_MAP` maps them to new tiers before computing `maxTier()` <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Rewrite Step 3d-0 in `commands/harness-run.md` (AC: 1, 6, 7)
  - [x] 1.1: Replace the binary `<!-- verification-tier: unit-testable -->` tag check (L261-L267) with AC-level tier derivation instructions
  - [x] 1.2: Add instructions: parse all AC lines for `<!-- verification: {tier} -->` tags, map legacy values via `LEGACY_TIER_MAP`, compute `maxTier()`. Default to `test-provable` if no tags found
  - [x] 1.3: Add note: the story-level `<!-- verification-tier: -->` tag is ignored; AC-level tags are the source of truth
- [x] Task 2: Rewrite the test-provable dispatch section (AC: 2)
  - [x] 2.1: Keep the existing unit-testable subagent prompt (L272-L302) largely as-is — this IS the test-provable path. Update the heading/label from "Unit-testable verification" to "test-provable verification"
  - [x] 2.2: Update the subagent prompt to reference "test-provable tier" instead of "unit-testable tier"
- [x] Task 3: Add runtime-provable dispatch section (AC: 3)
  - [x] 3.1: Add a new subagent prompt block for `runtime-provable`. Build the project, then run it. Try `getRunCommand()` from StackProvider if available; otherwise fall back to common commands (`npm start`, `cargo run`, `python -m app`)
  - [x] 3.2: Subagent instructions: start the app, interact (CLI flags, HTTP to localhost), check output/behavior, kill process, generate proof document
  - [x] 3.3: No Docker stack. No `codeharness stack start`. The app runs locally.
- [x] Task 4: Keep environment-provable dispatch section (AC: 4)
  - [x] 4.1: Relabel the existing "Black-box verification (default, no tag)" section as "environment-provable verification"
  - [x] 4.2: No behavioral changes — the Docker flow (3d-i through 3d-viii) stays as-is
- [x] Task 5: Add escalate dispatch section (AC: 5)
  - [x] 5.1: Add a new section for `escalate` tier. For each AC in the story, check individual AC tier. Mark `escalate`-tier ACs as `[ESCALATE]`. For non-escalated ACs, dispatch verification at their individual tier level
  - [x] 5.2: If all non-escalated ACs pass, story is done with escalation notes
- [x] Task 6: Update Step 3a create-story prompt reference (AC: 1)
  - [x] 6.1: In Step 3a (L152-L170), update the AC tagging instruction from `cli-verifiable`/`integration-required` to the four new tier names with decision criteria. (Note: this is Task 6 in the tech spec but is scoped to this story because the dispatch depends on correctly tagged ACs)

## Dev Notes

This story modifies a single file: `commands/harness-run.md`. It's a prompt-engineering rewrite — no TypeScript code changes, no test changes, no build changes.

### Key Constraints

- **Single file change:** Only `commands/harness-run.md` is modified. The TypeScript utilities (`maxTier()`, `LEGACY_TIER_MAP`, `classifyTier()`, `parseVerificationTag()`) were built in stories 16-1 through 16-4 and are already available in `src/modules/verify/`.
- **The test-provable path already exists** as the "Unit-testable verification" block (L268-L307). Rename and minor wording updates only — do not rewrite the subagent prompt from scratch.
- **The environment-provable path already exists** as the "Black-box verification" block (L309+). Relabel only — do not change the Docker workflow.
- **runtime-provable is genuinely new.** The subagent prompt must be written from scratch. It builds the artifact, runs it locally, interacts with it, checks behavior, then kills the process. No Docker.
- **StackProvider does NOT have `getRunCommand()` yet.** The tech spec notes this as an optional method to add later. For now, the runtime-provable subagent prompt should try common run commands based on detected stack: `npm start` (Node.js), `cargo run` (Rust), `python -m app` (Python).
- **Step 3a update is in scope.** The create-story prompt in Step 3a currently tells agents to tag ACs with `cli-verifiable`/`integration-required`. Update it to use the four new tier names with a clear decision tree and examples. This ensures new stories get correct tier tags that the new dispatch can route on.
- **NFR: 300-line file limit does not apply** to `commands/harness-run.md` — it's a command prompt file, not a TypeScript module.

### Backward Compatibility

- Stories with old `<!-- verification-tier: unit-testable -->` still work: the story-level tag is ignored, but their AC-level tags (`cli-verifiable`/`integration-required`) are parsed and mapped via `LEGACY_TIER_MAP`.
- Stories with old AC tags (`cli-verifiable`, `integration-required`) are mapped: `cli-verifiable` -> `test-provable`, `integration-required` -> `environment-provable`. See `src/modules/verify/types.ts` L33-38.
- If a story has NO AC-level verification tags at all, default tier is `test-provable` (safest default — build and test only).

### Current harness-run.md Structure (relevant sections)

- **L152-L170 (Step 3a):** Create-story subagent prompt. Currently instructs tagging with `cli-verifiable`/`integration-required`. Needs update to four tiers.
- **L257-L267 (Step 3d-0):** Binary check for `<!-- verification-tier: unit-testable -->`. Needs rewrite to AC-level tier derivation.
- **L268-L307 (Unit-testable verification):** Subagent prompt for build+test+code-inspection. Becomes `test-provable` path. Minor wording updates.
- **L309+ (Black-box verification):** Full Docker flow. Becomes `environment-provable` path. Relabel only.

### Files from previous stories that this story depends on

- `src/modules/verify/types.ts` — `VerificationTier`, `TIER_HIERARCHY`, `maxTier()`, `LEGACY_TIER_MAP` (story 16-1)
- `src/modules/verify/parser.ts` — `classifyTier()`, `parseVerificationTag()` with backward compat (story 16-2)
- `src/modules/verify/proof.ts` — recognizes all four tier names in `**Tier:**` parsing (story 16-3)
- `src/modules/verify/validation-acs.ts` — `getTestProvableACs()`, `getEnvironmentProvableACs()` (story 16-4)

### Project Structure Notes

- `commands/harness-run.md` is a Claude Code slash command file (prompt, not code)
- Changes are to prompt text, not executable TypeScript
- The harness-run command orchestrates the full sprint loop — Step 3d is the verification dispatch within it

### References

- [Source: _bmad-output/implementation-artifacts/tech-spec-verification-tier-rework.md#Task 5] — "Rewrite harness-run verification dispatch (Step 3d)"
- [Source: _bmad-output/implementation-artifacts/tech-spec-verification-tier-rework.md#Task 6] — "Update create-story prompt with tier criteria"
- [Source: src/modules/verify/types.ts#L14-L38] — `VerificationTier`, `TIER_HIERARCHY`, `maxTier()`, `LEGACY_TIER_MAP`
- [Source: commands/harness-run.md#L257-L309] — Current Step 3d binary dispatch (to be rewritten)
- [Source: commands/harness-run.md#L152-L170] — Current Step 3a create-story prompt (to be updated)

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/16-5-rewrite-harness-run-verification-dispatch-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/16-5-rewrite-harness-run-verification-dispatch.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- All 6 tasks completed: Step 3d-0 rewritten with AC-level tier derivation, test-provable relabeled, runtime-provable added from scratch, environment-provable relabeled, escalate dispatch added, Step 3a updated with four-tier decision tree.
- 34 unit tests written and passing in `src/modules/verify/__tests__/harness-run-dispatch.test.ts`
- Full test suite (3926 tests) passes. Build succeeds.

### File List

- `commands/harness-run.md` — Rewritten Step 3d-0, test-provable, runtime-provable, escalate, environment-provable sections; updated Step 3a tier tagging
- `src/modules/verify/__tests__/harness-run-dispatch.test.ts` — 34 unit tests covering all 7 ACs
