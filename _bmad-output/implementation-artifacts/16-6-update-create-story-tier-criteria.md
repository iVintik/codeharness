# Story 16-6: Update create-story Workflow with Tier Criteria
<!-- verification-tier: test-provable -->

## Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a codeharness developer,
I want the create-story BMAD workflow to embed the four-tier verification decision tree directly in its instructions and quality checklist,
So that ACs get correct `<!-- verification: {tier} -->` tags whether create-story is invoked from harness-run or directly via `/create-story`.

## Acceptance Criteria

- [x] AC1: Given `_bmad/bmm/workflows/4-implementation/create-story/instructions.xml` Step 5 (AC quality gate), when inspected, then it contains a verification tier tagging instruction with the four tiers: `test-provable`, `runtime-provable`, `environment-provable`, `escalate` <!-- verification: test-provable -->
- [x] AC2: Given the tier tagging instruction in `instructions.xml`, when inspected, then it includes a decision tree with criteria for each tier and at least 4 concrete AC examples (one per tier) <!-- verification: test-provable -->
- [x] AC3: Given the tier tagging instruction in `instructions.xml`, when inspected, then the tag format reads `<!-- verification: {tier} -->` with `{tier}` being one of the four new tier names <!-- verification: test-provable -->
- [x] AC4: Given `instructions.xml`, when inspected, then it does NOT reference `cli-verifiable` or `integration-required` as valid tier names for new stories <!-- verification: test-provable -->
- [x] AC5: Given `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`, when inspected, then the Spec Coverage DISASTERS section (3.6) includes a check for missing or incorrect `<!-- verification: {tier} -->` tags on ACs <!-- verification: test-provable -->
- [x] AC6: Given `instructions.xml` Step 5 tier decision tree, when inspected, then `test-provable` criteria include: code structure, types, file existence, test passing, documentation, config changes, refactoring <!-- verification: test-provable -->
- [x] AC7: Given `instructions.xml` Step 5 tier decision tree, when inspected, then `runtime-provable` criteria include: running the built application, CLI output, API endpoint behavior, exit codes <!-- verification: test-provable -->
- [x] AC8: Given `instructions.xml` Step 5 tier decision tree, when inspected, then `environment-provable` criteria include: Docker, databases, observability stack, multiple services, distributed systems <!-- verification: test-provable -->
- [x] AC9: Given `instructions.xml` Step 5 tier decision tree, when inspected, then `escalate` criteria include: physical hardware, human visual judgment, paid external services, GPU <!-- verification: test-provable -->
- [x] AC10: Given `commands/harness-run.md` Step 3a, when inspected, then it already contains the four-tier decision tree (completed by story 16-5 — this AC is a regression check only) <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Update `instructions.xml` Step 5 AC quality gate with tier tagging (AC: 1, 2, 3, 4, 6, 7, 8, 9)
  - [x] 1.1: In Step 5 (`<step n="5">`), after the existing AC quality check `<action>` block (lines 288-298), add a new `<action>` block titled "VERIFICATION TIER TAGGING" that contains the four-tier decision tree
  - [x] 1.2: The decision tree must list criteria for each tier: `test-provable` (code structure, types, file existence, tests, docs, config, refactoring), `runtime-provable` (running app, CLI output, API endpoints, exit codes), `environment-provable` (Docker, databases, observability, multi-service), `escalate` (physical hardware, human visual judgment, paid services, GPU)
  - [x] 1.3: Include 4 concrete examples, one per tier, in Given/When/Then format showing which tier to assign
  - [x] 1.4: Specify the tag format: `<!-- verification: {tier} -->`
  - [x] 1.5: Add instruction: "Default to `test-provable` when unsure"
  - [x] 1.6: Ensure NO references to old `cli-verifiable` or `integration-required` tier names exist anywhere in `instructions.xml`
- [x] Task 2: Update `checklist.md` Spec Coverage DISASTERS section (AC: 5)
  - [x] 2.1: In Section 3.6 (Spec Coverage DISASTERS), add a new bullet for missing or incorrect verification tier tags: "**Missing verification tier tags:** Every AC must have a `<!-- verification: {tier} -->` tag appended. Check that each AC has one, and that the tier assignment follows the decision tree criteria."
