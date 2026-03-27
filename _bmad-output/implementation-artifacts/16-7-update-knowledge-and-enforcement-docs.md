# Story 16-7: Update Knowledge and Enforcement Docs for Verification Tiers
<!-- verification-tier: test-provable -->

## Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a codeharness developer,
I want the knowledge and enforcement docs to use the four-tier verification vocabulary consistently,
So that agents reading these docs get correct guidance regardless of which patch or knowledge file they load.

## Acceptance Criteria

- [ ] AC1: Given `knowledge/verification-patterns.md`, when inspected, then it contains a "Verification Tier Guide" section that lists all four tiers (`test-provable`, `runtime-provable`, `environment-provable`, `escalate`) with criteria and examples for each <!-- verification: test-provable -->
- [ ] AC2: Given `knowledge/verification-patterns.md`, when inspected, then it does NOT contain the legacy terms `cli-verifiable`, `integration-required`, `unit-testable`, or `black-box` as verification tier names <!-- verification: test-provable -->
- [ ] AC3: Given `patches/dev/enforcement.md`, when inspected, then the "Black-Box Thinking" section is renamed or rewritten to use tier-aware language (e.g., referencing `test-provable` vs `runtime-provable` vs `environment-provable` verification approaches) <!-- verification: test-provable -->
- [ ] AC4: Given `patches/dev/enforcement.md`, when inspected, then it does NOT contain `black-box` as a verification tier or strategy name <!-- verification: test-provable -->
- [ ] AC5: Given `patches/review/enforcement.md`, when inspected, then all references to verification proof requirements use the four-tier vocabulary, not legacy terms <!-- verification: test-provable -->
- [ ] AC6: Given `patches/review/enforcement.md`, when inspected, then proof quality checks reference tier-appropriate evidence standards (e.g., `test-provable` stories do NOT require `docker exec` evidence; only `environment-provable` stories require Docker evidence) <!-- verification: test-provable -->
- [ ] AC7: Given `patches/verify/story-verification.md`, when inspected, then the "Verification Tags" section uses the four new tier names (`test-provable`, `runtime-provable`, `environment-provable`, `escalate`) instead of `cli-verifiable` and `integration-required` <!-- verification: test-provable -->
- [ ] AC8: Given `patches/verify/story-verification.md`, when inspected, then the proof standard section explains tier-dependent evidence rules: `test-provable` = build+test+grep, `runtime-provable` = run binary and check output, `environment-provable` = docker exec, `escalate` = human judgment <!-- verification: test-provable -->
- [ ] AC9: Given all four files (`knowledge/verification-patterns.md`, `patches/dev/enforcement.md`, `patches/review/enforcement.md`, `patches/verify/story-verification.md`), when searched for the string `cli-verifiable`, then zero matches are found <!-- verification: test-provable -->
- [ ] AC10: Given all four files, when searched for the string `integration-required`, then zero matches are found <!-- verification: test-provable -->
- [ ] AC11: Given all four files, when searched for the string `unit-testable` as a tier/tag name, then zero matches are found <!-- verification: test-provable -->
- [ ] AC12: Given all changes, when `npm test` runs, then all tests pass with 0 regressions <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Rewrite `knowledge/verification-patterns.md` with tier guide (AC: 1, 2)
  - [x] 1.1: Add a "Verification Tier Guide" section at the top that lists all four tiers with decision criteria and examples
  - [x] 1.2: Update all existing verification pattern sections to reference tiers where appropriate (e.g., "UI Verification" is typically `runtime-provable` or `environment-provable`, "API Verification" is `runtime-provable` or `environment-provable`, "Log/Trace Verification" is `environment-provable`)
  - [x] 1.3: Remove or replace any references to legacy tier names (`cli-verifiable`, `integration-required`, `unit-testable`, `black-box`)
- [x] Task 2: Update `patches/dev/enforcement.md` (AC: 3, 4)
  - [x] 2.1: Rename "Black-Box Thinking" section to "Verification Tier Awareness" or similar
  - [x] 2.2: Rewrite the section content to explain tier-appropriate development: `test-provable` stories need testable code, `runtime-provable` stories need exercisable CLI/API, `environment-provable` stories need Docker-compatible runtime
  - [x] 2.3: Remove all references to `black-box` as a verification strategy name
- [x] Task 3: Update `patches/review/enforcement.md` (AC: 5, 6)
  - [x] 3.1: Update proof quality checks to be tier-aware: `test-provable` proofs need build+test evidence (not `docker exec`), `runtime-provable` proofs need process execution evidence, `environment-provable` proofs need `docker exec` evidence
  - [x] 3.2: Replace any legacy tier references with new four-tier vocabulary
  - [x] 3.3: Update the "black-box enforcement" language to "tier-appropriate evidence enforcement"
- [x] Task 4: Update `patches/verify/story-verification.md` (AC: 7, 8)
  - [x] 4.1: Replace the "Verification Tags" section: change `cli-verifiable` and `integration-required` to the four new tiers with decision criteria
  - [x] 4.2: Update the "Proof Standard" section to explain tier-dependent evidence rules
  - [x] 4.3: Keep the observability evidence section but clarify it applies primarily to `environment-provable` stories
- [x] Task 5: Regression sweep across all four files (AC: 9, 10, 11)
  - [x] 5.1: Search all four files for legacy terms and confirm zero matches
- [x] Task 6: Run full test suite (AC: 12)
  - [x] 6.1: Run `npm test` and confirm zero regressions

