# Story 12.3: Unverifiable AC Detection & Escalation

Status: verified

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer using codeharness,
I want stories with ACs that cannot be verified in the current session to be detected and escalated,
so that the verifier fails explicitly instead of producing fake evidence.

## Acceptance Criteria

1. **Given** a story with an AC like "sprint planning surfaces retro action items", **when** the verifier attempts to verify it, **then** it recognizes it cannot run sprint-planning in a subprocess **and** it marks the AC as `[ESCALATE] Requires integration test — cannot verify in current session` **and** the proof file shows the AC as unverified with escalation reason. (AC:1) <!-- verification: integration-required -->

2. **Given** the verifier produces a proof with escalated ACs, **when** harness-run Step 3d parses the proof, **then** it halts with `[WARN] Story {key} has {N} ACs requiring integration verification` **and** prints instructions: "Run these ACs manually or in a dedicated verification session" **and** does NOT mark the story as `done`. (AC:2) <!-- verification: cli-verifiable -->

3. **Given** create-story generates a story file, **when** ACs reference workflows, multi-step user journeys, or external system interactions, **then** those ACs are tagged with `<!-- verification: integration-required -->` in the story file. (AC:3) <!-- verification: cli-verifiable -->

4. **Given** all ACs in a story are `cli-verifiable`, **when** the verifier runs, **then** it proceeds normally without escalation. (AC:4) <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Add verification classification to `ParsedAC` type in `src/lib/verify-parser.ts` (AC: 1, 3, 4)
  - [x] 1.1: Add `verifiability: 'cli-verifiable' | 'integration-required'` field to `ParsedAC` interface
  - [x] 1.2: Add `INTEGRATION_KEYWORDS` constant with heuristic keywords: `sprint planning`, `workflow`, `run /command`, `user session`, `multi-step`, `external system`, `real infrastructure`, `integration test`, `manual verification`
  - [x] 1.3: Create `classifyVerifiability(description: string): 'cli-verifiable' | 'integration-required'` function that checks description against integration keywords
  - [x] 1.4: Update `parseStoryACs()` to read `<!-- verification: cli-verifiable|integration-required -->` HTML comment tags from AC lines and use them as the authoritative classification, falling back to heuristic `classifyVerifiability()` when no tag is present
  - [x] 1.5: Set `verifiability` on each `ParsedAC` during parsing

- [x] Task 2: Add `ESCALATE` status to proof quality validation in `src/lib/verify.ts` (AC: 1, 2)
  - [x] 2.1: Add `escalated: number` field to `ProofQuality` interface
  - [x] 2.2: Update `validateProofQuality()` to detect `[ESCALATE]` markers in AC sections — an AC section containing `[ESCALATE]` is counted as `escalated` (not pending, not verified)
  - [x] 2.3: Update `passed` logic: proof passes only when `pending === 0 && verified > 0` (escalated ACs are allowed — they are explicitly unverifiable, not missing evidence)
  - [x] 2.4: Add `escalated` count to `VerifyResult` interface and propagate through the verify pipeline

- [x] Task 3: Update verifier subagent prompt in `commands/harness-run.md` (AC: 1)
  - [x] 3.1: Add heuristic rule to verifier prompt: "If an AC mentions 'sprint planning', 'workflow', 'run /command', 'user session', or references multi-system interaction, it is integration-required"
  - [x] 3.2: Add instruction: "For integration-required ACs, write `[ESCALATE] Requires integration test — cannot verify in current session` in the proof section instead of attempting fake evidence"
  - [x] 3.3: Add instruction: "Use `showboat exec bash \"echo '[ESCALATE] AC {N}: {reason}'\"` to formally record the escalation in the proof document"

- [x] Task 4: Update harness-run Step 3d to handle escalated ACs in `commands/harness-run.md` (AC: 2)
  - [x] 4.1: After parsing proof quality, check `escalated > 0` separately from `pending > 0`
  - [x] 4.2: If `escalated > 0`: print `[WARN] Story {story_key} has {N} ACs requiring integration verification`
  - [x] 4.3: Print instructions: "Run these ACs manually or in a dedicated verification session"
  - [x] 4.4: Do NOT mark the story as `done` — story stays at `verified` status
  - [x] 4.5: Distinguish handling: `pending > 0` means verifier failed (re-spawn), `escalated > 0` means verifier correctly identified unverifiable ACs (halt with instructions, do not re-spawn)