- [x] Task 3: Verify harness-run Step 3a regression (AC: 10)
  - [x] 3.1: Read `commands/harness-run.md` Step 3a and confirm the four-tier decision tree is present (done by story 16-5). No changes needed — this is a read-only check.

## Dev Notes

This story modifies two BMAD workflow files and performs one regression check. No TypeScript code changes, no test changes, no build changes.

### Key Constraints

- **Two files to edit:** `_bmad/bmm/workflows/4-implementation/create-story/instructions.xml` and `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`. Both are prompt/workflow files, not executable code.
- **harness-run Step 3a already done:** Story 16-5 updated `commands/harness-run.md` Step 3a with the four-tier decision tree and examples. AC10 is a regression check only — do NOT re-edit harness-run.md.
- **The create-story workflow has NO tier tagging today.** The `instructions.xml` Step 5 has an AC quality gate (lines 288-298) that checks AC quality but says nothing about appending verification tier tags. When create-story is invoked directly (not via harness-run), ACs get no tier tags at all. This story fixes that gap.
- **NFR: 300-line file limit does not apply** to workflow XML and checklist markdown files.

### Context from Previous Stories

- Story 16-1 defined `VerificationTier` type with four tiers in `src/modules/verify/types.ts`
- Story 16-2 rewrote parser to use `classifyTier()` with keyword matching
- Story 16-3 updated proof validation to recognize all four tier names
- Story 16-4 updated validation ACs and runner for tier dispatch
- Story 16-5 rewrote harness-run Step 3d (verification dispatch) AND Step 3a (create-story prompt in harness-run)

### The Gap This Story Fills

When `/create-story` is invoked directly (not through harness-run), the agent follows `instructions.xml` — which currently has no mention of verification tiers. The harness-run Step 3a prompt passes tier criteria through the Agent tool prompt, but that only works when create-story is called as a subagent of harness-run. This story embeds the tier criteria into the create-story workflow itself so it works both ways.

### Project Structure Notes

- `_bmad/bmm/workflows/4-implementation/create-story/instructions.xml` — Main workflow instructions (XML format)
- `_bmad/bmm/workflows/4-implementation/create-story/checklist.md` — Quality validation checklist
- `_bmad/bmm/workflows/4-implementation/create-story/template.md` — Story template (no changes needed)
- `_bmad/bmm/workflows/4-implementation/create-story/workflow.yaml` — Workflow config (no changes needed)

### References

- [Source: _bmad-output/implementation-artifacts/tech-spec-verification-tier-rework.md#Task 6] — "Update create-story prompt with tier criteria"
- [Source: _bmad/bmm/workflows/4-implementation/create-story/instructions.xml#Step 5] — Current AC quality gate (lines 286-298)
- [Source: _bmad/bmm/workflows/4-implementation/create-story/checklist.md#Section 3.6] — Spec Coverage DISASTERS section
- [Source: commands/harness-run.md#L158-L164] — Step 3a four-tier decision tree (already completed by 16-5)
- [Source: src/modules/verify/types.ts#L14-L38] — `VerificationTier`, `TIER_HIERARCHY`, `LEGACY_TIER_MAP`

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/16-6-update-create-story-tier-criteria-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/16-6-update-create-story-tier-criteria.md

## Testing Requirements

- [x] Unit tests written for all new/changed code
- [x] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- Task 1: Added VERIFICATION TIER TAGGING action block to instructions.xml Step 5, after the AC quality gate. Contains four-tier decision tree with criteria, 4 concrete examples (one per tier), tag format spec, default-to-test-provable instruction, and legacy name warning.
- Task 2: Added "Missing verification tier tags" bullet to checklist.md Section 3.6 (Spec Coverage DISASTERS).
- Task 3: Confirmed harness-run.md Step 3a already contains the four-tier decision tree (regression check passed).
- Tests: Created 32 content-verification tests in create-story-tier-criteria.test.ts covering all 10 ACs. All pass. Full suite: 151 files, 3958 tests, zero regressions.

### File List

- _bmad/bmm/workflows/4-implementation/create-story/instructions.xml (modified)
- _bmad/bmm/workflows/4-implementation/create-story/checklist.md (modified)
- src/modules/verify/__tests__/create-story-tier-criteria.test.ts (new)