## Dev Notes

This story modifies four documentation/enforcement files. No TypeScript code changes. No new tests expected unless the existing test suite has tests that grep these files for specific strings.

### Key Constraints

- **Four files to edit:** `knowledge/verification-patterns.md`, `patches/dev/enforcement.md`, `patches/review/enforcement.md`, `patches/verify/story-verification.md`. All are markdown prompt/patch files, not executable code.
- **No code changes:** This is purely a documentation/enforcement update. The TypeScript tier system was completed in stories 16-1 through 16-5.
- **Preserve non-tier content:** Each file has content unrelated to verification tiers (e.g., observability checks, documentation hygiene, Dockerfile maintenance in `enforcement.md`). Do NOT remove or alter those sections.
- **Tier-dependent evidence rules are the key change:** The old system had binary `cli-verifiable` vs `integration-required`. The new system has four tiers, each with different evidence expectations:
  - `test-provable` → build + run tests + grep/read code. No running app. No Docker.
  - `runtime-provable` → build + run binary/server + interact + check output. No Docker stack.
  - `environment-provable` → full Docker verification with `docker exec`, observability queries.
  - `escalate` → human judgment, mark as escalated.
- **`patches/review/enforcement.md` currently mandates `docker exec` for ALL proofs.** This must change — only `environment-provable` stories require Docker evidence. `test-provable` proofs should accept build+test output. `runtime-provable` proofs should accept local process execution.
- **`patches/verify/story-verification.md` uses the old two-tier tag system.** Lines 25-28 reference `cli-verifiable` and `integration-required`. Replace with the four-tier system.

### Context from Previous Stories

- Story 16-1: Defined `VerificationTier` type with four tiers in `src/modules/verify/types.ts`
- Story 16-2: Rewrote parser to use `classifyTier()` with keyword matching
- Story 16-3: Updated proof validation to recognize all four tier names
- Story 16-4: Updated validation ACs and runner for tier dispatch
- Story 16-5: Rewrote harness-run Step 3d (verification dispatch) AND Step 3a (create-story prompt)
- Story 16-6: Updated create-story workflow `instructions.xml` and `checklist.md` with tier criteria

### What This Story Completes

After this story, all prompt/patch/knowledge files will speak the same four-tier language as the TypeScript code. The remaining story (16-8) updates the test suite.

### Project Structure Notes

- `knowledge/` — Agent knowledge files loaded as context during sessions
- `patches/dev/` — Enforcement rules applied during development
- `patches/review/` — Enforcement rules applied during code review
- `patches/verify/` — Enforcement rules applied during story verification
- All four files are markdown. Changes are text-only — no build step.

### References

- [Source: _bmad-output/implementation-artifacts/tech-spec-verification-tier-rework.md#Task 7] — "Update knowledge and enforcement docs"
- [Source: knowledge/verification-patterns.md] — Current content uses generic verification patterns, no tier vocabulary
- [Source: patches/dev/enforcement.md#Black-Box Thinking] — Section to rename/rewrite
- [Source: patches/review/enforcement.md#Proof Quality Checks] — Currently mandates `docker exec` for all proofs
- [Source: patches/verify/story-verification.md#Verification Tags] — Uses `cli-verifiable` and `integration-required`
- [Source: src/modules/verify/types.ts#L14-L38] — `VerificationTier`, `TIER_HIERARCHY`, `LEGACY_TIER_MAP`

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/16-7-update-knowledge-and-enforcement-docs-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/16-7-update-knowledge-and-enforcement-docs.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- Rewrote `knowledge/verification-patterns.md` with a new "Verification Tier Guide" section listing all four tiers (`test-provable`, `runtime-provable`, `environment-provable`, `escalate`) with decision criteria and examples. Updated all verification pattern sections (UI, API, DB, Log/Trace) with tier annotations.
- Renamed "Black-Box Thinking" to "Verification Tier Awareness" in `patches/dev/enforcement.md`. Rewrote section to explain tier-appropriate development practices for all four tiers.
- Rewrote `patches/review/enforcement.md` proof quality checks to be tier-aware. `test-provable` and `runtime-provable` stories no longer require `docker exec` evidence. Only `environment-provable` stories require Docker evidence. Added `escalate` tier handling.
- Rewrote `patches/verify/story-verification.md` Verification Tags section with all four tiers replacing the old `cli-verifiable`/`integration-required` two-tier system. Added tier-dependent evidence rules to the Proof Standard section. Clarified observability evidence applies primarily to `environment-provable` stories.
- Confirmed zero matches for `cli-verifiable`, `integration-required`, `unit-testable`, and `black-box` across all four files.
- All 152 Vitest test files pass (4014 tests), zero regressions.
- Added `src/modules/verify/__tests__/verification-tier-docs.test.ts` with tests for all 12 ACs plus non-tier content preservation checks.

### Change Log

- 2026-03-27: Implemented story 16-7 — updated all four knowledge/enforcement/verification docs to use four-tier verification vocabulary consistently.

### File List

- knowledge/verification-patterns.md (modified)
- patches/dev/enforcement.md (modified)
- patches/review/enforcement.md (modified)
- patches/verify/story-verification.md (modified)
- src/modules/verify/__tests__/verification-tier-docs.test.ts (new)
- _bmad-output/implementation-artifacts/16-7-update-knowledge-and-enforcement-docs.md (modified)