- [x] Task 5: Add `<!-- verification: ... -->` tag support to create-story workflow (AC: 3)
  - [x] 5.1: Update the story template generation in `src/templates/bmad-patches.ts` (or the create-story command) to include guidance about adding `<!-- verification: cli-verifiable|integration-required -->` tags to ACs
  - [x] 5.2: The create-story agent prompt (in harness-run Step 3a) should instruct: "For each AC, append `<!-- verification: cli-verifiable -->` or `<!-- verification: integration-required -->` based on whether the AC can be verified by running CLI commands in a subprocess"

- [x] Task 6: Unit tests for verifiability classification (AC: 1, 3, 4)
  - [x] 6.1: Test `classifyVerifiability()` returns `integration-required` for descriptions mentioning "sprint planning", "workflow", "run /command", "user session"
  - [x] 6.2: Test `classifyVerifiability()` returns `cli-verifiable` for descriptions mentioning "CLI output", "file exists", "command returns", "JSON contains"
  - [x] 6.3: Test `parseStoryACs()` reads `<!-- verification: integration-required -->` tag from AC line and sets `verifiability` accordingly
  - [x] 6.4: Test `parseStoryACs()` falls back to heuristic classification when no tag is present
  - [x] 6.5: Test `validateProofQuality()` counts `[ESCALATE]` sections as `escalated` (not pending)
  - [x] 6.6: Test `validateProofQuality()` with mixed verified/escalated ACs returns `passed: true` when no pending ACs exist
  - [x] 6.7: Test `validateProofQuality()` with pending + escalated ACs returns `passed: false`
  - [x] 6.8: Update existing `verify-parser.test.ts` tests to include `verifiability` field in expected output

## Dev Notes

### Architecture Constraints

- **CLI orchestrates all verification** (Architecture Decision 8). The verifier agent produces proof; the CLI validates it.
- **Three-layer verification pipeline** (Architecture §Verification Pipeline): verifier agent, CLI verify, harness-run Step 3d. Each layer independently validates — no layer trusts another.
- **All templates are TypeScript string literals** (Architecture Decision 6).

### Existing Code to Modify

- `ParsedAC` interface in `src/lib/verify-parser.ts:11` — add `verifiability` field
- `classifyAC()` in `src/lib/verify-parser.ts:53` — use as pattern for new `classifyVerifiability()` function
- `parseStoryACs()` in `src/lib/verify-parser.ts:78` — update to parse verification tags and set verifiability
- `ProofQuality` interface in `src/lib/verify.ts:23` — add `escalated` field
- `validateProofQuality()` in `src/lib/verify.ts:173` — add `[ESCALATE]` detection logic
- `VerifyResult` interface in `src/lib/verify.ts:30` — add `escalatedCount` field
- `commands/harness-run.md:122-161` — update verifier prompt with escalation instructions
- `commands/harness-run.md:163-181` — update post-verification handling for escalated ACs

### Key Design Decisions

- **Heuristic + tag approach:** ACs can be pre-tagged with `<!-- verification: ... -->` in the story file (authoritative), OR classified at runtime by keyword heuristic (fallback). Tags override heuristics.
- **ESCALATE is distinct from PENDING:** PENDING means the verifier failed to produce evidence (retry). ESCALATE means the verifier correctly determined it cannot verify in the current session (halt with instructions).
- **Escalated proofs can still pass:** A proof with 3 verified + 1 escalated ACs is considered "passed" — the escalated ACs are explicitly acknowledged, not silently skipped. However, the story is NOT marked `done` until escalated ACs are resolved.

### Anti-Patterns to Avoid

- Do NOT let the verifier fake evidence for integration-required ACs — that is the exact problem this story solves.
- Do NOT treat ESCALATE the same as PENDING — they have different handling (re-spawn vs halt).
- Do NOT remove the existing `type` classification (`ui`, `api`, `db`, `general`) — `verifiability` is a separate dimension.
- Do NOT make the verifier skip escalated ACs silently — it must explicitly record the escalation in the proof document.

### References

- [Source: _bmad-output/planning-artifacts/epics.md, Epic 12, Story 12.3]
- [Source: _bmad-output/planning-artifacts/architecture.md, Verification Pipeline section]
- [Source: src/lib/verify-parser.ts (ParsedAC, classifyAC, parseStoryACs)]
- [Source: src/lib/verify.ts (ProofQuality, validateProofQuality, VerifyResult)]
- [Source: commands/harness-run.md (verifier prompt, Step 3d post-verification)]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/12-3-unverifiable-ac-detection-escalation.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/12-3-unverifiable-ac-detection-escalation.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
